const fs = require('fs')
const path = require('path')
const { withDangerousMod } = require('@expo/config-plugins')

const MARKER = '# raise pod deployment targets to the app floor'

// Xcode 27 rejects any target below iOS 15.0. React Native's
// updateOSDeploymentTarget only lifts each pod's native target, so resource
// bundle targets keep their podspec value - SDWebImage still ships 9.0.
// Safe to run before react_native_post_install: that one only ever raises.
// build_config, not config: the Podfile's own `config` is read right after.
const PATCH = `
    ${MARKER}
    floor = podfile_properties['ios.deploymentTarget'] || '15.1'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || current.to_f < floor.to_f
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = floor
        end
      end
    end
`

const ANCHOR = 'post_install do |installer|\n'

module.exports = function withPodsDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile')
      const contents = fs.readFileSync(podfile, 'utf8')

      if (contents.includes(MARKER)) return config

      const at = contents.indexOf(ANCHOR)
      if (at === -1) throw new Error(`withPodsDeploymentTarget: no post_install in ${podfile}`)

      const end = at + ANCHOR.length
      fs.writeFileSync(podfile, contents.slice(0, end) + PATCH + contents.slice(end))

      return config
    }
  ])
}
