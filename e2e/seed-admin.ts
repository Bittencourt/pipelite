/**
 * Idempotent seed for the dedicated Playwright admin.
 *
 * Invoked from `e2e/auth.setup.ts`, never as an npm script: Playwright transpiles
 * TypeScript itself, so running it there adds no `tsx` dependency — and `tsx` is
 * not installed in this repo, which makes the existing
 * `"db:seed-activities": "tsx drizzle/seed-activity-types.ts"` convention
 * currently unrunnable and unsafe to copy.
 */

import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import postgres from "postgres"
import { users } from "@/db/schema/users"
import { hashPassword } from "@/lib/password"

// A dedicated account, never a borrowed human one, on an RFC 2606 reserved TLD
// so the address is guaranteed non-routable. `.test` (rather than a bare `@local`)
// is required because the login form validates with `z.string().email()`, whose
// regex demands a dotted domain — a bare `@local` never reaches the server.
export const E2E_ADMIN_EMAIL = "pipelite-e2e@local.test"

const E2E_ADMIN_NAME = "Pipelite E2E Admin"

export async function seedE2eAdmin(): Promise<{
  email: string
  password: string
}> {
  const connectionString = process.env.E2E_DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "E2E_DATABASE_URL environment variable is not set. It must point at the " +
        "HOST-mapped dev Postgres (localhost:5433); the app-facing DATABASE_URL " +
        "resolves postgres:5432 inside the Docker network and is unreachable here."
    )
  }

  const password = process.env.E2E_ADMIN_PASSWORD
  if (!password) {
    throw new Error(
      "E2E_ADMIN_PASSWORD environment variable is not set. There is deliberately " +
        "no fallback: a literal default here would be a committed credential."
    )
  }

  // DEV-DATABASE GUARD. This seed writes a privileged, password-bearing user row,
  // so it must be impossible to point it at a shared or production database — the
  // account would be a standing backdoor there. A loopback host is the one place
  // where the operator provably owns the target.
  const hostname = new URL(connectionString).hostname
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `E2E_DATABASE_URL host "${hostname}" is not a local development database. ` +
        "The e2e admin seed refuses to run anywhere but localhost / 127.0.0.1."
    )
  }

  const client = postgres(connectionString)
  const db = drizzle(client)

  try {
    const passwordHash = await hashPassword(password)
    // role and status both DEFAULT to values that fail login and the /admin gate
    // ("member" / "pending_verification"), and an unverified email is refused by
    // authorize() before the password is even checked — so setting all three
    // explicitly is required, not belt-and-braces. deletedAt is cleared because a
    // soft-deleted row would also be refused.
    const fields = {
      passwordHash,
      name: E2E_ADMIN_NAME,
      role: "admin" as const,
      status: "approved" as const,
      emailVerified: new Date(),
      deletedAt: null,
      updatedAt: new Date(),
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, E2E_ADMIN_EMAIL))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(users).values({ email: E2E_ADMIN_EMAIL, ...fields })
      console.log(`✓ Created e2e admin: ${E2E_ADMIN_EMAIL}`)
    } else {
      await db
        .update(users)
        .set(fields)
        .where(eq(users.email, E2E_ADMIN_EMAIL))
      console.log(`→ e2e admin already exists, refreshed: ${E2E_ADMIN_EMAIL}`)
    }
  } finally {
    await client.end()
  }

  return { email: E2E_ADMIN_EMAIL, password }
}
