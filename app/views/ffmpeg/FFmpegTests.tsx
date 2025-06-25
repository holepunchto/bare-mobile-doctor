import React, { useState, useEffect } from 'react'
import {
  TouchableOpacity,
  StyleSheet,
  View,
  ActivityIndicator,
  PermissionIOS
} from 'react-native'
import FramedStream from 'framed-stream'
import { Worklet } from 'react-native-bare-kit'
import { useCameraPermissions } from 'expo-camera'

import ThemedText from '../../components/ThemedText'

const source = require('./ffmpeg.bundle')

export default function FFmpegTest() {
  const [permission, requestPermission] = useCameraPermissions()

  useEffect(() => {
    if (permission?.granted) {
      const worklet = new Worklet()
      worklet.start('ffmpeg.bundle', source) 

      const { IPC } = worklet
      IPC.on('data', (data: any) => {
        console.log(data)
      })

      return () => {
        if (worklet.terminate) worklet.terminate()
      }
    } 
  }, [permission?.granted])

  if (!permission) {
    return (
      <>
        <ThemedText>
          Loading permissions...
        </ThemedText>
      </>
    )
  }

  if (!permission.granted) {
    return (
      <View>
        <Text>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  return (
    <>
      <ThemedText>
        Video
      </ThemedText>
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
