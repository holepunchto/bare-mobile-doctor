import FramedStream from 'framed-stream'

import bench from './bench.mjs'

const PROGRESS_EVERY = 250

let logsEnabled = Bare.argv[1] === 'true'

function log(...args) {
  if (logsEnabled) console.log(...args)
}

let path = Bare.argv[0]
if (path.includes('file://')) {
  path = path.replace('file://', '')
}

const ipc = new FramedStream(BareKit.IPC)

function send(message) {
  ipc.write(Buffer.from(JSON.stringify(message)))
}

// A phase emits one progress call per batch, which is far too many to forward.
function throttle(fn) {
  let last = 0
  return (message) => {
    const now = Date.now()
    if (now - last < PROGRESS_EVERY) return
    last = now
    fn(message)
  }
}

ipc.on('data', (data) => {
  let message
  try {
    message = JSON.parse(data.toString())
  } catch (error) {
    send({ type: 'error', error: `Bad message: ${error.message}` })
    return
  }

  if (message.type === 'setLogsEnabled') {
    logsEnabled = message.enabled
    return
  }

  if (message.action !== 'bench') {
    send({ type: 'error', error: `Unknown action: ${message.action}` })
    return
  }

  const { dbType, seconds } = message.payload
  log('bench', dbType, seconds)

  const onProgress = throttle((progress) => send({ type: 'progress', ...progress }))

  bench({ dbType, seconds, dir: `${path}/bench-${dbType}-${Date.now()}`, onProgress })
    .then((result) => send({ type: 'result', ...result }))
    .catch((error) => send({ type: 'error', error: error.message }))
})
