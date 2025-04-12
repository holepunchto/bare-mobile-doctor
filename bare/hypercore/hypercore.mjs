import Hypercore from 'hypercore'
import fs from 'bare-fs'
import top from 'process-top'

console.log('Hypercore Worklet started')

let path = Bare.argv[0]
if (path.includes('file://')) {
  path = path.replace('file://', '')
}

function time() {
  return Math.floor(Date.now() / 1000)
}

const processTop = new top()

function cpu() {
  BareKit.IPC.write(JSON.stringify(processTop.toString()))
}

async function write(records) {
  const core = new Hypercore(path + `/${time()}`)
  await core.ready()

  let i = 1
  do {
    await core.append(Buffer.from(`${i}`))
    i++
  } while (i !== records + 1)

  const block = await core.get(core.length - 1)
  BareKit.IPC.write(JSON.stringify([{ records: block.toString() }]))

  await core.close()
}

async function read(records) {
  let core
  if (fs.existsSync(path + '/readtest')) {
    const core = new Hypercore(path + '/readtest')
    await core.ready()
    let i = 0
    for (i = 0; i < records; i++) {
      const randomBlock = Math.floor(Math.random() * 999999)
      const block = await core.get(randomBlock)
    }
    BareKit.IPC.write(JSON.stringify([{ records: i }]))
    await core.close()
  } else {
    core = new Hypercore(path + '/readtest')
    await core.ready()

    let i = 1
    do {
      await core.append(Buffer.from(`${time()}`))
      i++
    } while (i !== 1000000)

    const block = await core.get(core.length - 1)
    BareKit.IPC.write(JSON.stringify([{ records: block.toString() }]))

    await core.close()
  }
}

BareKit.IPC.on('data', async (data) => {
  const payload = JSON.parse(data.toString())

  if (payload.workType === 'cpu') {
    cpu()
  } else if (payload.workType === 'write') {
    await write(payload.recordsAmount)
  } else if (payload.workType === 'read') {
    await read(payload.recordsAmount)
  }
})
