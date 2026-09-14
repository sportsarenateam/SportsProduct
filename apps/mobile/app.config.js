const fs = require("fs");
const path = require("path");

// Reuse the monorepo root .env (same keys as web/api).
const rootEnvPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(rootEnvPath)) {
  for (const line of fs.readFileSync(rootEnvPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const port = process.env.PORT || "4000";

/** Fix common typos: http:192... or http://192.168.1.9.4000 */
function normalizeApiUrl(raw) {
  let value = String(raw || "").trim();
  if (!value) return `http://localhost:${port}`;
  value = value.replace(/^https:(\d)/i, "https://$1").replace(/^http:(\d)/i, "http://$1");
  value = value.replace(/(\d{1,3}(?:\.\d{1,3}){3})\.(\d{2,5})(?=\/?$)/, "$1:$2");
  return value.replace(/\/$/, "");
}

const apiUrl = normalizeApiUrl(
  process.env.API_URL || process.env.EXPO_PUBLIC_API_URL || `http://localhost:${port}`,
);

module.exports = {
  expo: {
    name: "SportzArena",
    slug: "sportzarena",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/sportzarena-logo.png",
    splash: {
      image: "./assets/sportzarena-logo.png",
      resizeMode: "contain",
      backgroundColor: "#061f3d",
    },
    android: {
      package: "com.sportzarena.app",
      usesCleartextTraffic: true,
    },
    ios: {
      bundleIdentifier: "com.sportzarena.app",
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
          NSAllowsLocalNetworking: true,
        },
      },
    },
    plugins: ["expo-asset", "expo-font"],
    extra: {
      supabaseUrl: process.env.SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
      apiUrl,
    },
  },
};
