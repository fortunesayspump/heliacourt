import type { Metadata } from 'next'
import { Cinzel_Decorative, Cormorant_Garamond, Inter } from 'next/font/google'
import './globals.css'

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
  title: 'Helia Court',
  description: 'Market intelligence argued like a court case.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${cinzelDecorative.variable} ${cormorant.variable} ${inter.variable}`}>
        <div className="site-scroll-root">{children}</div>
      </body>
    </html>
  )
}
