import './globals.css'

export const metadata = {
  title: 'PropPrepped',
  description: 'Your properties. Organized.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
