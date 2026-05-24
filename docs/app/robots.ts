import type { MetadataRoute } from 'next'

const siteUrl = 'https://docs.heliacourt.xyz'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
