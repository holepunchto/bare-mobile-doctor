const { StyleSheet } = require('bare-native')
const theme = require('./theme')

module.exports = StyleSheet.create({
  picker: {
    zIndex: 10,
    marginHorizontal: 16,
    marginBottom: 8
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: theme.surface
  },
  label: {
    color: theme.text,
    fontSize: 16,
    fontWeight: 'bold'
  },
  caret: {
    color: theme.muted,
    fontSize: 12
  },
  menu: {
    position: 'absolute',
    zIndex: 10,
    maxHeight: 320,
    borderRadius: 10,
    backgroundColor: theme.raised
  },
  hidden: {
    display: 'none'
  },
  menuContent: {
    padding: 6,
    gap: 2
  },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 6
  },
  itemSelected: {
    backgroundColor: theme.accent
  },
  itemLabel: {
    color: theme.line,
    fontSize: 15
  },
  itemLabelSelected: {
    color: theme.text
  }
})
