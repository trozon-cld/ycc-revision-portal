import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Picture uploads: up to 5 MB plus a small thumbnail (see lib/media/limits.ts).
      bodySizeLimit: "7mb",
    },
  },
};

export default nextConfig;
