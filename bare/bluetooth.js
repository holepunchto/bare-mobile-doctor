const FramedStream = require('framed-stream')
const {
  isAndroid,
  Central,
  Server,
  Service,
  Characteristic,
  scanOptions,
  isPoweredOn
} = require('./ble')

const ipc = new FramedStream(BareKit.IPC)

const SERVICE_UUID = 'B4A3C8A7-0000-1000-8000-00805F9B34FB'
const CHAT_UUID = 'B4A3C8A7-0001-1000-8000-00805F9B34FB'
const WRITE_UUID = 'B4A3C8A7-0002-1000-8000-00805F9B34FB'
const PREFERRED_MTU = 512
const INVITE_WRITE_WITH_RESPONSE = false

let deviceName = Bare.argv[0] || 'BareDevice'
let central = null
let manager = null
let advertising = false
let scanning = false
let wantsAdvertising = false
let wantsScanning = false

let ready = false
let serviceAdded = false
let role = 'idle'
let connectedPeripheral = null
let remoteNotify = null
let remoteWrite = null
let usingLegacyPeer = false
let notifyCharMutable = null
let writeCharMutable = null
let subscribedCentralHandle = null
let inviteWriteSent = false
let inviteWritePendingResponse = false
let requestMtuOnConnect = true
const discoveredMap = new Map()

function send(msg) {
  ipc.write(Buffer.from(JSON.stringify(msg)))
}

function log(message) {
  send({ type: 'log', message })
}

function normalizeUUID(uuid) {
  return String(uuid || '')
    .toLowerCase()
    .replace(/-/g, '')
}

function findUUID(items, uuid) {
  if (!items) return null

  for (const item of items) {
    if (normalizeUUID(item.uuid) === normalizeUUID(uuid)) {
      return item
    }
  }

  return null
}

function matchesUUID(value, uuid) {
  return normalizeUUID(value) === normalizeUUID(uuid)
}

function characteristicMatches(char, uuid) {
  return char && matchesUUID(char.uuid, uuid)
}

function propertiesHex(char) {
  if (!char || typeof char.properties !== 'number') return 'unknown'
  return `0x${char.properties.toString(16)}`
}

function respondToWrite(request) {
  const shouldRespond = request.responseNeeded !== false || !isAndroid
  if (!shouldRespond) {
    log(`Skipping write response (responseNeeded=${request.responseNeeded})`)
    return
  }

  manager.respondToRequest(request, Server.ATT_SUCCESS, null)
}

function respondToRead(request) {
  manager.respondToRequest(request, Server.ATT_SUCCESS, Buffer.alloc(0))
}

function resetConnection() {
  connectedPeripheral = null
  remoteNotify = null
  remoteWrite = null
  usingLegacyPeer = false
  subscribedCentralHandle = null
  inviteWritePendingResponse = false
}

function decodeBLEMessage(msg) {
  if (!Array.isArray(msg)) return msg

  switch (msg[0]) {
    case 'i':
      return { t: 'invite', n: msg[1] }
    case 'a':
      return { t: 'accept' }
    case 'r':
      return { t: 'reject' }
    case 'm':
      return { t: 'msg', d: msg[1] }
    default:
      return msg
  }
}

function encodeBLEMessage(msg) {
  switch (msg.t) {
    case 'invite':
      return Buffer.from(JSON.stringify(['i', msg.n]))
    case 'accept':
      return Buffer.from(JSON.stringify(['a']))
    case 'reject':
      return Buffer.from(JSON.stringify(['r']))
    case 'msg':
      return Buffer.from(JSON.stringify(['m', msg.d]))
    default:
      return Buffer.from(JSON.stringify(msg))
  }
}

function parseBLEMessage(data, type) {
  const buffer = Buffer.from(data)
  const text = buffer.toString()

  try {
    return JSON.parse(text)
  } catch (e) {
    send({
      type: 'error',
      message: `Bad ${type} data (${buffer.length} bytes): ${JSON.stringify(text)}`
    })
    return null
  }
}

