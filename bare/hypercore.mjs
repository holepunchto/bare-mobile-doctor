import Hypercore from 'hypercore'

console.log('Hypercore Worklet started')

function time() {
  return Math.floor(Date.now() / 1000)
}

let path = Bare.argv[0]
if (path.includes('file://')) {
  path = path.replace('file://', '')
}

BareKit.IPC.on('data', async (data) => {
  const core = new Hypercore(path + `/${time()}`)
  await core.ready()

  const message = data.toString()
  const payload = JSON.parse(message)

  let i = 1

  do {
    await core.append(Buffer.from(`${i}`))
    i++
  } while (i !== payload.recordsAmount + 1)

  const block = await core.get(core.length - 1)
  BareKit.IPC.write(JSON.stringify({ records: block.toString() }))

  await core.close()
})
