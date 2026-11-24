// A LoRa radio as a dead drop for one hypercore key.
//
// The key lives in a channel slot in the radio's flash: ChannelSettings.psk is
// capped at 32 bytes, exactly the size of a hypercore key, and every phone that
// connects is handed the slots without asking.
//
// A radio takes one BLE client at a time, so nothing here waits for the user
// while connected. Reading and appending never touch it at all.

const FramedStream = require('framed-stream')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const z32 = require('z32')
const b4a = require('b4a')
const meshtastic = require('bare-meshtastic')
const { scan, connect, destroy } = require('./radio')

const SLOT = 1
const LABEL = 'beacon'

// The passkey from a read expires after 300 seconds.
const ADMIN_TIMEOUT = 10000

const CLONE_TIMEOUT = 30000

let DEBUG = Bare.argv[1] === 'true'

function dbg(...args) {
  if (DEBUG) console.log('[beacon]', ...args)
}

let storagePath = Bare.argv[0]
if (storagePath.includes('file://')) storagePath = storagePath.replace('file://', '')

Bare.on('uncaughtException', (err) => {
  console.log('[beacon] !!! uncaughtException:', (err && err.stack) || err)
})

console.log('[beacon] worklet: starting, platform=' + Bare.platform)

const ipc = new FramedStream(BareKit.IPC)

function send(msg) {
  ipc.write(Buffer.from(JSON.stringify(msg)))
}

let store = null
let swarm = null
let peers = 0

let target = null
let slot = null
let serving = null

// Never at module load: a worklet entry runs before the runtime is up, and
// native work there dies without a stack.
async function network() {
  if (swarm) return swarm

  store = new Corestore(storagePath + '/beacon')
  swarm = new Hyperswarm()

  swarm.on('connection', (socket, info) => {
    peers++
    dbg('peer connected', z32.encode(info.publicKey).slice(0, 8), 'total', peers)
    send({ type: 'peers', peers })
    socket.on('close', () => send({ type: 'peers', peers: --peers }))
    store.replicate(socket)
  })

  swarm.on('error', (err) => send({ type: 'error', message: 'swarm: ' + err.message }))

  // A lookup before this resolves against an empty routing table: zero peers, no error.
  await swarm.dht.ready()
  dbg('network up, dht bootstrapped=' + swarm.dht.bootstrapped)

  return swarm
}

async function withRadio(id, errand) {
  let radio = null

  try {
    radio = await connect(id, {
      log: dbg,
      onPairing: () => send({ type: 'busy', what: 'pairing' })
    })

    await new Promise((resolve, reject) => {
      radio.once('ready', resolve)
      radio.once('error', reject)
      radio.sync()
    })

    return await errand(radio)
  } finally {
    if (radio) radio.destroy()
    destroy()
  }
}

function readSlot(radio) {
  const channel = radio.channels.get(SLOT)
  if (!channel || channel.name !== LABEL) return null
  if (!channel.psk || channel.psk.length !== meshtastic.CHANNEL_PSK_SIZE) return null

  return z32.encode(channel.psk)
}

// Every admin write must echo the passkey from a read.
function passkey(radio) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      radio.off('admin', onadmin)
      reject(new Error('the radio did not answer an admin read - is it ours to write to?'))
    }, ADMIN_TIMEOUT)

    function onadmin(admin) {
      if (!admin.passkey) return

      clearTimeout(timer)
      radio.off('admin', onadmin)
      resolve(admin.passkey)
    }

    radio.on('admin', onadmin)
    radio.getChannel(SLOT)
  })
}

// The echo is the only confirmation that a write survived.
function confirm(radio, expected) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      radio.off('admin', onadmin)
      reject(new Error('the radio did not keep the key in slot ' + SLOT))
    }, ADMIN_TIMEOUT)

    function onadmin(admin) {
      if (!admin.channel || admin.channel.index !== SLOT) return
      if (!admin.channel.psk || z32.encode(admin.channel.psk) !== expected) return

      clearTimeout(timer)
      radio.off('admin', onadmin)
      resolve()
    }

    radio.on('admin', onadmin)
    radio.getChannel(SLOT)
  })
}

