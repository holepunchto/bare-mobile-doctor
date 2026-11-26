const { StyleSheet } = require('bare-native')
const theme = require('../ui/theme')

module.exports = StyleSheet.create({
  peers: {
    paddingHorizontal: 16,
    gap: 6
  },
  empty: {
    color: theme.muted,
    fontSize: 14,
    paddingVertical: 10
  },
  peer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: theme.card
  },
  name: {
    color: theme.text,
    fontSize: 15
  },
  rssi: {
    color: theme.muted,
    fontFamily: theme.mono,
    fontSize: 13
  }
})
