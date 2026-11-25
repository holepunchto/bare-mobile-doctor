const { StyleSheet } = require('bare-native')
const theme = require('./theme')

module.exports = StyleSheet.create({
  logs: {
    flex: 1,
    backgroundColor: theme.console
  },
  content: {
    padding: 16,
    gap: 4
  },
  line: {
    color: theme.line,
    fontFamily: theme.mono,
    fontSize: 13
  }
})
