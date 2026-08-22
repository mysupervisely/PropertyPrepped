import './globals.css'
import { GoogleAnalytics } from '../components/GoogleAnalytics'

export const metadata = {
  title: 'PropRoster | Real Estate Portfolio Management & Investment Tools',
  description: 'Organize properties, track finances, manage documents and analyze real estate opportunities with PropRoster.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
      {/* Global GA4 site tag (components/GoogleAnalytics.tsx) — loaded
          once here so every route gets it, matching next/script's own
          documented "Application Scripts" pattern for a root-layout
          third-party script. */}
      <GoogleAnalytics />
    </html>
  )
}
