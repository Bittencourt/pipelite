# Phase 36: Audit Log - Pattern Map

**Mapped:** 2026-08-16
**Files analyzed:** 31 (19 new, 12 modified)
**Analogs found:** 28 / 31 exact-or-role match; 3 genuinely new ground (named explicitly below)

> Every file:line in this document was opened and read in this session. Where 36-RESEARCH.md
> already cited a location, it was verified rather than re-derived; two of its claims are
> **corrected** below (§ Corrections to RESEARCH).

---

## File Classification

### New files

| New file | Role | Data Flow | Closest Analog | Match |
|----------|------|-----------|----------------|-------|
| `src/db/schema/audit-log.ts` | model (schema) | append-only write + 3 read patterns | `src/db/schema/deal-stage-history.ts` (immutable/no-soft-delete/index-in-schema) + `src/db/schema/notes.ts` (polymorphic entity key, JSONB, partial index) | exact (two-analog composite) |
| `src/db/schema/app-settings.ts` | model (schema) | key/value read + write | **NO ANALOG** — see § No Analog Found | none |
| `src/lib/events/subscribers/audit.ts` | subscriber (event-driven) | pub-sub → fire-and-forget insert | `src/lib/events/subscribers/stage-history.ts` | **exact** |
| `src/lib/events/subscribers/audit.test.ts` | test | — | `src/lib/events/subscribers/stage-history.test.ts` | **exact** |
| `src/lib/audit/actor-context.ts` | utility (ALS) | ambient context | `src/lib/execution/recursion.ts` | **exact** |
| `src/lib/audit/actor-context.test.ts` | test | — | `src/lib/execution/recursion.test.ts:8-52` | **exact** |
| `src/lib/audit/diff.ts` | utility (pure transform) | transform | `src/lib/formula-helpers.ts` (db-free, gate-protected pure module) | role-match |
| `src/lib/audit/diff.test.ts` | test (pure) | — | any pure lib test; nearest is `src/lib/execution/recursion.test.ts:8-52` (no mocks at all) | role-match |
| `src/lib/audit/settings.ts` | service | CRUD (1 row) | `src/lib/notes/authorize.ts:69-85` (`resolveActorRole`: single read, try/catch, fail-closed to `null`) | **exact shape** |
| `src/lib/audit/settings.test.ts` | test | — | `src/lib/api/__tests__/notes-collection.test.ts:25-27` (db mock shape) | role-match |
| `src/lib/audit/prune.ts` | processor (batch) | batch delete on `setTimeout` chain | `src/lib/execution/execution-processor.ts:30-56` (structure) + `src/lib/import/import-session-cleanup.ts` (delete + count + log) | **exact (structure)** |
| `src/lib/audit/prune.test.ts` | test (fake timers) | — | **NO ANALOG** — no processor in this repo has a test. See § No Analog Found | none |
| `src/lib/audit/linked-records.ts` + `.test.ts` | service (read) | aggregate read | `src/lib/timeline/sources.ts:327-368` (`stageChangeSource.hydrate`: batched select + leftJoin + row→DTO map) | role-match |
| `src/lib/audit/no-mutation-coupling.test.ts` | test (source gate) | file-system scan | `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx:78-105,351-388` + `src/app/__tests__/record-dialog-note-failure.test.ts:42-71,253-286` | **exact — read the failure history in § Shared Patterns** |
| `src/lib/api/auth.test.ts` | test | — | **NO DIRECT ANALOG** — see § No Analog Found | partial |
| `src/components/timeline/audit-entry.tsx` | component (client) | render | `src/components/timeline/stage-change-entry.tsx` | **exact** |
| `src/app/api/v1/audit/route.ts` | route (REST GET) | request-response | `src/app/api/v1/notes/[noteId]/route.ts:42-61,69-78` (`withApiAuth` + `resolveActorRole`) + `src/lib/api/pagination.ts:19` | **exact** |
| `src/app/admin/audit/page.tsx` | page (RSC) | read | `src/app/admin/export/page.tsx:8-70` | **exact** |
| `src/app/admin/audit/retention-form.tsx` | component (client) | form + server action | `src/components/timeline/note-entry.tsx` style client module; dialog treatment from `delete-note-dialog.tsx` (per 36-UI-SPEC) | role-match |
| `src/app/admin/audit/actions.ts` | server action | write | `src/app/notes/actions.ts` (`{success}` shape) | role-match |
| `src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx` | component (server) | read/render | `src/app/workflows/[id]/runs/[runId]/components/run-step-list.tsx` | **exact** |
| `scripts/audit-log-checks.sql` | script (evidence) | manual | Phase 33/35 psql-evidence precedent (no checked-in file survives; see § No Analog Found) | none |

### Modified files

| Modified file | Role | Edit | Pattern source |
|---------------|------|------|----------------|
| `src/db/schema/index.ts` | barrel | +2 `export *` lines | `:24-25` (notes, deal-stage-history added the same way) |
| `src/db/schema/_relations.ts` | relations | + `auditLogRelations` | `:245-262` (`dealStageHistoryRelations`) and `:238-243` (`notesRelations` — read the "no `entity` relation" comment: it applies verbatim) |
| `src/lib/events/types.ts` | types | + `previous?:` on `CrmEventPayload:4-12` | — |
| `src/lib/mutations/{deals,people,organizations,activities}.ts` | mutation | `buildEventPayload` gains a 6th param | `src/lib/mutations/deals.ts:51-67` |
| `src/lib/custom-fields.ts` | service | + a real emit at `:238` (addendum decision) | `src/lib/mutations/deals.ts:406-412` |
| `src/lib/api/auth.ts` | middleware | wrap `:52` in `runWithActor` | `src/lib/execution/engine.ts:108-110` (same wrap idiom) |
| `src/lib/execution/engine.ts` | service | wrap `:108-110` | itself |
| `src/lib/timeline/types.ts` | types | + `'audit'` to `:17`, + `AuditTimelineEntry`, + union `:84-87` | `:73-82` (`StageChangeTimelineEntry`) |
| `src/lib/timeline/sources.ts` | service (SQL) | + `auditSource`, + `TIMELINE_SOURCES:376-380` | `:297-369` (`stageChangeSource`) |
| `src/lib/timeline/assemble.test.ts` | test | 8 assertions | see § Pattern Assignments |
| `src/components/timeline/timeline-entry.tsx` | dispatcher | one `case` at `:56` | `:54-55` |
| `src/messages/{en-US,es-ES,pt-BR}.json` + `locale-parity.test.ts` | config/test | +71 keys, + `REQUIRED_AUDIT_KEYS` | `locale-parity.test.ts:28-53,126-148` |
| `instrumentation.ts` | config | +2 registrations | `:18-19` (subscriber), `:24-25` (processor) |
| `src/components/admin-sidebar.tsx` | component | one array entry | `:9-45` |
| `src/app/admin/page.tsx` | page | one dashboard Card | `:171-196` (Data Management grid) |
| `src/app/workflows/[id]/runs/[runId]/page.tsx` | page | one section after `<RunStepList />` | `:135` |
| `src/lib/import/pipedrive-api-import-actions.ts` `:294`, `src/app/import/actions.ts` `:222,280,387,584` | server action | ALS boundary + one summary row | see § Pattern Assignments |
| `src/lib/execution/engine.test.ts` | test | + actor cases | itself |

---

## Pattern Assignments

### `src/db/schema/audit-log.ts` (model, append-only)

**Analog A:** `src/db/schema/deal-stage-history.ts` — the immutability posture and the
schema-declared index (Phase 33 D-06).

