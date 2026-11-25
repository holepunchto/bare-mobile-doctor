import { execFileSync } from 'child_process'
import { readFileSync, rmSync } from 'fs'

export default function device() {
  const out = 'build/devices.json'

  execFileSync('xcrun', ['devicectl', 'list', 'devices', '--json-output', out], {
    stdio: 'ignore'
  })

  const { result } = JSON.parse(readFileSync(out, 'utf8'))

  rmSync(out)

  const found = result.devices.find(
    ({ connectionProperties: c }) =>
      c.tunnelState === 'connected' && c.transportType !== 'sameMachine'
  )

  if (found === undefined) throw new Error('No iPhone connected')

  return found.hardwareProperties.udid
}
