---
phase: 42-observability
plan: 11
subsystem: observability
tags: [logging, structured-logs, api-routes, redaction, OBS-01]
requires:
  - "src/lib/log.ts (42-01)"
provides:
  - "21 structured log call sites across the eleven non-v1 API route files and four lib/api modules"
  - "the phase's only expression-position migration that a naive substitution gets wrong"
  - "a measured correction to 42-PATTERNS §5(e): the wrong form does NOT compile"
affects:
  - "src/lib/api/notes-collection.ts, rate-limit.ts, webhooks/deliver.ts — shared helpers a v1 route may call (see § Shared lib/api surface)"
tech-stack:
  added: []
  patterns:
    - "log.<level>(scope, msg, ctx?) with the error always under ctx.err"
    - "bracket prefix wins as scope; otherwise path-derived"
    - "arrow-wrapped log.error inside .catch, never a bare method reference"
key-files:
  created: []
  modified:
    - src/app/api/signup/route.ts
    - src/app/api/verify-email/route.ts
    - src/app/api/forgot-password/route.ts
    - src/app/api/reset-password/route.ts
    - src/app/api/search/route.ts
    - src/app/api/upload/route.ts
    - src/app/api/custom-fields/save/route.ts
    - src/app/api/api-keys/route.ts
    - src/app/api/api-keys/[id]/route.ts
    - src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts
    - src/app/api/internal/email/process/route.ts
    - src/lib/api/notes-collection.ts
    - src/lib/api/rate-limit.ts
    - src/lib/api/webhooks/deliver.ts
    - src/lib/api-keys.ts
decisions:
  - "result.error in notes-collection lands under `reason`, not `err`, because it is a string and `err` means a serialised Error everywhere else in the phase"
  - "routeLabel becomes a `route` ctx field and the message becomes the fixed \"GET failed\" / \"POST failed\""
  - "rate-limit.ts:27 gains NO ctx at all — the original string interpolated nothing, so nothing was added"
  - "the two files-route sites are WRAPPED across lines to stay inside that file's 81-char convention, which makes them invisible to the same-line grep gate"
metrics:
  duration: ~35 min
  completed: 2026-08-23
  tasks: 2
  commits: 2
  sites_migrated: 21
---

# Phase 42 Plan 11: Non-v1 API Routes, `lib/api`, and the Bare-Reference Catch Summary

All 21 `console.*` sites across the eleven non-v1 API route files and the four `src/lib/api` modules
now emit structured JSON, with the four pre-login auth flows and the two API-key routes carrying `err`
and nothing else — and with `src/lib/api-keys.ts:77`'s bare `.catch(console.error)` converted to an
arrow whose necessity turned out to rest on a type-system guarantee the plan believed did not exist.

## Base correction

The worktree was stale — **22 for 22 now**. HEAD was `286c470`; fast-forwarded to the expected base
`66f17f7`. Confirmed by the presence of `src/lib/log.ts` and `src/lib/api/`. Both bootstrap symlink sets
created; `git status` clean afterwards.

## What was migrated — the 21 sites

| File | Scope | Sites | Levels |
|---|---|---|---|
| `src/app/api/signup/route.ts` | `api/signup` | 1 | error |
| `src/app/api/verify-email/route.ts` | `api/verify-email` | 1 | error |
| `src/app/api/forgot-password/route.ts` | `api/forgot-password` | 1 | error |
| `src/app/api/reset-password/route.ts` | `api/reset-password` | 1 | error |
| `src/app/api/search/route.ts` | `api/search` | 1 | error |
| `src/app/api/upload/route.ts` | `api/upload` | 1 | error |
| `src/app/api/custom-fields/save/route.ts` | `api/custom-fields/save` | 1 | error |
| `src/app/api/api-keys/route.ts` | `api/api-keys` | 1 | error |
| `src/app/api/api-keys/[id]/route.ts` | `api/api-keys/[id]` | 1 | error |
| `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` | `api/files/[entityId]/[fieldName]/[filename]` | 2 | error |
| `src/app/api/internal/email/process/route.ts` | `email-process` (bracket, kept verbatim) | 3 | error |
| `src/lib/api/notes-collection.ts` | `lib/api/notes-collection` | 3 | error |
| `src/lib/api/rate-limit.ts` | `lib/api/rate-limit` | 2 | **1 warn** + 1 error |
| `src/lib/api/webhooks/deliver.ts` | `lib/api/webhooks/deliver` | 1 | error |
| `src/lib/api-keys.ts` | `api-keys` | 1 | error |
| **total** | | **21** | 20 error, 1 warn |