```typescript
// src/db/schema/deal-stage-history.ts:12-26 — COPY THIS SHAPE INCLUDING THE COMMENT STYLE
export const dealStageHistory = pgTable('deal_stage_history', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  dealId: text('deal_id').notNull().references(() => deals.id),
  fromStageId: text('from_stage_id').references(() => stages.id),
  toStageId: text('to_stage_id').notNull().references(() => stages.id),
  changedBy: text('changed_by').references(() => users.id),
  // Deliberate deviation from repo convention: this table has no updated-at and no
  // soft-delete column. History rows are immutable append-only facts. Every other CRM
  // table carries both, so the absence would otherwise read as an oversight.
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  dealIdx: index('deal_stage_history_deal_idx').on(table.dealId, table.createdAt.desc()),
}))

export type DealStageHistoryRow = InferSelectModel<typeof dealStageHistory>
```

Load-bearing details to copy verbatim: `text` id with `$defaultFn(() => crypto.randomUUID())`
(NOT `uuid`/`gen_random_uuid()`); `timestamp(...)` with **no `mode` option**; `index(...)` in the
third `pgTable` argument with `.desc()` on the sort column; the `InferSelectModel` export at the
bottom; and the explicit comment justifying the missing `deletedAt`/`updatedAt` — Phase 35 wrote
that comment precisely so the deviation does not read as an oversight, and the audit table needs
the identical one.

**Analog B:** `src/db/schema/notes.ts` — the polymorphic key and the partial index.

```typescript
// src/db/schema/notes.ts:11-46
  // Polymorphic key. The union is imported from ./custom-fields — the repo has exactly
  // one definition of it today and a second would drift (D-01).
  entityType: text('entity_type').notNull().$type<EntityType>(),
  // NO foreign key: entityId points at one of four different tables (deals,
  // organizations, people, activities). The database therefore CANNOT catch a dangling
  // reference. The parent-existence check in src/lib/mutations/notes.ts is the only
  // defence (T-35-04) and is mandatory on every write path.
  entityId: text('entity_id').notNull(),
  ...
}, (table) => ({
  liveEntityIdx: index('notes_live_idx')
    .on(table.entityType, table.entityId, table.createdAt.desc())
    .where(sql`${table.deletedAt} is null`),
```

- `entityType` MUST be `.$type<EntityType>()` imported from `./custom-fields` — do not declare a
  fifth copy of the four-literal union (D-01).
- `entityId` carries **no** foreign key, for the same reason. Unlike notes, the audit log has no
  parent-existence check to compensate — that is correct here (an audit row for a deleted record
  must survive) but say so in a comment, because the notes comment says the opposite.
- The `workflow_run_id` partial index copies `notes_migration_uniq`'s `.where(sql\`...\`)` form
  (`notes.ts:42-44`); `drizzle/0013_parched_redwing.sql:27-28` is the proof it emits intact.
- JSONB column: `jsonb('changes').$type<...>().notNull().default({})` — the repo's idiom, e.g.
  `src/db/schema/import-sessions.ts:10` and `src/db/schema/deals.ts:18`.

**Relations** (`src/db/schema/_relations.ts:245-262`):

```typescript
export const dealStageHistoryRelations = relations(dealStageHistory, ({ one }) => ({
  deal: one(deals, { fields: [dealStageHistory.dealId], references: [deals.id] }),
  changedByUser: one(users, { fields: [dealStageHistory.changedBy], references: [users.id] }),
}))
```

And the constraint at `_relations.ts:236-238`, which applies word-for-word to `auditLog.entityId`:

```typescript
// There is deliberately NO `entity` relation here: notes.entityId is polymorphic and
// points at four different tables, so no Drizzle relation is expressible for it. Do not
// attempt one — resolve the parent in the query layer instead.
```

---

### `src/lib/events/subscribers/audit.ts` (subscriber, event-driven)

**Analog:** `src/lib/events/subscribers/stage-history.ts` — **48 lines, copy structurally in full.**

```typescript
// src/lib/events/subscribers/stage-history.ts:1-48
import { crmBus } from "@/lib/events"
import type { DealStageChangedPayload } from "@/lib/events/types"
import { db } from "@/db"
import { dealStageHistory } from "@/db/schema"

let registered = false

export function registerStageHistorySubscriber(): void {
  if (registered) return

  crmBus.on("deal.stage_changed", (payload: DealStageChangedPayload) => {
    // Fire-and-forget: crmBus wraps a synchronous EventEmitter, so `emit` cannot await. The
    // handler must NOT be async and must NOT await the insert. The `.catch` is mandatory —
    // without it a rejection becomes an unhandled promise and the row is lost with no trace.
    db
      .insert(dealStageHistory)
      .values({ ... })
      .catch((err) => console.error("[stage-history]", err))
  })

  registered = true
}

/**
 * Reset registration state for testing only.
 *
 * NOTE: this removes ALL `deal.stage_changed` listeners from the shared bus singleton,
 * including the webhook and workflow-trigger ones. The two existing `_resetForTesting`
 * helpers behave the same way.
 */
export function _resetForTesting(): void {
  if (registered) {
    crmBus.removeAllListeners("deal.stage_changed")
  }
  registered = false
}
```

Four things this analog fixes for the audit subscriber:
1. `let registered = false` at module scope + early `return` — the idempotency guard.
2. Non-async arrow handler, `.catch` on the insert, `[tag]` log prefix.
3. `_resetForTesting` calls `removeAllListeners` **per event name** — the audit subscriber listens
   to 12 events, so it must loop, and the caveat comment gets 12× worse (it will detach webhook
   and workflow-trigger listeners for all 12). Restate the caveat.
4. Import `crmBus` from `"@/lib/events"` (the barrel), types from `"@/lib/events/types"`.

**Registration** — `instrumentation.ts:18-19`:

```typescript
const { registerStageHistorySubscriber } = await import("@/lib/events/subscribers/stage-history")
registerStageHistorySubscriber()
```

Everything sits inside `if (process.env.NEXT_RUNTIME === "nodejs")` (`instrumentation.ts:2`).
Pitfall 3 (standalone build omits `instrumentation.js`) means the browser check is mandatory.

---

### `src/lib/events/subscribers/audit.test.ts` (test)

**Analog:** `src/lib/events/subscribers/stage-history.test.ts` — 157 lines, mirror it case-for-case.

```typescript
// stage-history.test.ts:13-49
// Mock @/db BEFORE importing the subscriber (vi.mock factories are hoisted above imports).
vi.mock("@/db", () => ({ db: { insert: vi.fn() } }))

import { registerStageHistorySubscriber, _resetForTesting } from "./stage-history"
import { db } from "@/db"
const mockDb = db as unknown as { insert: ReturnType<typeof vi.fn> }

/** Wire `db.insert(...).values(...)` to a thenable so the subscriber's `.catch` has something to attach to. */
function stubInsert(result: Promise<unknown> = Promise.resolve(undefined)) {
  const valuesFn = vi.fn().mockReturnValue(result)
  mockDb.insert.mockReturnValue({ values: valuesFn })
  return valuesFn
}

/** Let the fire-and-forget insert's promise callbacks run. */
const flush = () => new Promise((resolve) => setImmediate(resolve))
```

The unhandled-rejection assertion (`:134-156`) is the one the VALIDATION map calls
"fire-and-forget" and it is non-obvious enough to copy literally:

```typescript
const boom = new Error("insert exploded")
stubInsert(Promise.reject(boom))
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => unhandled.push(reason)
process.on("unhandledRejection", onUnhandled)
try {
  registerStageHistorySubscriber()
  // emit() is synchronous — it must not throw even though the insert rejects.
  expect(() => crmBus.emit("deal.stage_changed", stagePayload())).not.toThrow()
  await flush()
  expect(errorSpy).toHaveBeenCalledWith("[stage-history]", boom)
  expect(unhandled).toHaveLength(0)
} finally {
  process.off("unhandledRejection", onUnhandled)
  errorSpy.mockRestore()
}
```

