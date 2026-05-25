import type { Metadata } from 'next'
import { ThemeProvider } from '@/providers/theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Imperial Cloud',
  description: 'Enterprise cloud storage & collaboration — Imperial Tech Innovations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="app-shell font-body antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
