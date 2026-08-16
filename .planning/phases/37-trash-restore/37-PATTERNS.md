# Phase 37: Trash & Restore - Pattern Map

**Mapped:** 2026-08-16
**Files analyzed:** 34 (20 new, 14 modified)
**Analogs found:** 33 / 34

**Governing finding:** Phase 36 shipped a fully-worked reference implementation of *every
non-UI mechanism this phase needs*. `src/lib/audit/{settings,prune,present}.ts`, their tests,
and `src/app/admin/audit/{page,actions,retention-form}.tsx` are not "similar" to what Phase 37
builds — they are the same modules with `audit` swapped for `trash`. The single largest risk
to this phase is a plan that re-derives any of them. Every pattern below is a real excerpt
read from source this session, with file paths and line numbers.

---

## File Classification

### New files

| New file | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/trash/settings.ts` | service (config) | CRUD | `src/lib/audit/settings.ts` | **exact** |
| `src/lib/trash/settings.test.ts` | test | CRUD | `src/lib/audit/settings.test.ts` | **exact** |
| `src/lib/trash/prune.ts` | background processor | batch | `src/lib/audit/prune.ts` | **exact** |
| `src/lib/trash/prune.test.ts` | test (fake timers) | batch | `src/lib/audit/prune.test.ts` | **exact** |
| `src/lib/trash/queries.ts` | service (read) | CRUD read | `src/app/organizations/page.tsx:18-58` + `src/lib/timeline/sources.ts:705-732` + `src/lib/audit/settings.ts:144-167` | role-match (composite) |
| `src/lib/trash/queries.test.ts` | test | CRUD read | `src/lib/audit/prune.test.ts:51-68` (PgDialect SQL rendering) | role-match |
| `src/lib/trash/present.ts` | utility (pure presenter) | transform | `src/components/timeline/audit-entry.tsx:84-96,270-317` + `src/lib/timeline/sources.ts:744-782` | role-match |
| `src/lib/trash/present.test.ts` | test | transform | `src/lib/audit/settings.test.ts` (structure only) | partial |
| `src/lib/trash/entity-types.ts` | utility (db-free parser) | validate | `src/lib/timeline/assemble.ts:33-41` (`assertEntityType`, closed-literal narrowing before any predicate is composed) + `src/app/api/v1/audit/route.ts` (`z.enum` idiom) | role-match |
| `src/lib/trash/entity-types.test.ts` | test | validate | `src/lib/audit/settings.test.ts` (structure only — pure function over a literal union) | role-match |
| `src/lib/trash/dispatch.ts` | registry (exhaustive map) | dispatch | `src/lib/execution/registry.ts` (frozen `Record<K, fn>` map, compile-checked exhaustiveness instead of a switch) | role-match |
| `src/lib/trash/dispatch.test.ts` | test | dispatch | `src/lib/execution/registry.test.ts` — assert every `EntityType` key is present and each maps to the right mutation | role-match |

> **Added after the initial pass (plan-checker warning 1).** Plans 37-02 and 37-06 introduce these four files beyond the layout RESEARCH.md sketched: `entity-types.ts` is db-free so the client, the server queries, and `instrumentation.ts` can share one narrowing, and `dispatch.ts` replaces three parallel switch statements with a single exhaustive map. Both plans already cite these analogs inline; this table entry closes the documentation gap so the counts in this file agree with the plans.
| `src/app/trash/page.tsx` | page (server RSC) | request-response | `src/app/organizations/page.tsx` (list shell) + `src/app/admin/audit/page.tsx` (RSC split) | **exact** |
| `src/app/trash/trash-tabs.tsx` | component (client) | request-response | `src/app/activities/activities-client.tsx:96-100,144-156` | role-match |
| `src/app/trash/trash-table.tsx` | component (client) | event-driven | `src/app/organizations/data-table.tsx:125-239` + `src/app/admin/audit/retention-form.tsx:120-229` | role-match (composite) |
| `src/app/trash/trash-columns.tsx` | component (client) | transform | `src/app/organizations/columns.tsx:30-131` | **exact** |
| `src/app/trash/actions.ts` | server action | request-response | `src/app/deals/actions.ts:25-89` + `src/app/admin/audit/actions.ts` | **exact** |
| `src/app/trash/actions.test.ts` | test | request-response | `src/app/notes/actions.test.ts:1-70` | **exact** |
| `src/app/admin/trash/page.tsx` | page (server RSC) | request-response | `src/app/admin/audit/page.tsx` | **exact** |
| `src/app/admin/trash/retention-form.tsx` | component (client) | event-driven | `src/app/admin/audit/retention-form.tsx` | **exact** |
| `src/app/admin/trash/actions.ts` | server action | request-response | `src/app/admin/audit/actions.ts` | **exact** |
| `src/app/api/v1/trash/route.ts` (+ restore/purge) | route (REST) | request-response | `src/app/api/v1/audit/route.ts` + `src/app/api/v1/deals/[id]/route.ts:384-432` | **exact** |
| `scripts/trash-checks.sql` | script (SQL assertion) | batch | `scripts/audit-log-checks.sql` | **exact** |
| `drizzle/00XX_*.sql` (retention seed) | migration | batch | `drizzle/0014_sloppy_slapstick.sql:28-70` | **exact** |

### Modified files

| Modified file | Role | Data Flow | Closest Analog (in-file or sibling) | Match Quality |
|---------------|------|-----------|-------------------------------------|---------------|
| `src/lib/mutations/{deals,people,organizations,activities}.ts` | model/mutation | CRUD | `deleteDealMutation` (`deals.ts:461-498`) for restore; `deleteWorkflow` (`workflows.ts:191-215`) for purge teardown | **exact** |
| `src/lib/mutations/{deals,…}.test.ts` | test | CRUD | `src/lib/mutations/deals.test.ts:1-81` (existing mock scaffold) | **exact** |
| `instrumentation.ts` | config | event-driven | `instrumentation.ts:30-31` (`startAuditPruner`) | **exact** |
| `src/components/user-menu.tsx` | component (client) | request-response | `src/components/user-menu.tsx:58-63` (API Keys item) | **exact** |
| `src/components/admin-sidebar.tsx` | config | request-response | `src/components/admin-sidebar.tsx:35-43` (Audit Log entry) | **exact** |
| `src/app/admin/page.tsx` | page (server) | request-response | `src/app/admin/page.tsx:197-215` (audit dashboard Card) | **exact** |
| `src/messages/{en-US,es-ES,pt-BR}.json` | config (i18n) | transform | existing `audit.*` namespace | **exact** |
| `src/messages/locale-parity.test.ts` | test | transform | `REQUIRED_AUDIT_KEYS` block, lines 73-113 + 224-244 + 318-345 | **exact** |
| 6 × delete-dialog files (§ UI-SPEC Surface 6) | component (client) | event-driven | `src/app/organizations/delete-dialog.tsx:43-46` | **exact** |

---

## Pattern Assignments

### `src/lib/trash/settings.ts` (service/config, CRUD)

**Analog:** `src/lib/audit/settings.ts` — copy key-for-key, 167 lines, four exports.

**Imports pattern** (lines 13-17):

```typescript
import { z } from "zod"
import { count, eq, min } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema/app-settings"
import { auditLog } from "@/db/schema/audit-log"
```

**Key + bounds + schema pattern** (lines 19-37) — note the comments are load-bearing, they
encode *why* the min is a control:

```typescript
/** The single settings key this phase owns. Seeded by migration 0014 (36-03). */
export const AUDIT_RETENTION_KEY = "audit.retention_days"

/**
 * One day is the shortest window that is still a retention policy rather than a purge.
 * The lower bound is a control, not ergonomics: rejecting `<= 0` is what stops the
 * retention setting from being usable as a data-destruction primitive (T-36-07).
 */
export const RETENTION_MIN = 1

/** Ten years. Above this the setting is indistinguishable from "keep forever". */
export const RETENTION_MAX = 3650

const retentionSchema = z.number().int().min(RETENTION_MIN).max(RETENTION_MAX)
```

Phase 37 substitutions: `TRASH_RETENTION_KEY = "trash.retention_days"`, `RETENTION_MAX = 365`
(UI-SPEC recommendation), seeded default `30`. The log prefix becomes `[trash-settings]`.

**Fail-closed read pattern** (lines 62-86) — three distinct `null` returns, no `?? 30` anywhere:

```typescript
export async function readRetentionDays(): Promise<number | null> {
  try {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, AUDIT_RETENTION_KEY),
    })

    if (!row) {
      return null
    }

    const parsed = retentionSchema.safeParse(row.value)

    if (!parsed.success) {
      console.warn(
        `[audit-settings] ${AUDIT_RETENTION_KEY} is not an integer in [${RETENTION_MIN}, ${RETENTION_MAX}] — retention is disabled until it is corrected`
      )
      return null
    }

    return parsed.data
  } catch (error) {
    console.error("[audit-settings] Failed to read the retention setting:", error)
    return null
  }
}
```

**Validate-before-DB write pattern** (lines 88-126):

```typescript
/** Discriminated result so a caller cannot mistake a failure for a success. */
export type WriteRetentionResult = { success: true } | { success: false; error: string }

