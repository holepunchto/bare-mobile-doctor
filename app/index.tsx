import { useState, useEffect } from 'react'
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native'
import { Worklet } from 'react-native-bare-kit'
import { source } from './worklet.js'

const worklet = new Worklet()

export default function() {
  const [response, setResponse] = useState<string | null>(null)

  useEffect(() => {
    worklet.start('/app.js', source)

    const { IPC } = worklet
    IPC.setEncoding('utf8')
    IPC.on('data', (data: string) => setResponse(data))
  }, [])

  const pingWorklet = () => {
    const { IPC } = worklet
    IPC.write('ping')
  }

  return (
    <View style={styles.container}>
      <View style={styles.responseContainer}>
        <Text style={styles.label}>Worklet Response:</Text>
        <Text style={styles.response}>{response || 'No response yet'}</Text>
      </View>
      
      <TouchableOpacity 
        style={styles.button} 
        onPress={pingWorklet}
      >
        <Text style={styles.buttonText}>Ping Worklet</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  responseContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  response: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})
