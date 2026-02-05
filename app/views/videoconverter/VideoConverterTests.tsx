import React, { useState, useEffect, useRef } from 'react'
import {
  TouchableOpacity,
  StyleSheet,
  View,
  ScrollView,
  Platform,
  Dimensions
} from 'react-native'

import { Worklet } from 'react-native-bare-kit'
import FramedStream from 'framed-stream'
import b4a from 'b4a'
import * as FileSystem from 'expo-file-system'
import { Asset } from 'expo-asset'

import VideoCanvas from './VideoCanvas'
import ThemedText from '../../components/ThemedText'
import useBareDir from '../../hooks/useBareDir'

const source = require('./videoconverter.bundle')

type PlayerStatus = 'idle' | 'ready' | 'playing' | 'stopped' | 'error'

interface VideoMetadata {
  width: number
  height: number
  frameRate: number
}

function isCpuInfo(data: Uint8Array): boolean {
  return (
    data[0] === 'c'.charCodeAt(0) &&
    data[1] === 'p'.charCodeAt(0) &&
    data[2] === 'u'.charCodeAt(0)
  )
}

function isStatus(data: Uint8Array): boolean {
  return (
    data[0] === 's'.charCodeAt(0) &&
    data[1] === 't'.charCodeAt(0) &&
    data[2] === 's'.charCodeAt(0) &&
    data[3] === ':'.charCodeAt(0)
  )
}

function isError(data: Uint8Array): boolean {
  return (
    data[0] === 'e'.charCodeAt(0) &&
    data[1] === 'r'.charCodeAt(0) &&
    data[2] === 'r'.charCodeAt(0) &&
    data[3] === ':'.charCodeAt(0)
  )
}

function isMetadata(data: Uint8Array): boolean {
  return (
    data[0] === 'm'.charCodeAt(0) &&
    data[1] === 'e'.charCodeAt(0) &&
    data[2] === 't'.charCodeAt(0) &&
    data[3] === 'a'.charCodeAt(0) &&
    data[4] === ':'.charCodeAt(0)
  )
}

