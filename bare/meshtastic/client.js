// A Meshtastic client: the conversation, with no idea what it is talking over.
//
// Meshtastic defines its own framing and its own exchanges, and both are the
// same whether the link is BLE, serial or TCP - only the bytes arrive
// differently. So this holds the state machine and the caller holds the wire:
//
//   const client = new Client({
//     read: () => peripheral.read(fromRadio),      // ask for the next message
//     write: (frame) => peripheral.write(toRadio, frame, true)
//   })
//
//   client.notify()        // the radio says it has something
//   client.push(data)      // here is what a read returned; null or empty
//                          // means the queue is drained
//
// Over BLE one read returns exactly one message, which is what `push` expects.
// A serial link would reframe its stream on `0x94 0xc3 <len>` first and push
// whole messages the same way.

const EventEmitter = require('events')
const meshtastic = require('./index')

// The node database arrives as one frame per known node. If configComplete
// never closes it, say so rather than waiting forever.
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
    return meshtastic.nodeId(this.nodeNum)
  }

  // Ask for the node database. Anything the radio queued while no client was
  // attached is drained by the same loop.
  sync() {
    this._configId = (Math.random() * 0x100000000) >>> 0 || 1
    this._write(meshtastic.wantConfig(this._configId))
    this._syncTimer = setTimeout(() => {
      this._syncTimer = null
      this.emit('error', new Error('radio did not finish sending its node database'))
    }, SYNC_TIMEOUT)
    this.notify()
  }

  send(text) {
    this._write(meshtastic.textMessage(text, { wantAck: true }))
  }

  // Ask for one channel slot. The reply carries the session passkey that any
  // following write has to echo, so a read always comes first.
  getChannel(index) {
    this._write(meshtastic.getChannel(index, this.nodeNum))
  }

  setChannel(index, settings, passkey) {
    this._write(meshtastic.setChannel(index, settings, passkey, this.nodeNum))
  }

  // The radio has something waiting. Only one read can be outstanding, so a
  // notify arriving mid-drain just flags another pass.
  notify() {
    if (this._reading) {
      this._queued = true
      return
    }

    this._reading = true
    this._read()
  }

  // One message off the wire. Empty means the queue is drained - and Android
  // delivers a zero-length characteristic value as null.
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
      this._handle(meshtastic.decode(data))
    } catch (err) {
      this.emit('error', err)
    }

    this._read()
  }

  nameOf(num) {
    const node = this.nodes.get(num)
    if (node && node.user && node.user.shortName) return node.user.shortName

    return meshtastic.nodeId(num)
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

    // An encrypted packet has no decoded payload at all.
    if (!packet.data) return

    if (packet.data.portnum === meshtastic.PORT_ADMIN) {
      this.emit('admin', meshtastic.decodeAdmin(packet.data.payload))
      return
    }

    // Everything else (position, telemetry, routing acks) is not modelled.
    if (packet.data.portnum !== meshtastic.PORT_TEXT_MESSAGE) return

    // The radio echoes our own outgoing packet back to every attached client.
    // The caller already knows what it sent, so drop the echo.
    if (packet.from === this.nodeNum) return

    this.emit('message', {
      from: meshtastic.nodeId(packet.from),
      name: this.nameOf(packet.from),
      text: Buffer.from(packet.data.payload).toString(),
      snr: packet.snr,
      rssi: packet.rssi,
      hops: packet.hopStart ? packet.hopStart - packet.hopLimit : 0,
      direct: packet.to !== meshtastic.BROADCAST
    })
  }
}
