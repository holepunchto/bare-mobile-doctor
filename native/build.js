const { execFileSync } = require('child_process')
const { createHash } = require('crypto')
const { existsSync } = require('fs')

const PROFILE = 'ios.mobileprovision'

if (!existsSync(PROFILE)) {
  throw new Error(`${PROFILE} not found. Download a development profile and copy it there.`)
}

const profile = execFileSync('security', ['cms', '-D', '-i', PROFILE])

const team = plist('ApplicationIdentifierPrefix.0')
const identifier = plist('Entitlements.application-identifier').slice(team.length + 1)

if (identifier === '*') {
  throw new Error('Identifier required')
}

module.exports = {
  identifier,
  sign: true,
  identity: signingIdentity(),
  provisioningProfile: PROFILE,
  infoPlist: 'native/Info.plist'
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

    // Not a security hash: SHA-1 is the fingerprint format `security
    // find-identity` prints and `codesign -s` takes.
    const fingerprint = createHash('sha1')
      .update(Buffer.from(certificate, 'base64'))
      .digest('hex')
      .toUpperCase()

    const found = identities.toString().match(new RegExp(`${fingerprint} "([^"]+)"`))

    if (found !== null) return found[1]
  }
}
