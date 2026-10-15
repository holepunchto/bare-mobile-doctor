import React, { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'

import FramedStream from 'framed-stream'
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'

import useBareDir from '../../hooks/useBareDir'
import useLog from '../../hooks/useLog'
import ThemedText from '../../components/ThemedText'

const source = require('./rocksdb.bundle')

const durations = [2, 5, 10]
const dbTypes = ['hyperdb', 'raw']

interface Result {
  dbType: string
  records: number
  writeRate: number
  readRate: number
  writeMs: number
  readMs: number
}

interface Progress {
  dbType: string
  phase: 'write' | 'read'
  count: number
}

type Message =
  | ({ type: 'result' } & Result)
  | ({ type: 'progress' } & Progress)
  | { type: 'error'; error: string }

function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return `${n}`
}

function elapsed(ms: number): string {
  return `in ${(ms / 1000).toFixed(1)}s`
}

export default function RocksDBTests({ logsEnabled }: { logsEnabled: boolean }) {
  const log = useLog(logsEnabled)
  const worklet = useRef<any>(null)
  const ipc = useRef<any>(null)

  // Benchmarks must not overlap or they measure each other, so the queue is
  // drained one message at a time as each result comes back.
  const pending = useRef<string[]>([])

  const [seconds, setSeconds] = useState(durations[1])
  const [types, setTypes] = useState<string[]>([...dbTypes])
  const [results, setResults] = useState<Result[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const next = () => {
    const message = pending.current.shift()
    if (!message) {
      setProgress(null)
      setIsRunning(false)
      return
    }
    ipc.current.write(b4a.from(message))
  }

  useEffect(() => {
    const setup = async () => {
      const bareDir = await useBareDir()

      worklet.current = new Worklet()
      worklet.current.start('rocksdb.bundle', source, [bareDir, String(logsEnabled)])

      ipc.current = new FramedStream(worklet.current.IPC)
      ipc.current.on('data', (data: Uint8Array) => {
        const message = JSON.parse(b4a.toString(data)) as Message
        log('rocksdb', message)

        if (message.type === 'progress') {
          setProgress(message)
          return
        }
        if (message.type === 'error') {
          setError(message.error)
        } else {
          setResults((prev) => [...prev, message])
        }
        next()
      })
    }

    setup()

    return () => {
      if (worklet.current?.terminate) worklet.current.terminate()
    }
  }, [])

  useEffect(() => {
    if (!ipc.current) return
    ipc.current.write(b4a.from(JSON.stringify({ type: 'setLogsEnabled', enabled: logsEnabled })))
  }, [logsEnabled])

  const toggleType = (type: string) => {
    setTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]))
  }

  const run = () => {
    setResults([])
    setError('')
    setProgress(null)
    pending.current = types.map((dbType) =>
      JSON.stringify({ action: 'bench', payload: { dbType, seconds } })
    )
    setIsRunning(true)
    next()
  }

  return (
    <ScrollView>
      <ThemedText style={styles.label}>Seconds per phase</ThemedText>
      <View style={styles.row}>
        {durations.map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.option, seconds === value && styles.selected]}
            onPress={() => setSeconds(value)}
            disabled={isRunning}
          >
            <ThemedText style={styles.optionText}>{value}s</ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      <ThemedText style={styles.label}>Type</ThemedText>
      <View style={styles.row}>
        {dbTypes.map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.option, types.includes(type) && styles.selected]}
            onPress={() => toggleType(type)}
            disabled={isRunning}
          >
            <ThemedText style={styles.optionText}>{type.toUpperCase()}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.run, (isRunning || types.length === 0) && styles.disabled]}
        onPress={run}
        disabled={isRunning || types.length === 0}
      >
        <ThemedText style={styles.runText}>{isRunning ? 'Running...' : 'Run'}</ThemedText>
      </TouchableOpacity>

      {progress && (
        <ThemedText style={styles.progress}>
          {progress.dbType} {progress.phase === 'write' ? 'writing' : 'reading'}{' '}
          {compact(progress.count)}
        </ThemedText>
      )}

      {error !== '' && <ThemedText style={styles.error}>{error}</ThemedText>}

      {results.map((result) => (
        <View key={result.dbType} style={styles.result}>
          <ThemedText style={styles.resultType}>{result.dbType.toUpperCase()}</ThemedText>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <ThemedText style={styles.metricValue}>{compact(result.writeRate)}</ThemedText>
              <ThemedText style={styles.metricLabel}>writes/s</ThemedText>
              <ThemedText style={styles.metricSub}>{elapsed(result.writeMs)}</ThemedText>
            </View>
            <View style={styles.metric}>
              <ThemedText style={styles.metricValue}>{compact(result.readRate)}</ThemedText>
              <ThemedText style={styles.metricLabel}>reads/s</ThemedText>
              <ThemedText style={styles.metricSub}>{elapsed(result.readMs)}</ThemedText>
            </View>
            <View style={styles.metric}>
              <ThemedText style={styles.metricValue}>{compact(result.records)}</ThemedText>
              <ThemedText style={styles.metricLabel}>records</ThemedText>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6
  },
  row: {
    flexDirection: 'row',
    marginBottom: 14
  },
  option: {
    backgroundColor: '#ccc',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 8
  },
  selected: {
    backgroundColor: '#007AFF'
  },
  optionText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600'
  },
  run: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20
  },
  disabled: {
    opacity: 0.5
  },
  runText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600'
  },
  progress: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20
  },
  error: {
    fontSize: 14,
    color: '#d7263d',
    marginBottom: 20
  },
  result: {
    marginBottom: 16
  },
  resultType: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6
  },
  metrics: {
    flexDirection: 'row'
  },
  metric: {
    flex: 1
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700'
  },
  metricLabel: {
    fontSize: 12
  },
  metricSub: {
    fontSize: 11,
    opacity: 0.6
  }
})
