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
  const peers = peersView(connect)

  let found = 0
  let adverts = 0
  let scanning = false
  let channel = null

  const seen = new Map()

  log.mount(peers.view)

  central.on('stateChange', (state) => {
    log(`state ${state}`)
    if (state === 'poweredOn') start()
  })

  central.on('discover', (peer) => {
    adverts++

    const name = peer.name || named(peer) || 'unknown'

    if (!seen.has(peer.id)) found++

    seen.set(peer.id, peer)

    peers.update(peer.id, name, peer.rssi)

    log.stats({ peers: found, adverts })
  })

  central.on('connect', (peripheral) => {
    log('connected')

    peripheral.on('servicesDiscover', (services) => {
      const service = services.find((service) => same(service.uuid, SERVICE_UUID))

      if (service === undefined) return log('service not found')

      peripheral.discoverCharacteristics(service, [PSM_UUID])
    })

    peripheral.on('characteristicsDiscover', (service, characteristics) => {
      const psm = characteristics.find((char) => same(char.uuid, PSM_UUID))

      if (psm === undefined) return log('psm characteristic not found')

      peripheral.read(psm)
    })

    // Android reports an empty read as null, Apple as an empty buffer.
    peripheral.on('read', (characteristic, data) => {
      const psm = data === null ? 0 : Number(Buffer.from(data).toString())

      if (!psm) return log('no psm published yet')

      log(`opening channel psm ${psm}`)
      peripheral.openL2CAPChannel(psm)
    })

    peripheral.on('channelOpen', (opened) => {
      channel = opened
      log('channel open')
      talk(log, opened, `hello from ${Bare.platform}`)
    })

    peripheral.discoverServices([SERVICE_UUID])
  })

  central.on('error', (err) => {
    log(`error ${err.code || ''} ${err.message}`)

    if (err.code === 'CONNECTION_FAILED' || err.code === 'DISCONNECT') start()
  })

  start()

  return () => {
    if (channel) channel.end()
    central.stopScan()
    central.destroy()
  }

  function connect(id) {
    const peer = seen.get(id)

    if (peer === undefined || !scanning) return

    scanning = false
    central.stopScan()

    log(`connecting to ${peer.name || id}`)
    central.connect(peer)
  }

  function start() {
    if (scanning || central.state !== 'poweredOn') return

    scanning = true
    log('scanning')
    central.startScan([SERVICE_UUID], scanOptions)
  }
}

function same(a, b) {
  return String(a).toLowerCase().replaceAll('-', '') === String(b).toLowerCase().replaceAll('-', '')
}

function talk(log, channel, greeting) {
  channel.on('data', (data) => log(`peer says ${Buffer.from(data).toString()}`))
  channel.on('error', (err) => log(`channel error ${err.message}`))
  channel.on('close', () => log('channel closed'))

  channel.write(Buffer.from(greeting))
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

  server.on('channelOpen', (channel) => {
    log('channel open')
    talk(log, channel, `hello from ${Bare.platform}`)
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
