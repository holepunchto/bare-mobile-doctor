// Meshtastic's BLE client API, which is what a LoRa radio exposes to a phone:
// three characteristics carrying protobuf frames. Only five messages are
// involved, so the wire format is hand-rolled here rather than pulled from a
// protobuf runtime that would dwarf them.
//
// Field numbers come from meshtastic/protobufs (mesh.proto, portnums.proto).
// Unknown fields are skipped by wire type, so newer firmware still parses.

const SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5dcae273eafd'

// Write a ToRadio frame here to send it.
const TO_RADIO_UUID = 'f75c76d2-129e-4dad-a1dd-7866124401e7'

// Read here to pop one queued FromRadio frame; an empty read means the queue
// is drained.
const FROM_RADIO_UUID = '2c55e69e-4993-11ed-b878-0242ac120002'

// Notifies whenever the radio has queued a frame on FROM_RADIO_UUID.
const FROM_NUM_UUID = 'ed9da18c-a800-4f66-a670-aa7547e34453'

const BROADCAST = 0xffffffff
const PORT_TEXT_MESSAGE = 1
const PORT_ADMIN = 6

// mesh.proto Constants.DATA_PAYLOAD_LEN: the ceiling on one mesh payload.
const MAX_PAYLOAD = 233

// Default mesh hops. Three is the firmware default.
const HOP_LIMIT = 3

// Channel.Role. A disabled slot is still stored in flash and still handed to
// every client that connects - which is exactly what a dead drop needs, with
// no risk of the radio transmitting on it.
const CHANNEL_DISABLED = 0
const CHANNEL_PRIMARY = 1

// ChannelSettings.psk is capped at 32 bytes, which is exactly the size of a
// hypercore key. The 12-byte name next to it is the label that says this slot
// holds one rather than a real channel.
const CHANNEL_PSK_SIZE = 32
const CHANNEL_NAME_SIZE = 12

// Config.LoRaConfig.RegionCode and ModemPreset, indexed by their enum value.
// Two radios only hear each other when both match.
const REGIONS = [
  'UNSET',
  'US',
  'EU_433',
  'EU_868',
  'CN',
  'JP',
  'ANZ',
  'KR',
  'TW',
  'RU',
  'IN',
  'NZ_865',
  'TH',
  'LORA_24',
  'UA_433',
  'UA_868',
  'MY_433',
  'MY_919',
  'SG_923',
  'PH_433',
  'PH_868',
  'PH_915',
  'ANZ_433',
  'KZ_433',
  'KZ_863',
  'NP_865',
  'BR_902',
  'ITU1_2M',
  'ITU2_2M',
  'EU_866',
  'EU_874',
  'EU_917',
  'EU_N_868',
  'ITU3_2M',
  'ITU1_70CM',
  'ITU2_70CM',
  'ITU3_70CM',
  'ITU2_125CM'
]

const MODEM_PRESETS = [
  'LONG_FAST',
  'LONG_SLOW',
  'VERY_LONG_SLOW',
  'MEDIUM_SLOW',
  'MEDIUM_FAST',
  'SHORT_SLOW',
  'SHORT_FAST',
  'LONG_MODERATE',
  'SHORT_TURBO',
  'LONG_TURBO',
  'LITE_FAST',
  'LITE_SLOW',
  'NARROW_FAST',
  'NARROW_SLOW',
  'TINY_FAST',
  'TINY_SLOW',
  'MEDIUM_TURBO'
]

class Writer {
  constructor() {
    this._bytes = []
  }

  varint(value) {
    while (value > 0x7f) {
      this._bytes.push((value & 0x7f) | 0x80)
      value = Math.floor(value / 128)
    }
    this._bytes.push(value)
    return this
  }

  tag(field, wire) {
    return this.varint((field << 3) | wire)
  }

  uint32(field, value) {
    if (!value) return this
    return this.tag(field, 0).varint(value)
  }

  bool(field, value) {
    if (!value) return this
    return this.tag(field, 0).varint(1)
  }

  fixed32(field, value) {
    this.tag(field, 5)
    this._bytes.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff
    )
    return this
  }

  bytes(field, data) {
    this.tag(field, 2).varint(data.length)
    for (let i = 0; i < data.length; i++) this._bytes.push(data[i])
    return this
  }

  message(field, writer) {
    return this.bytes(field, writer.toBuffer())
  }

  toBuffer() {
    return Buffer.from(this._bytes)
  }
}

class Reader {
  constructor(data) {
    this._data = data
    this._view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    this._end = data.byteLength
    this._pos = 0
  }

  get ended() {
    return this._pos >= this._end
  }

  varint() {
    let value = 0
    let scale = 1

    while (true) {
      if (this.ended) throw new Error('truncated varint')

      const byte = this._data[this._pos++]
      value += (byte & 0x7f) * scale
      if ((byte & 0x80) === 0) return value

      scale *= 128
      if (scale > 0x100000000000000) throw new Error('varint too long')
    }
  }

