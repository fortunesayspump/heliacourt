import type { MetadataRoute } from 'next'

const siteUrl = 'https://docs.heliacourt.xyz'

const routes = [
  '/',
  '/terms',
  '/privacy',
  '/reference/court-engine-architecture',
  '/reference/production-intelligence-stack',
  '/reference/readme',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified,
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : 0.6,
  }))
}
