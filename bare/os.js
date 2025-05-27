const ptop = require('process-top')

let timer = null
BareKit.IPC.setEncoding('utf8')
BareKit.IPC.on('data', function (data) {
  clearInterval(timer)
  const message = JSON.parse(data)
  if (message.type) {
    timer = setInterval(() => {
      const top = ptop()
      const res = message.type === 'cpu' ? top.cpu() : top.memory()
      BareKit.IPC.write(JSON.stringify(res))
    }, 1000)
  }
})
