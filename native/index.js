const { StyleSheet, Text, View, WebView, Window } = require('bare-native')

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    backgroundColor: '#101014'
  },
  header: {
    padding: 16,
    gap: 12
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold'
  },
  subtitle: {
    color: '#9aa0ae',
    fontSize: 14
  },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2d6cdf'
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 16
  },
  page: {
    flex: 1
  }
})

const window = new Window(420, 760)

const root = new View()
root.style = styles.root

const header = new View()
header.style = styles.header

const title = new Text('Bare Doctor')
title.style = styles.title

const subtitle = new Text(`${Bare.platform}-${Bare.arch}, bare ${Bare.version}`)
subtitle.style = styles.subtitle

const button = new View()
button.style = styles.button

const buttonLabel = new Text('Tap me')
buttonLabel.style = styles.buttonLabel

button.appendChild(buttonLabel)

let taps = 0

button.on('pointerup', () => {
  buttonLabel.text = `Tapped ${++taps}`
  console.log('tap', taps)
})

header.appendChild(title)
header.appendChild(subtitle)
header.appendChild(button)

const page = new WebView()
page.style = styles.page
page.inspectable = true
page.html = `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#1b1b22;color:#eaeaf0;font:16px system-ui,sans-serif">
web view alive
</body>`

root.appendChild(header)
root.appendChild(page)

window.content(root)
window.show()

console.log(`bare-doctor up on ${Bare.platform}-${Bare.arch}`)
