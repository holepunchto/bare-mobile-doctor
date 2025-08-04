const RocksDB = require('rocksdb-native')
const tmp = require('test-tmp')

const { IPC } = BareKit

IPC.on('data', (data) => {
  const { payload } = JSON.parse(data)

  rocksDbTest(payload)
    .then((response) => IPC.write(result(response.toString())))
    .catch((e) => IPC.write(result(null, e.message)))
})

async function rocksDbTest(payload) {
  let db

  try {
    db = new RocksDB(await tmp())
    await db.ready()

    {
      const batch = db.write()
      const p = batch.put('default', payload)
      await batch.flush()
      batch.destroy()

      await p
    }
    {
      const batch = db.read()
      const p = batch.get('default')
      await batch.flush()
      batch.destroy()

      return await p
    }
  } catch (e) {
    throw e
  } finally {
    db && (await db.close())
  }
}

function result(response, message = null) {
  return Buffer.from(JSON.stringify({ response, message }) + '\n')
}
