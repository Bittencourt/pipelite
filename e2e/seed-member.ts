/**
 * Idempotent seed for the dedicated Playwright MEMBER.
 *
 * `e2e/seed-admin.ts`'s twin. Invoked from `e2e/member.setup.ts`, never as an npm
 * script: Playwright transpiles TypeScript itself, so running it there adds no
 * `tsx` dependency — and `tsx` is not installed in this repo.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT DECLINES WHAT THE SPEC ASKED FOR.
 *
 * 40-UI-SPEC V-40-8 asks for "a second authenticated context as the live member
 * account". That is declined here, deliberately and on the record:
 *
 *   1. We do not have that human's password, so the request is unexecutable as
 *      written — the only way to obtain the session would be to overwrite a real
 *      person's credential, which is a destructive edit to production-grade data
 *      in a database holding 46,054 real organizations.
 *   2. Borrowing a human account violates the fixtures rule this harness has
 *      followed since 45-08 (`e2e/deals-drag.spec.ts`, `merge-screen-320.spec.ts`):
 *      a spec creates what it needs, prefixes it distinctively, and leaves nothing
 *      behind. A human's user row can be none of those things.
 *
 * A dedicated seeded member proves EXACTLY the property V-40-8 needs — a session
 * that is authenticated and is not an admin — and, unlike a borrowed account, it
 * can be reasoned about: its role is set by this file, three lines below, rather
 * than inferred from whatever the deployment happens to hold today.
 * ---------------------------------------------------------------------------
 *
 * WHAT THIS ACCOUNT IS FOR: the departing half of Decision 3. This phase departs
 * from the app's `owner || role === "admin"` idiom in the ADMIN direction — a
 * private view is invisible to admins too — so the proof needs one session that
 * is an admin and one that is provably not. `member.setup.ts` is where "provably"
 * gets discharged, by asserting this account is REFUSED at an admin-only route.
 */

import { drizzle } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import postgres from "postgres"

// Relative, not `@/…`: playwright.config.ts declares no alias table of its own,
// and every spec written since 45-08 imports this way.
import { users } from "../src/db/schema/users"
import { hashPassword } from "../src/lib/password"

// A dedicated account, never a borrowed human one, on an RFC 2606 reserved TLD so
// the address is guaranteed non-routable. `.test` (rather than a bare `@local`) is
// required because the login form validates with `z.string().email()`, whose regex
// demands a dotted domain — a bare `@local` never reaches the server.
export const E2E_MEMBER_EMAIL = "pipelite-e2e-member@local.test"

const E2E_MEMBER_NAME = "Pipelite E2E Member"

export async function seedE2eMember(): Promise<{
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

  // NO FALLBACK, and specifically no reuse of E2E_ADMIN_PASSWORD. A literal
  // default here would be a committed credential; sharing the admin's secret
  // would make the two accounts indistinguishable the moment either one leaks,
  // and would quietly turn "the member session" into a second admin session if
  // the emails were ever transposed.
  const password = process.env.E2E_MEMBER_PASSWORD
  if (!password) {
    throw new Error(
      "E2E_MEMBER_PASSWORD environment variable is not set. There is deliberately " +
        "no fallback and no reuse of E2E_ADMIN_PASSWORD: falling back to the admin " +
        "secret would silently authenticate an ADMIN where a member is required, " +
        "and every private-visibility assertion downstream would pass vacuously."
    )
  }

  // DEV-DATABASE GUARD, verbatim from `e2e/seed-admin.ts`. This seed writes a
  // standing, password-bearing user row, so it must be impossible to point it at a
  // shared or production database — the account would be a backdoor there. A
  // loopback host is the one place where the operator provably owns the target.
  const hostname = new URL(connectionString).hostname
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `E2E_DATABASE_URL host "${hostname}" is not a local development database. ` +
        "The e2e member seed refuses to run anywhere but localhost / 127.0.0.1."
    )
  }

  const client = postgres(connectionString)
  const db = drizzle(client)

  try {
    const passwordHash = await hashPassword(password)
    // `status` and `emailVerified` both default to values that fail login
    // ("pending_verification" / null, and authorize() refuses an unverified email
    // before it even checks the password), so setting them explicitly is required
    // rather than belt-and-braces. `deletedAt` is cleared because a soft-deleted
    // row is refused too.
    //
    // `role: "member"` is written explicitly even though it IS the column default.
    // That is the whole point of this file: the role must be an assertion made
    // here, not a default inherited from a schema someone may later change.
    const fields = {
      passwordHash,
      name: E2E_MEMBER_NAME,
      role: "member" as const,
      status: "approved" as const,
      emailVerified: new Date(),
      deletedAt: null,
      updatedAt: new Date(),
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, E2E_MEMBER_EMAIL))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(users).values({ email: E2E_MEMBER_EMAIL, ...fields })
      console.log(`✓ Created e2e member: ${E2E_MEMBER_EMAIL}`)
    } else {
      await db
        .update(users)
        .set(fields)
        .where(eq(users.email, E2E_MEMBER_EMAIL))
      console.log(`→ e2e member already exists, refreshed: ${E2E_MEMBER_EMAIL}`)
    }
  } finally {
    await client.end()
  }

  return { email: E2E_MEMBER_EMAIL, password }
}
