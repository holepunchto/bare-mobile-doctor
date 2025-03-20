import React, { useState, useEffect } from 'react'
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  Platform
} from 'react-native'
import { Worklet } from 'react-native-bare-kit'
const source = require('./hyperdb.bundle')

export default function HyperdbTests() {
  const worklet = React.useRef(new Worklet()).current
  const [isRunning, setIsRunning] = useState(false)
  const [recordsSent, setRecordsSent] = useState(0)
  const [recordsReceived, setRecordsReceived] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [numCalls, setNumCalls] = useState(10000)
  const [workType, setWorkType] = useState('basic') // Default to 'basic'

  useEffect(() => {
    worklet.start('hyperdb.bundle', source, [Platform.OS])

    const { IPC } = worklet
    IPC.setEncoding('utf8')

    IPC.on('data', (data: string) => {
      try {
        let message = JSON.parse(data)[0].id
        console.log('Records created', message)
        setRecordsReceived((prev) => message)
      } catch (err) {
        console.error('Failed to parse response:', err)
      }
    })

    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [])

  useEffect(() => {
    if (recordsReceived >= numCalls) {
      setIsRunning(false)
      setTimeElapsed(Date.now() - startTime)
    }
  }, [recordsReceived])

  const runTests = async () => {
    if (isRunning) return
    setIsRunning(true)
    setRecordsSent(0)
    setRecordsReceived(0)
    setTimeElapsed(0)

    const { IPC } = worklet

    setStartTime(Date.now())
    IPC.write(JSON.stringify({ recordsAmount: numCalls, workType })) // Send workType
    setRecordsSent((prev) => numCalls)
  }

  return (
    <>
      <View style={styles.controls}>
        {[1, 10, 100, 1000, 10000].map((value) => (
          <TouchableOpacity
            key={value}
            style={[
              styles.optionButton,
              numCalls === value && styles.selectedOption
            ]}
            onPress={() => setNumCalls(value)}
          >
            <Text style={styles.optionText}>{value}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.controls}>
        {['basic', 'intensive'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.optionButton,
              workType === type && styles.selectedOption
            ]}
            onPress={() => setWorkType(type)}
          >
            <Text style={styles.optionText}>{type.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={
          isRunning ? [styles.button, styles.buttonDisabled] : styles.button
        }
        onPress={runTests}
        disabled={isRunning}
      >
        <Text style={styles.buttonText}>
          {`Create ${numCalls} records (${workType})`}
        </Text>
      </TouchableOpacity>

      <Text style={styles.stats}>
        Sent: {recordsSent} | Records Created: {recordsReceived}
      </Text>
      {timeElapsed > 0 && (
        <Text style={styles.stats}>Time elapsed: {timeElapsed}ms</Text>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10
  },
  optionButton: {
    backgroundColor: '#ccc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    marginHorizontal: 5
  },
  selectedOption: {
    backgroundColor: '#007AFF'
  },
  optionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600'
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
    alignSelf: 'center'
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  stats: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20
  }
})
