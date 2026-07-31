import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cc.fishese.divelog",
  appName: "DiveFrame",
  webDir: "dist-native",
  loggingBehavior: "debug",
  android: {
    path: "android",
  },
};

export default config;
