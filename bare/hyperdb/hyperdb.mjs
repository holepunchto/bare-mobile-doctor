import HyperDB from 'hyperdb'
import Corestore from 'corestore'
import db from './spec/db/index.js'
import b4a from 'b4a'
import top from 'process-top'

let logsEnabled = Bare.argv[1] === 'true'

function log(...args) {
  if (logsEnabled) console.log(...args)
}

log('Hyperdb Worklet started')

function time() {
  return Math.floor(Date.now() / 1000)
}

const processTop = new top()

function cpu() {
  const message = JSON.stringify(processTop.toString())
  BareKit.IPC.write(b4a.from(message))
}

let path = Bare.argv[0]
if (path.includes('file://')) {
  path = path.replace('file://', '')
}

async function intensive(records) {
  const local = HyperDB.rocks(path + `/${time()}/`, db)
  let id = 0

  for (let i = 0; i < records; i++) {
    await local.insert('@hyperdb-example/user', {
      id: i + 1,
      name: `data-${i + 1}-${time()}`
    })
    await local.flush() // Persist changes
    id++
  }

  let result = await local.find('@hyperdb-example/user', { reverse: true }, { limit: 1 }) // list only one due to limit
  result = await result.toArray()

  BareKit.IPC.write(JSON.stringify(result[0]))

  await local.close() // close the db
}

async function localBee(records) {
  const localCorestore = new Corestore(path + `/${time()}/local.db`)
  let id = 0

  const a = localCorestore.get({ name: 'local' })

  const local = HyperDB.bee(a, db, { autoUpdate: true })
  await local.ready()

  for (let i = 0; i < records; i++) {
    await local.insert('@hyperdb-example/user', {
      id: i + 1,
      name: `data-${i + 1}-${time()}`
    })
    await local.flush() // Persist changes
    id++
  }

  let result = await local.find('@hyperdb-example/user', { reverse: true }, { limit: 1 })
  result = await result.toArray()

  if (result[0].id === records) {
    BareKit.IPC.write(JSON.stringify(result[0]))
    await localCorestore.close()
  }
}

async function basic(records) {
  let id = 0
  const local = HyperDB.rocks(path + `/${time()}/`, db)

  for (let i = 0; i < records; i++) {
    await local.insert('@hyperdb-example/user', {
      id: i + 1,
      name: `data-${i + 1}-${time()}`
    })
    id++
  }

  await local.flush() // Flush only once after writing all the records

  let result = await local.find('@hyperdb-example/user', { reverse: true }, { limit: 1 })
  result = await result.toArray()

  BareKit.IPC.write(JSON.stringify(result[0]))

  await local.close()
}

BareKit.IPC.on('data', async (data) => {
  const message = data.toString()
  const payload = JSON.parse(message)

  if (payload.type === 'setLogsEnabled') {
    logsEnabled = payload.enabled
    return
  }

  if (payload.workType === 'intensive') {
    await intensive(payload.recordsAmount)
  } else if (payload.workType === 'bee-local') {
    await localBee(payload.recordsAmount)
  } else if (payload.workType === 'basic') {
    await basic(payload.recordsAmount)
  } else if (payload.workType === 'cpu') {
    cpu()
  }
})
