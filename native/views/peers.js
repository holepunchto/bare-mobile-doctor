const { Text, View } = require('bare-native')
const styles = require('./peers.style')

module.exports = function peers(onSelect) {
  const view = new View()
  view.style = styles.peers

  const rows = new Map()

  const empty = new Text('No peer yet')
  empty.style = styles.empty

  view.appendChild(empty)

  return { view, update }

  function update(id, name, rssi) {
    if (rows.size === 0) view.removeChild(empty)

    const row = rows.get(id) || add(id, name)

    row.text = `${rssi} dBm`
  }

  function add(id, name) {
    const row = new View()
    row.style = styles.peer

    row.on('pointerup', () => onSelect(id))

    const label = new Text(name)
    label.style = styles.name

    const rssi = new Text()
    rssi.style = styles.rssi

    row.appendChild(label)
    row.appendChild(rssi)
    view.appendChild(row)

    rows.set(id, rssi)

    return rssi
  }
}
