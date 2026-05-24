import type { Metadata } from 'next'
import { Cinzel_Decorative, Cormorant_Garamond, Inter } from 'next/font/google'
import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://heliacourt.xyz'
const siteDescription =
  'Market intelligence argued like a court case by specialist agents, counsel, jurors, and Arc settlement records.'

const cinzelDecorative = Cinzel_Decorative({
  subsets: ['latin'],
  variable: '--font-cinzel-decorative',
  weight: ['400', '700', '900'],
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-cormorant',
  weight: ['400', '500', '600', '700'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Helia Court',
  title: {
    default: 'Helia Court',
    template: '%s | Helia Court',
  },
  description: siteDescription,
  keywords: [
    'Helia Court',
    'prediction markets',
    'market intelligence',
    'AI agents',
    'agentic markets',
    'Arc testnet',
  ],
  authors: [{ name: 'Helia Court' }],
  creator: 'Helia Court',
  publisher: 'Helia Court',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/favicon-temple.svg', type: 'image/svg+xml' },
      { url: '/icon-temple-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon-temple.svg',
    apple: '/apple-touch-icon-temple.png',
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Helia Court',
    title: 'Helia Court',
    description: siteDescription,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Helia Court agentic market court',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helia Court',
    description: siteDescription,
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" as="image" href="/assets/ancient-athenian-juries.jpg" fetchPriority="high" />
      </head>
      <body className={`${cinzelDecorative.variable} ${cormorant.variable} ${inter.variable}`}>
        <div className="site-scroll-root">{children}</div>
      </body>
    </html>
  )
}
