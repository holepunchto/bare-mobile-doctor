const EventEmitter = require('events')
const FramedStream = require('framed-stream')
const { Central } = require('bare-bluetooth')
const lwp3 = require('bare-lwp3')

const DEFAULT_SPEED = 50
// The car stalls when full speed is commanded in reverse, so reverse is capped
// here. Forward is unaffected.
const MAX_REVERSE_SPEED = 75
const STEER_POWER = 30
const STEER_SPEED = 40
const STEER_MARGIN = 0.6

const isAndroid = Bare.platform === 'android'
const scanOptions = isAndroid ? { scanMode: Central.SCAN_MODE_LOW_LATENCY } : undefined

let DEBUG = Bare.argv[1] === 'true'

function dbg(...args) {
  if (DEBUG) console.log('[lwp3]', ...args)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A connected LEGO hub. Wraps the single LWP3 characteristic: every command is
// an encoded message written to it, every notification an encoded message read
// back off it.
class Hub extends EventEmitter {
  constructor(central, peripheral, characteristic) {
    super()

    this._central = central
    this._peripheral = peripheral
    this._characteristic = characteristic
    this._attached = new Set()

    central.on('disconnect', () => this.emit('disconnect'))
    central.on('error', (err) => this.emit('error', err))
    peripheral.on('error', (err) => this.emit('error', err))

    peripheral.on('notify', (c, data) => {
      const message = lwp3.decode(data)
      if (message.type === 'attachedIo') {
        if (message.event === 0x00) this._attached.delete(message.port)
        else this._attached.add(message.port)
      }
      this.emit('message', message)
    })
  }

  get attached() {
    return this._attached
  }

  get name() {
    return this._peripheral.name
  }

  power(port, power) {
    this._write(lwp3.startPower(port, power))
  }

  brake(port) {
    this._write(lwp3.brake(port))
  }

  goto(port, position, speed) {
    this._write(lwp3.gotoAbsolutePosition(port, position, speed))
  }

  watch(port) {
    this._write(lwp3.subscribe(port, lwp3.MODE_POSITION))
  }

  pair(portA, portB) {
    this._write(lwp3.connectVirtualPort(portA, portB))
  }

  speeds(port, speedA, speedB) {
    this._write(lwp3.startSpeeds(port, speedA, speedB))
  }

  subscribeBattery() {
    this._write(lwp3.subscribeBattery())
  }

  led(color) {
    this._write(lwp3.led(lwp3.LED_PORT, color))
  }

  off() {
    this._write(lwp3.switchOff())
  }

  close() {
    this._central.disconnect(this._peripheral)
  }

  _write(message) {
    this._peripheral.write(this._characteristic, message, false)
  }
}

// Scan for a hub advertising the LWP3 service, connect, and resolve once the
// characteristic is notifying.
function connect() {
  return new Promise((resolve, reject) => {
    const central = new Central()
    let connecting = false
    let hub = null

    central.on('stateChange', (state) => {
      dbg('ble state', state)
      if (state === 'poweredOn') {
        central.startScan([lwp3.SERVICE_UUID], scanOptions)
      } else if (state === 'poweredOff' || state === 'unauthorized' || state === 'unsupported') {
        reject(new Error('bluetooth ' + state))
      }
    })

    central.on('discover', (found) => {
      if (connecting) return
      connecting = true
      dbg('discovered', found.name || found.id)
      central.stopScan()
      central.connect(found)
    })

    central.on('connect', (peripheral) => {
      peripheral.on('servicesDiscover', (services) => {
        peripheral.discoverCharacteristics(services[0])
      })

      peripheral.on('characteristicsDiscover', (service, characteristics) => {
        const characteristic = characteristics.find(
          (c) => c.uuid.toLowerCase() === lwp3.CHARACTERISTIC_UUID
        )
        if (!characteristic) return reject(new Error('lwp3 characteristic not found'))
        peripheral.subscribe(characteristic)

        peripheral.on('notifyState', (c, isNotifying) => {
          if (!isNotifying || hub) return
          hub = new Hub(central, peripheral, characteristic)
          resolve(hub)
        })
      })

      peripheral.on('error', (err) => {
        if (!hub) reject(err)
      })

      peripheral.discoverServices([lwp3.SERVICE_UUID])
    })

    central.on('error', (err) => {
      if (!hub) reject(err)
    })
  })
}

// The car on top of the hub: two paired drive motors on A+B, a steering motor
// on D whose range is learned by pushing it against both end stops.
class Car {
  constructor(hub) {
    this._hub = hub
    this._center = 0
    this._range = 0
    this._position = 0
    this._drive = null

    hub.on('message', (message) => {
      if (message.type === 'portValue' && message.port === lwp3.PORT_D) {
        this._position = message.value
      }
      if (message.type === 'attachedIo' && message.ports) {
        this._drive = message.port
      }
    })
  }

  async calibrate() {
    await sleep(800)
    for (const port of [lwp3.PORT_A, lwp3.PORT_B, lwp3.PORT_D]) {
      if (!this._hub.attached.has(port)) {
        throw new Error('no motor on port ' + 'ABCD'[port])
      }
    }

    this._hub.pair(lwp3.PORT_A, lwp3.PORT_B)
    this._hub.watch(lwp3.PORT_D)
    await sleep(200)

    if (this._drive === null) {
      throw new Error('drive motors did not pair')
    }

    this._hub.power(lwp3.PORT_D, -STEER_POWER)
    await sleep(1000)
    this._hub.power(lwp3.PORT_D, 0)
    await sleep(300)
    const left = this._position

    this._hub.power(lwp3.PORT_D, STEER_POWER)
    await sleep(1000)
    this._hub.power(lwp3.PORT_D, 0)
    await sleep(300)
    const right = this._position

    this._center = Math.round((left + right) / 2)
    this._range = Math.round(((right - left) / 2) * STEER_MARGIN)

    this.steer(0)
  }

  drive(speed) {
    if (speed === 0) {
      this._hub.brake(lwp3.PORT_A)
      this._hub.brake(lwp3.PORT_B)
    } else {
      this._hub.speeds(this._drive, speed, speed)
    }
  }

  steer(direction) {
    this._hub.power(lwp3.PORT_D, 0)
    this._hub.goto(lwp3.PORT_D, this._center + direction * this._range, STEER_SPEED)
  }

  stop() {
    this.drive(0)
    this.steer(0)
  }
}

const ipc = new FramedStream(BareKit.IPC)

function send(msg) {
  ipc.write(Buffer.from(JSON.stringify(msg)))
}

const colors = {
  blue: lwp3.LED_BLUE,
  green: lwp3.LED_GREEN,
  yellow: lwp3.LED_YELLOW,
  purple: lwp3.LED_PURPLE,
  red: lwp3.LED_RED,
  white: lwp3.LED_WHITE
}

let hub = null
let car = null

// Current throttle (0-100) and which way we are driving, so a speed change
// while moving takes effect without the user having to press forward again.
let speed = DEFAULT_SPEED
let direction = 0

// Signed speed to send for the way we are currently driving.
function throttle() {
  return direction * (direction < 0 ? Math.min(speed, MAX_REVERSE_SPEED) : speed)
}

async function start() {
  if (hub) return

  send({ type: 'status', state: 'scanning' })
  hub = await connect()
  send({ type: 'connected', name: hub.name })

  hub.on('message', (message) => {
    if (message.type === 'battery') send({ type: 'battery', level: message.level })
    if (message.type === 'error') send({ type: 'error', message: message.reason })
  })
  hub.on('disconnect', () => {
    hub = null
    car = null
    send({ type: 'status', state: 'idle' })
  })
  hub.on('error', (err) => send({ type: 'error', message: err.message }))
  hub.subscribeBattery()

  car = new Car(hub)
  send({ type: 'status', state: 'calibrating' })
  await car.calibrate()

  hub.led(lwp3.LED_GREEN)
  send({ type: 'status', state: 'ready' })
}

const commands = {
  forward() {
    direction = 1
    car.drive(throttle())
    hub.led(lwp3.LED_BLUE)
  },
  backward() {
    direction = -1
    car.drive(throttle())
    hub.led(lwp3.LED_BLUE)
  },
  left() {
    car.steer(-1)
  },
  right() {
    car.steer(1)
  },
  stop() {
    direction = 0
    car.stop()
    hub.led(lwp3.LED_RED)
  },
  off() {
    hub.off()
  }
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

  if (msg.type === 'speed') {
    speed = Math.max(0, Math.min(100, Math.round(msg.value)))
    if (car && direction) car.drive(throttle())
    return
  }

  if (msg.type === 'connect') {
    start().catch((err) => {
      hub = null
      car = null
      send({ type: 'status', state: 'idle' })
      send({ type: 'error', message: err.message })
    })
    return
  }

  if (!car) return send({ type: 'error', message: 'not connected' })

  if (msg.type === 'led') {
    const color = colors[msg.color]
    if (color !== undefined) hub.led(color)
    return
  }

  const command = commands[msg.type]
  if (command) command()
})

Bare.on('uncaughtException', (err) => {
  console.log('[lwp3] !!! uncaughtException:', (err && err.stack) || err)
})
