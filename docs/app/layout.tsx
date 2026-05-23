import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://docs.heliacourt.xyz'),
  title: {
    default: 'Helia Court Docs',
    template: '%s | Helia Court Docs',
  },
  description: 'Documentation for Helia Court, the multi-agent forecasting court on Arc.',
  openGraph: {
    title: 'Helia Court Docs',
    description: 'Build, integrate, and audit Helia Court agents, cases, receipts, and Arc settlement.',
    url: 'https://docs.heliacourt.xyz',
    siteName: 'Helia Court Docs',
    images: ['/assets/helia-court-logo.svg'],
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
