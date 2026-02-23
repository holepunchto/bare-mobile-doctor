import React, { useState, useEffect, useRef } from 'react'
import {
  TouchableOpacity,
  StyleSheet,
  View,
  ScrollView,
  Platform
} from 'react-native'
import { Audio, Video, ResizeMode } from 'expo-av'

import { Worklet } from 'react-native-bare-kit'
import FramedStream from 'framed-stream'
import b4a from 'b4a'
import * as FileSystem from 'expo-file-system'
import { Asset } from 'expo-asset'

import ThemedText from '../../components/ThemedText'
import useBareDir from '../../hooks/useBareDir'

const source = require('./videoconverter.bundle')

type PlayerStatus = 'idle' | 'streaming' | 'playing' | 'done' | 'error'

function parseMessage(data: Uint8Array): { type: string; body: string } | null {
  const str = b4a.toString(data)

  if (str.startsWith('cpu')) return { type: 'cpu', body: str.slice(3) }
  if (str.startsWith('sts:')) return { type: 'status', body: str.slice(4) }
  if (str.startsWith('err:')) return { type: 'error', body: str.slice(4) }
  if (str.startsWith('url:')) return { type: 'url', body: str.slice(4) }
  if (str.startsWith('dur:')) return { type: 'duration', body: str.slice(4) }

  return null
}

export default function VideoConverterTest() {
  const worklet = useRef(new Worklet()).current
  const [cpuInfo, setCpuInfo] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [error, setError] = useState('')
  const [selectedVideo, setSelectedVideo] = useState('sample_30s.mkv')
  const [totalDuration, setTotalDuration] = useState(0)
  const [bareDir, setBareDir] = useState('')

  const stream = useRef<any>(null)
  const videoRef = useRef<Video>(null)

  useEffect(() => {
    const setup = async () => {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true })

      const dir = await useBareDir()
      setBareDir(dir)

      const videos = [
        { name: 'sample_30s.mkv', asset: require('../../../assets/videos/sample_30s.mkv') },
        { name: 'sample_30s.avi', asset: require('../../../assets/videos/sample_30s.avi') },
        { name: 'sample_4min.mkv', asset: require('../../../assets/videos/sample_4min.mkv') }
      ]

      for (const v of videos) {
        const destPath = `${dir}/${v.name}`
        const fileInfo = await FileSystem.getInfoAsync(destPath)
        if (fileInfo.exists) await FileSystem.deleteAsync(destPath)

        const asset = Asset.fromModule(v.asset)
        await asset.downloadAsync()

        if (asset.localUri) {
          await FileSystem.copyAsync({ from: asset.localUri, to: destPath })
        }
      }

      worklet.start('videoconverter.bundle', source, ['false'])

      stream.current = new FramedStream(worklet.IPC)

      stream.current.on('data', (data: any) => {
        const msg = parseMessage(data)
        if (!msg) return

        if (msg.type === 'cpu') setCpuInfo(msg.body)
        if (msg.type === 'status') setStatus(msg.body as PlayerStatus)
        if (msg.type === 'error') { setError(msg.body); setStatus('error') }
        if (msg.type === 'url') setVideoUrl(msg.body)
        if (msg.type === 'duration') setTotalDuration(parseInt(msg.body, 10))
      })
    }

    setup()
    return () => { worklet.terminate() }
  }, [])

  const openVideo = () => {
    if (!bareDir) return
    setError('')
    setVideoUrl('')
    setTotalDuration(0)
    stream.current.write(b4a.from(`open:${bareDir}/${selectedVideo}`))
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <ThemedText style={styles.title}>Video Converter</ThemedText>
        <ThemedText style={styles.subtitle}>
          Live transcoding MKV/AVI to MP4 via bare-media
        </ThemedText>

        <View style={styles.videoButtons}>
          {['sample_30s.mkv', 'sample_30s.avi', 'sample_4min.mkv'].map((name) => (
            <TouchableOpacity
              key={name}
              style={[styles.videoButton, selectedVideo === name && styles.videoButtonActive]}
              onPress={() => setSelectedVideo(name)}
            >
              <ThemedText
                style={[styles.videoButtonText, selectedVideo === name && styles.videoButtonTextActive]}
              >
                {name}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.streamButton} onPress={openVideo}>
          <ThemedText style={styles.streamButtonText}>Stream</ThemedText>
        </TouchableOpacity>

        <View style={styles.statusSection}>
          <ThemedText style={styles.statusLabel}>Status:</ThemedText>
          <ThemedText
            style={[
              styles.statusText,
              status === 'streaming' && { color: '#FF9500' },
              status === 'playing' && { color: '#34C759' },
              status === 'done' && { color: '#34C759' },
              status === 'error' && { color: '#FF3B30' }
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

        {videoUrl ? (
          <View style={styles.videoContainer}>
            <Video
              ref={videoRef}
              source={{ uri: videoUrl }}
              style={styles.video}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping={false}
              onError={(e) => { console.log('Video error:', e); setError('Video playback error'); setStatus('error') }}
              onReadyForDisplay={() => {
                videoRef.current?.playAsync()
                setStatus('playing')
              }}
              onPlaybackStatusUpdate={(s) => {
                if (s.isLoaded && stream.current) {
                  const posSec = Math.floor(s.positionMillis / 1000)
                  stream.current.write(b4a.from('pos:' + posSec))
                  if (s.isPlaying) {
                    stream.current.write(b4a.from('play'))
                  } else if (!s.isBuffering) {
                    stream.current.write(b4a.from('pause'))
                  }
                }
              }}
              progressUpdateIntervalMillis={1000}
            />
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <ThemedText style={styles.placeholderText}>
              {status === 'idle' ? 'Select a video and press Stream' :
               status === 'streaming' ? 'Transcoding...' :
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
  container: { flex: 1 },
  scrollView: { flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  videoButtons: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  videoButton: {
    backgroundColor: '#ccc',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flex: 1
  },
  videoButtonActive: { backgroundColor: '#007AFF' },
  videoButtonText: { color: '#666', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  videoButtonTextActive: { color: 'white' },
  streamButton: {
    backgroundColor: '#5856D6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  streamButtonText: { color: 'white', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8
  },
  statusLabel: { fontSize: 16, fontWeight: '600', marginRight: 8 },
  statusText: { fontSize: 16, fontWeight: 'bold', color: '#666' },
  errorSection: {
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  errorText: { color: '#FF3B30', fontSize: 14 },
  videoContainer: {
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
    height: 250
  },
  video: { flex: 1, backgroundColor: '#000' },
  placeholderContainer: {
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 40,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200
  },
  placeholderText: { color: '#666', fontSize: 16, textAlign: 'center' },
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
