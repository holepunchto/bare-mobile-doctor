import React, { useState, useEffect } from 'react'
import { Text, TouchableOpacity, StyleSheet } from 'react-native'
import { worklet } from '../index'

export function IPCTests() {
  const [isRunning, setIsRunning] = useState(false)
  const [messagesSent, setMessagesSent] = useState(0)
  const [messagesReceived, setMessagesReceived] = useState(0)

  useEffect(() => {
    const { IPC } = worklet
    IPC.setEncoding('utf8')

    IPC.on('data', (data: string) => {
      try {
        const messages = data.split('\n').filter(Boolean)
        setMessagesReceived(prev => prev + messages.length);
      } catch (err) {
        console.error('Failed to parse response:', err)
      }
    })
  }, [])

  useEffect(() => {
    if (messagesReceived >= 10000) {
      setIsRunning(false)
    }
  }, [messagesReceived])

  const runTests = async () => {
    if (isRunning) return
    setIsRunning(true)
    setMessagesSent(0)
    setMessagesReceived(0)

    const { IPC } = worklet

    for (let i = 0; i < 10000; i++) {
      IPC.write(`Hello world ${i}` + '\n')
      setMessagesSent(prev => prev + 1)
    }
  }


  return (
    <>
      <TouchableOpacity
        style={isRunning ? [styles.button, styles.buttonDisabled] : styles.button}
        onPress={runTests}
        disabled={isRunning}
      >
        <Text style={styles.buttonText}>
          {'Send 10k IPC messages'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.stats}>
        Sent: {messagesSent} | Received: {messagesReceived}
      </Text>
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  stats: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
})
