import React, { useState, useEffect } from 'react'
import {
  TouchableOpacity,
  StyleSheet,
  View,
  ActivityIndicator,
  useColorScheme
} from 'react-native'
import { Worklet } from 'react-native-bare-kit'
import RPC from 'bare-rpc'
import { RPC_CPU, RPC_WRITE, RPC_READ, RPC_INIT } from '../../utils/commands.js'

import useBareDir from '../../hooks/useBareDir'
import usePerf from '../../hooks/usePerf'
import ThemedText from '../../components/ThemedText'
import { formatTime } from '../../utils/date'
import b4a from 'b4a'

const source = require('./hypercore.bundle')

export default function HyperdbTests() {
  // Refs
  const worklet = React.useRef(new Worklet()).current
  const { IPC } = worklet
  const rpcRef = React.useRef(null)

  // State
  const [isRunning, setIsRunning] = useState(false)
  const [recordsSent, setRecordsSent] = useState(0)
  const [recordsReceived, setRecordsReceived] = useState(0)
  const { start: startTimer, stop: stopTimer } = usePerf()
  const [timings, setTimings] = useState<Record<string, number>>({})
  const [numCalls, setNumCalls] = useState(1000)
  const [modes, setModes] = useState(['write'])
  const [cpuData, setCpuData] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)
  const isButtonDisabled = isRunning || modes.length === 0 || !isInitialized

  useEffect(() => {
    const setup = async () => {
      const bareDir = await useBareDir()
      worklet.start('./hypercore.bundle', source, [bareDir])
      rpcRef.current = new RPC(IPC, (req) => {})
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

  useEffect(() => {
    const intervalId = setInterval(async () => {
      const rpc = rpcRef.current
      const req = rpc.request(RPC_CPU)
      req.send('PING')
      const data = b4a.toString(await req.reply())
      setCpuData(data || '')
    }, 1000)

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const checkRpc = () => {
      const rpc = rpcRef.current

      if (rpc) {
        const req = rpc.request(RPC_INIT)
        req.send('PING')
        const ping = async () => {
          const data = b4a.toString(await req.reply())
          setIsInitialized(true)
        }

        ping()
        clearInterval(intervalId)
      }
    }

    const intervalId = setInterval(checkRpc, 1000)

    return () => clearInterval(intervalId)
  }, [])

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

  const runNextTest = async () => {
    const rpc = rpcRef.current
    if (!rpc) {
      console.log('RPC not initialized')
      return
    }
    const mode = modes[0]

    const rpcmod = mode === 'write' ? RPC_WRITE : RPC_READ
    startTimer()
    const req = rpc.request(rpcmod)
    req.send(`${numCalls}`)
    setRecordsSent(numCalls)
    const records = b4a.toString(await req.reply())
    setRecordsReceived((prev) => prev + records)
  }

  const toggleMode = (mode: string) => {
    setModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    )
  }

  const LoadingScreen = () => {
    const colorScheme = useColorScheme()
    const isDark = colorScheme === 'dark'
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: isDark ? '#000' : '#fff' }
        ]}
      >
        <ActivityIndicator size='large' color={isDark ? '#fff' : '#007AFF'} />
        <ThemedText style={styles.loadingText}>
          Please wait while initializing the core...
        </ThemedText>
      </View>
    )
  }

  if (!isInitialized) {
    return <LoadingScreen />
  }

  return (
    <>
      <View style={styles.controls}>
        {[1, 100, 1000, 10000, 100000, 1000000].map((value) => (
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
        {['write', 'read'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.optionButton,
              modes.includes(type) && styles.selectedOption
            ]}
            onPress={() => toggleMode(type)}
            disabled={!isInitialized}
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center'
  }
})
