# Phase 39: Duplicate Detection & Merge — Pattern Map

**Mapped:** 2026-08-18
**Files analyzed:** 49 (33 new, 16 modified)
**Analogs found:** 45 / 49 (4 have no in-repo analog — see § No Analog Found)

**Project instructions:** no `./CLAUDE.md` exists. No `.claude/skills/` or `.agents/skills/`
directory exists. Confirmed this session, matching 39-RESEARCH § Project Constraints.

---

## Executive summary for the planner

Six findings that change the task breakdown, stated before the tables:

1. **`purgeOrganizationMutation` is a line-for-line template for the merge.** Everything the merge
   needs — synchronous actor capture, a pre-transaction existence read returning a discriminated
   code, explicit polymorphic-notes handling, `.returning({ id })` on every child update, per-child
   audit rows, the mutation's own audit row written with `tx`, and a sentinel-string catch — is
   already in `src/lib/mutations/organizations.ts:544-642`. Copy its shape verbatim.

2. **The background job + poll pair exists in full and both halves were read.** Server half:
   `src/lib/import/pipedrive-import-state.ts` (DB-backed CRUD over `import_sessions`) +
   `importFromPipedrive` / `getImportProgress` / `cancelPipedriveImport` in
   `src/lib/import/pipedrive-api-import-actions.ts`. Client half: `progress-step.tsx:26-46`.
   Boot reaper: `src/lib/import/import-session-cleanup.ts` + `instrumentation.ts`. **Highly
   reusable** — `dedup_scans` is `import_sessions` with a different name and a narrower JSONB.
   One caveat the planner must budget: `createImportState` refuses when ANY `running` session
   exists globally; the dedup equivalent must scope that guard to `entityType`, not globally.

3. **A1 is RESOLVED, and research's proposed call signature is WRONG.** In the installed
   `drizzle-orm@0.45.1`, the Postgres builder is
   `generatedAlwaysAs(as: SQL | T['data'] | (() => SQL))` —
   **one argument, no options object** (`node_modules/drizzle-orm/pg-core/columns/common.d.ts:49`).
   The `{ mode: "stored" }` form exists only on MySQL (`mysql-core/columns/common.d.ts:33`).
   Postgres has no VIRTUAL generated columns, so drizzle omits the parameter. `.generatedAlwaysAs(sql\`…\`, { mode: "stored" })` **will not typecheck.**
   Separately, GIN + opclass IS supported: `IndexBuilderOn.using(method, …columns)` accepts
   `'gin'` (`pg-core/indexes.d.ts:55`) and `ExtraConfigColumn.op(opClass)` exists
   (`pg-core/columns/common.d.ts:103`), with `PgIndexOpClass` widened by `(string & {})` so
   `'gin_trgm_ops'` is accepted.

4. **No in-repo analog exists for `CREATE EXTENSION`, a generated column, or a GIN index.**
   Zero occurrences across all 16 `drizzle/*.sql` files and all 27 schema files. This is
   genuinely new ground. The nearest precedents are structural only (partial index DDL in
   `notes.ts:36-44`, hand-added non-DDL statements in `0014`/`0015`).

5. **NO test in this repository talks to a real database. Confirmed exhaustively.** Zero files
   under `src/` import `postgres` or `drizzle-orm/postgres-js` in a test; there is no vitest
   `setupFiles`, no test DB URL, no global setup. `vitest.config.ts` and `vitest.rsc.config.ts`
   both declare `environment: 'node'` and nothing else. The repo's own substitute is
   `scripts/*.sql` run by hand through `psql` — `scripts/trash-checks.sql` (667 lines) is the
   fully-developed precedent and its header states the exact reason Phase 39 faces
   ("a mocked `db.delete` cannot raise SQLSTATE 23503"). **The plan must either establish a
   real-DB vitest path from scratch (no analog to copy) or ship `scripts/dedup-checks.sql`
   (strong analog, ready to copy).**

6. **The admin double gate is confirmed and asymmetric.** `src/middleware.ts` is a bare
   `NextAuth(authConfig).auth` export whose matcher covers everything except `/api` and
   Next internals — it establishes a session but does **not** check roles. The role check lives
   entirely in `src/app/admin/layout.tsx:11-17`. A `/duplicates` route outside `/admin` therefore
   needs its **own** layout doing the same two redirects, plus per-action re-checks
   (`src/app/admin/audit/actions.ts:26-29` is the exact idiom, and its comment explains why
   the layout is not enough).

---

## File Classification

### New files

