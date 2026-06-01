const FramedStream = require('framed-stream')
const {
  Central,
  PeripheralManager,
  Service,
  Characteristic
} = require('bare-bluetooth-apple')

const ipc = new FramedStream(BareKit.IPC)

const SERVICE_UUID = 'B4A3C8A7-0000-1000-8000-00805F9B34FB'
const CHAT_UUID = 'B4A3C8A7-0001-1000-8000-00805F9B34FB'

let deviceName = Bare.argv[0] || 'BareDevice'
let central = null
let manager = null
let advertising = false
let scanning = false

let role = 'idle'
let connectedPeripheral = null
let chatCharacteristic = null
let chatCharMutable = null
let subscribedCentralHandle = null
const discoveredMap = new Map()

function send (msg) {
  ipc.write(Buffer.from(JSON.stringify(msg)))
}

function handleBLEMessage (msg) {
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
          connectedPeripheral = null
          chatCharacteristic = null
        }
        send({ type: 'inviteRejected' })
      }
      break
    case 'msg':
      send({ type: 'message', text: msg.d, from: 'remote' })
      break
  }
}

function setupCentral () {
  console.log('[BT] setupCentral')
  central = new Central()

  central.on('stateChange', (state) => {
    console.log('[BT] central stateChange:', state)
    send({ type: 'bleState', state })
    if (state === 'poweredOn') checkReady()
  })

  central.on('discover', (peripheral) => {
    console.log('[BT] discover:', peripheral.id, peripheral.name, peripheral.rssi)
    discoveredMap.set(peripheral.id, peripheral)

    let name = peripheral.name
    if (!name && peripheral.serviceData && peripheral.serviceData[SERVICE_UUID]) {
      name = Buffer.from(peripheral.serviceData[SERVICE_UUID]).toString()
    }

    send({ type: 'discovered', id: peripheral.id, name: name || 'Unknown', rssi: peripheral.rssi })
  })

  central.on('connect', (peripheral) => {
    connectedPeripheral = peripheral

    peripheral.discoverServices([SERVICE_UUID])

    peripheral.on('servicesDiscover', (services, error) => {
      if (error || !services || services.length === 0) {
        send({ type: 'error', message: 'Service discovery failed: ' + (error || 'none found') })
        role = 'idle'
        return
      }
      peripheral.discoverCharacteristics(services[0], [CHAT_UUID])
    })

    peripheral.on('characteristicsDiscover', (service, chars, error) => {
      if (error || !chars || chars.length === 0) {
        send({ type: 'error', message: 'Characteristic discovery failed' })
        role = 'idle'
        return
      }
      chatCharacteristic = chars[0]
      peripheral.subscribe(chatCharacteristic)

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
      connectedPeripheral = null
      chatCharacteristic = null
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

function setupManager () {
  console.log('[BT] setupManager')
  manager = new PeripheralManager()

  chatCharMutable = new Characteristic(CHAT_UUID, {
    write: true,
    notify: true
  })

  manager.on('stateChange', (state) => {
    console.log('[BT] manager stateChange:', state)
    if (state === 'poweredOn') {
      const service = new Service(SERVICE_UUID, [chatCharMutable])
      manager.addService(service)
    }
  })

  manager.on('serviceAdd', (uuid, error) => {
    console.log('[BT] serviceAdd:', uuid, error || 'ok')
    if (error) {
      send({ type: 'error', message: 'Failed to add service: ' + error })
    } else {
      serviceAdded = true
      checkReady()
    }
  })

  manager.on('writeRequest', (requests) => {
    for (const req of requests) {
      manager.respondToRequest(req, PeripheralManager.ATT_SUCCESS)
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

let ready = false
let serviceAdded = false
function checkReady () {
  console.log('[BT] checkReady central:', central && central.state, 'manager:', manager && manager.state, 'service:', serviceAdded)
  if (ready) return
  if (central && central.state === 'poweredOn' && manager && manager.state === 'poweredOn' && serviceAdded) {
    ready = true
    console.log('[BT] READY')
    send({ type: 'ready' })
  }
}

function setAdvertising (enabled) {
  console.log('[BT] setAdvertising:', enabled)
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

function setScan (enabled) {
  console.log('[BT] setScan:', enabled)
  scanning = enabled
  if (enabled) {
    central.startScan([SERVICE_UUID])
    send({ type: 'scanStarted' })
  } else {
    central.stopScan()
    discoveredMap.clear()
    send({ type: 'scanStopped' })
  }
}

function inviteDevice (id) {
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

function acceptInvite () {
  if (role !== 'invitee' || !subscribedCentralHandle) {
    send({ type: 'error', message: 'No invite to accept' })
    return
  }
  const data = Buffer.from(JSON.stringify({ t: 'accept' }))
  manager.updateValue(chatCharMutable, data)
  send({ type: 'chatStarted' })
}

function rejectInvite () {
  if (role !== 'invitee') return
  const data = Buffer.from(JSON.stringify({ t: 'reject' }))
  if (subscribedCentralHandle) {
    manager.updateValue(chatCharMutable, data)
  }
  role = 'idle'
  subscribedCentralHandle = null
  send({ type: 'inviteRejected' })
}

function sendMessage (text) {
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

function disconnect () {
  if (role === 'inviter' && connectedPeripheral) {
    central.disconnect(connectedPeripheral)
  }
  connectedPeripheral = null
  chatCharacteristic = null
  subscribedCentralHandle = null
  role = 'idle'
  send({ type: 'disconnected', scanning, advertising })
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
