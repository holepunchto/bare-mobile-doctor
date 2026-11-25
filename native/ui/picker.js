const { ScrollView, Text, View } = require('bare-native')
const styles = require('./picker.style')

module.exports = function picker(items, onSelect) {
  const view = new View()
  view.style = styles.picker

  const trigger = new View()
  trigger.style = styles.trigger

  const label = new Text(items[0].name)
  label.style = styles.label

  const caret = new Text('v')
  caret.style = styles.caret

  const menu = new ScrollView()
  menu.contentStyle = styles.menuContent
  menu.anchor = { to: trigger, side: 'bottom', align: 'start', offset: 4, match: 'width' }

  const paints = []

  let selected = items[0]
  let open = false

  for (const item of items) {
    const row = new View()
    const name = new Text(item.name)

    const paint = () => {
      const on = item === selected
      row.style = [styles.item, on && styles.itemSelected]
      name.style = [styles.itemLabel, on && styles.itemLabelSelected]
    }

    row.on('pointerup', () => {
      selected = item
      label.text = item.name

      for (const paint of paints) paint()

      toggle(false)
      onSelect(item)
    })

    row.appendChild(name)
    menu.appendChild(row)

    paints.push(paint)
    paint()
  }

  trigger.on('pointerup', () => toggle())

  trigger.appendChild(label)
  trigger.appendChild(caret)

  view.appendChild(trigger)
  view.appendChild(menu)

  toggle(false)

  return view

  function toggle(next = open === false) {
    open = next
    menu.style = [styles.menu, open === false && styles.hidden]
    caret.text = open ? '^' : 'v'
  }
}
