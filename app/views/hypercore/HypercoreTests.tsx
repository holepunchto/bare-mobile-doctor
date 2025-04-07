import React, { useState, useEffect } from 'react'
import {
  TouchableOpacity,
  StyleSheet,
  View
} from 'react-native'
import { Worklet } from 'react-native-bare-kit'

import ThemedText from '../../components/ThemedText'
import useBareDir from '../../hooks/useBareDir'
import { formatTime } from '../../utils/date'

const source = require('./hypercore.bundle')

export default function HypercoreTests() {
  const worklet = React.useRef(new Worklet()).current
  const [isRunning, setIsRunning] = useState(false)
  const [recordsSent, setRecordsSent] = useState(0)
  const [recordsReceived, setRecordsReceived] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [numCalls, setNumCalls] = useState(10000)

  useEffect(() => {
    const setup = async () => {
      const bareDir = await useBareDir();
      worklet.start('hypercore.bundle', source, [bareDir])

      const { IPC } = worklet
      IPC.setEncoding('utf8')

      IPC.on('data', (data: string) => {
        try {
          let message = JSON.parse(data).records
          console.log('Records created', message)
          setRecordsReceived(() => message)
        } catch (err) {
          console.error('Failed to parse response:', err)
        }
      })
    }

    setup()

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
    IPC.write(JSON.stringify({ recordsAmount: numCalls, workType: 'basic' })) // Send workType
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
            <ThemedText style={styles.optionText}>{value}</ThemedText>
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
        <ThemedText style={styles.buttonText}>{`Create ${numCalls} records`}</ThemedText>
      </TouchableOpacity>

      <ThemedText style={styles.stats}>
        Sent: {recordsSent} | Records Created: {recordsReceived}
      </ThemedText>
      {timeElapsed > 0 && (
        <ThemedText style={styles.stats}>Time elapsed: {formatTime(timeElapsed)}</ThemedText>
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
