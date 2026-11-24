const { Central } = require('bare-bluetooth')
const meshtastic = require('bare-meshtastic')
const { Client, Mailbox } = meshtastic

const isAndroid = Bare.platform === 'android'
const scanOptions = isAndroid ? { scanMode: Central.SCAN_MODE_LOW_LATENCY } : undefined

const MTU = 512

// iOS fails the first encrypted operation with "Encryption is insufficient"
// while the user is still typing the PIN. Retrying is the way through.
const PAIRING_RETRIES = 10
const PAIRING_RETRY_DELAY = 3000

// Connecting while a scan winds down gives GATT error 133 on Android.
const CONNECT_DELAY = 500

const FIND_TIMEOUT = 15000

function noop() {}

function is(characteristic, uuid) {
  return characteristic.uuid.toLowerCase() === uuid
}

function isPairing(err) {
  if (!err) return false

  return /encryption|authentication|insufficient/i.test(
    (err.code || '') + ' ' + (err.message || '')
  )
}

let central = null
const found = new Map()

function scan({ onDiscover, onError, log = noop } = {}) {
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

function dial(id, { onPairing, log = noop } = {}) {
  return new Promise((resolve, reject) => {
    const peripheral = found.get(id)
    if (!peripheral) return reject(new Error('no radio with id ' + id))

    let client = null
    let subscribe = null
    let retries = 0

    central.stopScan()

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

          const mailbox = new Mailbox(connected, wanted, {
            close: () => central.disconnect(connected)
          })

          // The module logs through a bare-logger interface; the app's logger
          // is a plain function, so only the level the Client uses is wired.
          client = new Client(mailbox, { log: { debug: log } })

          client.name = connected.name
          central.on('disconnect', () => client.emit('disconnect'))
          settle(null, client)
        })

        subscribe = () => connected.subscribe(wanted.fromNum)
        subscribe()
      })

      connected.on('error', (err) => {
        if (client) return client.emit('error', err)

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

function destroy() {
  if (!central) return

  central.stopScan()
  central.destroy()
  central = null
  found.clear()
}

module.exports = { scan, connect, destroy }
