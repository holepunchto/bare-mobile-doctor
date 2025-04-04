import React, { useState, useEffect } from 'react'
import { Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Worklet } from 'react-native-bare-kit'
const source = require('./checksum.bundle')

function isSuccessCode(data: Uint8Array) {
  return (
    data[0] === 100 && data[1] === 111 && data[2] === 110 && data[3] === 101
  )
}

export default function ChecksumTests() {
  const [isRunning, setIsRunning] = useState(false)
  const [hasSucceeded, setHasSucceeded] = useState(false)
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [startTime, setStartTime] = useState(0)

  useEffect(() => {
    if (!isRunning) return

    const worklet = new Worklet()
    worklet.start('checksum.bundle', source)

    console.log('worklet', worklet)
    const { IPC } = worklet
    IPC.on('data', (data: any) => {
      if (data.length === 4) {
        setHasSucceeded(isSuccessCode(data))
        setIsRunning(false)
        setTimeElapsed(Date.now() - startTime)
        worklet.terminate()
      } else {
        IPC.write(data)
      }
    })

    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [isRunning])

  const runTests = () => {
    if (isRunning) return
    setIsRunning(true)
    setStartTime(Date.now())
  }

  return (
    <>
      <TouchableOpacity
        style={
          isRunning ? [styles.button, styles.buttonDisabled] : styles.button
        }
        onPress={runTests}
        disabled={isRunning}
      >
        <Text style={styles.buttonText}>{`Run checksum tests`}</Text>
      </TouchableOpacity>

      {timeElapsed > 0 && !isRunning && (
        <Text style={styles.stats}>
          Time elapsed: {timeElapsed}ms | Succeeded:{' '}
          {hasSucceeded ? '✅' : '❌'}
        </Text>
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
  }
})