export async function writeRetentionDays(days: number): Promise<WriteRetentionResult> {
  const parsed = retentionSchema.safeParse(days)

  if (!parsed.success) {
    return {
      success: false,
      error: `Retention must be a whole number of days between ${RETENTION_MIN} and ${RETENTION_MAX}.`,
    }
  }

  const value = parsed.data

  try {
    const updatedAt = new Date()

    await db
      .insert(appSettings)
      .values({ key: AUDIT_RETENTION_KEY, value, updatedAt })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt },
      })

    return { success: true }
  } catch (error) {
    console.error("[audit-settings] Failed to write the retention setting:", error)
    return { success: false, error: "Failed to save the retention setting." }
  }
}
```

**Stats-readout pattern** (lines 128-167) — the analog for `readTrashStats()`; degrade to the
zero state rather than throwing, because the admin page must render:

```typescript
export interface AuditStats {
  entryCount: number
  /** `null` on an empty table — there is no oldest entry, which is not the same as "now". */
  oldestEntryAt: Date | null
}

export async function readAuditStats(): Promise<AuditStats> {
  try {
    const rows = await db
      .select({
        entryCount: count(),
        oldestEntryAt: min(auditLog.createdAt),
      })
      .from(auditLog)

    const row = rows[0]

    if (!row) {
      return { entryCount: 0, oldestEntryAt: null }
    }

    return {
      entryCount: Number(row.entryCount) || 0,
      oldestEntryAt: row.oldestEntryAt ?? null,
    }
  } catch (error) {
    console.error("[audit-settings] Failed to read audit log stats:", error)
    return { entryCount: 0, oldestEntryAt: null }
  }
}
```

Phase 37 divergence: `readTrashStats()` must aggregate across **four** tables (count of rows
with `deleted_at IS NOT NULL`, and `min(deleted_at)` across all four), so the single
`.select().from()` becomes four unioned/parallel aggregates — but the try/catch shape, the
`Number(...) || 0` coercion, the `null`-means-empty semantics and the degrade-to-zero-state
posture are copied verbatim.

---

### `src/lib/trash/settings.test.ts` (test, CRUD)

**Analog:** `src/lib/audit/settings.test.ts`

**Minimal-surface mock pattern** (lines 18-24) — mock only what the module is allowed to
touch, so an added query surfaces as a TypeError:

```typescript
vi.mock("@/db", () => ({
  db: {
    query: { appSettings: { findFirst: vi.fn() } },
    insert: vi.fn(),
    select: vi.fn(),
  },
}))
```

**Upsert-capture helper** (lines 50-70) — how the write path's arguments are asserted without
a database:

```typescript
function captureUpsert(behaviour: "resolve" | "reject" = "resolve"): CapturedUpsert {
  const captured: CapturedUpsert = { values: undefined, set: undefined, target: undefined }

  mockDb.insert.mockReturnValue({
    values: (v: Record<string, unknown>) => {
      captured.values = v
      return {
        onConflictDoUpdate: (config: { target: unknown; set: Record<string, unknown> }) => {
          captured.target = config.target
          captured.set = config.set
          return behaviour === "resolve"
            ? Promise.resolve(undefined)
            : Promise.reject(new Error("write failed"))
        },
      }
    },
  })

  return captured
}
```

**Key-constant assertion** (lines 106-115) — pins the literal so nothing reads a different key
by accident:

```typescript
it("queries app_settings exactly once, on the audit retention key", async () => {
  mockDb.query.appSettings.findFirst.mockResolvedValue({ value: 90 })

  await readRetentionDays()

  expect(mockDb.query.appSettings.findFirst).toHaveBeenCalledTimes(1)
  expect(AUDIT_RETENTION_KEY).toBe("audit.retention_days")
})
```

---

### `src/lib/trash/prune.ts` (background processor, batch)

**Analog:** `src/lib/audit/prune.ts` — the structural template, copied in shape not merely in
spirit. **RESEARCH § Retention Pruner is explicit that the `ctid` trick does NOT transfer.**

**Constants block** (lines 22-39):

```typescript
/** Let the server finish booting before the first tick — nothing here is time-critical. */
export const INITIAL_DELAY = 60_000

/** Daily. Retention is a window measured in days; there is nothing to gain from tighter. */
export const TICK_INTERVAL = 24 * 60 * 60 * 1000

/** Measured: 17.8 ms per batch against a 1,000,000-row table with the `created_at` index. */
export const BATCH_SIZE = 5_000

/**
 * ⇒ at most 100k rows deleted per day, ⇒ at most ~0.4 s of DELETE per tick.
 * The cap is a denial-of-service control (T-36-39) … Its cost is starvation … That is
 * accepted BECAUSE the tick logs its total every time, so the shortfall is visible rather
 * than silent (T-36-09).
 */
export const MAX_BATCHES_PER_TICK = 20
```

Phase 37 substitutions: `BATCH_SIZE` **100–500**, not 5,000 (a trash purge is a multi-statement
teardown per row, not one bulk `DELETE`), and `MAX_BATCHES_PER_TICK` resized to match.

**Start + announce pattern** (lines 45-48) — the log line is the deployment gate:

```typescript
export function startAuditPruner(): void {
  console.log("[audit-prune] Starting with initial delay of 60s, ticking daily")
  scheduleTick(INITIAL_DELAY)
}
```

**The setTimeout-chaining loop — copy this exactly** (lines 50-93). Note the three
load-bearing properties: `scheduleTick` is module-private, the reschedule sits **outside** the
`try`, and the tick logs a line every time even at zero:

```typescript
/**
 * Module-private on purpose: the chain owns its own cadence, and an exported `scheduleTick`
 * would let a caller start a second, overlapping chain.
 */
function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      const days = await readRetentionDays()

      if (days === null) {
        // FAILS CLOSED — delete nothing at all. `null` is what an unset, cleared, corrupted,
        // out-of-range or pre-migration settings row produces … There is deliberately no
        // `?? 90` here: the 90-day default is a SEEDED `app_settings` row from migration
        // 0014, and a code-level fallback would turn a tampered row back into an unbounded
        // delete (T-36-18).
        console.log("[audit-prune] retention unset or invalid — no rows deleted")
      } else {
        let total = 0

        for (let i = 0; i < MAX_BATCHES_PER_TICK; i++) {
          const deleted = await deleteBatch(days, BATCH_SIZE)
          total += deleted

          if (deleted < BATCH_SIZE) {
            break // caught up — a short batch means nothing older is left
          }
        }

        // Logged every tick, even at zero: this line is the only signal that the pruner is
        // falling behind the write rate, which is the starvation failure mode of the cap.
        console.log(`[audit-prune] deleted ${total} row(s) older than ${days}d`)
      }
    } catch (error) {
      console.error("[audit-prune] Tick error:", error)
    }

    // Always schedule the next tick
    scheduleTick(TICK_INTERVAL)
  }, delay)
}
```

**Server-side cutoff arithmetic** (lines 120-131) — the `make_interval` form is mandatory; the
`ctid` subselect is **not** transferable (see divergence below):

```typescript
async function deleteBatch(days: number, limit: number): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM audit_log
    WHERE ctid IN (
      SELECT ctid FROM audit_log
      WHERE created_at < now() - make_interval(days => ${days})
      LIMIT ${limit}
    )
  `)

  return affectedRows(result)
}
```

**Phase 37 divergence (RESEARCH § Retention Pruner):** the trash pruner selects a capped batch
of expired **ids** and runs the ordered purge transaction for each:

```sql
SELECT id FROM deals WHERE deleted_at < now() - make_interval(days => $1) LIMIT $2
```

Entity types are processed **leaves-first (activities → deals → people → organizations)** so a
parent is never purged while a sibling pass is still detaching from it (CONTEXT § Purge
Cascade). The `ctid` form must not be copied into this context.

---

### `src/lib/trash/prune.test.ts` (test, fake timers)

**Analog:** `src/lib/audit/prune.test.ts` — **the only fake-timer precedent in the repo.**

**Mock + dialect scaffold** (lines 31-51):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

vi.mock("@/db", () => ({ db: { execute: vi.fn() } }))
vi.mock("@/lib/audit/settings", () => ({ readRetentionDays: vi.fn() }))

import { db } from "@/db"
import { readRetentionDays } from "@/lib/audit/settings"
import {
  startAuditPruner,
  BATCH_SIZE,
  MAX_BATCHES_PER_TICK,
  INITIAL_DELAY,
  TICK_INTERVAL,
} from "./prune"

const mockExecute = (db as unknown as { execute: ReturnType<typeof vi.fn> }).execute
const mockReadRetentionDays = vi.mocked(readRetentionDays)

