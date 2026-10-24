import React, { useState, useEffect, useRef } from 'react'
import {
  TouchableOpacity,
  StyleSheet,
  View,
  ScrollView,
  Platform,
  PermissionsAndroid
} from 'react-native'

import { Worklet } from 'react-native-bare-kit'
import FramedStream from 'framed-stream'
import b4a from 'b4a'
import ThemedText from '../../components/ThemedText'

const source = require('./lwp3.bundle')

const LED_COLORS = [
  { name: 'blue', hex: '#3b82f6' },
  { name: 'green', hex: '#22c55e' },
  { name: 'yellow', hex: '#eab308' },
  { name: 'purple', hex: '#a855f7' },
  { name: 'red', hex: '#ef4444' },
  { name: 'white', hex: '#f9fafb' }
]

const SPEEDS = [0, 25, 50, 75, 100]
const DEFAULT_SPEED = 50

type HubState = 'idle' | 'scanning' | 'calibrating' | 'ready'

const LABELS: Record<HubState, string> = {
  idle: 'Not connected',
  scanning: 'Press the green button on the hub...',
  calibrating: 'Calibrating steering...',
  ready: 'Ready'
}

async function requestAndroidBluetoothPermissions() {
  const permissions = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  ].filter(Boolean)

  const results = await PermissionsAndroid.requestMultiple(permissions)
  const granted = PermissionsAndroid.RESULTS.GRANTED

  return permissions.every((permission) => results[permission] === granted)
}

export default function LWP3Tests({ logsEnabled }: { logsEnabled: boolean }) {
  const workletRef = useRef<Worklet | null>(null)
  const streamRef = useRef<any>(null)
  const logScrollRef = useRef<ScrollView | null>(null)

  const [state, setState] = useState<HubState>('idle')
  const [speed, setSpeed] = useState(DEFAULT_SPEED)
  const [hubName, setHubName] = useState<string | null>(null)
  const [battery, setBattery] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => {
    setLog((prev) => [...prev.slice(-79), msg])
  }

  useEffect(() => {
    const start = async () => {
      if (Platform.OS === 'android') {
        const granted = await requestAndroidBluetoothPermissions()

        if (!granted) {
          const message = 'Android Bluetooth permissions were not granted'
          setError(message)
          addLog(message)
          return
        }
      }

      const worklet = new Worklet()
      workletRef.current = worklet
      worklet.start('lwp3.bundle', source, [Platform.OS, String(logsEnabled)])

      const stream = new FramedStream(worklet.IPC)
      streamRef.current = stream

      stream.on('data', (data: Uint8Array) => {
        try {
          const msg = JSON.parse(b4a.toString(data))

          switch (msg.type) {
            case 'status':
              setState(msg.state)
              addLog(LABELS[msg.state as HubState])
              if (msg.state === 'idle') {
                setHubName(null)
                setBattery(null)
              }
              break
            case 'connected':
              setError(null)
              setHubName(msg.name)
              addLog('Connected to ' + (msg.name || 'hub'))
              break
            case 'battery':
              setBattery(msg.level)
              break
            case 'error':
              setError(msg.message)
              addLog('Error: ' + msg.message)
              break
          }
        } catch (err) {
          console.error('Failed to parse response:', err)
        }
      })
    }

    start()

    return () => {
      const worklet = workletRef.current
      if (worklet && worklet.terminate) worklet.terminate()
    }
  }, [])

  useEffect(() => {
    const stream = streamRef.current
    if (stream)
      stream.write(b4a.from(JSON.stringify({ type: 'setLogsEnabled', enabled: logsEnabled })))
  }, [logsEnabled])

  const send = (msg: object) => {
    const stream = streamRef.current
    if (stream) stream.write(b4a.from(JSON.stringify(msg)))
  }

  const changeSpeed = (value: number) => {
    if (value === speed) return
    setSpeed(value)
    send({ type: 'speed', value })
  }

  const ready = state === 'ready'

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText style={styles.status}>{LABELS[state]}</ThemedText>
      {hubName !== null && <ThemedText style={styles.detail}>hub: {hubName}</ThemedText>}
      {battery !== null && <ThemedText style={styles.detail}>battery {battery}%</ThemedText>}
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {state === 'idle' && (
        <TouchableOpacity style={styles.button} onPress={() => send({ type: 'connect' })}>
          <ThemedText style={styles.buttonText}>Connect to hub</ThemedText>
        </TouchableOpacity>
      )}

      <View style={styles.speeds}>
        {SPEEDS.map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.speedButton, value === speed && styles.speedSelected]}
            onPress={() => changeSpeed(value)}
          >
            <ThemedText style={[styles.speedText, value === speed && styles.speedTextSelected]}>
              {value}%
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.pad}>
        <View style={styles.padRow}>
          <PadButton label='FWD' disabled={!ready} onPress={() => send({ type: 'forward' })} />
        </View>
        <View style={styles.padRow}>
          <PadButton label='LEFT' disabled={!ready} onPress={() => send({ type: 'left' })} />
          <PadButton label='STOP' stop disabled={!ready} onPress={() => send({ type: 'stop' })} />
          <PadButton label='RIGHT' disabled={!ready} onPress={() => send({ type: 'right' })} />
        </View>
        <View style={styles.padRow}>
          <PadButton label='REV' disabled={!ready} onPress={() => send({ type: 'backward' })} />
        </View>
      </View>

      <View style={styles.dots}>
        {LED_COLORS.map((color) => (
          <TouchableOpacity
            key={color.name}
            style={[styles.dot, { backgroundColor: color.hex }, !ready && styles.disabled]}
            disabled={!ready}
            onPress={() => send({ type: 'led', color: color.name })}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.off, !ready && styles.disabled]}
        disabled={!ready}
        onPress={() => send({ type: 'off' })}
      >
        <ThemedText style={styles.offText}>power off hub</ThemedText>
      </TouchableOpacity>

      {logsEnabled && (
        <ScrollView
          ref={logScrollRef}
          style={styles.log}
          onContentSizeChange={() => logScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {log.map((line, i) => (
            <ThemedText key={i} style={styles.logLine}>
              {line}
            </ThemedText>
          ))}
        </ScrollView>
      )}
    </ScrollView>
  )
}

