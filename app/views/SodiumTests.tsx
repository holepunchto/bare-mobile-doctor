import { View, StyleSheet } from 'react-native'
import ThemedText from '../components/ThemedText'

export default function SodiumTests() {
  return (
    <View style={styles.container}>
      <ThemedText>Sodium Native tests coming soon...</ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  }
})
