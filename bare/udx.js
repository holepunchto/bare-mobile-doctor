console.log('Worklet started')
const UDX = require('udx-native')
const assert = require('bare-assert');

BareKit.IPC.setEncoding('utf8')
BareKit.IPC.on('data', function(data) {
  if (data === 'socket') {
    socketTest()
      .then(() => BareKit.IPC.write(result('socket', true)))
      .catch((e) => BareKit.IPC.write(result('socket', false, e.message)))
  }
});

function socketTest() {
  const u = new UDX()
  const a = u.createSocket()
  const b = u.createSocket()

  return new Promise((resolve, reject) => {
    b.on('message', function(message) {
      try {
        assert(message.toString() === 'hello')
        resolve(true)
      } catch (e) {
        reject(e)
      } finally {
        a.close()
        b.close()
      }
    })

    b.bind(0)
    a.send(Buffer.from('hello'), b.address().port)
  })
}

function result(type, hasSucceeded, message = null) { return JSON.stringify({ type, hasSucceeded, message }) + '\n' }

console.log('Worklet setup complete')
