const { Central } = require('bare-bluetooth')

module.exports = {
  name: 'Bluetooth',
  run(log) {
    const central = new Central()

    log.stats({ state: central.state })

    central.on('stateChange', (state) => log.stats({ state }))
    central.on('error', (err) => log(`error ${err.message}`))

    return () => central.destroy()
  }
}
