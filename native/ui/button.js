const { Text, View } = require('bare-native')
const styles = require('./button.style')

module.exports = function button(text, onPress) {
  const view = new View()
  view.style = styles.footer

  const pressable = new View()
  pressable.style = styles.button

  const label = new Text(text)
  label.style = styles.label

  pressable.on('pointerup', onPress)

  pressable.appendChild(label)
  view.appendChild(pressable)

  return { view, set: (next) => (label.text = next) }
}
