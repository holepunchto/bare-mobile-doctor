const ffmpeg = require('bare-ffmpeg')

// Log
//
function log(message) {
  console.log(message)
}

log('Worklet ready!')

// Set up device
const options = new ffmpeg.Dictionary()
options.set('framerate', '30')
options.set('video_size', '1280x720')
options.set('pixel_format', 'uyvy422')

log('Options set!')

const inputFormat = new ffmpeg.InputFormat()

log('InputFormat set!')

const inputFormatContext = new ffmpeg.InputFormatContext(
  inputFormat,
  options,
  '0:'
)

log('InputFormatContext set!')
