const { View } = require('bare-native')
const styles = require('./main-view.style')
const button = require('./ui/button')
const header = require('./ui/header')
const logs = require('./ui/logs')
const options = require('./ui/options')
const picker = require('./ui/picker')
const stats = require('./ui/stats')

module.exports = function mainView(modules) {
  const root = new View()
  root.style = styles.root

  const modes = options(reset)
  const values = stats()
  const output = logs()
  const run = button('Run', toggle)

  let selected = modules[0]
  let stop = null

  root.appendChild(header('Bare Doctor', `${Bare.platform}-${Bare.arch}`))
  root.appendChild(picker(modules, select))
  root.appendChild(modes.view)
  root.appendChild(values.view)
  root.appendChild(output.view)
  root.appendChild(run.view)

  modes.set(selected.options)

  log.replace = function (line) {
    console.log(line)
    output.replace(line)
  }

  log.stats = function (object) {
    console.log(
      Object.entries(object)
        .map(([key, value]) => `${key} ${value}`)
        .join(', ')
    )
    values.update(object)
  }

  return root

  function log(line) {
    console.log(line)
    output.line(line)
  }

  function select(module) {
    selected = module
    reset()
    modes.set(module.options)
  }

  function reset() {
    halt()
    values.clear()
    output.clear()
  }

  async function toggle() {
    if (stop !== null) return halt()

    reset()

    try {
      stop = (await selected.run(log, modes.value)) || null
      if (stop === null) log('done')
      else run.set('Stop')
    } catch (err) {
      log(`failed ${err.stack}`)
    }
  }

  function halt() {
    if (stop !== null) stop()
    stop = null
    run.set('Run')
  }
}
