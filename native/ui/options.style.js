const { StyleSheet } = require('bare-native')
const theme = require('./theme')

module.exports = StyleSheet.create({
  options: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: theme.surface
  },
  optionSelected: {
    backgroundColor: theme.selected
  },
  label: {
    color: theme.muted,
    fontSize: 14
  },
  labelSelected: {
    color: theme.text
  }
})
