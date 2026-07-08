import React, { useState, useEffect } from 'react'
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native'

import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'

import ThemedText from '../../components/ThemedText'
import { formatTime } from '../../utils/date'
import usePerf from '../../hooks/usePerf'
import useLog from '../../hooks/useLog'

const source = require('./ipc.bundle')

export default function IPCTests({ logsEnabled }: { logsEnabled: boolean }) {
  const log = useLog(logsEnabled)
  const worklet = React.useRef(new Worklet()).current
  const [isRunning, setIsRunning] = useState(false)
  const { start: startTimer, stop: stopTimer } = usePerf()
  const [timings, setTimings] = useState<Record<string, number>>({})
  const [messagesSent, setMessagesSent] = useState(0)
  const [messagesReceived, setMessagesReceived] = useState(0)
  const [numCalls, setNumCalls] = useState(10)
  const [modes, setModes] = useState(['basic'])
  const isButtonDisabled = isRunning || modes.length === 0
  const [cpuData, setCpuData] = useState('')

  useEffect(() => {
    worklet.start('ipc.bundle', source, [String(logsEnabled)])

    const { IPC } = worklet

    IPC.on('data', (data: string) => {
      try {
        const stringData = b4a.toString(data)
        const messages = stringData.split('-').filter(Boolean)
        messages.forEach((rawMessage) => {
          const message = JSON.parse(rawMessage)
          if (message.summary) {
            setCpuData(message.summary)
          } else {
            setMessagesReceived((prev) => prev + 1)
          }
        })
      } catch (err) {
        console.error('Failed to parse response:', err)
      }
    })

    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [])

  useEffect(() => {
    const msg = JSON.stringify({ type: 'setLogsEnabled', enabled: logsEnabled }) + '-'
    worklet.IPC.write(b4a.from(msg))
  }, [logsEnabled])

  useEffect(() => {
    if (messagesReceived >= numCalls) {
      const mode = modes.at(0)
      if (mode) {
        stopTimer((elapsed: number) => {
          if (elapsed) {
            setTimings((prev) => ({
              ...prev,
              [mode]: elapsed
            }))
          }
          toggleMode(mode)
        })
      }
    }
  }, [messagesReceived])

  useEffect(() => {
    if (isRunning) {
      resetMessages()
      if (modes.length > 0) {
        log('running next test')
        runNextTest()
      } else {
        log('all tests finished')
        setIsRunning(false)
      }
    }
  }, [modes])

  const resetMessages = () => {
    setMessagesSent(0)
    setMessagesReceived(0)
  }

  const runTests = async () => {
    if (isRunning) return
    setIsRunning(true)
    resetMessages()
    setTimings({})

    runNextTest()
  }

  const toggleMode = (mode: string) => {
    setModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]))
  }

  const runNextTest = () => {
    const { IPC } = worklet
    const mode = modes[0]
    log('running test', mode)
    startTimer()
    for (let i = 0; i < numCalls; i++) {
      const message = JSON.stringify({ msg: `Hello world ${i}`, workType: mode }) + '-'
      IPC.write(b4a.from(message))
      setMessagesSent((prev) => prev + 1)
    }
  }

  return (
    <>
      <View style={styles.controls}>
        {[1, 10, 100, 1000, 10000].map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.optionButton, numCalls === value && styles.selectedOption]}
            onPress={() => setNumCalls(value)}
          >
            <Text style={styles.optionText}>{value}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.controls}>
        {['basic', 'native', 'fastcall', 'crypto'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.optionButton, modes.includes(type) && styles.selectedOption]}
            onPress={() => toggleMode(type)}
          >
            <Text style={styles.optionText}>{type.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={isButtonDisabled ? [styles.button, styles.buttonDisabled] : styles.button}
        onPress={runTests}
        disabled={isButtonDisabled}
      >
        <Text style={styles.buttonText}>{`Send ${numCalls} IPC messages`}</Text>
      </TouchableOpacity>

      <ThemedText style={styles.stats}>
        Sent: {messagesSent} | Received: {messagesReceived}
      </ThemedText>
      {Object.entries(timings).map(([mode, time], index) => (
        <ThemedText key={index} style={styles.stats}>
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
