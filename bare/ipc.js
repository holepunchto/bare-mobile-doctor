const sodium = require('sodium-native')
const { set } = require('quickbit-native')
const Buffer = require('bare-buffer')
const top = require('process-top')

console.log('Worklet started')
const processTop = new top()

function basicWork() {
  return 42
}

function cpu() {
  BareKit.IPC.write(JSON.stringify({ summary: processTop.toString() }) + '-')
}

function doCryptoWork(iterations) {
  let acc = ''

  for (let i = 0; i < iterations; i++) {
    const buf = Buffer.from('Hello, World!')
    const out = Buffer.alloc(sodium.crypto_generichash_BYTES)
    sodium.crypto_generichash(out, buf)
    acc += out.toString('hex').slice(0, 2)
  }

  return acc
}

function doNativeWork(iterations) {
  for (let i = 0; i < iterations; i++) {
    const field = Buffer.alloc(256)
    set(field, 1000)
  }
}

function doFatCalls(iterations) {
  const buf1 = Buffer.alloc(256)
  const buf2 = Buffer.alloc(256)
  for (let i = 0; i < iterations; i++) {
    buf1.compare(buf2)
  }
}

BareKit.IPC.on('data', (data) => {
  const messages = data.toString().split('-').filter(Boolean)
  messages.forEach((message) => {
    const payload = JSON.parse(message)
    if (payload.workType === 'crypto') {
      doCryptoWork(100_000)
    } else if (payload.workType === 'native') {
      doNativeWork(100_000)
    } else if (payload.workType === 'fastcall') {
      doFatCalls(100_000)
    } else {
      basicWork()
    }

    BareKit.IPC.write(message + '-')
  })
})

setInterval(() => {
  cpu()
}, 1000)

console.log('Worklet setup complete')