function handleBLEMessage(msg) {
  msg = decodeBLEMessage(msg)

  switch (msg.t) {
    case 'invite':
      if (role === 'idle') {
        role = 'invitee'
        send({ type: 'inviteReceived', name: msg.n })
      }
      break
    case 'accept':
      if (role === 'inviter') {
        send({ type: 'chatStarted' })
      }
      break
    case 'reject':
      if (role === 'inviter') {
        role = 'idle'
        if (connectedPeripheral) {
          central.disconnect(connectedPeripheral)
          resetConnection()
        }
        send({ type: 'inviteRejected' })
      }
      break
    case 'msg':
      send({ type: 'message', text: msg.d, from: 'remote' })
      break
  }
}

function writeInvite(peripheral) {
  if (inviteWriteSent || !remoteWrite) return

  inviteWriteSent = true
  inviteWritePendingResponse = INVITE_WRITE_WITH_RESPONSE

  const inviteData = encodeBLEMessage({ t: 'invite', n: deviceName })
  log(`Writing invite: ${inviteData.byteLength} bytes`)
  peripheral.write(remoteWrite, inviteData, INVITE_WRITE_WITH_RESPONSE)

  if (!INVITE_WRITE_WITH_RESPONSE) {
    send({ type: 'inviteSent' })
  }
}

function setupCentral() {
  central = new Central()

  central.on('stateChange', (state) => {
    send({ type: 'bleState', state })
    if (isPoweredOn(state)) {
      checkReady()
      if (wantsScanning && !scanning) startScan()
    }
  })

  central.on('discover', (peripheral) => {
    discoveredMap.set(peripheral.id, peripheral)

    let name = peripheral.name
    if (!name && peripheral.serviceData && peripheral.serviceData[SERVICE_UUID]) {
      name = Buffer.from(peripheral.serviceData[SERVICE_UUID]).toString()
    }

    send({ type: 'discovered', id: peripheral.id, name: name || 'Unknown', rssi: peripheral.rssi })
  })

  central.on('connect', (peripheral) => {
    connectedPeripheral = peripheral
    inviteWriteSent = false

    log(`Connected: ${peripheral.name || peripheral.id || 'unknown'}`)

    peripheral.on('mtuChanged', (mtu, error) => {
      if (error) {
        send({ type: 'error', message: 'MTU request failed: ' + error })
      } else {
        send({ type: 'bleState', state: `on (mtu ${mtu})` })
      }
    })

    peripheral.on('servicesDiscover', (services, error) => {
      log(`Services discovered: ${services ? services.length : 0}`)

      if (error || !services || services.length === 0) {
        send({ type: 'error', message: 'Service discovery failed: ' + (error || 'none found') })
        role = 'idle'
        return
      }

      const service = findUUID(services, SERVICE_UUID)

      if (!service) {
        send({ type: 'error', message: 'Chat service not found' })
        role = 'idle'
        return
      }

      log('Discovering characteristics')
      if (isAndroid) peripheral.discoverCharacteristics(service)
      else peripheral.discoverCharacteristics(service, [CHAT_UUID, WRITE_UUID])
    })

    peripheral.on('characteristicsDiscover', (service, chars, error) => {
      log(`Characteristics discovered: ${chars ? chars.length : 0}`)

      if (error || !chars || chars.length === 0) {
        send({ type: 'error', message: 'Characteristic discovery failed' })
        role = 'idle'
        return
      }

      remoteNotify = findUUID(chars, CHAT_UUID)
      remoteWrite = findUUID(chars, WRITE_UUID)

      if (!remoteNotify) {
        send({ type: 'error', message: 'Notify characteristic not found' })
        role = 'idle'
        return
      }

      if (!remoteWrite) {
        remoteWrite = remoteNotify
        usingLegacyPeer = true
        log('Write characteristic not found; falling back to CHAT_UUID')
      }

      log(
        `Notify properties: ${propertiesHex(remoteNotify)}, write properties: ${propertiesHex(remoteWrite)}`
      )
      log('Subscribing to notify characteristic')
      peripheral.subscribe(remoteNotify)
    })

    peripheral.on('notifyState', (char, isNotifying, error) => {
      log(`Notify state: ${isNotifying}`)

      if (error) {
        send({ type: 'error', message: 'Subscribe error: ' + error })
        role = 'idle'
        return
      }

      const isChatNotify = !char || characteristicMatches(char, CHAT_UUID)
      if (!isNotifying || !remoteWrite || !isChatNotify) return

      if (role === 'inviter') setTimeout(() => writeInvite(peripheral), 100)
    })

    peripheral.on('notify', (char, data, error) => {
      if (error || !data) return

      log(`Notify received: ${data.byteLength} bytes`)
      const msg = parseBLEMessage(data, 'notify')
      if (msg) handleBLEMessage(msg)
    })

    peripheral.on('write', (char, error) => {
      const wasInviteWrite = inviteWritePendingResponse
      if (wasInviteWrite) inviteWritePendingResponse = false

      if (error) {
        send({ type: 'error', message: 'Write error: ' + error })
        return
      }

      log('Write sent')
      if (role === 'inviter' && wasInviteWrite) send({ type: 'inviteSent' })
    })

    if (requestMtuOnConnect && typeof peripheral.requestMtu === 'function') {
      log(`Requesting MTU: ${PREFERRED_MTU}`)
      peripheral.requestMtu(PREFERRED_MTU)
    } else {
      log('Skipping MTU request')
    }

    log('Discovering services')
    if (isAndroid) peripheral.discoverServices()
    else peripheral.discoverServices([SERVICE_UUID])
  })

  central.on('disconnect', (peripheral, error) => {
    log('Central disconnected' + (error ? ': ' + error : ''))
    if (role === 'inviter' || role === 'idle') {
      resetConnection()
      if (role !== 'idle') {
        role = 'idle'
        send({ type: 'disconnected' })
      }
    }
  })

  central.on('connectFail', (id, error) => {
    send({ type: 'error', message: 'Connect failed: ' + error })
    role = 'idle'
  })
}

