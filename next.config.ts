import type { NextConfig } from "next"
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["argon2", "pipedrive"],
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default withNextIntl(nextConfig)
