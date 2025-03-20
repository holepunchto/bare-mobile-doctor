import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { TabNavigator } from './components/TabNavigator'
import { IPCTests } from './views/IPCTests'
import { UDXTests } from './views/udx/UDXTests'
import { SodiumTests } from './views/SodiumTests'
import { HyperdbTests } from './views/hyperdb/HyperdbTests'

export type TestModule = 'IPC' | 'UDX' | 'Sodium' | 'Hyperdb'

export default function () {
  const [activeModule, setActiveModule] = useState<TestModule>('IPC')

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
    }
  }

  return (
    <View style={styles.container}>
      <TabNavigator
        modules={['IPC', 'UDX', 'Sodium', 'Hyperdb']}
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
