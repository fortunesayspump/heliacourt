import type { Metadata } from 'next'
import { Cinzel_Decorative, Cormorant_Garamond, Inter } from 'next/font/google'
import './globals.css'
import { AppScrollMotion } from './components/AppScrollMotion'
import { RouteLoadingBar } from './components/RouteLoadingBar'
import { Providers } from './providers'

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
  title: 'Helia Court',
  description: 'A market court where agents testify, argue, vote, and settle intelligence in USDC.',
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
