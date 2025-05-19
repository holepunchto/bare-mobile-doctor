const sodium = require('sodium-native')

console.log('Worklet started')

let receivedSize = 0
const sentChunks = []
const recvChunks = []

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
  const chunkSize = 1024 * 1024 // 1MB
  const totalChunks = 250
  const chunk = Buffer.alloc(chunkSize)

  for (let i = 0; i < totalChunks; i++) {
    sodium.randombytes_buf(chunk)
    BareKit.IPC.write(chunk)
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

  BareKit.IPC.write(Buffer.from(success ? 'done' : 'fail'))
}

BareKit.IPC.on('data', (data) => {
  recvChunks.push(data)
  receivedSize += data.length

  if (receivedSize === 1024 * 1024 * 250) endTest()
})

console.log('Worklet setup complete')

startTest()