Also copy `:105-113` ("does not double-register") and `:115-132` ("ignores other CRM events") —
the latter becomes the `stage_changed` case the validation map demands: emit `deal.stage_changed`
and assert `insert` was **not** called (or called exactly once from the co-emitted `deal.updated`,
which is the honest assertion given the four co-emit sites).

`beforeEach` is `vi.clearAllMocks(); _resetForTesting()` (`:52-55`).

---

### `src/lib/audit/actor-context.ts` (utility, ambient context)

**Analog:** `src/lib/execution/recursion.ts` — **25 lines, the entire file is the pattern.**

```typescript
// src/lib/execution/recursion.ts:1-25 (complete)
import { AsyncLocalStorage } from "node:async_hooks"

export const MAX_RECURSION_DEPTH = 5

export const executionDepthStorage = new AsyncLocalStorage<number>()

/**
 * Get the current workflow execution depth.
 * Returns 0 when not inside a workflow execution context.
 */
export function getCurrentExecutionDepth(): number {
  return executionDepthStorage.getStore() ?? 0
}

/**
 * Run a function within a workflow execution context at the given depth.
 * Used to track recursion when workflow actions trigger CRM events
 * that fire other workflows.
 */
export function runWithExecutionDepth<T>(
  depth: number,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return executionDepthStorage.run(depth, fn)
}
```

Copy: the `node:` prefixed import, the `T | Promise<T>` signature (this is what lets the four call
sites wrap both sync and async bodies without a cast at the definition), the absence of any `@/db`
import, and the doc comment that states the out-of-context return value. Difference: the audit
storage returns `undefined` rather than a default, because "no actor" must be distinguishable
(`?? "system"` happens at the subscriber, not here).

**Boundary application** — `src/lib/execution/engine.ts:105-111` is the exact wrap idiom, including
the `as Promise<void>` the `T | Promise<T>` return forces:

```typescript
  // Execute the whole graph inside the run's stored recursion depth, so CRM
  // actions that fire other workflows create runs at depth + 1 instead of
  // restarting at 0 (which would defeat MAX_RECURSION_DEPTH).
  return runWithExecutionDepth(run.depth ?? 0, () =>
    executeRunGraph(runId, run, workflow)
  ) as Promise<void>
```

Note `run` and `workflow` are destructured at `engine.ts:103`
(`const { workflow_runs: run, workflows: workflow } = result[0]`), so `workflow.createdBy` and
`runId` are both in scope at the wrap site. No extra query.

`src/lib/api/auth.ts:52` is a one-line return (`return handler(request, result)`), with `result`
already typed `ApiAuthContext` — the wrap is mechanical.

---

### `src/lib/audit/actor-context.test.ts` (test)

**Analog:** `src/lib/execution/recursion.test.ts:8-52`. **NO MOCKS AT ALL** — the real
`AsyncLocalStorage` runs under vitest:

```typescript
// recursion.test.ts:15-51
describe("runWithExecutionDepth", () => {
  it("makes getCurrentExecutionDepth return the set depth", () => { ... })

  it("works with async functions", async () => {
    let capturedDepth = -1
    await runWithExecutionDepth(2, async () => {
      await new Promise((r) => setTimeout(r, 1))
      capturedDepth = getCurrentExecutionDepth()
    })
    expect(capturedDepth).toBe(2)
  })

  it("nested calls use the inner depth", () => { ... })

  it("depth resets after execution completes", () => { ... })
})
```

Four of the six validation-map cases map 1:1 onto these (across-awaits, nesting, absence,
post-exit reset). **The "two concurrent scopes do not cross-contaminate" case has no analog** —
`recursion.test.ts` never tests concurrency. Write it as two `runWithActor` calls whose bodies
`await` interleaving timers and assert both read their own store, mirroring the RESEARCH probe's
`concurrent-A` / `concurrent-B` rows.

---

### `src/lib/audit/diff.ts` (utility, pure transform)

**Analog:** `src/lib/formula-helpers.ts` — the repo's only "deliberately db-free, gate-protected"
pure module, and the source of `isFormulaWrapper` (`:144`) which `diff.ts` imports.

There is no *diff* analog in the repo; the shape in 36-RESEARCH § Pattern 3 is the spec. What the
analog supplies is the **posture**: no `@/db` import, no bus import, no clock, plus a source-grep
test that keeps it that way — which is the same mechanism `no-mutation-coupling.test.ts` uses.

**Key normalisation table** — derive from `src/lib/api/serialize.ts:32-107`:

```typescript
// src/lib/api/serialize.ts:48-63 — serializePerson, the worst offender
export function serializePerson(person: Person) {
  return {
    id: person.id,
    first_name: person.firstName,
    last_name: person.lastName,
    full_name: `${person.firstName} ${person.lastName}`,   // ← COMPUTED, not stored
    email: person.email,
    phone: person.phone,
    notes: person.notes,
    organization_id: person.organizationId,
    owner_id: person.ownerId,
    custom_fields: person.customFields,
    created_at: toIsoString(person.createdAt),
    updated_at: toIsoString(person.updatedAt),
  }
}
```

**Correction to RESEARCH:** only `serializePerson` (`:48-63`) and `serializeDeal` (`:70-86`) ever
reach a `crmBus.emit`. `serializeActivity` (`:93-107`) and `serializeOrganization` (`:32-44`) do
**not** — activities and organizations emit raw camelCase at every site (verified below). Build
the mapping table for person and deal only, and add a comment saying the other two serializers are
deliberately absent, or a later reader will "fix" the omission.

Also note `toIsoString` (`serialize.ts:23-27`) turns `Date` into `string` on the snake_case sites
only, so `previous.createdAt` (a `Date`) and `data.created_at` (a string) disagree in **type** as
well as key. `IGNORED_COLUMNS` covering `createdAt`/`updatedAt` closes this; `expected_close_date`
and `due_at` do not get that escape and need the normaliser to convert as well as rename.

---

### The five snake_case emit sites (verified, exhaustive)

A naive `diff(previous, data)` on these five produces the 14-key false change map. Verified by
reading each emit site in this session:

| # | Emit site | `data` expression | Shape |
|---|-----------|-------------------|-------|
| 1 | `src/app/api/v1/people/route.ts:243` (person.created) | `serializePerson({...person, customFields: recalculatedCustomFields})` | **snake_case** |
| 2 | `src/app/api/v1/people/[id]/route.ts:257` (person.updated) | `serializePerson(recalculatedPerson)` | **snake_case** |
| 3 | `src/app/api/v1/people/batch/route.ts:171` (person.created) | `serializePerson({...person, customFields})` | **snake_case** |
| 4 | `src/app/api/v1/deals/route.ts:335` (deal.created) | `serializeDeal({...deal, customFields: recalculatedCustomFields})` | **snake_case** |
| 5 | `src/app/api/v1/deals/batch/route.ts:231` (deal.created) | `serializeDeal({...deal, customFields})` | **snake_case** |

Every other emit site is raw camelCase. The two that say so out loud:

```typescript
// src/app/api/v1/deals/[id]/route.ts:332-338 — the CONTRAST case, read it
      // CRM events must carry the raw camelCase row (same shape the mutation
      // layer in src/lib/mutations/deals.ts emits) so workflow trigger
      // templates like {{trigger.data.stageId}} behave identically whether
      // the deal was edited via the UI or the REST API. The HTTP response
      // body below stays snake_case for API consumers.
      const eventData = recalculatedDeal as unknown as Record<string, unknown>
```

