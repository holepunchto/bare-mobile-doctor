import { EventEmitter, EventMap } from 'bare-events'

/**
 * The BLE service a Meshtastic radio advertises, and the three
 * characteristics behind it. From the official client API; note that the
 * older ESP32 docs give `8ba2bcc2-...` for FromRadio, which is obsolete.
 *
 * @see https://meshtastic.org/docs/development/device/client-api/
 */
export const SERVICE_UUID: string

/** Write a `ToRadio` frame here to send it. */
export const TO_RADIO_UUID: string

/** Read here to pop one queued `FromRadio` frame; an empty read means the queue is drained. */
export const FROM_RADIO_UUID: string

/** Notifies whenever the radio has queued a frame on {@link FROM_RADIO_UUID}. */
export const FROM_NUM_UUID: string

/** The node number every radio in range listens on. */
export const BROADCAST: number

/** `Channel.Role`. A disabled slot is still stored in flash and still handed to every client. */
export const CHANNEL_DISABLED: 0
export const CHANNEL_PRIMARY: 1

/** `ChannelSettings.psk` is capped at 32 bytes, `name` at 12. */
export const CHANNEL_PSK_SIZE: 32
export const CHANNEL_NAME_SIZE: 12

export const PORT_TEXT_MESSAGE: 1
export const PORT_POSITION: 3
export const PORT_NODEINFO: 4
export const PORT_ROUTING: 5
export const PORT_ADMIN: 6
export const PORT_TELEMETRY: 67

/** `Constants.DATA_PAYLOAD_LEN`: the ceiling on one mesh payload. */
export const MAX_PAYLOAD: 233

export interface User {
  id: string | null
  longName: string | null
  shortName: string | null
}

export interface Node {
  num: number
  user: User | null
  snr: number
  hopsAway: number | null
}

export interface Data {
  portnum: number
  payload: Uint8Array | null
  /** On a reply, the id of the packet it answers. Zero otherwise. */
  requestId: number
}

/** The mesh's answer to a packet sent with `wantAck`. */
export interface Routing {
  /** `Routing.Error` as a number. */
  error: number
  /** `NONE`, `MAX_RETRANSMIT`, ... or `UNKNOWN` for a reason this version does not name. */
  reason: string
  /** True when `error` is `NONE`. */
  delivered: boolean
}

export interface Position {
  /** Degrees, already divided out of the fixed-point the wire uses. Null when not sent. */
  latitude: number | null
  longitude: number | null
  /** Metres. */
  altitude: number | null
  time: number
}

/** `Telemetry.device_metrics`. Every field is null when the radio did not send it. */
export interface Telemetry {
  time: number
  /** Percent. */
  battery: number | null
  voltage: number | null
  channelUtilization: number | null
  airUtilTx: number | null
  uptime: number | null
}

export interface Packet {
  from: number
  to: number
  id: number
  /** Null when the packet arrived encrypted, in which case `encrypted` is set. */
  data: Data | null
  encrypted: boolean
  snr: number
  rssi: number
  hopLimit: number
  hopStart: number
}

export interface LoRaConfig {
  /** `UNSET`, `EU_868`, `US`, ... or `UNKNOWN` for a region this version does not name. */
  region: string
  /** `LONG_FAST`, `SHORT_TURBO`, ... or `CUSTOM` when the radio is not on a preset. */
  preset: string
  hopLimit: number
}

export interface Channel {
  index: number
  name: string | null
  psk: Uint8Array | null
  role: number
}

export type FrameType =
  'packet' | 'myInfo' | 'nodeInfo' | 'config' | 'configComplete' | 'channel' | null

/**
 * One `FromRadio` frame. `type` names which variant arrived, and is null for
 * anything this codec does not model - position, telemetry, waypoints. Fields
 * it does not know are skipped by wire type, so newer firmware still parses.
 */
export interface Frame {
  id: number
  type: FrameType
  packet: Packet | null
  node: Node | null
  nodeNum: number
  configId: number
  lora: LoRaConfig | null
  channel: Channel | null
}

/** The slice of `AdminMessage` this models. */
export interface Admin {
  channel: Channel | null
  /** Echo this in the next write; the radio expires it after 300 seconds. */
  passkey: Uint8Array | null
}

export interface PacketOptions {
  /** Defaults to {@link BROADCAST}. */
  to?: number
  channel?: number
  /**
   * The mesh uses this to dedupe relayed copies and to match an ack to its
   * packet, so it only needs to be unlikely to collide - it is not a secret.
   * Defaults to a `Math.random` draw; pass your own if you want otherwise.
   */
  id?: number
  hopLimit?: number
  wantAck?: boolean
  wantResponse?: boolean
}

