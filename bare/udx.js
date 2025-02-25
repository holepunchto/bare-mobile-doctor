console.log('Worklet started')
const UDX = require('udx-native')
const b4a = require('b4a')
const assert = require('bare-assert');

BareKit.IPC.setEncoding('utf8')
BareKit.IPC.on('data', function(data) {
  if (data === 'socket') {
    socketTest()
      .then(() => BareKit.IPC.write(result('socket', true)))
      .catch((e) => BareKit.IPC.write(result('socket', false, e.message)))
  } else if (data === 'stream') {
    streamTest()
      .then(() => BareKit.IPC.write(result('stream', true)))
      .catch((e) => BareKit.IPC.write(result('stream', false, e.message)))
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

function streamTest() {
  const u = new UDX()
  const socket = u.createSocket()
  socket.bind(0, '127.0.0.1')

  const a = u.createStream(1)
  const b = u.createStream(2)

  a.connect(socket, 2, socket.address().port)
  b.connect(socket, 1, socket.address().port)

  return new Promise((resolve, reject) => {
    a.on('data', async function(data) {
      try {
        assert(data.toString() === 'hello')
        a.destroy()
        b.destroy()

        await socket.close()

        resolve(true)
      } catch (e) {
        reject(e)
      }
    })

    b.write(b4a.from('hello'))
  })
}

function result(type, hasSucceeded, message = null) { return JSON.stringify({ type, hasSucceeded, message }) + '\n' }

console.log('Worklet setup complete')
