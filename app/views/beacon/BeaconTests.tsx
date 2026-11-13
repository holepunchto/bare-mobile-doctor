import React, { useState, useEffect, useRef } from 'react'
import {
  TouchableOpacity,
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  Platform,
  PermissionsAndroid
} from 'react-native'

import { Worklet } from 'react-native-bare-kit'
import FramedStream from 'framed-stream'
import b4a from 'b4a'
import useBareDir from '../../hooks/useBareDir'
import ThemedText from '../../components/ThemedText'

const source = require('./beacon.bundle')

type BeaconState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'pairing'
  | 'syncing'
  | 'empty'
  | 'holding'
  | 'writing'
  | 'cloning'
  | 'owned'
  | 'read'

const LABELS: Record<BeaconState, string> = {
  idle: 'Not connected',
  scanning: 'Looking for radios...',
  connecting: 'Connecting...',
  pairing: 'Pairing - type the PIN shown on the radio',
  syncing: 'Reading the radio...',
  empty: 'This radio is empty',
  holding: 'This radio holds a key',
  writing: 'Writing the key into the radio...',
  cloning: 'This radio holds a key - cloning over the DHT...',
  owned: 'You put a core in this radio',
  read: 'Read from this radio'
}

type Radio = { id: string; name: string | null; rssi: number }

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