  // Signed fields encode negatives as a 64-bit two's complement varint, too
  // wide for a JS number to hold exactly, so only the low 32 bits are kept.
  int32() {
    let value = 0
    let shift = 0

    while (true) {
      if (this.ended) throw new Error('truncated varint')

      const byte = this._data[this._pos++]
      if (shift < 32) value |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) return value | 0

      shift += 7
    }
  }

  fixed32() {
    if (this._pos + 4 > this._end) throw new Error('truncated fixed32')

    const value = this._view.getUint32(this._pos, true)
    this._pos += 4
    return value
  }

  float() {
    if (this._pos + 4 > this._end) throw new Error('truncated float')

    const value = this._view.getFloat32(this._pos, true)
    this._pos += 4
    return value
  }

  bytes() {
    const length = this.varint()
    if (this._pos + length > this._end) throw new Error('truncated field')

    const value = this._data.subarray(this._pos, this._pos + length)
    this._pos += length
    return value
  }

  string() {
    return Buffer.from(this.bytes()).toString()
  }

  message() {
    return new Reader(this.bytes())
  }

  skip(wire) {
    if (wire === 0) this.varint()
    else if (wire === 1) this._skip(8)
    else if (wire === 5) this._skip(4)
    else if (wire === 2) {
      // The length must be read before the cursor moves: `_pos += varint()`
      // would capture the old cursor and lose the length byte.
      this._skip(this.varint())
    } else throw new Error('unknown wire type ' + wire)
  }

  _skip(length) {
    if (this._pos + length > this._end) throw new Error('truncated field')

    this._pos += length
  }

  // Hand each field to `fields[number]`, skipping the ones not listed.
  each(fields) {
    while (!this.ended) {
      const tag = this.varint()
      const field = fields[tag >>> 3]

      if (field) field(this)
      else this.skip(tag & 7)
    }
  }
}

function decodeUser(reader) {
  const user = { id: null, longName: null, shortName: null }

  reader.each({
    1: (r) => (user.id = r.string()),
    2: (r) => (user.longName = r.string()),
    3: (r) => (user.shortName = r.string())
  })

  return user
}

function decodeNodeInfo(reader) {
  const node = { num: 0, user: null, snr: 0, hopsAway: null }

  reader.each({
    1: (r) => (node.num = r.varint()),
    2: (r) => (node.user = decodeUser(r.message())),
    4: (r) => (node.snr = r.float()),
    9: (r) => (node.hopsAway = r.varint())
  })

  return node
}

function decodeData(reader) {
  const data = { portnum: 0, payload: null }

  reader.each({
    1: (r) => (data.portnum = r.varint()),
    2: (r) => (data.payload = r.bytes())
  })

  return data
}

function decodePacket(reader) {
  const packet = {
    from: 0,
    to: 0,
    id: 0,
    data: null,
    encrypted: false,
    snr: 0,
    rssi: 0,
    hopLimit: 0,
    hopStart: 0
  }

  reader.each({
    1: (r) => (packet.from = r.fixed32()),
    2: (r) => (packet.to = r.fixed32()),
    4: (r) => (packet.data = decodeData(r.message())),
    5: (r) => {
      r.bytes()
      packet.encrypted = true
    },
    6: (r) => (packet.id = r.fixed32()),
    8: (r) => (packet.snr = r.float()),
    9: (r) => (packet.hopLimit = r.varint()),
    12: (r) => (packet.rssi = r.int32()),
    15: (r) => (packet.hopStart = r.varint())
  })

  return packet
}

function decodeLoRaConfig(reader) {
  let usePreset = false
  let preset = 0
  let region = 0
  let hopLimit = 0

  reader.each({
    1: (r) => (usePreset = r.varint() !== 0),
    2: (r) => (preset = r.varint()),
    7: (r) => (region = r.varint()),
    8: (r) => (hopLimit = r.varint())
  })

  return {
    region: REGIONS[region] || 'UNKNOWN',
    preset: usePreset ? MODEM_PRESETS[preset] || 'UNKNOWN' : 'CUSTOM',
    hopLimit
  }
}

// Config arrives one section per frame; only the LoRa one says whether two
// radios can hear each other, so the rest are left to the unknown-field skip.
function decodeConfig(reader) {
  let lora = null

  reader.each({ 6: (r) => (lora = decodeLoRaConfig(r.message())) })

  return lora
}

function decodeChannel(reader) {
  const channel = { index: 0, name: null, psk: null, role: 0 }

  reader.each({
    1: (r) => (channel.index = r.varint()),
    2: (r) =>
      r.message().each({
        2: (s) => (channel.psk = s.bytes()),
        3: (s) => (channel.name = s.string())
      }),
    3: (r) => (channel.role = r.varint())
  })

  return channel
}

function decodeMyNodeInfo(reader) {
  let nodeNum = 0

  reader.each({ 1: (r) => (nodeNum = r.varint()) })

  return nodeNum
}

