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
let httpServer = null
let transcoder = null
let transcodeFinished = false
let transcoding = false
let lastRequestedSegment = -1 // highest segment index AVPlayer has requested
let playbackPosition = 0 // current playback position in seconds (from frontend)

// HLS state
let initSegment = null // Buffer: ftyp + moov
let segments = [] // Array of Buffers (each is moof + mdat)
let segmentDurations = [] // Duration per segment in seconds
let pendingWaiters = new Map() // segmentIndex -> [resolve, ...]

// MP4 box parser accumulator
let parseBuffer = Buffer.alloc(0)
let currentMoof = null // pending moof box

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
    console.log('[hls] init box:', type, box.length, 'bytes')
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
    // Estimate ~1s per segment (gopSize=30 @ 30fps)
    segmentDurations.push(1.0)
    console.log('[hls] segment', index, ':', segment.length, 'bytes')

    // Resolve any waiters for this segment
    const waiters = pendingWaiters.get(index)
    if (waiters) {
      for (const resolve of waiters) resolve(segment)
      pendingWaiters.delete(index)
    }
    return
  }

  // Other boxes (styp, sidx, etc.) — append to current segment if mid-fragment
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
      console.log('[hls] transcode finished, segments:', segments.length)
      sendStatus('done')
      // Resolve all pending waiters with null (segment won't exist)
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
  // Already have it
  if (index < segments.length) return segments[index]

  // Transcode finished and segment doesn't exist
  if (transcodeFinished) return null

  // Transcode until we have this segment
  while (segments.length <= index && !transcodeFinished) {
    const produced = await transcodeNext()
    if (!produced && !transcodeFinished) {
      // transcoding is busy, wait for the segment
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
  // Fire and forget — transcode ahead
  ;(async () => {
    while (segments.length <= target && !transcodeFinished) {
      await transcodeNext()
    }
  })()
}

// --- HLS Playlist ---

function generatePlaylist() {
  // Only advertise segments near the current playback position
  // This prevents AVPlayer from buffering the entire file
  const BUFFER_WINDOW = 5 // segments ahead of playback to show
  const playbackSegment = Math.floor(playbackPosition) // ~1s per segment
  const maxVisible = transcodeFinished
    ? segments.length
    : Math.min(segments.length, playbackSegment + BUFFER_WINDOW + 1)

  const maxDuration = 2
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    '#EXT-X-TARGETDURATION:' + maxDuration,
    '#EXT-X-PLAYLIST-TYPE:EVENT',
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
    console.log('[http]', req.method, url)

    if (url === '/stream.m3u8') {
      const playlist = generatePlaylist()
      console.log('[hls] playlist:', segments.length, 'segments', transcodeFinished ? '(final)' : '(live)')
      const playlistBuf = Buffer.from(playlist)
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
      console.log('[http] serving init.mp4:', initSegment.length, 'bytes')
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': '' + initSegment.length
      })
      res.write(initSegment)
      res.end()
      return
    }

    if (url === '/debug.mp4') {
      // Serve init + all available segments as a single fMP4
      if (!initSegment) {
        res.writeHead(503)
        res.end('Not ready')
        return
      }
      const parts = [initSegment, ...segments]
      let totalLen = 0
      for (const p of parts) totalLen += p.length
      console.log('[http] serving debug.mp4:', totalLen, 'bytes,', segments.length, 'segments')
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': '' + totalLen
      })
      for (const p of parts) res.write(p)
      res.end()
      return
    }

    const segMatch = url.match(/^\/segment(\d+)\.mp4$/)
    if (segMatch) {
      const index = parseInt(segMatch[1], 10)
      if (index > lastRequestedSegment) lastRequestedSegment = index

      // Trigger on-demand transcoding
      const segment = await transcodeUntilSegment(index)

      if (!segment) {
        res.writeHead(404)
        res.end('Segment not available')
        return
      }

      console.log('[http] serving segment' + index + '.mp4:', segment.length, 'bytes')
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': '' + segment.length
      })
      res.write(segment)
      res.end()

      // Prefetch ahead
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
  // Reset state
  initSegment = null
  segments = []
  segmentDurations = []
  pendingWaiters.clear()
  parseBuffer = Buffer.alloc(0)
  currentMoof = null
  transcodeFinished = false
  transcoding = false
  lastRequestedSegment = -1
  playbackPosition = 0

  transcoder = video(path).transcode({ format: 'mp4' })[Symbol.asyncIterator]()

  // Transcode until we have init segment + enough segments for AVPlayer to start
  const MIN_SEGMENTS = 5
  while (!initSegment || segments.length < MIN_SEGMENTS) {
    const produced = await transcodeNext()
    if (!produced) break
  }

  if (!initSegment) {
    sendError('Failed to produce init segment')
    return
  }

  // Set lastRequestedSegment so the first playlist shows all initial segments
  lastRequestedSegment = segments.length - 1
  console.log('[hls] ready: init', initSegment.length, 'bytes,', segments.length, 'segments')

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