export function decode(data: Uint8Array): Frame

export function decodeAdmin(data: Uint8Array): Admin

/** Decodes a {@link PORT_ROUTING} payload. */
export function decodeRouting(data: Uint8Array): Routing

/** Decodes a {@link PORT_POSITION} payload. */
export function decodePosition(data: Uint8Array): Position

/** Decodes a {@link PORT_TELEMETRY} payload. */
export function decodeTelemetry(data: Uint8Array): Telemetry

/** Decodes a {@link PORT_NODEINFO} payload: a node announcing itself over the air. */
export function decodeUserPayload(data: Uint8Array): User

/**
 * Ask the radio to stream its node database back. It answers with `myInfo`,
 * one `nodeInfo` per known node, then `configComplete` echoing `id`, which is
 * how a stale reply is told apart.
 */
export function wantConfig(id: number): Buffer

/** Throws if the payload is over {@link MAX_PAYLOAD}, rather than truncating it. */
export function textMessage(text: string, opts?: PacketOptions): Buffer

/**
 * `AdminMessage.get_channel_request` for one slot, addressed to the radio
 * itself. Its reply carries the session passkey that any following write must
 * echo, so a read always comes first.
 */
export function getChannel(index: number, to: number): Buffer

/**
 * `AdminMessage.set_channel`, with the passkey from the matching
 * {@link getChannel}. The slot is left {@link CHANNEL_DISABLED}: stored and
 * handed out, never transmitted on. Throws if `psk` or `name` is too long.
 */
export function setChannel(
  index: number,
  settings: { name: string; psk: Uint8Array },
  passkey: Uint8Array,
  to: number
): Buffer

/** Renders a node number the way Meshtastic does everywhere: `!f60c6290`. */
export function nodeId(num: number): string

export interface ClientEventMap extends EventMap {
  /** The node database has finished streaming in. */
  ready: []
  message: [message: Message]
  /** The fate of a packet sent with `wantAck`, carrying the id it answers. */
  ack: [ack: Routing & { id: number }]
  position: [position: Position & Sender]
  telemetry: [telemetry: Telemetry & Sender]
  node: [node: Node]
  admin: [admin: Admin]
  disconnect: []
  error: [error: Error]
}

export interface Sender {
  from: string
  /** The sender's short name if known, otherwise its node id. */
  name: string
}

export interface Message extends Sender {
  text: string
  snr: number
  rssi: number
  hops: number
  /** False when the packet was a broadcast. */
  direct: boolean
}

export interface ClientOptions {
  /** Ask the link for the next message. Whatever it returns must reach {@link Client.push}. */
  read: () => void
  write: (frame: Buffer) => void
  close?: () => void
  log?: (...args: any[]) => void
}

/**
 * The Meshtastic conversation, with no idea what it is talking over.
 *
 * Meshtastic defines its own framing and its own exchanges, and both are the
 * same whether the link is BLE, serial or TCP - only the bytes arrive
 * differently. So this holds the state machine and the caller holds the wire.
 *
 * Over BLE one read returns exactly one message, which is what `push` expects.
 * A serial link would reframe its stream on `0x94 0xc3 <len>` first and push
 * whole messages the same way.
 *
 * ```js
 * const client = new Client({
 *   read: () => peripheral.read(fromRadio),
 *   write: (frame) => peripheral.write(toRadio, frame, true)
 * })
 *
 * client.on('message', (m) => console.log(m.name, m.text))
 * client.sync()
 * ```
 */
export class Client extends EventEmitter<ClientEventMap> {
  constructor(opts: ClientOptions)

  readonly nodeNum: number
  readonly nodes: Map<number, Node>
  readonly lora: LoRaConfig | null
  readonly channels: Map<number, Channel>

  /** This radio's own node number, rendered by {@link nodeId}. */
  readonly id: string

  /** Ask for the node database, then drain whatever the radio has queued. Emits `ready`. */
  sync(): void

  send(text: string): void

  getChannel(index: number): void

  setChannel(index: number, settings: { name: string; psk: Uint8Array }, passkey: Uint8Array): void

  /** Tell the client the radio has something waiting. Only one read is ever outstanding. */
  notify(): void

  /** One message off the link. Null or empty means the queue is drained. */
  push(data: Uint8Array | null): void

  nameOf(num: number): string

  destroy(): void
}
