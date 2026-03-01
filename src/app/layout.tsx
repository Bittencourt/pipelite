import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { auth } from "@/auth"
import { NavHeader } from "@/components/nav-header"
import { HotkeysProvider } from "@/components/keyboard/hotkeys-provider"
import { ShortcutsHint } from "@/components/keyboard"
import { Toaster } from "@/components/ui/sonner"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Pipelite - CRM",
  description: "Self-hosted CRM for sales teams",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth()
  const user = session?.user
    ? { email: session.user.email || "", role: session.user.role }
    : null

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <HotkeysProvider>
          <NavHeader user={user} />
          <main className="min-h-[calc(100vh-3.5rem)]">
            {children}
          </main>
          <ShortcutsHint />
          <Toaster />
        </HotkeysProvider>
      </body>
    </html>
  )
}
