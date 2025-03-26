const ptop = require('process-top')

BareKit.IPC.setEncoding('utf8')
BareKit.IPC.on('data', function(data) {
  let message = JSON.parse(data)
  if (message.type) {
    const top = ptop()
    const res = message.type === 'cpu' ? top.cpu() : top.memory()
    BareKit.IPC.write(JSON.stringify(res))
  }
})
