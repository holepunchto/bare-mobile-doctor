const sodium = require('sodium-native')
const { get, set, findFirst } = require('quickbit-native')

console.log('Worklet started')

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

function basicWork() {
  return 42;
}

function doNativeWork(iterations) {
  for (let i = 0; i < iterations; i++) {
    const field = Buffer.alloc(256)
    set(field, 1000)
  }
}

BareKit.IPC.on('data', (data) => {
  const messages = data.toString().split('-').filter(Boolean)
  messages.forEach((message) => {
    const payload = JSON.parse(message);
    if (payload.workType === "crypto") {
      doCryptoWork(100_000)
    } if (payload.workType === "native") {
      doNativeWork(100_000)
    } else {
      basicWork()
    }

    BareKit.IPC.write(message + '-');
  })
});

console.log('Worklet setup complete');
