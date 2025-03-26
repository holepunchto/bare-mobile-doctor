const ptop = require('process-top')

BareKit.IPC.setEncoding('utf8')
BareKit.IPC.on('data', function(data) {
  let message = JSON.parse(data)
  if (message.op = 'get-stats') {
    const top = ptop()

    BareKit.IPC.write(JSON.stringify(top.cpu()))
  }
})
