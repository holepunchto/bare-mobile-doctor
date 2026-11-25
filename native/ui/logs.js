const { ScrollView, Text } = require('bare-native')
const styles = require('./logs.style')

const LINES = 200

module.exports = function logs() {
  const view = new ScrollView()
  view.style = styles.logs
  view.contentStyle = styles.content

  return { view, line, replace, clear }

  function line(text) {
    const entry = new Text(String(text))
    entry.style = styles.line

    if (view.children.length === LINES) view.removeChild(view.children[0])

    view.appendChild(entry)
    view.contentOffset = { y: Number.MAX_SAFE_INTEGER }
  }

  function replace(text) {
    const last = view.children[view.children.length - 1]

    if (last === undefined) return line(text)

    last.text = String(text)
  }

  function clear() {
    for (const entry of view.children) view.removeChild(entry)
  }
}
