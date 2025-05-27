import Hypercore from 'hypercore'
import fs from 'bare-fs'
import top from 'process-top'
import RPC from 'bare-rpc'
import b4a from 'b4a'
import { RPC_CPU, RPC_WRITE, RPC_READ, RPC_INIT } from './commands.mjs'

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

function cpu(req) {
  req.reply(JSON.stringify(processTop.toString()))
}

async function write(req) {
  const records = Number(b4a.toString(req.data))
  const core = new Hypercore(path + `/${time()}`)
  await core.ready()
  let i = 1
  do {
    await core.append(Buffer.from(`${i}`))
    i++
  } while (i !== records + 1)

  const block = await core.get(core.length - 1)

  await core.close()

  req.reply(block.toString())
}

async function read(req) {
  const records = Number(b4a.toString(req.data))
  const coreDir = path + '/init'
  const core = new Hypercore(coreDir)
  await core.ready()
  let i = 0
  for (i = 0; i < records; i++) {
    const randomBlock = Math.floor(Math.random() * 999999)
    const block = await core.get(randomBlock)
  }
  req.reply(`${i}`)
  await core.close()
}

async function init(req) {
  const coreDir = path + '/init'
  const records = 1000000
  if (fs.existsSync(coreDir)) {
    try {
      const core = new Hypercore(coreDir)
      await core.ready()
      if (core.length === records) {
        await core.close()
        req.reply(`${core.length}`)
        return
      } else {
        await core.close()
        fs.rmSync(coreDir, { recursive: true, force: true })
      }
    } catch (e) {
      fs.rmSync(coreDir, { recursive: true, force: true })
    }
  }
  const core = new Hypercore(coreDir)
  await core.ready()
  let i = 1
  do {
    await core.append(Buffer.from(`${i}`))
    i++
  } while (i !== records + 1)
  const block = await core.get(core.length - 1)
  await core.close()
  req.reply(block.toString())
}

const rpc = new RPC(IPC, async (req) => {
  try {
    switch (req.command) {
      case RPC_CPU:
        cpu(req)
        break
      case RPC_WRITE:
        await write(req)
        break
      case RPC_READ:
        await read(req)
        break
      case RPC_INIT:
        await init(req)
        break
    }
  } catch (e) {
    console.log('Bare error: ', e)
  }
})
