const isAndroid = Bare.platform === 'android'

const bluetooth = isAndroid ? require('bare-bluetooth-android') : require('bare-bluetooth-apple')

const Central = bluetooth.Central
const Server = isAndroid ? bluetooth.Server : bluetooth.PeripheralManager
const Service = bluetooth.Service
const Characteristic = bluetooth.Characteristic

const scanOptions = isAndroid ? { scanMode: Central.SCAN_MODE_LOW_LATENCY } : undefined

function isPoweredOn(state) {
  return state === 'poweredOn' || state === 'on'
}

function normalizeUUID(uuid) {
  return String(uuid || '')
    .toLowerCase()
    .replace(/-/g, '')
}

function matchesUUID(a, b) {
  return normalizeUUID(a) === normalizeUUID(b)
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

function characteristicMatches(char, uuid) {
  return char && matchesUUID(char.uuid, uuid)
}

function propertiesHex(char) {
  if (!char || typeof char.properties !== 'number') return 'unknown'
  return `0x${char.properties.toString(16)}`
}

const util = {
  normalizeUUID,
  matchesUUID,
  findUUID,
  characteristicMatches,
  propertiesHex
}

module.exports = {
  Central,
  Server,
  Service,
  Characteristic,
  scanOptions,
  isPoweredOn,
  util
}