function setupManager() {
  manager = new Server()

  notifyCharMutable = new Characteristic(CHAT_UUID, {
    read: true,
    notify: true
  })

  writeCharMutable = new Characteristic(WRITE_UUID, {
    write: true,
    writeWithoutResponse: true
  })

  manager.on('stateChange', (state) => {
    if (isPoweredOn(state)) addService()
  })

  manager.on('serviceAdd', (uuid, error) => {
    if (error) {
      send({ type: 'error', message: 'Failed to add service: ' + error })
    } else {
      serviceAdded = true
      checkReady()
      if (wantsAdvertising) startAdvertising()
    }
  })

  manager.on('advertiseError', (code, error) => {
    advertising = false
    send({ type: 'advertisingStopped' })
    send({ type: 'error', message: `Advertise error ${code}: ${error}` })
  })

  manager.on('readRequest', (req) => {
    log(`Read request: ${req.characteristicUuid || 'unknown'}, offset=${req.offset || 0}`)
    respondToRead(req)
  })

  manager.on('writeRequest', (requests) => {
    for (const req of requests) {
      if (req.characteristicUuid && !matchesUUID(req.characteristicUuid, WRITE_UUID)) {
        log(`Ignoring write for ${req.characteristicUuid}; expected ${WRITE_UUID}`)
        continue
      }

      log(
        `Write request: ${req.data ? req.data.byteLength : 0} bytes, response=${req.responseNeeded}`
      )
      respondToWrite(req)

      if (req.data) {
        const msg = parseBLEMessage(req.data, 'write')
        if (msg) handleBLEMessage(msg)
      }
    }
  })

  manager.on('subscribe', (centralHandle, characteristicUuid) => {
    if (characteristicUuid && !matchesUUID(characteristicUuid, CHAT_UUID)) {
      log(`Ignoring subscribe for ${characteristicUuid}; expected ${CHAT_UUID}`)
      return
    }

    subscribedCentralHandle = centralHandle
    log('Subscribed central: ' + String(centralHandle).slice(0, 8))
  })

  manager.on('unsubscribe', (centralHandle, characteristicUuid) => {
    if (characteristicUuid && !matchesUUID(characteristicUuid, CHAT_UUID)) return
    if (role === 'invitee') {
      role = 'idle'
      subscribedCentralHandle = null
      send({ type: 'disconnected' })
    }
  })

  addService()
}

function checkReady() {
  if (ready) return
  if (
    central &&
    isPoweredOn(central.state) &&
    manager &&
    isPoweredOn(manager.state) &&
    serviceAdded
  ) {
    ready = true
    send({ type: 'ready' })
  }
}

function addService() {
  if (!manager || serviceAdded || !isPoweredOn(manager.state)) return

  const service = new Service(SERVICE_UUID, [notifyCharMutable, writeCharMutable])
  manager.addService(service)
}

