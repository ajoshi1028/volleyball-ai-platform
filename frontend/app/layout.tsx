import './globals.css'

export const metadata = {
  title: 'Volleyball AI Platform',
  description: 'AI-powered volleyball practice analysis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
