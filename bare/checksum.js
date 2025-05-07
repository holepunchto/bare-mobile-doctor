const sodium = require('sodium-native')
const FramedStream = require('framed-stream')

console.log('Worklet started')

let receivedSize = 0
let sentChunks = []
let recvChunks = []

const chunkSize = 73333
const totalChunks = 1
const framed = new FramedStream(BareKit.IPC)

function computeHash(chunks) {
  const state = Buffer.alloc(sodium.crypto_hash_sha512_STATEBYTES)
  sodium.crypto_hash_sha512_init(state)

  for (const chunk of chunks) {
    sodium.crypto_hash_sha512_update(state, chunk)
  }

  const out = Buffer.alloc(sodium.crypto_hash_sha512_BYTES)
  sodium.crypto_hash_sha512_final(state, out)

  return out.toString('hex')
}

function startTest() {
  console.log('[Worklet] Start test')

  for (let i = 0; i < totalChunks; i++) {
    const chunk = Buffer.alloc(chunkSize)
    sodium.randombytes_buf(chunk)
    framed.write(chunk)
    sentChunks.push(chunk)
  }

  console.log('[Worklet] All chunks sent')
}

function endTest() {
  console.log('[Worklet] All chunks received')

  const sentHash = computeHash(sentChunks)
  const recvHash = computeHash(recvChunks)
  const success = sentHash === recvHash

  console.log('[Worklet] Sent hash:', sentHash)
  console.log('[Worklet] Recv hash:', recvHash)
  console.log('[Worklet] Checksums match:', success)

  framed.write(Buffer.from(success ? 'done' : 'fail'))
}

framed.on('data', (data) => {
  console.log('ondata', data.byteLength)
  recvChunks.push(data)
  receivedSize += data.length

  if (receivedSize === chunkSize * totalChunks) endTest()
})

console.log('Worklet setup complete')

startTest()