const dialect = new PgDialect()
```

**SQL-rendering helper** (lines 62-73) — this is how a statement's real text and bind params
are asserted without a database. Reuse it in `queries.test.ts` too:

```typescript
/** The statement `db.execute` was called with, rendered to real SQL text + bind params. */
function renderedCall(index = 0): { sql: string; params: unknown[] } {
  const arg = mockExecute.mock.calls[index]?.[0] as SQL | undefined
  if (!arg) throw new Error(`db.execute was not called ${index + 1} time(s)`)
  const { sql, params } = dialect.sqlToQuery(arg)
  return { sql, params: params as unknown[] }
}

function logLines(): string[] {
  const spy = console.log as unknown as ReturnType<typeof vi.fn>
  return spy.mock.calls.map((call: unknown[]) => call.join(" "))
}
```

**Fake-timer lifecycle** (lines 75-88):

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})

  mockReadRetentionDays.mockResolvedValue(90)
  mockExecute.mockResolvedValue(deleteResult(0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
```

**Fail-closed assertion — assert the ABSENCE of the call** (lines 125-134):

```typescript
it("fails closed: a null retention window issues no database call at all", async () => {
  mockReadRetentionDays.mockResolvedValue(null)

  startAuditPruner()
  await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

  // The absence of the call is the assertion. A zero row count would also pass a naive
  // check while an unbounded DELETE was already in flight.
  expect(mockExecute).not.toHaveBeenCalled()
})
```

**Always-reschedules assertion** (lines 226-250):

```typescript
it("leaves a pending timer when reading the retention window rejects", async () => {
  mockReadRetentionDays.mockRejectedValue(new Error("settings read blew up"))

  startAuditPruner()
  await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

  expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)
  expect(console.error).toHaveBeenCalled()
})

it("leaves a pending timer when the delete itself rejects, and still runs the next tick", async () => {
  mockExecute.mockRejectedValue(new Error("deadlock detected"))

  startAuditPruner()
  await vi.advanceTimersByTimeAsync(INITIAL_DELAY)

  expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)

  mockExecute.mockResolvedValue(deleteResult(0))
  await vi.advanceTimersByTimeAsync(TICK_INTERVAL)

  expect(mockReadRetentionDays).toHaveBeenCalledTimes(2)
})
```

**No-Date-binding assertion** (lines 195-210) — carry this forward verbatim; the trash pruner
has the same hazard:

```typescript
const { sql, params } = renderedCall()
expect(sql).toContain("make_interval(days =>")
expect(params).toContain(90)
expect(params.some((p) => p instanceof Date)).toBe(false)
```

---

### `src/lib/trash/queries.ts` (service/read, CRUD read)

No single analog. Three sources, one per function.

**Analog A — `listTrashed` / `countTrashed`:** `src/app/organizations/page.tsx:18-58`. The
existing shape: an explicit `deletedAt` predicate, a `leftJoin` for the parent, `desc()`
ordering, and a `limit(PAGE_SIZE * page + 1)` hasMore trick:

```typescript
const PAGE_SIZE = 50

async function getOrganizations(search?: string, pageNum: number = 1) {
  const limit = PAGE_SIZE * pageNum + 1

  const whereClause = /* … */ isNull(organizations.deletedAt)

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      website: organizations.website,
      createdAt: organizations.createdAt,
      ownerName: users.name,
    })
    .from(organizations)
    .leftJoin(users, eq(organizations.ownerId, users.id))
    .where(whereClause)
    .orderBy(desc(organizations.createdAt))
    .limit(limit)

  const hasMore = rows.length > PAGE_SIZE * pageNum
  const result = hasMore ? rows.slice(0, PAGE_SIZE * pageNum) : rows

  return { rows: result, hasMore }
}
```

Phase 37 inverts exactly one thing — `isNull(t.deletedAt)` becomes `isNotNull(t.deletedAt)` —
and adds the owner scope plus the parent-trashed computed columns (RESEARCH § Code Examples).
Keep the `PAGE_SIZE` constant, the `+1` hasMore probe, and `orderBy(desc(...))` unchanged.

**Analog B — `resolveDeletedBy` batched lookup:** `src/lib/timeline/sources.ts:705-732`
(`auditSource.hydrate`). This is the join shape to copy — three LEFT JOINs, one round trip,
and the comment explaining why every join is LEFT:

```typescript
const rows = await db
  .select({
    id: auditLog.id,
    entityType: auditLog.entityType,
    action: auditLog.action,
    changes: auditLog.changes,
    actorKind: auditLog.actorKind,
    createdAt: auditLog.createdAt,
    actorId: users.id,
    actorName: users.name,
    actorEmail: users.email,
    runId: workflowRuns.id,
    workflowId: workflows.id,
    workflowName: workflows.name,
  })
  .from(auditLog)
  // All three actor references are nullable and mutually exclusive in practice, so every
  // join is a LEFT join and at most one of them matches per row.
  .leftJoin(users, eq(auditLog.actorUserId, users.id))
  .leftJoin(workflowRuns, eq(auditLog.workflowRunId, workflowRuns.id))
  // One hop further than the run: the entry links to the RUN page …
  .leftJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
  // No soft-delete predicate: `audit_log` has no such column (see `branch` above).
  .where(inArray(auditLog.id, ids))
```

Phase 37 divergence: the `WHERE` becomes `entity_type = $1 AND action = 'deleted' AND
entity_id = ANY($2)` with a `DISTINCT ON (entity_id)` + `ORDER BY entity_id, created_at DESC`
(RESEARCH Pattern 3), which requires a raw `sql` fragment rather than the builder. The
`inArray` + one-round-trip discipline is the part to carry over.

**Analog C — error containment for a page render:** `src/lib/audit/settings.ts:144-167`
(`readAuditStats`) — the try/catch-and-degrade posture quoted above. `/trash` has no
`error.tsx` above it (UI-SPEC § States), so every query in this module must fail into a value
the page can render, never a throw.

---

### `src/lib/trash/present.ts` (utility, transform)

**Analog:** `src/components/timeline/audit-entry.tsx:84-96` (the icon/label maps) and
`src/lib/timeline/sources.ts:744-782` (the actor-resolution guards).

**Actor-kind maps** (`audit-entry.tsx:84-96`) — **reuse these message keys, do not duplicate
them under `trash.*`** (UI-SPEC § Reused keys):

```typescript
const ACTOR_KIND_ICONS: Record<NonUserActorKind, ComponentType<{ className?: string }>> = {
  workflow_run: Workflow,
  api_key: Key,
  import: Download,
  system: Cog,
}

const ACTOR_KIND_LABEL_KEYS: Record<NonUserActorKind, string> = {
  workflow_run: "actorKind.workflowRun",
  api_key: "actorKind.apiKey",
  import: "actorKind.import",
  system: "actorKind.system",
}
```

**Exhaustive switch with a `never` guard** (`audit-entry.tsx:280-317`) — the five-kind render,
including the two degradations Phase 37 must preserve:

```typescript
let actorNode: ReactNode
switch (entry.actorKind) {
  case "user":
    actorNode = (
      <span className={ACTOR_NAME_CLASS}>
        {entry.actor?.name ?? entry.actor?.email ?? t("unknownActor")}
      </span>
    )
    break
  case "workflow_run":
    actorNode =
      entry.workflowRun === null ? (
        // The workflow is gone. The kind label, with no link — never a broken one.
        <span className={ACTOR_NAME_CLASS}>{kindLabel}</span>
      ) : (
        <Link href={`/workflows/${entry.workflowRun.workflowId}/runs/${entry.workflowRun.runId}`}>
          {entry.workflowRun.workflowName}
        </Link>
      )
    break
  case "api_key":
    actorNode = <span className={ACTOR_NAME_CLASS}>{entry.apiKeyName ?? kindLabel}</span>
    break
  case "import":
  case "system":
    actorNode = <span className={ACTOR_NAME_CLASS}>{kindLabel}</span>
    break
  default: {
    const unhandled: never = entry.actorKind
    void unhandled
    actorNode = null
  }
}
```

**The `user`-actor guard to copy** (`sources.ts:754-761`) — the `actorKind === "user"` test in
front of the null check is what stops an `api_key` row (which stores the key OWNER in
`actor_user_id`) being attributed to that person:

```typescript
actor:
  row.actorKind === "user" && row.actorId !== null && row.actorEmail !== null
    ? { id: row.actorId, name: row.actorName, email: row.actorEmail }
    : null,
```

**`apiKeyName` is always null and honestly so** (`sources.ts:771-779`) — RESEARCH Pitfall 5
overrides the UI-SPEC here. The `api_key` badge can only ever show the kind label:

```typescript
// ALWAYS NULL, AND HONESTLY SO. `audit_log` carries no api key reference — it has
// `actor_user_id`, `workflow_run_id` and `import_session_id` and nothing else
// (audit-log.ts:53-55), and the subscriber stores the key's OWNER in `actor_user_id`
// for this kind. Resolving a name through that owner would pick an arbitrary one of
// that user's keys and print it as fact …
apiKeyName: null,
```

