import HyperDB from 'hyperdb'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import db from './spec/db/index.js'
import b4a from 'b4a'
import top from 'process-top'

console.log('Hyperdb Worklet started')

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

async function bee(records) {
  const bootstrapKey = b4a.from(
    '650ad31c618e7d18566477f417468931ad75d0a5cb90882244b6562f1c79cdb3',
    'hex'
  )
  const topic = b4a.from('e4a4fa547d3f715b41eedbbc0bbae5cd3940a5f15a709e1e5c2d2af6ed106835', 'hex')
  let closed = false

  const remoteCorestore = new Corestore(path + `/${time()}/remote.db`)

  const b = remoteCorestore.get({ key: bootstrapKey })

  const remote = HyperDB.bee(b, db, { autoUpdate: true })
  await remote.ready()

  const remoteSwarm = new Hyperswarm()
  remoteSwarm.on('connection', async (conn) => {
    remoteCorestore.replicate(conn)
  })

  const swarm2 = remoteSwarm.join(topic)

  // Watch for db updates
  async function remoteOnChange() {
    for (let x = 0; x <= records; x++) {
      let result
      if (!closed) {
        result = await remote.get('@hyperdb-example/user', { id: x })
      }
      if (result && result.id === records) {
        remote.unwatch(remoteOnChange)

        BareKit.IPC.write(b4a.from(JSON.stringify(result)))

        await swarm2.destroy()
        await remote.close()
        closed = true
      }
    }
  }

  remote.watch(remoteOnChange)
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

  if (payload.workType === 'intensive') {
    await intensive(payload.recordsAmount)
  } else if (payload.workType === 'bee') {
    await bee(payload.recordsAmount)
  } else if (payload.workType === 'bee-local') {
    await localBee(payload.recordsAmount)
  } else if (payload.workType === 'basic') {
    await basic(payload.recordsAmount)
  } else if (payload.workType === 'cpu') {
    cpu()
  }
})
