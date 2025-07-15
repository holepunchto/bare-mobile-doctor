const ffmpeg = require('bare-ffmpeg')
const b4a = require('b4a')
const FramedStream = require('framed-stream')
const top = require('process-top')

let debug = Bare.argv[0] === 'true'
let deviceIndex = Bare.argv[1] === 'front' ? '1' : '0'
const processTop = new top()
const ipc = new FramedStream(BareKit.IPC)

function log(...message) {
  if (debug) console.log(...message)
}

function cpu() {
  const cpuInfo = processTop.toString()
  const prefix = Buffer.from('cpu')
  const body = Buffer.from(cpuInfo)
  const message = Buffer.concat([prefix, body])
  ipc.write(message)
  log('cpu info sent')
}

log('Worklet ready!')

const options = new ffmpeg.Dictionary()
if (Bare.platform === 'ios') {
  options.set('framerate', '60')
  options.set('video_size', '352x288')
  options.set('pixel_format', 'nv12')
  options.set('video_device_index', deviceIndex)
  options.set('preset', 'ultrafast')
  options.set('input_queue_size', '3')
} else {
  options.set('framerate', '30')
  options.set('video_size', '640x480')
  options.set('pixel_format', 'yuv420p')
  options.set('camera_index', deviceIndex)
  options.set('input_queue_size', '3')
}

log('Options set!')

let inputFormat

if (Bare.platform === 'ios') {
  inputFormat = new ffmpeg.InputFormat()
} else {
  // TODO: add it as default in `bare-ffmpeg`
  inputFormat = new ffmpeg.InputFormat('android_camera')
}

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
  rawFrame.destroy()
  rgbaFrame.destroy()
  toRGBA.destroy()
})

setInterval(() => {
  cpu()
}, 1000)

// Main loop
setInterval(() => {
  try {
    const packet = new ffmpeg.Packet()
    let ret = inputFormatContext.readFrame(packet)
    log('1 - read frame', ret)
    if (!ret) return

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
      log('9 - buffer sent successfully via IPC')
    }
  } catch (error) {
    log('Error in main loop:', error)
  }
}, 1000 / 30)
