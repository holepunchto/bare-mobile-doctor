import HyperDB from 'hyperdb'
import RocksDB from 'rocksdb-native'
import spec from './spec/hyperdb/index.js'

const DURATION = 10 * 1000 // 10s

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
  console.log(`(${dir}) Read ${i} records in ${duration / 1000}s (${rate} records/s)`)
  await db.close()
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
  console.log(`(${dir}) Read ${i} records in ${duration / 1000}s (${rate} records/s)`)
  await db.close()
}
