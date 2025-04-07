import React, { useState, useEffect } from 'react'
import {
  TouchableOpacity,
  StyleSheet,
  View
} from 'react-native'
import { Worklet } from 'react-native-bare-kit'

import useBareDir from '../../hooks/useBareDir'
import usePerf from '../../hooks/usePerf'
import ThemedText from '../../components/ThemedText'
import { formatTime } from '../../utils/date'

const source = require('./hyperdb.bundle')

export default function HyperdbTests() {
  const worklet = React.useRef(new Worklet()).current
  const [isRunning, setIsRunning] = useState(false)
  const [recordsSent, setRecordsSent] = useState(0)
  const [recordsReceived, setRecordsReceived] = useState(0)
  const { start, stop, duration } = usePerf()
  const [timings, setTimings] = useState<Record<string, number>>({})
  const [numCalls, setNumCalls] = useState(1000)
  const [modes, setModes] = useState(['basic'])
  const isButtonDisabled = isRunning || modes.length === 0

  useEffect(() => {
    const setup = async () => {
      const bareDir = await useBareDir()
      worklet.start('hyperdb.bundle', source, [bareDir])

      const { IPC } = worklet
      IPC.setEncoding('utf8')

      IPC.on('data', (data: string) => {
        try {
          let records = JSON.parse(data)[0].id
          console.log('Records created', records)
          setRecordsReceived((prev) => prev + records)
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
      const mode = modes.at(0)
      if (mode) {
        stop((elapsedTime: number) => {
          setTimings((prev) => ({
            ...prev,
            [mode]: elapsedTime
          }))
          toggleMode(mode)
        })
      }
    }
  }, [recordsReceived])

  useEffect(() => {
    if (isRunning) {
      if (modes.length > 0) {
        console.log('running next test')
        setRecordsReceived(0)
        setRecordsSent(0)
        start()
        runNextTest()
      } else {
        console.log('all tests finished')
        setIsRunning(false)
        setRecordsReceived(0)
        setRecordsSent(0)
      }
    }
  }, [modes])

  const runTests = async () => {
    if (isRunning) return
    setIsRunning(true)
    setRecordsSent(0)
    setRecordsReceived(0)
    setTimings({})

    runNextTest()
  }

  const runNextTest = () => {
    const { IPC } = worklet
    const mode = modes[0]
    console.log('running test', mode)
    start()
    IPC.write(JSON.stringify({ recordsAmount: numCalls, workType: mode }))
    setRecordsSent(numCalls)
  }

  const toggleMode = (mode: string) => {
    setModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    )
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

      <View style={styles.controls}>
        {['basic', 'intensive', 'hyperbee', 'hyperbee-local'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.optionButton,
              modes.includes(type) && styles.selectedOption
            ]}
            onPress={() => toggleMode(type)}
          >
            <ThemedText style={styles.optionText}>{type.toUpperCase()}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={
          isButtonDisabled
            ? [styles.button, styles.buttonDisabled]
            : styles.button
        }
        onPress={runTests}
        disabled={isButtonDisabled}
      >
        <ThemedText style={styles.buttonText}>{`Create ${numCalls} records`}</ThemedText>
      </TouchableOpacity>

      <ThemedText style={[styles.stats]}>
        Sent: {recordsSent} | Records Created: {recordsReceived}
      </ThemedText>

      {Object.entries(timings).map(([mode, time], index) => (
        <ThemedText key={index} style={[styles.stats]}>
          {`Mode: ${mode} - Iter: ${numCalls} - Time: ${formatTime(time)}`}
        </ThemedText>
      ))}
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
