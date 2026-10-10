import type { NextConfig } from "next";
import path from "node:path";

const API = process.env.TERRAGUARD_API_URL ?? "http://127.0.0.1:8010";

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: path.resolve(__dirname),
  turbopack: { root: path.resolve(__dirname) },
  // Earth Engine can take several bounded remote calls for before/after imagery.
  experimental: { proxyTimeout: 540000 },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
