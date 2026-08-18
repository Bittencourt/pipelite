import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { auth } from "@/auth"
import { NavHeader } from "@/components/nav-header"
import { HotkeysProvider } from "@/components/keyboard/hotkeys-provider"
import { ShortcutsHint } from "@/components/keyboard"
import { Toaster } from "@/components/ui/sonner"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages, getTimeZone } from "next-intl/server"
import { ThemeProvider } from "next-themes"

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

  // Get locale, messages, and timezone from next-intl
  const locale = await getLocale()
  const messages = await getMessages()
  const timeZone = await getTimeZone()

  /*
    suppressHydrationWarning below is mandatory, not cosmetic. next-themes injects a synchronous
    inline script that writes to document.documentElement BEFORE hydration, and it writes TWO
    attributes the server never rendered: the class (from attribute="class") and
    style="color-scheme: …" (from enableColorScheme, which defaults to true and is not disabled
    here). Without the suppression React logs a mismatch on every load and in development may
    discard the server HTML.
  */
  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          {/*
            ThemeProvider renders [<ThemeScript/>, children], and neither NextIntlClientProvider nor
            HotkeysProvider emits any DOM of its own — so at exactly this position that inline
            <script> is the first DOM node inside <body>, the earliest point at which the theme class
            can be set. Nested any lower, NavHeader would paint in the wrong theme first.

            The four props are the whole configuration and are locked: the class attribute is what
            globals.css's @custom-variant dark keys off, "system" makes OS-following a real state
            (which is why the toggle in UserMenu is three-way rather than two-way), and
            disableTransitionOnChange suppresses the colour-transition sweep on every themed element
            when the class flips.

            next-themes' dist entry begins with its own client directive, so this imports directly
            into this async server component. No local wrapper module — that would only be a second
            place for these four props to drift.
          */}
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <HotkeysProvider>
              <NavHeader user={user} />
              <main className="min-h-[calc(100vh-3.5rem)]">
                {children}
              </main>
              <ShortcutsHint />
              {/* Toaster calls useTheme() and until now always read the default, because no
                  provider was mounted. It follows the theme from here with no edit of its own. */}
              <Toaster />
            </HotkeysProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
