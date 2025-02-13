import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { worklet } from '../index'

interface TestResult {
  name: string
  status: 'success' | 'error'
  message: string
  timestamp: string
}

export function IPCTests() {
  const [results, setResults] = useState<TestResult[]>([])
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const { IPC } = worklet
    IPC.setEncoding('utf8')
    
    IPC.on('data', (data: string) => {
      console.log('RN received:', data)
      try {
        const response = JSON.parse(data)
        console.log('Parsed response:', response)
        const result: TestResult = {
          name: `Response: ${response.type}`,
          status: response.error ? 'error' : 'success',
          message: JSON.stringify(response, null, 2),
          timestamp: new Date().toISOString()
        }
        setResults(prev => [...prev, result])
      } catch (err) {
        console.error('Failed to parse response:', err)
      }
    })
  }, [])

  const runTests = async () => {
    setRunning(true)
    setResults([])
    const { IPC } = worklet

    // Test 1: Basic ping
    IPC.write(JSON.stringify({
      type: 'ping',
      data: 'test ping'
    }))

    // Test 2: Echo large string
    IPC.write(JSON.stringify({
      type: 'echo',
      data: 'A'.repeat(1000)
    }))

    // Test 3: Heavy computation
    IPC.write(JSON.stringify({
      type: 'compute',
      iterations: 1000000
    }))

    // Test 4: Invalid message
    IPC.write('invalid json{')

    setRunning(false)
  }

  return (
    <>
      <TouchableOpacity 
        style={[styles.button, running && styles.buttonDisabled]} 
        onPress={runTests}
        disabled={running}
      >
        <Text style={styles.buttonText}>
          {running ? 'Running Tests...' : 'Run IPC Tests'}
        </Text>
      </TouchableOpacity>

      <ScrollView style={styles.results}>
        {results.map((result, index) => (
          <View 
            key={index} 
            style={[
              styles.resultItem,
              result.status === 'error' && styles.errorResult
            ]}
          >
            <Text style={styles.resultName}>{result.name}</Text>
            <Text style={styles.resultMessage}>{result.message}</Text>
            <Text style={styles.timestamp}>{result.timestamp}</Text>
          </View>
        ))}
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  results: {
    flex: 1,
  },
  resultItem: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginBottom: 10,
  },
  errorResult: {
    backgroundColor: '#ffebee',
  },
  resultName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  resultMessage: {
    fontSize: 14,
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
})