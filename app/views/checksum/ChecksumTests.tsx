import React, { useState, useEffect } from 'react'
import {
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Worklet } from 'react-native-bare-kit'
const source = require('./checksum.bundle')

export default function ChecksumTests() {
  const worklet = React.useRef(new Worklet()).current
  const [isRunning, setIsRunning] = useState(false)
  // const [startTime, setStartTime] = useState(0)
  // const [timeElapsed, setTimeElapsed] = useState(0)

  useEffect(() => {
    if (!isRunning) return

    worklet.start('checksum.bundle', source)

    const { IPC } = worklet
    IPC.on('data', (data: any) => {
      IPC.write(data)
    })

    return () => {
      if (worklet.terminate) worklet.terminate()
    }
  }, [isRunning])

  const runTests = () => {
    if (isRunning) return
    setIsRunning(true)
  }

  return (
    <>
      <TouchableOpacity
        style={
          isRunning ? [styles.button, styles.buttonDisabled] : styles.button
        }
        onPress={runTests}
        disabled={isRunning}
      >
        <Text style={styles.buttonText}>
          {`Run checksum tests`}
        </Text>
      </TouchableOpacity>

      {/* {timeElapsed > 0 && ( */}
      {/*   <Text style={styles.stats}> */}
      {/*     Time elapsed: {timeElapsed}ms | Succeeded: {hasSucceeded ? '✅' : '❌'} */}
      {/*   </Text> */}
      {/* )} */}
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
