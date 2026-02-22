import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import { verifyPassword } from "@/lib/password"
import { users } from "@/db/schema/users"
import { eq } from "drizzle-orm"
import type { NextAuthConfig } from "next-auth"
import { authConfig } from "@/auth.config"

// Auth.js v5 requires CredentialsSignin subclasses for user-facing errors.
// Plain Error objects are masked as "Configuration" in production mode.
class PendingApprovalError extends CredentialsSignin {
  code = "pending_approval"
}
class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified"
}

/**
 * Auth.js v5 configuration for Pipelite.
 *
 * IMPORTANT: Auth.js Credentials provider always uses JWT internally,
 * even if strategy: "database" is set. To achieve mutable user state
 * (checking approval status on every request), the session callback
 * fetches fresh user data from the database on each session access.
 * This gives us the same security guarantees as database sessions.
 *
 * NOTE: This file must NOT be imported from middleware.ts — it uses
 * argon2 (native module) which cannot run in the Edge runtime.
 * Middleware uses auth.config.ts instead.
 */
export const config = {
  ...authConfig,
  // Cast needed: @auth/drizzle-adapter and next-auth bundle separate @auth/core copies
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: DrizzleAdapter(db) as any,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember me", type: "checkbox" },
      },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const { email, password, rememberMe } = credentials as {
          email: string
          password: string
          rememberMe?: string
        }

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        })

        if (!user || !user.passwordHash) {
          return null
        }

        // Check soft delete
        if (user.deletedAt) {
          return null
        }

        // CRITICAL: Check approval status BEFORE password verification
        if (user.status !== "approved") {
          throw new PendingApprovalError()
        }

        // Check email verified
        if (!user.emailVerified) {
          throw new EmailNotVerifiedError()
        }

        const valid = await verifyPassword(password, user.passwordHash)
        if (!valid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          // Pass rememberMe flag to jwt callback for session duration control
          rememberMe: rememberMe === "on",
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On sign in, persist user id, role, and rememberMe preference into the JWT
      if (user) {
        token.id = user.id as string
        token.role = (user as { role: string }).role

        // Set custom token expiry based on rememberMe preference
        // 30 days for "remember me", 7 days default
        const rememberMe = (user as { rememberMe?: boolean }).rememberMe
        if (rememberMe) {
          token.rememberMe = true
          token.exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
        }
      }
      return token
    },
    async session({ session, token }) {
      // Fetch fresh user data from DB to ensure mutable state is current.
      // This is critical for admin approval: if a user's status or role
      // changes, the session reflects it on the next request.
      if (token.id) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, token.id as string),
        })

        if (!dbUser || dbUser.deletedAt || dbUser.status !== "approved") {
          // User has been deleted, rejected, or is no longer approved.
          // Return session with empty user to trigger sign-out on client.
          session.user = {} as typeof session.user
          return session
        }

        session.user.id = dbUser.id
        session.user.role = dbUser.role
        session.user.email = dbUser.email
        session.user.name = dbUser.name
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(config)