export default function BeaconTests({ logsEnabled }: { logsEnabled: boolean }) {
  const workletRef = useRef<Worklet | null>(null)
  const streamRef = useRef<any>(null)
  const logScrollRef = useRef<ScrollView | null>(null)
  const bareDir = useBareDir()

  const [state, setState] = useState<BeaconState>('idle')
  const [radioName, setRadioName] = useState<string | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<string[] | null>(null)
  const [peers, setPeers] = useState(0)
  const [radios, setRadios] = useState<Radio[]>([])
  const [input, setInput] = useState('')
  const [writing, setWriting] = useState(false)
  const [serving, setServing] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => setLog((prev) => [...prev.slice(-79), msg])

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
      worklet.start('beacon.bundle', source, [bareDir, String(logsEnabled)])

      const stream = new FramedStream(worklet.IPC)
      streamRef.current = stream

      stream.on('data', (data: Uint8Array) => {
        try {
          const msg = JSON.parse(b4a.toString(data))

          switch (msg.type) {
            case 'status':
              setState(msg.state)
              addLog(LABELS[msg.state as BeaconState])
              if (msg.state === 'idle') {
                setRadioName(null)
                setKey(null)
                setBlocks(null)
              }
              if (msg.state === 'scanning') setRadios([])
              if (msg.state === 'empty' || msg.state === 'owned') setWriting(false)
              break
            case 'discovered':
              setRadios((prev) => (prev.some((r) => r.id === msg.id) ? prev : [...prev, msg]))
              addLog('Found ' + (msg.name || msg.id))
              break
            case 'connected':
              setError(null)
              setRadioName(msg.name)
              addLog('Connected to ' + (msg.name || 'radio'))
              break
            case 'radio':
              setKey(msg.key)
              addLog(msg.key ? 'Radio holds a key' : 'Radio is empty')
              break
            case 'owned':
              setKey(msg.key)
              addLog('Key written, ' + msg.blocks + ' blocks served')
              break
            case 'read':
              setBlocks(msg.blocks)
              addLog('Cloned ' + msg.blocks.length + ' blocks')
              break
            case 'serving':
              setServing(msg.blocks)
              break
            case 'peers':
              setPeers(msg.peers)
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

  const adopt = () => {
    const text = input.trim()
    if (!text) return

    send({ type: 'adopt', text })
    setInput('')
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText style={styles.status}>{LABELS[state]}</ThemedText>
      {radioName !== null && (
        <View style={styles.held}>
          <ThemedText style={styles.detail}>
            {radioName} - {peers} DHT {peers === 1 ? 'peer' : 'peers'}
          </ThemedText>
          <TouchableOpacity style={styles.letGo} onPress={() => send({ type: 'disconnect' })}>
            <ThemedText style={styles.letGoText}>
              let go - this radio stays silent to everyone else while you hold it
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {serving !== null && (
        <ThemedText style={styles.serving}>
          still serving {serving} blocks - keep this screen open
        </ThemedText>
      )}

      {state === 'idle' && (
        <TouchableOpacity style={styles.button} onPress={() => send({ type: 'scan' })}>
          <ThemedText style={styles.buttonText}>Scan for radios</ThemedText>
        </TouchableOpacity>
      )}

      {state === 'scanning' && (
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>
            {radios.length === 0 ? 'Nothing yet...' : 'Pick the one you walked up to'}
          </ThemedText>
          {radios.map((found) => (
            <TouchableOpacity
              key={found.id}
              style={styles.radioRow}
              onPress={() => send({ type: 'open', id: found.id })}
            >
              <ThemedText style={styles.radioName}>{found.name || found.id}</ThemedText>
              <ThemedText style={styles.cardLabel}>{found.rssi} dBm</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {state === 'holding' && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.action} onPress={() => send({ type: 'read' })}>
            <ThemedText style={styles.buttonText}>Read it</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.action, styles.replace]}
            onPress={() => setWriting(true)}
          >
            <ThemedText style={styles.buttonText}>Replace it</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {(state === 'empty' || writing) && (
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>
            {writing
              ? 'Overwrites slot 1. Whatever is in there now becomes unreachable from this radio.'
              : 'Nothing in slot 1. Put a core in it, and the next phone to walk up reads it.'}
          </ThemedText>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder='Something to put in the core'
              placeholderTextColor='#6b7280'
              returnKeyType='send'
              onSubmitEditing={adopt}
            />
            <TouchableOpacity style={styles.sendButton} onPress={adopt}>
              <ThemedText style={styles.sendButtonText}>{writing ? 'Replace' : 'Adopt'}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {key !== null && (
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>
            {state === 'owned' ? 'the key you wrote into the radio' : 'the key this radio holds'}
          </ThemedText>
          <ThemedText style={styles.key}>{key}</ThemedText>

          {blocks !== null &&
            blocks.map((block, i) => (
              <ThemedText key={i} style={styles.block}>
                {i}: {block}
              </ThemedText>
            ))}
        </View>
      )}

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

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace'

const styles = StyleSheet.create({
  content: { paddingBottom: 20 },
  status: { fontSize: 16, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  detail: { fontSize: 13, color: '#666', textAlign: 'center' },
  error: { fontSize: 13, color: '#ef4444', marginTop: 4, textAlign: 'center' },
  button: {
    alignSelf: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  card: { marginTop: 16, padding: 10, borderRadius: 8, backgroundColor: '#232936' },
  cardLabel: { fontSize: 11, color: '#9ca3af' },
  key: { fontSize: 11, color: '#6ee7b7', fontFamily: mono, marginVertical: 4 },
  block: { fontSize: 13, color: '#f9fafb', marginTop: 2 },
  radioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#39414f',
    marginTop: 6
  },
  radioName: { fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  action: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 6
  },
  replace: { backgroundColor: '#6b7280' },
  held: { alignItems: 'center' },
  serving: { fontSize: 13, color: '#6ee7b7', textAlign: 'center', marginTop: 6 },
  letGo: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ef4444'
  },
  letGoText: { fontSize: 12, color: '#ef4444' },
  inputRow: { flexDirection: 'row', marginTop: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#39414f',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#f9fafb'
  },
  sendButton: {
    marginLeft: 8,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#007AFF'
  },
  sendButtonText: { color: 'white', fontWeight: '600' },
  log: {
    height: 140,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#232936',
    borderRadius: 8,
    padding: 8
  },
  logLine: { fontSize: 11, color: '#9ca3af', fontFamily: mono }
})