// One FromRadio frame. `type` names which variant arrived; anything this codec
// does not model comes back with a null type.
function decode(data) {
  const frame = {
    id: 0,
    type: null,
    packet: null,
    node: null,
    nodeNum: 0,
    configId: 0,
    lora: null,
    channel: null
  }

  new Reader(data).each({
    1: (r) => (frame.id = r.varint()),
    2: (r) => {
      frame.type = 'packet'
      frame.packet = decodePacket(r.message())
    },
    3: (r) => {
      frame.type = 'myInfo'
      frame.nodeNum = decodeMyNodeInfo(r.message())
    },
    4: (r) => {
      frame.type = 'nodeInfo'
      frame.node = decodeNodeInfo(r.message())
    },
    5: (r) => {
      const lora = decodeConfig(r.message())
      if (lora === null) return

      frame.type = 'config'
      frame.lora = lora
    },
    7: (r) => {
      frame.type = 'configComplete'
      frame.configId = r.varint()
    },
    10: (r) => {
      frame.type = 'channel'
      frame.channel = decodeChannel(r.message())
    }
  })

  return frame
}

// ToRadio asking the radio to stream its node database back, echoing `id` in
// the closing configComplete so a stale reply can be told apart.
function wantConfig(id) {
  return new Writer().uint32(3, id).toBuffer()
}

// ToRadio carrying one payload on one port. Leaving `from` unset lets the
// radio stamp its own node number on the way out.
function packet(portnum, payload, opts = {}) {
  if (payload.length > MAX_PAYLOAD) {
    throw new Error('payload is ' + payload.length + ' bytes, max is ' + MAX_PAYLOAD)
  }

  const data = new Writer().uint32(1, portnum).bytes(2, payload).bool(3, opts.wantResponse)

  const mesh = new Writer()
    .fixed32(2, opts.to === undefined ? BROADCAST : opts.to)
    .uint32(3, opts.channel)
    .message(4, data)
    .fixed32(6, opts.id || randomId())
    .uint32(9, opts.hopLimit || HOP_LIMIT)
    .bool(10, opts.wantAck)

  return new Writer().message(1, mesh).toBuffer()
}

function textMessage(text, opts = {}) {
  return packet(PORT_TEXT_MESSAGE, Buffer.from(text), opts)
}

// Admin messages are addressed to the radio itself, which is why every one of
// these needs the node's own number.
function adminMessage(body, to) {
  return packet(PORT_ADMIN, body.toBuffer(), { to, wantResponse: true, hopLimit: 0 })
}

// AdminMessage.get_channel_request takes the slot index plus one, and its
// reply carries the session passkey that any following write must echo.
function getChannel(index, to) {
  return adminMessage(new Writer().uint32(1, index + 1), to)
}

// AdminMessage.set_channel, with the passkey from the matching get. The slot
// is left disabled: stored and handed out, never transmitted on.
function setChannel(index, { name, psk }, passkey, to) {
  if (psk.length > CHANNEL_PSK_SIZE) {
    throw new Error('psk is ' + psk.length + ' bytes, max is ' + CHANNEL_PSK_SIZE)
  }
  if (Buffer.from(name).length > CHANNEL_NAME_SIZE) {
    throw new Error('name is over ' + CHANNEL_NAME_SIZE + ' bytes')
  }

  const settings = new Writer().bytes(2, psk).bytes(3, Buffer.from(name))

  const channel = new Writer().uint32(1, index).message(2, settings).uint32(3, CHANNEL_DISABLED)

  const body = new Writer().message(33, channel).bytes(101, passkey)

  return adminMessage(body, to)
}

// The slice of AdminMessage this needs: a channel coming back, and the
// passkey that comes with it.
function decodeAdmin(data) {
  const admin = { channel: null, passkey: null }

  new Reader(data).each({
    2: (r) => (admin.channel = decodeChannel(r.message())),
    101: (r) => (admin.passkey = r.bytes())
  })

  return admin
}

// Mesh packet ids only need to be unlikely to collide: the mesh uses them to
// dedupe relayed copies and to match an ack to its packet.
function randomId() {
  return (Math.random() * 0x100000000) >>> 0 || 1
}

// How Meshtastic renders a node number everywhere in its UI.
function nodeId(num) {
  return '!' + (num >>> 0).toString(16).padStart(8, '0')
}

module.exports = {
  SERVICE_UUID,
  TO_RADIO_UUID,
  FROM_RADIO_UUID,
  FROM_NUM_UUID,
  BROADCAST,
  CHANNEL_DISABLED,
  CHANNEL_PRIMARY,
  CHANNEL_PSK_SIZE,
  CHANNEL_NAME_SIZE,
  PORT_TEXT_MESSAGE,
  PORT_ADMIN,
  MAX_PAYLOAD,
  decode,
  decodeAdmin,
  wantConfig,
  textMessage,
  getChannel,
  setChannel,
  nodeId
}
