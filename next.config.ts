import type { NextConfig } from "next";

const isNativeStatic = process.env.DIVEFRAME_NATIVE_STATIC === "1";

const nextConfig: NextConfig = {
  ...(isNativeStatic
    ? {
        output: "export" as const,
        // Keep native RSC payloads reproducible across build services.
        generateBuildId: () => "diveframe-native-static",
      }
    : {}),
  experimental: {
    serverActions: {
      // Vinext applies this request limit to multipart route handlers as well.
      // Keep it above the app's 20 MB per-photo validation limit.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
