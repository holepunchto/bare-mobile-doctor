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

const IMAGE_KEY = 0
const DATA_KEY = 1

const VideoCanvas = ({
  data,
  width,
  height,
  videoWidth,
  videoHeight
}: {
  data: Uint8Array | null
  width: number
  height: number
  videoWidth?: number
  videoHeight?: number
}) => {
  // Ref: https://github.com/Shopify/react-native-skia/issues/2909#issuecomment-2670523371
  // This is way to reduce memory pressure
  const cache = {}
  const [skiaImage, setSkiaImage] = useState<SkImage>()

  // Use actual video dimensions for image creation, display dimensions for canvas
  const imageWidth = videoWidth || width
  const imageHeight = videoHeight || height

  useEffect(() => {
    cache[IMAGE_KEY]?.dispose()
    cache[DATA_KEY]?.dispose()

    const skiaData = Skia.Data.fromBytes(data)
    const image = Skia.Image.MakeImage(
      {
        width: imageWidth,
        height: imageHeight,
        alphaType: AlphaType.Opaque,
        colorType: ColorType.RGBA_8888
      },
      skiaData,
      imageWidth * 4
    )

    cache[IMAGE_KEY] = image
    cache[DATA_KEY] = skiaData
    setSkiaImage(cache[0])
  }, [data, imageWidth, imageHeight])

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
    <Canvas style={{ width, height }}>
      <Image
        image={skiaImage}
        fit='contain'
        x={0}
        y={0}
        width={width}
        height={height}
      />
    </Canvas>
  )
}

export default VideoCanvas