export default function VideoConverterTest() {
  const worklet = useRef(new Worklet()).current
  const [cpuInfo, setCpuInfo] = useState<string>('')
  const [videoData, setVideoData] = useState<Uint8Array | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState<string>('')
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<string>('sample_30s.mkv')
  const [bareDir, setBareDir] = useState<string>('')
  const [canvasWidth, setCanvasWidth] = useState<number>(0)
  const [canvasHeight, setCanvasHeight] = useState<number>(0)

  const stream = useRef<any>(null)

  useEffect(() => {
    const setup = async () => {
      const dir = await useBareDir()
      setBareDir(dir)
      console.log('Bare directory:', dir)

      // Copy video assets to Documents folder
      const videos = [
        { name: 'sample_30s.mkv', asset: require('../../../assets/videos/sample_30s.mkv') }
      ]

      for (const video of videos) {
        const destPath = `${dir}/${video.name}`
        const fileInfo = await FileSystem.getInfoAsync(destPath)

        if (!fileInfo.exists) {
          console.log(`Copying ${video.name}...`)
          const asset = Asset.fromModule(video.asset)
          await asset.downloadAsync()

          if (asset.localUri) {
            await FileSystem.copyAsync({
              from: asset.localUri,
              to: destPath
            })
            console.log(`Copied ${video.name}`)
          }
        }
      }

      // Start worklet (enable debug to see logs)
      worklet.start('videoconverter.bundle', source, ['true'])

      stream.current = new FramedStream(worklet.IPC)

      stream.current.on('data', (data: any) => {
        // Check message type
        if (isCpuInfo(data)) {
          setCpuInfo(b4a.toString(data.subarray(3)))
          return
        }

        if (isStatus(data)) {
          const statusMsg = b4a.toString(data.subarray(4))
          console.log('Status:', statusMsg)
          setStatus(statusMsg as PlayerStatus)
          return
        }

        if (isError(data)) {
          const errorMsg = b4a.toString(data.subarray(4))
          console.log('Error:', errorMsg)
          setError(errorMsg)
          setStatus('error')
          return
        }

        if (isMetadata(data)) {
          const metadataStr = b4a.toString(data.subarray(5))
          console.log('Metadata:', metadataStr)
          try {
            const meta = JSON.parse(metadataStr)
            setMetadata(meta)

            // Calculate canvas dimensions to maintain aspect ratio
            const screenWidth = Dimensions.get('window').width - 40 // padding
            const aspectRatio = meta.width / meta.height
            const calculatedWidth = screenWidth
            const calculatedHeight = screenWidth / aspectRatio

            setCanvasWidth(calculatedWidth)
            setCanvasHeight(calculatedHeight)
          } catch (e) {
            console.error('Failed to parse metadata:', e)
          }
          return
        }

        // Video frame data
        console.log('Received video frame data, size:', data.length)
        setVideoData(data)
      })
    }

    setup()

    return () => {
      worklet.terminate()
    }
  }, [])

  const openVideo = (filename: string) => {
    if (!bareDir) return
    const videoPath = `${bareDir}/${filename}`
    console.log('Opening video:', videoPath)
    setError('')
    setMetadata(null)
    setVideoData(null)
    stream.current.write(b4a.from(`open:${videoPath}`))
  }

  const playVideo = () => {
    stream.current.write(b4a.from('play'))
  }

  const stopVideo = () => {
    stream.current.write(b4a.from('stop'))
  }

  const getVideoPath = () => {
    if (!bareDir) return 'Loading...'
    return `${bareDir}/${selectedVideo}`
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <ThemedText style={styles.title}>Video Player</ThemedText>
        <ThemedText style={styles.subtitle}>
          Live streaming with MKV/AVI transcoding
        </ThemedText>

        <View style={styles.videoSection}>
          <ThemedText style={styles.label}>Select Test Video:</ThemedText>
          <View style={styles.videoButtons}>
            {['sample_30s.mkv', 'sample_30s.avi'].map((video) => (
              <TouchableOpacity
                key={video}
                style={[
                  styles.videoButton,
                  selectedVideo === video && styles.videoButtonActive
                ]}
                onPress={() => setSelectedVideo(video)}
              >
                <ThemedText
                  style={[
                    styles.videoButtonText,
                    selectedVideo === video && styles.videoButtonTextActive
                  ]}
                >
                  {video}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          <ThemedText style={styles.pathText}>
            Path: {getVideoPath()}
          </ThemedText>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.button, styles.openButton]}
            onPress={() => openVideo(selectedVideo)}
          >
            <ThemedText style={styles.buttonText}>Open</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              status !== 'ready' && status !== 'stopped' && styles.buttonDisabled
            ]}
            onPress={playVideo}
            disabled={status !== 'ready' && status !== 'stopped'}
          >
            <ThemedText style={styles.buttonText}>Play</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.stopButton,
              status !== 'playing' && styles.buttonDisabled
            ]}
            onPress={stopVideo}
            disabled={status !== 'playing'}
          >
            <ThemedText style={styles.buttonText}>Stop</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.statusSection}>
          <ThemedText style={styles.statusLabel}>Status:</ThemedText>
          <ThemedText
            style={[
              styles.statusText,
              status === 'playing' && styles.statusPlaying,
              status === 'error' && styles.statusError
            ]}
          >
            {status.toUpperCase()}
          </ThemedText>
        </View>

        {error ? (
          <View style={styles.errorSection}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        {metadata && (
          <View style={styles.metadataSection}>
            <ThemedText style={styles.metadataTitle}>Video Info</ThemedText>
            <ThemedText style={styles.metadataText}>
              {metadata.width}x{metadata.height} @ {metadata.frameRate.toFixed(1)} fps
            </ThemedText>
          </View>
        )}

        {videoData && metadata && canvasWidth > 0 ? (
          <View style={styles.canvasContainer}>
            <VideoCanvas
              data={videoData}
              width={canvasWidth}
              height={canvasHeight}
              videoWidth={metadata.width}
              videoHeight={metadata.height}
            />
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <ThemedText style={styles.placeholderText}>
              {status === 'idle' ? 'Select and open a video' :
               status === 'ready' ? 'Press Play to start' :
               status === 'error' ? 'An error occurred' :
               'Loading...'}
            </ThemedText>
          </View>
        )}

        <View style={styles.cpuSection}>
          <ThemedText style={styles.cpuText}>CPU: {cpuInfo}</ThemedText>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scrollView: {
    flex: 1
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20
  },
  videoSection: {
    marginBottom: 20
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8
  },
  videoButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8
  },
  videoButton: {
    backgroundColor: '#ccc',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flex: 1
  },
  videoButtonActive: {
    backgroundColor: '#007AFF'
  },
  videoButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center'
  },
  videoButtonTextActive: {
    color: 'white'
  },
  pathText: {
    fontSize: 12,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1
  },
  openButton: {
    backgroundColor: '#5856D6'
  },
  stopButton: {
    backgroundColor: '#FF3B30'
  },
  buttonDisabled: {
    opacity: 0.3
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666'
  },
  statusPlaying: {
    color: '#34C759'
  },
  statusError: {
    color: '#FF3B30'
  },
  errorSection: {
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14
  },
  metadataSection: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  metadataTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8
  },
  metadataText: {
    fontSize: 14
  },
  canvasContainer: {
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
    alignItems: 'center'
  },
  placeholderContainer: {
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 40,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200
  },
  placeholderText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center'
  },
  cpuSection: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20
  },
  cpuText: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  }
})
