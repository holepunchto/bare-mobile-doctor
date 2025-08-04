import HyperDB from 'hyperdb'
import RocksDB from 'rocksdb-native'
import FramedStream from 'framed-stream'
import fs from 'bare-fs'

import spec from './spec/hyperdb/index.js'
import { generateDatabase, generateRawDatabase } from './generate.mjs'

// Get the base path from argv, similar to other modules
let path = Bare.argv[0]
if (path.includes('file://')) {
  path = path.replace('file://', '')
}

const DURATION = 10 * 1000 // 10s
const ipc = new FramedStream(BareKit.IPC)

// IPC message handler
ipc.on('data', (data) => {
  try {
    const message = data.toString()
    console.log('Received message:', message)
    const { action, payload } = JSON.parse(message)
    console.log('Parsed action:', action, 'payload:', payload)
    
    switch (action) {
      case 'generate':
        handleGenerate(payload)
        break
      case 'bench':
        handleBench(payload)
        break
      default:
        sendResponse({ error: 'Unknown action' })
    }
  } catch (error) {
    console.error('Parse error:', error.message, 'for message:', message)
    sendResponse({ error: error.message })
  }
})

async function handleGenerate(payload) {
  const { type, size } = payload
  
  try {
    // Ensure the dbs directory exists using the base path
    const dbsDir = path + '/dbs'
    if (!fs.existsSync(dbsDir)) {
      fs.mkdirSync(dbsDir, { recursive: true })
    }
    
    if (type === 'hyperdb') {
      await generateDatabase(path + `/dbs/${size}`, size)
      sendResponse({ success: true, message: `Generated HyperDB database with ${size} records` })
    } else if (type === 'raw') {
      await generateRawDatabase(path + `/dbs/raw-${size}`, size)
      sendResponse({ success: true, message: `Generated raw RocksDB database with ${size} records` })
    } else {
      sendResponse({ error: 'Invalid type. Use "hyperdb" or "raw"' })
    }
  } catch (error) {
    sendResponse({ error: error.message })
  }
}

async function handleBench(payload) {
  const { type, size } = payload
  
  try {
    // Ensure the dbs directory exists using the base path
    const dbsDir = path + '/dbs'
    if (!fs.existsSync(dbsDir)) {
      fs.mkdirSync(dbsDir, { recursive: true })
    }
    
    let result
    if (type === 'hyperdb') {
      result = await bench(path + `/dbs/${size}`, size)
    } else if (type === 'raw') {
      result = await benchRaw(path + `/dbs/raw-${size}`, size)
    } else {
      sendResponse({ error: 'Invalid type. Use "hyperdb" or "raw"' })
      return
    }
    
    sendResponse({ success: true, result })
  } catch (error) {
    sendResponse({ error: error.message })
  }
}

function sendResponse(data) {
  const message = JSON.stringify(data)
  ipc.write(Buffer.from(message))
}

// await bench('./dbs/1e6', 1e6)
// await bench('./dbs/1e5', 1e5)
// await bench('./dbs/1e4', 1e4)
// await benchRaw('./dbs/raw-1e6', 1e6)
// await benchRaw('./dbs/raw-1e5', 1e5)
// await benchRaw('./dbs/raw-1e4', 1e4)

async function bench (dir, count) {
  const db = HyperDB.rocks(dir, spec)
  const start = Date.now()
  let duration = 0
  let i = 0
  while (true) {
    const key = Math.floor(Math.random() * count)
    const res = await db.get('@x/b', { b: key })
    if (!res) throw new Error(`Key is not there but should be there: ${key}`)
    i++
    duration = Date.now() - start
    if (duration >= DURATION) break
  }
  const rate = (i / duration) * 1000
  const result = {
    dir,
    recordsRead: i,
    duration: duration / 1000,
    rate: Math.round(rate * 10) / 10
  }
  await db.close()
  return result
}

async function benchRaw (dir, count) {
  const db = new RocksDB(dir)
  const start = Date.now()
  let duration = 0
  let i = 0
  while (true) {
    const key = '' + Math.floor(Math.random() * count)
    const res = await db.get(key)
    if (!res) throw new Error(`Key is not there but should be there: ${key}`)
    i++
    duration = Date.now() - start
    if (duration >= DURATION) break
  }
  const rate = (i / duration) * 1000
  const result = {
    dir,
    recordsRead: i,
    duration: duration / 1000,
    rate: Math.round(rate * 10) / 10
  }
  await db.close()
  return result
}
