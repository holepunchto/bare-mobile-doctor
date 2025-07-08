import React, { useState, useEffect, memo } from 'react'
import { TouchableOpacity, StyleSheet, View, Platform } from 'react-native'

import { Worklet } from 'react-native-bare-kit'
import { useCameraPermissions } from 'expo-camera'
import FramedStream from 'framed-stream'

import VideoCanvas from './VideoCanvas'
import ThemedText from '../../components/ThemedText'

const source = require('./ffmpeg.bundle')

export default function FFmpegTest() {
  const [permission, requestPermission] = useCameraPermissions()
  const [data, setData] = useState<Uint8Array | null>(null)

  useEffect(() => {
    if (permission?.granted) {
      const worklet = new Worklet()
      worklet.start('ffmpeg.bundle', source)

      console.log('worklet started')

      const stream = new FramedStream(worklet.IPC)
      stream.on('data', (data: any) => {
        setData(data)
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
      {data ? <VideoCanvas data={data} /> : <ThemedText>No video</ThemedText>}
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
  }
})
