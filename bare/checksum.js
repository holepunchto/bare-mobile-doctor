const sodium = require('sodium-native')

console.log('Worklet started')

let sentChunks = []
let recvChunks = []

function frame(obj) {
  const str = JSON.stringify(obj)
  const buf = Buffer.from(str)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(buf.length, 0)
  return Buffer.concat([len, buf])
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

function sendChunks() {
  const chunkSize = 1024 * 1024 // 1MB
  const totalChunks = 250
  const chunk = Buffer.alloc(chunkSize)
  sodium.randombytes_buf(chunk)

  for (let i = 0; i < totalChunks; i++) {
    const payload = { chunk: chunk.toString('base64') }
    BareKit.IPC.write(frame(payload))
    sentChunks.push(chunk)
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
    console.log('[Worklet] All chunks received')

    const sentHash = computeHash(sentChunks)
    const recvHash = computeHash(recvChunks)

    console.log('[Worklet] Sent hash:', sentHash)
    console.log('[Worklet] Recv hash:', recvHash)
    console.log('[Worklet] Checksums match:', sentHash === recvHash)

    sentChunks = []
    recvChunks = []

    clearTimeout(checksumTimer)
  }, 1000)
}

let recvBuf = Buffer.alloc(0)
BareKit.IPC.on('data', (data) => {
  recvBuf = Buffer.concat([recvBuf, data])

  while (recvBuf.length >= 4) {
    const msgLen = recvBuf.readUInt32BE(0)
    if (recvBuf.length < msgLen + 4) break

    const msgBuf = recvBuf.slice(4, 4 + msgLen)
    let msg
    try {
      msg = JSON.parse(msgBuf.toString())
    } catch (e) {
      console.log('Parsing failed for msg:', msgBuf.toString())
      recvBuf = Buffer.alloc(0)
      break
    }

    // Remove the processed message from the buffer
    recvBuf = recvBuf.slice(4 + msgLen)

    if (msg.chunk) {
      const decoded = Buffer.from(msg.chunk, 'base64')
      recvChunks.push(decoded)
    }
  }

  resetChecksumTimer()
})

console.log('Worklet setup complete')

startTest()
