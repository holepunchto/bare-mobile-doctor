import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'

import FramedStream from 'framed-stream'
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'

const source = require('./rocksdb.bundle')

interface BenchmarkResult {
  dir: string
  recordsRead: number
  duration: number
  rate: number
}

interface TestResultProps {
  testName: string
  hasSucceeded: boolean | null
  isRunning: boolean
  result?: BenchmarkResult
}

function TestResult({ testName, hasSucceeded, isRunning, result }: TestResultProps) {
  return (
    <View style={styles.resultItem}>
      <Text style={styles.testName}>{testName}:</Text>
      {isRunning ? (
        <Text style={styles.pending}>⏳ Running...</Text>
      ) : hasSucceeded === null ? (
        <Text style={styles.neutral}>-</Text>
      ) : hasSucceeded ? (
        <View>
          <Text style={styles.success}>✅ Completed</Text>
          {result && (
            <Text style={styles.resultDetails}>
              {result.recordsRead} records in {result.duration}s ({result.rate} records/s)
            </Text>
          )}
        </View>
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
  const ipc = useRef<any>(null)

  const [isGenerating, setIsGenerating] = React.useState(false)
  const [isRunning, setIsRunning] = React.useState(false)
  const [generationStatus, setGenerationStatus] = React.useState<string>('')
  const [benchmarkResults, setBenchmarkResults] = React.useState<BenchmarkResult[]>([])
  const [errors, setErrors] = React.useState<string[]>([])

  useEffect(() => {
    worklet.start('rocksdb.bundle', source)

    ipc.current = new FramedStream(worklet.IPC)
    ipc.current.on('data', (data: string) => {
      try {
        const dataString = b4a.toString(data)
        const message = JSON.parse(dataString)
        console.log('Received response:', message)

        if (message.success && message.result) {
          // Benchmark result
          setBenchmarkResults(prev => [...prev, message.result])
          setIsRunning(false)
        } else if (message.success && message.message) {
          // Generation success
          setGenerationStatus(message.message)
          setIsGenerating(false)
        } else if (message.error) {
          // Error occurred
          setErrors(prev => [...prev, message.error])
          setIsGenerating(false)
          setIsRunning(false)
        }
      } catch (err) {
        console.error('Failed to parse response:', err)
        setIsGenerating(false)
        setIsRunning(false)
      }
    })

    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [])

  const generateDatabases = () => {
    setIsGenerating(true)
    setErrors([])
    setGenerationStatus('')
    
    // Generate databases for different sizes
    const sizes = [1e4, 1e5, 1e6]
    const types = ['hyperdb', 'raw']
    
    sizes.forEach(size => {
      types.forEach(type => {
        const message = JSON.stringify({ 
          action: 'generate', 
          payload: { type, size } 
        })
        ipc.current.write(b4a.from(message))
      })
    })
  }

  const runBenchmarks = () => {
    setIsRunning(true)
    setErrors([])
    setBenchmarkResults([])
    
    // Run benchmarks for different sizes
    const sizes = [1e4, 1e5, 1e6]
    const types = ['hyperdb', 'raw']
    
    sizes.forEach(size => {
      types.forEach(type => {
        const message = JSON.stringify({ 
          action: 'bench', 
          payload: { type, size } 
        })
        ipc.current.write(b4a.from(message))
      })
    })
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, isGenerating && styles.buttonDisabled]}
          onPress={generateDatabases}
          disabled={isGenerating || isRunning}
        >
          <Text style={styles.buttonText}>
            {isGenerating ? 'Generating...' : 'Generate Databases'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.runButton, isRunning && styles.buttonDisabled]}
          onPress={runBenchmarks}
          disabled={isGenerating || isRunning}
        >
          <Text style={styles.buttonText}>
            {isRunning ? 'Running...' : 'Run Benchmarks'}
          </Text>
        </TouchableOpacity>
      </View>

      {generationStatus && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>{generationStatus}</Text>
        </View>
      )}

      <View style={styles.resultsContainer}>
        <Text style={styles.resultTitle}>Benchmark Results</Text>
        {benchmarkResults.map((result, index) => (
          <TestResult
            key={index}
            testName={`${result.dir}`}
            hasSucceeded={true}
            isRunning={false}
            result={result}
          />
        ))}
        {benchmarkResults.length === 0 && !isRunning && (
          <Text style={styles.noResults}>No benchmark results yet</Text>
        )}
      </View>
      
      <ErrorList errors={errors} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 5,
    flex: 1,
    alignItems: 'center'
  },
  runButton: {
    backgroundColor: '#28A745'
  },
  buttonDisabled: {
    backgroundColor: '#B0B0B0'
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold'
  },
  statusContainer: {
    backgroundColor: '#E8F5E8',
    padding: 10,
    borderRadius: 5,
    marginBottom: 20
  },
  statusText: {
    color: '#28A745',
    textAlign: 'center',
    fontWeight: '500'
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
    elevation: 3,
    marginBottom: 20
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
    paddingVertical: 5,
    alignItems: 'flex-start'
  },
  testName: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1
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
  resultDetails: {
    color: '#666',
    fontSize: 12,
    marginTop: 2
  },
  noResults: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic'
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
