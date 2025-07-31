import React, { useState, useEffect } from 'react'
import { TouchableOpacity, StyleSheet, View } from 'react-native'

import usePerf from '../../hooks/usePerf'
import useBareDir from '../../hooks/useBareDir'
import useWorklet from '../../hooks/useWorklet'
import useWorkletIPC from '../../hooks/useWorkletIPC'
import ThemedText from '../../components/ThemedText'
import { formatTime } from '../../utils/date'

const source = require('./hyperdb.bundle')

export default function HyperdbTests() {
  const [IPC, init] = useWorklet(['hyperdb.bundle', source], true)
  const [write, response] = useWorkletIPC(IPC)

  const [isRunning, setIsRunning] = useState(false)
  const [recordsSent, setRecordsSent] = useState(0)
  const [recordsReceived, setRecordsReceived] = useState(0)
  const { start: startTimer, stop: stopTimer } = usePerf()
  const [timings, setTimings] = useState<Record<string, number>>({})
  const [numCalls, setNumCalls] = useState(1000)
  const [modes, setModes] = useState(['basic'])
  const [cpuData, setCpuData] = useState('')
  const isButtonDisabled = isRunning || modes.length === 0

  useEffect(() => {
    const setup = async () => init([await useBareDir()])
    setup()
  }, [])

  useEffect(() => {
    if (response) {
      try {
        const data = JSON.parse(response)
        if (data.id) {
          console.log(data)
          let records = data.id
          console.log('Records created', records)
          setRecordsReceived((prev) => prev + records)
        } else {
          setCpuData(data || '')
        }
      } catch (err) {
        console.error('Failed to parse response:', err)
      }
    }
  }, [response])

  useEffect(() => {
    if (recordsReceived >= numCalls) {
      const mode = modes.at(0)
      if (mode) {
        stopTimer((elapsed: number) => {
          setTimings((prev) => ({
            ...prev,
            [mode]: elapsed
          }))
          toggleMode(mode)
        })
      }
    }
  }, [recordsReceived])

  useEffect(() => {
    if (isRunning) {
      resetMessages()
      if (modes.length > 0) {
        console.log('running next test')
        runNextTest()
      } else {
        console.log('all tests finished')
        setIsRunning(false)
      }
    }
  }, [modes])

  const resetMessages = () => {
    setRecordsSent(0)
    setRecordsReceived(0)
  }

  const runTests = async () => {
    if (isRunning) return
    resetMessages()
    setIsRunning(true)
    setTimings({})

    runNextTest()
  }

  const runNextTest = () => {
    const mode = modes[0]
    console.log('running test', mode)
    startTimer()
    const message = JSON.stringify({ recordsAmount: numCalls, workType: mode })
    write(message)
    setRecordsSent(numCalls)
  }

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (write) write(JSON.stringify({ workType: 'cpu' }))
    }, 1000)

    return () => clearInterval(intervalId)
  }, [write])

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
        {['basic', 'intensive', 'bee', 'bee-local'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.optionButton,
              modes.includes(type) && styles.selectedOption
            ]}
            onPress={() => toggleMode(type)}
          >
            <ThemedText style={styles.optionText}>
              {type.toUpperCase()}
            </ThemedText>
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
        <ThemedText
          style={styles.buttonText}
        >{`Run for ${numCalls} records`}</ThemedText>
      </TouchableOpacity>

      <ThemedText style={[styles.stats]}>
        {modes.includes('bee')
          ? `Records Read: ${recordsReceived}`
          : `Sent: ${recordsSent} | Records Created: ${recordsReceived}`}
      </ThemedText>

      {Object.entries(timings).map(([mode, time], index) => (
        <ThemedText key={index} style={[styles.stats]}>
          {`Mode: ${mode} - Iter: ${numCalls} - Time: ${formatTime(time)}`}
        </ThemedText>
      ))}

      <ThemedText style={[styles.stats]}>{`${cpuData}`}</ThemedText>
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
