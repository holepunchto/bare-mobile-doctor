const ffmpeg = require('bare-ffmpeg')
const b4a = require('b4a')
const FramedStream = require('framed-stream')
const top = require('process-top')

let debug = Bare.argv[0] === 'true'
let deviceIndex = Bare.argv[1] === 'front' ? '1' : '0'
let isDownScaled = false
const processTop = new top()
const ipc = new FramedStream(BareKit.IPC)

function isDownScale(data) {
  return data[0] === 'd'.charCodeAt(0) && data[1] === 'n'.charCodeAt(0)
}

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

let inputFormat = new ffmpeg.InputFormat()

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
log(
  'Get decoder for pixel format:',
  ffmpeg.constants.getPixelFormatName(decoder.pixelFormat)
)

decoder.open()
log('Setup decoder')

const rawFrame = new ffmpeg.Frame()
const rgbaFrame = new ffmpeg.Frame()
rgbaFrame.width = decoder.width
rgbaFrame.height = decoder.height
rgbaFrame.format = ffmpeg.constants.pixelFormats.RGBA
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
const toDowngradedRGBA = new ffmpeg.Scaler(
  decoder.pixelFormat,
  decoder.width,
  decoder.height,
  ffmpeg.constants.pixelFormats.RGBA,
  decoder.width / 2,
  decoder.height / 2
)
let scaler = toRGBA

log('Scaler set')

Bare.on('exit', () => {
  inputFormatContext.destroy()
  rawFrame.destroy()
  rgbaFrame.destroy()
  toRGBA.destroy()
  toDowngradedRGBA.destroy()
  scaler = null
  log('Worklet ffmpeg closed')
})

ipc.on('data', (data) => {
  isDownScaled = isDownScale(data) ? true : false

  scaler = isDownScaled ? toDowngradedRGBA : toRGBA
  rgbaFrame.width = isDownScaled ? rgbaFrame.width / 2 : rgbaFrame.width * 2
  rgbaFrame.height = isDownScaled ? rgbaFrame.height / 2 : rgbaFrame.height * 2
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

    const expectedSize = decoder.width * decoder.height * 1.5
    if (packet.data.byteLength < expectedSize) {
      log('2 - Skip too small packet')
      packet.unref()
      return
    }

    ret = decoder.sendPacket(packet)
    log('2 - send packet', ret)
    packet.unref()
    if (!ret) return

    while (decoder.receiveFrame(rawFrame)) {
      log('3 - receive raw frame')

      const image = new ffmpeg.Image(
        ffmpeg.constants.pixelFormats.RGBA,
        rgbaFrame.width,
        rgbaFrame.height
      )
      log('4 - create image')

      image.fill(rgbaFrame)
      log('5 - fill  image')

      scaler.scale(rawFrame, rgbaFrame)
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
