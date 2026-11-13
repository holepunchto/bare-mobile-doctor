// A Meshtastic radio reached over BLE. Scan, connect, then exchange text
// messages with the mesh - the codec next door turns them into bytes.
//
//   const radio = await connect()
//   radio.on('message', (m) => console.log(m.name, m.text))
//   radio.send('hello')

const EventEmitter = require('events')
const { Central } = require('bare-bluetooth')
const meshtastic = require('./index')

const isAndroid = Bare.platform === 'android'
const scanOptions = isAndroid ? { scanMode: Central.SCAN_MODE_LOW_LATENCY } : undefined

// A FromRadio frame can reach 512 bytes, so ask for an ATT MTU that fits one
// in a single read. Android is the only platform that lets us ask; iOS and
// BlueZ negotiate their own and treat this as a no-op.
const MTU = 512

// CoreBluetooth starts pairing the moment an encrypted characteristic is
// touched and fails that first attempt with "Encryption is insufficient",
// while the user is still reading the PIN off the radio's screen. Retrying is
// the way through: once the bond lands, the same subscribe succeeds. Android
// bonds before it lets any GATT operation through, so it never takes this path.
const PAIRING_RETRIES = 10
const PAIRING_RETRY_DELAY = 3000

// Android fails a connect with GATT error 133 when it is issued while a scan
// is still winding down. Let the radio go quiet first.
const CONNECT_DELAY = 500

// The node database arrives as one frame per known node. If configComplete
// never closes it, say so rather than sitting on "syncing" forever.
const SYNC_TIMEOUT = 15000

function noop() {}

// A connected radio. Its whole interface is three characteristics: write a
// ToRadio frame to send, and whenever FromNum notifies, read FromRadio until
// it answers empty.
class Radio extends EventEmitter {
  constructor(central, peripheral, characteristics, log) {
    super()

    this._central = central
    this._peripheral = peripheral
    this._characteristics = characteristics
    this._log = log || noop
    this._reading = false
    this._queued = false
    this._configId = 0
    this._syncTimer = null

    this.nodeNum = 0
    this.nodes = new Map()
    this.lora = null
    this.channels = new Map()

    central.on('disconnect', () => this.emit('disconnect'))
    central.on('error', (err) => this.emit('error', err))
    peripheral.on('error', (err) => this.emit('error', err))

    peripheral.on('notify', (characteristic) => {
      if (!this._is(characteristic, meshtastic.FROM_NUM_UUID)) return
      this._read()
    })

    peripheral.on('read', (characteristic, data) => {
      if (!this._is(characteristic, meshtastic.FROM_RADIO_UUID)) return
      this._onframe(data)
    })
  }

  get name() {
    return this._peripheral.name
  }

  get id() {
    return meshtastic.nodeId(this.nodeNum)
  }

  // Meshtastic leaves the default primary channel unnamed and shows the modem
  // preset in its place.
  get channelName() {
    for (const channel of this.channels.values()) {
      if (channel.role === meshtastic.CHANNEL_PRIMARY && channel.name) return channel.name
    }

    return this.lora && this.lora.preset
  }

  // Ask for one channel slot. The reply carries the session passkey that any
  // following write has to echo, so a read always comes first.
  getChannel(index) {
    this._write(meshtastic.getChannel(index, this.nodeNum))
  }

  setChannel(index, settings, passkey) {
    this._write(meshtastic.setChannel(index, settings, passkey, this.nodeNum))
  }

  // Ask for the node database. Anything the radio queued while no client was
  // attached is drained by the same read loop.
  sync() {
    this._configId = (Math.random() * 0x100000000) >>> 0 || 1
    this._write(meshtastic.wantConfig(this._configId))
    this._syncTimer = setTimeout(() => {
      this._syncTimer = null
      this.emit('error', new Error('radio did not finish sending its node database'))
    }, SYNC_TIMEOUT)
    this._read()
  }

  send(text) {
    this._write(meshtastic.textMessage(text, { wantAck: true }))
  }

