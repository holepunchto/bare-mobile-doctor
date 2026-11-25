const { StyleSheet } = require('bare-native')
const theme = require('./theme')

module.exports = StyleSheet.create({
  stats: {
    paddingHorizontal: 16,
    gap: 6
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: theme.card
  },
  key: {
    color: theme.muted,
    fontSize: 14
  },
  value: {
    color: theme.text,
    fontFamily: theme.mono,
    fontSize: 15
  }
})
