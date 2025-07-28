import { useState } from 'react'
import { View, StyleSheet, Text } from 'react-native'

import TabNavigator from './components/TabNavigator'
import IPCTests from './views/ipc/IPCTests'
import UDXTests from './views/udx/UDXTests'
import SodiumTests from './views/SodiumTests'
import HyperdbTests from './views/hyperdb/HyperdbTests'
import HypercoreTests from './views/hypercore/HypercoreTests'
import OSTests from './views/os/OSTests'
import ChecksumTests from './views/checksum/ChecksumTests'
import FFmpegTests from './views/ffmpeg/FFmpegTests'
import RocksDBTests from './views/rocksdb/RocksDBTests'

export type TestModule =
  | 'IPC'
  | 'UDX'
  | 'Sodium'
  | 'Hyperdb'
  | 'Hypercore'
  | 'Checksum'
  | 'OS'
  | 'FFmpeg'
  | 'RocksDB'

export default function () {
  const [activeModule, setActiveModule] = useState<TestModule>('OS')

  const renderContent = () => {
    switch (activeModule) {
      case 'IPC':
        return <IPCTests />
      case 'UDX':
        return <UDXTests />
      case 'Sodium':
        return <SodiumTests />
      case 'Hyperdb':
        return <HyperdbTests />
      case 'Hypercore':
        return <HypercoreTests />
      case 'OS':
        return <OSTests />
      case 'Checksum':
        return <ChecksumTests />
      case 'FFmpeg':
        return <FFmpegTests />
      case 'RocksDB':
        return <RocksDBTests />
    }
  }

  return (
    <View style={styles.container}>
      <TabNavigator
        modules={[
          'IPC',
          'UDX',
          'Sodium',
          'Hyperdb',
          'Hypercore',
          'Checksum',
          'OS',
          'FFmpeg',
          'RocksDB'
        ]}
        activeModule={activeModule}
        onChangeModule={setActiveModule}
      />
      {renderContent()}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20
  }
})
