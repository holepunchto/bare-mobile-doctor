import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useColorScheme } from 'react-native'

import FramedStream from 'framed-stream'
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'

import useBareDir from '../../hooks/useBareDir'
import ThemedText from '../../components/ThemedText'
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

// Message type definitions
type MessageType = 'benchmark' | 'generation' | 'error'

interface BaseMessage {
  type: MessageType
}

interface BenchmarkMessage extends BaseMessage {
  type: 'benchmark'
  result: BenchmarkResult
}

interface GenerationMessage extends BaseMessage {
  type: 'generation'
  success: boolean
  dbType: string
  size: number
}

interface ErrorMessage extends BaseMessage {
  type: 'error'
  error: string
}

type Message = BenchmarkMessage | GenerationMessage | ErrorMessage

export default function RocksDBTests() {
  const worklet = React.useRef<any>(null)
  const ipc = useRef<any>(null)
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const [isGenerating, setIsGenerating] = React.useState(false)
  const [isRunning, setIsRunning] = React.useState(false)
  const [generationResults, setGenerationResults] = React.useState<GenerationResults[]>([])
  const [benchmarkResults, setBenchmarkResults] = React.useState<BenchmarkResult[]>([])
  const [errors, setErrors] = React.useState<string[]>([])

  // Calculate expected total databases (3 sizes × 2 types = 6)
  const generationProgress = generationResults.length

  // Message handler functions
  const handleBenchmarkMessage = (message: BenchmarkMessage) => {
    setBenchmarkResults((prev) => [...prev, message.result])
    setIsRunning(false)
  }

  const handleGenerationMessage = (message: GenerationMessage) => {
    setGenerationResults((prev) => {
      const newResults = [
        ...prev,
        { success: message.success, type: message.dbType, size: message.size }
      ]
      if (newResults.length >= expectedDatabases) {
        setIsGenerating(false)
      }
      return newResults
    })
  }

  const handleErrorMessage = (message: ErrorMessage) => {
    setErrors((prev) => [...prev, message.error])
    setIsGenerating(false)
    setIsRunning(false)
  }

  useEffect(() => {
    const setup = async () => {
      const bareDir = await useBareDir()

      worklet.current = new Worklet()
      worklet.current.start('rocksdb.bundle', source, [bareDir])

      ipc.current = new FramedStream(worklet.current.IPC)
      ipc.current.on('data', (data: string) => {
        const dataString = b4a.toString(data)
        console.log('Received response:', dataString)

        try {
          const message = JSON.parse(dataString) as Message

          // Route message to appropriate handler
          switch (message.type) {
            case 'benchmark':
              handleBenchmarkMessage(message)
              break
            case 'generation':
              handleGenerationMessage(message)
              break
            case 'error':
              handleErrorMessage(message)
              break
          }
        } catch (err) {
          console.error('Failed to parse response:', err)
          handleErrorMessage({
            type: 'error',
            error: 'Failed to parse response'
          })
        }
      })
    }

    setup()

    return () => {
      if (worklet.current && worklet.current.terminate) worklet.current.terminate()
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
    <ScrollView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#f8f9fa' }]}>
      <View style={[styles.header, { backgroundColor: isDark ? '#1a1a1a' : '#fff' }]}>
        <ThemedText style={styles.title}>🚀 RocksDB Benchmark</ThemedText>
        <ThemedText style={styles.subtitle}>
          Performance testing for HyperDB vs Raw RocksDB
        </ThemedText>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.generateButton, isGenerating && styles.buttonDisabled]}
          onPress={generateDatabases}
          disabled={isGenerating || isRunning}
        >
          <ThemedText style={styles.buttonText}>
            {isGenerating
              ? `🔄 Generating... (${generationProgress}/${expectedDatabases})`
              : '📊 Generate Databases'}
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.runButton, isRunning && styles.buttonDisabled]}
          onPress={runBenchmarks}
          disabled={isGenerating || isRunning}
        >
          <ThemedText style={styles.buttonText}>
            {isRunning ? '⚡ Running...' : '🏃 Run Benchmarks'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.tipContainer,
          {
            backgroundColor: isDark ? '#1a1a1a' : '#fff3cd',
            borderColor: isDark ? '#333' : '#ffeaa7'
          }
        ]}
      >
        <ThemedText style={styles.tipIcon}>💡</ThemedText>
        <ThemedText style={styles.tipTitle}>Tip: Generate Databases First</ThemedText>
        <ThemedText style={styles.tipText}>
          Before running benchmarks, you need to generate the test databases. Click "Generate
          Databases" to create the required data files.
        </ThemedText>
      </View>

      <View style={styles.resultsContainer}>
        <ThemedText style={styles.sectionTitle}>📈 Benchmark Results</ThemedText>
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
          <View style={[styles.emptyState, { backgroundColor: isDark ? '#1a1a1a' : '#fff' }]}>
            <ThemedText style={styles.emptyStateIcon}>📊</ThemedText>
            <ThemedText style={styles.emptyStateText}>No benchmark results yet</ThemedText>
            <ThemedText style={styles.emptyStateSubtext}>
              Click "Run Benchmarks" to test the generated databases
            </ThemedText>
          </View>
        )}
      </View>

      <ExecutionLog results={generationResults} errors={errors} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    padding: 20,
    paddingTop: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef'
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5
  },
  subtitle: {
    fontSize: 16,
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
    marginBottom: 5
  },
  emptyStateSubtext: {
    fontSize: 14,
    textAlign: 'center'
  },

  tipContainer: {
    margin: 20,
    borderWidth: 1,
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
    marginBottom: 8,
    textAlign: 'center'
  },
  tipText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20
  }
})
