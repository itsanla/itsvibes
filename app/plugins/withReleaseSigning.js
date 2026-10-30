// APK rilis ditandatangani dengan keystore milik Aan (path dan sandi dari env saat build, lihat
// deploy/build-apk.sh). Tanpa env itu, build jatuh ke keystore debug bawaan template.
const { withAppBuildGradle } = require('expo/config-plugins')

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, cfg => {
    let g = cfg.modResults.contents
    if (!g.includes('ITSVIBES_KEYSTORE')) {
      g = g.replace(
        /signingConfigs\s*\{/,
        `signingConfigs {
        release {
            if (System.getenv('ITSVIBES_KEYSTORE')) {
                storeFile file(System.getenv('ITSVIBES_KEYSTORE'))
                storePassword System.getenv('ITSVIBES_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ITSVIBES_KEY_ALIAS')
                keyPassword System.getenv('ITSVIBES_KEYSTORE_PASSWORD')
            }
        }`,
      )
      g = g.replace(
        /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
        '$1signingConfig System.getenv("ITSVIBES_KEYSTORE") ? signingConfigs.release : signingConfigs.debug',
      )
    }
    cfg.modResults.contents = g
    return cfg
  })
}
