const { Text, View } = require('bare-native')
const styles = require('./options.style')

module.exports = function options(onChange) {
  const view = new View()
  view.style = styles.options

  let selected = null

  return {
    view,
    set,
    get value() {
      return selected
    }
  }

  function set(values = []) {
    for (const child of view.children) view.removeChild(child)

    selected = values.length === 0 ? null : values[0]

    const paints = []

    for (const value of values) {
      const chip = new View()
      const label = new Text(value)

      const paint = () => {
        const on = value === selected
        chip.style = [styles.option, on && styles.optionSelected]
        label.style = [styles.label, on && styles.labelSelected]
      }

      chip.on('pointerup', () => {
        selected = value

        for (const paint of paints) paint()

        onChange(value)
      })

      chip.appendChild(label)
      view.appendChild(chip)

      paints.push(paint)
      paint()
    }
  }
}
