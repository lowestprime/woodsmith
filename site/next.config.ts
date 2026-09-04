import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    qualities: [75, 86, 88, 92]
  },
  outputFileTracingExcludes: {
    "/*": [
      "./data/**/*",
      "./lib/**/*.test.mts",
      "./lib/**/*.test.ts",
      "./lib/**/*.test.tsx",
      "./scripts/**/*.test.mjs"
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

export default nextConfig;
