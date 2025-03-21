import HyperDB from 'hyperdb'
import db from './spec/db/index.js'

console.log('Hyperdb Worklet started')
const path =
  Bare.argv[0] === 'android'
    ? '/data/data/to.holepunch.bare.doctor/bare-mobile-doctor'
    : './tmp/bare-mobile-doctor'

BareKit.IPC.on('data', async (data) => {
  const local = HyperDB.rocks(path, db)
  let id = 0

  const message = data.toString()
  const payload = JSON.parse(message)
  if (payload.workType === 'intensive') {
    for (let i = 0; i < payload.recordsAmount; i++) {
      const timestamp = Math.floor(Date.now() / 1000)
      await local.insert('@hyperdb-example/user', {
        id: i + 1,
        name: `data-${i + 1}-${timestamp}`
      })
      await local.flush() // Persist changes
      id++
    }
  } else {
    for (let i = 0; i < payload.recordsAmount; i++) {
      const timestamp = Math.floor(Date.now() / 1000)
      await local.insert('@hyperdb-example/user', {
        id: i + 1,
        name: `data-${i + 1}-${timestamp}`
      })
      id++
    }
    await local.flush() // Flush only once after writing all the records
  }
  let result = await local.find(
    '@hyperdb-example/user',
    { reverse: true },
    { limit: 1 }
  ) // list only one due to limit
  result = await result.toArray()
  await local.close() // close the db
  BareKit.IPC.write(JSON.stringify(result))
})


//run and debug in console