| New file | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/db/schema/duplicate-pairs.ts` | model | CRUD | `src/db/schema/notes.ts` | exact |
| `src/db/schema/dedup-scans.ts` | model | job state | `src/db/schema/import-sessions.ts` | exact |
| `drizzle/00NN_dedup.sql` | migration | DDL + DML | `drizzle/0014_sloppy_slapstick.sql` (hand-added non-DDL) | partial |
| `src/lib/dedup/normalize.ts` (+ test) | utility (pure) | transform | `src/lib/import/fuzzy-match.ts` `normalize()` | role-match |
| `src/lib/dedup/scoring.ts` (+ test) | utility (pure) | transform | `src/lib/trash/entity-types.ts` (frozen literals + parsers) | role-match |
| `src/lib/dedup/merge-defaults.ts` (+ test) | utility (pure) | transform | `src/lib/audit/present.ts` `describeField` | role-match |
| `src/lib/dedup/field-groups.ts` (+ test) | utility (pure) | transform | `src/lib/audit/present.ts` `buildAuditFieldChanges` | exact |
| `src/lib/dedup/scan-state.ts` | service | job state CRUD | `src/lib/import/pipedrive-import-state.ts` | **exact** |
| `src/lib/dedup/scan-cleanup.ts` | service | batch | `src/lib/import/import-session-cleanup.ts` | **exact** |
| `src/lib/dedup/queries.ts` | service | read/paging | `src/lib/trash/queries.ts` | **exact** |
| `src/lib/dedup/identity-settings.ts` | service | CRUD (settings) | `src/lib/trash/settings.ts` | **exact** |
| `src/lib/mutations/dedup.ts` | mutation | transactional multi-child | `src/lib/mutations/organizations.ts:544-642` | **exact** |
| `src/lib/mutations/dedup.test.ts` (real DB) | test | integration | **none** | ✖ |
| `scripts/dedup-checks.sql` | test (SQL) | verification | `scripts/trash-checks.sql` | **exact** |
| `src/app/duplicates/layout.tsx` | route gate | request-response | `src/app/admin/layout.tsx` | **exact** |
| `src/app/duplicates/page.tsx` | route (RSC) | request-response | `src/app/trash/page.tsx` | **exact** |
| `src/app/duplicates/actions.ts` | controller | request-response | `src/app/trash/actions.ts` | **exact** |
| `src/app/duplicates/duplicates-tabs.tsx` | component | event-driven | `src/app/trash/trash-tabs.tsx` | **exact** |
| `src/app/duplicates/scan-panel.tsx` | component | polling | `.../pipedrive-api/steps/progress-step.tsx:25-46` (loop only) | exact (loop) / none (presentation) |
| `src/app/duplicates/pair-card.tsx` | component | event-driven | `src/app/trash/trash-table.tsx` (row actions/toasts) | role-match |
| `src/app/duplicates/[pairId]/page.tsx` | route (RSC) | request-response | `src/app/trash/page.tsx` | role-match |
| `src/app/duplicates/[pairId]/merge-form.tsx` | component | request-response | `src/app/admin/audit/retention-form.tsx` | role-match |
| `src/components/dedup/duplicate-warning.tsx` | component | render-only | `src/components/timeline/audit-entry.tsx` (Alert/link idiom) | partial |
| `src/components/dedup/import-duplicate-notice.tsx` | component | render-only | `src/components/ui/alert.tsx` callers | partial |
| `src/components/ui/radio-group.tsx` | component (vendored) | render-only | `src/components/ui/checkbox.tsx` | **exact** |
| `src/components/ui/progress-bar.tsx` | component | render-only | `src/components/import/progress-bar.tsx` | **exact (lift)** |
| `e2e/merge-screen-320.spec.ts` | test (e2e) | request-response | `e2e/viewport-320.spec.ts` | exact |
| 4 × `*-wiring.test.ts` source gates | test | file I/O | `src/components/custom-fields/__tests__/source-scan.ts` consumers | exact |

### Modified files

| Modified file | Role | What changes | Pattern source |
|---|---|---|---|
| `src/db/schema/organizations.ts` | model | `normName` generated col + 2 indexes | `src/db/schema/notes.ts:36-44` (partial index form) |
| `src/db/schema/people.ts` | model | same | same |
| `src/db/schema/index.ts` | config | 2 barrel exports | existing file |
| `src/db/schema/audit-log.ts:23` | model | `AuditAction` += `'merged'` | B3 site 1 of 4 |
| `src/lib/timeline/types.ts:105` | model | `AuditAction` += `'merged'` | B3 site 2 of 4 |
| `src/lib/audit/linked-records.ts:40` | utility | `ACTION_RANK` exhaustive map | B3 site 3 of 4 |
| `src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx:54` | component | `ACTION_BADGE_VARIANT` exhaustive map | B3 site 4 of 4 |
| `src/components/timeline/audit-entry.tsx` | component | A-2/A-5/A-6/A-7 | its own current shape (read below) |
| `src/app/organizations/actions.ts` | controller | create-time certain check | its own `createOrganization` |
| `src/app/people/actions.ts` | controller | same | same |
| `src/app/organizations/organization-dialog.tsx` | component | W-1/W-2/W-4 | its own `onSubmit` |
| `src/app/people/person-dialog.tsx` | component | same | same |
| `src/app/organizations/data-table.tsx:303` | component | L-10/R-5 toolbar wrap | its own toolbar |
| `src/app/people/data-table.tsx` | component | same | same |
| `src/app/import/steps/confirm-step.tsx` | component | one `<ImportDuplicateNotice>` line | — |
| `src/app/admin/import/pipedrive-api/steps/progress-step.tsx` | component | one `<ImportDuplicateNotice>` line | — |
| `src/components/import/progress-bar.tsx` | component | becomes thin wrapper | its own current body |
| `instrumentation.ts` | config | register the dedup reaper | its own `cleanupStaleImportSessions` line |
| `src/messages/{en-US,pt-BR,es-ES}.json` | config | 69 `dedup.*` + 4 `audit.*` | existing namespaces |
| `src/messages/locale-parity.test.ts` | test | `REQUIRED_DEDUP_KEYS` exact-set | `REQUIRED_BULK_KEYS` |
| `e2e/viewport-320.spec.ts` | test (e2e) | 7th route | its own `CATALOG` table |

---

## Pattern Assignments

### 1. `src/lib/mutations/dedup.ts` (mutation, transactional multi-child)

**Analog:** `src/lib/mutations/organizations.ts` — `purgeOrganizationMutation`, lines **544-642**.
This is the single highest-value analog in the phase. Read it in full before writing anything.

**Imports pattern** (`organizations.ts:1-16`) — note `db` AND the tables come from barrels, and the
actor helpers come from `@/lib/audit/actor-context`:

```ts
import { db } from "@/db"
import { organizations, deals, people, notes, auditLog } from "@/db/schema"
import type { EntityType, CustomFieldDefinition } from "@/db/schema"
import { eq, and, isNull, isNotNull } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import { getCurrentActor } from "@/lib/audit/actor-context"
import type { AuditActor } from "@/lib/audit/actor-context"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  recalculateFormulas,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  CHANGED_FIELDS_CUSTOM_SENTINEL,
} from "@/lib/formula-recalc"
```

**Module-level entity constant** (`organizations.ts:43`, `people.ts:47`):

```ts
const ENTITY: EntityType = "organization"   // people.ts:47 → "person"
```

**Actor helper — the exact 6 lines to copy or extract** (`organizations.ts:176-183`, duplicated
verbatim at `people.ts:172`). Its doc comment (lines 164-175) states the rule the merge inherits:
*"NEVER borrow a user id from a payload — that field describes the record being written, not the
identity that wrote it."*

```ts
function auditActorColumns(actor: AuditActor | undefined) {
  return {
    actorKind: actor?.kind ?? "system",
    actorUserId: actor?.userId ?? null,
    workflowRunId: actor?.workflowRunId ?? null,
    importSessionId: actor?.importSessionId ?? null,
  }
}
```

> **Planner decision required (research § Pattern):** third copy vs. shared extraction. The repo
> already tolerates the duplication across two files. Decide and state it; do not leave it to the
> executor.

**Core transactional pattern** (`organizations.ts:544-642`, condensed with its own comments kept
because they are the design record):

```ts
export async function purgeOrganizationMutation(
  id: string,
): Promise<{ success: true; detached: number } | { success: false; error: string }> {
  // Captured synchronously at entry, BEFORE the transaction promise exists.
  const actor = getCurrentActor()

  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), isNotNull(organizations.deletedAt)),
  })

  if (!organization) {
    return { success: false, error: "NOT_IN_TRASH" }     // discriminated CODE, never prose
  }

  try {
    const detached = await db.transaction(async (tx) => {
      // 1. Notes are polymorphic with NO foreign key, so nothing in the database enforces this
      //    and the rows would dangle forever.
      await tx
        .delete(notes)
        .where(and(eq(notes.entityType, ENTITY), eq(notes.entityId, id)))

      // 2. `.returning()` because each unlink needs its own audit row.
      const detachedDeals = await tx
        .update(deals)
        .set({ organizationId: null, updatedAt: new Date() })
        .where(eq(deals.organizationId, id))
        .returning({ id: deals.id })

      // 3. The second child table.
      const detachedPeople = await tx
        .update(people)
        .set({ organizationId: null, updatedAt: new Date() })
        .where(eq(people.organizationId, id))
        .returning({ id: people.id })

      // 4. One row per detached child, per kind. An insert is skipped entirely when empty.
      if (detachedDeals.length > 0) {
        await tx.insert(auditLog).values(
          detachedDeals.map((deal) => ({
            entityType: "deal" as EntityType,
            entityId: deal.id,
            action: "updated" as const,
            changes: { organizationId: { from: id, to: null } },
            ...auditActorColumns(actor),
          }))
        )
      }
      // …identical block for detachedPeople…

      // 5. The row itself, with the eligibility predicate carried on the statement.
      await tx
        .delete(organizations)
        .where(and(eq(organizations.id, id), isNotNull(organizations.deletedAt)))

      // 6. The purge's own audit row, INSIDE the transaction so a rollback cannot leave a record
      //    of a purge that did not happen.
      await tx.insert(auditLog).values({
        entityType: ENTITY,
        entityId: id,
        action: "deleted",
        changes: PURGE_MARKER,
        ...auditActorColumns(actor),
      })

      return detachedDeals.length + detachedPeople.length
    })

    return { success: true, detached }
  } catch (error) {
    console.error("Failed to purge organization:", error)
    return { success: false, error: "Failed to purge organization" }   // fixed sentinel — V7
  }
}
```

**Six load-bearing properties to carry across, in order:**

| # | Property | Line | Why the merge needs it |
|---|---|---|---|
| 1 | `const actor = getCurrentActor()` **before** any promise | 548 | ALS context; a merge under `runWithActor` gets a real actor |
| 2 | Existence read **outside** the transaction, returning a **code** | 550-557 | M-8's "one record already gone" needs a code, not prose |
| 3 | Polymorphic notes handled explicitly, with the "nothing enforces this" comment | 561-564 | B4 lives exactly here |
| 4 | `.returning({ id })` on every child UPDATE | 578, 589 | per-child audit rows AND the post-commit recalc loop |
| 5 | `tx.insert(auditLog)`, never `db.insert` | 596, 608, 625 | Pitfall 7 |
| 6 | `catch` returns a **fixed sentinel string**, logs the real error | 638-641 | a 23505 message leaks the index name |

**The `changes` marker precedent** (`organizations.ts:186-193`) — this is the shape research's
`__merged` key should follow, and its comment is the origin of B3:

```ts
/**
 * How a purge is distinguished from a soft delete in `audit_log`.
 *
 * `action` stays `"deleted"` deliberately. A fourth `AuditAction` literal would be a four-file
 * compile cascade: the type is declared TWICE (`db/schema/audit-log.ts` and
 * `lib/timeline/types.ts`) and consumed by two exhaustive `Record<AuditAction, …>` maps.
 */
const PURGE_MARKER = { __purge: { from: null, to: true } } as const
```

**ANTI-PATTERN — do NOT reuse this for the loser** (`organizations.ts:409-446`). Both defects are
visible in the excerpt: the `UPDATE` runs on module-level `db` with no transaction, and the bus
emit happens unconditionally:

```ts
export async function deleteOrganizationMutation(id: string, userId: string) {
  const organization = await db.query.organizations.findFirst({ … })
  if (!organization) return { success: false, error: "Organization not found" }
  try {
    await db                                    // ← NOT `tx`. Outside any transaction.
      .update(organizations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(organizations.id, id))
    crmBus.emit("organization.deleted", buildEventPayload(…))   // ← fires even if a later step fails
    return { success: true }
  } catch (error) { … }
}
```

The merge's step 5 must be an inline `tx.update(organizations).set({ deletedAt: new Date(), … })
.where(and(eq(organizations.id, loserId), isNull(organizations.deletedAt)))`, and the
`crmBus.emit` must be moved **after** the `await db.transaction(...)` resolves.

**The best-effort post-commit wrapper** — the exact idiom already used for recalculation and for a
non-critical audit write (`organizations.ts:499-520`, inside `restoreOrganizationMutation`):

```ts
try {
  await recalculateFormulas({ entityType: ENTITY, entityId: id, changedFields: […] })
} catch (error) {
  // D-05: formula machinery never blocks a user's write, and the restore has already landed.
  console.error("[formula-recalc] organization restore recalculation failed:", error)
}
```

---

### 2. `src/lib/dedup/scan-state.ts` + `src/db/schema/dedup-scans.ts` (service + model, job state)

**Analogs:** `src/db/schema/import-sessions.ts` (whole file, 18 lines) and
`src/lib/import/pipedrive-import-state.ts` (whole file).

**Table shape — copy 1:1** (`src/db/schema/import-sessions.ts`, complete):

```ts
import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core"
import { users } from "./users"

