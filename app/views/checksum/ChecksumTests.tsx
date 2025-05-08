import React, { useState, useEffect } from 'react'
import { TouchableOpacity, StyleSheet, View, ActivityIndicator } from 'react-native'
import FramedStream from 'framed-stream'
import { Worklet } from 'react-native-bare-kit'

import ThemedText from '../../components/ThemedText'
import { formatTime } from '../../utils/date'
import usePerf from '../../hooks/usePerf'

const source = require('./checksum.bundle')

function isSuccessCode(data: Uint8Array) {
  return (
    data[0] === 100 && data[1] === 111 && data[2] === 110 && data[3] === 101
  )
}

export default function ChecksumTests() {
  const [isRunning, setIsRunning] = useState(false)
  const [hasSucceeded, setHasSucceeded] = useState(false)
  const { start: startTimer, stop: stopTimer, duration } = usePerf()
  const [type, setType] = useState<'basic' | 'framed'>('basic')

  useEffect(() => {
    if (!isRunning) return

    const worklet = new Worklet()
    worklet.start('checksum.bundle', source, [type])

    const { IPC } = worklet
    const stream = type === 'framed' ? new FramedStream(IPC) : IPC
    stream.on('data', (data: any) => {
      if (data.length === 4) {
        setHasSucceeded(isSuccessCode(data))
        setIsRunning(false)
        stopTimer(null)
        worklet.terminate()
      } else {
        stream.write(data)
      }
    })

    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [isRunning, type])

  const runTests = () => {
    if (isRunning) return
    setIsRunning(true)
    startTimer()
  }

  return (
    <>
      <View style={styles.controls}>
        <TouchableOpacity
          style={[
            styles.optionButton,
            type === 'basic' && styles.selectedOption
          ]}
          onPress={() => setType('basic')}
          disabled={isRunning}
        >
          <ThemedText style={styles.optionText}>Basic</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.optionButton,
            type === 'framed' && styles.selectedOption
          ]}
          onPress={() => setType('framed')}
          disabled={isRunning}
        >
          <ThemedText style={styles.optionText}>Framed</ThemedText>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={
          isRunning ? [styles.button, styles.buttonDisabled] : styles.button
        }
        onPress={runTests}
        disabled={isRunning}
      >
        <ThemedText
          style={styles.buttonText}
        >{`Run checksum tests (${type})`}</ThemedText>
      </TouchableOpacity>

      {isRunning && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <ThemedText style={styles.loadingText}>
            Running checksum test...{'\n'}This may take a minute or more
          </ThemedText>
        </View>
      )}

      {duration && duration > 0 && !isRunning && (
        <ThemedText style={styles.stats}>
          Time elapsed: {formatTime(duration)} | Succeeded:{' '}
          {hasSucceeded ? '✅' : '❌'}
        </ThemedText>
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
  stats: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20
  },
  loadingContainer: {
    alignItems: 'center',
    marginVertical: 20
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
    color: '#666'
  }
})
