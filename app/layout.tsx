import './globals.css'

export const metadata = {
  title: 'PropRoster | Real Estate Portfolio Management & Investment Tools',
  description: 'Organize properties, track finances, manage documents and analyze real estate opportunities with PropRoster.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
