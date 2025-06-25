const ffmpeg = require('bare-ffmpeg')

function log(message) {
  console.log(message)
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
