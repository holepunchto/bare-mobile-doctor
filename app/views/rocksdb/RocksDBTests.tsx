import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions
} from 'react-native'

import FramedStream from 'framed-stream'
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'
import useBareDir from '../../hooks/useBareDir'
import ExecutionLog from './ExecutionLog'

const source = require('./rocksdb.bundle')

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

interface TestResultProps {
  testName: string
  hasSucceeded: boolean | null
  isRunning: boolean
  result?: BenchmarkResult
}

function TestResult({
  testName,
  hasSucceeded,
  isRunning,
  result
}: TestResultProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  const getDatabaseType = (dir: string) => {
    if (dir.includes('raw-')) return 'Raw RocksDB'
    return 'HyperDB'
  }

  const getDatabaseSize = (dir: string) => {
    const match = dir.match(/(\d+)/)
    if (match) {
      const size = parseInt(match[1])
      if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M records`
      if (size >= 1000) return `${(size / 1000).toFixed(1)}K records`
      return `${size} records`
    }
    return 'Unknown size'
  }

  return (
    <View style={styles.resultCard}>
      <View style={styles.cardHeader}>
        <View style={styles.databaseInfo}>
          <Text style={styles.databaseType}>{getDatabaseType(testName)}</Text>
          <Text style={styles.databaseSize}>{getDatabaseSize(testName)}</Text>
        </View>
        {isRunning ? (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>⏳ Running</Text>
          </View>
        ) : hasSucceeded === null ? (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>-</Text>
          </View>
        ) : hasSucceeded ? (
          <View style={[styles.statusBadge, styles.successBadge]}>
            <Text style={styles.successText}>✅ Complete</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, styles.errorBadge]}>
            <Text style={styles.errorText}>❌ Failed</Text>
          </View>
        )}
      </View>

      {result && (
        <View style={styles.metricsContainer}>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Records Read</Text>
              <Text style={styles.metricValue}>
                {formatNumber(result.recordsRead)}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Duration</Text>
              <Text style={styles.metricValue}>{result.duration}s</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Rate</Text>
              <Text style={styles.metricValue}>
                {formatNumber(result.rate)}/s
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

const ErrorList = ({ errors }: { errors: string[] }) => {
  if (!errors || errors.length === 0) return null

  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>❌ Errors</Text>
      {errors.map((error: any, index: any) => (
        <Text key={index} style={styles.errorText}>
          • {error}
        </Text>
      ))}
    </View>
  )
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
  const expectedDatabases = 6
  const generationProgress = generationResults.length
  const isGenerationComplete = generationProgress >= expectedDatabases

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

    // Generate databases for different sizes
    const sizes = [1e4, 1e5, 1e6]
    const types = ['hyperdb', 'raw']

    sizes.forEach((size) => {
      types.forEach((type) => {
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

    sizes.forEach((size) => {
      types.forEach((type) => {
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

const { width } = Dimensions.get('window')

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
  generationContainer: {
    margin: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
    textAlign: 'center'
  },
  generationItem: {
    paddingVertical: 8
  },
  generationText: {
    color: '#28a745',
    fontSize: 14,
    fontWeight: '500'
  },
  resultsContainer: {
    margin: 20,
    marginBottom: 40
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#007bff'
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15
  },
  databaseInfo: {
    flex: 1
  },
  databaseType: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 2
  },
  databaseSize: {
    fontSize: 14,
    color: '#6c757d'
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f8f9fa'
  },
  successBadge: {
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb'
  },
  errorBadge: {
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb'
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6c757d'
  },
  successText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#155724'
  },
  errorText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#721c24'
  },
  metricsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  metric: {
    alignItems: 'center',
    flex: 1
  },
  metricLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 4,
    fontWeight: '500'
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50'
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
  errorContainer: {
    margin: 20,
    padding: 15,
    backgroundColor: '#f8d7da',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#dc3545'
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#721c24',
    marginBottom: 10
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
  },
  progressContainer: {
    marginTop: 12,
    alignItems: 'center'
  },
  progressText: {
    fontSize: 12,
    color: '#856404',
    marginBottom: 6,
    fontWeight: '500'
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#ffeaa7',
    borderRadius: 3,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#28a745',
    borderRadius: 3
  }
})
