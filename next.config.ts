import type { NextConfig } from "next";

// Browser media work needs two CDN origins: jsDelivr serves the MediaPipe
// vision wasm + the smartcrop-independent face model loader, and Google
// storage serves the BlazeFace model file. No COOP/COEP headers are set:
// this site deliberately does NOT use ffmpeg.wasm (whose multi-thread core
// would require cross-origin isolation), so no page embed is broken by it.
//
// Phase 11 adds the CC-import sources to connect-src: the browser
// loads a verified CC video straight from Wikimedia Commons or the
// Internet Archive, so those two origins must be fetchable. Nothing
// else is opened — the paste allow-list stays closed.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com https://upload.wikimedia.org https://commons.wikimedia.org https://archive.org https://*.archive.org",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

// When R2 is configured, its public origin joins the media/img/connect
// lists so hosted clips and thumbnails load. Unset = previous CSP.
const r2Origin = process.env.R2_CSP_ORIGIN;
const cspValue = r2Origin
  ? csp
      .map((d) =>
        d.startsWith("img-src") ||
        d.startsWith("media-src") ||
        d.startsWith("connect-src")
          ? `${d} ${r2Origin}`
          : d,
      )
      .join("; ")
  : csp.join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "Content-Security-Policy", value: cspValue }],
      },
    ];
  },
};

export default nextConfig;