```typescript
// src/app/api/v1/people/route.ts:241-242 (identical comment at deals/route.ts:333-334)
    // layer emits the raw camelCase row. Both spellings are normalised by the trigger envelope;
    // do NOT harmonise the casing here, it would break existing webhook consumers (T-34-23).
```

`src/app/api/v1/activities/[id]/route.ts:241,273` passes `recalculatedActivity as unknown as
Record<string, unknown>` — raw camelCase. All 18 `src/lib/mutations/*.ts` sites go through the
local `buildEventPayload` and are raw camelCase.

The `changedFields`/`data` self-disagreement is real: `people/[id]/route.ts` builds
`changedFields` in camelCase (`:194` area) and `data` in snake_case in the same object literal.
Do not use `changedFields` as the diff's key source.

---

### `src/lib/mutations/*.ts` — the `previous` enrichment

**Analog:** the helper is local to each of the four modules and identical in shape.

```typescript
// src/lib/mutations/deals.ts:51-67 (organizations.ts, people.ts, activities.ts each have a twin)
function buildEventPayload(
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  userId: string,
  changedFields: string[] | null = null
): CrmEventPayload {
  return {
    entity: "deal",
    entityId,
    action,
    data,
    changedFields,
    userId,
    timestamp: new Date().toISOString(),
  }
}
```

Four identical edits: a 6th optional `previous?: Record<string, unknown>` parameter, forwarded.
The pre-read is already there and unprojected at every update/delete site (RESEARCH § verified;
`deals.ts:257-259` is the canonical one).

`src/lib/events/types.ts:4-12` is the type edit:

```typescript
export interface CrmEventPayload {
  entity: CrmEntityType
  entityId: string
  action: CrmAction
  data: Record<string, unknown>
  changedFields: string[] | null
  userId: string
  timestamp: string
}
```

Adding `previous?:` here (rather than a narrower type) is A2 in RESEARCH; `DealStageChangedPayload`
extends this interface at `:14-18`, so it inherits the field for free.

---

### `src/lib/audit/settings.ts` (service, single-row CRUD)

**Analog:** `src/lib/notes/authorize.ts:69-85` — the repo's model of "read one row, fail closed to
`null`, never throw":

```typescript
// src/lib/notes/authorize.ts:69-85
export async function resolveActorRole(userId: string): Promise<NoteActor | null> {
  try {
    const row = await db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
      columns: { id: true, role: true },
    })

    if (!row) {
      return null
    }

    return { userId: row.id, role: row.role }
  } catch (error) {
    console.error("Failed to resolve actor role:", error)
    return null
  }
}
```

`readRetentionDays()` is this function with a zod parse between the `findFirst` and the return.
The `null`-on-anything-unexpected contract is exactly the "fails closed" the pruner needs, and
the doc-comment convention ("Fails closed on any error (T-35-25)") is worth copying.

---

### `src/lib/audit/prune.ts` (processor, batch)

**Analog A (structure):** `src/lib/execution/execution-processor.ts:30-56` — the canonical
`setTimeout`-chained processor. `src/lib/webhook-processor.ts:1-49` and `email-processor.ts` are
the same 3 lines of scaffolding around a different body; use the execution one because it is the
one that does DB work.

```typescript
// src/lib/execution/execution-processor.ts:7-8, 20-56
const INITIAL_DELAY = 5_000 // 5 seconds - let server finish booting
const POLL_INTERVAL = 5_000

/**
 * Self-scheduling execution processor loop.
 * ...
 * Uses setTimeout chaining (not setInterval) to prevent overlap.
 * Started once on server boot via instrumentation.ts.
 */
export function startExecutionProcessor(): void {
  console.log("[execution-processor] Starting with initial delay of 5s")
  scheduleTick(INITIAL_DELAY)
}

function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      ...
      if (pendingCount > 0 || waitingCount > 0) {
        console.log(`[execution-processor] Processed ${pendingCount} pending, ...`)
      }
    } catch (error) {
      console.error("[execution-processor] Tick error:", error)
    }

    // Always schedule the next tick
    scheduleTick(POLL_INTERVAL)
  }, delay)
}
```

Copy: the two module-scope delay constants with an inline comment each; the `start*()` export that
logs once and calls `scheduleTick(INITIAL_DELAY)`; `scheduleTick` as a **module-private** function;
`try/catch` **inside** the timer callback; `console.error("[tag] Tick error:", error)`; the
`// Always schedule the next tick` comment above the tail call. The tail call sitting *outside* the
`try` is the property AUDIT-04's "always reschedules even after a throw" test asserts.

**Analog B (the delete + count + log body):** `src/lib/import/import-session-cleanup.ts:15-47`:

```typescript
export async function cleanupStaleImportSessions(): Promise<void> {
  try {
    ...
    const old = await db
      .delete(importSessions)
      .where(lt(importSessions.createdAt, thirtyDaysAgo))
      .returning({ id: importSessions.id })

    const total = staleRunning.length + staleIdle.length + old.length
    if (total > 0) {
      console.log(`Cleaned up ${total} stale import sessions`)
    }
  } catch (error) {
    console.error("[import-cleanup] Failed to clean up stale sessions:", error)
  }
}
```

Two divergences the plan must make explicit, because copying this analog naively loses the phase:
1. `.returning({ id })` is how this analog counts deletions — the audit pruner uses a raw
   `db.execute(sql\`DELETE ... WHERE ctid IN (...)\`)` (the `ctid` form has no drizzle builder), so
   the count comes from the result's `count`/`rowCount`, not from `.returning()`.
2. This analog computes its cutoff as a **JS `Date`** (`:19`). The audit pruner must not — bind the
   day count and use `now() - make_interval(days => $1)` server-side. Phase 35's `Date`-in-raw-`sql`
   hazard (`src/lib/timeline/sources.ts:87-107`) is the reason.

---

### `src/lib/timeline/sources.ts` — the `auditSource` addition

**Analog:** `stageChangeSource`, `src/lib/timeline/sources.ts:297-369` — the source with no
soft-delete predicate, which is exactly the audit case.

```typescript
// src/lib/timeline/sources.ts:297-325
export const stageChangeSource: TimelineSource = {
  kind: "stage_change",

  appliesTo: (entityType) => entityType === "deal",

  branch({ entityId }, cursor, limit) {
    const keyset = cursor
      ? sql` AND (h.created_at, h.id) < (${bindInstant(cursor.instant)}, ${cursor.id})`
      : sql``

    // No soft-delete predicate here, and that is not an omission: deal_stage_history has
    // no deleted_at column because history rows are immutable append-only facts.
    return sql`(
      SELECT 'stage_change' AS kind, h.id, h.created_at AS occurred_at,
             ${instantKey(sql`h.created_at`)}
      FROM ${dealStageHistory} h
      WHERE h.deal_id = ${entityId}${keyset}
      ORDER BY h.created_at DESC, h.id DESC
      LIMIT ${limit}
    )`
  },

  countBranch({ entityId }) {
    return sql`
      SELECT count(*)::int AS count
      FROM ${dealStageHistory} h
      WHERE h.deal_id = ${entityId}
    `
  },
```

The `notesSource` branch (`:155-183`) is the one to copy for the **two-column** predicate
(`entity_type` AND `entity_id`) — the audit branch needs notes' `WHERE` and stage-history's
absence of `deleted_at`:

```typescript
// sources.ts:163-172
    return sql`(
      SELECT 'note' AS kind, n.id, n.created_at AS occurred_at,
             ${instantKey(sql`n.created_at`)}
      FROM ${notes} n
      WHERE n.entity_type = ${entityType}
        AND n.entity_id = ${entityId}
        AND n.deleted_at IS NULL${keyset}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ${limit}
    )`
```

