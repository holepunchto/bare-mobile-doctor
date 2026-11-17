const EventEmitter = require('events')
const protocol = require('./protocol')

const SYNC_TIMEOUT = 15000

function noop() {}

module.exports = class Client extends EventEmitter {
  constructor({ read, write, close = noop, log = noop }) {
    super()

    this._read = read
    this._write = write
    this._close = close
    this._log = log
    this._reading = false
    this._queued = false
    this._configId = 0
    this._syncTimer = null

    this.nodeNum = 0
    this.nodes = new Map()
    this.lora = null
    this.channels = new Map()
  }

  get id() {
    return protocol.nodeId(this.nodeNum)
  }

  sync() {
    this._configId = (Math.random() * 0x100000000) >>> 0 || 1
    this._write(protocol.wantConfig(this._configId))
    this._syncTimer = setTimeout(() => {
      this._syncTimer = null
      this.emit('error', new Error('radio did not finish sending its node database'))
    }, SYNC_TIMEOUT)
    this.notify()
  }

  send(text) {
    this._write(protocol.textMessage(text, { wantAck: true }))
  }

  getChannel(index) {
    this._write(protocol.getChannel(index, this.nodeNum))
  }

  setChannel(index, settings, passkey) {
    this._write(protocol.setChannel(index, settings, passkey, this.nodeNum))
  }

  notify() {
    if (this._reading) {
      this._queued = true
      return
    }

    this._reading = true
    this._read()
  }

  push(data) {
    if (data === null || data.byteLength === 0) {
      this._reading = false

      if (this._queued) {
        this._queued = false
        this.notify()
      }

      return
    }

    try {
      this._handle(protocol.decode(data))
    } catch (err) {
      this.emit('error', err)
    }

    this._read()
  }

  nameOf(num) {
    const node = this.nodes.get(num)
    if (node && node.user && node.user.shortName) return node.user.shortName

    return protocol.nodeId(num)
  }

  destroy() {
    if (this._syncTimer) clearTimeout(this._syncTimer)
    this._syncTimer = null
    this._close()
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
    const data = packet.data
    if (!data) return

    if (data.portnum === protocol.PORT_ADMIN) {
      this.emit('admin', protocol.decodeAdmin(data.payload))
      return
    }

    if (data.portnum === protocol.PORT_ROUTING) {
      this.emit('ack', { id: data.requestId, ...protocol.decodeRouting(data.payload) })
      return
    }

    // The radio echoes our own packet back to every attached client.
    if (packet.from === this.nodeNum) return

    const from = { from: protocol.nodeId(packet.from), name: this.nameOf(packet.from) }

    if (data.portnum === protocol.PORT_POSITION) {
      this.emit('position', { ...from, ...protocol.decodePosition(data.payload) })
      return
    }

    if (data.portnum === protocol.PORT_TELEMETRY) {
      this.emit('telemetry', { ...from, ...protocol.decodeTelemetry(data.payload) })
      return
    }

    if (data.portnum === protocol.PORT_NODEINFO) {
      const node = {
        num: packet.from,
        user: protocol.decodeUserPayload(data.payload),
        snr: packet.snr,
        hopsAway: null
      }

      this.nodes.set(packet.from, node)
      this.emit('node', node)
      return
    }

    if (data.portnum !== protocol.PORT_TEXT_MESSAGE) return

    this.emit('message', {
      ...from,
      text: Buffer.from(data.payload).toString(),
      snr: packet.snr,
      rssi: packet.rssi,
      hops: packet.hopStart ? packet.hopStart - packet.hopLimit : 0,
      direct: packet.to !== protocol.BROADCAST
    })
  }
}
