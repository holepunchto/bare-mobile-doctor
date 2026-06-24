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

module.exports = {
  Central,
  Server,
  Service,
  Characteristic,
  scanOptions,
  isPoweredOn
}
