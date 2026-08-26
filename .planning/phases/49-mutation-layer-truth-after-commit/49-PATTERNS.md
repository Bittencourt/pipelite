# Phase 49: Mutation-Layer Truth After Commit — Pattern Map

**Mapped:** 2026-08-26
**Files analyzed:** 28 (11 new, 17 modified)
**Analogs found:** 26 / 28 (2 have no analog — `deleteEntityFiles` and the `custom_field_definitions` fixture helper have only partial ones)

> **What this document is for.** `49-RESEARCH.md` already names every insertion point by line. This
> file answers the *other* question: **what does the closest existing thing look like, so a new file
> matches the house style instead of inventing one.** Where research says "insert here", this says
> "and it must read like this".
>
> **No project `./CLAUDE.md` exists** and there is no `.claude/skills/` or `.agents/skills/`
> directory. `[VERIFIED: ls]` The binding conventions are therefore the ones read out of the code
> below plus the user's global instructions (Docker only, `docker` needs no `sudo`, gate on lint
> ERRORS, never gate on `test:db`'s exit code).

---

## File Classification

### New files

| New file | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `src/lib/api/<owned-record>.ts` — `findOwnedRecordById` | lib predicate/resolver (server-only, deliberately NOT in a `route.ts`) | request-response (4 owner-scoped point reads) | `src/lib/api/stage-scope.ts` (whole file) **+** `src/lib/trash/dispatch.ts:55-90` (the `Readonly<Record<EntityType,…>> satisfies` map) | role-match (composite of two) |
| `src/lib/trash/collect-file-field-refs.ts` | utility, pure | transform | `src/lib/audit/present.ts:263-268` (`isFileDescriptor`) **+** `src/lib/trash/present.ts` (a db-free pure module in the same directory) | role-match |
| `src/lib/trash/delete-entity-files.ts` — `deleteEntityFiles` | utility | file-I/O (+ S3 branch) | `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:107-128` (the only `unlink` in the tree) **+** `src/app/api/upload/route.ts:71-102` | **partial — no storage abstraction exists anywhere in `src/`** |
| `collect-file-field-refs.test.ts` | test, unit, pure | transform | `src/lib/trash/present.test.ts` | exact |
| `route-containment.test.ts` (file route, unit) | test, unit, handler invoked directly | request-response | `src/app/api/v1/activities/__tests__/route.test.ts:1-80` (the `vi.mock("@/db")` + direct-handler shape) | role-match |
| `files-route-ownership.db.test.ts` | test, live-DB, **session** auth | request-response | `src/app/import/import-owner-scope.db.test.ts:44-95` (the `vi.mock("@/auth")` + real-`db` pattern) **+** the skeleton below | exact |
| `purge-blobs.db.test.ts` | test, live-DB | CRUD + file-I/O | `src/lib/mutations/dedup.db.test.ts` (fixture parity discipline) | role-match |
| `create-response-canonical.db.test.ts` | test, live-DB, `mintApiKey` | request-response | `src/app/api/v1/activities/activities-scope.db.test.ts` (whole file) | exact |
| `src/app/api/v1/organizations/__tests__/route.test.ts` | test, unit, mocked `@/db` | request-response | `src/app/api/v1/deals/__tests__/formula-recalc.test.ts` | exact |
| a `custom_field_definitions` fixture helper (`formula` + `file` definitions, prefixed, with teardown) | test fixture, shared | CRUD | `src/app/api/v1/__tests__/api-key-fixture.ts` (whole file — the "one shared fixture module, id supplied never defaulted" idiom) | role-match |
| *(optional)* `dedup-formula.db.test.ts` | test, live-DB | event-driven | `src/lib/mutations/dedup.db.test.ts` | exact |

### Modified files

| Modified file | Role | Data flow | Closest analog for the change | Match |
|---|---|---|---|---|
| `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` | route handler (`GET`/`DELETE`) | file streaming + file-I/O | `src/app/api/v1/organizations/[id]/route.ts:31-52` (owner predicate → 404) | role-match (different auth model) |
| `src/app/api/v1/organizations/route.ts` `POST` | route handler | request-response | `organizations/[id]/route.ts:121-127` (**THE** canonical re-read) | exact |
| `src/app/api/v1/activities/route.ts` `POST` | route handler | request-response | same | exact |
| `src/app/api/v1/people/route.ts` `POST` | route handler | request-response | same — **but the insert is inline, see § Asymmetry** | exact-with-caveat |
| `src/app/api/v1/deals/route.ts` `POST` | route handler | request-response | same — inline insert | exact-with-caveat |
| `src/lib/mutations/dedup.ts` (post-commit block, `:627-651`) | mutation | event-driven, post-commit | **itself** — block 1 is the template for the new call | exact |
| `src/lib/mutations/organizations.ts` (before `:646`) | mutation | CRUD + file-I/O | `dedup.ts:627-651` | exact |
| `src/lib/mutations/people.ts` (before `:650`) | mutation | same | same | exact |
| `src/lib/mutations/deals.ts` (before `:754`) | mutation | same | same | exact |
| `src/lib/mutations/activities.ts` (before `:504`) | mutation | same | same | exact |
| `src/lib/trash/prune.ts:66-73` | module doc comment | — | `prune.ts:55-64` (the honest-enumeration style directly above it) | exact |
| `src/app/api/v1/deals/__tests__/formula-recalc.test.ts:360-368` | test (B1 inversion) | — | its own `:293-301` cell (already asserts `RECALC_RESULT`) | exact |
| `src/app/api/v1/people/__tests__/formula-recalc.test.ts:347-355` | test (B2 inversion) | — | same | exact |
| `src/app/api/v1/activities/__tests__/route.test.ts:24-37` | test (C1 mock widening) | — | its own `vi.mock("@/db")` factory | exact |
| `src/lib/mutations/dedup.test.ts` | test, unit, mocked recalc | — | `src/lib/mutations/organizations.test.ts:593-605` (the D-05 reject cell + console.error capture) | exact |
| `src/lib/mutations/dedup.db.test.ts:191-198, 569-579` | test, live-DB | — | itself (add a 7th table to `TOUCHED_TABLES`) | exact |
| `.planning/STATE.md:671` | register of record | — | — | n/a |

---

## Pattern Assignments

### 1. The canonical read — and the three rejected in-process merges beside it

**RIGHT.** The **only** re-read that ships today. Copy this shape.

```ts
// Source: src/app/api/v1/organizations/[id]/route.ts:121-127 [read in full]
// Re-fetch updated org for response (mutation doesn't return the entity for updates).
// This read follows the mutation's recalculation write, so it carries the recomputed values.
const updated = await db.query.organizations.findFirst({
  where: eq(organizations.id, id),
})

return singleResponse(serializeOrganization(updated!))
```

**WRONG — the in-process merge the user REJECTED.** The other three PUTs all look like this. It is
the same file family, one directory over, and a planner skimming for "how do the PUTs do it" will
find this three times and the correct one once.

```ts
// Source: src/app/api/v1/people/[id]/route.ts:255-279  (deals/[id] and activities/[id] are the same shape)
    (updated.customFields ?? {}) as Record<string, unknown>
  )

  const recalculatedPerson = { ...updated, customFields: recalculatedCustomFields }   // ← IN-PROCESS MERGE
  …
  // The response carries the post-recalc value too, so a caller doing PUT then GET does not
  // see two different values for the same field (matches PUT /api/v1/activities/[id]).
  return singleResponse(serializePerson(recalculatedPerson))                          // ← NOT THE PATTERN
```

