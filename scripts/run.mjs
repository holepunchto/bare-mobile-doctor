import { devices } from 'bare-device'

const [platform, app] = Bare.argv.slice(2)

const device = (await devices()).find(
  (device) => device.platform === platform && device.kind === 'device' && device.running
)

if (device === undefined) throw new Error(`No ${platform} device connected`)

await device.install(app)

const running = await device.launch(app, { stdio: 'inherit' })

await running.exited