  // Letting go means actually dropping the BLE link. Destroying the central
  // alone is not enough: Apple keeps the connection alive behind it, and a
  // Meshtastic radio stays silent to everyone else for as long as one client
  // is attached - so a phone that merely navigated away makes the radio
  // invisible to the next person.
  destroy() {
    if (this._syncTimer) clearTimeout(this._syncTimer)
    this._syncTimer = null
    this._central.disconnect(this._peripheral)
  }

  nameOf(num) {
    const node = this.nodes.get(num)
    if (node && node.user && node.user.shortName) return node.user.shortName

    return meshtastic.nodeId(num)
  }

  _is(characteristic, uuid) {
    return characteristic.uuid.toLowerCase() === uuid
  }

  _write(frame) {
    this._peripheral.write(this._characteristics.toRadio, frame, true)
  }

  // FromRadio is a queue behind one characteristic, so only a single read can
  // be outstanding. A notify arriving mid-drain just flags another pass.
  _read() {
    if (this._reading) {
      this._queued = true
      return
    }

    this._reading = true
    this._peripheral.read(this._characteristics.fromRadio)
  }

  _onframe(data) {
    // An empty FromRadio read is how the radio says its queue is drained, and
    // Android surfaces a zero-length characteristic value as null.
    if (data === null || data.byteLength === 0) {
      this._reading = false

      if (this._queued) {
        this._queued = false
        this._read()
      }

      return
    }

    try {
      this._handle(meshtastic.decode(data))
    } catch (err) {
      this.emit('error', err)
    }

    this._peripheral.read(this._characteristics.fromRadio)
  }

  _handle(frame) {
    this._log('frame', frame.type || 'unknown')

    if (frame.type === 'myInfo') {
      this.nodeNum = frame.nodeNum
      return
    }

    if (frame.type === 'config') {
      this.lora = frame.lora
      return
    }

    if (frame.type === 'channel') {
      this.channels.set(frame.channel.index, frame.channel)
      return
    }

    if (frame.type === 'nodeInfo') {
      this.nodes.set(frame.node.num, frame.node)
      this.emit('node', frame.node)
      return
    }

    if (frame.type === 'configComplete') {
      if (frame.configId !== this._configId) return

      if (this._syncTimer) clearTimeout(this._syncTimer)
      this._syncTimer = null
      this.emit('ready')
      return
    }

    if (frame.type !== 'packet') return

    const packet = frame.packet

    // An encrypted packet has no decoded payload at all.
    if (!packet.data) return

    if (packet.data.portnum === meshtastic.PORT_ADMIN) {
      this.emit('admin', meshtastic.decodeAdmin(packet.data.payload))
      return
    }

    // Everything else (position, telemetry, routing acks) is not what this is
    // about.
    if (packet.data.portnum !== meshtastic.PORT_TEXT_MESSAGE) return

    // The radio echoes our own outgoing packet back to every attached client.
    // The caller already knows what it sent, so drop the echo.
    if (packet.from === this.nodeNum) return

    this.emit('message', {
      from: meshtastic.nodeId(packet.from),
      name: this.nameOf(packet.from),
      text: Buffer.from(packet.data.payload).toString(),
      snr: packet.snr,
      rssi: packet.rssi,
      hops: packet.hopStart ? packet.hopStart - packet.hopLimit : 0,
      direct: packet.to !== meshtastic.BROADCAST
    })
  }
}

// Only an unencrypted link is worth retrying; anything else is a real failure
// and must surface now rather than after half a minute of silence.
function isPairing(err) {
  if (!err) return false

  return /encryption|authentication|insufficient/i.test(
    (err.code || '') + ' ' + (err.message || '')
  )
}
// One central for the whole module, kept at module scope so teardown can stop
// it even if nothing was ever connected. `found` keeps the DiscoveredPeripheral
// objects alive, keyed by id, because connecting needs the object and the
// caller only ever sees a plain description of it.
let central = null
const found = new Map()