**New discrimination this phase adds (no analog):** absence from the `DISTINCT ON` result set
⇒ `trash.actor.notRecorded`; presence with `actorKind = "user"` and a null joined user ⇒
`audit.unknownActor`. The two must not collapse (RESEARCH Pitfall 4 — on live data *100%* of
trash rows are currently `notRecorded`). The presenter must return a discriminated shape, not
`null` for both.

---

### `src/lib/mutations/{deals,people,organizations,activities}.ts` — restore (model, CRUD)

**Analog:** `deleteDealMutation`, `src/lib/mutations/deals.ts:461-498`. Restore is its mirror,
placed directly beside it in the same file.

**Imports already present in the file** (lines 1-14) — restore needs `isNotNull` added:

```typescript
import { db } from "@/db"
import { deals, stages, organizations, people, dealAssignees } from "@/db/schema"
import type { CustomFieldDefinition, EntityType } from "@/db/schema"
import { eq, and, isNull, desc, sql } from "drizzle-orm"
import { z } from "zod"
import { crmBus } from "@/lib/events"
import type { CrmEventPayload, DealStageChangedPayload } from "@/lib/events"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  recalculateFormulas,
  stripFormulaKeys,
  ENTITY_NATIVE_ATTRIBUTES,
  type RecalculateFormulasInput,
} from "@/lib/formula-recalc"
```

**Core mutation pattern to mirror** (lines 461-498) — existence check first, `try` around the
write only, `console.error` + a prose error on failure:

```typescript
export async function deleteDealMutation(
  id: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  // Check if deal exists
  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, id), isNull(deals.deletedAt)),
  })

  if (!deal) {
    return { success: false, error: "Deal not found" }
  }

  try {
    // No formula recalculation here: a soft delete is not a save. Children of a deleted parent
    // keeping a stale derived value is a known limitation, recorded in plan 34-11.
    await db
      .update(deals)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(deals.id, id))

    // Emit CRM event. `data` is `{ id }` here, so `previous` is the ONLY state a subscriber can
    // build a tombstone from — omitting it would silently produce an audit row with no detail.
    crmBus.emit("deal.deleted", buildEventPayload(
      id,
      "deleted",
      { id },
      userId,
      null,
      deal as unknown as Record<string, unknown>,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to delete deal:", error)
    return { success: false, error: "Failed to delete deal" }
  }
}
```

**Three deliberate divergences for restore** (all locked by CONTEXT/RESEARCH):

1. The existence predicate **inverts**: `and(eq(deals.id, id), isNotNull(deals.deletedAt))`.
2. The miss returns a **discriminated code**, not prose: `{ success: false, error: "NOT_IN_TRASH" }`
   — the UI needs `trash.error.alreadyPurged` vs `trash.error.restoreFailed` (RESEARCH Pitfall 7).
3. **No `crmBus.emit`** — locked decision, no `{entity}.restored` event. The audit row is
   written directly instead (see § Shared Patterns → Direct audit row).

And restore **does** recalculate, with a broad `changedFields` (RESEARCH Pitfall 1 — an empty
or `['deletedAt']` list silently evaluates nothing):

```typescript
await recalculateFormulas({
  entityType: "deal",
  entityId: id,
  changedFields: [
    CHANGED_FIELDS_CUSTOM_SENTINEL,
    ...Object.values(ENTITY_NATIVE_ATTRIBUTES.deal),
  ],
})
```

Call it **after** the `UPDATE`: `cascadeToChildren` filters `isNull(relation.deletedAt)`, so
children only re-enter the cascade once the parent is live.

---

### `src/lib/mutations/{…}.ts` — purge (model, CRUD)

**Analog:** `deleteWorkflow`, `src/lib/mutations/workflows.ts:191-215` — the repo's **only**
existing multi-table hard delete, and the source of the ordered-teardown idiom:

```typescript
export async function deleteWorkflow(id: string): Promise<DeleteResult> {
  const existing = await db.query.workflows.findFirst({
    where: eq(workflows.id, id),
  })

  if (!existing) {
    return { success: false, error: "Workflow not found" }
  }

  // Cascade delete: steps -> runs -> workflow
  const runs = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, id))

  if (runs.length > 0) {
    const runIds = runs.map((r) => r.id)
    await db.delete(workflowRunSteps).where(inArray(workflowRunSteps.runId, runIds))
    await db.delete(workflowRuns).where(eq(workflowRuns.workflowId, id))
  }

  await db.delete(workflows).where(eq(workflows.id, id))

  return { success: true }
}
```

**The gap the analog leaves, which Phase 37 must close:** `deleteWorkflow` is **not** wrapped
in a transaction. Purge must be, because a partial teardown leaves FK-orphaned child rows with
no parent to purge them later. Wrap the ordering in `db.transaction(async (tx) => { … })` per
RESEARCH Pattern 2: notes → pure children (`dealAssignees`, `dealStageHistory`) hard-deleted →
independent children **detached** (`activities.dealId = null`, `deals.organizationId = null`,
`people.organizationId = null`, `deals.personId = null`) → the row itself → the purge audit row,
all inside the transaction.

**Do not** attempt a bare `DELETE` on deals/people/organizations: every FK is `ON DELETE NO
ACTION` and it raises SQLSTATE 23503 today (RESEARCH § Purge Blast Radius, four empirical
rolled-back probes).

---

### `src/lib/mutations/{…}.test.ts` (test, CRUD) — extend, do not create

**Analog:** `src/lib/mutations/deals.test.ts:1-81` — the existing scaffold. New restore/purge
describe blocks go in the same file, reusing this mock setup unchanged:

```typescript
vi.mock("@/db", () => ({
  db: {
    query: {
      stages: { findFirst: vi.fn() },
      organizations: { findFirst: vi.fn() },
      people: { findFirst: vi.fn(), findMany: vi.fn() },
      deals: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
  },
}))

vi.mock("@/lib/events", () => ({ crmBus: { emit: vi.fn() } }))

// Mock the recalculation helper. This suite tests CALL ORDERING and ARGUMENTS — evaluation
// behaviour is covered exhaustively by formula-recalc.test.ts. importOriginal keeps the real
// vocabulary constants (ENTITY_NATIVE_ATTRIBUTES) so the create-path scope assertion compares
// against the single source of truth rather than a hard-coded copy.
vi.mock("@/lib/formula-recalc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/formula-recalc")>()
  return {
    ...actual,
    recalculateFormulas: vi.fn(),
    stripFormulaKeys: vi.fn((values: Record<string, unknown>) => values),
  }
})
```

The `importOriginal` line is the precedent RESEARCH Pitfall 1 cites: assert on the
`changedFields` argument against the real `ENTITY_NATIVE_ATTRIBUTES`, never a hardcoded copy,
and never merely that `recalculateFormulas` *was called*. Purge tests need `db.transaction`
added to the mock and must assert **call order**, not just call count.

---

### `src/app/trash/actions.ts` (server action, request-response)

**Analog:** `src/app/deals/actions.ts:25-89` for the actor wrap and the ownership guard;
`src/app/admin/audit/actions.ts` for the admin gate.

**Imports + actor-scope pattern** (`deals/actions.ts:1-20,36-42`):

```typescript
"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { runWithActor } from "@/lib/audit/actor-context"
import { createDealMutation, /* … */ } from "@/lib/mutations/deals"

// The actor scope opens AFTER the session check above, never before it, so an
// unauthenticated call establishes no actor at all (T-36-02). `userId` is
// `session.user.id` and nothing else — never a form field, never a search param.
const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
  createDealMutation({ … })
)
```

**Owner-or-admin guard** (`deals/actions.ts:69-89`) — the exact shape CONTEXT locks for trash
read and restore:

```typescript
const session = await auth()
if (!session?.user?.id) {
  return { success: false, error: "Not authenticated" }
}

// Auth check: verify ownership
const deal = await db.query.deals.findFirst({
  where: and(eq(deals.id, id), isNull(deals.deletedAt)),
})

if (!deal) {
  return { success: false, error: "Deal not found" }
}

if (deal.ownerId !== session.user.id && session.user.role !== "admin") {
  return { success: false, error: "Not authorized" }
}

const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
  updateDealMutation(id, data, session.user.id)
)
```

For trash the predicate inverts to `isNotNull(deals.deletedAt)`. For **purge** the guard is
`session.user.role !== "admin"` alone (see § Shared Patterns → Admin gate).

---

### `src/app/trash/actions.test.ts` (test, request-response)

**Analog:** `src/app/notes/actions.test.ts:1-70` — the only suite in the repo that mocks
`@/auth` to swap the session per test, which is exactly what the purge authorization matrix
needs. (`src/app/deals/actions.test.ts` and `src/app/admin/users/actions.test.ts` are
pure-logic suites and are **not** the analog.)

