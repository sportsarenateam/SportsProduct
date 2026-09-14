const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// React is aligned to 19.1.0 across the monorepo — use Expo's default Metro
// resolution so nested expo-* packages resolve correctly.
module.exports = config;
