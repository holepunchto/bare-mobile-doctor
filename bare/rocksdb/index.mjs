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
    sendResponse({ type: 'error', error: error.message })
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
      sendResponse({
        type: 'generation',
        success: true,
        dbType: 'hyperdb',
        size
      })
    } else if (type === 'raw') {
      await generateRawDatabase(path + `/dbs/raw-${size}`, size)
      sendResponse({
        type: 'generation',
        success: true,
        dbType: 'rocksdb',
        size
      })
    } else {
      sendResponse({
        type: 'error',
        error: 'Invalid type. Use "hyperdb" or "raw"'
      })
    }
  } catch (error) {
    sendResponse({ type: 'error', error: error.message })
  }
}

async function handleBench(payload) {
  const { type, size } = payload

  try {
    // Ensure the dbs directory exists using the base path
    const dbsDir = path + '/dbs'
    if (!fs.existsSync(dbsDir)) {
      sendResponse({
        type: 'error',
        error:
          'Database directory does not exist. Please generate databases first.'
      })
      return
    }
    console.log('dbsDir', dbsDir)

    let dbPath
    if (type === 'hyperdb') {
      dbPath = path + `/dbs/${size}`
    } else if (type === 'raw') {
      dbPath = path + `/dbs/raw-${size}`
    } else {
      sendResponse({
        type: 'error',
        error: 'Invalid type. Use "hyperdb" or "raw"'
      })
      return
    }

    console.log('dbPath', dbPath)

    // Check if the specific database exists
    if (!fs.existsSync(dbPath)) {
      sendResponse({
        type: 'error',
        error: `Database ${type} with size ${size} does not exist. Please generate it first.`
      })
      return
    }

    // Check if RocksDB files exist (CURRENT, MANIFEST, etc.)
    const rocksdbFiles = ['CURRENT', 'MANIFEST', 'LOCK']
    const hasRocksDBFiles = rocksdbFiles.some((file) =>
      fs.existsSync(`${dbPath}/${file}`)
    )

    if (!hasRocksDBFiles) {
      sendResponse({
        type: 'error',
        error: `Database ${type} with size ${size} exists but is not properly initialized. Please regenerate it.`
      })
      return
    }

    let result
    if (type === 'hyperdb') {
      result = await bench(dbPath, size)
    } else if (type === 'raw') {
      result = await benchRaw(dbPath, size)
    }

    sendResponse({ type: 'benchmark', result })
  } catch (error) {
    sendResponse({ type: 'error', error: error.message })
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

async function bench(dir, count) {
  let db
  try {
    db = HyperDB.rocks(dir, spec)
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
      dir: `./dbs/${count}`,
      recordsRead: i,
      duration: duration / 1000,
      rate: Math.round(rate * 10) / 10
    }
    return result
  } catch (error) {
    if (error.message.includes('Key is not there')) {
      throw new Error(
        `The database was not properly generated or is incomplete. Please regenerate the databases.`
      )
    }
    throw new Error(`HyperDB benchmark failed: ${error.message}`)
  } finally {
    if (db) {
      try {
        await db.close()
      } catch (closeError) {
        console.error('Error closing HyperDB:', closeError)
      }
    }
  }
}

async function benchRaw(dir, count) {
  let db
  try {
    db = new RocksDB(dir)
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
      dir: `./dbs/raw-${count}`,
      recordsRead: i,
      duration: duration / 1000,
      rate: Math.round(rate * 10) / 10
    }
    return result
  } catch (error) {
    if (error.message.includes('Key is not there')) {
      throw new Error(
        `The database was not properly generated or is incomplete. Please regenerate the databases.`
      )
    }
    throw new Error(`Raw RocksDB benchmark failed: ${error.message}`)
  } finally {
    if (db) {
      try {
        await db.close()
      } catch (closeError) {
        console.error('Error closing RocksDB:', closeError)
      }
    }
  }
}
