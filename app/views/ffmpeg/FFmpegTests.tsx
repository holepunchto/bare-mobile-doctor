import React, { useState, useEffect, useMemo, memo } from 'react'
import { TouchableOpacity, StyleSheet, View } from 'react-native'

import { Worklet } from 'react-native-bare-kit'
import { useCameraPermissions } from 'expo-camera'
import {
  Canvas,
  Skia,
  Image,
  Rect,
  Paint,
  AlphaType,
  ColorType
} from '@shopify/react-native-skia'
import FramedStream from 'framed-stream'

import ThemedText from '../../components/ThemedText'

const source = require('./ffmpeg.bundle')

const width = 352
const height = 288

function createImage(data: Uint8Array): Uint8Array | null {
  if (!data || !data.length) {
    return null
  }

  try {
    const result = Skia.Image.MakeImage(
      {
        width,
        height,
        alphaType: AlphaType.Opaque,
        colorType: ColorType.RGBA_8888
      },
      Skia.Data.fromBytes(data),
      width * 4
    )

    return result
  } catch (error) {
    console.error('Error creating Skia image:', error)
    return null
  }
}

const VideoCanvas = memo(({ data }: { data: Uint8Array | null }) => {
  const [image, setImage] = useState<Uint8Array | null>(null)

  useEffect(() => {
    const image = createImage(data)
    setImage(image)
  }, [data])

  if (!data || !data.length) {
    return (
      <View
        style={{
          width,
          height,
          backgroundColor: 'red',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <ThemedText style={{ color: 'white' }}>No data</ThemedText>
      </View>
    )
  }

  if (!image) {
    return (
      <View
        style={{
          width,
          height,
          backgroundColor: 'red',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <ThemedText style={{ color: 'white' }}>
          Image creation failed
        </ThemedText>
      </View>
    )
  }

  return (
    <Canvas style={{ width, height, backgroundColor: 'red' }}>
      <Image
        image={image}
        fit='cover'
        x={0}
        y={0}
        width={width}
        height={height}
      />
    </Canvas>
  )
})

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
