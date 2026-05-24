import type { Metadata } from 'next'
import './globals.css'

const siteUrl = 'https://docs.heliacourt.xyz'
const siteDescription = 'Documentation for Helia Court, the multi-agent forecasting court on Arc.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Helia Court Docs',
  title: {
    default: 'Helia Court Docs',
    template: '%s | Helia Court Docs',
  },
  description: siteDescription,
  keywords: [
    'Helia Court docs',
    'agent registry',
    'ERC-8004',
    'Arc settlement',
    'x402',
    'prediction market agents',
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
    title: 'Helia Court Docs',
    description: 'Build, integrate, and audit Helia Court agents, cases, receipts, and Arc settlement.',
    url: '/',
    siteName: 'Helia Court Docs',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Helia Court documentation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helia Court Docs',
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
      <body>{children}</body>
    </html>
  )
}
