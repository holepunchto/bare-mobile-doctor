import React, { useState, useEffect } from 'react'
import { View, Platform } from 'react-native'
import {
  Canvas,
  Skia,
  SkImage,
  Image,
  AlphaType,
  ColorType
} from '@shopify/react-native-skia'

import ThemedText from '../../components/ThemedText'

const VideoCanvas = ({
  data,
  width,
  height
}: {
  data: Uint8Array | null
  width: number
  height: number
}) => {
  const cache = {}
  const [skiaImage, setSkiaImage] = useState<SkImage>()

  useEffect(() => {
    const image = Skia.Image.MakeImage(
      {
        width,
        height,
        alphaType: AlphaType.Opaque,
        colorType: ColorType.RGBA_8888
      },
      Skia.Data.fromBytes(data),
      width * 4
    )
    cache[0] = image
    setSkiaImage(cache[0])
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

  if (!skiaImage) {
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
        image={skiaImage}
        fit='cover'
        x={0}
        y={0}
        width={width}
        height={height}
      />
    </Canvas>
  )
}

export default VideoCanvas
