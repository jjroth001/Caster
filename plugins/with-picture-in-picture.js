/**
 * Lets video episodes shrink to a floating picture-in-picture window. The main activity
 * already handles size and orientation changes itself (configChanges), so entering and
 * leaving the window doesn't restart the app.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withPictureInPicture(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (main) {
      main.$['android:supportsPictureInPicture'] = 'true';
      main.$['android:resizeableActivity'] = 'true';
    }
    return cfg;
  });
};
