const { Central, Characteristic, Server, Service } = require('bare-bluetooth')
const peersView = require('../views/peers')

const SERVICE_UUID = 'B4A3C8A7-0000-1000-8000-00805F9B34FB'
const PSM_UUID = 'B4A3C8A7-0003-1000-8000-00805F9B34FB'

const scanOptions =
  Bare.platform === 'android' ? { scanMode: Central.SCAN_MODE_LOW_LATENCY } : undefined

module.exports = {
  name: 'Bluetooth',
  options: ['scan', 'advertise'],
  run(log, option) {
    return option === 'scan' ? scan(log) : advertise(log)
  }
}

function scan(log) {
  const central = new Central()
  const peers = peersView()

  let found = 0
  let adverts = 0
  let scanning = false

  const seen = new Set()

  log.mount(peers.view)

  central.on('stateChange', (state) => {
    log(`state ${state}`)
    if (state === 'poweredOn') start()
  })

  central.on('discover', (peer) => {
    adverts++

    const name = peer.name || named(peer) || 'unknown'

    if (!seen.has(peer.id)) {
      seen.add(peer.id)
      found++
      log(`found ${name} ${peer.id}`)
    }

    peers.update(peer.id, name, peer.rssi)

    log.stats({ peers: found, adverts })
  })

  central.on('error', (err) => log(`error ${err.code || ''} ${err.message}`))

  start()

  return () => {
    central.stopScan()
    central.destroy()
  }

  function start() {
    if (scanning || central.state !== 'poweredOn') return

    scanning = true
    log('scanning')
    central.startScan([SERVICE_UUID], scanOptions)
  }
}

function named(peer) {
  const data = peer.serviceData && peer.serviceData[SERVICE_UUID]

  return data ? Buffer.from(data).toString() : null
}

function advertise(log) {
  const server = new Server()
  const name = `Bare-${Bare.platform}`

  let added = false
  let advertising = false
  let psm = null

  server.on('stateChange', (state) => {
    log(`state ${state}`)
    start()
  })

  server.on('serviceAdd', () => {
    added = true
    log('service added')
    start()
  })

  server.on('channelPublish', (published) => {
    psm = published
    log(`channel published psm ${psm}`)
    start()
  })

  server.on('readRequest', (req) => {
    const value = psm === null ? Buffer.alloc(0) : Buffer.from(String(psm))

    server.respondToRequest(req, Server.ATT_SUCCESS, value.subarray(req.offset))
  })

  server.on('error', (err) => log(`error ${err.code || ''} ${err.message}`))

  start()

  return () => {
    server.stopAdvertising()
    server.destroy()
  }

  function start() {
    if (advertising || server.state !== 'poweredOn') return

    if (!added) return server.addService(new Service(SERVICE_UUID, [psmCharacteristic()]))
    if (psm === null) return server.publishChannel()

    advertising = true

    log(`advertising as ${name}`)
    server.startAdvertising({ serviceUUIDs: [SERVICE_UUID], name })
    log.stats({ name, psm, service: SERVICE_UUID })
  }

  function psmCharacteristic() {
    return new Characteristic(PSM_UUID, { read: true })
  }
}
