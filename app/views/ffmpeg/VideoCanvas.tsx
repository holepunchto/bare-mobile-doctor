// TODO: remove memo
import React, { useState, useEffect, memo } from 'react'
import { View } from 'react-native'
import {
  Canvas,
  Skia,
  Image,
  AlphaType,
  ColorType
} from '@shopify/react-native-skia'

import ThemedText from '../../components/ThemedText'

const width = Platform.OS === 'ios' ? 352 : 640
const height = Platform.OS === 'ios' ? 288 : 480

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

export default VideoCanvas
