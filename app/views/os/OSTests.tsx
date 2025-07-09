import React, { useState, useEffect } from 'react'
import { TouchableOpacity, StyleSheet, View, Platform } from 'react-native'

import { Worklet } from 'react-native-bare-kit'
import ThemedText from '../../components/ThemedText'
import b4a from 'b4a'

const source = require('./os.bundle')

export default function HypercoreTests() {
  const worklet = React.useRef(new Worklet()).current
  const [isRunning, setIsRunning] = useState(false)
  const [stats, setStats] = useState(null)
  const [type, setType] = useState('cpu')

  useEffect(() => {
    worklet.start('os.bundle', source, [Platform.OS])

    const { IPC } = worklet

    IPC.on('data', (data: string) => {
      try {
        let message = JSON.parse(b4a.toString(data))
        setStats(message)
        setIsRunning(false)
      } catch (err) {
        console.error('Failed to parse response:', err)
      }
    })

    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [])

  const runTests = async () => {
    if (isRunning) return
    setIsRunning(true)
    const startMessage = JSON.stringify({ type })
    worklet.IPC.write(b4a.from(startMessage))
  }

  return (
    <>
      <View style={styles.controls}>
        {['cpu', 'memory'].map((value) => (
          <TouchableOpacity
            key={value}
            style={[
              styles.optionButton,
              type === value && styles.selectedOption
            ]}
            onPress={() => setType(value)}
          >
            <ThemedText style={styles.optionText}>{value}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={
          isRunning ? [styles.button, styles.buttonDisabled] : styles.button
        }
        onPress={runTests}
        disabled={isRunning}
      >
        <ThemedText style={styles.buttonText}>
          Get {type.toUpperCase()} stats
        </ThemedText>
      </TouchableOpacity>

      {stats && typeof stats === 'object' && (
        <>
          <ThemedText style={[styles.header]}>Worklet Stats</ThemedText>
          {Object.entries(stats).map(([key, value]) => (
            <View key={key} style={styles.row}>
              <ThemedText style={styles.key}>{key}</ThemedText>
              <ThemedText style={styles.value}>{String(value)}</ThemedText>
            </View>
          ))}
        </>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10
  },
  optionButton: {
    backgroundColor: '#ccc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    marginHorizontal: 5
  },
  selectedOption: {
    backgroundColor: '#007AFF'
  },
  optionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600'
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
    alignSelf: 'center'
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
  header: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
    justifyContent: 'space-between'
  },
  key: {
    fontWeight: '500',
    fontSize: 14,
    color: '#333'
  },
  value: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right'
  }
})
