const { StyleSheet } = require('bare-native')
const theme = require('./theme')

module.exports = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  title: {
    color: theme.text,
    fontSize: 20,
    fontWeight: 'bold'
  },
  subtitle: {
    color: theme.muted,
    fontSize: 13
  }
})
