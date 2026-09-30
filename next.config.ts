import type { NextConfig } from "next";

// Sent with every response. A full Content-Security-Policy (scripts, styles) is left for later:
// Next.js's inline scripts need nonces for it.
const SECURITY_HEADERS = [
  // Never shown inside another site's frame (clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // HTTPS only, for two years (ignored by browsers on plain-http localhost).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Picture uploads: up to 5 MB plus a small thumbnail (see lib/media/limits.ts).
      bodySizeLimit: "7mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
