import React, { ReactNode } from 'react';
import { Text, StyleSheet, TextProps, useColorScheme } from 'react-native';

interface ThemedTextProps extends TextProps {
  children: ReactNode;
  style?: any;
}

const ThemedText: React.FC<ThemedTextProps> = ({ children, style, ...props }) => {
  const theme = useColorScheme();
  const themedStyle = [
    style,
    { color: theme === 'dark' ? 'white' : 'black' },
  ];

  return (
    <Text style={themedStyle} {...props}>
      {children}
    </Text>
  );
};

export default ThemedText;
