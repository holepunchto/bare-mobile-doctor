// Reaching a Meshtastic radio over BLE. This file knows about Bluetooth and
// nothing about Meshtastic: it finds a radio, opens its three characteristics,
// and hands them to a Client, which owns the protocol.
//
//   scan({ onDiscover: (found) => ... })
//   const client = await connect(found.id)
//   client.on('message', (m) => console.log(m.name, m.text))

const { Central } = require('bare-bluetooth')
const meshtastic = require('./meshtastic')
const Client = require('./meshtastic/client')

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

// Letting go of a radio also forgets it, so reconnecting later has to find it
// again first. It is advertising by then, so this resolves in about a second.
const FIND_TIMEOUT = 15000

function noop() {}

function is(characteristic, uuid) {
  return characteristic.uuid.toLowerCase() === uuid
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

async function connect(id, options = {}) {
  if (!found.has(id)) await find(id, options)

  return dial(id, options)
}

// Scan until this one radio shows up again.
function find(id, { log = noop } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('radio is not in range')), FIND_TIMEOUT)

    scan({
      log,
      onDiscover: (seen) => {
        if (seen.id !== id) return

        clearTimeout(timer)
        resolve()
      },
      onError: (err) => {
        clearTimeout(timer)
        reject(err)
      }
    })
  })
}

// Open the three characteristics and wire them to a Client. Resolves once
// FromNum is notifying, at which point the radio can be talked to.
// `onPairing` fires once, when iOS asks the user for the radio's PIN.
function dial(id, { onPairing, log = noop } = {}) {
  return new Promise((resolve, reject) => {
    const peripheral = found.get(id)
    if (!peripheral) return reject(new Error('no radio with id ' + id))

    let client = null
    let subscribe = null
    let retries = 0

    central.stopScan()

    // Both handlers come off again the moment this settles - a failed attempt
    // would otherwise leave them behind and the next one would see every
    // event twice.
    function settle(err, value) {
      central.off('connect', onconnect)
      central.off('error', onerror)

      if (err) reject(err)
      else resolve(value)
    }

    const onerror = (err) => {
      if (!client) settle(err)
    }

    const onconnect = (connected) => {
      connected.on('servicesDiscover', (services) => {
        const service = services.find((s) => is(s, meshtastic.SERVICE_UUID))
        if (!service) return settle(new Error('meshtastic service not found'))

        connected.discoverCharacteristics(service)
      })

      connected.on('characteristicsDiscover', (service, characteristics) => {
        const pick = (uuid) => characteristics.find((c) => is(c, uuid))

        const wanted = {
          toRadio: pick(meshtastic.TO_RADIO_UUID),
          fromRadio: pick(meshtastic.FROM_RADIO_UUID),
          fromNum: pick(meshtastic.FROM_NUM_UUID)
        }

        for (const name of Object.keys(wanted)) {
          if (!wanted[name]) return settle(new Error(name + ' characteristic not found'))
        }

        connected.on('notifyState', (characteristic, isNotifying) => {
          if (!isNotifying || client) return
          if (!is(characteristic, meshtastic.FROM_NUM_UUID)) return

          client = new Client({
            read: () => connected.read(wanted.fromRadio),
            write: (frame) => connected.write(wanted.toRadio, frame, true),
            close: () => central.disconnect(connected),
            log
          })

          client.name = connected.name
          central.on('disconnect', () => client.emit('disconnect'))
          settle(null, client)
        })

        subscribe = () => connected.subscribe(wanted.fromNum)
        subscribe()
      })

      connected.on('notify', (characteristic) => {
        if (client && is(characteristic, meshtastic.FROM_NUM_UUID)) client.notify()
      })

      connected.on('read', (characteristic, data) => {
        if (client && is(characteristic, meshtastic.FROM_RADIO_UUID)) client.push(data)
      })

      connected.on('error', (err) => {
        if (client) return client.emit('error', err)

        // Always on, not DEBUG-gated: this is the one place a connection dies
        // without the caller having anything useful to show.
        console.log('[radio] peripheral error', err.code, err.message)

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

module.exports = { scan, connect, destroy }
