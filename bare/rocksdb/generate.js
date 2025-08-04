import HyperDB from 'hyperdb'
import RocksDB from 'rocksdb-native'
import spec from './spec/hyperdb/index.js'

const BATCH_SIZE = 10000

await generateDatabase('./dbs/1e6', 1e6)
await generateDatabase('./dbs/1e5', 1e5)
await generateDatabase('./dbs/1e4', 1e4)
await generateRawDatabase('./dbs/raw-1e6', 1e6)
await generateRawDatabase('./dbs/raw-1e5', 1e5)
await generateRawDatabase('./dbs/raw-1e4', 1e4)

async function generateDatabase (dir, size) {
  const db = HyperDB.rocks(dir, spec)

  let tx = db.transaction()
  for (let i = 0; i < size; i++) {
    await tx.insert('@x/b', {
      a: '' + i,
      b: i,
      c: (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 64),
      d: Date.now()
    })
    if ((i % BATCH_SIZE) === 0) {
      console.log('inserted:', i)
      await tx.flush()
      tx = db.transaction()
    }
  }

  await tx.flush()
  await db.close()
}

async function generateRawDatabase (dir, size) {
  const db = new RocksDB(dir)

  let tx = db.write()
  for (let i = 0; i < size; i++) {
    tx.tryPut('' + i, Buffer.alloc(1024).fill(Math.floor(Math.random() * 256)))
    if ((i % BATCH_SIZE) === 0) {
      console.log('inserted:', i)
      await tx.flush()
      await tx.destroy()
      tx = db.write()
    }
  }

  await tx.flush()
  await tx.destroy()
  await db.close()
}