function startAdvertising() {
  if (advertising) return

  if (!manager || !isPoweredOn(manager.state)) {
    log('Advertising is waiting for Bluetooth power')
    return
  }

  if (!serviceAdded) {
    addService()
    log('Advertising is waiting for service add')
    return
  }

  const opts = { serviceUUIDs: [SERVICE_UUID] }
  if (!isAndroid) opts.name = deviceName

  manager.startAdvertising(opts)
  advertising = true
  send({ type: 'advertisingStarted' })
}

function stopAdvertising() {
  if (manager) manager.stopAdvertising()
  advertising = false
  send({ type: 'advertisingStopped' })
}

function setAdvertising(enabled) {
  wantsAdvertising = enabled
  if (enabled) startAdvertising()
  else stopAdvertising()
}

function startScan(uuids, opts) {
  if (scanning) return

  if (!central || !isPoweredOn(central.state)) {
    log('Scan is waiting for Bluetooth power')
    return
  }

  central.startScan([SERVICE_UUID], scanOptions)
  scanning = true
  send({ type: 'scanStarted' })
}

function stopScan() {
  if (central) central.stopScan()
  scanning = false
  discoveredMap.clear()
  send({ type: 'scanStopped' })
}

function setScan(enabled) {
  wantsScanning = enabled
  if (enabled) startScan()
  else stopScan()
}

function inviteDevice(id) {
  log('Invite requested: ' + String(id).slice(0, 16))
  const discovered = discoveredMap.get(id)
  if (!discovered) {
    send({ type: 'error', message: 'Device not found: ' + id })
    return
  }
  if (role !== 'idle') {
    send({ type: 'error', message: 'Already in a session' })
    return
  }
  role = 'inviter'
  requestMtuOnConnect = true
  log(`Connecting to: ${discovered.name || discovered.id || 'unknown'}`)
  if (wantsScanning || scanning) {
    wantsScanning = false
    stopScan()
  }
  central.connect(discovered)
}

function acceptInvite() {
  if (role !== 'invitee' || !subscribedCentralHandle) {
    send({ type: 'error', message: 'No invite to accept' })
    return
  }
  const data = encodeBLEMessage({ t: 'accept' })
  const ok = manager.updateValue(notifyCharMutable, data)
  log(`Accept notify queued: ${ok}`)
  send({ type: 'chatStarted' })
}

function rejectInvite() {
  if (role !== 'invitee') return
  const data = encodeBLEMessage({ t: 'reject' })
  if (subscribedCentralHandle) {
    const ok = manager.updateValue(notifyCharMutable, data)
    log(`Reject notify queued: ${ok}`)
  }
  role = 'idle'
  subscribedCentralHandle = null
  send({ type: 'inviteRejected' })
}

function sendMessage(text) {
  const payload = encodeBLEMessage({ t: 'msg', d: text })

  if (role === 'inviter' && connectedPeripheral && remoteWrite) {
    log(`Writing message: ${payload.byteLength} bytes`)
    connectedPeripheral.write(remoteWrite, payload, true)
    send({ type: 'message', text, from: 'local' })
  } else if (role === 'invitee' && subscribedCentralHandle) {
    const ok = manager.updateValue(notifyCharMutable, payload)
    log(`Message notify queued: ${ok}`)
    send({ type: 'message', text, from: 'local' })
  } else {
    send({ type: 'error', message: 'Not connected' })
  }
}

function disconnect() {
  if (role === 'inviter' && connectedPeripheral) {
    central.disconnect(connectedPeripheral)
  }
  resetConnection()
  role = 'idle'
  send({ type: 'disconnected' })
}

ipc.on('data', (data) => {
  try {
    const msg = JSON.parse(data.toString())

    switch (msg.type) {
      case 'setName':
        deviceName = msg.name
        break
      case 'setAdvertising':
        setAdvertising(msg.enabled)
        break
      case 'setScan':
        setScan(msg.enabled)
        break
      case 'invite':
        inviteDevice(msg.id)
        break
      case 'accept':
        acceptInvite()
        break
      case 'reject':
        rejectInvite()
        break
      case 'send':
        sendMessage(msg.text)
        break
      case 'disconnect':
        disconnect()
        break
    }
  } catch (e) {
    send({ type: 'error', message: 'IPC parse error: ' + e.message })
  }
})

setupCentral()
setupManager()

Bare.on('exit', () => {
  if (manager) manager.destroy()
  if (central) central.destroy()
})
