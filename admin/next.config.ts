import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    // Set monorepo root to silence Turbopack workspace root warning
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
