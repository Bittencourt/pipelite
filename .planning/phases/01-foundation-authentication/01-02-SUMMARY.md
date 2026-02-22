---
phase: 01-foundation-authentication
plan: 02
subsystem: auth
tags: [auth.js, next-auth, credentials, argon2, nodemailer, smtp, api-keys, redis, middleware, jwt]

requires:
  - phase: 01-01
    provides: "Next.js project, Drizzle ORM schema (users, sessions, accounts, apiKeys, verificationTokens, domainWhitelist, rejectedSignups), db client"
provides:
  - "Auth.js v5 configuration with Credentials provider and JWT strategy"
  - "Session callback fetches fresh user data from DB (mutable state support)"
  - "Password hashing/verification with argon2id"
  - "SMTP email client with three templates (verify-email, approved, password-reset)"
  - "API key generation (SHA-256 hash storage), validation, regeneration, masking"
  - "Redis client with cache helpers (optional, graceful degradation)"
  - "Middleware protecting /settings and /admin routes with role-based access"
affects: [01-03, 01-04, 01-05, 01-06, all-future-phases]

tech-stack:
  added: []
  patterns: [jwt-with-db-refresh, fire-and-forget-updates, singleton-transport, adapter-type-cast]

key-files:
  created:
    - src/auth.ts
    - src/app/api/auth/[...nextauth]/route.ts
    - src/middleware.ts
    - src/types/next-auth.d.ts
    - src/lib/password.ts
    - src/lib/email/client.ts
    - src/lib/email/send.ts
    - src/lib/email/templates/verify-email.ts
    - src/lib/email/templates/approved.ts
    - src/lib/email/templates/password-reset.ts
    - src/lib/email/templates/index.ts
    - src/lib/api-keys.ts
    - src/lib/redis.ts
  modified: []

key-decisions:
  - "JWT strategy instead of database sessions -- Credentials provider in Auth.js v5 always uses JWT internally regardless of strategy setting; session callback fetches fresh DB user data on each request for equivalent security"
  - "Adapter type cast to resolve @auth/core version mismatch between @auth/drizzle-adapter and next-auth bundled copies"
  - "Fire-and-forget lastUsedAt update in validateApiKey to avoid blocking validation on a non-critical write"

patterns-established:
  - "Session callback always fetches fresh user from DB for mutable state (approval, role changes)"
  - "API keys: hash-only storage with one-time full-key display on creation"
  - "Email templates return { subject, html, text } objects consumed by send helpers"
  - "Redis is optional with graceful degradation via null-check pattern"

duration: 5min
completed: 2026-02-22
---

# Phase 1 Plan 2: Auth.js Config & Core Utilities Summary

**Auth.js v5 with JWT + DB-refresh session pattern, argon2 password hashing, SMTP email client with 3 templates, API key utilities with SHA-256 hash storage, and route-protecting middleware**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-22T17:02:46Z
- **Completed:** 2026-02-22T17:08:42Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- Auth.js v5 configured with Credentials provider, JWT strategy, and session callback that fetches fresh user data from DB on every request (achieving mutable-state security equivalent to database sessions)
- Authorization checks enforce: email verified, status approved, not soft-deleted before allowing login
- Middleware protects /settings (auth required) and /admin (admin role required) routes
- Password hashing with argon2id (19 MiB memory cost, time cost 2, parallelism 1)
- SMTP email client with 3 HTML+text templates (verify-email, account-approved, password-reset)
- API key utilities: generate (SHA-256 hash storage, one-time display), validate (hash comparison, fire-and-forget lastUsedAt), regenerate (soft-delete + new key), mask
- Redis client with cache helpers, optional with graceful degradation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Auth.js v5 configuration** - `26d0279` (feat)
2. **Task 2: Create password hashing and email utilities** - `1654623` (feat)
3. **Task 3: Create API key utilities and Redis client** - `234fdaf` (feat)

