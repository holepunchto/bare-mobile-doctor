const sodium = require('sodium-native')
const FramedStream = require('framed-stream')

console.log('Worklet started')

let isFramed = Bare.argv[0] === 'framed'
let receivedSize = 0
const sentChunks = []
const recvChunks = []

const totalSize = 1024 * 1024 * 250 // 250MB in bytes
const minChunkSize = 1024 * 100 // 100KB
const maxChunkSize = 1024 * 1024 * 2 // 2MB
let remainingSize = totalSize

const ipc = isFramed ? new FramedStream(BareKit.IPC) : BareKit.IPC

function getRandomChunkSize() {
  if (remainingSize <= minChunkSize) {
    return remainingSize
  }
  const maxPossible = Math.min(maxChunkSize, remainingSize)
  return (
    Math.floor(Math.random() * (maxPossible - minChunkSize + 1)) + minChunkSize
  )
}

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

  while (remainingSize > 0) {
    const chunkSize = getRandomChunkSize()
    console.log('[Worklet] Sending chunk of size', chunkSize)
    const chunk = Buffer.alloc(chunkSize)
    sodium.randombytes_buf(chunk)
    ipc.write(chunk)
    sentChunks.push(chunk)
    remainingSize -= chunkSize
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

  ipc.write(Buffer.from(success ? 'done' : 'fail'))
}

ipc.on('data', (data) => {
  recvChunks.push(data)
  receivedSize += data.length

  if (receivedSize === totalSize) endTest()
})

console.log('Worklet setup complete')

startTest()
