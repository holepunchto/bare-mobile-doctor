const ffmpeg = require('bare-ffmpeg')
const fs = require('bare-fs')
const Buffer = require('bare-buffer')
const b4a = require('b4a')
const FramedStream = require('framed-stream')
const top = require('process-top')

const debug = Bare.argv[0] === 'true'
const processTop = new top()
const ipc = new FramedStream(BareKit.IPC)

let isPlaying = false
let videoPath = null
let inputFormatContext = null
let decoder = null
let scaler = null
let rawFrame = null
let rgbaFrame = null
let playInterval = null
let videoWidth = 0
let videoHeight = 0
let frameRate = 30
let videoStreamIndex = -1

function log(...message) {
  if (debug) console.log(...message)
}

function cpu() {
  const cpuInfo = processTop.toString()
  const prefix = Buffer.from('cpu')
  const body = Buffer.from(cpuInfo)
  const message = Buffer.concat([prefix, body])
  ipc.write(message)
}

function sendError(error) {
  const prefix = Buffer.from('err:')
  const body = Buffer.from(error)
  const message = Buffer.concat([prefix, body])
  ipc.write(message)
  log('Error sent:', error)
}

function sendStatus(status) {
  const prefix = Buffer.from('sts:')
  const body = Buffer.from(status)
  const message = Buffer.concat([prefix, body])
  ipc.write(message)
  log('Status sent:', status)
}

function sendMetadata() {
  const metadata = JSON.stringify({
    width: videoWidth,
    height: videoHeight,
    frameRate
  })
  const prefix = Buffer.from('meta:')
  const body = Buffer.from(metadata)
  const message = Buffer.concat([prefix, body])
  ipc.write(message)
  log('Metadata sent:', metadata)
}

function cleanup() {
  if (playInterval) {
    clearInterval(playInterval)
    playInterval = null
  }
  if (scaler) {
    scaler.destroy()
    scaler = null
  }
  if (rawFrame) {
    rawFrame.destroy()
    rawFrame = null
  }
  if (rgbaFrame) {
    rgbaFrame.destroy()
    rgbaFrame = null
  }
  if (decoder) {
    decoder.destroy()
    decoder = null
  }
  if (inputFormatContext) {
    inputFormatContext.destroy()
    inputFormatContext = null
  }
  isPlaying = false
  videoStreamIndex = -1
}

function openVideo(path) {
  try {
    log('Opening video:', path)

    // Clean up any existing resources
    cleanup()

    // Check if file exists
    if (!fs.existsSync(path)) {
      sendError(`File not found: ${path}`)
      return false
    }

    const fileSize = fs.statSync(path).size
    log('File size:', fileSize)

    // Read first 16 bytes to check file integrity
    const testFd = fs.openSync(path, 'r')
    const headerBuf = Buffer.alloc(16)
    const bytesRead = fs.readSync(testFd, headerBuf, 0, 16, 0)
    fs.closeSync(testFd)
    log('First 16 bytes:', headerBuf.toString('hex'))
    log('Bytes read:', bytesRead)

    // Open file
    const fd = fs.openSync(path, 'r')
    let offset = 0

    // Create IO context
    const io = new ffmpeg.IOContext(4096, {
      onread: (buffer, requested) => {
        const read = fs.readSync(fd, buffer, 0, requested, offset)
        if (read === 0) return 0
        offset += read
        return read
      },
      onseek: (o, whence) => {
        if (whence === ffmpeg.constants.seek.SIZE) return fileSize
        if (whence === ffmpeg.constants.seek.SET) offset = o
        else if (whence === ffmpeg.constants.seek.CUR) offset += o
        else if (whence === ffmpeg.constants.seek.END) offset = fileSize + o
        else return -1
        return offset
      }
    })

    // Open input format context
    inputFormatContext = new ffmpeg.InputFormatContext(io)
    log('Input format context created')

    // Get best video stream
    const bestStream = inputFormatContext.getBestStream(ffmpeg.constants.mediaTypes.VIDEO)
    if (!bestStream) {
      sendError('No video stream found in file')
      cleanup()
      fs.closeSync(fd)
      return false
    }

    log('Best stream found:', bestStream.index)

    // Save video stream index
    videoStreamIndex = bestStream.index
    log('Video stream index:', videoStreamIndex)

    // Get decoder
    decoder = bestStream.decoder()
    decoder.open()

    videoWidth = decoder.width
    videoHeight = decoder.height

    // Try to get frame rate
    if (decoder.frameRate && decoder.frameRate.valid) {
      frameRate = decoder.frameRate.numerator / decoder.frameRate.denominator
    } else {
      frameRate = 30 // Default
    }

    log('Video metadata:', { width: videoWidth, height: videoHeight, frameRate })

    // Create frames
    rawFrame = new ffmpeg.Frame()
    rgbaFrame = new ffmpeg.Frame()
    rgbaFrame.width = videoWidth
    rgbaFrame.height = videoHeight
    rgbaFrame.format = ffmpeg.constants.pixelFormats.RGBA
    rgbaFrame.alloc()

    // Create scaler
    scaler = new ffmpeg.Scaler(
      decoder.pixelFormat,
      videoWidth,
      videoHeight,
      ffmpeg.constants.pixelFormats.RGBA,
      videoWidth,
      videoHeight
    )

    log('Decoder and scaler ready')

    videoPath = path
    sendStatus('ready')
    sendMetadata()

    return true
  } catch (error) {
    log('Error opening video:', error.message)
    sendError(error.message)
    cleanup()
    return false
  }
}

