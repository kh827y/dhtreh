import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    // Set monorepo root to silence Turbopack workspace root warning
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
