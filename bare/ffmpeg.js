const ffmpeg = require('bare-ffmpeg')

function log(...message) {
  console.log(...message)
}

log('Worklet ready!')

const options = new ffmpeg.Dictionary()
options.set('framerate', '30')
options.set('video_size', '1280x720')
options.set('pixel_format', 'nv12')

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

// Main loop
setInterval(() => {
  const packet = new ffmpeg.Packet()
  const ret = inputFormatContext.readFrame(packet)
  console.log('1 - read frame')
  if (!ret) return

  decoder.sendPacket(packet)
  console.log('2 - send packet')
  packet.unref()

  while (decoder.receiveFrame(rawFrame)) {
    console.log('3 - receive raw frame')

    const image = new ffmpeg.Image(
      ffmpeg.constants.pixelFormats.RGBA,
      decoder.width,
      decoder.height
    )
    console.log('4 - create image')
    console.log('image buffer', image._data.buffer)
    console.log('image byteOffset', image._data.byteOffset)
    console.log('image byteLength', image._data.byteLength)

    image.fill(rgbaFrame) // Crash on iOS
    console.log('5 - fill  image')

    toRGBA.scale(rawFrame, rgbaFrame)
    console.log('6 - scale to rgba frame')
    console.log('rgbaFrame', rgbaFrame)


    console.log('7 - use buffer from image', image.data)

    // BareKit.IPC.write(JSON.stringify({
    //   width: image.width,
    //   height: image.height,
    //   buffer: image.data.buffer,
    //   byteOffset: image.data.byteOffset,
    //   byteLength: image.data.byteLength
    // }))
  }
}, 1000 / 30) // ~30 FPS