```typescript
/**
 * SCAFFOLD NOTE — this is new ground for the repo. No other test here mocks `@/auth`.
 * … the whole point of this suite is to swap the session per test (absent / member /
 * admin / author), so `auth` is mocked as a bare `vi.fn()` and each test drives
 * `mockResolvedValue` itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

vi.mock("@/db", () => ({ db: { query: { users: { findFirst: vi.fn() } } } }))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/mutations/notes", () => ({
  createNoteMutation: vi.fn(),
  updateNoteMutation: vi.fn(),
  softDeleteNoteMutation: vi.fn(),
  findNoteById: vi.fn(),
}))

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { addNote, deleteNote, editNote } from "./actions"
```

Also copy the "what is deliberately NOT mocked" discipline: keep the real authorization
predicate in play so the test proves enforcement rather than proving a stub was called.

---

### `src/app/trash/page.tsx` (page, server RSC)

**Analog A — the list-page shell** (`src/app/organizations/page.tsx:60-104`). The header idiom
(`p-2 bg-primary/10 rounded-lg` icon tile), `container py-8`, `space-y-6`, and the
`searchParams` promise signature:

```tsx
export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>
}) {
  const params = await searchParams
  const pageNum = Math.max(1, parseInt(params.page ?? "1"))
  const search = params.search ?? ""

  const { rows: orgs, hasMore } = await getOrganizations(search || undefined, pageNum)
  const t = await getTranslations('organizations')

  return (
    <div className="container py-8">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('manageOrganizations')}</p>
          </div>
        </div>

        <Card>
          <CardContent>
            <DataTable columns={columns} data={orgs} hasMore={hasMore} … />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

**Analog B — the RSC/client split discipline** (`src/app/admin/audit/page.tsx:33-57`): parallel
independent reads that cannot throw, plus `getTranslations` / `getFormatter` in the server
component:

```typescript
import { getFormatter, getTranslations } from "next-intl/server"

const t = await getTranslations("audit")
const format = await getFormatter()

// Independent reads; neither throws (both fail closed inside `settings.ts`), so the page
// renders even when the database is unhappy.
const [retentionDays, stats] = await Promise.all([
  readRetentionDays(),
  readAuditStats(),
])
```

`/trash` extends this to `Promise.all([...four counts, activeTabRows, deletedByMap,
readTrashRetentionDays()])`. Per UI-SPEC, **only the active tab is queried** for rows; the
other three contribute counts only.

---

### `src/app/trash/trash-tabs.tsx` (component, client)

**Analog:** `src/app/activities/activities-client.tsx:144-156` — the only Tabs usage in a list
surface, and the source of the `gap-2` trigger idiom:

```tsx
<Tabs defaultValue="list" className="w-full">
  <TabsList className="mb-4">
    <TabsTrigger value="list" className="gap-2">
      <List className="h-4 w-4" />
      {t('list')}
    </TabsTrigger>
    <TabsTrigger value="calendar" className="gap-2">
      <Calendar className="h-4 w-4" />
      {t('calendar')}
    </TabsTrigger>
  </TabsList>

  <TabsContent value="list">…</TabsContent>
</Tabs>
```

**Two mandatory divergences (UI-SPEC § Route and tab mechanics):** the value is **controlled**
(`value={type}` + `onValueChange` → `router.push`), never `defaultValue`; and
`activationMode="manual"` is required so arrow-key exploration does not fire one navigation per
keystroke.

**URL-param writing pattern** (`activities-client.tsx:96-100`):

```typescript
const handleLoadMore = () => {
  const sp = new URLSearchParams(window.location.search)
  sp.set("page", String(currentPage + 1))
  router.push(`/activities?${sp.toString()}`)
}
```

Note: switching tabs must **reset** `page`, not preserve it — `sp.delete("page")` before push.

---

### `src/app/trash/trash-table.tsx` (component, client)

**Analog A — the TanStack table body** (`src/app/organizations/data-table.tsx:125-223`),
including the `h-24 text-center` empty cell and the `Load More` pagination idiom UI-SPEC pins:

```tsx
const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
  meta: { refresh: refresh || (() => {}), onEdit: handleEdit, onDelete: handleDeleteClick },
})