export type ImportSessionStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error'

export const importSessions = pgTable("import_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id),
  status: text("status").notNull().$type<ImportSessionStatus>().default("idle"),
  progress: jsonb("progress").notNull().default({}),
  cancelled: boolean("cancelled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export type ImportSession = typeof importSessions.$inferSelect
export type NewImportSession = typeof importSessions.$inferInsert
```

Maps onto the UI-SPEC exactly: `status` → P-4's four renderings, `progress` JSONB → P-1's
`{current,total}`, `cancelled` → P-4's cancel, `userId` → P-6's `dedup.scan.startedBy` and the
"a non-starter sees no cancel button" rule. **Add one column research's design needs and
`import_sessions` lacks: `entityType`** (`'organization' | 'person'`), because the scan is scoped
per entity type and P-7 disables the CTA per type.

**State-module API — the exported surface to mirror** (`pipedrive-import-state.ts`):
`createImportState`, `getImportState`, `updateImportState`, `cancelImport`,
`isImportCancelled`, `calculateProgress`, `incrementImportedCount`, `addImportError`.

**The JSONB read-merge-write idiom** (`pipedrive-import-state.ts`, `updateImportState`):

```ts
export async function updateImportState(importId: string, updates: Partial<ImportProgressState>) {
  const session = await db.query.importSessions.findFirst({ where: eq(importSessions.id, importId) })
  if (!session) return

  const currentProgress = (session.progress ?? DEFAULT_PROGRESS) as ImportProgressData

  const newProgress: ImportProgressData = {
    ...currentProgress,
    ...(updates.completedEntities !== undefined && { completedEntities: updates.completedEntities }),
    ...(updates.totalEntities !== undefined && { totalEntities: updates.totalEntities }),
    ...(updates.errors && { errors: updates.errors.slice(0, 50).map(e => ({ … })) }),
  }

  await db.update(importSessions)
    .set({ ...(updates.status && { status: updates.status }), progress: newProgress, updatedAt: new Date() })
    .where(eq(importSessions.id, importId))
}
```

**The concurrency guard — MUST be adapted, not copied** (`createImportState`):

```ts
// Check for existing running session
const existing = await db.query.importSessions.findFirst({
  where: eq(importSessions.status, 'running'),      // ← GLOBAL. No entity-type scope.
})
if (existing) {
  throw new Error("An import is already in progress")
}
```

For dedup this must become
`where: and(eq(dedupScans.status, 'running'), eq(dedupScans.entityType, entityType))` — a global
guard would let one running organization scan block a people scan, contradicting P-7 (which
disables the CTA "of that entity type").

**Boot reaper — copy whole** (`src/lib/import/import-session-cleanup.ts`, complete file):

```ts
export async function cleanupStaleImportSessions(): Promise<void> {
  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // 1. Mark running sessions as error (crash recovery)
    const staleRunning = await db.update(importSessions)
      .set({ status: "error", updatedAt: now })
      .where(eq(importSessions.status, "running"))
      .returning({ id: importSessions.id })

    // 2. Delete idle sessions older than 1 hour
    const staleIdle = await db.delete(importSessions)
      .where(and(eq(importSessions.status, "idle"), lt(importSessions.createdAt, oneHourAgo)))
      .returning({ id: importSessions.id })

    // 3. Delete sessions older than 30 days
    const old = await db.delete(importSessions)
      .where(lt(importSessions.createdAt, thirtyDaysAgo))
      .returning({ id: importSessions.id })

    const total = staleRunning.length + staleIdle.length + old.length
    if (total > 0) console.log(`Cleaned up ${total} stale import sessions`)
  } catch (error) {
    console.error("[import-cleanup] Failed to clean up stale sessions:", error)
  }
}
```

**Registration site** (`instrumentation.ts`, and the comment at its foot is the verification rule):

```ts
const { cleanupStaleImportSessions } = await import("@/lib/import/import-session-cleanup")
await cleanupStaleImportSessions()
```

> `instrumentation.ts` closes with a verbatim warning that registration **is not evidence of
> execution** (`Dockerfile:24` ends in `2>/dev/null || true`; that silently killed four processors
> on 2026-08-08). Note the existing reaper logs only on `total > 0` and prints **no** startup line
> — so the dedup reaper needs an unconditional `console.log("[dedup-scan-cleanup] …")` if a
> behavioural log gate is going to work at all. State that in the task.

---

### 3. Server half of the job: launch, progress, cancel (controller, request-response)

**Analog:** `src/lib/import/pipedrive-api-import-actions.ts` — `"use server"` at line 1.

**Fire-and-forget launch, server side** (`importFromPipedrive`, lines 296-330). Note the ordering:
`auth()` → early return → `runWithActor` wraps the **entire** run → state row created **inside**:

```ts
export async function importFromPipedrive(apiKey, config, importId, preloadedCounts?) {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }
  const importingUserId = session.user.id

  return await runWithActor(
    { kind: "import", userId: importingUserId, importSessionId: importId },
    async () => {
      try {
        await createImportState(importId, importingUserId)
      } catch (error) {
        if (error instanceof Error && error.message === "An import is already in progress") {
          return { success: false, error: "An import is already in progress" }
        }
        throw error
      }
      await updateImportState(importId, { status: 'running' })
      …
    })
}
```

For the scan use `{ kind: "user", userId }` (the `import` kind and `importSessionId` are specific
to the importer's FK into `import_sessions`).

**Progress + cancel readers** (lines 1147-1181) — both are minimal and both re-check auth:

```ts
export async function cancelPipedriveImport(importId: string) {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Not authenticated" }
  const state = await getImportState(importId)
  if (!state) return { success: false, error: "Import session not found" }
  await cancelImport(importId)
  return { success: true }
}

export async function getImportProgress(importId: string) {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Not authenticated" }
  const state = await getImportState(importId)
  return { success: true, state: state ?? null }
}
```

**Gap the dedup version must close (P-6):** `cancelPipedriveImport` checks authentication only —
it never compares `state.userId` to the caller. `cancelScan` must add
`if (scan.userId !== session.user.id) return { success:false, code:"NOT_STARTER" }`, because P-6
forbids one user cancelling another's scan.

**Client launch — fire and forget, do NOT await**
(`src/app/admin/import/pipedrive-api/pipedrive-api-wizard.tsx`, `handleStartImport`):

```ts
const handleStartImport = useCallback(() => {
  // Generate ID for tracking - state is created by server action
  const id = crypto.randomUUID()
  setImportId(id)
  // Fire-and-forget: do NOT await. The server action runs independently
  // and creates its own state. Switch to progress step immediately so
  // ProgressStep can start polling.
  importFromPipedrive(apiKey, config, id, counts ?? undefined)
  setStep("progress")
}, [apiKey, selectedEntities, counts])
```

---

### 4. `src/app/duplicates/scan-panel.tsx` (component, polling)

**Analog:** `src/app/admin/import/pipedrive-api/steps/progress-step.tsx` — **lines 25-46 ONLY.**
UI-SPEC K-2/P-3 forbid copying its presentation (it uses `text-green-600`, `text-orange-500` and
11 hardcoded English literals; both are visible in lines 85-110 of that file).

**The loop to copy verbatim in shape** (`progress-step.tsx:25-46`):

```tsx
// Poll for progress updates
useEffect(() => {
  let mounted = true

  const pollProgress = async () => {
    const result = await getImportProgress(importId)
    if (mounted && result.success && result.state) {
      setState(result.state)          // ← setState is inside the async callback, NOT the effect body
    }
  }

  // Initial fetch
  pollProgress()

  // Set up polling interval
  const pollInterval = setInterval(pollProgress, 1000)

  return () => {
    mounted = false
    clearInterval(pollInterval)
  }
}, [importId])
```

That placement is what satisfies K-7 (`react-hooks/set-state-in-effect` is an ERROR).

**Two defects in the analog that P-3 requires fixing, not copying:**

```tsx
// progress-step.tsx:48-53 — a dead effect. It has an empty body and never stops the interval.
useEffect(() => {
  if (state?.status === "completed" || state?.status === "cancelled" || state?.status === "error") {
    // Import finished, no need to poll anymore
  }
}, [state?.status])
```

P-3 requires the scan panel to genuinely stop polling on `completed | failed | cancelled` — e.g.
`clearInterval` from inside `pollProgress` once a terminal status arrives, or a `status` guard in
the effect dependency that tears the interval down. Do not replicate the no-op.

Second: `progress-step.tsx:63-67` renders a hardcoded `"Initializing import..."` in the null state.
The dedup panel's equivalent must come from the catalog.

---

### 5. `src/components/ui/progress-bar.tsx` (component, render-only) — the P-2 lift

**Analog / source:** `src/components/import/progress-bar.tsx`, complete file. Everything below the
`PHASE_LABELS` map is the presentational half to lift; `PHASE_LABELS` and the `ImportProgress`
prop type stay behind in the wrapper.

```tsx
export function ProgressBar({ progress }: ProgressBarProps) {
  const format = useFormatter()
  const label = PHASE_LABELS[progress.phase] ?? progress.phase

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{progress.percentage}%</span>
      </div>
      <div className="bg-muted h-2.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      {progress.total > 0 && (
        <p className="text-muted-foreground text-xs">
          {format.number(progress.current)} / {format.number(progress.total)}
        </p>
      )}
    </div>
  )
}
```

New signature per P-2: `{ label: string; percentage: number; current: number; total: number }`;
the caller supplies an already-translated `label`. The wrapper keeps
`({ progress }: { progress: ImportProgress })` so V-5's zero-line-diff assertion on both call
sites holds.

---

### 6. `src/lib/dedup/identity-settings.ts` (service, CRUD) — the admin-configurable identity key

**Analog:** `src/lib/trash/settings.ts` (which is itself a documented copy of
`src/lib/audit/settings.ts`). This is the **third** `app_settings` key; the pattern is settled.

**Table** (`src/db/schema/app-settings.ts`, complete):

```ts
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  // JSONB rather than text so a later setting can hold an object or an array without a
  // migration. `unknown` forces every read path to narrow and validate before use.
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

