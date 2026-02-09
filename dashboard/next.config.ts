import type { NextConfig } from "next";
import { validateEnv } from "./src/lib/validateEnv";

// Validate environment variables on startup
if (process.env.NODE_ENV !== 'test') {
  validateEnv();
}

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true
  },
  experimental: {
    optimizePackageImports: [
      "echarts",
      "framer-motion",
      "lucide-react",
      "@tremor/react",
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
