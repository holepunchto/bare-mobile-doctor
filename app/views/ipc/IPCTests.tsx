import React, { useState, useEffect } from 'react'
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native'
import { Worklet } from 'react-native-bare-kit'

const source = require('./ipc.bundle')

const formatTime = (ms: number) => {
  const date = new Date(ms)
  return `${date.getUTCMinutes()}m ${date.getUTCSeconds()}s ${date.getUTCMilliseconds()}ms`
}

export default function IPCTests() {
  const worklet = React.useRef(new Worklet()).current
  const [isRunning, setIsRunning] = useState(false)
  const [messagesSent, setMessagesSent] = useState(0)
  const [messagesReceived, setMessagesReceived] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [timeElapsed, setTimeElapsed] = useState({})
  const [numCalls, setNumCalls] = useState(10)
  const [modes, setModes] = useState(['basic'])
  const isButtonDisabled = isRunning || modes.length === 0;

  useEffect(() => {
    worklet.start('ipc.bundle', source)

    const { IPC } = worklet
    IPC.setEncoding('utf8')

    IPC.on('data', (data: string) => {
      try {
        const messages = data.split('-').filter(Boolean)
        console.log('messages received', messages)
        setMessagesReceived((prev) => prev + messages.length)
      } catch (err) {
        console.error('Failed to parse response:', err)
      }
    })

    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [])

  useEffect(() => {
    if (messagesReceived >= numCalls) {
      const mode = modes.at(0)
      console.log('finsihed test', mode)
      if (mode) {
        setTimeElapsed((prev) => ({
          ...prev,
          [mode]: Date.now() - startTime
        }))
        toggleMode(mode)
      }
    }
  }, [messagesReceived])

  useEffect(() => {
    if (isRunning) {
      if (modes.length > 0) {
        console.log('running next test')
        setMessagesReceived(0)
        setMessagesSent(0)
        setStartTime(0)
        runNextTest()
      } else {
        console.log('all tests finished')
        setIsRunning(false)
        setMessagesReceived(0)
        setMessagesSent(0)
        setStartTime(0)
      }
    }
  }, [modes])

  const runTests = async () => {
    if (isRunning) return
    setIsRunning(true)
    setMessagesSent(0)
    setMessagesReceived(0)
    setTimeElapsed({})

    runNextTest()
  }

  const toggleMode = (mode: string) => {
    setModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    )
  }

  const runNextTest = () => {
    const { IPC } = worklet
    const mode = modes[0]
    console.log('running test', mode)
    setStartTime(Date.now())
    for (let i = 0; i < numCalls; i++) {
      IPC.write(
        JSON.stringify({ msg: `Hello world ${i}`, workType: mode }) + '-'
      )
      setMessagesSent((prev) => prev + 1)
    }
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
        {['basic', 'native', 'fastcall', 'crypto'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.optionButton,
              modes.includes(type) && styles.selectedOption
            ]}
            onPress={() => toggleMode(type)}
          >
            <Text style={styles.optionText}>{type.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={
          isButtonDisabled ? [styles.button, styles.buttonDisabled] : styles.button
        }
        onPress={runTests}
        disabled={isButtonDisabled}
      >
        <Text style={styles.buttonText}>{`Send ${numCalls} IPC messages`}</Text>
      </TouchableOpacity>

      <Text style={styles.stats}>
        Sent: {messagesSent} | Received: {messagesReceived}
      </Text>
      {Object.entries(timeElapsed).map(([mode, time], index) => (
        <Text key={index} style={styles.stats}>
          {`Mode: ${mode} - Iter: ${numCalls} - Time: ${formatTime(time)}`}
        </Text>
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
