import Hypercore from 'hypercore'
import fs from 'bare-fs'
import top from 'process-top'
import RPC from 'bare-rpc'
import { RPC_CPU, RPC_WRITE, RPC_READ } from './commands.mjs'

const { IPC } = BareKit

console.log('Hypercore Worklet started')

let path = Bare.argv[0]
if (path.includes('file://')) {
  path = path.replace('file://', '')
}

function time() {
  return Math.floor(Date.now() / 1000)
}

const processTop = new top()


const rpc = new RPC(IPC, async (req) => {
    console.log("BARELY 1111")
    try {
        switch (req.command) {
            case RPC_CPU:
                console.log("BARELY CPU 1")
                cpu(req)
                break;
            case RPC_WRITE:
                await write(req)
                break;
            case RPC_READ:
                await read(req)

        }
    } catch (e) {
        console.log("Doctor error: ", e)
    }
})

function cpu(req) {
    console.log("BARELY CPUUU")
    req.reply(JSON.stringify(processTop.toString()))
}


async function write(req) {

  const payload = JSON.parse(req.data).recordsAmount
    const records = payload.recordsAmount


  const core = new Hypercore(path + `/${time()}`)
  await core.ready()

  let i = 1
  do {
    await core.append(Buffer.from(`${i}`))
    i++
  } while (i !== records + 1)

  const block = await core.get(core.length - 1)
  req.reply(JSON.stringify([{ records: block.toString() }]))

  await core.close()
}

async function read(req) {
    const payload = JSON.parse(req.data).recordsAmount
    const records = payload.recordsAmount

    let core
  console.log("BARELY 1")
  if (fs.existsSync(path + '/readtest')) {
    console.log("BARELY 2")
    const core = new Hypercore(path + '/readtest')
      console.log("BARELY 3")
    await core.ready()
      console.log("BARELY 4")
    let i = 0
    for (i = 0; i < records; i++) {
      const randomBlock = Math.floor(Math.random() * 999999)
      const block = await core.get(randomBlock)
    }
      console.log("BARELY 5:  ",i)
        req.reply(JSON.stringify([{ records: i }]))
      console.log("BARELY 6")
    await core.close()
      console.log("BARELY 7")
  } else {
    core = new Hypercore(path + '/readtest')
    await core.ready()

    let i = 1
    do {
      await core.append(Buffer.from(`${time()}`))
      i++
    } while (i !== 1000000)

    const block = await core.get(core.length - 1)
    req.reply(JSON.stringify([{ records: block.toString() }]))

    await core.close()
  }
}

