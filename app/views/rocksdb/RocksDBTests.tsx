import React, { useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'

import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'

const source = require('./rocksdb.bundle')

interface TestResultProps {
  testName: string
  hasSucceeded: boolean | null
  isRunning: boolean
}

function TestResult({ testName, hasSucceeded, isRunning }: TestResultProps) {
  return (
    <View style={styles.resultItem}>
      <Text style={styles.testName}>{testName}:</Text>
      {isRunning ? (
        <Text style={styles.pending}>⏳ Pending...</Text>
      ) : hasSucceeded === null ? (
        <Text style={styles.neutral}>-</Text>
      ) : hasSucceeded ? (
        <Text style={styles.success}>✅ Passed</Text>
      ) : (
        <Text style={styles.error}>❌ Failed</Text>
      )}
    </View>
  )
}

const ErrorList = ({ errors }: { errors: string[] }) => {
  if (!errors || errors.length === 0) return null

  return (
    <View style={styles.errorContainer}>
      {errors.map((error: any, index: any) => (
        <Text key={index} style={styles.errorText}>
          • {error}
        </Text>
      ))}
    </View>
  )
}

export default function RocksDBTests() {
  const worklet = React.useRef(new Worklet()).current

  const [isRunning, setIsRunning] = React.useState(false)
  const [readWriteHasSucceeded, setReadWriteHasSucceeded] = React.useState<
    boolean | null
  >(null)
  const [errors, setErrors] = React.useState<string[]>([])

  useEffect(() => {
    worklet.start('rocksdb.bundle', source)

    const { IPC } = worklet
    IPC.on('data', (data: string) => {
      try {
        const dataString = b4a.toString(data)
        const messages = dataString.split('\n').filter(Boolean)

        messages.forEach((message) => {
          const jsonMessage = JSON.parse(message)

          const hasSucceeded = jsonMessage.response === 'hello world'
          setReadWriteHasSucceeded(hasSucceeded)

          if (!hasSucceeded && jsonMessage.message) {
            setErrors((errors) => [...errors, jsonMessage.message])
          }
        })
      } catch (err) {
        console.error('Failed to parse response:', err)
      } finally {
        setIsRunning(false)
      }
    })

    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [])

  const runTests = () => {
    const { IPC } = worklet
    setIsRunning(true)
    IPC.write(
      b4a.from(JSON.stringify({ test: 'read/write', payload: 'hello world' }))
    )
  }

  return (
    <View>
      <TouchableOpacity
        style={[styles.button, isRunning && styles.buttonDisabled]}
        onPress={runTests}
        disabled={isRunning}
      >
        <Text style={styles.buttonText}>
          {isRunning ? 'Running...' : 'Run RocksDB Tests'}
        </Text>
      </TouchableOpacity>

      <View style={styles.resultsContainer}>
        <Text style={styles.resultTitle}>Test Results</Text>
        <TestResult
          testName='Read/Write'
          hasSucceeded={readWriteHasSucceeded}
          isRunning={isRunning}
        />
      </View>
      <ErrorList errors={errors} />
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 5,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20
  },
  buttonDisabled: {
    backgroundColor: '#B0B0B0'
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold'
  },
  neutral: {
    color: '#666',
    fontWeight: 'bold'
  },
  resultsContainer: {
    width: '100%',
    padding: 15,
    backgroundColor: '#FFF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center'
  },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5
  },
  testName: {
    fontSize: 16,
    fontWeight: '500'
  },
  success: {
    color: '#28A745',
    fontWeight: 'bold'
  },
  error: {
    color: '#DC3545',
    fontWeight: 'bold'
  },
  pending: {
    color: '#FFA500',
    fontWeight: 'bold'
  },
  errorContainer: {
    marginTop: 5,
    paddingLeft: 10
  },
  errorText: {
    color: '#DC3545',
    fontSize: 14
  }
})