return (
  <div className="space-y-4">
    <div className="rounded-md border" {...containerProps}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No organizations found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>

    {hasMore && (
      <div className="flex justify-center pt-2">
        <Button variant="outline" onClick={() => router.push(…)}>Load More</Button>
      </div>
    )}
  </div>
)
```

**Deliberate omissions for `/trash` (UI-SPEC):** no `useDataTableKeyboard` (its
`onOpen`/`onEdit`/`onCreate` contract has no meaning on a trashed record — so drop
`containerProps`/`rowProps` and the import), no search `Input`, no "Add" button, and the empty
cell text is translated per entity rather than a hardcoded English literal.

**Analog B — the controlled AlertDialog** (`src/app/admin/audit/retention-form.tsx:194-229`).
This is the exact shape the purge confirmation must take: controlled, no `AlertDialogTrigger`,
`event.preventDefault()` on the confirm so Radix does not close mid-request:

```tsx
<AlertDialog
  open={confirmOpen}
  onOpenChange={(open) => {
    if (isPending) return
    setConfirmOpen(open)
  }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("retention.shortenDialog.title")}</AlertDialogTitle>
      <AlertDialogDescription>
        {t("retention.shortenDialog.description", { days: parsed ?? 0 })}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={isPending}>
        {t("retention.shortenDialog.cancel")}
      </AlertDialogCancel>
      <AlertDialogAction
        onClick={(event) => {
          // Radix closes on click by default; the dialog has to stay open while the
          // save is in flight so the spinner and the disabled state are visible.
          event.preventDefault()
          if (parsed !== null) save(parsed)
        }}
        disabled={isPending}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {t("retention.shortenDialog.confirm")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Analog C — the transition + toast + error handling** (`retention-form.tsx:120-139`):

```typescript
function save(days: number) {
  startTransition(async () => {
    try {
      const result = await saveRetention(days)

      if (result.success) {
        setSavedDays(days)
        setConfirmOpen(false)
        toast.success(t("retention.saved"))
        return
      }

      // A refusal and a thrown action are the same event to the operator, and neither
      // one touches what they typed.
      toast.error(t("retention.saveFailed"))
    } catch {
      toast.error(t("retention.saveFailed"))
    }
  })
}
```

For restore, the failure branch must **discriminate**: `NOT_IN_TRASH` →
`toast.error(t('trash.error.alreadyPurged'))` + `router.refresh()`; anything else →
`trash.error.restoreFailed` with the row left in place.

---

### `src/app/trash/trash-columns.tsx` (component, client)

**Analog:** `src/app/organizations/columns.tsx:30-131` — the `useColumns()` hook form (the
translated variant; ignore the legacy untranslated `export const columns` at 135-233):

```tsx
"use client"

import { ColumnDef } from "@tanstack/react-table"
import { useFormatter, useTranslations } from 'next-intl'

export function useColumns(): ColumnDef<Organization, unknown>[] {
  const t = useTranslations('organizations')

  return [
    {
      accessorKey: "name",
      header: t('name'),
      cell: ({ row }) => { … },
    },
    {
      accessorKey: "website",
      header: t('website'),
      cell: ({ row }) => {
        const website = row.getValue("website") as string | null
        if (!website) {
          return <span className="text-muted-foreground">-</span>
        }
        …
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row, table }) => {
        const organization = row.original
        // @ts-expect-error - meta callbacks are passed via table options
        const onDelete = table.options.meta?.onDelete

        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onDelete?.(organization)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        )
      },
    },
  ]
}
```

The `text-destructive hover:text-destructive` ghost row action at line 121 is the precedent
UI-SPEC cites for `Delete permanently`. **Three UI-SPEC divergences:** the actions header is
`<span className="sr-only">{t('common.actions')}</span>` rather than `""`; row actions are
`size="sm"` with **visible text labels**, not `size="icon"` with `sr-only`; and the record-name
cell is plain text at `text-sm leading-tight font-semibold whitespace-normal`, **not** a
`<Link>`. The `-` empty-cell idiom (`<span className="text-muted-foreground">`) carries over as
the em-dash for empty secondary columns.

---

### `src/app/admin/trash/page.tsx` (page, server RSC)

**Analog:** `src/app/admin/audit/page.tsx` — a near-exact mirror. Copy the whole file structure
including the "NO AUTH CODE HERE, DELIBERATELY" header (the `/admin` layout redirect covers the
render; the action carries its own check).

**Card + readout pattern** (lines 66-135):

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base leading-tight font-semibold">
      {t("retention.windowTitle")}
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-2">
    <RetentionForm retentionDays={retentionDays} />

    {retentionDays === null ? (
      <p className="text-muted-foreground text-xs">{t("retention.notSet")}</p>
    ) : null}
  </CardContent>
</Card>

<Card>
  <CardHeader>
    <CardTitle className="text-base leading-tight font-semibold">
      {t("retention.costTitle")}
    </CardTitle>
  </CardHeader>
  <CardContent>
    <dl className="flex flex-wrap gap-x-8 gap-y-4">
      <div>
        <dt className="text-muted-foreground text-xs">{t("retention.entriesLabel")}</dt>
        <dd className="text-sm leading-tight font-semibold">{format.number(stats.entryCount)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">{t("retention.oldestLabel")}</dt>
        <dd className="text-sm leading-tight font-semibold">
          {oldestIso ? (
            <time
              dateTime={oldestIso}
              title={format.dateTime(new Date(oldestIso), {
                year: "numeric", month: "long", day: "numeric",
                hour: "numeric", minute: "numeric",
              })}
            >
              <RelativeTime date={oldestIso} />
            </time>
          ) : (
            // An empty table has no oldest entry, which is not the same as "now".
            t("retention.oldestNone")
          )}
        </dd>
      </div>
    </dl>
  </CardContent>
</Card>
```

Substitutions only: `t("trash.retention.*")`, `recordsLabel` for `entriesLabel`,
`stats.trashedCount` / `stats.oldestDeletedAt`. The `<h1 className="text-3xl font-bold">` with
**no** icon tile (line 62) is the `/admin/*` idiom and must not gain one.

---

### `src/app/admin/trash/retention-form.tsx` (component, client)

**Analog:** `src/app/admin/audit/retention-form.tsx` — copy in full, changing only the
namespace, `MAX_DAYS`, and the element ids.

**Bounds-not-imported pattern** (lines 24-30, 67-72) — carry the comment forward verbatim, it
explains a real constraint:

```typescript
/**
 * THE RANGE IS NOT IMPORTED, DELIBERATELY
 * `RETENTION_MIN` / `RETENTION_MAX` live in `src/lib/audit/settings.ts`, which imports the
 * database. Importing them here would drag a server-only module into the browser bundle,
 * so the two bounds are written out below instead. … If those constants ever change, this
 * file changes with them.
 */

/** Mirrors `RETENTION_MIN` / `RETENTION_MAX` — see the module header for why they are not imported. */
const MIN_DAYS = 1
const MAX_DAYS = 3650

const INPUT_ID = "retention-days"
const HELP_ID = "retention-days-help"
```

Phase 37: `MAX_DAYS = 365`, `INPUT_ID = "trash-retention-days"`.

**Digits-only parse + enablement logic** (lines 86-118):

```typescript
/**
 * `null` for anything that is not a whole number of days.
 * The digits-only test is what rejects `1.5`, `1e3`, `-1`, ` `, `Infinity` and the empty
 * string, all of which `Number()` alone would either accept or turn into `0`.
 */
function parseDays(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

const parsed = parseDays(value)
const inRange = parsed !== null && parsed >= MIN_DAYS && parsed <= MAX_DAYS
const changed = parsed !== null && parsed !== savedDays
const canSave = inRange && changed && !isPending

/** Only a LOWERED window destroys anything. Raising it, or setting it for the first time, does not. */
const lowers = inRange && savedDays !== null && parsed !== null && parsed < savedDays
```

**Input + help + save block** (lines 152-184):

```tsx
<div className="space-y-2">
  <Label htmlFor={INPUT_ID}>{t("retention.windowLabel")}</Label>

  <Input
    id={INPUT_ID}
    type="number"
    inputMode="numeric"
    min={MIN_DAYS}
    max={MAX_DAYS}
    step={1}
    value={value}
    onChange={(event) => setValue(event.target.value)}
    disabled={isPending}
    aria-describedby={HELP_ID}
    className="max-w-32"
  />

  {/* Always present and always neutral. It is the rule, not a reaction to breaking it. */}
  <p id={HELP_ID} className="text-muted-foreground text-xs">{t("retention.windowHelp")}</p>

  {/* The one filled button this phase adds, and this page's primary visual anchor. */}
  <Button variant="default" className="mt-2" onClick={handleSave} disabled={!canSave}>
    {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
    {isPending ? t("retention.saving") : t("retention.save")}
  </Button>
```

---

### `src/app/admin/trash/actions.ts` (server action, request-response)

**Analog:** `src/app/admin/audit/actions.ts` — 40 lines, copy whole:

```typescript
"use server"

/**
 * AUTHORIZATION (T-36-30)
 * `src/app/admin/layout.tsx` redirects a non-admin away from every `/admin/*` PAGE
 * RENDER. It does not — and cannot — protect a server action, which is a POST endpoint
 * the browser can invoke directly with no page involved. So the role is re-checked here.
 * The disabled Save button in `retention-form.tsx` is cosmetic and is never the control.
 *
 * VALIDATION
 * Deliberately not re-implemented. `writeRetentionDays` validates with zod BEFORE any
 * database call and returns its own error string; forwarding that result unchanged keeps
 * one source of truth for the range.
 */

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import { writeRetentionDays, type WriteRetentionResult } from "@/lib/audit/settings"

export async function saveRetention(days: number): Promise<WriteRetentionResult> {
  const session = await auth()

  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  const result = await writeRetentionDays(days)

  if (result.success) {
    revalidatePath("/admin/audit")
  }

  return result
}
```

---

### `src/app/api/v1/trash/*` (route, request-response)

**Analog A — the admin-gated read route:** `src/app/api/v1/audit/route.ts`.

**Closed-literal validation** (lines 44-73) — the `?type=` param must be narrowed to the four
entity literals before it reaches any predicate:

```typescript
const AUDIT_ENTITY_TYPES = [
  "organization", "person", "deal", "activity", "import_session",
] as const satisfies readonly AuditEntityType[]

const auditFilterSchema = z.object({
  entity_type: z.enum(AUDIT_ENTITY_TYPES).optional(),
  entity_id: z.string().min(1).optional(),
  actor_kind: z.enum(AUDIT_ACTOR_KINDS).optional(),
  workflow_run_id: z.string().min(1).optional(),
})
```

**Admin gate helper** (lines 119-131) — an unresolvable actor is **denied**:

```typescript
async function authorizeAuditRead(
  userId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const actor = await resolveActorRole(userId)

  if (!actor || actor.role !== "admin") {
    // 403 rather than 404: the endpoint's existence is not a secret worth keeping …
    return { ok: false, response: Problems.forbidden() }
  }

  return { ok: true }
}
```

**Handler envelope** (lines 140-203) — `withApiAuth`, authorization first, then validation,
then `parsePagination`, then `paginatedResponse`:

```typescript
export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      // Authorization runs FIRST, before the query string is even inspected …
      const authorized = await authorizeAuditRead(context.userId)
      if (!authorized.ok) return authorized.response

      const parsed = auditFilterSchema.safeParse({ … })
      if (!parsed.success) {
        return Problems.validation(parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "query",
          code: issue.code,
          message: issue.message,
        })))
      }

      const { offset, limit } = parsePagination(req)
      …
      return paginatedResponse(rows.map(serializeAuditEntry), total, offset, limit)
    } catch (error) {
      console.error("GET /api/v1/audit failed:", error)
      return Problems.internalError()
    }
  })
}
```

**Analog B — the per-entity write route:** `src/app/api/v1/deals/[id]/route.ts:384-432`
(`DELETE`). This is the shape the restore/purge endpoints mirror — ownership baked into the
existence query, `Problems.notFound`, `noContentResponse()`:

```typescript
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      const { id } = await params

      // Check deal exists and belongs to user
      const existing = await db.query.deals.findFirst({
        where: and(eq(deals.id, id), eq(deals.ownerId, context.userId), isNull(deals.deletedAt)),
      })

      if (!existing) {
        return Problems.notFound("Deal")
      }

      // Soft delete
      await db.update(deals).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(deals.id, id))

      crmBus.emit("deal.deleted", { … })

      return noContentResponse()
    } catch (error) {
      console.error("DELETE /api/v1/deals/[id] failed:", error)
      return Problems.internalError()
    }
  })
}
```

**Divergence:** the REST restore/purge routes should **delegate to the mutation layer** rather
than inlining the write (the way `DELETE /api/v1/organizations/[id]` delegates to
`deleteOrganizationMutation`), so there is exactly one restore implementation and one purge
implementation per entity. Note `ApiAuthContext` is `{ userId, keyId }` with **no role**, so
the purge route must re-read the role via `resolveActorRole` exactly as `authorizeAuditRead`
does.

---

### `scripts/trash-checks.sql` (script, SQL assertion)

**Analog:** `scripts/audit-log-checks.sql` — 94 lines, five parts.

**Header contract** (lines 1-27) — states what is proven, how to run it, and that it mutates
nothing:

```sql
-- =============================================================================
-- audit-log-checks.sql — the standing evidence script for migration 0014
-- =============================================================================
--
-- WHAT THIS PROVES
--   Part 1 — all four audit_log indexes exist in the catalog …
--   Part 3 — the locked 90-day retention default is present in app_settings as
--            DATA. If a future migration or a botched restore drops it, the
--            pruner silently stops and this script is what says so (T-36-43).
--
-- HOW TO RUN
--   docker compose -p pipelite exec -T postgres psql -U pipelite -d pipelite -f - < scripts/audit-log-checks.sql
--
--   psql runs on the container's unix socket, so no password is passed and none
--   may ever be added to this file or to the command line.
--
-- IT IS RE-RUNNABLE AND MUTATES NOTHING
--   Parts 1-3 are pure SELECTs. Part 4 is an EXPLAIN ANALYZE of a DELETE, which
--   really does execute the delete — so it is wrapped in BEGIN ... ROLLBACK and
--   removes nothing. Do not unwrap it.
-- =============================================================================
```

**Rolled-back destructive probe** (lines 78-86) — the idiom for testing a real constraint
without destroying data. Phase 37's version probes the FK teardown ordering per entity:

```sql
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
DELETE FROM audit_log
WHERE ctid IN (
  SELECT ctid FROM audit_log
  WHERE created_at < now() - make_interval(days => 90)
  LIMIT 5000
);
ROLLBACK;
```

Also copy the seeded-default assertion (Part 3, lines 66-69) with
`WHERE key = 'trash.retention_days'`, and the `\echo` section-labelling style throughout.

---

### `drizzle/00XX_*.sql` (migration, seed)

**Analog:** `drizzle/0014_sloppy_slapstick.sql:28-70` — the hand-added data seed carve-out.
Generate the file with `./node_modules/.bin/drizzle-kit generate` (`npx drizzle-kit` fails on
the host), then append **only** the `INSERT`, preserving the four-point justification comment
adapted for trash:

```sql
-- ============================================================================
-- HAND-ADDED DATA SEED (the only hand-edit to this file; everything above is
-- emitted by `drizzle-kit generate` and must never be edited).
--
-- 1. WHY IT EXISTS. … Without this seed, readRetentionDays() returns null on a
--    fresh install, the pruner deletes nothing …
--
-- 2. WHY IT IS DATA AND NOT A CODE FALLBACK. … a code-level default would mean a
--    corrupted, tampered or deliberately cleared setting row silently RESUMES
--    deleting rows … A seeded row plus fail-closed parsing gives BOTH properties
--    … Do not "simplify" either away.
--
-- 3. WHY HAND-EDITING THIS FILE DOES NOT VIOLATE PHASE 33 D-06. D-06 forbids
--    hand-written INDEX DDL in migration SQL … `generate` does not manage data
--    rows at all … The distinction is DDL versus data …
--
-- 4. WHY THE CONFLICT CLAUSE DOES NOTHING RATHER THAN UPSERTING. The seed must be
--    idempotent and must NEVER overwrite a value an admin has chosen.
-- ============================================================================
INSERT INTO "app_settings" ("key", "value") VALUES ('audit.retention_days', '90'::jsonb) ON CONFLICT ("key") DO NOTHING;
```

Phase 37 line: `('trash.retention_days', '30'::jsonb) ON CONFLICT ("key") DO NOTHING;`.
The table already exists (`src/db/schema/app-settings.ts`, "EXACTLY ONE key … this phase
introduces"), so this migration is **data only** — no DDL, no index.

---

### `instrumentation.ts` (config, event-driven)

**Analog:** the last block of the same file (lines 30-31). Append one dynamic import, inside
the `NEXT_RUNTIME === "nodejs"` guard:

```typescript
const { startAuditPruner } = await import("@/lib/audit/prune")
startAuditPruner()
```

⇒

```typescript
const { startTrashPruner } = await import("@/lib/trash/prune")
startTrashPruner()
```

**Registration is not evidence of execution.** RESEARCH § Docker standalone landmine: the
`Dockerfile:22-40` copy step ends in `2>/dev/null || true`, so the deployment gate must be
behavioural — `docker compose up -d --build` then
`docker compose logs app | grep -F '[trash-prune] Starting'`.

---

### `src/components/user-menu.tsx` (component, client) — one item

**Analog:** the API Keys item in the same file, lines 58-63. Copy `asChild` + `<a>` + `mr-2 h-4 w-4`
verbatim, placed after it and **before** the admin-only User Management block (lines 64-71):

```tsx
<DropdownMenuItem asChild>
  <a href="/settings/api-keys" className="flex items-center">
    <Key className="mr-2 h-4 w-4" />
    <span>{t("apiKeys")}</span>
  </a>
</DropdownMenuItem>
{user.role === "admin" && (
  <DropdownMenuItem asChild>
    <a href="/admin/users" className="flex items-center">
      <User className="mr-2 h-4 w-4" />
      <span>{t("userManagement")}</span>
    </a>
  </DropdownMenuItem>
)}
```

The trash item is **not** wrapped in a role check (trash is not admin-only) and the icon is
**not** red — the sign-out item at line 75 (`text-red-600 focus:text-red-600`) stays the only
red thing in this menu. `t` is already `useTranslations("nav")`, so the key is `nav.trash`.

---

### `src/components/admin-sidebar.tsx` (config) — one array entry

**Analog:** the Audit Log entry, lines 35-43. Copy including the English-literal justification,
inserted immediately after it:

```typescript
// The English literal is deliberate: every sibling in this array is one, and
// half-migrating a single entry would read as a bug rather than as progress. This is the
// one new user-visible English literal phase 36 writes; the dashboard tile that points at
// the same route IS translated, because that grid already is.
{
  title: "Audit Log",
  href: "/admin/audit",
  icon: ScrollText,
},
```

⇒ `{ title: "Trash", href: "/admin/trash", icon: Trash2 }`. `Trash2` must be added to the
`lucide-react` import on line 5.

---

### `src/app/admin/page.tsx` (page, server) — one dashboard Card

**Analog:** the audit tile in the same file, lines 197-215:

```tsx
{/*
  Reads admin.dashboard.auditLog / admin.dashboard.auditLogDescription (the `t`
  above is already scoped to admin.dashboard). This grid is fully translated and
  stays that way — the English literal in the admin sidebar's array is confined
  to that file's own convention and is not a licence to write one here.
*/}
<Link href="/admin/audit">
  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle className="text-base">{t('auditLog')}</CardTitle>
        <ScrollText className="h-5 w-5 text-muted-foreground" />
      </div>
      <CardDescription>{t('auditLogDescription')}</CardDescription>
    </CardHeader>
  </Card>
</Link>
```

⇒ `href="/admin/trash"`, `t('trash')` / `t('trashDescription')`, `Trash2` icon. This tile **is**
translated (`admin.dashboard.trash`, `admin.dashboard.trashDescription`) even though the
sidebar entry is not — that asymmetry is the established convention, not an oversight.

---

### `src/messages/locale-parity.test.ts` (test) — `REQUIRED_TRASH_KEYS`

**Analog:** the `REQUIRED_AUDIT_KEYS` machinery, three places in the same file.

**The contract list** (lines 73-113) — grouped with per-group counts in comments:

```typescript
export const REQUIRED_AUDIT_KEYS: string[] = [
  // Actor kinds — 4
  "audit.actorKind.workflowRun",
  "audit.actorKind.apiKey",
  "audit.actorKind.import",
  "audit.actorKind.system",

  // Entry predicates — 12, one per action × entity. Twelve strings rather than one with an
  // {entity} placeholder because es-ES and pt-BR inflect the demonstrative with the noun's gender.
  "audit.entry.created.organization",
  …
]
```

**The namespace scoper** (lines 224-244) — a `trashKeys` sibling is needed so the key-set
identity assertion can run against `trash.*` plus the two `admin.dashboard.*` keys:

```typescript
const NOTES_NAMESPACE = "notes"
const AUDIT_NAMESPACE = "audit"

const noteKeys = keysMatching(inNamespace(NOTES_NAMESPACE))
const auditKeys = keysMatching(
  (key) => inNamespace(AUDIT_NAMESPACE)(key) || AUDIT_DASHBOARD_KEYS.includes(key),
)
```

**The five assertions** (lines 318-345) — extend each `it` with a third expectation rather than
copying an `it` block:

```typescript
it("every required notes and audit key exists in every locale", () => {
  expect(missingIn(REQUIRED_NOTE_KEYS)).toEqual(emptyPerLocale)
  expect(missingIn(REQUIRED_AUDIT_KEYS)).toEqual(emptyPerLocale)
})

it("the notes and audit namespaces have identical key sets across all three locales", () => {
  expectIdenticalKeySets(noteKeys, NOTES_NAMESPACE)
  expectIdenticalKeySets(auditKeys, AUDIT_NAMESPACE)

  // Stronger than cross-locale identity … the shipped audit key set must equal
  // REQUIRED_AUDIT_KEYS exactly, so a string added to the namespace without its dot-path
  // going into the list fails here instead of shipping ungated.
  const contract = [...REQUIRED_AUDIT_KEYS].sort()
  for (const locale of LOCALES) {
    expect(auditKeys[locale], `…diverges from the checked-in contract`).toEqual(contract)
  }
})

it("every required notes and audit value is a non-empty string", () => { … })
it("no required notes or audit string was left untranslated in both es-ES and pt-BR", () => { … })
it("interpolation placeholders survive translation for every required notes and audit key", () => { … })
```

The exact-contract check at line 331 means every one of the 61 keys must be listed in
`REQUIRED_TRASH_KEYS` or the suite fails — that is the intent.

---

### The six delete dialogs (component, client) — one sentence each

**Analog:** `src/app/organizations/delete-dialog.tsx:43-46` — the sentence lives as an English
literal inside `DialogDescription`:

```tsx
<DialogDescription className="pt-4">
  Are you sure you want to delete &quot;{organizationName}&quot;? This action
  cannot be undone.
</DialogDescription>
```

Replace `This action cannot be undone.` with `You can restore it from Trash.` in the six files
listed in UI-SPEC § Surface 6 (`deals/deal-card.tsx:258`, `deals/deal-dialog.tsx:538`,
`organizations/delete-dialog.tsx:45`, `people/delete-dialog.tsx:45`,
`activities/activity-dialog.tsx:532`, `activities/activity-list.tsx:517`). **No new i18n keys**
— these are literals today and half-migrating them is unrelated scope. Do **not** touch the two
workflow dialogs; their copy is correct.

---

## Shared Patterns

### Admin gate (server action)

**Source:** `src/app/admin/audit/actions.ts:24-30`
**Apply to:** `src/app/admin/trash/actions.ts`, and the purge branch of `src/app/trash/actions.ts`

```typescript
const session = await auth()

if (!session?.user || session.user.role !== "admin") {
  return { success: false, error: "Unauthorized: Admin access required" }
}
```

The header comment explaining *why* (the `/admin` layout redirect cannot protect a POST
endpoint; the hidden client button is never the gate) must be carried forward — it is the
answer to the STRIDE row "a non-admin POSTs directly to the purge server action".

### Admin gate (REST route)

**Source:** `src/app/api/v1/audit/route.ts:119-131`
**Apply to:** the purge endpoint under `src/app/api/v1/trash/`

`ApiAuthContext` is `{ userId, keyId }` with **no role**, so the role is re-read from storage
on every request via `resolveActorRole(context.userId)` and an unresolvable actor is denied
with `Problems.forbidden()`.

### Owner-or-admin gate

**Source:** `src/app/deals/actions.ts:83`
**Apply to:** trash listing, restore, and `restoreWithLinked` — everywhere except purge

```typescript
if (deal.ownerId !== session.user.id && session.user.role !== "admin") {
  return { success: false, error: "Not authorized" }
}
```

In the **list** query this predicate must be applied *in the query*, not after, and the four
tab counts must be scoped identically to the rows (UI-SPEC: a count a user cannot explain is a
visible defect).

### Actor context

**Source:** `src/lib/audit/actor-context.ts:45-50, 62-78`; call sites at `src/app/deals/actions.ts:36,87`
**Apply to:** every new server action, every new REST write route, and the pruner

```typescript
// Singleton - must survive across module boundaries in all environments.
// … Next.js bundles `instrumentation.ts` into a different module graph from the app's
// server actions, so this file is instantiated TWICE in a production build … With a plain
// module-level `const`, the writer stores the actor on one AsyncLocalStorage instance and
// the reader calls `getStore()` on a different one, always gets `undefined`, and every
// audit row is written as `system` with a null user …
const globalForActor = globalThis as typeof globalThis & {
  auditActorStorage?: AsyncLocalStorage<AuditActor>
}
const actorStorage = globalForActor.auditActorStorage ?? new AsyncLocalStorage<AuditActor>()
globalForActor.auditActorStorage = actorStorage

export function runWithActor<T>(actor: AuditActor, fn: () => T | Promise<T>): T | Promise<T> {
  return actorStorage.run(actor, fn)
}
```

Wrap: `runWithActor({ kind: "user", userId: session.user.id }, () => restoreDealMutation(id))`.
The pruner has no session and must wrap explicitly with
`runWithActor({ kind: "system", userId: null }, …)` so "no actor established" and "genuinely
system" stay distinguishable (RESEARCH Pitfall 9). Do **not** add a module-level
`AsyncLocalStorage` const anywhere.

### Direct audit row (restore / purge write their own)

**Source:** `src/lib/events/subscribers/audit.ts:47-88`
**Apply to:** every restore and purge mutation

```typescript
// READ THE STORE SYNCHRONOUSLY, HERE, AT HANDLER ENTRY.
// … Capturing it into a local BEFORE the insert promise is created is what makes the
// fire-and-forget insert safe.
const actor = getCurrentActor()

db.insert(auditLog).values({
  entityType: payload.entity,
  entityId: payload.entityId,
  action: payload.action,
  changes,
  // NEVER the event payload's own user id. That field describes the record being
  // written, not the identity that wrote it … Absence of an actor is recorded honestly
  // as `system`.
  actorKind: actor?.kind ?? "system",
  actorUserId: actor?.userId ?? null,
  workflowRunId: actor?.workflowRunId ?? null,
  importSessionId: actor?.importSessionId ?? null,
})
```

Restore/purge emit **no bus event** (locked), so they insert this row directly. Two divergences:
the purge insert goes **inside** the `db.transaction` (so a rollback cannot record a purge that
did not happen), and it must **await** rather than fire-and-forget. Use `action: 'deleted'` with
a marker in `changes` — a new `'purged'` literal is a four-file compile cascade (RESEARCH
Pitfall 6).

### Fail-closed error containment

**Source:** `src/lib/audit/settings.ts:82-85, 163-166`; `src/lib/audit/prune.ts:86-91`
**Apply to:** `src/lib/trash/{settings,queries,prune}.ts`

Every function reachable from a timer tick or a page render catches and returns its safe value.
`null` never means "use a default". The reschedule always sits outside the `try`. `/trash` has
no `error.tsx` above it, so a query failure must degrade to the UI-SPEC's panel
(`trash.error.unavailable`), never a throw.

### Explicit soft-delete predicate — inverted here

**Source:** every read path in the repo (34 files); e.g. `src/app/organizations/page.tsx:30`
**Apply to:** `src/lib/trash/queries.ts`, both restore mutations' existence checks

Phase 35 recorded that partial indexes do not enforce their own predicate, so `isNull(t.deletedAt)`
is always written out. The trash query is **the only place in the codebase that writes
`isNotNull`** — write it equally explicitly, and never rely on an index predicate.

### RSC boundary (CFUI-01)

**Source:** `src/app/admin/audit/page.tsx:11-22` + `retention-form.tsx:7-16`
**Apply to:** `src/app/trash/page.tsx`, `src/app/admin/trash/page.tsx`

```
SPLIT (CFUI-01)
This module is a server component. Everything stateful — the input, the transition, the
toast and the shorten `AlertDialog` — lives in `retention-form.tsx`, which is
`'use client'`. Only plain serializable values cross … No React element and no function
crosses the boundary, which is what the repo-wide gate in
`src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` enforces.
```

Both new `AlertDialog`s live inside `'use client'` modules, controlled, with no trigger
component of their own. The gate scans all repo `.tsx` files and fails the build.

### Result shape

**Source:** every mutation and action in `src/lib/mutations/` and `src/app/*/actions.ts`
**Apply to:** all new mutations, actions and settings functions

`{ success: true } | { success: false; error: string }`, declared as a discriminated union
(`WriteRetentionResult`, `settings.ts:89`) so a caller cannot mistake a failure for a success.
Restore's failure carries the **code** `"NOT_IN_TRASH"`, not prose — the client string-matches
nothing, it switches on the code.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/trash/present.test.ts` | test | transform | No pure-presenter test exists for the actor vocabulary — `audit-entry.tsx` is a client component and STATE.md Phase 44 records that client components are not rendered in tests (no jsdom, no testing library, and this phase must not install one). The `notRecorded` vs `unknownActor` discrimination is new logic with no precedent; use `src/lib/audit/settings.test.ts` for structure only (describe/it grouping, `vi.clearAllMocks` lifecycle) and test the presenter as a pure function over a row shape. |

Partial-analog notes (an analog exists but does not cover the whole file):

- **`src/lib/trash/queries.ts`** — the `DISTINCT ON` batched deleted-by lookup has no existing
  implementation anywhere in the repo. `sources.ts:705-732` supplies the join shape and the
  one-round-trip discipline, but the `DISTINCT ON` fragment itself is new and must be a raw
  `sql` template (the timeline assembler is the repo's only other hand-composed SQL and is
  documented as such). Bind the id list as a parameter; never interpolate `?type=`.
- **Purge transaction** — `deleteWorkflow` supplies the ordering idiom but is **not**
  transactional. `db.transaction` has no multi-table precedent in the mutation layer; the
  transaction wrapper itself is new code.

---

## Metadata

**Analog search scope:** `src/lib/audit/`, `src/lib/mutations/`, `src/lib/timeline/`,
`src/lib/events/`, `src/app/admin/audit/`, `src/app/organizations/`, `src/app/activities/`,
`src/app/deals/`, `src/app/notes/`, `src/app/api/v1/`, `src/components/`, `src/messages/`,
`scripts/`, `drizzle/`, repo root (`instrumentation.ts`)

**Files scanned:** 31 read (23 in full, 8 with targeted offset ranges), plus 6 grep sweeps

**Pattern extraction date:** 2026-08-16
