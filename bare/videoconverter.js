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
let httpServer = null
let transcodedChunks = []
let transcodedSize = 0
let transcodeFinished = false

function cpu () {
  const cpuInfo = processTop.toString()
  ipc.write(Buffer.concat([Buffer.from('cpu'), Buffer.from(cpuInfo)]))
}

function sendError (error) {
  ipc.write(Buffer.concat([Buffer.from('err:'), Buffer.from(error)]))
}

function sendStatus (status) {
  ipc.write(Buffer.concat([Buffer.from('sts:'), Buffer.from(status)]))
}

function sendUrl (url) {
  ipc.write(Buffer.concat([Buffer.from('url:'), Buffer.from(url)]))
}

async function registerFormats () {
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
    for await (const chunk of video(path).transcode({ format: 'mp4' })) {
      const buf = Buffer.from(chunk.buffer)
      transcodedChunks.push(buf)
      transcodedSize += buf.length
    }

    transcodeFinished = true
    sendStatus('done')
  } catch (error) {
    transcodeFinished = true
    sendError(error.message)
  }
}

function startHTTPServer () {
  if (httpServer) return

  httpServer = http.createServer((req, res) => {
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

    const totalSize = transcodedSize
    const rangeHeader = req.headers.range

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (match) {
        const start = parseInt(match[1], 10)
        const requestedEnd = match[2] ? parseInt(match[2], 10) : totalSize - 1
        const end = Math.min(requestedEnd, totalSize - 1)

        if (start >= totalSize) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + totalSize })
          res.end()
          return
        }

        const data = readRange(start, end)

        res.writeHead(206, {
          'Content-Type': 'video/mp4',
          'Content-Range': 'bytes ' + start + '-' + (start + data.length - 1) + '/' + (transcodeFinished ? totalSize : '*'),
          'Content-Length': data.length,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        })
        res.end(data)
        return
      }
    }

    const data = readRange(0, totalSize - 1)
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': data.length,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    })
    res.end(data)
  })

  httpServer.listen(HTTP_PORT)
}

ipc.on('data', async (data) => {
  try {
    const message = data.toString()
    const parts = message.split(':')
    const command = parts[0]

    if (command === 'open') {
      const path = parts.slice(1).join(':')
      if (!fs.existsSync(path)) {
        sendError('File not found: ' + path)
        return
      }
      startTranscode(path)
      setTimeout(() => {
        sendUrl('http://localhost:' + HTTP_PORT + '/video.mp4')
      }, 500)
    }
  } catch (error) {
    sendError(error.message)
  }
})

setInterval(() => { cpu() }, 1000)

Bare.on('exit', () => {
  if (httpServer) httpServer.close()
})

async function init () {
  await registerFormats()
  startHTTPServer()
  sendStatus('idle')
}

init()