The `$type<unknown>()` choice is exactly what Phase 39 needs: the org identity key is an
**array of custom-field names checked in order**, and `jsonb` + `unknown` holds it with no
migration and forces validation.

**Module shape to copy** (`src/lib/trash/settings.ts`): an exported `*_KEY` constant, a private
`zod` schema, a fail-closed `read*`, a `Write*Result` discriminated type, and a `write*` that
validates **before** touching the database.

```ts
/** The settings key this phase owns. Seeded by migration 0015 (37-01). */
export const TRASH_RETENTION_KEY = "trash.retention_days"

const retentionSchema = z.number().int().min(RETENTION_MIN).max(RETENTION_MAX)

export async function readTrashRetentionDays(): Promise<number | null> {
  try {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, TRASH_RETENTION_KEY),
    })
    if (!row) return null

    const parsed = retentionSchema.safeParse(row.value)
    if (!parsed.success) {
      // Identifiers and bounds only — never the stored value itself (T-37-09).
      console.warn(`[trash-settings] ${TRASH_RETENTION_KEY} is not an integer in […] — disabled until corrected`)
      return null
    }
    return parsed.data
  } catch (error) {
    console.error("[trash-settings] Failed to read the retention setting:", error)
    return null
  }
}

export type WriteTrashRetentionResult = { success: true } | { success: false; error: string }

export async function writeTrashRetentionDays(days: number): Promise<WriteTrashRetentionResult> {
  const parsed = retentionSchema.safeParse(days)
  if (!parsed.success) {
    return { success: false, error: `Retention must be a whole number of days between … .` }
  }
  const value = parsed.data
  try {
    const updatedAt = new Date()
    await db.insert(appSettings)
      .values({ key: TRASH_RETENTION_KEY, value, updatedAt })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt } })
    return { success: true }
  } catch (error) {
    console.error("[trash-settings] Failed to write the retention setting:", error)
    return { success: false, error: "Failed to save the retention setting." }
  }
}
```

**The "default in data, fail closed in code" doctrine applies directly to B1's graceful
degradation.** Both settings modules carry the same block of prose; the dedup version reads: an
UNSET identity key returns `null`, and `null` means **organizations have no *certain* tier and no
create-time warning** — never "fall back to name-only", which B1 measured at 1,030,436 pairs.
Unlike audit/trash, Phase 39 should **NOT** seed a default row (there is no deployment-neutral
custom-field name to seed), so this key is the first `app_settings` key that is intentionally
absent on a fresh install. State that divergence explicitly in the module comment — otherwise a
reader will look for the missing seed migration.

**Admin write action** (`src/app/admin/audit/actions.ts`, complete, 40 lines). Its header comment
is the authoritative statement of why a layout gate is not enough:

```ts
"use server"
/**
 * AUTHORIZATION (T-36-30)
 * `src/app/admin/layout.tsx` redirects a non-admin away from every `/admin/*` PAGE
 * RENDER. It does not — and cannot — protect a server action, which is a POST endpoint
 * the browser can invoke directly with no page involved. So the role is re-checked here.
 * The disabled Save button in `retention-form.tsx` is cosmetic and is never the control.
 */
export async function saveRetention(days: number): Promise<WriteRetentionResult> {
  const session = await auth()
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }
  const result = await writeRetentionDays(days)
  if (result.success) revalidatePath("/admin/audit")
  return result
}
```

**Admin settings form** (`src/app/admin/audit/retention-form.tsx`, 8.7 KB) is the client analog:
`"use client"`, `useState` + `useTransition`, controlled `AlertDialog` with **no trigger
component**, typed value retained on failure, `toast` on both branches, and the note that
`RETENTION_MIN`/`MAX` are **not imported** because `settings.ts` imports the database and would
drag a server-only module into the browser bundle. That last constraint applies to the dedup
identity form too.

---

### 7. `src/app/duplicates/layout.tsx` (route gate, request-response)

**Analog:** `src/app/admin/layout.tsx` — lines 11-17 are the whole gate.

```tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session) {
    redirect("/login?callbackUrl=/admin")
  }

  if (session.user.role !== "admin") {
    redirect("/?error=unauthorized")
  }
  …
}
```

**The other half of the "double gate" is thinner than the phrase implies.** `src/middleware.ts` is
the complete file below — it establishes the session for every non-API route but performs **no
role check at all**:

```ts
import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

export const { auth: middleware } = NextAuth(authConfig)
export default middleware

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
```

So `/duplicates` already receives the middleware half for free (the matcher is path-agnostic).
**All the role enforcement must be written by this phase**, in three places:
`src/app/duplicates/layout.tsx` (covers both `page.tsx` files), plus an explicit re-check inside
**every** function in `src/app/duplicates/actions.ts`. `src/app/trash/actions.ts`'s header states
the same rule for the same reason and its `TrashErrorCode` union already includes `NOT_ADMIN`.

---

### 8. `src/app/duplicates/page.tsx` + `duplicates-tabs.tsx` (RSC + client tabs)

**Analog:** `src/app/trash/page.tsx` and `src/app/trash/trash-tabs.tsx` — the UI-SPEC's L-1/L-2
name these explicitly and they match rule-for-rule.

**RSC shape** (`src/app/trash/page.tsx`):

```tsx
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>
}) {
  const params = await searchParams

  // THE INPUT-VALIDATION CONTROL (T-37-03). No raw search-param value may reach a query.
  const tab = parseTrashTab(params.type)
  const page = parseTrashPage(params.page)

  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const viewer = { userId: session.user.id, role: session.user.role }
  const isAdmin = session.user.role === "admin"   // VISIBILITY ONLY, never the authorization

  // Three independent reads, none of which throws — every one fails closed inside its own module
  const [counts, list, retentionDays] = await Promise.all([
    countTrashed(viewer), listTrashed(tab, page, viewer), readTrashRetentionDays(),
  ])

  const t = await getTranslations("trash")

  return (
    <div className="container py-8">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg"><Trash2 className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground">{t("description")}</p>
          </div>
        </div>
        <TrashTabs tab={tab} counts={counts}>
          <Card><CardContent>{list.ok ? <TrashTable … /> : <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">{t("error.unavailable")}</div>}</CardContent></Card>
        </TrashTabs>
      </div>
    </div>
  )
}
```

The `<h1 className="text-3xl font-bold">` inside `container py-8` is the exact shell UI-SPEC
§ Typography requires, and it is what `e2e/viewport-320.spec.ts` locates by role.

**The `{ ok: false }` vs. empty-success distinction** is directly reusable for the scan's `failed`
state (P-4): *"`listTrashed` returns `{ ok: false }` and never an empty success, precisely so this
panel is distinguishable from 'nothing in trash'."*

**Tabs — URL-controlled, manual activation** (`src/app/trash/trash-tabs.tsx`):

```tsx
"use client"
function handleTabChange(value: string) {
  const sp = new URLSearchParams(window.location.search)
  sp.set("type", value)
  sp.delete("page")                    // switching tabs DELETES page
  router.push(`/trash?${sp.toString()}`)
}

<Tabs value={tab} onValueChange={handleTabChange} activationMode="manual">
  <TabsList className="max-w-full overflow-x-auto">     {/* R-7's precedent, trash-tabs.tsx:97 */}
    {TRASH_TABS.map((value) => (
      <TabsTrigger key={value} value={value} className="gap-2">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {tNav(value)}                                   {/* reuses nav.* keys, per UI-SPEC */}
        {counts === null ? null : <span className="text-muted-foreground text-xs">({counts[value]})</span>}
      </TabsTrigger>
    ))}
  </TabsList>
```

`activationMode="manual"` is load-bearing, not stylistic — Radix selects on focus by default and
each selection is a `router.push`. `counts === null` renders **no** count rather than a zero.

**Paging** (`src/lib/trash/queries.ts`): `export const TRASH_PAGE_SIZE = 50`; the list returns
`{ ok: true; rows; hasMore }` by fetching `PAGE_SIZE + 1` and trimming. UI-SPEC L-9 sets the dedup
page size to **25**, so the constant changes but the mechanism does not.

**Scope-composition helper worth copying** (`src/lib/trash/queries.ts`, `trashScope`): returns a
composed `SQL` so counts and rows cannot drift. The dedup analog is the dismissed/active filter,
which appears in both the tab counts and the row query.

---

### 9. `src/app/duplicates/actions.ts` (controller, request-response)

**Analog:** `src/app/trash/actions.ts` — its 32-line header is the single best statement of the
security posture this phase needs, and its error-code union is directly reusable.

```ts
export type TrashErrorCode =
  | "NOT_AUTHENTICATED"
  | "NOT_AUTHORIZED"
  | "NOT_ADMIN"
  | "NOT_IN_TRASH"
  | "FAILED"

/** Every action returns this shape; `T` is the per-action success payload. */
export type TrashActionResult<T = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; code: TrashErrorCode }
```

Map to Phase 39: `NOT_AUTHENTICATED`, `NOT_ADMIN`, `PAIR_GONE` (→ `dedup.merge.gone`),
`RECORD_GONE`, `NOT_STARTER` (P-6), `FAILED` (→ `dedup.merge.failed`). **Codes, not prose** — the
UI switches on `code` and string-matches nothing.

**Runtime argument narrowing** — the rule and its implementation (`src/app/trash/actions.ts`):

```ts
/**
 * THE `id` ARGUMENT IS NARROWED AT RUNTIME … a server action is a POST endpoint, so
 * `id: string` is an annotation and not a control.
 * A bare shape test, not a UUID pattern. … The 64-character ceiling stops a megabyte string
 * being carried into a query and a log line; the non-empty test stops `""`.
 */
