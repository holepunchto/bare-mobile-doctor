const { withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Xcode 26 (Apple Clang 21) rejects fmt 11.x consteval usage.
// Disable consteval in fmt until React Native bumps to fmt 12.x.
// https://github.com/facebook/react-native/issues/55601

const FMT_FIX = `
    # Fix fmt consteval error with Xcode 26 (Apple Clang 21)
    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |bc|
          bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
          bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
        end
      end
    end
`

module.exports = function withFmtFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile')
      let podfile = fs.readFileSync(podfilePath, 'utf8')

      if (podfile.includes('FMT_USE_CONSTEVAL')) return config

      const marker = 'react_native_post_install('
      const idx = podfile.indexOf(marker)
      if (idx === -1) {
        console.warn('[withFmtFix] Could not find react_native_post_install in Podfile')
        return config
      }

      // Find the closing paren + newline of react_native_post_install(...)
      let depth = 0
      let i = idx + marker.length
      for (; i < podfile.length; i++) {
        if (podfile[i] === '(') depth++
        if (podfile[i] === ')') {
          if (depth === 0) break
          depth--
        }
      }

      // Insert after the closing paren + newline
      const insertAt = podfile.indexOf('\n', i) + 1
      podfile = podfile.slice(0, insertAt) + FMT_FIX + podfile.slice(insertAt)

      fs.writeFileSync(podfilePath, podfile)
      return config
    }
  ])
}
