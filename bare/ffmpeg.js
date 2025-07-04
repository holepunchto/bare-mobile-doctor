const ffmpeg = require('bare-ffmpeg')
const b4a = require('b4a')
const FramedStream = require('framed-stream')

let debug = false // TODO: use args sent from the front end

function log(...message) {
  if (debug) console.log(...message)
}

function info(...message) {
  console.log(...message)
}

log('Worklet ready!')

// Video dimensions
const width = 352
const height = 288

const ipc = new FramedStream(BareKit.IPC)

const options = new ffmpeg.Dictionary()
options.set('framerate', '60')
options.set('video_size', '352x288')
options.set('pixel_format', 'nv12')
options.set('video_device_index', '1') // TODO: use args sent from the front end
options.set('preset', 'ultrafast')
options.set('input_queue_size', '3')

log('Options set!')

const inputFormat = new ffmpeg.InputFormat()

log('InputFormat set!')

const inputFormatContext = new ffmpeg.InputFormatContext(
  inputFormat,
  options,
  '0:'
)

log('InputFormatContext set!')

const bestStream = inputFormatContext.getBestStream(
  ffmpeg.constants.mediaTypes.VIDEO
)

if (!bestStream) {
  log('No video stream found!')
  process.exit(1)
}

log('Get best stream', bestStream)

const decoder = bestStream.decoder()
log('Get decoder')

const rawFrame = new ffmpeg.Frame()
const rgbaFrame = new ffmpeg.Frame()
rgbaFrame.width = decoder.width
rgbaFrame.height = decoder.height
rgbaFrame.pixelFormat = ffmpeg.constants.pixelFormats.RGBA
rgbaFrame.alloc()

log('Frames set!')

const toRGBA = new ffmpeg.Scaler(
  decoder.pixelFormat,
  decoder.width,
  decoder.height,
  ffmpeg.constants.pixelFormats.RGBA,
  decoder.width,
  decoder.height
)

log('Scaler set')

Bare.on('exit', () => {
  inputFormatContext.destroy()
})

// Main loop
setInterval(() => {
  try {
    const packet = new ffmpeg.Packet()
    let ret = inputFormatContext.readFrame(packet)
    log('1 - read frame', ret)
    if (!ret) return

    log('packet.buffer size:', packet.data?.length || 0)

    ret = decoder.sendPacket(packet)
    log('2 - send packet', ret)
    packet.unref()
    if (!ret) return

    while (decoder.receiveFrame(rawFrame)) {
      log('3 - receive raw frame')

      const image = new ffmpeg.Image(
        ffmpeg.constants.pixelFormats.RGBA,
        decoder.width,
        decoder.height
      )
      log('4 - create image')

      image.fill(rgbaFrame)
      log('5 - fill  image')

      toRGBA.scale(rawFrame, rgbaFrame)
      log('6 - scale to rgba frame')

      log('7 - use buffer from image', image.data)

      const buf = b4a.from(image.data.buffer)
      log('8 - buffer size being sent:', buf.length)

      ipc.write(buf)
      log('9 - buffer sent successfully via HTTP')
    }
  } catch (error) {
    log('Error in main loop:', error)
  }
}, 1000 / 60) // ~60 FPS