The difference at a glance: the right one re-reads the **row**; the wrong one re-assembles an object
from the write's return value plus a helper's return value. Both produce a correct answer *today*
(the recalc writes exactly `customFields` and nothing else) — which is precisely why the wrong one is
dangerous: it is a coincidence, not a contract, and it breaks for the next derived field.

**The GET's own read**, for the "same path GET uses" requirement — note the three-term predicate:

```ts
// Source: src/app/api/v1/organizations/[id]/route.ts:31-52
const org = await db.query.organizations.findFirst({
  where: and(
    eq(organizations.id, id),
    eq(organizations.ownerId, context.userId),
    isNull(organizations.deletedAt)
  ),
  with: expand.has("owner") ? { owner: { columns: { id: true, name: true, email: true } } } : undefined,
})

if (!org) {
  return Problems.notFound("Organization")
}
```

**Imports pattern for all four `/api/v1` collection routes** (copy verbatim; the POST re-read needs
`db`, the table and `and`/`eq`, all four of which the organizations route already imports):

```ts
// Source: src/app/api/v1/organizations/route.ts:1-12
import { NextRequest, NextResponse } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { parseExpand } from "@/lib/api/expand"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeOrganization } from "@/lib/api/serialize"
import { createOrganizationMutation } from "@/lib/mutations/organizations"
import { db } from "@/db"
import { organizations } from "@/db/schema/organizations"
import { and, eq, isNull, count, sql } from "drizzle-orm"
import { z } from "zod"
```

---

### 2. THE ASYMMETRY — the four POSTs are two different shapes

**This is the single likeliest way this phase half-ships.** A plan written against one shape covers
two entities and silently misses the other two.

**Shape A — via a create mutation** (`organizations`, `activities`). The route holds `result.{entity}`
and never touches `recalculateFormulas` itself:

```ts
// Source: src/app/api/v1/organizations/route.ts:95-109
    // Use mutation (handles insert + event emission)
    const result = await createOrganizationMutation({
      name, website, industry, notes,
      customFields: custom_fields,
      userId: context.userId,
    })

    if (!result.success) {
      return Problems.validation([{ field: "body", code: "mutation_error", message: result.error }])
    }

    return createdResponse(serializeOrganization(result.organization))   // ← REPLACE
```

```ts
// Source: src/app/api/v1/activities/route.ts:221-238  — same shape, `ctx` not `context`
    const result = await createActivityMutation({
      title, typeId: type_id, dealId: deal_id, assigneeId: null,
      dueDate: due_at ? new Date(due_at) : now,
      notes, customFields: custom_fields,
      userId: activityOwnerId,
    })

    if (!result.success) {
      return Problems.validation([{ field: "body", code: "mutation_error", message: result.error }])
    }

    return createdResponse(serializeActivity(result.activity))            // ← REPLACE
```

**Shape B — inline `db.insert` + inline recalc + inline emit** (`people`, `deals`). There is no
mutation. The route owns the whole sequence, and it carries the stale comment that must die:

```ts
// Source: src/app/api/v1/people/route.ts:205-263  (deals/route.ts:295-354 is byte-for-byte the same shape)
    // Strip client-supplied formula keys BEFORE the write (T-34-04), keeping the definitions so
    // the recalculation below does not read them a second time.
    const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
    const customFieldsToPersist =
      custom_fields !== undefined
        ? await stripCallerFormulaKeys(custom_fields, definitionsCache)
        : {}

    // Insert person
    const [person] = await db.insert(people).values({ …, ownerId: context.userId,
      customFields: customFieldsToPersist }).returning()

    // Recalculate AFTER the write and STRICTLY BEFORE the emit (D-01 / D-17).
    const recalculatedCustomFields = await recalcCustomFields(
      {
        entityType: "person",
        entityId: person.id,
        changedFields: [...PERSON_NATIVE_COLUMNS, ...Object.keys(customFieldsToPersist)],
        row: person as unknown as Record<string, unknown>,
        definitionsCache,
      },
      (person.customFields ?? {}) as Record<string, unknown>
    )

    crmBus.emit("person.created", { …, data: serializePerson({ ...person,
      customFields: recalculatedCustomFields }) …, })

    // The 201 body deliberately carries the PRE-recalc row: the stored value, the emitted event
    // and any subsequent GET are all correct (SC-1), and changing a create response is backlog
    // 999.23, which is being decided once for all four entities rather than per route.
    return createdResponse(serializePerson(person))          // ← REPLACE; the comment above BECOMES FALSE
```

**Consequences a plan must carry:**
- Shape B's `recalcCustomFields` already resolves the post-recalc blob **into a local**. A re-read is
  still correct and still required (it is what makes the 201 and the GET share one code path), but
  a plan that instead reaches for `{ ...person, customFields: recalculatedCustomFields }` has
  reproduced the rejected in-process merge from § 1 — in the exact two routes where it is easiest.
- The three-line "deliberately carries the PRE-recalc row … backlog 999.23" comment exists in
  **both** Shape B routes (`people/route.ts:260-262`, `deals/route.ts:351-353`) and must be rewritten
  in the same commit. It is prose that documents the defect as intentional.
- `context` vs `ctx`: organizations/people/deals name the auth context `context`; activities names it
  `ctx`. Four near-identical edits with one identifier difference.

---

### 3. The post-commit block idiom — the canonical template, whole, with its comments

DATA-01 extends this block; SC-2's blob deletion must MIRROR its shape in four purge mutations.

```ts
// Source: src/lib/mutations/dedup.ts:625-651 [read in full]
    })

    // ---- AFTER THE COMMIT. Both blocks are best-effort and neither rethrows. -------------

    // 1. Formula recalculation for the rows that moved.
    //
    //    IT CANNOT RUN INSIDE THE TRANSACTION: `recalculateFormulas` and its whole cascade use
    //    the module-level `db` and have no `tx` parameter, so calling it above would read a
    //    snapshot that does not include the uncommitted reparenting and write outside the
    //    transaction's atomicity. Running it after the commit is the only correct placement.
    //
    //    AND IT CANNOT BE LEFT TO A SURVIVOR-ROOTED CASCADE. `cascadeToChildren` short-circuits
    //    on `if (changed.size === 0) return 0`, so a merge where the survivor won every field
    //    recomputes NOTHING and every reparented child keeps an `Organization.*` value derived
    //    from the record now in Trash. The children are therefore iterated explicitly.
    try {
      await recalcReparentedChildren({
        entityType,
        survivorId,
        survivorRow: outcome.survivorRow,
        movedDeals: outcome.movedDeals,
        movedPeople: outcome.movedPeople,
      })
    } catch (error) {
      // D-05: formula machinery never blocks a write, and the merge has already committed.
      log.error("dedup-merge", "post-merge formula recalculation failed", { err: error })
    }
```

**Style facts a new block must match:** a numbered comment naming *why it is out here*, then a `try`,
then a `catch (error)` whose body is exactly one `log.error(<literal scope>, <sentence>, { err: error })`
and nothing else. Block 2 (`:653-690`) is the same shape a second time — so the file already
establishes "one try/catch per concern", not one try wrapping both. **Insert the survivor recalc as a
new numbered block BEFORE block 1** (research § SC-3: the survivor's values feed the children's
`Organization.*` refs, so the survivor must run first).

**The log-scope literal rule is enforced by a gate.** `src/lib/api/db-errors.ts:139-153` records that
`src/lib/log-scope-format.test.ts` counts `log.<level>(` call sites against quoted scope literals and
went red twice — once for a scope *parameter* and once for a hoisted `const LOG_SCOPE`. **Every new
`log.error` in this phase must spell its scope as a string literal in the parenthesis.** The four
purge mutations already use `"mutations/organizations"`, `"mutations/activities"`, etc.

