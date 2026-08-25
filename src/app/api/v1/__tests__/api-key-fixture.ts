/**
 * =============================================================================
 * api-key-fixture.ts — THE FIRST API-KEY FIXTURE IN THIS REPOSITORY
 * =============================================================================
 *
 * Before this file, nothing under `src/` or `e2e/` referenced `apiKeys` or `api_keys` outside the
 * production modules themselves (`src/lib/api-keys.ts`, `src/app/settings/api-keys/*`). Every
 * `/api/v1` test in this repository authenticated by MOCKING `@/lib/api/auth` — which is the exact
 * mechanism by which a test passes while the route it covers is broken. 48-RESEARCH reproduced that:
 * three ownership predicates were deleted from `organizations/[id]/route.ts` and 5,237 tests stayed
 * green.
 *
 * So this fixture mints a REAL key. A test holding one can drive a route handler through the real
 * `withApiAuth` — real Bearer parse, real `validateApiKey`, real `checkRateLimit`, real
 * `runWithActor` — and the identity that reaches `ctx.userId` is whatever `api_keys.user_id` says
 * rather than whatever the test told a mock to say.
 *
 * THE RECIPE IS TRANSCRIBED, NOT REMEMBERED. Every line below mirrors
 * `src/lib/api-keys.ts:21-48` (generation) so that `src/lib/api-keys.ts:56-95` (validation) accepts
 * it:
 *
 *   - the `pk_live_` prefix, because `validateApiKey` returns `null` before hashing anything that
 *     does not start with it (`api-keys.ts:59-61`);
 *   - `randomBytes(32).toString("base64url")` for the secret half;
 *   - `createHash("sha256").update(fullKey).digest("hex")` stored in `key_hash`, because validation
 *     looks the key up BY THAT DIGEST (`api-keys.ts:63-67`);
 *   - `fullKey.slice(0, 12)` in `key_prefix`, which is display-only and is never consulted by
 *     validation.
 *
 * WHY THE PLAINTEXT IS RETURNED. It is not recoverable from the row — only its digest is stored,
 * which is the point of the storage model. A fixture that returned only the row would be unable to
 * build an `Authorization: Bearer` header, and a test written against it would have to reach for a
 * mock. Returning it here keeps the key in memory for the life of one test process: it is generated
 * per run by `randomBytes`, never written to disk, and its row is deleted by the caller's teardown.
 *
 * WHY THE CALLER SUPPLIES THE ID. `api_keys.id` is `text` with a `$defaultFn`, but a fixture that
 * let the default fire would produce an unprefixed UUID that a prefix-scoped teardown cannot find.
 * Every fixture in this repository cleans up by id prefix, so the id is an argument, not a default.
 *
 * `deleted_at` is left NULL deliberately: a non-null value makes `validateApiKey` return `null`
 * (`api-keys.ts:69-71`), which would authenticate nothing.
 *
 * REUSE: Phase 50's export-authorization work needs the same two-identity setup against
 * `/api/v1` — `mintApiKey` is exported for it rather than being local to one test file.
 * =============================================================================
 */
import { createHash, randomBytes } from "node:crypto"

import { db } from "@/db"
import { apiKeys } from "@/db/schema"

/** Identifiable prefix for Pipelite keys — the literal `validateApiKey` requires. */
const KEY_PREFIX = "pk_live_"

export interface MintApiKeyInput {
  /** Supplied, never defaulted, so a prefix-scoped teardown can find the row. */
  id: string
  /** `api_keys.user_id`; this is the value that becomes `ctx.userId` inside a route handler. */
  userId: string
  name: string
}

export interface MintedApiKey {
  /** The `api_keys.id` of the row that was written. */
  id: string
  /** `api_keys.user_id`, echoed so a test can assert the identity it expects to authenticate as. */
  userId: string
  /**
   * The full plaintext key. Only ever available here — the row stores its sha256 digest, so this
   * value cannot be recovered afterwards.
   */
  plaintextKey: string
  /** Ready to hand to `new NextRequest(..., { headers: { Authorization: ... } })`. */
  authorizationHeader: string
}

/**
 * Create one working API key for a user, in the database the caller is connected to.
 *
 * The caller is responsible for the `users` row (the `user_id` foreign key cascades from it) and for
 * deleting this row afterwards.
 */
export async function mintApiKey({ id, userId, name }: MintApiKeyInput): Promise<MintedApiKey> {
  const plaintextKey = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`
  const keyHash = createHash("sha256").update(plaintextKey).digest("hex")

  await db.insert(apiKeys).values({
    id,
    userId,
    name,
    // Display-only, and deliberately derived exactly as `generateApiKey` derives it.
    keyPrefix: plaintextKey.slice(0, 12),
    keyHash,
  })

  return {
    id,
    userId,
    plaintextKey,
    authorizationHeader: `Bearer ${plaintextKey}`,
  }
}
