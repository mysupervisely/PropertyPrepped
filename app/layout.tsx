import './globals.css'

export const metadata = {
  title: 'PropRoster',
  description: 'Your real estate portfolio, all in one place.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
