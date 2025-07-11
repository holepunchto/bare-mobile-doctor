const RocksDB = require('rocksdb-native')
const tmp = require('test-tmp')
const assert = require('bare-assert')

const { IPC } = BareKit

IPC.on('data', () => {
  rocksDbTest()
    .then(() => IPC.write(result(true)))
    .catch((e) => IPC.write(result(false, e.message)))
})

async function rocksDbTest() {
  let db

  try {
    db = new RocksDB(await tmp())
    await db.ready()

    {
      const batch = db.write()
      const p = batch.put('hello', 'world')
      await batch.flush()
      batch.destroy()

      await p
    }
    {
      const batch = db.read()
      const p = batch.get('hello')
      await batch.flush()
      batch.destroy()

      assert((await p).equals(Buffer.from('world')))
      return true
    }
  } catch (e) {
    throw e
  } finally {
    db && (await db.close())
  }
}

function result(hasSucceeded, message = null) {
  return Buffer.from(JSON.stringify({ hasSucceeded, message }) + '\n')
}
