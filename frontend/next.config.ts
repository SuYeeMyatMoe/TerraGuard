import type { NextConfig } from "next";

const API = process.env.TERRAGUARD_API_URL ?? "http://127.0.0.1:8010";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
