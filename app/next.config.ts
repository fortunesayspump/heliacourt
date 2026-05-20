import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    root: path.resolve(process.cwd(), '..'),
    resolveAlias: {
      accounts: './src/lib/empty-accounts.ts',
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      accounts: path.resolve(process.cwd(), 'src/lib/empty-accounts.ts'),
    }
    return config
  },
}

export default nextConfig
