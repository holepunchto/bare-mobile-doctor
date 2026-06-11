const FramedStream = require('framed-stream')
const { Central, Server, Service, Characteristic, scanOptions, isPoweredOn } = require('./ble')

const ipc = new FramedStream(BareKit.IPC)

const SERVICE_UUID = 'B4A3C8A7-0000-1000-8000-00805F9B34FB'
const CHAT_UUID = 'B4A3C8A7-0001-1000-8000-00805F9B34FB'

let deviceName = Bare.argv[0] || 'BareDevice'
let central = null
let manager = null
let advertising = false
let scanning = false

let ready = false
let serviceAdded = false
let role = 'idle'
let connectedPeripheral = null
let chatCharacteristic = null
let chatCharMutable = null
let subscribedCentralHandle = null
const discoveredMap = new Map()

function send(msg) {
  ipc.write(Buffer.from(JSON.stringify(msg)))
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

function respondOK(request) {
  manager.respondToRequest(request, Server.ATT_SUCCESS, null)
}

function resetConnection() {
  connectedPeripheral = null
  chatCharacteristic = null
  subscribedCentralHandle = null
}

function handleBLEMessage(msg) {
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

function setupCentral() {
  central = new Central()

  central.on('stateChange', (state) => {
    send({ type: 'bleState', state })
    if (isPoweredOn(state)) checkReady()
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

    peripheral.discoverServices([SERVICE_UUID])

    peripheral.on('servicesDiscover', (services, error) => {
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

      peripheral.discoverCharacteristics(service, [CHAT_UUID])
    })

    peripheral.on('characteristicsDiscover', (service, chars, error) => {
      if (error || !chars || chars.length === 0) {
        send({ type: 'error', message: 'Characteristic discovery failed' })
        role = 'idle'
        return
      }

      chatCharacteristic = findUUID(chars, CHAT_UUID)

      if (!chatCharacteristic) {
        send({ type: 'error', message: 'Chat characteristic not found' })
        role = 'idle'
        return
      }

      peripheral.subscribe(chatCharacteristic)
    })

    peripheral.on('notifyState', (char, isNotifying, error) => {
      if (error) {
        send({ type: 'error', message: 'Subscribe error: ' + error })
        role = 'idle'
        return
      }

      if (!isNotifying || !chatCharacteristic) return

      const inviteData = JSON.stringify({ t: 'invite', n: deviceName })
      peripheral.write(chatCharacteristic, Buffer.from(inviteData), true)
      send({ type: 'inviteSent' })
    })

    peripheral.on('notify', (char, data, error) => {
      if (error || !data) return
      try {
        const msg = JSON.parse(Buffer.from(data).toString())
        handleBLEMessage(msg)
      } catch (e) {
        send({ type: 'error', message: 'Bad notify data' })
      }
    })

    peripheral.on('write', (char, error) => {
      if (error) send({ type: 'error', message: 'Write error: ' + error })
    })
  })

  central.on('disconnect', () => {
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

  chatCharMutable = new Characteristic(CHAT_UUID, {
    write: true,
    notify: true
  })

  manager.on('stateChange', (state) => {
    if (isPoweredOn(state)) {
      const service = new Service(SERVICE_UUID, [chatCharMutable])
      manager.addService(service)
    }
  })

  manager.on('serviceAdd', (uuid, error) => {
    if (error) {
      send({ type: 'error', message: 'Failed to add service: ' + error })
    } else {
      serviceAdded = true
      checkReady()
    }
  })

  manager.on('writeRequest', (requests) => {
    for (const req of requests) {
      respondOK(req)
      if (req.data) {
        try {
          const msg = JSON.parse(Buffer.from(req.data).toString())
          handleBLEMessage(msg)
        } catch (e) {
          send({ type: 'error', message: 'Bad write data' })
        }
      }
    }
  })

  manager.on('subscribe', (centralHandle) => {
    subscribedCentralHandle = centralHandle
  })

  manager.on('unsubscribe', () => {
    if (role === 'invitee') {
      role = 'idle'
      subscribedCentralHandle = null
      send({ type: 'disconnected' })
    }
  })
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

function setAdvertising(enabled) {
  advertising = enabled
  if (enabled) {
    manager.startAdvertising({
      name: deviceName,
      serviceUUIDs: [SERVICE_UUID]
    })
    send({ type: 'advertisingStarted' })
  } else {
    manager.stopAdvertising()
    send({ type: 'advertisingStopped' })
  }
}

function setScan(enabled) {
  scanning = enabled
  if (enabled) {
    central.startScan([SERVICE_UUID], scanOptions)
    send({ type: 'scanStarted' })
  } else {
    central.stopScan()
    discoveredMap.clear()
    send({ type: 'scanStopped' })
  }
}

function inviteDevice(id) {
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
  central.stopScan()
  central.connect(discovered)
}

function acceptInvite() {
  if (role !== 'invitee' || !subscribedCentralHandle) {
    send({ type: 'error', message: 'No invite to accept' })
    return
  }
  const data = Buffer.from(JSON.stringify({ t: 'accept' }))
  manager.updateValue(chatCharMutable, data)
  send({ type: 'chatStarted' })
}

function rejectInvite() {
  if (role !== 'invitee') return
  const data = Buffer.from(JSON.stringify({ t: 'reject' }))
  if (subscribedCentralHandle) {
    manager.updateValue(chatCharMutable, data)
  }
  role = 'idle'
  subscribedCentralHandle = null
  send({ type: 'inviteRejected' })
}

function sendMessage(text) {
  const payload = Buffer.from(JSON.stringify({ t: 'msg', d: text }))

  if (role === 'inviter' && connectedPeripheral && chatCharacteristic) {
    connectedPeripheral.write(chatCharacteristic, payload, true)
    send({ type: 'message', text, from: 'local' })
  } else if (role === 'invitee' && subscribedCentralHandle) {
    manager.updateValue(chatCharMutable, payload)
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