`instantKey` (`:83-85`) and `bindInstant` (`:109-111`) are reused verbatim; read the two doc
comments above them (`:41-82` and `:87-108`) before touching the branch — the `::text::timestamp`
double cast is load-bearing and measured.

**Hydrate** — `stageChangeSource.hydrate` (`:327-368`) is the multi-join analog the audit hydrate
needs (users leftJoin for the actor name, plus `alias()` if the same table is joined twice, plus
the `row.actorId !== null && row.actorEmail !== null ? {...} : null` guard at `:362-366` which is
exactly the UI-SPEC's "Unknown user" contract).

**Registry** (`:371-380`) — the two-line edit:

```typescript
/**
 * The registry. Phase 36's audit log becomes a FOURTH entry in this array and nothing
 * else in the assembler changes — the union, the pre-limit, the keyset predicate and the
 * hydration loop are all driven off this list.
 */
export const TIMELINE_SOURCES: TimelineSource[] = [
  notesSource,
  activitiesSource,
  stageChangeSource,
]
```

Note: 36-CONTEXT's addendum adds a **filter toggle with audit OFF by default**. That is NOT
supported by this array — `TIMELINE_SOURCES` is consumed unconditionally by `assemble.ts`. There
is no analog for a filtered source list; the plan must decide whether the filter lives in
`buildTimelineQuery`'s signature or in a caller-supplied source subset, and either is a change to
the Phase 35 contract that `assemble.test.ts` will also feel. Flagging it because the UI-SPEC
(§ Density) explicitly says filtering is *not* in this phase — **CONTEXT and UI-SPEC disagree here
and the planner must resolve it.**

---

### `src/lib/timeline/assemble.test.ts` — the 8 assertions

Verified in this session; RESEARCH's table is accurate. The concrete anchors:

| Assertion | Location | Current |
|-----------|----------|---------|
| "builds three branches for a deal" | `:223-230` | `countOf(lower, "union all")).toBe(2)` |
| "builds a single notes branch with no UNION ALL for organization, person and activity" | `:232-242` | `countOf(lower, "union all")).toBe(0)` — **falsified in kind** |
| `occurred_at_key` count | `:254` | `.toBe(4) // three branches + the outer select` |
| `to_char(` count | `:262-263` | `.toBe(3)` twice (lower + text) |
| `deleted_at is null` count | `:272` | `.toBe(2)` — **unchanged**, audit has no predicate |
| `order by` count | `:284`, `:289` | deal `4`, org `2` |
| `limit` count | `:286`, `:290` | deal `4`, org `2` |
| `p === 21` length | `:296`, `:299` | deal `4`, org `2` |

The comment at `:237` (`// A one-branch UNION ALL is a degenerate union, not a simpler one.`)
becomes wrong once audit applies to all four types; rewrite it rather than deleting the test.

---

### `src/components/timeline/audit-entry.tsx` (component, client)

**Analog:** `src/components/timeline/stage-change-entry.tsx` — the sibling with no row actions.

```tsx
// stage-change-entry.tsx:1-33 — the module header IS part of the pattern
"use client"

/**
 * One stage change in a deal's timeline: who moved it, and between which two stages.
 *
 * SHARED SKELETON (UI-SPEC § Layout & Composition)
 * Identical outer structure to `note-entry.tsx` and `activity-entry.tsx` — a `w-8 shrink-0`
 * rail, a `gap-2`, and a `min-w-0 flex-1` content column whose first line is
 * `flex flex-wrap items-center gap-2`. The feed only reads as one list because all three
 * kinds share this grid.
 * ...
 * STAGE NAMES (T-35-05)
 * Stage names are user-authored text rendered as React TEXT children, which React escapes.
 * Raw-HTML injection props must never appear in this file — it is grep-gated to zero
 * occurrences.
 *
 * NO ROW ACTIONS
 * A stage change is a fact about the past. Only notes are manageable from the timeline.
 */

import { ArrowRight } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
```

The T-35-05 paragraph transfers directly to the audit entry's custom-field labels (UI-SPEC
§ States Checklist requires a `<script>` label case, grep-gated to zero raw-HTML props).

```tsx
// stage-change-entry.tsx:106-145 — the skeleton to copy byte-for-byte
export function StageChangeEntry({ entry }: StageChangeEntryProps) {
  const t = useTranslations("notes")
  const format = useFormatter()

  const actorName = entry.actor?.name ?? entry.actor?.email ?? t("unknownAuthor")

  const absoluteTimestamp = format.dateTime(entry.occurredAt, {
    year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric",
  })

  return (
    <div className="flex gap-2">
      <div className="w-8 shrink-0">
        <div className="bg-muted flex size-8 items-center justify-center rounded-full">
          <ArrowRight className="text-muted-foreground h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm leading-tight font-semibold">{actorName}</span>
          <time
            dateTime={entry.occurredAt.toISOString()}
            title={absoluteTimestamp}
            className="text-muted-foreground text-xs"
          >
            <RelativeTime date={entry.occurredAt} />
          </time>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm leading-normal">
```

Two divergences the UI-SPEC mandates: the audit entry uses `useTranslations("audit")` (new
namespace) not `"notes"`, and the `user` actor kind uses an `Avatar`, taken from
`note-entry.tsx:154-157` plus the `getInitials` helper at `note-entry.tsx:45-55`:

```tsx
// note-entry.tsx:154-157
        <div className="w-8 shrink-0">
          <Avatar className="size-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
```

```tsx
// note-entry.tsx:40-55 — READ THE COMMENT BEFORE COPYING A FIFTH TIME
/**
 * The fourth copy of this helper in the repo (deal-card.tsx, and two siblings). A fourth
 * copy is tolerable; a fourth copy that BEHAVES differently is not, so this is byte-for-byte
 * the deal-card.tsx logic. Its signature requires an email, which is exactly why the
 * unknown-author branch below never calls it rather than passing an empty string.
 */
function getInitials(name: string | null, email: string): string { ... }
```

A **fifth** copy is where the plan should stop and either import from `note-entry.tsx` or extract
— the existing comment already flags the ceiling.