function PadButton({
  label,
  disabled,
  stop,
  onPress
}: {
  label: string
  disabled: boolean
  stop?: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[styles.padButton, stop && styles.padStop, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <ThemedText style={styles.padText}>{label}</ThemedText>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingBottom: 20
  },
  status: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4
  },
  detail: {
    fontSize: 14,
    color: '#666'
  },
  error: {
    fontSize: 14,
    color: '#ef4444',
    marginTop: 4,
    textAlign: 'center'
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600'
  },
  speeds: {
    flexDirection: 'row',
    marginTop: 20
  },
  speedButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#232936'
  },
  speedSelected: {
    backgroundColor: '#6ee7b7'
  },
  speedText: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600'
  },
  speedTextSelected: {
    color: '#14171f'
  },
  pad: {
    marginTop: 20,
    alignItems: 'center'
  },
  padRow: {
    flexDirection: 'row',
    justifyContent: 'center'
  },
  padButton: {
    width: 90,
    height: 90,
    margin: 6,
    borderRadius: 16,
    backgroundColor: '#232936',
    alignItems: 'center',
    justifyContent: 'center'
  },
  padStop: {
    backgroundColor: '#3b2430'
  },
  padText: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '600'
  },
  disabled: {
    opacity: 0.3
  },
  dots: {
    flexDirection: 'row',
    marginTop: 20
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginHorizontal: 6
  },
  off: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 20
  },
  offText: {
    color: '#9ca3af',
    fontSize: 14
  },
  log: {
    marginTop: 20,
    maxHeight: 160,
    alignSelf: 'stretch',
    backgroundColor: '#11131a',
    borderRadius: 8,
    padding: 8
  },
  logLine: {
    color: '#9ca3af',
    fontSize: 11
  }
})
