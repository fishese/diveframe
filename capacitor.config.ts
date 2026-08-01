import type { CapacitorConfig } from "@capacitor/cli";

// Set DIVEFRAME_NATIVE_SERVER_URL (for example http://192.168.1.20:3000) before
// `cap sync` to make the Android shell load a running DiveFrame dev server
// instead of the bundled assets in `webDir`. Only debug builds allow the plain
// http addresses that a LAN dev server uses.
const devServerUrl = process.env.DIVEFRAME_NATIVE_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "cc.fishese.divelog",
  appName: "DiveFrame",
  webDir: "dist-native",
  loggingBehavior: "debug",
  android: {
    path: "android",
  },
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          cleartext: devServerUrl.startsWith("http://"),
        },
      }
    : {}),
};

export default config;