// Corestore kept the keypair, so reopening our own key is still writable.
async function look(id) {
  target = id

  const key = await withRadio(id, (radio) => {
    send({ type: 'connected', name: radio.name })
    return readSlot(radio)
  })

  if (!key) {
    slot = null
    return send({ type: 'slot', slot: null })
  }

  await network()
  const core = store.get({ key: b4a.from(z32.decode(key)) })
  await core.ready()

  slot = { key, mine: core.writable, blocks: core.length }
  dbg('slot holds', key.slice(0, 8), core.writable ? '(ours)' : '(theirs)')
  send({ type: 'slot', slot })

  if (core.writable) await serve(core)
}

async function read() {
  if (!slot) throw new Error('this radio holds nothing')

  await network()
  const core = store.get({ key: b4a.from(z32.decode(slot.key)) })
  await core.ready()

  // update() only blocks while something is still looking for peers.
  const done = core.findingPeers()
  swarm.join(core.discoveryKey, { server: false, client: true })
  swarm.flush().then(done, done)

  await core.update()
  dbg('update done, length', core.length, 'peers', peers)

  if (core.length === 0) await waitForBlocks(core)

  const blocks = []
  for (let i = 0; i < core.length; i++) {
    blocks.push(Buffer.from(await core.get(i)).toString())
  }

  slot = { ...slot, blocks: core.length }
  send({ type: 'blocks', blocks })
  send({ type: 'slot', slot })
}

async function append(text) {
  if (!slot) throw new Error('this radio holds nothing')
  if (!slot.mine) throw new Error('that core was written by someone else')

  await network()
  const core = store.get({ key: b4a.from(z32.decode(slot.key)) })
  await core.ready()
  await core.append(Buffer.from(text))
  await serve(core)

  slot = { ...slot, blocks: core.length }
  send({ type: 'slot', slot })
}

async function replace(text) {
  if (!target) throw new Error('no radio')

  await network()
  const core = store.get({ name: 'beacon-' + Date.now() })
  await core.ready()
  await core.append(Buffer.from(text))

  await serve(core)

  const key = z32.encode(core.key)
  await withRadio(target, async (radio) => {
    send({ type: 'busy', what: 'writing' })
    radio.setChannel(SLOT, { name: LABEL, psk: core.key }, await passkey(radio))
    await confirm(radio, key)
  })

  slot = { key, mine: true, blocks: core.length }
  send({ type: 'slot', slot })
}

async function serve(core) {
  // flushed() means the DHT can route to us; swarm.flush() answers something else.
  const discovery = swarm.join(core.discoveryKey, { server: true, client: false })
  await discovery.flushed()
  dbg('serving', core.length, 'blocks on the dht')

  serving = core.length
  send({ type: 'serving', blocks: serving })
}

function waitForBlocks(core) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      core.off('append', onappend)
      reject(new Error('nobody on the DHT is serving that core - is the publisher still running?'))
    }, CLONE_TIMEOUT)

    function onappend() {
      clearTimeout(timer)
      core.off('append', onappend)
      resolve()
    }

    core.on('append', onappend)
  })
}

function lookAround() {
  target = null
  slot = null

  send({ type: 'radios', radios: [] })
  scan({
    log: dbg,
    onDiscover: (seen) => send({ type: 'discovered', ...seen }),
    onError: (err) => send({ type: 'error', message: err.message })
  })
}

let running = false

function run(what, errand) {
  if (running) return send({ type: 'error', message: 'already busy' })

  running = true
  send({ type: 'busy', what })

  errand()
    .catch((err) => send({ type: 'error', message: err.message }))
    .finally(() => {
      running = false
      send({ type: 'busy', what: null })
    })
}

ipc.on('data', (data) => {
  let msg

  try {
    msg = JSON.parse(data.toString())
  } catch (err) {
    return send({ type: 'error', message: 'IPC parse error: ' + err.message })
  }

  dbg('IPC <-', msg.type)

  if (msg.type === 'setLogsEnabled') {
    DEBUG = msg.enabled
    return
  }

  if (msg.type === 'scan') return lookAround()
  if (msg.type === 'look') return run('looking', () => look(msg.id))
  if (msg.type === 'read') return run('reading', () => read())
  if (msg.type === 'append') return run('writing', () => append(msg.text))
  if (msg.type === 'replace') return run('writing', () => replace(msg.text))
})

Bare.on('exit', () => {
  console.log('[beacon] === Bare exit: runtime teardown starting ===')

  destroy()
  if (swarm) swarm.destroy()
})