---

### 4. The purge mutations — where the post-commit block goes, and what "symmetric" actually means

All four are the same three-step shape. `organizations` is the widest; `activities` is the narrowest.
Both tails shown so a planner can see the two `return` spellings.

```ts
// Source: src/lib/mutations/organizations.ts:553-651  (structure, abridged in the middle)
export async function purgeOrganizationMutation(
  id: string,
): Promise<{ success: true; detached: number } | { success: false; error: string }> {
  // Captured synchronously at entry, BEFORE the transaction promise exists.
  const actor = getCurrentActor()

  const organization = await db.query.organizations.findFirst({          // ← THE FULL ROW. customFields is
    where: and(eq(organizations.id, id), isNotNull(organizations.deletedAt)),  //   already here, free.
  })

  if (!organization) {
    return { success: false, error: "NOT_IN_TRASH" }
  }

  try {
    const detached = await db.transaction(async (tx) => {
      … notes delete, child detaches with .returning(), per-child audit rows,
        the row delete carrying `isNotNull` on the DELETE predicate itself,
        the purge's own audit row INSIDE the transaction …
      return detachedDeals.length + detachedPeople.length
    })

    return { success: true, detached }                                    // ← organizations.ts:646
  } catch (error) {
    log.error("mutations/organizations", "Failed to purge organization", { err: error })
    return { success: false, error: "Failed to purge organization" }
  }
}
```

```ts
// Source: src/lib/mutations/activities.ts:461-509 — the narrow twin; note `detached: 0`, a literal
  try {
    await db.transaction(async (tx) => { … })

    return { success: true, detached: 0 }                                 // ← activities.ts:504
  } catch (error) {
    log.error("mutations/activities", "Failed to purge activity", { err: error })
    return { success: false, error: "Failed to purge activity" }
  }
```

**What to copy:** the pre-fetched row is already in scope (`organization` / `person` / `deal` /
`activity`) — collect the refs from it **before** the transaction, and put the deletion block between
the `await db.transaction(...)` and the `return`, inside the existing `try`. **Do not widen the
return type.** `PurgeResult` is declared once in `src/lib/trash/dispatch.ts:51-53` and eleven exact
`toEqual({ success: true, detached: N })` assertions read it (research § Alternatives Considered).

**The mismatch log's content rule, from the module that already enforces it:**

```ts
// Source: src/lib/trash/prune.ts:203-218
    for (const id of ids) {
      // Each record's teardown is wrapped on its own, so one undeletable row does not abort the
      // rest of the batch. The failing record is named by IDENTIFIER only — never by content.
      try {
        const result = await runWithActor(SYSTEM_ACTOR, () => purgeRecordByType(entityType, id))

        if (result.success) {
          purgedInBatch++
        } else {
          // Identifier and refusal reason only — exactly what the old string carried, and nothing
          // more. No record content ever enters a log line from this module (T-37-30).
          log.error("trash-prune", "Refused to purge record", {
            entityType,
            id,
            reason: result.error,
          })
        }
```

→ the blob-mismatch line carries `{ entityType, id, expected, deleted }` and **no filename**.

---

### 5. `prune.ts`'s comment — the style the replacement must match

The block that must stop being true, and the block immediately above it that shows the house voice
for "here is exactly what this does and does not do":

```ts
// Source: src/lib/trash/prune.ts:55-79
 * revision of this comment overstated it, which is how the gap below went unnoticed):
 *
 *   - the record's own row, and its `notes` rows (polymorphic, no foreign key, so explicit);
 *   - `deal_assignees` and `deal_stage_history`, for a deal only;
 *   - the foreign keys of LIVE children, nulled rather than cascaded: …
 *
 * Custom-field VALUES need no statement of their own: they live in the record's own `customFields`
 * JSONB column and go with the row.
 *
 * NOT COVERED — UPLOADED FILE BLOBS ARE NOT REMOVED. A file custom field stores its bytes under
 * `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}` and is referenced only from that JSONB
 * column, so purging the row destroys the REFERENCE and leaves the BYTES on disk (or in S3). The
 * blob therefore survives a "permanent" delete and stays reachable to anyone holding its URL.
 * This is a known scope gap, deliberately not closed here: irreversible disk deletion inside the
 * most dangerous code path in the phase needs its own plan, and doing it wrong is unrecoverable.
 * Tracked as follow-up work — see `.planning/STATE.md`. Do not read the batch size below, or
 * anything else in this module, as evidence that blobs are handled.
```

Note the sentence *"a previous revision of this comment overstated it, which is how the gap below
went unnoticed"* — this module has already been burned once by prose that claimed more than the code
did. The replacement should shrink to a **pointer at the four mutations that now own the deletion**,
and each mutation carries the real statement. Two places that can disagree is how the comment became
false the first time.

`prune.test.ts` reads `BATCH_SIZE` and `MAX_BATCHES_PER_TICK` symbolically, never as literals, so
touching the surrounding prose is free. No test asserts on this text.

---

### 6. The db-test harness skeleton — shared by all four new `*.db.test.ts` files

`src/app/api/v1/activities/activities-scope.db.test.ts` is the fullest example (1,189 lines) and the
one to copy structurally. Its seven load-bearing parts:

**(a) Module-scope environment guard.** Aborts *collection*, so no statement is ever sent at a wrong
target. Copy this function verbatim; it is duplicated (not shared) across the existing db-tests.

```ts
// Source: activities-scope.db.test.ts:128-166
const TEST_DATABASE = "pipelite_dedup_test"
/** The development database, named here only so it can be refused BY NAME. */
const DEV_DATABASE = "pipelite"

function assertIsolatedConnection(connectionString: string | undefined): string {
  if (!connectionString) { throw new Error("DATABASE_URL is not set for the db vitest project. …") }
  const url = new URL(connectionString)
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error(`refusing to run: connection host "${url.hostname}" is not loopback. …`)
  }
  const database = url.pathname.replace(/^\//, "")
  if (database !== TEST_DATABASE) { throw new Error(`refusing to run: connection names database "${database}", …`) }
  return connectionString
}

assertIsolatedConnection(process.env.DATABASE_URL)
```

…and it is itself **asserted**, in four cells, including an anti-vacuity one (`:431-456`): three
refusals plus "accepts the isolated database this run is actually pointed at", because a guard that
threw on everything would satisfy the three refusals and make the suite unrunnable.

**(b) One prefix on every id, and the named-integer floors declared once.**

```ts
// Source: activities-scope.db.test.ts:172-226
/** One prefix, on every id. No `_` and no `%`, so no LIKE escaping is needed. */
const PREFIX = "actscope-"
const LIKE_PREFIX = `${PREFIX}%`

const USER_A = `${PREFIX}user-a`
const USER_B = `${PREFIX}user-b`
const KEY_A  = `${PREFIX}key-a`
…
/**
 * THE THREE NUMBERS THIS PROOF TURNS ON, declared once and consumed by BOTH the seed and the
 * assertions, so the two cannot drift. Every one of them is a named literal rather than a value
 * computed from the same query it is checking: an assertion that derives both of its sides from one
 * source passes on an empty database, which is precisely the failure this file exists to rule out.
 */
const A_OWNED = 7
const B_OWNED = 3
const SEEDED_TOTAL = 10
```

**This is the named-integer-floor idiom the phase requires three times over** (SC-2 blob count, SC-3
formula-definition count, SC-4 definition count). The rule in one line: *the literal and the query
result are asserted against each other, and the literal is also asserted to be non-zero.*

