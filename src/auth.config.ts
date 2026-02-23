import type { NextAuthConfig } from "next-auth"

/**
 * Lightweight auth config used by middleware (Edge runtime).
 * Must NOT import argon2 or any native Node.js module.
 * Only contains JWT/session callbacks — no Credentials provider.
 */
export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      // In middleware with JWT strategy, role is at JWT top level, not session.user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isAdmin = (auth as any)?.role === "admin"

      const protectedPaths = ["/settings", "/admin"]
      const adminPaths = ["/admin"]

      const isProtectedPath = protectedPaths.some((path) =>
        nextUrl.pathname.startsWith(path)
      )
      const isAdminPath = adminPaths.some((path) =>
        nextUrl.pathname.startsWith(path)
      )

      if (isAdminPath && (!isLoggedIn || !isAdmin)) {
        return Response.redirect(new URL("/?error=unauthorized", nextUrl.origin))
      }

      if (isProtectedPath && !isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl.origin)
        loginUrl.searchParams.set("callbackUrl", nextUrl.pathname)
        return Response.redirect(loginUrl)
      }

      return true
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
} satisfies NextAuthConfig
