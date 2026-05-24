import type { MetadataRoute } from 'next'

const siteUrl = 'https://docs.heliacourt.xyz'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Helia Court Docs',
    short_name: 'Helia Docs',
    description: 'Documentation for Helia Court, the multi-agent forecasting court on Arc.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fbf7ef',
    theme_color: '#fbf7ef',
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
