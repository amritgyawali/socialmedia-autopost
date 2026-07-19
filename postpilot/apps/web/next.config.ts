import path from "node:path";
import type { NextConfig } from "next";

// "standalone" output and a monorepo-spanning outputFileTracingRoot exist
// only for the self-hosted Docker build (apps/web/Dockerfile, which copies
// .next/standalone). Vercel does its own dependency tracing from the
// configured Root Directory and never reads .next/standalone; forcing
// standalone mode there instead makes Next.js pull its Node-only
// standalone-tracing machinery into the Edge Middleware bundle, which
// references __dirname (undefined in the Edge runtime) and crashes every
// request with MIDDLEWARE_INVOCATION_FAILED. Vercel sets VERCEL=1 on every
// build, so gating on it keeps both deployment targets working.
const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isVercel ? {} : { output: "standalone" as const, outputFileTracingRoot: path.join(process.cwd(), "../..") }),
  poweredByHeader: false,
  transpilePackages: ["@postpilot/shared"],
  experimental: {
    optimizePackageImports: ["@postpilot/shared"],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      ],
    }];
  },
};

export default nextConfig;