const MAX_RECORD_ID_LENGTH = 64

function parseRecordId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 && raw.length <= MAX_RECORD_ID_LENGTH
    ? raw
    : null
}
```

This is the direct precedent for V5's *"the survivor must be validated as one of the pair's two
members, server-side"* — `pairId`, `survivorId` and every key of the field-choice map get the same
treatment before any of them reaches a query.

**The owner-or-admin predicate, extracted once because copies drifted:**

```ts
/**
 * Written ONCE as a function rather than copied to the three sites that need it … Phase 35
 * recorded what happens to a hand-copied ownership comparison: three sites in
 * `src/app/organizations/actions.ts` drifted.
 */
function notOwnerOrAdmin(caller: Caller, ownerId: string): boolean {
  return ownerId !== caller.userId && caller.role !== "admin"
}
```

**Auth-then-actor ordering** (`src/app/organizations/actions.ts:29-47`, `createOrganization`) —
the T-36-02 rule V2 requires:

```ts
export async function createOrganization(data): Promise<…> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // The actor scope opens AFTER the session check above, never before it, so an
  // unauthenticated call establishes no actor at all (T-36-02). `userId` is
  // `session.user.id` and nothing else — never a form field, never a search param.
  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    createOrganizationMutation({ ...data, userId: session.user.id })
  )

  if (!result.success) return result
  revalidatePath("/organizations")
  return { success: true, id: result.id }
}
```

**This is also the exact insertion point for the create-time check (W-4/W-9).** The certain-match
lookup goes between the `auth()` guard and the `runWithActor` call, and the `confirmDuplicate`
flag skips it. Adding a third member to the return union
(`{ success: false; duplicates: MatchedRecord[] }`) is a breaking change for
`organization-dialog.tsx`'s `if (!result.success) { toast.error(result.error) }` branch — budget
both files in one task.

---

### 10. `src/app/duplicates/pair-card.tsx` (component, event-driven)

**Analog:** `src/app/trash/trash-table.tsx` — the row-action / transition / toast idiom
(`useTransition` at line 78; toasts at 165-280; the controlled `AlertDialog` at 452-480).

Confirmed idioms to carry:

```tsx
const [isPending, startTransition] = useTransition()

startTransition(async () => {
  const result = await dismissPair(pairId)
  if (!result.success) {
    switch (result.code) {
      case "PAIR_GONE": toast.error(t("error.…")); router.refresh(); return   // refresh, not "retry"
      default:          toast.error(t("review.dismissFailed")); return        // L-8: pair STAYS in the list
    }
  }
  toast.success(t("review.dismissed"))
  router.refresh()
})
```

`router.refresh()` — not local state mutation — is what satisfies L-8's "never an optimistic
removal that a failed write leaves invisible", because the list is server-rendered.

The `AlertDialog` for M-7 is **controlled with no trigger component**, the shape both
`trash-table.tsx:452` and `retention-form.tsx` document (Radix `SlotClone` renders `null` for an
`asChild` element that crossed the RSC boundary; the repo-wide gate is
`src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx`).

---

### 11. `src/components/ui/radio-group.tsx` (vendored component)

**Analog:** `src/components/ui/checkbox.tsx` — complete file, and the closest structural sibling
(`RadioGroup` and `Checkbox` are the same Radix Root+Indicator shape).

```tsx
"use client"

import * as React from "react"
import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"     // ← K-5: unified import, never @radix-ui/react-*