function startPlayback() {
  if (!inputFormatContext || !decoder) {
    sendError('No video loaded')
    return
  }

  if (isPlaying) {
    log('Already playing')
    return
  }

  isPlaying = true
  sendStatus('playing')
  log('Starting playback at', frameRate, 'fps')

  // Calculate frame interval in ms
  const frameInterval = 1000 / frameRate

  let frameCount = 0
  playInterval = setInterval(() => {
    if (!isPlaying) return

    try {
      const packet = new ffmpeg.Packet()
      const ret = inputFormatContext.readFrame(packet)

      log('readFrame ret:', ret, 'streamIndex:', packet.streamIndex)

      if (!ret) {
        // End of video - loop back
        log('End of video, looping...')
        packet.unref()

        // Reopen the video to loop
        const currentPath = videoPath
        cleanup()
        setTimeout(() => {
          if (openVideo(currentPath)) {
            startPlayback()
          }
        }, 100)
        return
      }

      // Only process video packets
      if (packet.streamIndex === videoStreamIndex) {
        log('Processing video packet')
        const sendResult = decoder.sendPacket(packet)
        log('sendPacket result:', sendResult)

        if (sendResult) {
          while (decoder.receiveFrame(rawFrame)) {
            log('Received frame', frameCount++)

            // Create image
            const image = new ffmpeg.Image(
              ffmpeg.constants.pixelFormats.RGBA,
              rgbaFrame.width,
              rgbaFrame.height
            )
            image.fill(rgbaFrame)

            // Scale to RGBA (updates the buffer referenced by image)
            scaler.scale(rawFrame, rgbaFrame)

            const buf = b4a.from(image.data.buffer)
            log('Sending frame buffer, size:', buf.length)
            ipc.write(buf)
          }
        }
      } else {
        log('Skipping non-video packet, streamIndex:', packet.streamIndex)
      }

      packet.unref()
    } catch (error) {
      log('Playback error:', error.message)
      sendError(error.message)
      stopPlayback()
    }
  }, frameInterval)
}

function stopPlayback() {
  isPlaying = false
  if (playInterval) {
    clearInterval(playInterval)
    playInterval = null
  }
  sendStatus('stopped')
  log('Playback stopped')
}

// Handle IPC messages
ipc.on('data', (data) => {
  try {
    const message = data.toString()
    const parts = message.split(':')
    const command = parts[0]

    log('Received command:', command)

    if (command === 'open') {
      const path = parts.slice(1).join(':')
      openVideo(path)
    } else if (command === 'play') {
      startPlayback()
    } else if (command === 'stop') {
      stopPlayback()
    } else if (command === 'close') {
      cleanup()
      sendStatus('closed')
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
  cleanup()
  log('Worklet exiting')
})

log('Video Converter Worklet ready!')
sendStatus('idle')