// Start looking for radios. `onDiscover` is called once per radio with
// { id, name, rssi } - once, even on Android, which re-reports the same
// peripheral ~20 times a second.
function scan({ onDiscover, onError, log = noop } = {}) {
  // Always start from nothing. A leftover central from an earlier scan or a
  // failed connect keeps its own scan and its own connections alive, and on
  // Apple a second manager alongside it simply stops reporting anything.
  destroy()

  central = new Central()

  central.on('stateChange', (state) => {
    log('ble state', state)

    if (state === 'poweredOn') {
      central.startScan([meshtastic.SERVICE_UUID], scanOptions)
    } else if (state === 'poweredOff' || state === 'unauthorized' || state === 'unsupported') {
      if (onError) onError(new Error('bluetooth ' + state))
    }
  })

  central.on('discover', (peripheral) => {
    if (found.has(peripheral.id)) return

    found.set(peripheral.id, peripheral)
    log('discovered', peripheral.name || peripheral.id)
    if (onDiscover) onDiscover({ id: peripheral.id, name: peripheral.name, rssi: peripheral.rssi })
  })

  central.on('error', (err) => {
    if (onError) onError(err)
  })
}

// Connect to one of the radios `scan` reported, and resolve once FromNum is
// notifying - at which point the radio can be talked to. `onPairing` fires
// once, when iOS asks the user for the radio's PIN.
function connect(id, { onPairing, log = noop } = {}) {
  return new Promise((resolve, reject) => {
    const peripheral = found.get(id)
    if (!peripheral) return reject(new Error('no radio with id ' + id))

    let radio = null
    let subscribe = null
    let retries = 0

    central.stopScan()

    // Both handlers come off again the moment this settles - a failed attempt
    // would otherwise leave them behind and the next one would see every
    // event twice.
    function cleanup() {
      central.off('connect', onconnect)
      central.off('error', onerror)
    }

    function settle(err, value) {
      cleanup()
      if (err) reject(err)
      else resolve(value)
    }

    const onerror = (err) => {
      if (!radio) settle(err)
    }

    const onconnect = (connected) => {
      connected.on('servicesDiscover', (services) => {
        const service = services.find((s) => s.uuid.toLowerCase() === meshtastic.SERVICE_UUID)
        if (!service) return settle(new Error('meshtastic service not found'))

        connected.discoverCharacteristics(service)
      })

      connected.on('characteristicsDiscover', (service, characteristics) => {
        const find = (uuid) => characteristics.find((c) => c.uuid.toLowerCase() === uuid)

        const wanted = {
          toRadio: find(meshtastic.TO_RADIO_UUID),
          fromRadio: find(meshtastic.FROM_RADIO_UUID),
          fromNum: find(meshtastic.FROM_NUM_UUID)
        }

        for (const name of Object.keys(wanted)) {
          if (!wanted[name]) return settle(new Error(name + ' characteristic not found'))
        }

        connected.on('notifyState', (characteristic, isNotifying) => {
          if (!isNotifying || radio) return
          if (characteristic.uuid.toLowerCase() !== meshtastic.FROM_NUM_UUID) return

          radio = new Radio(central, connected, wanted, log)
          settle(null, radio)
        })

        subscribe = () => connected.subscribe(wanted.fromNum)
        subscribe()
      })

      connected.on('error', (err) => {
        if (radio) return

        // Always on, not DEBUG-gated: this is the one place a connection dies
        // without the caller having anything useful to show.
        console.log('[meshtastic] peripheral error', err.code, err.message)

        if (subscribe && isPairing(err) && retries < PAIRING_RETRIES) {
          if (retries === 0 && onPairing) onPairing()
          retries++
          setTimeout(subscribe, PAIRING_RETRY_DELAY)
          return
        }

        settle(err)
      })

      connected.requestMtu(MTU)
      connected.discoverServices([meshtastic.SERVICE_UUID])
    }

    central.on('connect', onconnect)
    central.on('error', onerror)

    setTimeout(() => central.connect(peripheral), CONNECT_DELAY)
  })
}

// Call at Bare exit. Required on both platforms, for different reasons: on
// Android the scan callback outlives the runtime and crashes in onScanResult,
// and on Apple the runtime teardown leaves a published GATT service behind on
// every reload. The old "never destroy on Apple" rule was a workaround for a
// double-free fixed in bare-bluetooth-apple 0.3.4, whose idempotent
// `if (destroyed) return` guard is still in binding.mm as of 0.8.0.
function destroy() {
  if (!central) return

  central.stopScan()
  central.destroy()
  central = null
  found.clear()
}

module.exports = { Radio, scan, connect, destroy }
