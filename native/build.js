const { execFileSync } = require('child_process')
const { createHash } = require('crypto')
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs')

const PROFILE = 'ios.mobileprovision'
const TEMPLATE = 'native/ios.entitlements.in'
const ENTITLEMENTS = 'build/ios.entitlements'

if (!existsSync(PROFILE)) {
  throw new Error(`${PROFILE} not found. Download a development profile and copy it there.`)
}

const profile = execFileSync('security', ['cms', '-D', '-i', PROFILE])

const team = plist('ApplicationIdentifierPrefix.0')
const identifier = plist('Entitlements.application-identifier').slice(team.length + 1)

if (identifier === '*') {
  throw new Error('Identifier required')
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
  identity: signingIdentity(),
  provisioningProfile: PROFILE,
  entitlements: ENTITLEMENTS
}

function plist(key) {
  return execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', '-'], { input: profile })
    .toString()
    .trim()
}

function signingIdentity() {
  const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'])

  for (let i = 0; ; i++) {
    let certificate

    try {
      certificate = plist(`DeveloperCertificates.${i}`)
    } catch {
      throw new Error(`No identity in the keychain matches ${PROFILE}`)
    }

    const fingerprint = createHash('sha1')
      .update(Buffer.from(certificate, 'base64'))
      .digest('hex')
      .toUpperCase()

    const found = identities.toString().match(new RegExp(`${fingerprint} "([^"]+)"`))

    if (found !== null) return found[1]
  }
}
