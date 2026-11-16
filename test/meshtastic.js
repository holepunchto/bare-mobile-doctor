// Wire-level tests for the Meshtastic codec, through its public API only.
//
// Every frame here is built with an independent BigInt protobuf encoder, so a
// bug in the codec's own Writer cannot hide behind the same bug in a helper.
// No device, no mocks - just bytes in, bytes out.

const assert = require('assert')
const m = require('../bare/meshtastic')

let passed = 0

function ok(what) {
  passed++
  console.log('ok  ' + what)
}

// --- an encoder that shares no code with the one under test -----------------

function varint(value) {
  let v = BigInt(value)
  if (v < 0n) v += 1n << 64n

  const out = []
  while (v > 0x7fn) {
    out.push(Number(v & 0x7fn) | 0x80)
    v >>= 7n
  }
  out.push(Number(v))
  return out
}

const tag = (field, wire) => varint((field << 3) | wire)
const sub = (field, bytes) => [...tag(field, 2), ...varint(bytes.length), ...bytes]
const bytes = (text) => [...Buffer.from(text)]

function fixed32(value) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(value >>> 0)
  return [...b]
}

function float(value) {
  const b = Buffer.alloc(4)
  b.writeFloatLE(value)
  return [...b]
}

// --- encoding ---------------------------------------------------------------

assert.deepStrictEqual(
  [...m.textMessage('hi', { id: 0x01020304 })],
  [
    0x0a,
    0x14, // ToRadio.packet, 20 bytes
    0x15,
    0xff,
    0xff,
    0xff,
    0xff, // to = broadcast (fixed32)
    0x22,
    0x06, // decoded, 6 bytes
    0x08,
    0x01, //   portnum = TEXT_MESSAGE_APP
    0x12,
    0x02,
    0x68,
    0x69, //   payload = 'hi'
    0x35,
    0x04,
    0x03,
    0x02,
    0x01, // id (fixed32 LE)
    0x48,
    0x03 // hop_limit = 3
  ]
)
ok('textMessage produces the exact bytes mesh.proto describes')

const direct = m.textMessage('x', { id: 1, to: 0xdeadbeef, wantAck: true, hopLimit: 7 })
assert.ok(direct.includes(Buffer.from([0x50, 0x01])), 'want_ack')
assert.ok(direct.includes(Buffer.from([0x15, 0xef, 0xbe, 0xad, 0xde])), 'to')
assert.ok(direct.includes(Buffer.from([0x48, 0x07])), 'hop_limit')
ok('textMessage honours to / wantAck / hopLimit')

assert.deepStrictEqual([...m.wantConfig(0x2a)], [0x18, 0x2a])
ok('wantConfig')

assert.throws(() => m.textMessage('a'.repeat(234)), /max is 233/)
assert.doesNotThrow(() => m.textMessage('a'.repeat(233)))
ok('the 233-byte payload ceiling throws rather than truncating')

// --- admin: reading a channel slot, then writing it -------------------------

const asked = m.getChannel(1, 0xdeadbeef)
assert.ok(asked.includes(Buffer.from([0x08, 0x06])), 'portnum = ADMIN_APP')
assert.ok(asked.includes(Buffer.from([0x15, 0xef, 0xbe, 0xad, 0xde])), 'addressed to our node')
assert.ok(asked.includes(Buffer.from([0x18, 0x01])), 'want_response')
assert.ok(asked.includes(Buffer.from([0x12, 0x02, 0x08, 0x02])), 'get_channel_request = index + 1')
ok('getChannel asks our own node for slot index + 1')

const key = Buffer.alloc(32, 0xab)
const passkey = Buffer.from([1, 2, 3, 4])
const settings = [...sub(2, [...key]), ...sub(3, bytes('beacon'))]
const channel = [...tag(1, 0), ...varint(1), ...sub(2, settings)] // role 0 is omitted
assert.ok(
  m
    .setChannel(1, { name: 'beacon', psk: key }, passkey, 1)
    .includes(Buffer.from([...sub(33, channel), ...sub(101, [...passkey])]))
)
ok('setChannel writes psk + name + passkey, leaving the slot DISABLED')

assert.doesNotThrow(() => m.setChannel(1, { name: 'b', psk: Buffer.alloc(32) }, passkey, 1))
assert.throws(() => m.setChannel(1, { name: 'b', psk: Buffer.alloc(33) }, passkey, 1), /max is 32/)
assert.throws(() => m.setChannel(1, { name: 'a'.repeat(13), psk: key }, passkey, 1), /over 12/)
ok('a 32-byte key fits exactly; 33 bytes and a 13-char name throw')

// --- decoding ---------------------------------------------------------------

const data = [...tag(1, 0), ...varint(1), ...sub(2, bytes('yo'))]
const packet = [
  ...tag(1, 5),
  ...fixed32(0x11223344), // from
  ...tag(2, 5),
  ...fixed32(0xffffffff), // to
  ...sub(4, data),
  ...tag(6, 5),
  ...fixed32(0x99887766), // id
  ...tag(8, 5),
  ...float(-7.25), // rx_snr
  ...tag(9, 0),
  ...varint(2), // hop_limit
  ...tag(12, 0),
  ...varint(-95), // rx_rssi, a negative int32
  ...tag(15, 0),
  ...varint(3) // hop_start
]
const frame = m.decode(Buffer.from([...tag(1, 0), ...varint(7), ...sub(2, packet)]))

