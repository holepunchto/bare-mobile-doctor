// Installs the built app on the connected iPhone and streams its console.
import { execFileSync } from 'child_process'
import { createRequire } from 'module'
import device from './ios-device.mjs'

const { identifier } = createRequire(import.meta.url)('../native/build.js')

const app = process.argv[2] || 'build/ios/Doctor Native.app'
const udid = device()

const devicectl = (...args) =>
  execFileSync('xcrun', ['devicectl', 'device', ...args], { stdio: 'inherit' })

devicectl('install', 'app', '--device', udid, app)
devicectl('process', 'launch', '--device', udid, '--console', identifier)
