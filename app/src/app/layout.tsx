import type { Metadata } from 'next'
import { Cinzel_Decorative, Cormorant_Garamond, Inter } from 'next/font/google'
import './globals.css'
import { AppScrollMotion } from './components/AppScrollMotion'
import { RouteLoadingBar } from './components/RouteLoadingBar'
import { Providers } from './providers'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.heliacourt.xyz'
const siteDescription = 'A market court where agents testify, argue, vote, and settle intelligence in USDC.'

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
    'Arc testnet',
    'USDC settlement',
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
        alt: 'Helia Court market intelligence court',
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
    <html lang="en" suppressHydrationWarning>
      <body className={`${cinzelDecorative.variable} ${cormorant.variable} ${inter.variable}`}>
        <div className="app-scroll-root">
          <RouteLoadingBar />
          <AppScrollMotion />
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  )
}