import { cn } from "@/lib/utils"

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn("peer border-input … size-4 shrink-0 rounded-[4px] border shadow-xs …", className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center …">
        <CheckIcon className="size-3.5 …" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
```

Confirmed: `src/components/ui/` contains **no** `radio-group.tsx` today (28 files listed). The
UI-SPEC's registry audit says the shadcn block already uses the unified `radix-ui` import and ships
zero user-visible strings, so install it with
`./node_modules/.bin/shadcn add radio-group` (never `npx` — it resolves to `npm run` on this host)
and verify against this file's shape rather than rewriting it.

---

### 12. `src/components/timeline/audit-entry.tsx` — the `merged` entry (Surface 5)

**Read at its CURRENT state this session** (495 lines, post-45-06). All four UI-SPEC rules land in
one 40-line region, lines **408-460**.

**A-2 — the predicate, unchanged mechanism** (line 409, with the comment that explains the
12-key split):

```tsx
/**
 * Twelve separate predicate keys rather than one sentence with an `{entity}` placeholder:
 * Spanish and Portuguese inflect the demonstrative with the noun's gender ("este trato" vs
 * "esta actividad"), so a placeholder would produce broken grammar in two of the three
 * shipped locales.
 */
const predicate = t(`entry.${entry.action}.${entry.entityType}`)
```

**Blocking detail the planner must resolve:** `predicate` is computed with **no argument object**.
`audit.entry.merged.*` carries `{name}` (UI-SPEC § Copywriting). The call becomes conditional —
`entry.action === "merged" ? t(\`entry.merged.${entry.entityType}\`, { name: loserName }) : t(\`entry.${entry.action}.${entry.entityType}\`)` — or the values object is passed unconditionally
(next-intl tolerates unused values). Either way it is a change to line 409, which A-2 says is
"no new predicate-building code path". Pick one and say so.

Second blocking detail: `loserName` is **not** on `AuditTimelineEntry` today. It must come out of
`changes` (the `__merged` marker) or be added to the entry type in `src/lib/timeline/types.ts` and
hydrated in `src/lib/timeline/assemble.ts`. Budget it.

**A-5 / A-6 — the branch to modify** (lines 445-460, verbatim):

```tsx
{entry.action === "deleted" ? null : changes.length === 0 ? (
  /*
    Defensive. The capture subscriber returns early on an empty diff, so this row
    should not exist — but a renderer that silently drew an empty field list would
    make that bug invisible … Applied to `created` as well as `updated`: a
    create with nothing recorded is the same defect wearing a different action.
  */
  <p className="text-muted-foreground mt-1 text-sm leading-normal">
    {t("entry.noVisibleChanges")}
  </p>
) : (
  <>
    <dl id={fieldListId} className="mt-1 space-y-1">
      {visibleChanges.map((change) => <AuditFieldRow key={change.field} change={change} />)}
    </dl>
    …
```

A-5 keeps the `=== "deleted"` guard exactly as narrow as it is. A-6 replaces the middle branch's
key with `entry.action === "merged" ? t("entry.mergedNoFieldChanges") : t("entry.noVisibleChanges")`.
A-7's `mergedChildren` line goes between the predicate row (ends line 443) and this branch.

**The disclosure affordance M-3's group 4 must match** (lines 464-480):

```tsx
// Ghost and muted, deliberately not accent: this is a disclosure affordance,
// not a link, and it must not read as one. Its accessible name states the count.
<Button
  type="button" variant="ghost" size="xs"
  className="text-muted-foreground mt-1"
  aria-expanded={expanded}
  aria-controls={fieldListId}
  onClick={() => setExpanded((current) => !current)}
>
```

**The sanctioned accent-link idiom W-3 and L-4 both need** (lines 356-363):

```tsx
// A sanctioned use of the accent inside this card: a link from an entry to the
// record it describes.
<Link href={`/workflows/${…}/runs/${…}`} className={cn("text-primary hover:underline", ACTOR_NAME_CLASS)}>
```

A-3 forbids linking the loser's name — render it as plain text, since it is soft-deleted.

**Filter-then-derive-count ordering** (lines 428-438) — reuse for M-3's group partitioning:

```tsx
const changes = entry.changes.filter(
  (change) => change.field !== DELETED_AT_COLUMN || deletedAtDirectionKey(change) !== null
)
const hiddenFieldCount = changes.length - VISIBLE_FIELD_COUNT
const visibleChanges = expanded ? changes : changes.slice(0, VISIBLE_FIELD_COUNT)
```

The comment states the rule: a row that returns `null` must also leave the array, or the count
promises "show 1 more" and produces nothing.

---

### 13. `src/lib/dedup/field-groups.ts` and `merge-defaults.ts` (pure utilities)

**Analog:** `src/lib/audit/present.ts` — `describeField` (lines 313-352) and
`buildAuditFieldChanges` (lines 462-500). M-4 mandates the merge picker resolve labels through
this module rather than a new map, so the plan must call it, not re-implement it.

**Label resolution incl. the `custom:` prefix** (`describeField`, lines 313-352):

```ts
function describeField(changeKey: string, resolution: AuditResolution): FieldDescriptor {
  if (changeKey.startsWith(CUSTOM_FIELD_PREFIX)) {
    const name = changeKey.slice(CUSTOM_FIELD_PREFIX.length)
    const definitionId = customDefinitionId(name, resolution)

    if (definitionId === null) {
      // The definition was deleted after the entry was written. The stored key is the only
      // name that ever existed for it …
      return { field: CUSTOM_CHANGE_PREFIX + name, label: name, kind: "auto", withTime: false, group: 2, rank: Number.MAX_SAFE_INTEGER }
    }

    return {
      field: CUSTOM_CHANGE_PREFIX + definitionId,
      // VERBATIM and unescaped: React escapes text children downstream (T-36-21).
      label: resolution.customFieldNames.get(definitionId) ?? name,
      kind: (…CUSTOM_TYPE_KINDS[definitionType]) ?? "auto",
      withTime: false, group: 2,
      rank: resolution.customFieldPositions.get(definitionId) ?? Number.MAX_SAFE_INTEGER,
    }
  }

  const nativeIndex = NATIVE_ORDER.get(changeKey)
  return {
    field: changeKey,
    label: nativeIndex === undefined ? humaniseColumn(changeKey) : AUDIT_FIELD_LABELS[changeKey],
    kind: nativeKind(changeKey),
    withTime: DATE_COLUMNS[changeKey] === true,
    group: nativeIndex === undefined ? 1 : 0,
    rank: nativeIndex ?? 0,
  }
}
```

Note `customDefinitionId` resolves **by name**, iterating `resolution.customFieldNames` and
returning the **first** match. That is exactly the duplicate-`Segmento Organização` hazard research
flagged: two definitions share one name, and this function silently picks one. Deduping the merge
picker's field list by name is consistent with what `present.ts` already does — say so at the
dedupe site.

**Group-then-rank partitioning shape** (`buildAuditFieldChanges` + `compareChanges`, lines
441-500) is the direct model for M-3's conflicts / filled-only / identical partitioning:
build `{ descriptor, change }` pairs, push into one array, `sort(compareChanges)`, then map. Also
note `describeField` is currently **not exported** — M-4 requires it (or a thin wrapper) to be.

**`AuditValue` union** (`src/lib/timeline/types.ts:107-121`) — `{ type: 'empty' }` is a first-class
case, which is precisely what M-5's *"an empty side renders `audit.value.empty` … never a blank"*
needs; the type already models it.

---

### 14. `src/db/schema/duplicate-pairs.ts` and the `normName` columns

**Analog:** `src/db/schema/notes.ts` — the only schema file with a partial index, a partial UNIQUE
index, and a documented polymorphic key. Both apply.

```ts
export const notes = pgTable('notes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Polymorphic key. The union is imported from ./custom-fields — the repo has exactly
  // one definition of it today and a second would drift (D-01).
  entityType: text('entity_type').notNull().$type<EntityType>(),
  // NO foreign key: entityId points at one of four different tables …
  entityId: text('entity_id').notNull(),
  …
}, (table) => ({
  liveEntityIdx: index('notes_live_idx')
    .on(table.entityType, table.entityId, table.createdAt.desc())
    .where(sql`${table.deletedAt} is null`),
  migrationUniq: uniqueIndex('notes_migration_uniq')
    .on(table.entityType, table.entityId)
    .where(sql`${table.source} = 'migration'`),
  authorIdIdx: index('notes_author_id_idx').on(table.authorId),
}))
```

**The B4 index, verbatim, so the planner has it in one place:**
`uniqueIndex('notes_migration_uniq').on(entityType, entityId).where(source = 'migration')`, at
`src/db/schema/notes.ts:42-44`. Its comment states it is *"a permanent database invariant, not a
one-shot script guard"* — so it may not be dropped, exactly as research says.

**`duplicate_pairs` is polymorphic in the same way** (`entityType` + two record ids, no FK, since
one column would have to point at two tables). Copy `notes.ts`'s comment posture: state that
nothing at the database level catches a dangling reference. Also copy the type-import rule —
`EntityType` comes from `./custom-fields`, never restated (D-01).

**Current organizations table, for reference** (`src/db/schema/organizations.ts`, complete — note
there is `website` but no `email`/`phone` column, confirming B1's "organizations have no native
email or phone columns"):

```ts
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  website: text('website'),
  industry: text('industry'),
  notes: text('notes'),
  ownerId: text('owner_id').notNull().references(() => users.id),
  defaultCurrency: text('default_currency').default('USD').notNull(),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  deletedAtIdx: index('organizations_deleted_at_idx').on(table.deletedAt),
}))
```

`src/db/schema/people.ts` is the same shape plus `firstName`, `lastName`, `email`, `phone`,
`organizationId` — `people.email` is a real column, which is why B2's person tier works.

**A1 RESOLVED — the exact Drizzle API against the installed 0.45.1:**

```ts
// node_modules/drizzle-orm/pg-core/columns/common.d.ts:49
generatedAlwaysAs(as: SQL | T['data'] | (() => SQL)): HasGenerated<this, { type: 'always' }>;

// node_modules/drizzle-orm/mysql-core/columns/common.d.ts:33   ← the two-arg form is MySQL-ONLY
generatedAlwaysAs(as: SQL | T['data'] | (() => SQL), config?: MySqlGeneratedColumnConfig): …

// node_modules/drizzle-orm/pg-core/indexes.d.ts:55
using(method: PgIndexMethod, ...columns: [Partial<ExtraConfigColumn | SQL>, …]): IndexBuilder;
//   PgIndexMethod includes 'gin' explicitly.

// node_modules/drizzle-orm/pg-core/columns/common.d.ts:103
op(opClass: PgIndexOpClass): Omit<this, 'op'>;
//   PgIndexOpClass ends in `(string & {})`, so 'gin_trgm_ops' is accepted.
```

So the schema call is:

```ts
normName: text('norm_name').generatedAlwaysAs(sql`public.dedup_norm_org(name)`),
// …and in the extra-config callback:
normTrgmIdx:  index('org_norm_trgm_idx').using('gin', table.normName.op('gin_trgm_ops'))
                .where(sql`${table.deletedAt} is null`),
normBtreeIdx: index('org_norm_btree_idx').on(table.normName)
                .where(sql`${table.deletedAt} is null`),
```

Every builder above exists in the installed typings. **What is still unverified is `drizzle-kit
generate`'s emitted DDL** — specifically whether it emits `GENERATED ALWAYS AS (…) STORED` with the
custom function reference intact, and whether it emits `CREATE EXTENSION` at all (it does not;
`drizzle.config.ts` declares no `extensionsFilters` and there is no extension concept in the
config). Plan a `db:generate` → inspect-the-SQL → adjust step as a real task, with the documented
fallback: a `--custom` migration plus a plain `text('norm_name')` column in the schema.

---

### 15. `drizzle/00NN_dedup.sql` (migration)

**Nearest analog:** `drizzle/0014_sloppy_slapstick.sql` and `drizzle/0015_trash_retention_seed.sql`
— for the **hand-edit doctrine only**, not for the DDL, which has no precedent.

`0014` is a generated file with a hand-appended data statement and a 40-line comment block
justifying the hand edit. Its point 3 is the governing rule:

> **WHY HAND-EDITING THIS FILE DOES NOT VIOLATE PHASE 33 D-06.** D-06 forbids hand-written INDEX
> DDL in migration SQL, because `drizzle-kit generate` owns the schema and silently dropped a
> hand-written index in this repo once (0009 to 0010). `generate` does not manage data rows at all
> … The distinction is DDL versus data … **Do not generalise it: no index DDL is ever hand-written
> here.**

**This is a genuine conflict Phase 39 must resolve explicitly.** The dedup migration needs
hand-written **non-index, non-table** DDL — `CREATE EXTENSION` and two `CREATE FUNCTION`s — which
`drizzle-kit generate` cannot emit and which D-06 does not cover (it names indexes). Options,
matching the precedent `0015` set with `drizzle-kit generate --custom`:

1. **Two migrations.** A `--custom` one containing only extensions + functions, then a normal
   `generate`d one containing the generated columns, indexes and tables. Ordering is guaranteed by
   the journal; the generated column's function must exist first. This is the cleanest fit with
   D-06 and with `0015`'s precedent.
2. One `--custom` migration containing everything, hand-written. Simplest to read, but it puts
   index DDL under hand control, which D-06 forbids.

**Recommend (1).** Whichever is chosen, write the `unaccent`-is-really-STABLE caveat into the
migration's comment, per research § 1.

**Journal + snapshot:** `drizzle/meta/_journal.json` is append-only, last entry `idx: 15`,
`tag: "0015_trash_retention_seed"`. `drizzle-kit generate` maintains it; a hand-written file still
needs its journal entry, which `--custom` produces.

---

### 16. `scripts/dedup-checks.sql` (SQL verification) — the real-DB substitute

**Analog:** `scripts/trash-checks.sql` (667 lines) — the most developed of the three scripts
(`audit-log-checks.sql` 94, `reconcile-notes.sql` 169). Its header is the exact argument Phase 39
is making, one phase earlier:

```
-- WHY THIS FILE EXISTS
--   Every purge unit test in this repository mocks `@/db` wholesale, and a mocked
--   `db.delete` cannot raise SQLSTATE 23503. The ordered teardown in
--   `src/lib/mutations/{deals,people,organizations,activities}.ts` is therefore
--   asserted by the vitest suite only as a CALL ORDER — never as a fact about the
--   real foreign keys it exists to satisfy. This file is the other half of that
--   proof, and it is the only part of it that talks to a real database.
--
-- HOW TO RUN
--   docker compose exec -T postgres psql -U pipelite -d pipelite -f - < scripts/trash-checks.sql
--
--   psql reaches the server over the container's local unix socket, so NO
--   credential is passed on the command line, none is read from the environment,
--   and none may ever be written into this file.
--
--   Run it with ON_ERROR_STOP unset or 0. Part 2 raises deliberate errors …
--
-- IT IS RE-RUNNABLE AND MUTATES NOTHING
```

Structural conventions to copy: numbered Parts; **Part 0** takes a before-snapshot of every table
touched; each mutating Part is wrapped `BEGIN … ROLLBACK`; the **final Part** re-counts and asserts
nothing changed; probes that are *expected* to fail are documented as such. The no-credential rule
is a hard project constraint (memory: never pass a sudo password; note `docker` needs no `sudo`).

Phase 39's parts, by direct analogy: extension presence (`pg_extension`); function volatility
(`pg_proc.provolatile` — asserting `immutable_unaccent` is `'i'`); index existence + `amname='gin'`
+ opclass; **EXPLAIN showing `Bitmap Index Scan on org_norm_trgm_idx`** (the Pitfall-1 detector);
`notes_migration_uniq` still present and still partial; a `BEGIN … ROLLBACK` merge of two
organizations that both carry a `source='migration'` note; and the star-vs-clique pair-count
assertion from Pitfall 3.

---

### 17. `src/messages/locale-parity.test.ts` (test, exact-set contract)

**Analog:** `REQUIRED_BULK_KEYS` (declared line 306) — the newest and most complete of the four
contracts, and the one whose namespace is entirely self-contained, matching `dedup.*`.

```ts
/**
 * … 44 keys, all inside the `bulk` namespace — unlike `trash`, this phase adds nothing to `nav` or
 * `admin.dashboard`, which is why `bulkKeys` below needs no `*_EXTRA_KEYS` sibling. The per-group
 * counts in the comments are load-bearing: they are how a reader sees at a glance that a group
 * lost a key.
 */
export const REQUIRED_BULK_KEYS: string[] = [
  // Selection — 4. …
  "bulk.selectRow",
  …
]
```

**The exact-set assertion** (lines 686-696):

```ts
// Same exact-contract rule for bulk. The bulk contract is entirely inside its own namespace, so
// this comparison is total: a 45th bulk string that never made it into REQUIRED_BULK_KEYS fails
// here, which is the half a missing-key check cannot see.
const bulkContract = [...REQUIRED_BULK_KEYS].sort()
for (const locale of LOCALES) {
  expect.soft(
    bulkKeys[locale],
    `${BULK_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
  ).toEqual(bulkContract)
}
```

`dedup` is likewise entirely self-contained, so `REQUIRED_DEDUP_KEYS` gets the **total** form with
no `*_EXTRA_KEYS` sibling — the `bulk` shape, not the `trash`/`shell` shape. The five existing
assertions (`missingIn`, `expectIdenticalKeySets`, `blankIn`, `untranslatedInBoth`,
`placeholderDrift`) each need one added line, at lines ~652, ~660, ~710, ~720, ~730.
`REQUIRED_AUDIT_KEYS` (line 187) and its contract at line 668 are already exact-set, so L-2 needs
no new assertion.

---

### 18. `e2e/merge-screen-320.spec.ts` and `e2e/viewport-320.spec.ts`

**Analog:** `e2e/viewport-320.spec.ts` (whole file). The `e2e/` directory holds five files:
`auth.setup.ts`, `seed-admin.ts`, `deals-drag.spec.ts`, `theme.spec.ts`, `viewport-320.spec.ts`.

Header rules to inherit verbatim:

```ts
/**
 * The 305 rather than 320 comes from `launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] }`
 * in playwright.config.ts. Without it headless Chromium reports clientWidth 320 and this whole
 * file green-lights layouts that still scroll sideways on a real phone.
 *
 * The viewport is neither declared nor changed anywhere in this file … Resizing mid-run is
 * deliberately absent as well: `@dnd-kit/core` wires the window `Resize` event to its drag-cancel
 * handler, so a programmatic resize is a hazard that must not become a habit anywhere under e2e/.
 *
 * No login happens here either — the session arrives from the setup project's storageState.
 */

// Relative paths, not "@/…": Playwright does not read vitest's alias table.
import en from "../src/messages/en-US.json"
import es from "../src/messages/es-ES.json"
import pt from "../src/messages/pt-BR.json"

interface AnchorCatalog { organizations: { title: string }; …; audit: { retention: { title: string } } }
const CATALOG: Record<string, AnchorCatalog> = { "en-US": en, "pt-BR": pt, "es-ES": es }
```

R-1 adds `dedup: { scan: { title: string } }` to `AnchorCatalog` and a 7th route. The anchor rule
(V-1) is already implemented here: every route asserts a visible `h1` by role **before** measuring,
because a blank 200 has `scrollWidth === clientWidth` and passes silently.

---

### 19. `src/lib/dedup/normalize.ts` — and the `fuzzy-match.ts` collision

**Analog (cautionary):** `src/lib/import/fuzzy-match.ts`. Exports exactly two functions:
`fuzzyMatchOrganization` (line 98) and `getMatchingSuggestions` (line 140); its `normalize()` is
private. Sole caller: `src/app/import/actions.ts:191`.

Research documents the full divergence table and recommends option (1) — leave it alone, add
cross-reference comments at the top of both files, log the repoint as follow-up. **Confirmed
low-risk:** the export surface is two functions and one call site, so option (2) would be a small
diff if a later phase wants it. Nothing here changes research's recommendation.

---

## Shared Patterns

### S-1 — Mutation return shape

**Source:** `src/lib/mutations/organizations.ts` (every exported function)
**Apply to:** `src/lib/mutations/dedup.ts`

```ts
Promise<{ success: true; …payload } | { success: false; error: string }>
```

The `error` is a **discriminated code** where the UI must branch (`"NOT_IN_TRASH"`) and a fixed
opaque sentinel otherwise (`"Failed to purge organization"`). Never a driver message.

### S-2 — Server-action auth → actor ordering

**Source:** `src/app/organizations/actions.ts:29-47`
**Apply to:** every function in `src/app/duplicates/actions.ts`, and the create-time check in
`createOrganization` / `createPerson`

```ts
const session = await auth()
if (!session?.user?.id) return { success: false, error: "Not authenticated" }
// The actor scope opens AFTER the session check above, never before it (T-36-02).
await runWithActor({ kind: "user", userId: session.user.id }, () => …)
```

### S-3 — Admin re-check inside the action

**Source:** `src/app/admin/audit/actions.ts:26-29`
**Apply to:** every function in `src/app/duplicates/actions.ts`

```ts
if (!session?.user || session.user.role !== "admin") {
  return { success: false, error: "Unauthorized: Admin access required" }
}
```

The layout gate protects page renders only; a server action is a POST endpoint reachable with no
render involved.

### S-4 — Runtime narrowing of every action argument

**Source:** `src/app/trash/actions.ts` (`parseRecordId`, `MAX_RECORD_ID_LENGTH = 64`,
`parseTrashTab`)
**Apply to:** `pairId`, `survivorId`, `entityType`, and every key of the merge's field-choice map

A type annotation is not a runtime control on a value that arrived over the wire.

### S-5 — Fail-closed read modules

**Source:** `src/lib/trash/settings.ts`, `src/lib/trash/queries.ts` (rule 3 of its header)
**Apply to:** `src/lib/dedup/queries.ts`, `src/lib/dedup/identity-settings.ts`,
`src/lib/dedup/scan-state.ts`

Nothing throws. Every read fails into a value the page can render (`null`, `{ ok: false }`, an
empty map). `/duplicates` will have no `error.tsx` above it, exactly like `/trash`. Logs carry
identifiers and bounds only — **never the stored value or record contents** (T-37-09).

### S-6 — Audit rows: `tx` inside, bus outside

**Source:** `src/lib/mutations/organizations.ts:596-634`; `src/lib/events/subscribers/audit.ts:46`
(`AUDITED_EVENTS` list, line 19)
**Apply to:** every audit row the merge writes

The bus subscriber writes with module-level `db`, fire-and-forget. `merged` is not an
`AUDITED_EVENTS` member and no `organization.merged` event exists. Write with
`tx.insert(auditLog)`; emit `organization.deleted` (if at all) **after** the transaction commits.

### S-7 — Source-scan gates (no jsdom)

**Source:** `src/components/custom-fields/__tests__/source-scan.ts` — exports `stripComments`,
`readStrippedSource`, `callArguments`
**Apply to:** all four new `*-wiring.test.ts` gates (W-6, P-3/K-7, R-3/M-9, A-5/A-6)

```ts
/** Read a repo-relative source file with comments stripped. */
export function readStrippedSource(path: string): string {
  return stripComments(readFileSync(path, "utf8"))
}

/**
 * Return the argument text of every `${callee}(...)` call in `source`, using string-aware brace
 * matching so a `)` inside a string literal cannot close the argument list early.
 */
export function callArguments(source: string, callee: string): string[] { … }
```

`callArguments` is the tool A-10 needs for brace-scoping a negative assertion to one branch region
— it already does string-aware depth matching. Note the module is deliberately **not** a
`.test.ts`, so vitest's include glob does not run it.

### S-8 — `EntityType` is imported, never restated

**Source:** `src/db/schema/notes.ts:16` and `src/db/schema/audit-log.ts:9-13` (D-01)
**Apply to:** `duplicate-pairs.ts`, `dedup-scans.ts`, `src/lib/dedup/*`

UI-SPEC additionally requires a narrowed `MergeableEntityType = "organization" | "person"` at the
type level, because `AuditEntry` builds `t(\`entry.merged.${entityType}\`)` and a missing key
renders the dot-path to the user. Derive it from `EntityType` (`Extract<EntityType, "organization"
| "person">`), do not restate it.

---

## The authoritative child inventory (confirmed against schema files)

Research derived this from `pg_constraint` + `information_schema`. **Confirmed against the source
this session; the two agree exactly.**

### Real foreign keys into `organizations` / `people` — exactly three

| Child table | Column | Declared at | Parent |
|---|---|---|---|
| `deals` | `organization_id` | `src/db/schema/deals.ts` (`deals_organization_id_idx` at line 24) | organizations |
| `people` | `organization_id` | `src/db/schema/people.ts:12` `.references(() => organizations.id)` | organizations |
| `deals` | `person_id` | `src/db/schema/deals.ts` (`deals_person_id_idx` at line 25) | people |

Every one is `ON DELETE NO ACTION` — proven empirically in Phase 37 and asserted standingly by
`scripts/trash-checks.sql` Part 1 ("exactly six constraints, all `confdeltype = 'a'`", covering all
four CRM tables).

### Polymorphic references — no FK, nothing catches a miss

| Table | Columns | Declared at | Merge action |
|---|---|---|---|
| `notes` | `entity_type`, `entity_id` | `src/db/schema/notes.ts:15-19` | **REASSIGN**, collision-guarded against `notes_migration_uniq` (`notes.ts:42-44`) |
| `audit_log` | `entity_type`, `entity_id` | `src/db/schema/audit-log.ts:38-46` | **DO NOT REASSIGN** — see the schema comment below |
| `custom_field_definitions` | `entity_type` only | `src/db/schema/custom-fields.ts` | untouched — a *type* discriminator, not a record reference |

`src/db/schema/audit-log.ts:38-46`, verbatim:

> NO foreign key, and — unlike `notes.entityId` — deliberately NO parent-existence check either.
> This is the OPPOSITE posture to `src/db/schema/notes.ts:16-20`, and the difference is the whole
> point: an audit row for a DELETED record must survive that record. A referential guard here …
> would erase exactly the evidence the log exists to keep. **Do not "fix" this by copying the notes
> defence over — its absence is the design.**

### Columns that hold custom field values (not child rows)

`organizations.custom_fields` (`organizations.ts:12`) and `people.custom_fields`
(`people.ts:15`) — both `jsonb('custom_fields').$type<Record<string, unknown>>().default({})`,
keyed by the definition's human **name**. Resolved by the field picker and written as one blob in
merge statement 4; there is no separate reassignment step.

### Tables confirmed to hold NO organization or person reference

`activities` (`src/db/schema/activities.ts` — indexes on `due_date`, `deal_id`, `deleted_at` only;
no organization or person column), `workflow_runs`, `webhook_deliveries`, `deal_assignees`,
`deal_stage_history`, `import_sessions`, `app_settings`, and the 20 remaining schema files.
**Activities follow their deal transitively — write the comment (UI-SPEC M-6's
`dedup.merge.activitiesFollowDeals` is its user-facing form), never a no-op `UPDATE activities`.**

---

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|---|---|---|---|
| `drizzle/00NN_dedup.sql` — **`CREATE EXTENSION`** | migration | DDL | Zero occurrences across all 16 `drizzle/*.sql`. `\dx` on the live DB shows `plpgsql` only. `drizzle.config.ts` declares no `extensionsFilters` and `drizzle-kit` has no extension concept. **No precedent to copy — hand-write it in a `--custom` migration.** |
| `drizzle/00NN_dedup.sql` — **`CREATE FUNCTION` (`immutable_unaccent`, `dedup_norm_*`)** | migration | DDL | Zero SQL functions exist in this schema. No precedent. |
| `organizations.normName` / `people.normName` — **STORED generated column + GIN index** | model | — | Zero `GENERATED ALWAYS`, zero `USING gin`, zero `gin_trgm_ops` anywhere in `drizzle/` or `src/db/schema/`. The **Drizzle builders are all confirmed present** in 0.45.1 (see § 14) — what has no precedent is `drizzle-kit generate`'s emitted DDL for them. Plan a generate-then-inspect task with the documented fallback. |
| `src/lib/mutations/dedup.test.ts` — **real-database integration test** | test | integration | **No test in this repository talks to a real database.** Verified three ways: (a) zero test files import `postgres` or `drizzle-orm/postgres-js`; (b) neither `vitest.config.ts` nor `vitest.rsc.config.ts` declares `setupFiles`, `globalSetup`, or any env plumbing — both are `environment: 'node'` and nothing more; (c) `src/lib/mutations/organizations.test.ts:9-21` mocks `@/db` wholesale, and its own header says a mocked `db.delete` cannot exercise a constraint. **The plan must establish this pattern from zero** — a DB connection, fixture creation/teardown, `.gitignore`d or env-guarded config, and a CI story (`.github/workflows/ci.yml` runs `npm ci`, typecheck, lint, test with **no Docker and no DB**, so any real-DB vitest file must be excluded from the default `npm run test` project or CI goes red). **The de-risked alternative with a strong analog is `scripts/dedup-checks.sql`, modelled on `scripts/trash-checks.sql`.** Recommend shipping the SQL script unconditionally and treating the vitest path as a separate, clearly-scoped task the planner can cut. |

**Partial-analog note (not a gap):** the create-time duplicate warning
(`src/components/dedup/duplicate-warning.tsx`) has no shape-level analog — the repo has no
"server-returned advisory rendered inside an open form dialog". Its constituent parts all exist
(`src/components/ui/alert.tsx` with its two variants, the `text-primary hover:underline` record
link at `audit-entry.tsx:357-361`, and `organization-dialog.tsx`'s `createdRecordIdRef` draft
guard at lines 90/137/189). Assemble from those; there is nothing to copy wholesale.

---

## Metadata

**Analog search scope:** `src/lib/mutations/`, `src/lib/import/`, `src/lib/trash/`,
`src/lib/audit/`, `src/lib/timeline/`, `src/lib/events/subscribers/`, `src/db/schema/` (all 27
files), `src/app/trash/`, `src/app/admin/{layout,audit,import}/`, `src/app/organizations/`,
`src/components/{ui,timeline,import,custom-fields/__tests__}/`, `drizzle/*.sql` (all 16) +
`drizzle/meta/_journal.json`, `scripts/*.sql`, `e2e/`, `instrumentation.ts`, `src/middleware.ts`,
`drizzle.config.ts`, `vitest.config.ts`, `vitest.rsc.config.ts`, `package.json`, and the installed
`node_modules/drizzle-orm/{pg-core,mysql-core,column-builder}` typings.

**Files read in full or in targeted ranges:** 41
**Pattern extraction date:** 2026-08-18
**Drizzle version verified:** `drizzle-orm@0.45.1` (read from `node_modules/drizzle-orm/package.json`)
