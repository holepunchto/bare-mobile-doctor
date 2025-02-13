import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Pressable } from 'react-native'
import { worklet } from '../index'

interface TestResult {
  type: string
  [key: string]: any  // For other properties that vary by type
}

const testPayloads = {
  ping: {
    type: 'ping',
    data: 'test ping',
    assert: (response: TestResult) => 
      response.type === 'pong' && response.echo === 'test ping'
  },
  echo: {
    type: 'echo', 
    data: 'A'.repeat(1000),
    assert: (response: TestResult) => 
      response.type === 'echo_response' && response.data === 'A'.repeat(1000)
  },
  compute: {
    type: 'compute',
    iterations: 1000000,
    assert: (response: TestResult) => typeof response.result === 'number'
  },
  invalid: {
    payload: 'invalid json{',
    assert: (response: TestResult) => response.type === 'error'
  }
}

export function IPCTests() {
  const [results, setResults] = useState<TestResult[]>([])
  const [running, setRunning] = useState(false)
  const [expandedResults, setExpandedResults] = useState<number[]>([])

  useEffect(() => {
    const { IPC } = worklet
    IPC.setEncoding('utf8')
    
    IPC.on('data', (data: string) => {
      console.log('RN received:', data)
      try {
        const result = JSON.parse(data)
        console.log('Parsed response:', result)
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

    IPC.write(JSON.stringify(testPayloads.ping))
    IPC.write(JSON.stringify(testPayloads.echo))
    IPC.write(JSON.stringify(testPayloads.compute))
    IPC.write(testPayloads.invalid)

    setRunning(false)
  }

  const getTestForResponse = (result: TestResult) => {
    switch (result.type) {
      case 'pong': return testPayloads.ping
      case 'echo_response': return testPayloads.echo
      case 'compute': return testPayloads.compute
      case 'error': return testPayloads.invalid
      default: return null
    }
  }

  const toggleResult = (index: number) => {
    setExpandedResults(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
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
        {results.map((result, index) => {
          const test = getTestForResponse(result)
          const assertionPassed = test?.assert ? test.assert(result) : false
          const isExpanded = expandedResults.includes(index)

          return (
            <Pressable 
              key={index} 
              style={[
                styles.resultItem,
                !assertionPassed && styles.errorResult
              ]}
              onPress={() => toggleResult(index)}
            >
              <Text style={styles.resultName}>Response: {result.type}</Text>
              {isExpanded && (
                <Text style={styles.resultMessage}>
                  {JSON.stringify(result, null, 2)}
                </Text>
              )}
              <Text style={[
                styles.assertResult,
                assertionPassed ? styles.assertPassed : styles.assertFailed
              ]}>
                {assertionPassed ? '✓ Test passed' : '✗ Test failed'}
                <Text style={styles.toggleHint}> (tap to {isExpanded ? 'hide' : 'show'} details)</Text>
              </Text>
            </Pressable>
          )
        })}
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
  assertResult: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 5,
  },
  assertPassed: {
    color: '#4caf50',
  },
  assertFailed: {
    color: '#f44336',
  },
  toggleHint: {
    fontSize: 12,
    color: '#666',
    fontWeight: 'normal',
  },
})