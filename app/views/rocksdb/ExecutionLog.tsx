import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

interface GenerationResults {
  success: boolean
  type: string
  size: number
}

interface ExecutionLogProps {
  results: GenerationResults[]
  errors: string[]
}

const ExecutionLog = ({ results, errors }: ExecutionLogProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const totalEvents = results.length + errors.length
  if (totalEvents === 0) return null

  const formatTimestamp = () => {
    const now = new Date()
    return now.toLocaleTimeString()
  }

  return (
    <View style={styles.logContainer}>
      <TouchableOpacity style={styles.logHeader} onPress={() => setIsExpanded(!isExpanded)}>
        <View style={styles.logHeaderLeft}>
          <Text style={styles.logIcon}>📋</Text>
          <Text style={styles.logTitle}>Execution Log</Text>
          <View style={styles.logBadge}>
            <Text style={styles.logBadgeText}>{totalEvents}</Text>
          </View>
        </View>
        <Text style={styles.logToggle}>{isExpanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.logContent}>
          <Text style={styles.logTimestamp}>// Started at {formatTimestamp()}</Text>

          {results.map((result, index) => (
            <View key={`result-${index}`} style={styles.logEntry}>
              <Text style={styles.logLine}>
                <Text style={styles.logSuccess}>✓</Text>
                <Text style={styles.logType}> {result.type}</Text>
                <Text style={styles.logText}> database created with </Text>
                <Text style={styles.logNumber}>{result.size.toLocaleString()}</Text>
                <Text style={styles.logText}> records</Text>
              </Text>
            </View>
          ))}

          {errors.map((error, index) => (
            <View key={`error-${index}`} style={styles.logEntry}>
              <Text style={styles.logLine}>
                <Text style={styles.logError}>✗</Text>
                <Text style={styles.logText}> {error}</Text>
              </Text>
            </View>
          ))}

          <Text style={styles.logTimestamp}>// Execution complete</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  logContainer: {
    margin: 20,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#2d2d2d',
    borderBottomWidth: 1,
    borderBottomColor: '#404040'
  },
  logHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  logIcon: {
    fontSize: 16,
    marginRight: 8
  },
  logTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e0e0e0',
    flex: 1
  },
  logBadge: {
    backgroundColor: '#007bff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
    marginRight: 12
  },
  logBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  logToggle: {
    fontSize: 12,
    color: '#e0e0e0',
    fontWeight: 'bold'
  },
  logContent: {
    padding: 12,
    backgroundColor: '#1e1e1e'
  },
  logTimestamp: {
    fontSize: 12,
    color: '#6c757d',
    fontFamily: 'monospace',
    marginBottom: 8
  },
  logEntry: {
    marginBottom: 4
  },
  logLine: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#e0e0e0',
    lineHeight: 18
  },
  logSuccess: {
    color: '#28a745',
    fontWeight: 'bold'
  },
  logError: {
    color: '#dc3545',
    fontWeight: 'bold'
  },
  logType: {
    color: '#007bff',
    fontWeight: 'bold'
  },
  logText: {
    color: '#e0e0e0'
  },
  logNumber: {
    color: '#ffc107',
    fontWeight: 'bold'
  }
})

export default ExecutionLog
