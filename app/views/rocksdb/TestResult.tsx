import React from 'react'
import { View, Text, StyleSheet, useColorScheme } from 'react-native'
import ThemedText from '../../components/ThemedText'

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
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
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
    <View
      style={[
        styles.resultCard,
        { backgroundColor: isDark ? '#1a1a1a' : '#fff' }
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.databaseInfo}>
          <ThemedText style={styles.databaseType}>
            {getDatabaseType(testName)}
          </ThemedText>
          <ThemedText style={styles.databaseSize}>
            {getDatabaseSize(testName)}
          </ThemedText>
        </View>
        {isRunning ? (
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: isDark ? '#333' : '#f8f9fa' }
            ]}
          >
            <ThemedText style={styles.statusText}>⏳ Running</ThemedText>
          </View>
        ) : hasSucceeded === null ? (
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: isDark ? '#333' : '#f8f9fa' }
            ]}
          >
            <ThemedText style={styles.statusText}>-</ThemedText>
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
        <View
          style={[
            styles.metricsContainer,
            { backgroundColor: isDark ? '#333' : '#f8f9fa' }
          ]}
        >
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <ThemedText style={styles.metricLabel}>Records Read</ThemedText>
              <ThemedText style={styles.metricValue}>
                {formatNumber(result.recordsRead)}
              </ThemedText>
            </View>
            <View style={styles.metric}>
              <ThemedText style={styles.metricLabel}>Duration</ThemedText>
              <ThemedText style={styles.metricValue}>
                {result.duration}s
              </ThemedText>
            </View>
            <View style={styles.metric}>
              <ThemedText style={styles.metricLabel}>Rate</ThemedText>
              <ThemedText style={styles.metricValue}>
                {formatNumber(result.rate)}/s
              </ThemedText>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  resultCard: {
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
    marginBottom: 2
  },
  databaseSize: {
    fontSize: 14
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
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
    fontWeight: 'bold'
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
    marginBottom: 4,
    fontWeight: '500'
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold'
  }
})

export default TestResult
