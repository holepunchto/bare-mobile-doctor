import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { TestModule } from '../index'

interface Props {
  modules: TestModule[]
  activeModule: TestModule
  onChangeModule: (module: TestModule) => void
}

export default function TabNavigator({
  modules,
  activeModule,
  onChangeModule
}: Props) {
  return (
    <View style={styles.tabContainer}>
      {modules.map((module) => (
        <TouchableOpacity
          key={module}
          style={[styles.tab, activeModule === module && styles.activeTab]}
          onPress={() => onChangeModule(module)}
        >
          <Text
            style={[
              styles.tabText,
              activeModule === module && styles.activeTabText
            ]}
          >
            {module}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    borderRadius: 8,
    justifyContent: 'center',

  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    margin: 4,
    backgroundColor: '#f0f0f0',
  },
  activeTab: {
    backgroundColor: '#007AFF'
  },
  tabText: {
    fontSize: 14,
    color: '#666'
  },
  activeTabText: {
    color: 'white',
    fontWeight: '600'
  }
})
