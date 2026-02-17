const fs = require('bare-fs')
const http = require('bare-http1')
const ffmpeg = require('bare-ffmpeg')
const { video } = require('bare-media')
const Buffer = require('bare-buffer')
const FramedStream = require('framed-stream')
const top = require('process-top')

const debug = Bare.argv[0] === 'true'
const processTop = new top()
const ipc = new FramedStream(BareKit.IPC)

const HTTP_PORT = 8765
let httpServer = null
let videoPath = null

// Growing buffer: chunks are appended as transcode progresses
let transcodedChunks = []
let transcodedSize = 0
let transcodeFinished = false

function log (...message) {
  if (debug) console.log(...message)
}

function cpu () {
  const cpuInfo = processTop.toString()
  const prefix = Buffer.from('cpu')
  const body = Buffer.from(cpuInfo)
  const message = Buffer.concat([prefix, body])
  ipc.write(message)
}

function sendError (error) {
  const prefix = Buffer.from('err:')
  const body = Buffer.from(error)
  const message = Buffer.concat([prefix, body])
  ipc.write(message)
  log('Error sent:', error)
}

function sendStatus (status) {
  const prefix = Buffer.from('sts:')
  const body = Buffer.from(status)
  const message = Buffer.concat([prefix, body])
  ipc.write(message)
  log('Status sent:', status)
}

function sendUrl (url) {
  const prefix = Buffer.from('url:')
  const body = Buffer.from(url)
  const message = Buffer.concat([prefix, body])
  ipc.write(message)
  log('URL sent:', url)
}

// Register iOS-compatible format for fragmented MP4 streaming
async function registerFormats () {
  const formatRegistry = await video.getFormatRegistry()

  formatRegistry.register('mp4-ios', {
    container: 'mp4',
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
    },
    encoderOptions: { allow_sw: '1', realtime: '1' }
  })
}

// Read a byte range from the growing transcoded buffer
function readRange (start, end) {
  const length = end - start + 1
  const result = Buffer.alloc(length)
  let written = 0
  let chunkOffset = 0

  for (const chunk of transcodedChunks) {
    const chunkEnd = chunkOffset + chunk.length

    if (chunkEnd > start && chunkOffset < end + 1) {
      const readStart = Math.max(0, start - chunkOffset)
      const readEnd = Math.min(chunk.length, end + 1 - chunkOffset)
      const slice = chunk.subarray(readStart, readEnd)
      slice.copy(result, written)
      written += slice.length
    }

    chunkOffset = chunkEnd
    if (chunkOffset > end) break
  }

  return result.subarray(0, written)
}

async function startTranscode (path) {
  transcodedChunks = []
  transcodedSize = 0
  transcodeFinished = false

  sendStatus('streaming')

  try {
    const startTime = Date.now()
    let chunkCount = 0

    for await (const chunk of video(path).transcode({ format: 'mp4-ios' })) {
      transcodedChunks.push(Buffer.from(chunk.buffer))
      transcodedSize += chunk.buffer.length
      chunkCount++
      if (chunkCount % 50 === 0) {
        log('Transcoded', chunkCount, 'chunks,', (transcodedSize / 1024).toFixed(0), 'KB')
      }
    }

    transcodeFinished = true
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    log('Transcode complete:', chunkCount, 'chunks,', (transcodedSize / 1024).toFixed(0), 'KB in', elapsed, 's')
    sendStatus('done')
  } catch (error) {
    transcodeFinished = true
    log('Transcode error:', error.message)
    sendError(error.message)
  }
}

function startHTTPServer () {
  if (httpServer) return

  httpServer = http.createServer((req, res) => {
    log('HTTP request:', req.method, req.url, 'range:', req.headers.range || 'none')

    if (req.url !== '/video.mp4') {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    if (transcodedSize === 0) {
      res.writeHead(503)
      res.end('Not ready')
      return
    }

    const rangeHeader = req.headers.range
    // Use current transcoded size as the "total" — AVPlayer will re-request
    // as more data becomes available
    const totalSize = transcodedSize

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (match) {
        const start = parseInt(match[1], 10)
        const requestedEnd = match[2] ? parseInt(match[2], 10) : totalSize - 1
        const end = Math.min(requestedEnd, totalSize - 1)

        if (start >= totalSize) {
          // Range not satisfiable yet — data hasn't been transcoded that far
          res.writeHead(416, {
            'Content-Range': 'bytes */' + totalSize
          })
          res.end()
          return
        }

        const data = readRange(start, end)
        const chunkSize = data.length

        log('Serving range:', start, '-', end, '/', totalSize, '(' + chunkSize + ' bytes)')

        res.writeHead(206, {
          'Content-Type': 'video/mp4',
          'Content-Range': 'bytes ' + start + '-' + (start + chunkSize - 1) + '/' + (transcodeFinished ? totalSize : '*'),
          'Content-Length': chunkSize,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        })
        res.end(data)
        return
      }
    }

    // No range — serve what we have
    const data = readRange(0, totalSize - 1)
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': data.length,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    })
    res.end(data)
  })

  httpServer.listen(HTTP_PORT, () => {
    log('HTTP server listening on port', HTTP_PORT)
  })
}

// Handle IPC messages
ipc.on('data', async (data) => {
  try {
    const message = data.toString()
    const parts = message.split(':')
    const command = parts[0]

    log('Received command:', command)

    if (command === 'open') {
      const path = parts.slice(1).join(':')
      if (!fs.existsSync(path)) {
        sendError('File not found: ' + path)
        return
      }
      videoPath = path
      // Start transcoding immediately — don't wait for HTTP request
      startTranscode(path)
      // Send URL to RN so it starts the player
      // Small delay to let initial chunks buffer
      setTimeout(() => {
        sendUrl('http://localhost:' + HTTP_PORT + '/video.mp4')
      }, 500)
    } else if (command === 'close') {
      videoPath = null
      transcodedChunks = []
      transcodedSize = 0
      transcodeFinished = false
      sendStatus('idle')
    }
  } catch (error) {
    log('Command error:', error.message)
    sendError(error.message)
  }
})

// CPU monitoring
setInterval(() => {
  cpu()
}, 1000)

// Cleanup on exit
Bare.on('exit', () => {
  if (httpServer) httpServer.close()
  log('Worklet exiting')
})

// Initialize
async function init () {
  await registerFormats()
  startHTTPServer()
  log('Video Converter Worklet ready!')
  sendStatus('idle')
}

init()
