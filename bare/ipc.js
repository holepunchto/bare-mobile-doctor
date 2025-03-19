const sodium = require('sodium-native')

console.log('Worklet started')
BareKit.IPC.on('data', (data) => {
  function heavyMathLoad(iterations) {
    let sum = 0

    // Do heavy math
    for (let i = 0; i < iterations; i++) {
      sum += Math.sin(i) * Math.cos(i) * Math.tan(i);
    }

    // Do some hashing
    const buf = Buffer.from('Hello, World!')
    const out = Buffer.alloc(sodium.crypto_generichash_BYTES)
    sodium.crypto_generichash(out, buf)

    return sum + out.toString('hex')
  }

  function basicWork() {
    return 42;
  }

  const messages = data.toString().split('-').filter(Boolean)
  messages.forEach((message) => {
    const payload = JSON.parse(message);
    if (payload.workType === "intensive") {
      heavyMathLoad(1e7)
    } else {
      basicWork()
    }

    BareKit.IPC.write(message + '-');
  })
});

console.log('Worklet setup complete');