**(c) `TOUCHED_TABLES` + a per-table leftover predicate + clean-then-measure `beforeAll`.**

```ts
// Source: activities-scope.db.test.ts:241-286, 346-367, 415-425
const TOUCHED_TABLES = ["users","api_keys","activity_types","pipelines","stages","deals","activities","audit_log"] as const

/**
 * Not a shared `id like 'actscope-%'`, because `audit_log.id` is a generated UUID — an id-prefix
 * check on that table would report zero no matter how many rows leaked …
 */
const LEFTOVER_PREDICATE: Record<(typeof TOUCHED_TABLES)[number], ReturnType<typeof sql>> = {
  users: sql`id like ${LIKE_PREFIX}`,
  …
  activities: sql`id like ${LIKE_PREFIX} or deal_id like ${LIKE_PREFIX}`,
  audit_log: sql`entity_id like ${LIKE_PREFIX} or actor_user_id like ${LIKE_PREFIX}`,
}

beforeAll(async () => {
  // CLEAN FIRST, THEN MEASURE — and the ORDER is the whole point (WR-04). … a run killed after
  // `beforeAll` (Ctrl-C, container restart, OOM) converted itself into a false RED on the NEXT run
  await removeFixtures()
  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)
  …
}, 60_000)

afterAll(async () => {
  await removeFixtures()
  for (const table of TOUCHED_TABLES) {
    expect(await countLeftovers(table)).toBe(0)                 // Half 1: nothing of ours is left.
    expect(await countAll(table)).toBe(baseline[table])         // Half 2: nothing else changed in NUMBER.
  }
}, 60_000)
```

`removeFixtures()` deletes in **foreign-key order, audit rows first**, and sweeps by *two* predicates
where a mutation generates its own UUID (`:288-313`) — otherwise a red run leaves an orphan that
kills every subsequent run with `23503`.

**(d) Real handlers, real keys, no injected identity.**

```ts
// Source: activities-scope.db.test.ts:319-340, 378-379
keyA = await mintApiKey({ id: KEY_A, userId: USER_A, name: "scope fixture A" })
keyB = await mintApiKey({ id: KEY_B, userId: USER_B, name: "scope fixture B" })

/**
 * A list request carrying a REAL minted key. There is no context argument and no injected identity:
 * whoever `api_keys.user_id` names is who this request is, decided inside `validateApiKey`.
 */
function listRequest(authorization: string, query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/activities${query}`, {
    headers: { Authorization: authorization },
  })
}
```

`mintApiKey` is imported from `../__tests__/api-key-fixture` and its own header (`:43-44`) says it is
exported for cross-phase reuse. **Do not build a sixth harness.**

**(e) The parity/leak + floor/ceiling/discriminator/cross-check assertion shape** (`:562-658`) — four
named components, each in its own `it`, each with an anti-vacuity anchor beside it. The `expect`
message string carries the reasoning:

```ts
// Source: activities-scope.db.test.ts:572-581
  it("FLOOR: A's own count is greater than zero — an empty response must FAIL, not pass", async () => {
    const payload = await listAs(keyA.authorizationHeader)
    expect(
      payload.meta.total,
      "an empty response proves nothing: every 'contains no foreign row' assertion in this file " +
        "is satisfied by a response containing no rows at all. The floor is what makes them mean " +
        "something.",
    ).toBeGreaterThan(0)
  })
```

**(f) Read the truth by direct SQL, never from the handler's own answer** (`:539-556`, `:740-746`):

```ts
/** A direct SQL count, deliberately NOT routed through anything the route also uses. */
async function sqlCountOwnedBy(userId: string): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from activities where owner_id = ${userId} and deleted_at is null`,
  )
  return Number((rows as unknown as { n: number }[])[0].n)
}
```

**(g) The session-auth variant**, for `files-route-ownership.db.test.ts` — `mintApiKey` does **not**
apply, the file route uses `auth()`:

```ts
// Source: src/app/import/import-owner-scope.db.test.ts:69-81
/**
 * The session this import runs as. Declared through `vi.hoisted` so the factory below can reach it
 * and so a single cell can switch identity — which the B-side symmetry cell does.
 */
const authState = vi.hoisted(() => ({ userId: "" }))

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: authState.userId } })),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
```

Its header (`:44-53`) states the minimum-mock rule explicitly: `@/auth` and `next/cache` **only** —
`@/db` is not mocked, and "nothing that decides the outcome under test is substituted."

#### The two fixture hazards Phase 48 hit twice — both have a concrete analog

**Hazard 1 — a restore helper that resets what a cell WRITES but not what the exploit TRANSFERS.**
Read this comment before writing any `beforeEach` restore:

```ts
// Source: src/lib/execution/actions/crm-ownership.db.test.ts:348-395
/**
 * PUT EVERY FIXTURE ROW BACK, BEFORE EVERY CELL — and this is not tidiness, it is what stops the
 * file lying about itself.
 *
 * MEASURED. Run against the UNFIXED handler, the first cell ("by targetId") renames B's activity
 * to `crmown-pwned`, which is the defect. The second cell ("by TITLE LOOKUP") then probes for
 * `crmown-victim-activity-title`, finds nothing, gets a legitimate "No activity found", and
 * **PASSES** — a cell that exists to catch the unscoped `ilike` reported GREEN against the very
 * code it was written to fail on, because an earlier cell had already destroyed its fixture.
 *
 * Restoring by direct SQL, not through a mutation: the mutations are what is under test.
 *
 * `ownerId` IS RESTORED TOO, AND IT WAS NOT UNTIL CR-04 — … CR-04's second cell drives
 * `fieldMapping: { ownerId: <USER_B> }` at DEAL_A, and against the UNFIXED handler that cell does
 * not merely fail: it SUCCEEDS, and DEAL_A becomes B's. Every subsequent cell in the describe then
 * threw `No deal found with id 'crmown-deal-a'` … Five cascaded reds for one defect, and the
 * positive anchors reporting the wrong cause. A restore that covers the fields a cell WRITES but
 * not the field a cell TRANSFERS is not a restore.
 */
async function restoreFixtureRows(): Promise<void> {
  await db.update(activities)
    .set({ title: ACT_A_TITLE, notes: A_SECRET, deletedAt: null, ownerId: USER_A })
    .where(eq(activities.id, ACT_A))
  …
}

beforeEach(async () => { await restoreFixtureRows(); … })
```

**Phase 49's version of this hazard is `customFields`.** SC-2's cells purge rows and delete bytes;
SC-3's cells move a value from loser to survivor. A restore that resets `title`/`notes` but not
`customFields` (and not `deletedAt`, and not `ownerId`) will cascade exactly as CR-04 did.

**Hazard 2 — a barrier cell that uses the attacker's own row instead of the victim's.**

```ts
// Source: src/lib/triggers/trigger-owner-scope.db.test.ts:786-820
   *   - as a BARRIER that must succeed (`toBeGreaterThan(0)`), which is what proves the subscriber
   *     actually ran for the event just emitted;
   *   - as the NEGATIVE itself (`toBe(0)` with a shorter budget), …
   *
   * MEASURED: an earlier shape drove B then A and used A's own run as the barrier. That was a
   * RACE — within one `matchAndFireTriggers` invocation the order in which matching workflows are
   * inserted is not fixed, so `countRuns(workflowA)` read 1 and then became 2, and the cell failed
   * on a later assertion than the one that describes the defect. B's own run is the correct
   * barrier: it is produced by the SAME invocation that would have produced A's.
```

