import type { NextConfig } from "next";
import path from "node:path";

const API = process.env.TERRAGUARD_API_URL ?? "http://127.0.0.1:8010";
const onVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: path.resolve(__dirname),
  turbopack: { root: path.resolve(__dirname) },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "@react-three/drei", "three"],
    ...(!onVercel ? { proxyTimeout: 540000 } : {}),
  },
  async rewrites() {
    if (onVercel) return [];
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
  async headers() {
    const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    return [
      { source: "/earth/:path*", headers: immutable },
      { source: "/forest/:path*", headers: immutable },
    ];
  },
};

export default nextConfig;