## Files Created/Modified
- `src/auth.ts` - Auth.js v5 config: Credentials provider, JWT session, DB-refresh session callback
- `src/app/api/auth/[...nextauth]/route.ts` - Auth.js route handler (GET, POST)
- `src/middleware.ts` - Route protection: /settings (auth), /admin (admin role)
- `src/types/next-auth.d.ts` - TypeScript extensions for Session, User, JWT with role field
- `src/lib/password.ts` - argon2id password hashing and verification
- `src/lib/email/client.ts` - Singleton nodemailer SMTP transport with env config
- `src/lib/email/send.ts` - Email send helpers: sendVerificationEmail, sendApprovalEmail, sendPasswordResetEmail
- `src/lib/email/templates/verify-email.ts` - Email verification template (HTML + text)
- `src/lib/email/templates/approved.ts` - Account approved notification template
- `src/lib/email/templates/password-reset.ts` - Password reset template
- `src/lib/email/templates/index.ts` - Barrel export for all templates
- `src/lib/api-keys.ts` - API key generation, validation, regeneration, masking
- `src/lib/redis.ts` - Optional Redis client with cacheGet/cacheInvalidate helpers

## Decisions Made
- **JWT strategy instead of database sessions:** Auth.js v5 Credentials provider always creates JWT sessions internally, ignoring `strategy: "database"`. To achieve the plan's goal of mutable user state (admin can change approval status and it takes effect immediately), the session callback fetches fresh user data from PostgreSQL on every session access. This provides equivalent security guarantees.
- **Adapter type cast:** `@auth/drizzle-adapter` and `next-auth` bundle separate copies of `@auth/core` (0.41.1 vs 0.41.0). Our `User` type extension with `role` creates an incompatibility between the two type worlds. A targeted `as any` cast on the adapter resolves this without losing type safety on the rest of the config (enforced via `satisfies NextAuthConfig`).
- **Fire-and-forget lastUsedAt:** API key validation updates `lastUsedAt` without awaiting the result. This avoids blocking the validation response on a non-critical write while still tracking usage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Changed session strategy from "database" to "jwt" with DB-refresh pattern**
- **Found during:** Task 1 (Auth.js configuration)
- **Issue:** Plan specified `strategy: "database"`, but Auth.js v5 Credentials provider always creates JWT sessions internally (verified by reading @auth/core source code). Setting "database" would silently fail to create DB sessions.
- **Fix:** Used `strategy: "jwt"` explicitly, added session callback that fetches fresh user data from DB on every request. This achieves the same security goal (mutable user state) that "database" sessions were intended to provide.
- **Files modified:** src/auth.ts
- **Verification:** `npx tsc --noEmit` passes, session callback correctly queries users table
- **Committed in:** 26d0279 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed @auth/core adapter type mismatch**
- **Found during:** Task 1 (Auth.js configuration)
- **Issue:** `@auth/drizzle-adapter` and `next-auth` bundle different versions of `@auth/core` (0.41.1 vs 0.41.0). Our `User` type extension with `role` only applies to next-auth's copy, causing `AdapterUser` incompatibility.
- **Fix:** Cast `DrizzleAdapter(db)` result with `as any`, retained config-level type safety via `satisfies NextAuthConfig`
- **Files modified:** src/auth.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 26d0279 (Task 1 commit)

**3. [Rule 1 - Bug] Removed invalid ioredis option `retryDelayOnFailover`**
- **Found during:** Task 3 (Redis client)
- **Issue:** Plan specified `retryDelayOnFailover: 100` which is not a valid ioredis `RedisOptions` property, causing TypeScript error
- **Fix:** Removed the invalid option, kept `maxRetriesPerRequest` and `lazyConnect`
- **Files modified:** src/lib/redis.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 234fdaf (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes necessary for correctness and type safety. The JWT-with-DB-refresh pattern achieves the plan's security goals through a different mechanism. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - all configuration was handled in Plan 01-01 (.env.example with SMTP_*, AUTH_SECRET, DATABASE_URL).

## Next Phase Readiness
- Auth infrastructure complete: Auth.js configured, password hashing ready, email sending ready, API key management ready
- Ready for signup flow (Plan 01-03): uses hashPassword, sendVerificationEmail, users schema
- Ready for login/logout pages (Plan 01-04): uses signIn, signOut, auth from src/auth.ts
- Ready for admin approval (Plan 01-05): uses sendApprovalEmail, session includes role
- Ready for API key management (Plan 01-06): uses generateApiKey, validateApiKey, regenerateApiKey
- No blockers identified

## Self-Check: PASSED

All 13 files verified present. All 3 task commits verified in git history.

---
*Phase: 01-foundation-authentication*
*Completed: 2026-02-22*
