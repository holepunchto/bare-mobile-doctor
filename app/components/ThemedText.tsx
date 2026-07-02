import React, { ReactNode } from 'react'
import { Text, StyleSheet, TextProps, useColorScheme } from 'react-native'

interface ThemedTextProps extends TextProps {
  children: ReactNode
  style?: any
}

const ThemedText: React.FC<ThemedTextProps> = ({ children, style, ...props }) => {
  const theme = useColorScheme()
  // Theme color is the default; an explicit `color` in `style` overrides it
  // (otherwise white/black would clobber intentional colors like error text).
  const themedStyle = [{ color: theme === 'dark' ? 'white' : 'black' }, style]

  return (
    <Text style={themedStyle} {...props}>
      {children}
    </Text>
  )
}

export default ThemedText
