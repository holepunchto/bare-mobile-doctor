import HyperDB from 'hyperdb'
import RocksDB from 'rocksdb-native'
import fs from 'bare-fs'

import spec from './spec/hyperdb/index.js'

const BATCH = 1000
const READS_PER_TICK = 100

// Only two things differ between the layers: how a batch is written and how a
// key is read. Everything else is shared.
function driver(dbType, dir) {
  if (dbType === 'hyperdb') {
    const db = HyperDB.rocks(dir, spec)
    return {
      close: () => db.close(),
      get: (key) => db.get('@x/b', { b: key }),
      async writeBatch(from, count) {
        const tx = db.transaction()
        for (let i = 0; i < count; i++) {
          await tx.insert('@x/b', {
            a: `${from + i}`,
            b: from + i,
            c: Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64),
            d: Date.now()
          })
        }
        await tx.flush()
      }
    }
  }

  if (dbType === 'raw') {
    const db = new RocksDB(dir)
    const value = Buffer.alloc(1024).fill(7)
    return {
      close: () => db.close(),
      get: (key) => db.get(`${key}`),
      async writeBatch(from, count) {
        const tx = db.write()
        for (let i = 0; i < count; i++) {
          tx.tryPut(`${from + i}`, value)
        }
        await tx.flush()
        await tx.destroy()
      }
    }
  }

  throw new Error(`Unknown dbType: ${dbType}`)
}

async function writePhase(db, ms, report) {
  const start = Date.now()
  const deadline = start + ms
  let count = 0
  while (Date.now() < deadline) {
    await db.writeBatch(count, BATCH)
    count += BATCH
    report(count)
  }
  return { count, elapsed: Date.now() - start }
}

async function readPhase(db, records, ms, report) {
  const start = Date.now()
  const deadline = start + ms
  let count = 0
  while (Date.now() < deadline) {
    for (let i = 0; i < READS_PER_TICK; i++) {
      const found = await db.get(Math.floor(Math.random() * records))
      if (!found) throw new Error('Key missing right after writing it')
      count++
    }
    report(count)
  }
  return { count, elapsed: Date.now() - start }
}

// Two timed phases against a throwaway database: write for as long as the clock
// allows, then random-read what landed. The record count is a result, not an
// input - which is what keeps the wait bounded.
export default async function bench({ dbType, dir, seconds, onProgress }) {
  const ms = seconds * 1000
  const report = (phase) => (count) => onProgress({ dbType, phase, count })
  const db = driver(dbType, dir)

  try {
    const write = await writePhase(db, ms, report('write'))
    const read = await readPhase(db, write.count, ms, report('read'))

    // Rates come from the time actually spent, not the budget: a phase always
    // overshoots its deadline by whatever the last batch took.
    return {
      dbType,
      records: write.count,
      writeRate: Math.round(write.count / (write.elapsed / 1000)),
      readRate: Math.round(read.count / (read.elapsed / 1000)),
      writeMs: write.elapsed,
      readMs: read.elapsed
    }
  } finally {
    await db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
