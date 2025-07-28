import React, { useState, useEffect, useRef, memo } from 'react'
import { TouchableOpacity, StyleSheet, View, Platform } from 'react-native'

import { Worklet } from 'react-native-bare-kit'
import { useCameraPermissions } from 'expo-camera'
import FramedStream from 'framed-stream'
import b4a from 'b4a'

import VideoCanvas from './VideoCanvas'
import ThemedText from '../../components/ThemedText'

const source = require('./ffmpeg.bundle')

function isCpuInfo(data: Uint8Array): boolean {
  return (
    data[0] === 'c'.charCodeAt(0) &&
    data[1] === 'p'.charCodeAt(0) &&
    data[2] === 'u'.charCodeAt(0)
  )
}

export default function FFmpegTest() {
  const [permission, requestPermission] = useCameraPermissions()
  const [data, setData] = useState<Uint8Array | null>(null)
  const [cpuInfo, setCpuInfo] = useState<string>('')
  const [isDownScaled, setDownScale] = useState<boolean>(false)
  const stream = useRef<any>(null)

  useEffect(() => {
    if (permission?.granted) {
      const worklet = new Worklet()
      // TODO: add button to let the user
      // - enable log
      const enableDebug = 'false'
      // - choose camera
      const camera = 'front'
      worklet.start('ffmpeg.bundle', source, [enableDebug, camera])

      console.log('worklet started')

      stream.current = new FramedStream(worklet.IPC)
      stream.current.on('data', (data: any) => {
        if (isCpuInfo(data)) {
          setCpuInfo(b4a.toString(data.subarray(3)))
        } else {
          setData(data)
        }
      })

      return () => {
        worklet.terminate()
      }
    }
  }, [permission?.granted])

  if (!permission) {
    return (
      <>
        <ThemedText>Loading permissions...</ThemedText>
      </>
    )
  }

  if (!permission.granted) {
    return (
      <View>
        <ThemedText>We need your permission to show the camera</ThemedText>
        <TouchableOpacity onPress={requestPermission} style={styles.button}>
          <ThemedText style={styles.buttonText}>Grant Permission</ThemedText>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.optionButton, isDownScaled && styles.selectedOption]}
          onPress={() => {
            const buf = new Uint8Array(2)
            if (!isDownScaled) {
              buf[0] = 'd'.charCodeAt(0)
              buf[1] = 'n'.charCodeAt(0)
            } else {
              buf[0] = 'u'.charCodeAt(0)
              buf[1] = 'p'.charCodeAt(0)
            }
            stream.current.write(buf)
            setDownScale(!isDownScaled)
          }}
        >
          <ThemedText style={styles.optionText}>
            {isDownScaled ? 'Upscale' : 'Downscale'}
          </ThemedText>
        </TouchableOpacity>
      </View>
      {data ? <VideoCanvas data={data} /> : <ThemedText>No video</ThemedText>}
      <ThemedText style={[styles.stats]}>{`${cpuInfo}`}</ThemedText>
    </View>
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
    alignItems: 'center',
    marginVertical: 20
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
    color: '#666'
  },
  stats: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20
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
  }
})