For SC-2's injected-failure cell the barrier is the same shape: assert **the other blob was deleted**
(`deleted >= 1` for the non-sabotaged ref) in the same purge that failed on the sabotaged one —
not a separate purge of the attacker's own record.

#### File-placement conventions — a real divergence the planner must decide

| Directory | Actual convention | What `49-VALIDATION.md` prescribes |
|---|---|---|
| `src/lib/trash/` | **sibling** `*.test.ts` only — `prune.test.ts`, `dispatch.test.ts`, `present.test.ts`, `queries.test.ts`, `settings.test.ts`, `entity-types.test.ts`. **No `__tests__/` directory exists.** `[VERIFIED: ls -R]` | `src/lib/trash/__tests__/collect-file-field-refs.test.ts`, `src/lib/trash/__tests__/purge-blobs.db.test.ts` |
| `src/app/api/files/` | **no test file and no `__tests__/` directory at all** | `src/app/api/files/__tests__/route-containment.test.ts`, `.../files-route-ownership.db.test.ts` |
| `src/app/api/v1/` | `__tests__/` per route dir — but db-tests are **co-located** in two of three cases (`activities/activities-scope.db.test.ts`, `stages/stages-scope.db.test.ts`) and in `__tests__/` in the third (`workflows/__tests__/runs-owner-scope.db.test.ts`) | `src/app/api/v1/__tests__/create-response-canonical.db.test.ts` (consistent with `api-key-fixture.ts` living there) |
| `src/lib/api/` | **both** — sibling `auth.test.ts` beside `__tests__/db-errors.test.ts` | — |

**Neither choice is wrong; picking silently is.** `vitest.db.config.ts` globs
`src/**/*.db.test.?(c|m)[jt]s?(x)` so placement does not affect collection. State the choice in the
plan; if the plan follows VALIDATION.md it is **introducing** a `__tests__/` directory into
`src/lib/trash/`, which is a new convention in that module, not a continuation of one.

---

### 7. The storage code — inlined in exactly two files, and one of them is gated

**There is no storage abstraction module anywhere in `src/`.** `deleteEntityFiles` must be written in
the same idiom as these two call sites rather than reaching for one.

```ts
// Source: src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:1-28, 107-128
import { readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import type { S3Client } from '@aws-sdk/client-s3'
import { log } from '@/lib/log'

const STORAGE_TYPE = process.env.FILE_STORAGE || 'local'      // MODULE-LEVEL. A test that mutates
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads'    // process.env after import has NO effect.

let s3Client: S3Client | null = null                           // lazy init, dynamic import
async function getS3Client() { if (!s3Client && process.env.S3_ENDPOINT) { … } return s3Client }
…
    if (STORAGE_TYPE === 's3') {
      const client = await getS3Client()
      if (!client) return NextResponse.json({ error: 'S3 not configured' }, { status: 500 })
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
      const key = `${entityId}/${fieldName}/${filename}`
      await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }))
    } else {
      // Local filesystem
      const filePath = path.resolve(UPLOAD_DIR, entityId, fieldName, filename)
      if (existsSync(filePath)) {
        await unlink(filePath)
      }
    }
```

```ts
// Source: src/app/api/upload/route.ts:59-102 — the writer, and where the two key shapes are minted
    const fileId = crypto.randomUUID()
    const ext = path.extname(file.name)
    const storedName = `${fileId}${ext}`
    …
    if (STORAGE_TYPE === 's3') {
      const key = `${entityId}/${fieldName}/${storedName}`
      await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: buffer, ContentType: file.type }))
      filePath = key
      publicUrl = `${process.env.S3_PUBLIC_URL}/${key}`        // ← NOT an app route. SEC-49-A. Out of scope.
    } else {
      const uploadDir = path.resolve(UPLOAD_DIR, entityId, fieldName)
      if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true })
      filePath = path.join(uploadDir, storedName)
      await writeFile(filePath, buffer)
      publicUrl = `/api/files/${entityId}/${fieldName}/${storedName}`
    }
```

**THE GATE that makes an extract-a-module refactor a suite-breaker:**

```ts
// Source: src/lib/__tests__/compose-uploads-persistence.test.ts:398-404
describe("uploads persistence: the env var name matches the one the code reads", () => {
  it("both file routes read process.env.UPLOAD_DIR", () => {
    // GREEN before the fix and it must stay green. This is the cross-tier link: renaming the
    // variable on either side turns the gate red.
    expect(readRepoFile(UPLOAD_ROUTE_PATH)).toContain("process.env.UPLOAD_DIR")
    expect(readRepoFile(FILE_DOWNLOAD_ROUTE_PATH)).toContain("process.env.UPLOAD_DIR")
  })
})
```

The file's own house rule, quoted three lines above at `:390-393`: *"on a collision REWORD THE PROSE,
never weaken the gate."* Here that means **the code must keep the token** — a new
`src/lib/trash/delete-entity-files.ts` may read `process.env.UPLOAD_DIR` for its own use, but the two
routes must not stop reading it.

**The stored shape the new helper walks** (`FileItem`), and its `storedName` — the on-disk name:

```ts
// Source: src/components/custom-fields/file-field.tsx:14-22
export interface FileItem {
  id: string
  filename: string
  storedName: string
  path: string
  publicUrl: string
  size: number
  mimeType: string
}
```

**The existing shape predicate — do not invent a third spelling:**

```ts
// Source: src/lib/audit/present.ts:263-268 (module-private today)
/** A stored file descriptor, as `file-field.tsx` writes them. */
function isFileDescriptor(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (typeof value.filename !== "string") return false
  return "storedName" in value || "path" in value || "size" in value || "mimeType" in value
}
```

**One pre-existing latent bug to record, not fix:** `file-field.tsx:162` issues
`await fetch(file.publicUrl, { method: 'DELETE' })`. Under `FILE_STORAGE=s3`, `publicUrl` is the
bucket URL, so the client's delete never reaches the app's `DELETE` handler. Out of scope (SEC-49-A).

---

### 8. `requireScopedPredicate` — both call sites, so a new one matches

```ts
// Source: src/lib/api/stage-scope.ts:71-90, 135-156
export function ownedStagesPredicate(userId: string, pipelineId?: string | null): SQL {
  // Declared `SQL[]`, so every element is a real term by TYPE rather than by inspection, and
  // `terms.length` below is a trustworthy count of what actually reached the conjunction.
  const terms: SQL[] = [eq(pipelines.ownerId, userId), isNull(pipelines.deletedAt)]
  if (pipelineId) { terms.push(eq(stages.pipelineId, pipelineId)) }
  return requireScopedPredicate(and(...terms), terms.length)
}

/** The number of terms this scope may NEVER be without: the owner equality and the soft-delete guard. */
export const MANDATORY_SCOPE_TERMS = 2

export function requireScopedPredicate(
  predicate: SQL | undefined,
  termCount: number,
  subject = "ownedStagesPredicate"
): SQL {
  if (predicate === undefined) { throw new Error(`${subject} produced no predicate at all. …`) }
  if (termCount < MANDATORY_SCOPE_TERMS) { throw new Error(`${subject} built ${termCount} term(s); …`) }
  return predicate
}
```

```ts
// Source: src/lib/execution/actions/crm.ts:416-420  — Phase 48's second call site, the shape to copy
function callerScope(def: LookupDef, userId: string): SQL {
  const terms: SQL[] = [eq(def.ownerColumn, userId), isNull(def.deletedAtColumn)]

  return requireScopedPredicate(and(...terms), terms.length, "crm_action's callerScope")
}
```

