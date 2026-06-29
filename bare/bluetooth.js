const EventEmitter = require('events')
const FramedStream = require('framed-stream')
const { Central, Server, Service, Characteristic, scanOptions, isPoweredOn } = require('./ble')

const SERVICE_UUID = 'B4A3C8A7-0000-1000-8000-00805F9B34FB'
const CHAT_UUID = 'B4A3C8A7-0001-1000-8000-00805F9B34FB'
const WRITE_UUID = 'B4A3C8A7-0002-1000-8000-00805F9B34FB'
const PREFERRED_MTU = 512
const INVITE_WRITE_WITH_RESPONSE = false

const isAndroid = Bare.platform === 'android'

function normalizeUUID(uuid) {
  return String(uuid || '')
    .toLowerCase()
    .replace(/-/g, '')
}

function matchesUUID(uuid_b, uuid_a) {
  return normalizeUUID(uuid_b) === normalizeUUID(uuid_a)
}

function characteristicMatches(char, uuid) {
  return char && matchesUUID(char.uuid, uuid)
}

function findUUID(items, uuid) {
  if (!items) return null

  for (const item of items) {
    if (matchesUUID(item.uuid, uuid)) {
      return item
    }
  }

  return null
}

function propertiesHex(char) {
  if (!char || typeof char.properties !== 'number') return 'unknown'
  return `0x${char.properties.toString(16)}`
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

class BLECentral extends EventEmitter {
  constructor(opts) {
    super()
    this.serviceUUID = opts.serviceUUID
    this.chatUUID = opts.chatUUID
    this.writeUUID = opts.writeUUID
    this.preferredMTU = opts.preferredMTU

    this.scanning = 'off'
    this.connectedPeripheral = null
    this.notifyChar = null
    this.writeChar = null
    this.discoveredPeripherals = new Map()

    this._central = new Central()
    this._setup()
  }

  get state() {
    return this._central.state
  }

  _setup() {
    this._central.on('stateChange', (bleState) => {
      this.emit('stateChange', bleState)

      if (isPoweredOn(bleState)) {
        this.emit('ready')
        if (this.scanning === 'requested') this.startScan()
      }
    })

    this._central.on('discover', (peripheral) => {
      this.discoveredPeripherals.set(peripheral.id, peripheral)

      let name = peripheral.name || 'Unknown'
      if (!name && peripheral.serviceData && peripheral.serviceData[this.serviceUUID]) {
        name = Buffer.from(peripheral.serviceData[this.serviceUUID]).toString()
      }

      this.emit('discovered', { id: peripheral.id, name, rssi: peripheral.rssi })
    })

    this._central.on('connect', (peripheral) => {
      this.connectedPeripheral = peripheral

      this.emit('log', `Connected: ${peripheral.name || peripheral.id || 'unknown'}`)

      peripheral.on('mtuChanged', (mtu, error) => {
        this.emit('mtuChanged', { mtu, error })
      })

      peripheral.on('servicesDiscover', (services, error) => {
        this.emit('log', `Services discovered: ${services ? services.length : 0}`)

        if (error || !services || services.length === 0) {
          this.emit('error', 'Service discovery failed: ' + (error || 'none found'))
          this.emit('connectFailed')
          return
        }

        const service = findUUID(services, this.serviceUUID)

        if (!service) {
          this.emit('error', 'Chat service not found')
          this.emit('connectFailed')
          return
        }

        this.emit('log', 'Discovering characteristics')
        if (isAndroid) peripheral.discoverCharacteristics(service)
        else peripheral.discoverCharacteristics(service, [this.chatUUID, this.writeUUID])
      })

      peripheral.on('characteristicsDiscover', (service, chars, error) => {
        this.emit('log', `Characteristics discovered: ${chars ? chars.length : 0}`)

        if (error || !chars || chars.length === 0) {
          this.emit('error', 'Characteristic discovery failed')
          this.emit('connectFailed')
          return
        }

        const notifyChar = findUUID(chars, this.chatUUID)
        if (!notifyChar) {
          this.emit('error', 'Notify characteristic not found')
          this.emit('connectFailed')
          return
        }

        const writeChar = findUUID(chars, this.writeUUID)
        if (!writeChar) {
          this.emit('error', 'Write characteristic not found')
          this.emit('connectFailed')
          return
        }

        this.notifyChar = notifyChar
        this.writeChar = writeChar

        this.emit(
          'log',
          `Notify properties: ${propertiesHex(notifyChar)}, write properties: ${propertiesHex(writeChar)}`
        )
        this.emit('log', 'Subscribing to notify characteristic')
        peripheral.subscribe(notifyChar)
      })

      peripheral.on('notifyState', (char, isNotifying, error) => {
        this.emit('log', `Notify state: ${isNotifying}`)

        if (error) {
          this.emit('error', 'Subscribe error: ' + error)
          this.emit('connectFailed')
          return
        }

        const isChatNotify = !char || characteristicMatches(char, this.chatUUID)
        if (!isNotifying || !this.writeChar || !isChatNotify) return

        this.emit('connected')
      })

      peripheral.on('notify', (char, data, error) => {
        if (error || !data) return

        this.emit('log', `Notify received: ${data.byteLength} bytes`)
        this.emit('message', data)
      })

      peripheral.on('write', (char, error) => {
        if (error) {
          this.emit('writeComplete', { error: 'Write error: ' + error })
          return
        }

        this.emit('log', 'Write sent')
        this.emit('writeComplete', { error: null })
      })

      if (typeof peripheral.requestMtu === 'function') {
        this.emit('log', `Requesting MTU: ${this.preferredMTU}`)
        peripheral.requestMtu(this.preferredMTU)
      } else {
        this.emit('log', 'Skipping MTU request')
      }

      this.emit('log', 'Discovering services')
      if (isAndroid) peripheral.discoverServices()
      else peripheral.discoverServices([this.serviceUUID])
    })

    this._central.on('disconnect', (peripheral, error) => {
      this.emit('log', 'Central disconnected' + (error ? ': ' + error : ''))
      this.emit('disconnected', { error })
    })

    this._central.on('connectFail', (id, error) => {
      this.emit('error', 'Connect failed: ' + error)
      this.emit('connectFailed')
    })

    this._central.on('error', (err) => {
      this.emit('error', err.message || String(err))
    })
  }

  startScan(opts = scanOptions) {
    if (this.scanning === 'on') return

    if (!isPoweredOn(this.state)) {
      this.emit('log', 'Scan is waiting for Bluetooth power')
      return
    }

    this._central.startScan([this.serviceUUID], opts)
    this.scanning = 'on'
    this.emit('scanStarted')
  }

  stopScan() {
    this._central.stopScan()
    this.scanning = 'off'
    this.discoveredPeripherals.clear()
    this.emit('scanStopped')
  }

  setScan(enabled) {
    if (enabled) {
      this.scanning = 'requested'
      this.startScan()
    } else {
      this.stopScan()
    }
  }

  connect(id) {
    const peripheral = this.discoveredPeripherals.get(id)
    if (!peripheral) {
      this.emit('error', 'Device not found: ' + id)
      return false
    }

    if (this.scanning !== 'off') this.stopScan()

    this.emit('log', `Connecting to: ${peripheral.name || peripheral.id || 'unknown'}`)
    this._central.connect(peripheral)
    return true
  }

  disconnect() {
    if (this.connectedPeripheral) {
      this._central.disconnect(this.connectedPeripheral)
    }
    this.resetConnection()
  }

  write(data, withResponse) {
    if (!this.connectedPeripheral || !this.writeChar) return false
    this.connectedPeripheral.write(this.writeChar, data, withResponse)
    return true
  }

  resetConnection() {
    this.connectedPeripheral = null
    this.notifyChar = null
    this.writeChar = null
  }

  destroy() {
    this._central.destroy()
  }
}

class BLEServer extends EventEmitter {
  constructor(opts) {
    super()
    this.serviceUUID = opts.serviceUUID
    this.chatUUID = opts.chatUUID
    this.writeUUID = opts.writeUUID

    this.advertising = 'off'
    this.serviceAdded = false
    this.centralSubscribed = false
    this._deviceName = null

    this.notifyChar = new Characteristic(opts.chatUUID, {
      read: true,
      notify: true
    })
    this.writeChar = new Characteristic(opts.writeUUID, {
      write: true,
      writeWithoutResponse: true
    })

    this._server = new Server()
    this._setup()
  }

  get state() {
    return this._server.state
  }

  _setup() {
    this._server.on('stateChange', (bleState) => {
      if (isPoweredOn(bleState)) this._addService()
    })

    this._server.on('serviceAdd', (uuid, error) => {
      if (error) {
        this.emit('error', 'Failed to add service: ' + error)
      } else {
        this.serviceAdded = true
        this.emit('ready')
        if (this.advertising === 'requested') this.startAdvertising()
      }
    })

    this._server.on('error', (err) => {
      if (err.code === 'ADVERTISE_FAILED') {
        this.advertising = 'requested'
        this.emit('advertisingStopped')
      }
      this.emit('error', err.message || String(err))
    })

    this._server.on('readRequest', (req) => {
      this.emit(
        'log',
        `Read request: ${req.characteristicUuid || 'unknown'}, offset=${req.offset || 0}`
      )
      this._server.respondToRequest(req, Server.ATT_SUCCESS, Buffer.alloc(0))
    })

    this._server.on('writeRequest', (requests) => {
      for (const req of requests) {
        if (req.characteristicUuid && !matchesUUID(req.characteristicUuid, this.writeUUID)) {
          this.emit(
            'log',
            `Ignoring write for ${req.characteristicUuid}; expected ${this.writeUUID}`
          )
          continue
        }

        this.emit(
          'log',
          `Write request: ${req.data ? req.data.byteLength : 0} bytes, response=${req.responseNeeded}`
        )
        this._respondToWrite(req)

        if (req.data) this.emit('message', req.data)
      }
    })

    this._server.on('subscribe', (_centralHandle, characteristicUuid) => {
      if (characteristicUuid && !matchesUUID(characteristicUuid, this.chatUUID)) {
        this.emit('log', `Ignoring subscribe for ${characteristicUuid}; expected ${this.chatUUID}`)
        return
      }

      this.centralSubscribed = true
      this.emit('log', `Subscribed central: characteristic=${characteristicUuid || 'unknown'}`)
      this.emit('subscribed')
    })

    this._server.on('unsubscribe', (_centralHandle, characteristicUuid) => {
      if (characteristicUuid && !matchesUUID(characteristicUuid, this.chatUUID)) return
      this.centralSubscribed = false
      this.emit('unsubscribed')
    })

    this._addService()
  }

  _respondToWrite(request) {
    const shouldRespond = request.responseNeeded !== false || !isAndroid
    if (!shouldRespond) {
      this.emit('log', `Skipping write response (responseNeeded=${request.responseNeeded})`)
      return
    }

    this._server.respondToRequest(request, Server.ATT_SUCCESS, null)
  }

  _addService() {
    if (this.serviceAdded || !isPoweredOn(this.state)) return

    const service = new Service(this.serviceUUID, [this.notifyChar, this.writeChar])
    this._server.addService(service)
  }

  startAdvertising(deviceName) {
    if (deviceName !== undefined) this._deviceName = deviceName
    if (this.advertising === 'on') return

    if (!isPoweredOn(this.state)) {
      this.emit('log', 'Advertising is waiting for Bluetooth power')
      return
    }

    if (!this.serviceAdded) {
      this._addService()
      this.emit('log', 'Advertising is waiting for service add')
      return
    }

    const opts = { serviceUUIDs: [this.serviceUUID] }
    if (!isAndroid && this._deviceName) opts.name = this._deviceName

    this.emit('log', `Starting advertising: ${this.serviceUUID}`)
    this._server.startAdvertising(opts)
    this.advertising = 'on'
    this.emit('advertisingStarted')
  }

  stopAdvertising() {
    this._server.stopAdvertising()
    this.advertising = 'off'
    this.emit('advertisingStopped')
  }

  setAdvertising(enabled, deviceName) {
    if (enabled) {
      this._deviceName = deviceName
      this.advertising = 'requested'
      this.startAdvertising()
    } else {
      this.stopAdvertising()
    }
  }

  notify(data) {
    if (!this.centralSubscribed) return false
    return this._server.updateValue(this.notifyChar, data)
  }

  resetConnection() {
    this.centralSubscribed = false
  }

  destroy() {
    this._server.destroy()
  }
}

class Session {
  constructor(opts) {
    const { central, server, inviteWriteWithResponse, deviceName, send } = opts

    this.central = central
    this.server = server
    this.inviteWriteWithResponse = inviteWriteWithResponse
    this.deviceName = deviceName
    this.send = send

    this.state = {
      ready: false,

      inviteRole: 'idle',
      inviteWriteSent: false,
      inviteWritePendingResponse: false
    }

    this.setupCentralListeners()
    this.setupServerListeners()
  }

  log(message) {
    this.send({ type: 'log', message })
  }

  setupCentralListeners() {
    this.central.on('stateChange', (bleState) => {
      this.send({ type: 'bleState', state: bleState })
    })

    this.central.on('ready', () => {
      this.checkReady()
    })

    this.central.on('discovered', ({ id, name, rssi }) => {
      this.send({ type: 'discovered', id, name, rssi })
    })

    this.central.on('connected', () => {
      this.state.inviteWriteSent = false
      if (this.state.inviteRole === 'inviter') {
        setTimeout(() => this.writeInvite(), 100)
      }
    })

    this.central.on('connectFailed', () => {
      this.state.inviteRole = 'idle'
    })

    this.central.on('message', (data) => {
      const msg = this.parseBLEMessage(data, 'notify')
      if (msg) this.handleBLEMessage(msg)
    })

    this.central.on('writeComplete', ({ error }) => {
      const wasInviteWrite = this.state.inviteWritePendingResponse
      if (wasInviteWrite) this.state.inviteWritePendingResponse = false

      if (error) {
        this.send({ type: 'error', message: error })
        return
      }

      if (this.state.inviteRole === 'inviter' && wasInviteWrite) this.send({ type: 'inviteSent' })
    })

    this.central.on('mtuChanged', ({ mtu, error }) => {
      if (error) {
        this.send({ type: 'error', message: 'MTU request failed: ' + error })
      } else {
        this.send({ type: 'bleState', state: `on (mtu ${mtu})` })
      }
    })

    this.central.on('disconnected', ({ error }) => {
      if (this.state.inviteRole === 'inviter' || this.state.inviteRole === 'idle') {
        this.resetConnection()
        if (this.state.inviteRole !== 'idle') {
          this.state.inviteRole = 'idle'
          this.send({ type: 'disconnected' })
        }
      }
    })

    this.central.on('error', (message) => {
      this.send({ type: 'error', message })
    })

    this.central.on('log', (message) => {
      this.log(message)
    })

    this.central.on('scanStarted', () => {
      this.send({ type: 'scanStarted' })
    })

    this.central.on('scanStopped', () => {
      this.send({ type: 'scanStopped' })
    })
  }

  setupServerListeners() {
    this.server.on('ready', () => {
      this.checkReady()
    })

    this.server.on('message', (data) => {
      const msg = this.parseBLEMessage(data, 'write')
      if (msg) this.handleBLEMessage(msg)
    })

    this.server.on('unsubscribed', () => {
      if (this.state.inviteRole === 'invitee') {
        this.state.inviteRole = 'idle'
        this.send({ type: 'disconnected' })
      }
    })

    this.server.on('error', (message) => {
      this.send({ type: 'error', message })
    })

    this.server.on('log', (message) => {
      this.log(message)
    })

    this.server.on('advertisingStarted', () => {
      this.send({ type: 'advertisingStarted' })
    })

    this.server.on('advertisingStopped', () => {
      this.send({ type: 'advertisingStopped' })
    })
  }

  checkReady() {
    if (this.state.ready) return

    if (
      isPoweredOn(this.central.state) &&
      isPoweredOn(this.server.state) &&
      this.server.serviceAdded
    ) {
      this.state.ready = true
      this.send({ type: 'ready' })
    }
  }

  resetConnection() {
    this.central.resetConnection()
    this.server.resetConnection()
    this.state.inviteWritePendingResponse = false
  }

  handleBLEMessage(msg) {
    msg = decodeBLEMessage(msg)

    switch (msg.t) {
      case 'invite':
        if (this.state.inviteRole === 'idle') {
          this.state.inviteRole = 'invitee'
          this.send({ type: 'inviteReceived', name: msg.n })
        }
        break
      case 'accept':
        if (this.state.inviteRole === 'inviter') {
          this.send({ type: 'chatStarted' })
        }
        break
      case 'reject':
        if (this.state.inviteRole === 'inviter') {
          this.state.inviteRole = 'idle'
          this.central.disconnect()
          this.resetConnection()
          this.send({ type: 'inviteRejected' })
        }
        break
      case 'msg':
        this.send({ type: 'message', text: msg.d, from: 'remote' })
        break
    }
  }

  writeInvite() {
    if (this.state.inviteWriteSent || !this.central.writeChar) return

    this.state.inviteWriteSent = true
    this.state.inviteWritePendingResponse = this.inviteWriteWithResponse

    const inviteData = encodeBLEMessage({ t: 'invite', n: this.deviceName })
    this.log(`Writing invite: ${inviteData.byteLength} bytes`)
    this.central.write(inviteData, this.inviteWriteWithResponse)

    if (!this.inviteWriteWithResponse) {
      this.send({ type: 'inviteSent' })
    }
  }

  parseBLEMessage(data, type) {
    const buffer = Buffer.from(data)
    const text = buffer.toString()

    try {
      return JSON.parse(text)
    } catch (e) {
      this.send({
        type: 'error',
        message: `Bad ${type} data (${buffer.length} bytes): ${JSON.stringify(text)}`
      })
      return null
    }
  }

  setScan(enabled) {
    this.central.setScan(enabled)
  }

  setAdvertising(enabled) {
    this.server.setAdvertising(enabled, this.deviceName)
  }

  inviteDevice(id) {
    this.log('Invite requested: ' + String(id).slice(0, 16))

    if (this.state.inviteRole !== 'idle') {
      this.send({ type: 'error', message: 'Already in a session' })
      return
    }

    this.state.inviteRole = 'inviter'

    if (!this.central.connect(id)) {
      this.state.inviteRole = 'idle'
    }
  }

  acceptInvite() {
    if (this.state.inviteRole !== 'invitee' || !this.server.centralSubscribed) {
      this.send({ type: 'error', message: 'No invite to accept' })
      return
    }
    const data = encodeBLEMessage({ t: 'accept' })
    const ok = this.server.notify(data)
    this.log(`Accept notify queued: ${ok}`)
    this.send({ type: 'chatStarted' })
  }

  rejectInvite() {
    if (this.state.inviteRole !== 'invitee') return
    const data = encodeBLEMessage({ t: 'reject' })
    if (this.server.centralSubscribed) {
      const ok = this.server.notify(data)
      this.log(`Reject notify queued: ${ok}`)
    }
    this.state.inviteRole = 'idle'
    this.server.resetConnection()
    this.send({ type: 'inviteRejected' })
  }

  sendMessage(text) {
    const payload = encodeBLEMessage({ t: 'msg', d: text })

    if (
      this.state.inviteRole === 'inviter' &&
      this.central.connectedPeripheral &&
      this.central.writeChar
    ) {
      this.log(`Writing message: ${payload.byteLength} bytes`)
      this.central.write(payload, true)
      this.send({ type: 'message', text, from: 'local' })
    } else if (this.state.inviteRole === 'invitee' && this.server.centralSubscribed) {
      const ok = this.server.notify(payload)
      this.log(`Message notify queued: ${ok}`)
      this.send({ type: 'message', text, from: 'local' })
    } else {
      this.send({ type: 'error', message: 'Not connected' })
    }
  }

  disconnect() {
    if (this.state.inviteRole === 'inviter' && this.central.connectedPeripheral) {
      this.central.disconnect()
    }
    this.resetConnection()
    this.state.inviteRole = 'idle'
    this.send({ type: 'disconnected' })
  }

  destroy() {
    this.server.destroy()
    this.central.destroy()
  }
}

const ipc = new FramedStream(BareKit.IPC)

const central = new BLECentral({
  serviceUUID: SERVICE_UUID,
  chatUUID: CHAT_UUID,
  writeUUID: WRITE_UUID,
  preferredMTU: PREFERRED_MTU
})

const server = new BLEServer({
  serviceUUID: SERVICE_UUID,
  chatUUID: CHAT_UUID,
  writeUUID: WRITE_UUID
})

const session = new Session({
  central,
  server,
  inviteWriteWithResponse: INVITE_WRITE_WITH_RESPONSE,
  deviceName: Bare.argv[0] || 'BareDevice',
  send: (msg) => ipc.write(Buffer.from(JSON.stringify(msg)))
})

ipc.on('data', (data) => {
  try {
    const msg = JSON.parse(data.toString())

    switch (msg.type) {
      case 'setName':
        session.deviceName = msg.name
        break
      case 'setAdvertising':
        session.setAdvertising(msg.enabled)
        break
      case 'setScan':
        session.setScan(msg.enabled)
        break
      case 'invite':
        session.inviteDevice(msg.id)
        break
      case 'accept':
        session.acceptInvite()
        break
      case 'reject':
        session.rejectInvite()
        break
      case 'send':
        session.sendMessage(msg.text)
        break
      case 'disconnect':
        session.disconnect()
        break
    }
  } catch (e) {
    session.send({ type: 'error', message: 'IPC parse error: ' + e.message })
  }
})

Bare.on('exit', () => {
  session.destroy()
})
