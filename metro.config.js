const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Add video file extensions as assets
config.resolver.assetExts.push('mkv', 'avi')

module.exports = config