```ts
// Source: src/lib/triggers/matcher.ts:250-258 — the third
  // routed through `requireScopedPredicate` so a future edit that makes the owner equality
  …
    .where(requireScopedPredicate(and(...terms), terms.length, "matchAndFireTriggers' owner scope"))
```

**Copy the whole idiom, not just the call:** `const terms: SQL[] = [...]` (declared, not inferred),
then `and(...terms)`, then `terms.length` as the second argument, then a `subject` string that names
*this* predicate. `crm.ts:410-414` also records the honesty rule for its proof: *"this guard CANNOT be
driven red from production code … The proof is therefore an ABLATION"* — if Phase 49's new resolver
gets a guard cell, label its evidence the same way.

Also from `stage-scope.ts:55-57`, the constraint that decides **where** the new resolver lives:

```
 * IT LIVES HERE RATHER THAN IN THE ROUTE because Next.js validates the export surface of a
 * `route.ts`: a non-verb export fails the build's route type check.
```

**Exhaustiveness idiom for the four-table walk** — `dispatch.ts` is the canonical version and its
comment explains why `satisfies` is load-bearing on top of the annotation:

```ts
// Source: src/lib/trash/dispatch.ts:55-90
type PurgeMap = Readonly<Record<EntityType, (id: string) => Promise<PurgeResult>>>

/**
 * THE `satisfies` IS NOT DECORATION — it catches a class of error the annotation alone does not.
 * A MISSING key fails on the annotation (verified: removing `person` gives TS2741). An EXTRA key
 * does NOT: the literal is an argument to `Object.freeze`, so by the time the result is assigned to
 * the annotated const it is no longer a fresh literal and excess-property checking has been
 * skipped. … Verified both directions before landing.
 */
const PURGE_BY_TYPE: PurgeMap = Object.freeze({
  deal: purgeDealMutation,
  person: purgePersonMutation,
  organization: purgeOrganizationMutation,
  activity: purgeActivityMutation,
} satisfies PurgeMap)
```

`prune.ts:99-114` is the same idiom carrying drizzle column references rather than functions —
the closer analog for `findOwnedRecordById`'s table/column map:

```ts
interface ExpirySource { readonly table: PgTable; readonly id: PgColumn; readonly deletedAt: PgColumn }

const EXPIRY_SOURCE: Readonly<Record<EntityType, ExpirySource>> = Object.freeze({
  deal: { table: deals, id: deals.id, deletedAt: deals.deletedAt },
  person: { table: people, id: people.id, deletedAt: people.deletedAt },
  organization: { table: organizations, id: organizations.id, deletedAt: organizations.deletedAt },
  activity: { table: activities, id: activities.id, deletedAt: activities.deletedAt },
} satisfies Record<EntityType, ExpirySource>)
```

It needs one more column than `ExpirySource` carries: `ownerId` and `customFields`.

---

### 9. `src/lib/api/db-errors.ts` — reuse, do not re-handle raw `PostgresError`s

```ts
// Source: src/lib/api/db-errors.ts:82-120
/**
 * How far down the `cause` chain to look. Two is enough for drizzle today; the bound exists so a
 * cyclic `cause` — which is constructible — cannot spin here, in the error path, where a hang is
 * indistinguishable from the request having stalled.
 */
const MAX_CAUSE_DEPTH = 5

/**
 * ⚠ IT WALKS `cause`, AND THAT IS THE WHOLE FUNCTION. DRIZZLE WRAPS.
 * … the first version of this module read only the top level, its 24 unit assertions were green,
 * and `stages-scope.db.test.ts` — driving the real route against real PostgreSQL — answered
 * **500 where 409 was expected**. Both layers of test were necessary to find it …
 */
export function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined
    const code = (current as { code?: unknown }).code
    if (typeof code === "string") return code
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}
```

Public surface: `mapWriteError(route, error, { conflict?, field? })` and
`mapDeleteError(route, error, { referenced })`, both returning a `NextResponse`.

**Relevance to Phase 49 is narrow and worth saying so:** the canonical re-read is a `SELECT`, which
does not produce the SQLSTATEs this module maps, and the four POSTs' write paths are unchanged. This
module is here so a plan **does not** hand-roll a `catch` around the new re-read — and so that if the
file route gains a `try`/`catch`, it uses this rather than `NextResponse.json({ error }, { status: 500 })`.
⚠ **The file route is not under `/api/v1` and has no `Problems` helper in scope**; it answers
`NextResponse.json({ error: … }, { status: … })` today (`:41`, `:63`, `:77`, `:95`). `mapWriteError`
returns an RFC-7807 problem document. **Pick one shape per handler and state the choice** — two error
shapes in one handler is the failure research already flagged.

---

### 10. The three test amendments — the exact cells

**B1 / B2 inversion.** The fixture constants are already discriminating by construction:

```ts
// Source: src/app/api/v1/deals/__tests__/formula-recalc.test.ts:102-124
/** `Margin` is formula-typed, so `stripFormulaKeys` must drop a caller-supplied `Margin`. */
const DEFINITIONS = [
  { id: "d1", entityType: "deal", name: "Origem", type: "multi_select", config: null },
  { id: "d2", entityType: "deal", name: "Margin", type: "formula",
    config: { expression: "{{Value}} * 1.035" } },
] as unknown as Awaited<ReturnType<typeof getActiveFieldDefinitions>>

/** What the row holds BEFORE recalculation. */
const STORED_CUSTOM_FIELDS: Record<string, unknown> = { Origem: ["Inbound"] }

/**
 * What the mocked helper resolves with — deliberately NOT equal to `STORED_CUSTOM_FIELDS`, so an
 * implementation that emitted the pre-recalc blob could not pass by accident.
 */
const RECALC_RESULT: Record<string, unknown> = {
  Origem: ["Inbound"],
  Margin: { formula: true, value: 1035, error: null },
}
```

The cell to invert, and the comment that must be rewritten with it:

```ts
// Source: src/app/api/v1/deals/__tests__/formula-recalc.test.ts:360-368
  it("leaves the 201 body pre-recalc — backlog 999.23, deferred for all four entities", async () => {
    const response = await POST(postRequest({ title: "Acme renewal", stage_id: "stage-1" }))
    const body = await response.json()

    // Documented, not accidental: the stored row and the emitted event are both correct, and a
    // subsequent GET is correct (SC-1). Changing the create response is 999.23's job, so that
    // one decision covers organizations, people, deals and activities together.
    expect(body.data.custom_fields).toEqual(STORED_CUSTOM_FIELDS)
  })
```

The inverted form already exists three cells up, for the *emit* — copy its two-sided shape:

```ts
// Source: same file, :293-301
    expect(emittedPayload().data.custom_fields).toEqual(RECALC_RESULT)
    expect(emittedPayload().data.custom_fields).not.toEqual(STORED_CUSTOM_FIELDS)
    expect(emittedPayload().data.customFields).toBeUndefined()
```

⚠ **The D-05 cell at `:347-358` asserts the opposite and must stay that way.** When the recalc
rejects, the *emit* carries `STORED_CUSTOM_FIELDS`. Under a re-read the 201 body would carry whatever
the stubbed `findFirst` resolves — which the plan must decide and stub deliberately, not by accident.

**C1 — the mechanical breakage, located precisely.** The activities mock has **no** `findFirst` on
`query.activities` at all, so a new re-read is a `TypeError`, not an `undefined`:

```ts
// Source: src/app/api/v1/activities/__tests__/route.test.ts:24-37
vi.mock("@/db", () => ({
  db: {
    query: {
      activities: { findMany: vi.fn() },          // ← no findFirst. ADD ONE.
      activityTypes: { findFirst: vi.fn() },
      deals: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    select: vi.fn(() => ({ from: countFrom })),
  },
}))
```