Single-quote files (`upload`, `files/...`, `custom-fields/save`) kept single quotes. No status code, no
response body, no redirect, no `.catch` attachment and no catch structure changed anywhere.

---

## "The bare-reference catch" — what it actually was, and the plan premise it falsified

The ROADMAP line names this plan "non-v1 API routes + `lib/api` + **the bare-reference catch**". The
bare-reference catch is `src/lib/api-keys.ts:77`, and it has **two distinct faces**. Both are worth
carrying forward.

### Face 1 — the site itself. Before, verbatim:

```typescript
  // Update last used timestamp (fire-and-forget, don't block validation)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .execute()
    .catch(console.error)
```

After, verbatim (comment abridged here; it is 11 lines in the file):

```typescript
  // Update last used timestamp (fire-and-forget, don't block validation)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .execute()
    // An ARROW, never a bare `log.error` reference. […]
    .catch((err) => log.error("api-keys", "lastUsedAt update failed", { err }))
```

`.catch` survives as a `.catch` (T-42-33): it guards a fire-and-forget `lastUsedAt` update on the
API-key validation path, so removing it would turn a dropped update into an unhandled rejection on
every authenticated `/api/v1` request.

### Face 2 — **the plan's central justification for this plan is FALSE, measured**

Both the plan (`<objective>`, and Task 2's `<action>`) and `42-PATTERNS.md` §5 shape (e) assert that
`.catch(log.error)` "compiles and is silently wrong" and that "TypeScript will not stop you". This plan
is described as *"the only one where a naive substitution compiles and is silently wrong"*.

**It does not compile.** I wrote the wrong form deliberately and ran `npx tsc --noEmit`:

```
src/lib/api-keys.ts (1 errors)
  L82: TS2345 Argument of type '(scope: string, msg: string, ctx?: Record<string, unknown>) => void'
       is not assignable to parameter...
    Target signature provides too few arguments. Expected 2 or more, but got 1.
```

Then reverted to the arrow. The arrow is still the right answer — but the reason is not "review caught
it", it is that **`log.error` declares BOTH `scope` and `msg` as required**, so a 3-parameter function
is not assignable to `.catch`'s 1-argument callback. That protection is a property of `src/lib/log.ts`,
not of the call site.

**Forward-looking consequence, now recorded in a comment at the call site:** if anyone ever makes `msg`
optional in `src/lib/log.ts`, this class of mistake starts compiling silently — here and at the other
two expression-position sites in the phase (`subscribers/audit.ts:87`, `stage-history.ts:30`, already
migrated by 42-07). **42-18 should consider pinning "both `scope` and `msg` are required" as a test**,
because that signature is now load-bearing for three sites and nothing asserts it.

### Face 3 — the census cannot see it

The verification section's counting command is
`grep -rnE '(^|[^a-zA-Z0-9_.])console\.(log|error|warn|info|debug)\(' …`. It requires an opening paren
**after** the method name. `.catch(console.error)` has none, so that regex **never counted this site**.
The acceptance criterion "the repo-wide non-test `console.*` count has dropped by exactly 21" is
therefore unsatisfiable with that ruler: it drops by 20. See § Census below — both rulers are reported.

---

## Redaction, per route — T-42-31, T-42-32, T-42-04

Every one of the four pre-login auth catches and both API-key catches was `console.error("<label> error:", error)`
— a fixed label and the caught error, nothing more. **All six migrated to a fixed message plus a single
`ctx` key, `err`.** Verbatim, all six:

```typescript
src/app/api/signup/route.ts:121:    log.error("api/signup", "Signup error", { err: error })
src/app/api/verify-email/route.ts:74:    log.error("api/verify-email", "Email verification error", { err: error })
src/app/api/forgot-password/route.ts:50:    log.error("api/forgot-password", "Forgot password error", { err: error })
src/app/api/reset-password/route.ts:89:    log.error("api/reset-password", "Reset password error", { err: error })
src/app/api/api-keys/route.ts:101:    log.error("api/api-keys", "Create API key error", { err: error })
src/app/api/api-keys/[id]/route.ts:59:    log.error("api/api-keys/[id]", "Regenerate API key error", { err: error })
```

**Per-route confirmation — what secret-bearing values were in scope, and that none entered a ctx:**

| Route | In scope at the catch | Entered a log line? |
|---|---|---|
| `api/signup` | `body.password` (plaintext, from the request), `body.email`, `normalizedEmail`, `rawToken` (the emailed verification token), `tokenHash`, `inviteToken` | **No.** ctx is `{ err: error }`. |
| `api/verify-email` | `token` (the raw verification token from the query string), `tokenHash`, the matched user row | **No.** ctx is `{ err: error }`. |
| `api/forgot-password` | `body.email`, `normalizedEmail`, `rawToken` (the emailed **reset** token), `tokenHash` | **No.** ctx is `{ err: error }`. |
| `api/reset-password` | `body.token` (the raw reset token), `body.password` (the new plaintext password), `tokenHash`, the hashed password | **No.** ctx is `{ err: error }`. |
| `api/api-keys` (create) | `fullKey` — **the freshly minted API key, visible exactly once** — plus `keyPrefix`, `session.user.id` | **No.** ctx is `{ err: error }`. |
| `api/api-keys/[id]` (regenerate) | `result.fullKey` — the freshly minted replacement key — plus `keyPrefix`, `existingKey` | **No.** ctx is `{ err: error }`. |
| `api/upload` | `file` (name, type, bytes), `entityId`, `fieldName`, `storedName`, `filePath`, and `process.env.S3_ACCESS_KEY` / `S3_SECRET_KEY` reachable via `getS3Client()` | **No.** ctx is `{ err: error }`. Note the response body already returns `error.message` and, in dev, `String(error)` — unchanged, out of scope. |
| `api/files/...` (2 sites) | client-controlled `entityId`, `fieldName`, `filename`, the resolved `filePath` | **No.** ctx is `{ err: error }` at both. Adversarial filenames cannot forge a second log line: `JSON.stringify` escapes newlines (T-42-05), and the filename is not in the line at all. |
| `api/search` | `q`, the raw user query, and the matched rows | **No.** ctx is `{ err: error }`. |
| `api/custom-fields/save` | `values` (the parsed request body of custom-field values), `entityId`, `session.user.id` | **No.** ctx is `{ err: error }`. |
| `email-process` (3 sites) | `user.email`, queued activity/digest rows, and `process.env.INTERNAL_SECRET` compared earlier in the handler | **No.** ctx is `{ err: error }` at all three. |
| `lib/api/rate-limit` warn | `keyId` (the API key identifier) | **No ctx at all** — see below. |
| `lib/api/webhooks/deliver` | the webhook URL, the full `payload` (which contains entity `data`), `userId` | **No.** ctx is `{ err: error }` only (T-42-04). |
| `lib/api/notes-collection` | note `content` (up to 200 000 chars), the whole `result` object, `context.userId` | **No.** `{ route, err }` / `{ route, reason }`; the whole `result` is never logged (T-42-04). |

**On the plan's grep gate for this, which is defective.** The criterion is:

```bash
grep -A2 'log\.error(' <the six files> | grep -c 'email\|token\|password\|apiKey\|secret'   # expected 0
```

It returns **9**, and all nine are false positives: `grep` prefixes each output line with the file
path, and three of those paths literally contain `verify-email`, `forgot-password` and
`reset-password`. Nine = 3 files × (1 log line + 2 trailing context lines). **Not one match is a `ctx`
key.** The real property was verified instead by reading all six lines (quoted verbatim above) and by
`grep -hoE '\{ err: error \}'` across the six files → **6**, i.e. every one of the six carries exactly
that ctx and no other.

## `ctx` key collision check (wave 1's flat-key warning)

Every key added across the whole plan diff, extracted from
`git diff 66f17f7 -- src/ | grep '^+' | grep -oE '[a-zA-Z][a-zA-Z0-9]*:'`:

| Key | Occurrences |
|---|---|
| `err` | 18 |
| `route` | 3 |
| `reason` | 1 |

Reconciles exactly against 21 sites: 18 sites carry `err` (14 route sites + `rate-limit:55` +
`deliver:39` + `api-keys.ts:77` + 2 of the 3 notes-collection sites), 3 also carry `route`, 1 carries
`route` + `reason`, and **1 site carries no ctx at all** (the rate-limit warn). 18 + 2 + 1 = 21.

**None of `level`, `scope`, `msg`, `ts` appears anywhere in the diff.** (The remaining `word:` hits in
that extraction — `signature:`, `logged:`, `ctx:`, `above:` — are prose inside comments I wrote, not
object keys.)

---

## The three sites the plan singled out

**`src/lib/api/rate-limit.ts:27` — the warn. The plan's premise was wrong here too, in a harmless
direction.** Task 2 says *"Read what it interpolates and move each value into a named `ctx` key."*
It interpolates **nothing** — the string is a fixed sentence with no template literal:

```typescript
// before
    console.warn(
      "Rate limiting skipped: Redis not configured. All requests allowed."
    )
// after
    log.warn(
      "lib/api/rate-limit",
      "Rate limiting skipped: Redis not configured. All requests allowed."
    )
```

So the correct migration adds **no ctx at all**. `keyId` is in scope and the plan explicitly allows a
rate-limit warning to carry an identifier — but the original string did not carry it, so it was not
added. `grep -c 'log\.warn(' src/lib/api/rate-limit.ts` → **1**; `grep -c 'log\.error('` → **1**. The
warn stayed a warn (T-42-34).

**`src/lib/api/notes-collection.ts` lines 111 / 165 / 171.** `routeLabel` (e.g.
`"/api/v1/deals/[id]/notes"`) moved out of the message into a `route` ctx key; the message became the
fixed `"GET failed"` / `"POST failed"`. The middle site logs `result.error`, which is the mutation
layer's error **string**, not a caught `Error` — it lands under **`reason`**, not `err`, exercising the
option the plan offers for non-`Error` values. Rationale (also in a comment at the site): `err` means
"a serialised `Error`" at the other 18 sites, and mixing a bare string into that key makes it
unqueryable. The whole `result` is never logged — it can carry note content.

**`src/lib/api-keys.ts:77`.** See § The bare-reference catch above.

---

## Shared `lib/api/` surface — read this, 42-10

Sibling 42-10 owns `src/app/api/v1/**` and was told to report rather than edit anything under
`src/lib/api/`. **No exported signature, return shape or control flow in `src/lib/api/` changed**, so
nothing 42-10 calls can break at merge time. Specifically:

- **`checkRateLimit(keyId)`** — same signature, same `RateLimitResult`, still fail-open on both the
  no-Redis and the Redis-error paths. Only the log call changed.
- **`triggerWebhook(...)`** — same 6-parameter signature, still `void`, still fire-and-forget, `.catch`
  still attached. Only the log call changed.
- **`noteCollectionHandlers(options)`** — same `{ GET, POST }` return, same status codes, same
  `Problems.*` responses. **One interface doc comment changed** (`NoteCollectionOptions.routeLabel`,
  which said "Prefix for server-side error logs" and is now a `route` ctx field). **The `routeLabel`
  property itself is unchanged** — same name, same type, still required — so the four v1 route files
  that pass it need no edit. If 42-10 touched those four call sites for an unrelated reason, the only
  possible conflict is a doc-comment adjacency, not a behavioural one.
- **`validateApiKey`** in `src/lib/api-keys.ts` — same return shape (`{ userId, keyId } | null`), and
  the `lastUsedAt` update is still fire-and-forget and still non-blocking.

**One behavioural note worth flagging even though it is not a signature change:** three of these
modules sit on the `/api/v1` hot path (rate-limit on every authenticated request, `api-keys.ts` on
every key validation), so their log lines are now JSON on that path. Any 42-10 test that asserted on
the *old* plaintext strings from these shared modules would redden — none does today (see below).

## Test fallout

**Zero.** No test file was edited by this plan.

- The only suite that spies on console for one of these modules is
  `src/lib/api/__tests__/notes-collection.test.ts:157`, and it is a **silencing** spy
  (`vi.spyOn(console, "error").mockImplementation(() => {})`) with no argument assertion. It keeps
  working unchanged because `log.ts` deliberately delegates to `console.error`.
- Per the prompt's warning, I did **not** assume the plan's "owns no test file" premise. I grepped:
  `grep -rln '<my 15 modules>' src --include=*.test.ts` returns four files
  (`src/app/__tests__/record-dialog-note-failure.test.ts`, `src/lib/events/subscribers/webhook.test.ts`,
  `src/lib/api/auth.test.ts`, `src/lib/execution/failure-alert.test.ts`); of those, only
  `notes-collection.test.ts` (found separately, by path) spies on console, and only to silence it. All
  pass unchanged.
- No test under another plan's ownership reddened. `src/app/api/v1/**/__tests__` (plan 10) and
  `src/lib/mutations/*.test.ts` (plans 08/09) were not touched and are green.

## Census — both rulers, and why they disagree by one

**ESLint (the authoritative ruler, per the prompt: "grep reads higher than eslint; only deltas agree"):**

```bash
npx eslint src --ext .ts,.tsx --rule '{"no-console":"error"}' --format json
# then exclude *.test.* and /__tests__/
```

| | non-test `no-console` sites | files |
|---|---|---|
| before (base `66f17f7`) | **191** | 82 |
| after | **170** | 67 |
| delta | **−21** ✅ | −15 |

191 matches the prompt's stated merged-master figure exactly. All **fifteen** of my files went to zero
(verified by name, not just by count) and dropped out of the file set — 82 − 15 = 67.

**The call-shaped grep from the plan's verification section:**

| | count |
|---|---|
| before | 193 |
| after | 173 |
| delta | **−20**, not −21 |

The two-site gap between the rulers before the change (193 vs 191) and the one-site gap in the delta
are separate facts. The **delta** gap is entirely `src/lib/api-keys.ts:77`: `.catch(console.error)` has
no `(` after the method name, so the call-shaped regex never counted it. ESLint's `no-console` does
count bare references, which is why only the ESLint delta reconciles to 21. **The plan's criterion
"dropped by exactly 21" is unsatisfiable with the grep it specifies** — reported here rather than
massaged.

## Verification results

| Gate | Result |
|---|---|
| `npm test` | **4524 passed / 32 skipped**, 0 failed (162 files passed, 2 skipped) — matches the stated baseline exactly |
| RSC project | **8 passed / 8**, 0 failed |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **0 errors** / 122 warnings (worktree figure; main checkout reads 124 for reasons unrelated to this phase — no warning was added or removed by this plan) |
| `npx vitest run src/lib/api src/app/api` | 169 passed / 0 failed |
| `console.` in the eleven route files | 0 (grep exits 1) |
| `console.` in `src/lib/api/` + `src/lib/api-keys.ts`, non-test | 0 (grep exits 1) |
| `grep -c '\.catch(log\.error)' src/lib/api-keys.ts` | **0** |
| `grep -c '\.catch((err) => log\.error("api-keys"' src/lib/api-keys.ts` | **1** |
| `grep -c 'log\.warn(' src/lib/api/rate-limit.ts` | **1** (the warn stayed a warn) |
| `grep -oE 'log\.[a-z]+\("[a-z0-9/-]+"' .../email/process/route.ts \| sort -u` | exactly `email-process` ×3 |
| `git diff --stat src/app/api/upload/route.ts` | `2 insertions(+), 1 deletion(-)` — the import line and line 116 only |
| files changed vs base | exactly the 15 declared files; **nothing under `src/app/api/v1/`** |

## Scope-inventory verification, and where the same-line grep gate is blind

Per the prompt's `<known_defect_in_the_acceptance_criteria>`, I did not rely on the same-line
`grep -oE 'log\.[a-z]+\("[a-z/-]+"'` gate. Reading the full diff, **two of my 21 sites are wrapped
across lines and are invisible to it**, by my own deliberate choice:

```typescript
    log.error(
      'api/files/[entityId]/[fieldName]/[filename]',
      'Download error',
      { err: error }
    )
```

and the identical shape for `'Delete error'`, both in
`src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts`. The single-line form would be 94
characters in a file whose longest existing line is 81, so it was wrapped to match the file's
convention (the same trade-off 42-08 recorded). A third site, `notes-collection.ts:165`, is also
wrapped (the `{ route, reason }` object spans three lines). **Scopes for all three were verified by
reading the diff**, and are `api/files/[entityId]/[fieldName]/[filename]` ×2 and
`lib/api/notes-collection` ×1. The one file that *does* carry a scope-set acceptance gate
(`email/process/route.ts`) has all three sites on single lines, so that gate is non-vacuous there.

## Deviations from Plan

**1. [Rule 1 — corrected a false comment I was about to ship] The `.catch(log.error)` premise is wrong**
- **Found during:** Task 2, while writing the explanatory comment the plan asked for
- **Issue:** The plan and `42-PATTERNS.md` §5(e) both state that `.catch(log.error)` compiles. I had
  written that claim into a source comment. It is false: `tsc` rejects it with TS2345.
- **Fix:** Measured it (wrote the wrong form, ran `npx tsc --noEmit`, captured the error, reverted), and
  rewrote the comment to state the true mechanism — that `log.error`'s two required parameters are what
  make the wrong form unassignable to `.catch`, and that making `msg` optional would remove that.
- **Files modified:** `src/lib/api-keys.ts`
- **Commit:** `a26aaac`

**2. [Rule 3 — grep-gate self-collision] Reworded a comment so an acceptance gate stays honest**
- **Found during:** Task 2 verification
- **Issue:** My comment contained the literal string `` `.catch(log.error)` ``, which made
  `grep -c '\.catch(log\.error)' src/lib/api-keys.ts` return **1** — failing a criterion that the code
  actually satisfies.
- **Fix:** Reworded to "never a bare `log.error` reference". Same meaning; the gate now returns 0 for
  the right reason rather than being waived.
- **Files modified:** `src/lib/api-keys.ts`
- **Commit:** `a26aaac`

**3. [Rule 2 — a doc comment that the change made false] `NoteCollectionOptions.routeLabel`**
- **Found during:** Task 2
- **Issue:** Its doc read *"Prefix for server-side error logs"*. After the migration `routeLabel` is no
  longer a prefix — it is a `route` field. Leaving it would have been a new instance of exactly the
  stale-comment class the wave-1 handoff catalogues.
- **Fix:** Rewrote the doc comment to describe the field and note that it *was* a prefix before the
  migration. The property name and type are unchanged, so no caller is affected.
- **Files modified:** `src/lib/api/notes-collection.ts`
- **Commit:** `a26aaac`

**4. [Judgement, within the plan's stated latitude] `result.error` under `reason`, not `err`**
- The plan permits either. Chose `reason` and documented why at the site. Called out here because it
  introduces the phase's first non-`err` error-ish ctx key, and a later plan may want to standardise it.

No architectural change was needed; no checkpoint was hit; no auth gate was hit.

## Deferred / not mine

- The eleven `src/app/api/v1/**` files still holding 29 `console.*` sites are plan 10's scope, as the
  plan's own acceptance criterion anticipates. Untouched.
- `src/lib/log.ts`'s own four `console.*` calls remain in the ESLint census (170) by design — that module
  is the intended `no-console` exemption.
- I did not fix any of the five `Dockerfile:24` stale comments; none is in a file I own.

## Known Stubs

None. No placeholder, empty-value or TODO was introduced.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change — this plan changed log
call sites only, and every mitigation in the register (T-42-31, T-42-32, T-42-04, T-42-33, T-42-05,
T-42-34) is addressed above.

## Commits

| Commit | Scope |
|---|---|
| `3525dff` | `refactor(42-11): migrate the eleven non-v1 API route files to structured logging` — 14 sites, 11 files |
| `a26aaac` | `refactor(42-11): migrate the four lib/api modules, including the bare-reference catch` — 7 sites, 4 files |
</content>
</invoke>
