const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// STROYCONTROL_RELEASE_SIGNING';

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy' || mod.modResults.contents.includes(MARKER)) {
      return mod;
    }

    let source = mod.modResults.contents;
    source = source.replace(
      '    signingConfigs {\n        debug {',
      `    signingConfigs {\n        release {\n            def keystorePath = findProperty('STROYCONTROL_UPLOAD_STORE_FILE')\n            if (keystorePath) {\n                storeFile file(keystorePath)\n                storePassword findProperty('STROYCONTROL_UPLOAD_STORE_PASSWORD')\n                keyAlias findProperty('STROYCONTROL_UPLOAD_KEY_ALIAS')\n                keyPassword findProperty('STROYCONTROL_UPLOAD_KEY_PASSWORD')\n            }\n        }\n        debug {`,
    );
    source = source.replace(
      '            // Caution! In production, you need to generate your own keystore file.\n            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug',
      `            ${MARKER}\n            if (findProperty('STROYCONTROL_UPLOAD_STORE_FILE')) {\n                signingConfig signingConfigs.release\n            }`,
    );
    source = source.replace(
      '    }\n    packagingOptions {',
      `        internalRelease {\n            initWith release\n            signingConfig signingConfigs.debug\n            matchingFallbacks = ['release']\n        }\n    }\n\n    def productionTasks = gradle.startParameter.taskNames.collect { it.tokenize(':').last() }\n    if (productionTasks.any { it == 'assembleRelease' || it == 'bundleRelease' }) {\n        if (!findProperty('STROYCONTROL_UPLOAD_STORE_FILE')) {\n            throw new GradleException('Production keystore is required. Set STROYCONTROL_UPLOAD_* Gradle properties.')\n        }\n    }\n    packagingOptions {`,
    );
    mod.modResults.contents = source;
    return mod;
  });
};
