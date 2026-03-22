const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);

// Workaround pour "Cannot call a class as a function" (Expo 53+/Metro package exports)
config.resolver ??= {};
config.resolver.unstable_enablePackageExports = false;

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'lodash') {
    const lodashPath = path.resolve(__dirname, 'node_modules/lodash/lodash.js');
    return { filePath: lodashPath, type: 'sourceFile' };
  }

  if (typeof originalResolveRequest === 'function') {
    return originalResolveRequest(context, moduleName, platform);
  }

  // Fallback vers le resolver par défaut de Metro
  return resolve(context, moduleName, platform);
};

module.exports = config;
