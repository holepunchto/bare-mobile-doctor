const { Text, View } = require('bare-native')
const styles = require('./stats.style')

module.exports = function stats() {
  const view = new View()
  view.style = styles.stats

  let rows = new Map()

  return { view, update, clear }

  function update(values) {
    const keys = Object.keys(values)

    if (keys.length !== rows.size || keys.some((key) => rows.has(key) === false)) {
      clear()
      rows = new Map(keys.map((key) => [key, row(key)]))
    }

    for (const key of keys) rows.get(key).text = String(values[key])
  }

  function clear() {
    for (const child of view.children) view.removeChild(child)

    rows = new Map()
  }

  function row(key) {
    const line = new View()
    line.style = styles.row

    const name = new Text(key)
    name.style = styles.key

    const value = new Text()
    value.style = styles.value

    line.appendChild(name)
    line.appendChild(value)
    view.appendChild(line)

    return value
  }
}
