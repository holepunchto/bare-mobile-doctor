import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

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

const styles = StyleSheet.create({
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
  }
})

export default TestResult
