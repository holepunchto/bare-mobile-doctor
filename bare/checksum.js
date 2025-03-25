const sodium = require('sodium-native')

let sentChunks = []
let recvChunks = []

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

function sendChunks() {
  const chunkSize = 1024 * 1024 // 1MB
  const totalChunks = 250
  const chunk = Buffer.alloc(chunkSize, 'x')

  for (let i = 0; i < totalChunks; i++) {
    sentChunks.push(chunk)
    BareKit.IPC.write(chunk)
  }
  console.log('[Worklet] All chunks sent')
}

function startTest() {
  sentChunks = []
  recvChunks = []

  sendChunks()
}

let checksumTimer = null
function resetChecksumTimer() {
  if (checksumTimer) clearTimeout(checksumTimer)
  checksumTimer = setTimeout(() => {
    const sentHash = computeHash(sentChunks)
    const recvHash = computeHash(recvChunks)

    console.log('[Worklet] Sent hash:', sentHash)
    console.log('[Worklet] Recv hash:', recvHash)
    console.log('[Worklet] Checksums match:', sentHash === recvHash)

    sentChunks = []
    recvChunks = []
  }, 500)
}

console.log('Worklet started')

BareKit.IPC.on('data', (data) => {
  recvChunks.push(data)
  resetChecksumTimer()
})

console.log('Worklet setup complete')

startTest()
