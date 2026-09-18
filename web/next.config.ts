import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  // The content directory lives outside the Next app root; make sure it is
  // traced into the standalone bundle so packaged builds can read it.
  outputFileTracingIncludes: {
    "/*": ["../content/**/*"],
  },
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Fake sites decide their own trailing-slash behaviour, like a real server would.
  skipTrailingSlashRedirect: true,
  devIndicators: false,
  agentRules: false,
  poweredByHeader: false,
  images: { unoptimized: true },
  typescript: { tsconfigPath: "../tsconfig.json" },
};

export default nextConfig;
