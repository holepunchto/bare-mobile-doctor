const sodium = require('sodium-native')

console.log('Worklet started')

BareKit.IPC.on('data', (data) => {
  function heavyMathLoad(iterations) {
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

  const messages = data.toString().split('-').filter(Boolean)
  messages.forEach((message) => {
    const payload = JSON.parse(message);
    if (payload.workType === "intensive") {
      heavyMathLoad(100_000)
    } else {
      basicWork()
    }

    BareKit.IPC.write(message + '-');
  })
});

console.log('Worklet setup complete');
