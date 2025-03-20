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
  console.log('BARELY: ', message)
  const payload = JSON.parse(message)
  if (payload.workType === 'intensive') {
    console.log('BARELY INTENSIVE')
    for (let i = 0; i < payload.recordsAmount; i++) {
      await local.insert('@hyperdb-example/user', {
        id: i + 1,
        name: `data-${i + 1}`
      })
      await local.flush() // Persist changes
      id++
    }
  } else {
    for (let i = 0; i < payload.recordsAmount; i++) {
      await local.insert('@hyperdb-example/user', {
        id: i + 1,
        name: `data-${i + 1}`
      })
      id++
    }
    console.log('BARELY INSERTTED')
    await local.flush() // Flush only once after writing all the records
    console.log('BARELY FLUSHED')
  }
  let result = await local.find(
    '@hyperdb-example/user',
    { reverse: true },
    { limit: 1 }
  ) // list only one due to limit
  result = await result.toArray()
  console.log('BARELY RESULT: ', result)
  await local.close() // close the db
  console.log('BARELY CLOSED')
  console.log('BARELY: ', result)
  BareKit.IPC.write(JSON.stringify(result))
})

console.log('Hyperdb setup complete')

//run and debug in console
