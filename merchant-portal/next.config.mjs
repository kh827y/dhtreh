/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  experimental: {
    optimizePackageImports: ['@loyalty/ui'],
    turbo: {
      resolveAlias: {
        '@loyalty/ui': '@loyalty/ui'
      }
    }
  },
  transpilePackages: ['@loyalty/ui']
};

export default nextConfig;
