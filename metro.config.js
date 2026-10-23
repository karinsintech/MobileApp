/**
 * Metro bundler config for Karins Fleet (React Native 0.86).
 *
 * Xcode Archive can fail with:
 *   Failed to get the SHA-1 for: .../metro-runtime/src/polyfills/require.js
 *
 * Two macOS pitfalls show up together under ~/Downloads:
 * 1) Path case drift — Xcode uses `Downloads` while `pwd`/Node resolve `downloads`.
 *    Metro's haste map is case-sensitive, so SHA-1 lookup then misses the file.
 * 2) Watchman often cannot crawl TCC-protected folders; Node FS is more reliable.
 */
const fs = require('fs');
const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const projectRoot = fs.realpathSync(path.resolve(__dirname));

// Collect every spelling Metro might see for the same on-disk tree.
const watchFolders = new Set([projectRoot]);
if (process.platform === 'darwin') {
  watchFolders.add(projectRoot.replace('/Downloads/', '/downloads/'));
  watchFolders.add(projectRoot.replace('/downloads/', '/Downloads/'));
}

// Bundle polyfill package — always watch its real path, not just projectRoot.
const metroRuntimeRoot = path.dirname(
  fs.realpathSync(require.resolve('metro-runtime/package.json')),
);
watchFolders.add(metroRuntimeRoot);

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  projectRoot,
  watchFolders: [...watchFolders],
  resolver: {
    useWatchman: false,
  },
  watcher: {
    // Compute hashes during crawl so Archive doesn't depend on lazy lookup
    // against a case-mismatched haste map entry.
    unstable_lazySha1: false,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
