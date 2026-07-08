import { useState } from 'react'
import { View, StyleSheet, Switch } from 'react-native'

import ThemedText from './components/ThemedText'
import TabNavigator from './components/TabNavigator'
import IPCTests from './views/ipc/IPCTests'
import UDXTests from './views/udx/UDXTests'
import SodiumTests from './views/SodiumTests'
import HyperdbTests from './views/hyperdb/HyperdbTests'
import HypercoreTests from './views/hypercore/HypercoreTests'
import OSTests from './views/os/OSTests'
import ChecksumTests from './views/checksum/ChecksumTests'
import VideoCaptureTests from './views/videocapture/VideoCaptureTests'
import VideoConverterTests from './views/videoconverter/VideoConverterTests'
import RocksDBTests from './views/rocksdb/RocksDBTests'
import BluetoothTests from './views/bluetooth/BluetoothTests'

export type TestModule =
  | 'IPC'
  | 'UDX'
  | 'Sodium'
  | 'Hyperdb'
  | 'Hypercore'
  | 'Checksum'
  | 'OS'
  | 'VideoCapture'
  | 'VideoConverter'
  | 'RocksDB'
  | 'Bluetooth'

export default function () {
  const [activeModule, setActiveModule] = useState<TestModule>('OS')
  const [logsEnabled, setLogsEnabled] = useState(false)

  const renderContent = () => {
    switch (activeModule) {
      case 'IPC':
        return <IPCTests logsEnabled={logsEnabled} />
      case 'UDX':
        return <UDXTests logsEnabled={logsEnabled} />
      case 'Sodium':
        return <SodiumTests />
      case 'Hyperdb':
        return <HyperdbTests logsEnabled={logsEnabled} />
      case 'Hypercore':
        return <HypercoreTests logsEnabled={logsEnabled} />
      case 'OS':
        return <OSTests logsEnabled={logsEnabled} />
      case 'Checksum':
        return <ChecksumTests logsEnabled={logsEnabled} />
      case 'VideoCapture':
        return <VideoCaptureTests logsEnabled={logsEnabled} />
      case 'VideoConverter':
        return <VideoConverterTests logsEnabled={logsEnabled} />
      case 'RocksDB':
        return <RocksDBTests logsEnabled={logsEnabled} />
      case 'Bluetooth':
        return <BluetoothTests logsEnabled={logsEnabled} />
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.logsToggle}>
        <ThemedText style={styles.logsLabel}>{logsEnabled ? '🟢' : '⚪'} Debug logs</ThemedText>
        <Switch value={logsEnabled} onValueChange={setLogsEnabled} />
      </View>
      <TabNavigator
        modules={[
          'IPC',
          'UDX',
          'Sodium',
          'Hyperdb',
          'Hypercore',
          'Checksum',
          'OS',
          'VideoCapture',
          'VideoConverter',
          'RocksDB',
          'Bluetooth'
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
  },
  logsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8
  },
  logsLabel: {
    marginRight: 8,
    fontSize: 14,
    fontWeight: '600'
  }
})