The two cells that then need a resolved row (`:336`, `:347`) both only assert `status === 201` and
`mockCreateActivity.mock.calls[0][0].userId`, so a minimal stub suffices — but the `mockDb` type alias
at `:62-71` must gain the key too or `tsc --noEmit` reddens.

**The D-05 / log-capture idiom for the new `dedup.test.ts` cells:**

```ts
// Source: src/lib/mutations/organizations.test.ts:593-605
    it("still succeeds and still emits when recalculation rejects (D-05)", async () => {
      stubInsert()
      mockRecalc.mockRejectedValueOnce(new Error("boom"))
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const result = await createOrganizationMutation({ name: "Acme Corp", userId: "u1" })

      expect(result).toEqual({ success: true, id: "org1", organization: preRecalcOrg })
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalled()
      expect(String(errorSpy.mock.calls[0][0])).toContain('"scope":"formula-recalc"')
      errorSpy.mockRestore()
    })
```

**This is also the pattern for asserting SC-2's mismatch log.** The scope literal to match is
`"mutations/organizations"` (or the sibling per entity), and `expected`/`deleted` appear in the same
JSON payload string.

---

### 11. The shared fixture module — `custom_field_definitions`

`api-key-fixture.ts` is the only shared test-fixture module in the tree and it sets three
conventions the new one should follow:

```ts
// Source: src/app/api/v1/__tests__/api-key-fixture.ts:36-44, 83-102
 * WHY THE CALLER SUPPLIES THE ID. `api_keys.id` is `text` with a `$defaultFn`, but a fixture that
 * let the default fire would produce an unprefixed UUID that a prefix-scoped teardown cannot find.
 * Every fixture in this repository cleans up by id prefix, so the id is an argument, not a default.
 *
 * REUSE: Phase 50's export-authorization work needs the same two-identity setup against
 * `/api/v1` — `mintApiKey` is exported for it rather than being local to one test file.

export async function mintApiKey({ id, userId, name }: MintApiKeyInput): Promise<MintedApiKey> {
  …
  await db.insert(apiKeys).values({ id, userId, name, keyPrefix: …, keyHash })
  return { id, userId, plaintextKey, authorizationHeader: `Bearer ${plaintextKey}` }
}
```

The three conventions: **(1)** the caller supplies the id so a prefix teardown can find it — and
`custom_field_definitions.id` has exactly the same `$defaultFn(() => crypto.randomUUID())` hazard;
**(2)** the fixture is exported from a shared module, not local to one test file, because three of the
four criteria need it; **(3)** the header names the *next* phase that will reuse it.

The table it writes to:

```ts
// Source: src/db/schema/custom-fields.ts:21-33
export const customFieldDefinitions = pgTable('custom_field_definitions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityType: text('entity_type').notNull().$type<EntityType>(),
  name: text('name').notNull(),
  type: text('type').notNull().$type<FieldType>(),          // ← `type`, NOT `field_type`
  config: jsonb('config').$type<FieldConfig>(),
  required: boolean('required').notNull().default(false),
  position: numeric('position', { precision: 20, scale: 10 }).notNull().default('10000'),
  showInList: boolean('show_in_list').notNull().default(false),
  createdAt: …, updatedAt: …, deletedAt: timestamp('deleted_at'),
})

export type FormulaConfig = { expression: string; resultType?: 'text'|'number'|'date'|'boolean' }
export type FileConfig    = { maxFiles?: number; maxSize?: number }
```

And the reader the fixture must satisfy — **uncached**, so a definition inserted mid-run is picked up
on the next call:

```ts
// Source: src/lib/custom-fields.ts:22-30
export async function getActiveFieldDefinitions(entityType: EntityType) {
  return db.select().from(customFieldDefinitions)
    .where(and(eq(customFieldDefinitions.entityType, entityType),
               isNull(customFieldDefinitions.deletedAt)))
    .orderBy(customFieldDefinitions.position)
}
```

**The `dedup.db.test.ts` parity constraint this creates.** That file's `beforeAll` asserts every
touched table is **empty** before the run, and `afterAll` asserts parity:

```ts
// Source: src/lib/mutations/dedup.db.test.ts:190-198, 569-579, 612-618
/** The six tables this suite writes to, in the order they are counted and reported. */
const TOUCHED_TABLES = ["organizations","people","deals","notes","duplicate_pairs","audit_log"] as const

  // The isolated database must really be empty of the things this suite counts.
  // If it is not, the setup script did not run and the parity check below would
  // be measuring somebody else's rows.
  for (const table of TOUCHED_TABLES) {
    const n = await tableCount(table)
    expect(n, `${table} is not empty in ${TEST_DATABASE} — run scripts/dedup-db-test-setup.sh`).toBe(0)
    countsBefore.set(table, n)
  }
  …
  for (const table of TOUCHED_TABLES) {
    expect(parity[table].after,
      `${table}: row count changed from ${parity[table].before} to ${parity[table].after} — ` +
        "this suite mutated data it did not create").toBe(parity[table].before)
  }
```

Adding `"custom_field_definitions"` as the seventh entry is a **two-sided** change: the `beforeAll`
empty-assertion applies to it too, and its teardown must be a prefixed delete in `hardDeleteFixtures`.
`fixtureId()` (`:200-204`) is the id generator to reuse: `${PREFIX}${kind}-${Date.now().toString(36)}-${sequence.toString(36)}`.

---

### 12. Pure-function unit test style (for `collectFileFieldRefs`)

```ts
// Source: src/lib/trash/present.test.ts:1-36 (abridged header + the base-row builder)
/**
 * TRASH-01 — the "deleted by" presenter.
 *
 * The contract under test is a DISCRIMINATION, not a format. Two facts look the same on screen
 * if you let them: … Collapsing them into one string is RESEARCH Pitfall 4 and a repudiation risk
 * (T-37-REP2), so `notRecorded` and `unknownUser` are asserted to be distinct kinds directly, not
 * merely to render differently.
 *
 * No mocks: the module has no database and no React, which is why it can be imported from a
 * server query and a client cell alike.
 */
import { describe, it, expect } from "vitest"

import { presentDeletedBy, type DeletedByRow } from "./present"

/** One row of the exact projection the trash query selects; each test overrides one field. */
function baseRow(overrides: Partial<DeletedByRow> = {}): DeletedByRow { … }
```

Note the **relative** `./present` import (siblings in `src/lib/trash/` import relatively; the `@/`
alias is used across module boundaries), the "No mocks, and here is why the module has none" sentence,
and the single `baseRow(overrides)` builder rather than N literals.

---

## Shared Patterns

### Authentication / authorization

**Two different models in this phase, and conflating them is a named risk.**

| Surface | Mechanism | Analog |
|---|---|---|
| `/api/v1/{four}` POST | `withApiAuth(request, async (req, context) => …)`, identity at `context.userId` | `organizations/route.ts:71-72` |
| `/api/files/...` GET+DELETE | `const session = await auth(); if (!session?.user) return 401` | `files/…/route.ts:38-42` — **unchanged by decision. Do not invent a `withApiAuth` twin.** |

**Apply to:** all four POST handlers (unchanged) and the file route (the 401 stays; a 404 ownership
gate is added after it).

```ts
// Source: src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:38-44 and :99-105 — BYTE-IDENTICAL
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entityId, fieldName, filename } = await params
  // ← and then NOTHING. No record read, no ownership term, no containment. Same in DELETE.
```

### Error handling / 404-for-foreign

