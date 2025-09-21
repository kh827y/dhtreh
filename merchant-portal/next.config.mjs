/** @type {import('next').NextConfig} */
const nextConfig = {
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
