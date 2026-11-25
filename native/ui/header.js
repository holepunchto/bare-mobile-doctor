const { Text, View } = require('bare-native')
const styles = require('./header.style')

module.exports = function header(title, subtitle) {
  const view = new View()
  view.style = styles.header

  const left = new Text(title)
  left.style = styles.title

  const right = new Text(subtitle)
  right.style = styles.subtitle

  view.appendChild(left)
  view.appendChild(right)

  return view
}
