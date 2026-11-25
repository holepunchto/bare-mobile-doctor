const { StyleSheet } = require('bare-native')
const theme = require('./theme')

module.exports = StyleSheet.create({
  footer: {
    padding: 16
  },
  button: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: theme.accent
  },
  label: {
    color: theme.text,
    fontSize: 16,
    fontWeight: 'bold'
  }
})
