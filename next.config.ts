import type { NextConfig } from "next";

// Sent with every response. A full Content-Security-Policy (scripts, styles) is left for later:
// Next.js's inline scripts need nonces for it.
const SECURITY_HEADERS = [
  // Never shown inside another site's frame (clickjacking).
  // Also: no plugins, no changing the page's base address, forms only post to this site (a form
  // posting elsewhere, e.g. a payment page, would need adding here).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // HTTPS only, for two years (ignored by browsers on plain-http localhost).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Server actions keep Next's default 1 MB request limit; picture uploads use app/api/media/upload instead.
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Addresses before 0037 (categories became test types); kept so old links and bookmarks still work.
  async redirects() {
    return [
      { source: "/admin/categories", destination: "/admin/test-types", permanent: false },
      { source: "/dashboard/category", destination: "/dashboard/test-type", permanent: false },
    ];
  },
};

export default nextConfig;
