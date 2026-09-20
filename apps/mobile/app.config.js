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
const isProd = process.env.APP_ENV === "production";

/** Fix common typos: http:192... or http://192.168.1.9.4000 */
function normalizeApiUrl(raw) {
  let value = String(raw || "").trim();
  if (!value) return `http://localhost:${port}`;
  value = value.replace(/^https:(\d)/i, "https://$1").replace(/^http:(\d)/i, "http://$1");
  value = value.replace(/(\d{1,3}(?:\.\d{1,3}){3})\.(\d{2,5})(?=\/?$)/, "$1:$2");
  return value.replace(/\/$/, "");
}

// Production / preview builds always hit the live API (no LAN override baked in).
const apiUrl = isProd || process.env.APP_ENV === "preview"
  ? normalizeApiUrl(process.env.API_URL || "https://api.sportsarena.team")
  : normalizeApiUrl(
      process.env.API_URL || process.env.EXPO_PUBLIC_API_URL || `http://localhost:${port}`,
    );

module.exports = {
  expo: {
    name: "SportzArena",
    slug: "sportzarena",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#041628",
    },
    android: {
      package: "com.sportzarena.app",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#041628",
      },
      // Cleartext only for local/dev LAN APIs — disabled in production store builds.
      usesCleartextTraffic: !isProd,
    },
    ios: {
      bundleIdentifier: "com.sportzarena.app",
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: !isProd,
          NSAllowsLocalNetworking: !isProd,
        },
      },
    },
    plugins: [
      "expo-asset",
      "expo-font",
      "@react-native-community/datetimepicker",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#041628",
          image: "./assets/splash-icon.png",
          imageWidth: 200,
        },
      ],
    ],
    extra: {
      supabaseUrl: process.env.SUPABASE_URL ?? "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
      apiUrl,
      appEnv: process.env.APP_ENV || "development",
      eas: {
        projectId: process.env.EAS_PROJECT_ID || undefined,
      },
    },
  },
};
