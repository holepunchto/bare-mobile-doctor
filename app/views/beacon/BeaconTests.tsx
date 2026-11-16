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

type Radio = { id: string; name: string | null; rssi: number }
type Slot = { key: string; mine: boolean; blocks: number }
type Busy = 'looking' | 'reading' | 'writing' | 'pairing' | null
type Editor = 'append' | 'replace' | null

const BUSY: Record<string, string> = {
  looking: 'Reading the radio...',
  reading: 'Cloning over the DHT...',
  writing: 'Writing into the radio...',
  pairing: 'Pairing - type the PIN shown on the radio'
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

export default function BeaconTests({ logsEnabled }: { logsEnabled: boolean }) {
  const workletRef = useRef<Worklet | null>(null)
  const streamRef = useRef<any>(null)
  const logScrollRef = useRef<ScrollView | null>(null)
  const bareDir = useBareDir()

  const [radios, setRadios] = useState<Radio[]>([])
  const [radioName, setRadioName] = useState<string | null>(null)
  const [looked, setLooked] = useState(false)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [blocks, setBlocks] = useState<string[] | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [held, setHeld] = useState(false)
  const [using, setUsing] = useState(false)
  const [editor, setEditor] = useState<Editor>(null)
  const [peers, setPeers] = useState(0)
  const [serving, setServing] = useState<number | null>(null)
  const [input, setInput] = useState('')
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
            case 'radios':
              setRadios([])
              setLooked(false)
              setSlot(null)
              setBlocks(null)
              setRadioName(null)
              setUsing(false)
              setEditor(null)
              addLog('Looking for radios...')
              break
            case 'discovered':
              setRadios((prev) => (prev.some((r) => r.id === msg.id) ? prev : [...prev, msg]))
              addLog('Found ' + (msg.name || msg.id))
              break
            case 'connected':
              setRadioName(msg.name)
              setError(null)
              break
            case 'slot':
              setLooked(true)
              setSlot(msg.slot)
              setUsing(false)
              setEditor(null)
              addLog(msg.slot ? 'Radio holds a key' : 'Radio is empty')
              break
            case 'blocks':
              setBlocks(msg.blocks)
              addLog('Read ' + msg.blocks.length + ' blocks')
              break
            case 'busy':
              setBusy(msg.what)
              if (msg.what) addLog(BUSY[msg.what] || msg.what)
              break
            case 'holding':
              setHeld(msg.held)
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

  const submit = () => {
    const text = input.trim()
    if (!text) return

    send({ type: editor === 'append' ? 'append' : 'replace', text })
    setInput('')
    setEditor(null)
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText style={styles.status}>
        {busy ? BUSY[busy] : radioName || 'Nothing selected'}
      </ThemedText>
      <ThemedText style={styles.detail}>
        {held ? 'holding the radio' : 'radio free'} - {peers} DHT {peers === 1 ? 'peer' : 'peers'}
      </ThemedText>
      {serving !== null && (
        <ThemedText style={styles.serving}>
          still serving {serving} blocks - keep this screen open
        </ThemedText>
      )}
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {!looked && (
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.button}
            disabled={!!busy}
            onPress={() => send({ type: 'scan' })}
          >
            <ThemedText style={styles.buttonText}>Scan for radios</ThemedText>
          </TouchableOpacity>
          {radios.map((found) => (
            <TouchableOpacity
              key={found.id}
              style={styles.radioRow}
              disabled={!!busy}
              onPress={() => send({ type: 'look', id: found.id })}
            >
              <ThemedText style={styles.radioName}>{found.name || found.id}</ThemedText>
              <ThemedText style={styles.cardLabel}>{found.rssi} dBm</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {looked && slot === null && (
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>
            This radio is empty. Put a core on it and the next phone to walk up reads it.
          </ThemedText>
          <Row>
            <Button label='Put a core on it' onPress={() => setEditor('replace')} busy={busy} />
          </Row>
        </View>
      )}

      {looked && slot !== null && (
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>
            {slot.mine ? 'your core' : "someone else's core"} - {slot.blocks} blocks
          </ThemedText>
          <ThemedText style={styles.key}>{slot.key}</ThemedText>

          {!using && (
            <Row>
              {slot.mine ? (
                <Button label='Use the core' onPress={() => setUsing(true)} busy={busy} />
              ) : (
                <Button label='Read' onPress={() => send({ type: 'read' })} busy={busy} />
              )}
              <Button
                label='Replace the core'
                danger
                onPress={() => setEditor('replace')}
                busy={busy}
              />
            </Row>
          )}

          {using && (
            <Row>
              <Button label='Read' onPress={() => send({ type: 'read' })} busy={busy} />
              <Button label='Add a block' onPress={() => setEditor('append')} busy={busy} />
            </Row>
          )}

          {blocks !== null &&
            blocks.map((block, i) => (
              <ThemedText key={i} style={styles.block}>
                {i}: {block}
              </ThemedText>
            ))}
        </View>
      )}

      {editor !== null && (
        <View style={styles.card}>
          <ThemedText style={styles.cardLabel}>
            {editor === 'append'
              ? 'Adds one block to the core already on this radio. The key does not change.'
              : 'Creates a brand new core and writes its key into the radio. Whatever is there now becomes unreachable from it.'}
          </ThemedText>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder='Text for the block'
              placeholderTextColor='#6b7280'
              returnKeyType='send'
              onSubmitEditing={submit}
              autoFocus
            />
            <TouchableOpacity style={styles.sendButton} onPress={submit}>
              <ThemedText style={styles.sendButtonText}>
                {editor === 'append' ? 'Add' : 'Write'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {looked && (
        <TouchableOpacity
          style={styles.back}
          disabled={!!busy}
          onPress={() => send({ type: 'scan' })}
        >
          <ThemedText style={styles.backText}>back to the radios</ThemedText>
        </TouchableOpacity>
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

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>
}

function Button({
  label,
  onPress,
  busy,
  danger
}: {
  label: string
  onPress: () => void
  busy: Busy
  danger?: boolean
}) {
  return (
    <TouchableOpacity
      style={[styles.button, danger && styles.danger, !!busy && styles.disabled]}
      disabled={!!busy}
      onPress={onPress}
    >
      <ThemedText style={styles.buttonText}>{label}</ThemedText>
    </TouchableOpacity>
  )
}

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace'

const styles = StyleSheet.create({
  content: { paddingBottom: 20 },
  status: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  detail: { fontSize: 12, color: '#666', textAlign: 'center', marginTop: 2 },
  serving: { fontSize: 12, color: '#6ee7b7', textAlign: 'center', marginTop: 2 },
  error: { fontSize: 13, color: '#ef4444', marginTop: 6, textAlign: 'center' },
  card: { marginTop: 14, padding: 12, borderRadius: 8, backgroundColor: '#232936' },
  cardLabel: { fontSize: 12, color: '#9ca3af' },
  key: { fontSize: 11, color: '#6ee7b7', fontFamily: mono, marginVertical: 6 },
  block: { fontSize: 13, color: '#f9fafb', marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 8,
    margin: 4
  },
  danger: { backgroundColor: '#6b7280' },
  disabled: { opacity: 0.4 },
  buttonText: { color: 'white', fontSize: 15, fontWeight: '600' },
  radioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#39414f',
    marginTop: 8
  },
  radioName: { fontSize: 15, fontWeight: '600' },
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
  back: { alignSelf: 'center', marginTop: 14, paddingVertical: 8 },
  backText: { fontSize: 13, color: '#007AFF' },
  log: {
    height: 130,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#232936',
    borderRadius: 8,
    padding: 8
  },
  logLine: { fontSize: 11, color: '#9ca3af', fontFamily: mono }
})
