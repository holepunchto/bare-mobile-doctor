const ptop = require('process-top')

let logsEnabled = Bare.argv[1] === 'true'

function log(...args) {
  if (logsEnabled) console.log(...args)
}

let timer = null
BareKit.IPC.on('data', function (data) {
  clearInterval(timer)
  const message = JSON.parse(data)
  if (message.type === 'setLogsEnabled') {
    logsEnabled = message.enabled
    return
  }
  if (message.type) {
    timer = setInterval(() => {
      const top = ptop()
      const res = message.type === 'cpu' ? top.cpu() : top.memory()
      BareKit.IPC.write(Buffer.from(JSON.stringify(res)))
    }, 1000)
  }
})
