import React, { useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Worklet } from 'react-native-bare-kit'

const source = require('./udx.bundle');

export function UDXTests() {
  const [isRunning, setIsRunning] = React.useState(false)
  const [socketTestsHasSucceeded, setSocketTestsHasSucceeded] = React.useState(null)
  const [streamTestsHasSucceeded, setStreamTestsHasSucceeded] = React.useState(null)
  const worklet = React.useRef(new Worklet()).current

  useEffect(() => {
    worklet.start('udx.bundle', source)

    const { IPC } = worklet
    IPC.setEncoding('utf8')
    IPC.on('data', (data: string) => {
      try {
        const messages = data.split('\n').filter(Boolean)

        messages.forEach((message) => {
          const jsonMessage = JSON.parse(message);
          if (jsonMessage.type === 'socket') {
            setSocketTestsHasSucceeded(jsonMessage.hasSucceeded)
          }
          if (jsonMessage.type === 'stream') {
            setStreamTestsHasSucceeded(jsonMessage.hasSucceeded)
          }
        })
      } catch (err) {
        console.error('Failed to parse response:', err)
      } finally {
        setIsRunning(false)
      }
    })

    return () => {
      worklet.terminate()
    }
  }, [])

  const runSocketTests = () => {
    const { IPC } = worklet
    setIsRunning(true)
    IPC.write('socket');
  }

  const runStreamTests = () => {
    const { IPC } = worklet
    setIsRunning(true)
    IPC.write('stream');
  }


  return (
    <View>
      <TouchableOpacity
        style={
          isRunning ? [styles.button, styles.buttonDisabled] : styles.button
        }
        onPress={runSocketTests}
        disabled={isRunning}
      >
        <Text style={styles.buttonText}>{'Run Socket Tests'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={
          isRunning ? [styles.button, styles.buttonDisabled] : styles.button
        }
        onPress={runStreamTests}
        disabled={isRunning}
      >
        <Text style={styles.buttonText}>{'Run Stream Tests'}</Text>
      </TouchableOpacity>
      {socketTestsHasSucceeded !== null && (
        <Text style={styles.stats}>
          {socketTestsHasSucceeded ? 'Socket tests succeeded' : 'Socket tests failed'}
        </Text>
      )}
      {streamTestsHasSucceeded !== null && (
        <Text style={styles.stats}>
          {streamTestsHasSucceeded ? 'Stream tests succeeded' : 'Stream tests failed'}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  stats: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20
  }
})
