/**
 * Signs release builds with Caster's own key instead of React Native's public
 * debug key (which anyone could use to sign a fake "update").
 *
 * The key's location and passwords come from Gradle properties, normally set in
 * ~/.gradle/gradle.properties so they never enter the repo:
 *   CASTER_RELEASE_STORE_FILE, CASTER_RELEASE_STORE_PASSWORD,
 *   CASTER_RELEASE_KEY_ALIAS, CASTER_RELEASE_KEY_PASSWORD
 * Without them, release builds fall back to the debug key (fine for local testing only).
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (project.hasProperty('CASTER_RELEASE_STORE_FILE')) {
                storeFile file(CASTER_RELEASE_STORE_FILE)
                storePassword CASTER_RELEASE_STORE_PASSWORD
                keyAlias CASTER_RELEASE_KEY_ALIAS
                keyPassword CASTER_RELEASE_KEY_PASSWORD
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes('CASTER_RELEASE_STORE_FILE')) return cfg;

    const signingConfigs = /signingConfigs \{/;
    // The release *build type* (inside buildTypes), not any other block named "release".
    const releaseUsesDebug =
      /(buildTypes \{[\s\S]*?\n\s*release \{[^}]*?)signingConfig signingConfigs\.debug/;
    if (!signingConfigs.test(gradle) || !releaseUsesDebug.test(gradle)) {
      throw new Error('with-release-signing: app/build.gradle layout changed; update the plugin.');
    }

    // Point the release build type at our key first, then add the key's signing config.
    gradle = gradle.replace(
      releaseUsesDebug,
      "$1signingConfig project.hasProperty('CASTER_RELEASE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    gradle = gradle.replace(signingConfigs, (match) => match + RELEASE_CONFIG);
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
