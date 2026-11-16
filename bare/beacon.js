// A LoRa radio as a dead drop for one hypercore key.
//
// Walk up to a radio. Either it already holds a key - clone the core over the
// DHT and read it - or it is empty, and you put one there. The key lives in a
// channel slot in the radio's flash, so it is still there an hour later, and
// the radio hands it to every phone that connects without being asked.
//
// Why a channel slot: ChannelSettings.psk is capped at 32 bytes, which is
// exactly the size of a hypercore key, and the 12-byte name beside it is room
// enough for a label.
//
// Every operation holds the radio for as long as it needs and not a moment
// longer. A Meshtastic radio takes one BLE client at a time, so a phone that
// stays connected makes the radio invisible to everyone else - which is why
// nothing here waits for the user while connected. Reading and appending do
// not touch the radio at all: it only ever carries the key, never the bytes.

const FramedStream = require('framed-stream')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const z32 = require('z32')
const b4a = require('b4a')
const meshtastic = require('./meshtastic')
const { scan, connect, destroy } = require('./radio')

// Slot 0 is the primary channel the radio actually talks on. Never touch it.
const SLOT = 1
const LABEL = 'beacon'

// A write has to echo the passkey from a read, and the radio has 300 seconds
// to answer before that pairing is meaningless.
const ADMIN_TIMEOUT = 10000

// How long to give the DHT before admitting the core never showed up.
const CLONE_TIMEOUT = 30000

let DEBUG = Bare.argv[1] === 'true'

function dbg(...args) {
  if (DEBUG) console.log('[beacon]', ...args)
}

let storagePath = Bare.argv[0]
if (storagePath.includes('file://')) storagePath = storagePath.replace('file://', '')

// An unhandled throw tears the runtime down. Registered before anything else
// runs, so a failure on the way up is readable instead of silent.
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

// The radio we last looked at, and what it was holding. Both outlive the BLE
// connection, which is gone by the time the user picks an action.
let target = null
let slot = null
let serving = null

// Corestore and the DHT are built on first use, never at module load: a
// worklet entry runs before the runtime is fully up, and native work there
// dies without a stack.
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

  // Bootstrapping takes seconds, and a lookup issued before it finishes
  // resolves against an empty routing table: zero peers, no error.
  await swarm.dht.ready()
  dbg('network up, dht bootstrapped=' + swarm.dht.bootstrapped)

  return swarm
}

// Hold the radio for exactly one errand, then let go however it ends.
async function withRadio(id, errand) {
  let radio = null

  try {
    send({ type: 'holding', held: true })
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
    send({ type: 'holding', held: false })
  }
}

// What a radio is holding, read straight off the channel slots it streamed in.
function readSlot(radio) {
  const channel = radio.channels.get(SLOT)
  if (!channel || channel.name !== LABEL) return null
  if (!channel.psk || channel.psk.length !== meshtastic.CHANNEL_PSK_SIZE) return null

  return z32.encode(channel.psk)
}

// Every admin write must echo the passkey from a read, so a read comes first.
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

// The radio echoes the slot back once it has stored it, which is the only
// honest confirmation that a write survived.
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

// Connect, see what the radio holds, let go. Whether the core is ours is a
// question corestore answers for free: it kept the keypair, so reopening our
// own key hands back a writable session even after a restart.
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

  // Our own core goes back on the air the moment we see it again. Without
  // this, a restart leaves the radio pointing at a core nobody serves until
  // its owner happens to write something.
  if (core.writable) await serve(core)
}

// Fetch the core the radio named. The radio is not involved.
async function read() {
  if (!slot) throw new Error('this radio holds nothing')

  await network()
  const core = store.get({ key: b4a.from(z32.decode(slot.key)) })
  await core.ready()

  // `update` only blocks while something is still looking for peers. Opening
  // that hook before joining is what makes the await below wait for a real
  // answer instead of returning against an empty peer list.
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

// Append to the core already on the radio. Only possible when it is ours, and
// the key does not change - so the radio is not touched.
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

// Put a brand new core on the radio. A fresh name means a fresh key, so this
// really does replace rather than quietly append to the same old core.
async function replace(text) {
  if (!target) throw new Error('no radio')

  await network()
  const core = store.get({ name: 'beacon-' + Date.now() })
  await core.ready()
  await core.append(Buffer.from(text))

  // Serve it before writing the key anywhere: a key that reaches someone who
  // then finds nobody holding the core is worse than writing a moment later.
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

// Look, and report every radio in range rather than grabbing the first one -
// a room can hold several, and which one you walk up to is the whole point.
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

// One errand at a time, and every failure lands in the same place.
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
