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

import ThemedText from '../../components/ThemedText'

const source = require('./ffmpeg.bundle')

const width = 352
const height = 288

function fetchData(url = 'http://localhost:8888'): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.responseType = 'arraybuffer'

    xhr.onload = () => {
      if (xhr.status === 200 && xhr.response) {
        const uint8Array = new Uint8Array(xhr.response)
        resolve(uint8Array)
      } else {
        reject(new Error(`Failed to load RGBA buffer: ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('XHR error'))

    xhr.send()
  })
}

const VideoCanvas = memo(({ data }: { data: Uint8Array | null }) => {
  const image = useMemo(() => {
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

      let intervalId: NodeJS.Timeout | null = null

      // Start fetching data after a short delay to ensure worklet is ready
      setTimeout(() => {
        intervalId = setInterval(async () => {
          try {
            const data = await fetchData()
            setData(data)
          } catch (error) {
            console.error('Failed to fetch frame data:', error)
          }
        }, 1000 / 24) // ~24 FPS
      }, 1000)

      return () => {
        if (intervalId) {
          clearInterval(intervalId)
        }
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