**Apply to:** the file route's `GET` and `DELETE`, and any new resolver.
**Source:** `src/app/api/v1/organizations/[id]/route.ts:31-52` (§ 1 above). Predicate inside the
query; a foreign record and a missing record are the same answer.

### Post-commit best-effort

**Apply to:** `dedup.ts` (DATA-01) and all four purge mutations (SC-2).
**Source:** `src/lib/mutations/dedup.ts:627-651` (§ 3 above). Numbered comment → `try` → single
`log.error(<literal>, <sentence>, { err: error })` → never rethrow.

### Log content and scope

**Apply to:** every new `log.*` call in this phase.
**Sources:** `prune.ts:203-218` (identifiers and counts only, never content — T-37-30);
`db-errors.ts:139-153` (the scope is a **quoted literal inside the parenthesis**, gated by
`src/lib/log-scope-format.test.ts`).

### Collapsed-predicate guard

**Apply to:** any new ownership predicate.
**Sources:** `stage-scope.ts:135-156` (the guard), `crm.ts:416-420` and `matcher.ts:250-258` (the two
existing call sites). § 8 above.

### Exhaustive four-entity mapping

**Apply to:** the `entityId` resolver, and any new per-entity table.
**Sources:** `dispatch.ts:55-90` (`satisfies` reasoning, verified both directions),
`prune.ts:99-114` (the drizzle-column variant).

### db-test fixture discipline

**Apply to:** all four new `*.db.test.ts` files.
**Sources:** `activities-scope.db.test.ts` (whole file — guard, prefix, `TOUCHED_TABLES`,
`LEFTOVER_PREDICATE`, clean-then-measure, floor/ceiling/discriminator/cross-check, direct-SQL truth),
`crm-ownership.db.test.ts:348-395` (restore-helper hazard),
`trigger-owner-scope.db.test.ts:786-820` (barrier hazard),
`import-owner-scope.db.test.ts:69-81` (session-auth variant).

---

## No Analog Found

| File | Role | Data flow | Reason |
|---|---|---|---|
| `deleteEntityFiles` (the deletion side of `src/lib/trash/`) | utility | file-I/O | **No storage abstraction module exists anywhere in `src/`.** `[VERIFIED: grep UPLOAD_DIR / FILE_STORAGE / S3_BUCKET across src/]` The only two consumers are `api/upload/route.ts` and `api/files/…/route.ts`, both inlining `fs`/S3 with module-level `process.env` reads (§ 7). A plan writing this file is establishing a first, not following one — and `compose-uploads-persistence.test.ts:399-404` constrains how far the extraction may go. Use RESEARCH's `## Code Examples` for the signature and the two inlined call sites above for the idiom. |
| a `custom_field_definitions` fixture helper | test fixture | CRUD | No test in the tree creates a definition row. `api-key-fixture.ts` is the closest and it is the *convention* analog (shared module, caller-supplied id, exported for the next phase) but not a shape analog. § 11. |
| a `type='formula'` or `type='file'` behavioural subject | — | — | **0 live rows of each** (measured 2026-08-26). Not a file, but the reason three of four criteria have no analog *data*: there is nothing in the tree or the database that exercises these code paths, so the proofs manufacture their own subjects. Re-measure at plan time (`49-VALIDATION.md` § Preconditions). |

---

## Anti-Patterns — the wrong analog is nearer than the right one

| If a plan copies… | …it has copied | Right source |
|---|---|---|
| `people/[id]/route.ts:258` / `deals/[id]` / `activities/[id]` PUT re-assembly | the **in-process merge the user rejected** — 3 of 4 PUTs do this | `organizations/[id]/route.ts:121-127` |
| `dedup.ts:325-334`'s `fieldChanges` keys (`customFields.${key}`) | the **audit diff** spelling; `recalculateFormulas` would scope to nothing and write nothing | bare names / column names / `CHANGED_FIELDS_CUSTOM_SENTINEL` — RESEARCH § SC-3 |
| a survivor-rooted `cascadeToChildren` | a no-op when the survivor won every field — `dedup.ts:636-639` documents this in the block being edited | explicit `recalculateFormulas({ entityId: survivorId, cascade: false })` |
| the organizations POST shape for all four | two of four (`people`, `deals`) have **no create mutation** — § 2 | both shapes, separately |
| `PurgeResult` widened with blob counts | eleven exact `toEqual({ success: true, detached: N })` assertions | log-only, per record — `prune.ts:203-218` |
| extracting `process.env.UPLOAD_DIR` into a module | `compose-uploads-persistence.test.ts:399-404` red | keep the read in both routes (§ 7) |
| a raw-token grep gate | fifteen prose collisions in this project; the comment explaining a rule trips the rule's own gate | parsed structure (`route-authorization.test.ts` model) or behaviour |

---

## Metadata

**Analog search scope:** `src/app/api/files/`, `src/app/api/upload/`, `src/app/api/v1/{organizations,people,deals,activities}/` and their `[id]/` + `__tests__/`, `src/app/api/v1/__tests__/`, `src/app/import/`, `src/lib/api/`, `src/lib/trash/`, `src/lib/mutations/`, `src/lib/audit/`, `src/lib/execution/actions/`, `src/lib/triggers/`, `src/lib/__tests__/`, `src/components/custom-fields/`, `src/db/schema/`.

**Files read in this pass (28):**
`src/app/api/v1/organizations/route.ts` (full) · `src/app/api/v1/organizations/[id]/route.ts` (full) · `src/app/api/v1/people/route.ts:195-266` · `src/app/api/v1/people/[id]/route.ts:225-289` · `src/app/api/v1/deals/route.ts:295-356` · `src/app/api/v1/activities/route.ts:185-241` · `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` (full) · `src/app/api/upload/route.ts:50-124` · `src/lib/mutations/dedup.ts:600-709` · `src/lib/mutations/organizations.ts:545-651` · `src/lib/mutations/organizations.test.ts:575-614` · `src/lib/mutations/activities.ts:455-509` · `src/lib/mutations/dedup.db.test.ts:60-134, 185-244, 560-629` · `src/lib/trash/prune.ts:55-124, 160-219` · `src/lib/trash/dispatch.ts` (full) · `src/lib/trash/present.test.ts:1-45` · `src/lib/api/stage-scope.ts:44-157` · `src/lib/api/db-errors.ts` (full) · `src/lib/execution/actions/crm.ts:395-420` · `src/lib/execution/actions/crm-ownership.db.test.ts:300-419` · `src/lib/triggers/trigger-owner-scope.db.test.ts:780-829` · `src/lib/audit/present.ts:252-281` · `src/lib/custom-fields.ts:1-40` · `src/lib/__tests__/compose-uploads-persistence.test.ts:385-409` · `src/app/api/v1/__tests__/api-key-fixture.ts` (full) · `src/app/api/v1/activities/activities-scope.db.test.ts` (full) · `src/app/api/v1/activities/__tests__/route.test.ts:1-80, 300-359` · `src/app/api/v1/deals/__tests__/formula-recalc.test.ts:100-229, 255-374` · `src/app/import/import-owner-scope.db.test.ts:40-99` · `src/components/custom-fields/file-field.tsx:1-35, 150-174` · `src/db/schema/custom-fields.ts:1-35`

**Directory listings taken:** `src/lib/trash/`, `src/lib/api/`, `src/lib/api/__tests__/`, `src/app/api/v1/__tests__/`, `src/app/api/files/`, and every `*.db.test.ts` in the tree (8 files).

**Pattern extraction date:** 2026-08-26
**Read-only:** no source file was modified; this document is the only write.
