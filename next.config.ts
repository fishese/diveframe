import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Vinext applies this request limit to multipart route handlers as well.
      // Keep it above the app's 20 MB per-photo validation limit.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
