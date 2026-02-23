const fs = require('bare-fs')
const http = require('bare-http1')
const ffmpeg = require('bare-ffmpeg')
const { video } = require('bare-media')
const Buffer = require('bare-buffer')
const FramedStream = require('framed-stream')
const top = require('process-top')

const processTop = new top()
const ipc = new FramedStream(BareKit.IPC)

const HTTP_PORT = 8765
const PREFETCH_AHEAD = 2
const BUFFER_WINDOW = 5
const MIN_SEGMENTS = 5

let httpServer = null
let transcoder = null
let transcodeFinished = false
let transcoding = false
let playbackPosition = 0
let playerPaused = false

// HLS state
let initSegment = null
let segments = []
let segmentDurations = []
let pendingWaiters = new Map()

// MP4 box parser accumulator
let parseBuffer = Buffer.alloc(0)
let currentMoof = null

function cpu() {
  const cpuInfo = processTop.toString()
  ipc.write(Buffer.concat([Buffer.from('cpu'), Buffer.from(cpuInfo)]))
}

function sendError(error) {
  ipc.write(Buffer.concat([Buffer.from('err:'), Buffer.from(error)]))
}

function sendStatus(status) {
  ipc.write(Buffer.concat([Buffer.from('sts:'), Buffer.from(status)]))
}

function sendUrl(url) {
  ipc.write(Buffer.concat([Buffer.from('url:'), Buffer.from(url)]))
}

async function registerFormats() {
  const formatRegistry = await video.getFormatRegistry()

  formatRegistry.register('mp4', {
    video: {
      id: ffmpeg.constants.codecs.H264,
      format: ffmpeg.constants.pixelFormats.YUV420P,
      encoder: 'h264_videotoolbox'
    },
    audio: {
      id: ffmpeg.constants.codecs.AAC,
      format: ffmpeg.constants.sampleFormats.FLTP,
      sampleRate: 48000,
      encoder: 'aac'
    },
    muxer: {
      movflags: 'frag_keyframe+empty_moov+default_base_moof'
    }
  })
}

// --- MP4 Box Parser ---

function parseBoxes(data) {
  parseBuffer = Buffer.concat([parseBuffer, Buffer.from(data)])

  while (parseBuffer.length >= 8) {
    const size = parseBuffer.readUInt32BE(0)
    if (size < 8 || parseBuffer.length < size) break

    const type = parseBuffer.slice(4, 8).toString('ascii')
    const box = parseBuffer.slice(0, size)
    parseBuffer = parseBuffer.slice(size)

    handleBox(type, box)
  }
}

function handleBox(type, box) {
  if (type === 'ftyp' || type === 'moov') {
    if (!initSegment) {
      initSegment = box
    } else {
      initSegment = Buffer.concat([initSegment, box])
    }
    return
  }

  if (type === 'moof') {
    currentMoof = box
    return
  }

  if (type === 'mdat' && currentMoof) {
    const segment = Buffer.concat([currentMoof, box])
    currentMoof = null
    const index = segments.length
    segments.push(segment)
    segmentDurations.push(1.0)
    console.log('[transcode] segment', index, ':', segment.length, 'bytes')

    const waiters = pendingWaiters.get(index)
    if (waiters) {
      for (const resolve of waiters) resolve(segment)
      pendingWaiters.delete(index)
    }
    return
  }

  if (currentMoof) {
    currentMoof = Buffer.concat([currentMoof, box])
  }
}

// --- On-demand transcoding ---

async function transcodeNext() {
  if (!transcoder || transcodeFinished || transcoding) return false
  transcoding = true
  try {
    const { value, done } = await transcoder.next()
    if (done) {
      transcodeFinished = true
      console.log('[transcode] finished, total segments:', segments.length)
      ipc.write(
        Buffer.concat([Buffer.from('dur:'), Buffer.from('' + segments.length)])
      )
      sendStatus('done')
      for (const [, waiters] of pendingWaiters) {
        for (const resolve of waiters) resolve(null)
      }
      pendingWaiters.clear()
      return false
    }
    parseBoxes(value.buffer)
    return true
  } catch (err) {
    transcodeFinished = true
    sendError(err.message)
    return false
  } finally {
    transcoding = false
  }
}

async function transcodeUntilSegment(index) {
  if (index < segments.length) return segments[index]
  if (transcodeFinished) return null

  while (segments.length <= index && !transcodeFinished) {
    const produced = await transcodeNext()
    if (!produced && !transcodeFinished) {
      return new Promise((resolve) => {
        const waiters = pendingWaiters.get(index) || []
        waiters.push(resolve)
        pendingWaiters.set(index, waiters)
      })
    }
  }

  if (index < segments.length) return segments[index]
  return null
}

