import React, { useState, useEffect } from 'react'
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native'
import { Worklet } from 'react-native-bare-kit'

export default function IPCTests() {
  const worklet = React.useRef(new Worklet()).current
  const [isRunning, setIsRunning] = useState(false)
  const [messagesSent, setMessagesSent] = useState(0)
  const [messagesReceived, setMessagesReceived] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [numCalls, setNumCalls] = useState(10000)
  const [workType, setWorkType] = useState('intensive')

  useEffect(() => {
    worklet.start(
      'app.js',
      `
      console.log('Worklet started')
      BareKit.IPC.on('data', (data) => {
        // Select computation type based on received data
        function heavyMathLoad(iterations) {
            let sum = 0
            for (let i = 0; i < iterations; i++) {
                sum += Math.sin(i) * Math.cos(i) * Math.tan(i);
            }
            return sum
        }

        function basicWork() {
            return 42; // Simple operation
        }

        const messages = data.toString().split('-').filter(Boolean)
        messages.forEach((message) => {
          const payload = JSON.parse(message);
          if (payload.workType === "intensive") {
              heavyMathLoad(1e7)
          } else {
              basicWork()
          }

          BareKit.IPC.write(message + '-');
        })
      });

      console.log('Worklet setup complete');
    `
    )

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
      setIsRunning(false)
      setTimeElapsed(Date.now() - startTime)
    }
  }, [messagesReceived])

  const runTests = async () => {
    if (isRunning) return
    setIsRunning(true)
    setMessagesSent(0)
    setMessagesReceived(0)
    setTimeElapsed(0)

    const { IPC } = worklet

    setStartTime(Date.now())
    for (let i = 0; i < numCalls; i++) {
      IPC.write(JSON.stringify({ msg: `Hello world ${i}`, workType }) + '-')
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
          {`Send ${numCalls} IPC messages (${workType})`}
        </Text>
      </TouchableOpacity>

      <Text style={styles.stats}>
        Sent: {messagesSent} | Received: {messagesReceived}
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
