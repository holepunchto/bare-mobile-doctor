// Signing options for `bare-build --config`, read from `ios.mobileprovision`
// at the root. That file is never committed, so nothing personal lives here.
const { execFileSync } = require('child_process')
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs')

const PROFILE = 'ios.mobileprovision'
const TEMPLATE = 'native/ios.entitlements.in'
const ENTITLEMENTS = 'build/ios.entitlements'

if (!existsSync(PROFILE)) {
  throw new Error(`${PROFILE} not found. Download a development profile and copy it there.`)
}

const profile = execFileSync('security', ['cms', '-D', '-i', PROFILE])

const applicationIdentifier = plist(profile, 'Entitlements.application-identifier')
const team = plist(profile, 'ApplicationIdentifierPrefix.0')
const identifier = applicationIdentifier.slice(team.length + 1)

if (identifier === '*') {
  throw new Error(`${PROFILE} is for a wildcard App ID, which cannot carry the V8 entitlement.`)
}

mkdirSync('build', { recursive: true })

writeFileSync(
  ENTITLEMENTS,
  readFileSync(TEMPLATE, 'utf8')
    .replaceAll('__TEAM_ID__', team)
    .replaceAll('__BUNDLE_ID__', identifier)
)

module.exports = {
  identifier,
  sign: true,
  identity: signingIdentity(profile),
  provisioningProfile: PROFILE,
  entitlements: ENTITLEMENTS
}

function plist(input, key) {
  return execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', '-'], { input })
    .toString()
    .trim()
}

// The common name of the first certificate the profile allows, which is the
// identity `codesign` expects.
function signingIdentity(profile) {
  const certificate = Buffer.from(plist(profile, 'DeveloperCertificates.0'), 'base64')

  const subject = execFileSync('openssl', ['x509', '-inform', 'DER', '-subject', '-noout'], {
    input: certificate
  }).toString()

  const name = subject.match(/CN\s*=\s*([^,/\n]+)/)

  if (name === null) throw new Error(`No signing identity in ${PROFILE}`)

  return name[1].trim()
}
