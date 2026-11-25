const { StyleSheet } = require('bare-native')
const theme = require('./ui/theme')

module.exports = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    backgroundColor: theme.background
  }
})
