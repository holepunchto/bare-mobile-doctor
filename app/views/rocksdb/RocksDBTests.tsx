import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView
} from 'react-native'

import FramedStream from 'framed-stream'
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'

import useBareDir from '../../hooks/useBareDir'
import ExecutionLog from './ExecutionLog'
import TestResult from './TestResult'

const source = require('./rocksdb.bundle')
const dbSizes = [1e4, 1e5, 1e6]
const dbTypes = ['hyperdb', 'raw']
const expectedDatabases = 6

interface GenerationResults {
  success: boolean
  type: string
  size: number
}

interface BenchmarkResult {
  dir: string
  recordsRead: number
  duration: number
  rate: number
}

export default function RocksDBTests() {
  const worklet = React.useRef<any>(null)
  const ipc = useRef<any>(null)

  const [isGenerating, setIsGenerating] = React.useState(false)
  const [isRunning, setIsRunning] = React.useState(false)
  const [generationResults, setGenerationResults] = React.useState<
    GenerationResults[]
  >([])
  const [benchmarkResults, setBenchmarkResults] = React.useState<
    BenchmarkResult[]
  >([])
  const [errors, setErrors] = React.useState<string[]>([])

  // Calculate expected total databases (3 sizes × 2 types = 6)
  const generationProgress = generationResults.length

  useEffect(() => {
    const setup = async () => {
      const bareDir = await useBareDir()

      worklet.current = new Worklet()
      worklet.current.start('rocksdb.bundle', source, [bareDir])

      ipc.current = new FramedStream(worklet.current.IPC)
      ipc.current.on('data', (data: string) => {
        try {
          const dataString = b4a.toString(data)
          const message = JSON.parse(dataString)
          console.log('Received response:', message)

          if (message.success && message.result) {
            // Benchmark result
            setBenchmarkResults((prev) => [...prev, message.result])
            setIsRunning(false)
          } else if (message.success) {
            // Generation success
            setGenerationResults((prev) => {
              const newResults = [...prev, message]
              // Check if we've generated all expected databases
              if (newResults.length >= expectedDatabases) {
                setIsGenerating(false)
              }
              return newResults
            })
          } else if (message.error) {
            // Error occurred
            setErrors((prev) => [...prev, message.error])
            setIsGenerating(false)
            setIsRunning(false)
          }
        } catch (err) {
          console.error('Failed to parse response:', err)
          setIsGenerating(false)
          setIsRunning(false)
        }
      })
    }

    setup()

    return () => {
      if (worklet.current && worklet.current.terminate)
        worklet.current.terminate()
    }
  }, [])

  const generateDatabases = () => {
    setIsGenerating(true)
    setErrors([])
    setGenerationResults([])

    dbSizes.forEach((size) => {
      dbTypes.forEach((type) => {
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

    dbSizes.forEach((size) => {
      dbTypes.forEach((type) => {
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
      <View style={styles.header}>
        <Text style={styles.title}>🚀 RocksDB Benchmark</Text>
        <Text style={styles.subtitle}>
          Performance testing for HyperDB vs Raw RocksDB
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.button,
            styles.generateButton,
            isGenerating && styles.buttonDisabled
          ]}
          onPress={generateDatabases}
          disabled={isGenerating || isRunning}
        >
          <Text style={styles.buttonText}>
            {isGenerating
              ? `🔄 Generating... (${generationProgress}/${expectedDatabases})`
              : '📊 Generate Databases'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            styles.runButton,
            isRunning && styles.buttonDisabled
          ]}
          onPress={runBenchmarks}
          disabled={isGenerating || isRunning}
        >
          <Text style={styles.buttonText}>
            {isRunning ? '⚡ Running...' : '🏃 Run Benchmarks'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tipContainer}>
        <Text style={styles.tipIcon}>💡</Text>
        <Text style={styles.tipTitle}>Tip: Generate Databases First</Text>
        <Text style={styles.tipText}>
          Before running benchmarks, you need to generate the test databases.
          Click "Generate Databases" to create the required data files.
        </Text>
      </View>

      <View style={styles.resultsContainer}>
        <Text style={styles.sectionTitle}>📈 Benchmark Results</Text>
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
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📊</Text>
            <Text style={styles.emptyStateText}>No benchmark results yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Click "Run Benchmarks" to test the generated databases
            </Text>
          </View>
        )}
      </View>

      <ExecutionLog results={generationResults} errors={errors} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  header: {
    padding: 20,
    paddingTop: 40,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef'
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 5
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center'
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 15
  },
  button: {
    flex: 1,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  generateButton: {
    backgroundColor: '#007bff',
    borderWidth: 1,
    borderColor: '#0056b3'
  },
  runButton: {
    backgroundColor: '#28a745',
    borderWidth: 1,
    borderColor: '#1e7e34'
  },
  buttonDisabled: {
    backgroundColor: '#6c757d',
    borderColor: '#6c757d'
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
    textAlign: 'center'
  },
  resultsContainer: {
    margin: 20,
    marginBottom: 40
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 15
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6c757d',
    marginBottom: 5
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#adb5bd',
    textAlign: 'center'
  },

  tipContainer: {
    margin: 20,
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffeaa7',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center'
  },
  tipIcon: {
    fontSize: 24,
    marginBottom: 8
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
    textAlign: 'center'
  },
  tipText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
    lineHeight: 20
  }
})