**Deliberately NOT copied:** the `FROM_SLOT`/`TO_SLOT` sentinel machinery (`:63-100`). That exists
because a translated sentence had to host React badges. The audit entry's `<dl>` has a
label/value structure with no interpolated elements (UI-SPEC § Typography: "the row is readable
without punctuation"), so the sentinels are not needed and importing them would be cargo cult.

---

### `src/components/timeline/timeline-entry.tsx` — the dispatcher branch

**Analog:** itself. One `case`, inserted at `:56`:

```tsx
// timeline-entry.tsx:51-63
    case "activity":
      return <ActivityEntry entry={entry} />

    case "stage_change":
      return <StageChangeEntry entry={entry} />

    default: {
      // Adding a kind to the union without adding a branch above is a compile error here.
      const unhandled: never = entry
      void unhandled
      return null
    }
```

The module header (`:12-19`) names this phase and forbids defeating the gate. `AuditEntry` takes
`entry` only — do NOT thread `canManage`/`onUpdated`/`onDeleted` through (`:26-32`), the audit
entry has no row actions.

---

### `src/app/api/v1/audit/route.ts` (route, read-only admin GET)

**Analog:** `src/app/api/v1/notes/[noteId]/route.ts` — the only v1 route that does an admin-style
role check, and the one whose doc comment explains why `ApiAuthContext` is insufficient.

```typescript
// api/v1/notes/[noteId]/route.ts:26-61
/**
 * ...
 * `ApiAuthContext` is `{ userId, keyId }` with no role, so the role is re-read from storage
 * rather than trusted from the request (T-35-24). An unresolvable actor is denied, never
 * treated as a non-admin fallback (T-35-25).
 */
async function authorizeNoteMutation(
  noteId: string,
  userId: string
): Promise<{ ok: true; note: Note } | { ok: false; response: NextResponse }> {
  ...
  const actor = await resolveActorRole(userId)
  if (!actor) {
    return { ok: false, response: Problems.forbidden() }
  }
  ...
}
```

```typescript
// api/v1/notes/[noteId]/route.ts:69-78, 114-117 — the handler envelope
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      const { noteId } = await params

      const authorized = await authorizeNoteMutation(noteId, context.userId)
      if (!authorized.ok) {
        return authorized.response
      }
      ...
    } catch (error) {
      console.error("PATCH /api/v1/notes/[noteId] failed:", error)
      return Problems.internalError()
    }
  })
}
```

Copy: `withApiAuth(request, async (req, context) => { try { ... } catch { console.error("<METHOD>
<path> failed:", error); return Problems.internalError() } })`, the early-return
`{ok:false, response}` authorize helper, `Problems.forbidden()` for a non-admin (never 404), and
`singleResponse`/`listResponse` from `@/lib/api/response`.

The audit GET differs in one place: the admin check is `actor.role === "admin"` directly, not
`isAuthorOrAdmin` — there is no author. Write it as its own small helper in the route rather than
extending `src/lib/notes/authorize.ts`, whose module comment (`:1-22`) explains it is
notes-specific by design.

**Pagination** — `src/lib/api/pagination.ts:19-33`:

```typescript
export function parsePagination(request: NextRequest): { offset: number; limit: number } {
  const { searchParams } = request.nextUrl
  const rawOffset = parseInt(searchParams.get("offset") ?? "", 10)
  const rawLimit = parseInt(searchParams.get("limit") ?? "", 10)
  const offset = Number.isNaN(rawOffset) ? 0 : Math.max(0, rawOffset)
  const limit = Number.isNaN(rawLimit)
    ? DEFAULT_PAGE_SIZE
    : Math.min(MAX_PAGE_SIZE, Math.max(1, rawLimit))
  return { offset, limit }
}
```

---

### `src/app/admin/audit/page.tsx` (page, RSC)

**Analog:** `src/app/admin/export/page.tsx:47-70` — the simplest "read data, render an h1, hand
plain values to a client form" admin page. All five admin pages share the `<h1>` class string
verified in this session:

| File:line | Class |
|-----------|-------|
| `src/app/admin/page.tsx:51` | `<h1 className="text-3xl font-bold">{t('title')}</h1>` |
| `src/app/admin/export/page.tsx:50` | same |
| `src/app/admin/webhooks/page.tsx:52` | same |
| `src/app/admin/pipelines/page.tsx:63` | same |
| `src/app/admin/users/page.tsx:67` | same |

```tsx
// src/app/admin/export/page.tsx:47-69
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <ExportForm
        initialFilters={...}
        owners={allUsers.map((u) => ({ id: u.id, name: u.name || u.email }))}
        stages={allStages.map((s) => ({ id: s.id, name: `${s.pipelineName} - ${s.name}` }))}
      />
    </div>
  )
```

Note `getTranslations('admin.export')` at `:19` — server component translation idiom. The
UI-SPEC puts the retention keys under `audit.retention.*`, so it is `getTranslations('audit')`.

**No auth code in the page.** `src/app/admin/layout.tsx:10-18` already redirects:

```tsx
  const session = await auth()
  if (!session) { redirect("/login?callbackUrl=/admin") }
  if (session.user.role !== "admin") { redirect("/?error=unauthorized") }
```

**Sidebar entry** — `src/components/admin-sidebar.tsx:9-45`, a flat array of
`{ title, href, icon }` with **English literal titles** (`"Webhooks"`, `"Export Data"`). The
UI-SPEC's decision to write `"Audit Log"` as a literal here matches this file's own pattern.

**Dashboard tile** — `src/app/admin/page.tsx:168-198` (the `dataManagement` grid) is a
`<Link href><Card className="hover:bg-muted/50 transition-colors cursor-pointer">` with
`CardHeader` / `CardTitle className="text-base"` / icon `h-5 w-5 text-muted-foreground` /
`CardDescription`. The new tile is a third child of that `md:grid-cols-3`.

---

### `src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx` (component, server)

**Analog:** `src/app/workflows/[id]/runs/[runId]/components/run-step-list.tsx` — 48 lines,
and the UI-SPEC's empty-state copy already quotes it.

```tsx
// run-step-list.tsx:20-46 (complete component)
export function RunStepList({ steps }: RunStepListProps) {
  if (steps.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        No execution steps recorded
      </div>
    )
  }

  return (
    <div role="list" className="rounded-md border divide-y">
      {steps.map((step) => (
        <div key={step.nodeId} role="listitem">
          <StepDetail ... />
        </div>
      ))}
    </div>
  )
}
```

Copy: the exported row interface above the component (`:4-14`), the early-return empty state with
that exact class string, `role="list"` + `rounded-md border divide-y`, and the per-row
`role="listitem"` wrapper. The UI-SPEC upgrades the outer to `<ul>`/`<li>` — either is consistent
with the accessibility contract, but keep the class strings.

**Page insertion** — `src/app/workflows/[id]/runs/[runId]/page.tsx:135` is the `<RunStepList
steps={combinedSteps} />` line inside `<div className="container py-6 space-y-6">` (`:105`). The
new section goes immediately after. The page's auth is `:18-21`:

```tsx
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }
```

Session-only, no ownership check — the CONTEXT's accepted recommendation 3 is to match this.

**Degraded state** — `src/components/timeline/record-timeline.tsx:67-79` is the precedent for
"catch the query failure and render a message instead of taking the page down":

```tsx
  } catch (error) { ... {t("error.timelineUnavailable")} ... }
```

This matters because there is no `error.tsx` anywhere under `src/app/`.

---

### `src/lib/audit/no-mutation-coupling.test.ts` (test, source gate)

**This is the highest-risk file in the phase.** Both available analogs shipped with a
vacuous-pass bug that a reviewer, not the suite, caught. Cite them *together with* their failures.

**Analog A:** `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` — the repo-wide
directory-walk gate.

```typescript
// rsc-boundary.test.tsx:84-105
/**
 * Strip `/* *\/` blocks and `//` line comments.
 *
 * Mandatory, not cosmetic. Every assertion below that matters is a NEGATIVE one
 * ("page.tsx must not contain `<FieldDialog`"), and a negative source assertion
 * is trivially invalidated by a comment that merely mentions the old code - the
 * exact class of self-invalidating gate that lets a regression back in. The
 * `[^:]` guard keeps `https://` out of the line-comment match.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Read a source file with comments removed. Missing file = loud failure, by design. */
function readSource(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

/** True when the first non-comment token of a file is the `'use client'` directive. */
function isClientModule(stripped: string): boolean {
  return /^\s*(['"])use client\1/.test(stripped)
}
```

```typescript
// rsc-boundary.test.tsx:327-349 — the walk, and the test-file carve-out
const SKIP_DIRS = new Set(['node_modules', '.next', '.claude', '.git'])

/**
 * Test files are out of scope for BOTH halves of the scan. They are not part of
 * the RSC component graph ... and they quote the
 * very patterns being searched for as literals - including this file, which would
 * otherwise register as both a "definer" and an offending non-client "usage".
 */
const isTestFile = (file: string) =>
  /(^|[/\\])__tests__[/\\]/.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
```

**The non-vacuity assertion is the part that must be copied** (`rsc-boundary.test.tsx:359-372`):

```typescript
    const definers = files.filter(f => sources.get(f)!.includes(FORWARDS_CHILDREN))

    // Non-empty, so a refactor that renames or reformats the pattern makes this
    // gate FAIL loudly rather than pass vacuously over an empty set.
    expect(definers.length).toBeGreaterThan(0)
```

Applied to `no-mutation-coupling.test.ts`: assert the four `src/lib/mutations/*.ts` files were
actually **found and read** (`expect(files).toHaveLength(4)`) and that they contain a known
positive marker (`crmBus.emit`) before asserting the negative. A glob that silently matches zero
files passes a "no file imports X" test perfectly.

The same file also shows the D-44-02 gate discovering a subtler vacuity (`:155-169`): a type-level
contract that a `.map(...)` could satisfy while defeating the purpose — hence the paren-depth
`mapCallArguments` scanner (`:184-225`) rather than a regex.

**Analog B:** `src/app/__tests__/record-dialog-note-failure.test.ts` — the source gate with the
**two documented vacuous-pass bugs**, both of which are the failure mode this phase's gate can hit.

Bug 1, `blockAt` silently widening (`:42-71`):

```typescript
/**
 * Return the `{ ... }` block that starts at the first `{` at or after `from`, brace balanced.
 * ...
 * `from` is almost always an `indexOf` result, and a MISSING anchor is the dangerous
 * case (WR-13): `indexOf("{", -1)` is treated as `indexOf("{", 0)`, so a caller whose
 * anchor has been deleted would silently receive the ENCLOSING block instead of the
 * branch it asked for — and its assertion could then be satisfied by a line belonging to
 * a different branch entirely. That is a detector that stops detecting without saying so...
 * So the anchor is checked, not the brace: `start > -1` cannot catch it, because the
 * brace it finds does exist.
 */
function blockAt(source: string, from: number, anchor = "anchor"): string {
  expect(from, `${anchor} not found — blockAt would silently widen to the enclosing block`)
    .toBeGreaterThan(-1)
  ...
}
```

Bug 2, a detector blind to the idiom the fix itself introduced (`:94-113`):

```typescript
/**
 * The first version of this gate matched only the literal `setXOpen(false)` /
 * `setEditingX(null)` / `setSelectedDeal(null)` — the shapes the CR-03 fix REMOVED — and
 * was blind to the shape that same fix INTRODUCED (WR-14). Three of the seven call sites
 * now own a named `handleDialogOpenChange`, which is the most natural way a future
 * developer would close a dialog there, and `handleDialogOpenChange(false)` sailed
 * straight through.
 */
```

And the **gate-for-the-gate** that resulted (`:253-286`) — the single most transferable idea here:

```typescript
  // A gate for the gate. The detector above is only worth its assertions if it actually
  // recognises how these files close a dialog, and it silently stopped doing so once the
  // CR-03 fix introduced a named close handler (WR-14). Pin the vocabulary so the next
  // idiom has to be added here deliberately rather than discovered by a reviewer.
  describe("CLOSES_THE_DIALOG recognises how these files actually close a dialog", () => {
    it.each([ "setCreateDialogOpen(false)", ..., "handleDialogOpenChange(false)" ])(
      "catches %s", (line) => { expect(line).toMatch(CLOSES_THE_DIALOG) })

    it.each([ "setDeleteDialogOpen(false)", "router.refresh()", ... ])(
      "leaves %s alone", (line) => { expect(line).not.toMatch(CLOSES_THE_DIALOG) })
  })
```

`no-mutation-coupling.test.ts` MUST carry this: a table of strings that *should* trip the detector
(`import { getCurrentActor } from "@/lib/audit/actor-context"`, `from '@/lib/audit/diff'`,
`from "@/db/schema/audit-log"`, `require("@/lib/audit/...")`, a bare `auditLog` identifier
reference) and a table that should not (`// audit` in a comment — which `stripComments` removes,
so assert that explicitly). Without it, the SC-5 gate is a string that happens to be absent.

---

### `src/lib/api/auth.test.ts` — no test-shape analog (flagged)

**`src/lib/api/auth.ts` has no test file today.** Verified: `src/lib/api/` contains
`auth.ts, errors.ts, expand.ts, notes-collection.ts, pagination.ts, rate-limit.ts, response.ts,
serialize.ts, serializers/note.ts, webhooks/*` and exactly two test files —
`__tests__/notes-collection.test.ts` and `__tests__/serialize-run.test.ts`. Neither
`auth.ts`, `rate-limit.ts`, `errors.ts` nor `response.ts` is covered. Nothing in the repo tests
`validateApiKey` or `checkRateLimit` either.

**The nearest usable shape** is `src/lib/api/__tests__/notes-collection.test.ts:11-56` — the only
test of a **lib module** that takes a `NextRequest` and returns a `NextResponse`:

```typescript
// notes-collection.test.ts:11-34
import { readFileSync } from "node:fs"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import { PgDialect } from "drizzle-orm/pg-core"
import type { ApiAuthContext } from "@/lib/api/auth"

type ApiRouteHandler = (
  request: NextRequest,
  context: ApiAuthContext
) => Promise<NextResponse>

vi.mock("@/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))

// Auth bypass: this suite is about what the handlers do AFTER authentication.
vi.mock("@/lib/api/auth", () => ({
  withApiAuth: vi.fn((req: NextRequest, handler: ApiRouteHandler) =>
    handler(req, { userId: "user-1", keyId: "key-1" })
  ),
}))
```

**The inversion the planner must notice:** every existing test *mocks away* `withApiAuth`. A test
*of* `withApiAuth` cannot do that — it must instead mock its three collaborators
(`@/lib/api-keys` → `validateApiKey`, `./rate-limit` → `checkRateLimit`, and `./errors` left real),
construct a real `NextRequest` with an `Authorization: Bearer …` header, and assert the actor
context observed **inside** the handler via the real `getCurrentActor()`. There is no file in the
repo shaped like that. Closest partial precedents for the pieces:

- `NextRequest` construction with headers: `notes-collection.test.ts` and
  `src/app/api/v1/organizations/[id]/__tests__/route.test.ts`.
- Selective mocking with `importOriginal` (keep some exports real):
  `src/app/api/v1/notes/__tests__/route.test.ts:36-40`.
- Reading real ALS inside a callback under vitest: `src/lib/execution/recursion.test.ts:24-31`.

Compose these three; do not look for one file to copy.

---

### Import boundary + summary row (addendum decision)

**No analog for "a summary audit row written directly by the importer."** The two importers'
public entry points are:

- `src/app/import/actions.ts:222 importOrganizations`, `:280 importPeople`, `:387 importDeals`,
  `:584 importActivities` — **four** entry points, not one. The ALS wrap has to go on all four
  (or at their shared inner call site).
- `src/lib/import/pipedrive-api-import-actions.ts:294 importFromPipedrive` — one entry point.

Both write through a private `batchInsert` helper (`import/actions.ts:62-75`,
`pipedrive-api-import-actions.ts:86-94`) that does `db.insert(table).values(batch as never)` with
no event — the RESEARCH claim is verified.

`src/db/schema/import-sessions.ts` supplies the session id the summary row references
(`importSessions.id`, `text` PK, `$defaultFn(() => crypto.randomUUID())`) and is the correct
`workflow_run_id`-analogue for the `import` actor kind.

---

## Shared Patterns

### Actor context establishment (4 boundaries)
**Source:** `src/lib/execution/engine.ts:105-111`
**Apply to:** `src/lib/api/auth.ts:52`, `src/lib/execution/engine.ts:108`, the server-action
boundary, and the five importer entry points.

```typescript
  return runWithExecutionDepth(run.depth ?? 0, () =>
    executeRunGraph(runId, run, workflow)
  ) as Promise<void>
```

The `as Promise<void>` cast is forced by `T | Promise<T>` and is the idiom, not a smell.

### Fire-and-forget insert
**Source:** `src/lib/events/subscribers/stage-history.ts:18-31`
**Apply to:** `src/lib/events/subscribers/audit.ts` only.

Non-async handler + `.catch((err) => console.error("[tag]", err))`. Never `await`, never `async`.

### Fail-closed single-row read
**Source:** `src/lib/notes/authorize.ts:69-85`
**Apply to:** `src/lib/audit/settings.ts` (`readRetentionDays`), the audit REST admin gate.

`try { findFirst } catch { console.error(...); return null }` — `null` means "deny"/"do nothing",
never "use a default".

### `setTimeout`-chained processor
**Source:** `src/lib/execution/execution-processor.ts:30-56`
**Apply to:** `src/lib/audit/prune.ts`, registered in `instrumentation.ts`.

Constants at module scope, `try/catch` inside the callback, `scheduleTick(INTERVAL)` **outside**
the `try` with the `// Always schedule the next tick` comment.

### `withApiAuth` envelope
**Source:** `src/app/api/v1/notes/[noteId]/route.ts:69-78,114-117`
**Apply to:** `src/app/api/v1/audit/route.ts`.

### Schema-declared DDL (Phase 33 D-06)
**Source:** `src/db/schema/notes.ts:32-46`, `src/db/schema/deal-stage-history.ts:22-24`
**Apply to:** both new schema files. Never hand-write index SQL into `drizzle/0014_*.sql`.

### i18n parity gate
**Source:** `src/messages/locale-parity.test.ts:28-53` (`REQUIRED_NOTE_KEYS`), `:126-148`
**Apply to:** all 71 new keys.

```typescript
export const REQUIRED_NOTE_KEYS: string[] = [
  "notes.timeline",
  "notes.composerPlaceholder",
  ...
]
```

Add a sibling `REQUIRED_AUDIT_KEYS` and wire it into the same five assertions (missing-keys,
key-set identity, non-empty, untranslated-in-both, placeholder survival).

### `{ success: true } / { success: false, error }` server action
**Source:** repo-wide; `src/lib/custom-fields.ts:200-204` signature is representative
**Apply to:** `src/app/admin/audit/actions.ts`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/db/schema/app-settings.ts` | model | key/value | **Genuinely new.** No key/value table exists in `src/db/schema/` (all 25 files enumerated and checked). The closest precedent is `src/db/schema/notification-preferences.ts` — a per-user settings table, but with **typed boolean columns and a `user_id` PK**, i.e. the exact shape the CONTEXT rejected. `src/db/schema/import-sessions.ts:10` (`progress: jsonb("progress").notNull().default({})`) supplies the JSONB-column idiom, and `src/db/schema/http-templates.ts:10` (`config: jsonb("config").$type<Record<string, unknown>>().notNull()`) supplies the `$type`-narrowed variant. Compose those two onto a `text('key').primaryKey()`. Say in the schema file that this is a new table shape and why. |
| `src/lib/audit/prune.test.ts` | test (fake timers) | — | **No processor in this repo has a test.** Verified: no test file references `startExecutionProcessor`, `startWebhookProcessor`, `startEmailProcessor`, `startScheduleProcessor` or `cleanupStaleImportSessions`. There is no `vi.useFakeTimers()` precedent for a `setTimeout` chain. This is new ground: the test must drive `scheduleTick` through `vi.advanceTimersByTimeAsync`, and the "always reschedules after a throw" case has to assert a *second* pending timer exists. Budget for it as real work, not as a copy. |
| `src/lib/api/auth.test.ts` | test | — | No test exists for `withApiAuth` and every other suite *mocks it away*. See § `src/lib/api/auth.test.ts` above for the three-part composite. |
| `scripts/audit-log-checks.sql` | script | manual evidence | No `scripts/` SQL artifact from Phase 33 or 35 survives in the tree (`scripts/` has no checked-in `.sql` evidence file). The pattern exists only in those phases' SUMMARY documents. Treat the format as free choice; the constraint is that it is re-runnable inside the container and its output is pasted into the plan. |
| Timeline **filter toggle** (audit OFF by default) | service + component | — | `TIMELINE_SOURCES` (`sources.ts:376-380`) is consumed unconditionally; no source is ever filtered today. **And 36-CONTEXT (addendum) requires the toggle while 36-UI-SPEC § Density explicitly excludes filtering from this phase.** No analog, and a contract conflict — resolve before planning. |

---

## Flagged for the Planner

1. **No test in this repo mocks `AsyncLocalStorage`.** Verified: `async_hooks`/`AsyncLocalStorage`
   appears in exactly three files — `src/lib/execution/recursion.ts:1`,
   `src/lib/triggers/create-run.ts`, and `src/lib/execution/recursion.test.ts` (which imports the
   *real* helpers and never mocks the storage). Testing ALS by running it for real under vitest is
   the established approach and it works; do not introduce a mock.

2. **`src/lib/api/auth.test.ts` does not exist and this phase edits `withApiAuth`.** Nearest usable
   shape is described above. Wave 0 must land it before the edit.

3. **The five snake_case emit sites are enumerated and verified above** — `people/route.ts:243`,
   `people/[id]/route.ts:257`, `people/batch/route.ts:171`, `deals/route.ts:335`,
   `deals/batch/route.ts:231`. Only `serializePerson` and `serializeDeal` reach an emit site;
   `serializeActivity` and `serializeOrganization` do **not**, correcting RESEARCH's implication
   that all four serializer key maps are needed.

4. **Both source-gate analogs shipped with vacuous-pass bugs** (WR-13 `blockAt` widening; WR-14 a
   detector blind to the idiom its own fix introduced). Copy the *remedies* — the anchor assertion,
   the non-empty-definers assertion, and the gate-for-the-gate `it.each` vocabulary table — not just
   the file-reading scaffolding.

5. **`getInitials` would become its fifth copy** (`note-entry.tsx:40-55` already calls out the
   fourth). Import or extract; do not paste.

6. **CONTEXT ↔ UI-SPEC conflict on the timeline filter toggle** (item 6 in § No Analog Found).

---

## Corrections to RESEARCH

| RESEARCH claim | Correction |
|----------------|------------|
| "one mapping table derived from `src/lib/api/serialize.ts:32-107`" implying four serializers | Only `serializePerson` (`:48-63`) and `serializeDeal` (`:70-86`) reach a `crmBus.emit`. `serializeActivity`/`serializeOrganization` never do. |
| "the importer" (singular) as one ALS boundary | `src/app/import/actions.ts` has **four** exported entry points (`:222,280,387,584`); `pipedrive-api-import-actions.ts` has one (`:294`). Five wrap sites, not two. |
| `src/lib/execution/execution-processor.ts:30-56` as the pruner analog | Correct for structure. But it counts nothing and deletes nothing — pair it with `import-session-cleanup.ts:15-47` for the delete-and-log body, and note that analog's JS-`Date` cutoff is the one thing NOT to copy. |

---

## Metadata

**Analog search scope:** `src/db/schema/`, `src/lib/events/`, `src/lib/execution/`, `src/lib/audit/`
(absent), `src/lib/timeline/`, `src/lib/api/`, `src/lib/notes/`, `src/lib/import/`,
`src/components/timeline/`, `src/app/admin/`, `src/app/api/v1/`, `src/app/workflows/[id]/runs/`,
`src/messages/`, `instrumentation.ts`
**Files read in full or in targeted ranges:** 34
**Pattern extraction date:** 2026-08-16