function prefetch(fromIndex) {
  const target = fromIndex + PREFETCH_AHEAD
  ;(async () => {
    while (segments.length <= target && !transcodeFinished) {
      await transcodeNext()
    }
  })()
}

// --- HLS Playlist ---

function generatePlaylist() {
  const playbackSegment = Math.floor(playbackPosition)
  const maxVisible = transcodeFinished
    ? segments.length
    : Math.min(segments.length, playbackSegment + BUFFER_WINDOW + 1)

  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    '#EXT-X-TARGETDURATION:2',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-MAP:URI="init.mp4"'
  ]

  for (let i = 0; i < maxVisible; i++) {
    const dur = segmentDurations[i] || 1.0
    lines.push('#EXTINF:' + dur.toFixed(6) + ',')
    lines.push('segment' + i + '.mp4')
  }

  if (transcodeFinished && maxVisible === segments.length) {
    lines.push('#EXT-X-ENDLIST')
  }

  return lines.join('\n') + '\n'
}

// --- HTTP Server ---

function startHTTPServer() {
  if (httpServer) return

  httpServer = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0]

    if (url === '/stream.m3u8') {
      const playlist = generatePlaylist()
      const playlistBuf = Buffer.from(playlist)
      console.log(
        '[http] playlist: pos=' +
          playbackPosition +
          's, visible=' +
          Math.min(
            segments.length,
            Math.floor(playbackPosition) + BUFFER_WINDOW + 1
          ) +
          '/' +
          segments.length,
        playerPaused ? '(paused)' : ''
      )
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store',
        'Content-Length': '' + playlistBuf.length
      })
      res.write(playlistBuf)
      res.end()
      return
    }

    if (url === '/init.mp4') {
      if (!initSegment) {
        res.writeHead(503)
        res.end('Not ready')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': '' + initSegment.length
      })
      res.write(initSegment)
      res.end()
      return
    }

    const segMatch = url.match(/^\/segment(\d+)\.mp4$/)
    if (segMatch) {
      const index = parseInt(segMatch[1], 10)
      const segment = await transcodeUntilSegment(index)

      if (!segment) {
        res.writeHead(404)
        res.end('Segment not available')
        return
      }

      console.log('[http] segment', index, ':', segment.length, 'bytes')
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': '' + segment.length
      })
      res.write(segment)
      res.end()

      prefetch(index)
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  httpServer.listen(HTTP_PORT)
}

// --- File open + initial transcode ---

async function openFile(path) {
  initSegment = null
  segments = []
  segmentDurations = []
  pendingWaiters.clear()
  parseBuffer = Buffer.alloc(0)
  currentMoof = null
  transcodeFinished = false
  transcoding = false
  playbackPosition = 0
  playerPaused = false

  transcoder = video(path).transcode({ format: 'mp4' })[Symbol.asyncIterator]()

  while (!initSegment || segments.length < MIN_SEGMENTS) {
    const produced = await transcodeNext()
    if (!produced) break
  }

  if (!initSegment) {
    sendError('Failed to produce init segment')
    return
  }

  console.log(
    '[transcode] ready: init',
    initSegment.length,
    'bytes,',
    segments.length,
    'segments'
  )
  sendStatus('streaming')
  sendUrl('http://localhost:' + HTTP_PORT + '/stream.m3u8?t=' + Date.now())
}

// --- IPC ---

ipc.on('data', async (data) => {
  try {
    const message = data.toString()
    const parts = message.split(':')
    const command = parts[0]

    if (command === 'pos') {
      playbackPosition = parseInt(parts[1], 10) || 0
      return
    }

    if (command === 'pause') {
      playerPaused = true
      return
    }

    if (command === 'play') {
      playerPaused = false
      return
    }

    if (command === 'open') {
      const filePath = parts.slice(1).join(':')
      if (!fs.existsSync(filePath)) {
        sendError('File not found: ' + filePath)
        return
      }
      openFile(filePath)
    }
  } catch (error) {
    sendError(error.message)
  }
})

setInterval(() => {
  cpu()
}, 1000)

Bare.on('exit', () => {
  if (httpServer) httpServer.close()
})

async function init() {
  await registerFormats()
  startHTTPServer()
  sendStatus('idle')
}

init()
