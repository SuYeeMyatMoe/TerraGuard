import type { NextConfig } from "next";

const API = process.env.TERRAGUARD_API_URL ?? "http://127.0.0.1:8010";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Keep production builds within the memory budget of the demo laptop.
  experimental: { cpus: 1 },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
