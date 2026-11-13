// A LoRa radio as a dead drop for one hypercore key.
//
// Walk up to a radio. Either it already holds a key - clone the core over the
// DHT and read it - or it is empty, and you put yours in. The key lives in a
// channel slot in the radio's flash, so it is still there an hour later, and
// the radio hands it to every phone that connects without being asked.
//
// Why a channel slot: ChannelSettings.psk is capped at 32 bytes, which is
// exactly the size of a hypercore key, and the 12-byte name beside it is room
// enough for a label. The radio carries what to fetch; the DHT carries the
// bytes.

const FramedStream = require('framed-stream')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const z32 = require('z32')
const b4a = require('b4a')
const meshtastic = require('./meshtastic')
const { scan, connect, destroy } = require('./meshtastic/radio')

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
let radio = null
let peers = 0
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

// What the radio is holding, if anything.
function held() {
  const channel = radio && radio.channels.get(SLOT)
  if (!channel || channel.name !== LABEL) return null
  if (!channel.psk || channel.psk.length !== meshtastic.CHANNEL_PSK_SIZE) return null

  return z32.encode(channel.psk)
}

// Every admin write must echo the passkey from a read, so a read comes first.
function passkey() {
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

// Put our own core in an empty radio.
async function adopt(text) {
  await network()

  const core = store.get({ name: 'beacon' })
  await core.ready()
  await core.append(Buffer.from(text))

  // Serve it before writing the key anywhere: a key that reaches someone who
  // then finds nobody holding the core is worse than writing a moment later.
  const discovery = swarm.join(core.discoveryKey, { server: true, client: false })
  await discovery.flushed()
  dbg('serving', core.length, 'blocks on the dht')

  // Serving outlives the radio connection on purpose: let go of the radio so
  // the next person can reach it, and this phone keeps handing out the bytes.
  // Only leaving the tab stops it.
  serving = core.length
  send({ type: 'serving', blocks: serving })

  send({ type: 'status', state: 'writing' })
  const key = await passkey()
  radio.setChannel(SLOT, { name: LABEL, psk: core.key }, key)

  // The radio echoes the slot back once it has stored it, which is the only
  // honest confirmation that the write survived.
  await confirm(z32.encode(core.key))

  send({ type: 'owned', key: z32.encode(core.key), blocks: core.length })
  send({ type: 'status', state: 'owned' })
}

function confirm(expected) {
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

// Read what the radio is holding: fetch the core that key names.
async function read(key) {
  await network()

  const core = store.get({ key: b4a.from(z32.decode(key)) })
  await core.ready()

  send({ type: 'status', state: 'cloning' })
  dbg('cloning', key)

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

  send({ type: 'read', key, blocks })
  send({ type: 'status', state: 'read' })
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

// Back to idle means the radio is genuinely let go, so it starts advertising
// again and the next scan can see it.
function reset() {
  if (radio) radio.destroy()
  radio = null
  destroy()
  send({ type: 'status', state: 'idle' })
  if (serving !== null) send({ type: 'serving', blocks: serving })
}

// Look, and report every radio in range rather than grabbing the first one -
// a room can hold several, and which one you walk up to is the whole point.
function look() {
  if (radio) return

  send({ type: 'status', state: 'scanning' })
  scan({
    log: dbg,
    onDiscover: (seen) => send({ type: 'discovered', ...seen }),
    onError: (err) => {
      send({ type: 'error', message: err.message })
      reset()
    }
  })
}

async function open(id) {
  if (radio) return

  send({ type: 'status', state: 'connecting' })
  radio = await connect(id, {
    log: dbg,
    onPairing: () => send({ type: 'status', state: 'pairing' })
  })
  send({ type: 'connected', name: radio.name })

  // By the time the node database has finished streaming in, every channel
  // slot is already here - so the radio has answered the only question that
  // matters, and the choice of what to do about it is the caller's.
  radio.on('ready', () => {
    const key = held()
    send({ type: 'radio', id: radio.id, key })
    send({ type: 'status', state: key ? 'holding' : 'empty' })
  })

  radio.on('disconnect', reset)

  radio.on('error', (err) => {
    send({ type: 'error', message: err.message })
    if (err.code === 'DISCONNECT' || err.code === 'CONNECTION_FAILED') reset()
  })

  send({ type: 'status', state: 'syncing' })
  radio.sync()
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

  if (msg.type === 'scan') {
    look()
    return
  }

  if (msg.type === 'open') {
    open(msg.id).catch((err) => {
      reset()
      send({ type: 'error', message: err.message })
    })
    return
  }

  if (!radio) return send({ type: 'error', message: 'not connected' })

  if (msg.type === 'read') {
    const key = held()
    if (!key) return send({ type: 'error', message: 'this radio holds nothing' })

    read(key).catch((err) => {
      send({ type: 'error', message: err.message })
      send({ type: 'status', state: 'holding' })
    })
    return
  }

  if (msg.type === 'adopt') {
    adopt(msg.text).catch((err) => {
      send({ type: 'error', message: err.message })
      send({ type: 'status', state: held() ? 'holding' : 'empty' })
    })
    return
  }

  if (msg.type === 'disconnect') {
    reset()
  }
})

Bare.on('exit', () => {
  console.log('[beacon] === Bare exit: runtime teardown starting ===')

  if (radio) radio.destroy()
  destroy()
  if (swarm) swarm.destroy()
})
