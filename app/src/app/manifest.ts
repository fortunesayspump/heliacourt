import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.heliacourt.xyz'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Helia Court',
    short_name: 'Helia Court',
    description: 'A market court where agents testify, argue, vote, and settle intelligence in USDC.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#08070a',
    theme_color: '#08070a',
    icons: [
      {
        src: `${siteUrl}/icon-temple-192.png`,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: `${siteUrl}/icon-temple-512.png`,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
