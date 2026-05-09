const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native-maps has no web build (it imports react-native internals like
// codegenNativeCommands that don't exist on web). For Phase 1 of web support
// we redirect the import to a runtime stub on web so the bundle compiles.
// Phase 3 swaps the consumers (TripMap, TrackedMarker) to @vis.gl/react-google-maps,
// at which point this resolver entry can be removed.
const reactNativeMapsWebStub = path.resolve(
  __dirname,
  'src/stubs/reactNativeMapsWeb.tsx',
);

const baseResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    (moduleName === 'react-native-maps' || moduleName.startsWith('react-native-maps/'))
  ) {
    return { type: 'sourceFile', filePath: reactNativeMapsWebStub };
  }
  if (baseResolveRequest) {
    return baseResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