assert.strictEqual(frame.type, 'packet')
assert.strictEqual(frame.packet.from, 0x11223344)
assert.strictEqual(frame.packet.to, m.BROADCAST)
assert.strictEqual(frame.packet.snr, -7.25)
assert.strictEqual(frame.packet.rssi, -95)
assert.strictEqual(frame.packet.hopLimit, 2)
assert.strictEqual(frame.packet.hopStart, 3)
assert.strictEqual(Buffer.from(frame.packet.data.payload).toString(), 'yo')
ok('a mesh packet decodes, negative int32 rssi and float snr included')

const my = m.decode(Buffer.from(sub(3, [...tag(1, 0), ...varint(0xdeadbeef)])))
assert.strictEqual(my.type, 'myInfo')
assert.strictEqual(m.nodeId(my.nodeNum), '!deadbeef')
ok('myInfo, and nodeId renders it the way Meshtastic does')

const user = [...sub(1, bytes('!abc')), ...sub(2, bytes('Tony Node')), ...sub(3, bytes('TNY'))]
const node = m.decode(
  Buffer.from(sub(4, [...tag(1, 0), ...varint(42), ...sub(2, user), ...tag(9, 0), ...varint(2)]))
)
assert.strictEqual(node.node.user.longName, 'Tony Node')
assert.strictEqual(node.node.hopsAway, 2)
ok('nodeInfo with its user and hop count')

assert.strictEqual(m.decode(Buffer.from([...tag(7, 0), ...varint(9)])).configId, 9)
ok('configComplete')

// --- LoRa config and channels ----------------------------------------------

const lora = [
  ...tag(1, 0),
  ...varint(1), // use_preset
  ...tag(2, 0),
  ...varint(0), // LONG_FAST
  ...tag(7, 0),
  ...varint(3), // EU_868
  ...tag(8, 0),
  ...varint(3)
]
assert.deepStrictEqual(m.decode(Buffer.from(sub(5, sub(6, lora)))).lora, {
  region: 'EU_868',
  preset: 'LONG_FAST',
  hopLimit: 3
})
ok('LoRa config names its region and preset')

const custom = [...tag(1, 0), ...varint(0), ...tag(2, 0), ...varint(6), ...tag(7, 0), ...varint(1)]
assert.strictEqual(m.decode(Buffer.from(sub(5, sub(6, custom)))).lora.preset, 'CUSTOM')
assert.strictEqual(
  m.decode(Buffer.from(sub(5, sub(6, [...tag(7, 0), ...varint(37)])))).lora.region,
  'ITU2_125CM'
)
assert.strictEqual(
  m.decode(Buffer.from(sub(5, sub(6, [...tag(7, 0), ...varint(99)])))).lora.region,
  'UNKNOWN'
)
ok('use_preset=false reads as CUSTOM; the last region is named; an unknown one is not invented')

const nonLora = m.decode(Buffer.from(sub(5, sub(1, [...tag(1, 0), ...varint(2)]))))
assert.strictEqual(nonLora.type, null)
assert.strictEqual(nonLora.lora, null)
ok('a config section that is not LoRa is ignored rather than half-read')

const slot = m.decode(
  Buffer.from(
    sub(10, [...tag(1, 0), ...varint(1), ...sub(2, settings), ...tag(3, 0), ...varint(1)])
  )
)
assert.strictEqual(slot.type, 'channel')
assert.strictEqual(slot.channel.name, 'beacon')
assert.strictEqual(slot.channel.psk.length, 32)
assert.strictEqual(slot.channel.role, m.CHANNEL_PRIMARY)
ok('a channel slot decodes with its 32-byte psk, which is where a core key lives')

// --- robustness against firmware we do not model ----------------------------

const unknown = m.decode(
  Buffer.from([
    ...tag(99, 0),
    ...varint(1234), // varint
    ...sub(98, [1, 2, 3, 4, 5]), // length-delimited
    ...tag(97, 5),
    ...fixed32(0xcafebabe), // 32-bit
    ...tag(96, 1),
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8, // 64-bit
    ...tag(7, 0),
    ...varint(9) // then one we know
  ])
)
assert.strictEqual(unknown.configId, 9)
ok('unknown fields of every wire type are skipped, and later fields still parse')

const encrypted = m.decode(Buffer.from(sub(2, [...tag(1, 5), ...fixed32(1), ...sub(5, [9, 9, 9])])))
assert.strictEqual(encrypted.packet.encrypted, true)
assert.strictEqual(encrypted.packet.data, null)
ok('an encrypted packet is flagged, never guessed at')

assert.throws(() => m.decode(Buffer.from([0x12, 0x0a, 0x01, 0x02])), /truncated/)
assert.throws(() => m.decode(Buffer.from([0xc9, 0x06, 0x01])), /truncated/)
assert.throws(() => m.decode(Buffer.from([0x08, 0xff])), /truncated/)
ok('truncated frames throw instead of returning junk')

console.log('\n' + passed + ' checks passed')
