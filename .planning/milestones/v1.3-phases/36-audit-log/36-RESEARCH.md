# Phase 36: Audit Log - Research

**Researched:** 2026-08-15
**Domain:** Append-only change capture over an existing synchronous event bus; PostgreSQL retention at scale; `AsyncLocalStorage` actor attribution; timeline source extension
**Confidence:** HIGH — every claim below is grounded in a file:line read in this session or a measurement taken against the live PostgreSQL 16.13 inside a rolled-back transaction. Nothing rests on WebSearch.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Capture Mechanism and Before/After Values**
- `CrmEventPayload` gains an optional `previous` populated from the row the mutation layer
  **already re-reads** to check existence. AUDIT-02's requirement is that audit *capture* is a
  subscriber — enriching the event the subscriber consumes is not the same as putting audit logic
  into mutations. This is the only way before-values can exist at all: a subscriber fires after the
  write and cannot recover what the value used to be.
- One audit row per change event, carrying a JSONB `changes` map of `field → { from, to }`. Not one
  row per changed field — this is the table PROJECT.md singles out as the disk risk, and row count
  is the thing to keep down.
- Audited fields are native columns plus custom fields, **excluding formula-derived values**. The
  ROADMAP is explicit that Phase 34's recalculations are writes and must not flood the log with
  derived-value noise. A formula field changing because its input changed is already represented by
  the input's own entry.
- Creates and deletes are logged alongside updates — a create records the initial state, a delete
  records a tombstone. Without both ends, "traced to who made it" has holes.

**Actor Identity and Kind**
- Actor kind comes from an `AsyncLocalStorage` actor context established at the four entry
  boundaries (server action, `/api/v1` route, workflow executor, importer) and read by the audit
  subscriber. Direct repo precedent: Phase 26 used AsyncLocalStorage for workflow recursion depth
  precisely because it propagates across async boundaries without threading a parameter through
  every function signature — which is what AUDIT-02 exists to avoid.
- The kinds are `user`, `workflow_run`, `api_key`, `import` (exactly AUDIT-01's four) plus `system`.
- A nullable, indexed `workflow_run_id` foreign key is stored on the audit row so the workflow run
  detail page can list every record that run mutated. That is the second half of SC-2 and it needs
  a real key, not timestamp correlation.
- When no actor context is present, the entry records `system`. It must NEVER fall back to the
  event's `userId` — a confidently wrong name in an audit log is worse than an honest "unknown".

**Retention and Pruning**
- Default retention is **90 days**, configurable. Long enough to answer "who changed this last
  quarter", short enough to bound growth on a deployment where nobody is watching disk.
- The setting lives in a new minimal `app_settings` key/value table with a JSONB value. No settings
  table exists in the schema today. Phase 40 (saved views) and Phase 42 (observability) will both
  want one, so this is the point at which a shared table stops being speculative — but this phase
  only introduces the table and the one key it needs.
- Pruning runs as a `setTimeout`-chained processor registered in `instrumentation.ts` — the
  established pattern for all four existing processors — daily, deleting in **capped batches** so
  it never takes a long write lock on the biggest table in the schema.
- Pruning is observable and fails closed: it logs rows deleted per run, caps deletions per tick, and
  does nothing at all when retention is unset or unparseable. The safe direction is keeping data.

**Surfaces**
- Per-record history renders as a **fourth timeline source**, not a separate tab. Phase 35 built the
  assembler for exactly this: append to `TIMELINE_SOURCES`, add `'audit'` to `TimelineEntryKind`,
  and the dispatcher's compile-time `never` check will fail the build if the renderer is missed.
  Phase 35's summary states this is a two-edit extension.
- The workflow run detail page gains a linked-records section, queried by the indexed
  `workflow_run_id`.
- REST exposure is a **read-only, admin-only** `GET` under `/api/v1`. An audit log any API key can
  read is an information-disclosure surface, and it is never writable from outside the subscriber.
- The retention admin UI is a number input under `/admin` that writes the `app_settings` key and
  displays the current entry count and oldest entry, so the operator can see what the window costs.

### Claude's Discretion
- Table and column naming, index selection, the exact JSONB shape of `changes`, batch size and tick
  interval for the pruner, and how the audit timeline entry renders visually.
- Whether `previous` is added to the shared `CrmEventPayload` or to a narrower update-only payload
  type — decide during planning based on what keeps the type honest for creates and deletes.

### Deferred Ideas (OUT OF SCOPE)
- Auditing non-CRM entities (users, workflows, pipelines, custom field definitions).
- Restoring or undoing a record from an audit entry — Phase 37 owns trash/restore.
- Exporting or streaming the audit log to an external SIEM.
- Per-field or per-entity access control on audit reads beyond admin-only.
- Migrating the Phase 35 `deal_stage_history` table into the audit log; the two coexist, and the
  timeline assembler already merges both.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **AUDIT-01** | Every CRM write records who changed what — entity, field-level before/after, actor, and actor kind (user / workflow run / API key / import) | § Write-Path Inventory names all 24 emit sites with file:line and their pre-read; § The `previous` Problem proves every update/delete emit site already loads the full prior row for free. **§ Open Question 1 is a hard blocker on the word "Every"** — three write paths emit nothing at all today. |
| **AUDIT-02** | Audit capture is driven by the existing `crmBus` subscriber, so no mutation code changes to add it | § Pattern 1 (the subscriber, modelled on `stage-history.ts`); § ALS Actor Context proves — by executed probe, not reasoning — that the context survives from the entry boundary to the fire-and-forget insert; § Boundary Map shows `/api/v1` needs **one** edit (`withApiAuth`) and the workflow executor **one** (`engine.ts:108`). |
| **AUDIT-03** | User can view a record's change history, and can trace from a workflow run to the records that run mutated | § The Timeline Extension — measured 4-branch `Merge Append` at 0.516 ms warm vs 0.456 ms for today's 3 branches; § Read Pattern 2 — partial `workflow_run_id` index, `Bitmap Index Scan`, 0.408 ms on 1M rows. § Pitfall 5 quantifies the feed-domination side effect (15 of the top 21 entries become audit rows). |
| **AUDIT-04** | Admin can configure audit retention, and old entries are pruned automatically | § Retention Pruning at Scale — three delete strategies measured head-to-head at 1M rows in steady state (17.8 ms vs 311 ms vs 395.7 ms); § the `created_at` index is proven mandatory, not optional; § `app_settings` shape and the `instrumentation.ts` processor precedent. |
</phase_requirements>

---

## Summary

This phase has **no new dependencies, no new patterns to invent, and one large unpleasant surprise.**
Everything the CONTEXT locks is buildable from what is already in the repo: `crmBus` is a synchronous
`EventEmitter` (`src/lib/events/bus.ts:8`), `stage-history.ts` is a working, tested fire-and-forget
subscriber to copy verbatim, `AsyncLocalStorage` is already in production use for workflow recursion
depth (`src/lib/execution/recursion.ts:5`), and Phase 35's `TimelineSource` interface was written
with this phase named in its doc comment. Three of the four research questions came back cleaner than
the CONTEXT assumed:

1. **`previous` is free.** All four mutation modules and all three `/api/v1/{entity}/[id]` routes
   already `findFirst()` the *entire* row — no `columns:` projection — before writing. Native columns
   and the `custom_fields` JSONB blob are both already in hand at every update and delete emit site.
   Widening costs zero queries and zero bytes.
2. **Formula noise is nearly a non-problem.** `recalculateFormulas` writes with a bare
   `db.update(table).set({ customFields: merged })` and emits **no** `crmBus` event
   (`src/lib/formula-recalc.ts:733-741`), so the entire depth-1 cascade over child rows is invisible
   to a bus subscriber by construction. Phase 34 also deliberately does not bump `updatedAt` on that
   write, with a comment naming Phase 36 as the reason. The only residual noise is formula keys inside
   the saved entity's *own* `data.customFields`, and those are self-identifying: every stored formula
   value is a `{ formula: true, value, error }` wrapper narrowed by `isFormulaWrapper`
   (`src/lib/formula-helpers.ts:144`), which is in a deliberately db-free module a subscriber can import.
   **No `custom_field_definitions` query is needed to exclude formula fields.**
3. **The ALS context genuinely survives.** Not assumed — probed. An executed Node 20.20.2 script inside
   the app container reproduced the exact shape (`als.run` → multi-`await` async mutation → synchronous
   `EventEmitter.emit` → non-async handler → fire-and-forget promise) and read the correct store both
   synchronously at handler entry and inside the `.then()` continuation, across nesting, absence, and
   two concurrent interleaved contexts, with zero cross-contamination.

The surprise is scope. **AUDIT-01 says "Every CRM write" and three high-traffic write paths emit no
`crmBus` event at all**, so a pure subscriber cannot see them: `saveFieldValues`
(`src/lib/custom-fields.ts:238` — the record detail page's custom-field save, on a dataset with 169
field definitions), the CSV importer (`src/app/import/actions.ts:71`) and the Pipedrive importer
(`src/lib/import/pipedrive-api-import-actions.ts:92`). The importer gap directly falsifies
ROADMAP SC-3's clause "*and via the Pipedrive importer are distinguishable by actor kind*" — the
`import` actor kind has, today, no event to attach itself to. This must be decided before planning
(Open Questions 1 and 2). A second, smaller trap: `/api/v1/people/*` and the two create paths for
deals emit **snake_case serialized** payloads while every other site emits the raw camelCase row, so
a naive `diff(previous, data)` produces garbage on exactly those routes.

**Primary recommendation:** build the subscriber, the ALS actor context and the `audit_log` table
exactly as the CONTEXT specifies; index it `(entity_type, entity_id, created_at DESC)` +
partial `(workflow_run_id) WHERE NOT NULL` + `(created_at)`; prune with
`DELETE … WHERE ctid IN (SELECT ctid … LIMIT n)` in 5,000-row batches; **normalise every emitted
payload through one shared key-mapping helper before diffing**; and get an explicit decision on the
three non-emitting write paths before the plan is written, because two of the five ROADMAP success
criteria depend on the answer.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Change capture (who/what/before/after) | Node server process — `crmBus` subscriber | Database (`audit_log` insert) | The bus is in-process and synchronous; capture must not be a request the browser can skip or forge. |
| Before-value supply (`previous`) | API/Backend — mutation + route layer | — | Only the writer holds the pre-write row. A subscriber fires after the write and cannot recover it. Non-negotiable physics, not a design choice. |
| Actor identity + kind | Node server process — `AsyncLocalStorage` | — | Must be established at the trust boundary (where auth is proven) and read at the sink. It can never be a parameter the caller supplies (§ Security Domain, spoofing). |
| Workflow-run linkage | API/Backend — `engine.ts` ALS scope | Database (FK column + partial index) | The run id exists only inside the executor; a real column is the only thing that survives the request. |
| Retention policy storage | Database — `app_settings` | Admin UI (write) | A row, not an env var: AUDIT-04 says an *admin* configures it, at runtime, without a redeploy. |
| Retention enforcement | Node server process — `setTimeout` processor | Database (batched `DELETE`) | Matches all four existing processors; no external cron exists in this deployment. |
| Per-record history read | Frontend Server (RSC) — `RecordTimeline` | Database (`Merge Append` union) | Page one is server-rendered in the detail page's own render (Phase 35's locked contract). |
| Run→records read | Frontend Server (RSC) — run detail page | Database (partial index) | Same page and same auth boundary as the existing run detail. |
| Read-only audit REST | API/Backend — `/api/v1` + `withApiAuth` | `resolveActorRole` (admin check) | `ApiAuthContext` carries no role; the role must be re-read from storage (`src/lib/api/auth.ts:6-9`). |
| Formula-derived value exclusion | Node server process — the subscriber | — | The discriminator (`isFormulaWrapper`) travels *in the payload*. Nothing else needs to know. |

---

## Standard Stack

### Core — already installed, versions read from `node_modules/*/package.json`

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | **0.45.1** | Schema, `sql` fragments, batched delete | The repo's only ORM [VERIFIED: node_modules] |
| `drizzle-kit` | **0.31.9** | `generate` + `migrate` | Phase 33 D-06: schema-declared DDL only [VERIFIED] |
| `postgres` (postgres.js) | **3.4.8** | Driver | The `Date`-binding hazard in § Pitfall 7 is this driver's [VERIFIED] |
| `next` | **16.1.6** | App Router, RSC, server actions, `instrumentation.ts` | [VERIFIED] |
| `zod` | **4.3.6** | Validating the retention setting and any read filters | Repo-wide convention [VERIFIED] |
| `node:async_hooks` | Node **20.20.2** (container) | `AsyncLocalStorage` actor context | Node built-in; already used at `src/lib/execution/recursion.ts:1` [VERIFIED: executed probe] |
| `vitest` | **4.0.18** | Two projects: base + `react-server` | [VERIFIED] |
| `next-intl` | **4.8.3** | All user-facing strings, three locale files | [VERIFIED] |
| `react` | **19.2.3** | — | [VERIFIED] |
| `lucide-react` | **0.575.0** | Timeline entry icons | [VERIFIED] |

### Supporting — in-repo modules this phase composes, not packages

| Module | file:line | Purpose |
|--------|-----------|---------|
| `crmBus` | `src/lib/events/bus.ts:26` | `globalThis`-pinned singleton over a synchronous `EventEmitter` |
| `stage-history.ts` | `src/lib/events/subscribers/stage-history.ts:15-48` | The exact subscriber shape to copy: module-scope `registered` guard, non-async handler, `.catch` on the insert, `_resetForTesting()` |
| `isFormulaWrapper` / `unwrapFormulaValue` | `src/lib/formula-helpers.ts:144,160` | Formula discrimination, **db-free by design and gated by a test that greps for a db import** |
| `executionDepthStorage` | `src/lib/execution/recursion.ts:5` | The ALS precedent to mirror |
| `withApiAuth` | `src/lib/api/auth.ts:21-53` | The **single** wrapper every `/api/v1` handler passes through |
| `resolveActorRole` | `src/lib/notes/authorize.ts:69` | Reads the role from storage, fails closed. `ApiAuthContext` has no role. |
| `TIMELINE_SOURCES` / `TimelineSource` | `src/lib/timeline/sources.ts:119-144,376` | The pluggable source interface, written with Phase 36 named in its comment |
| `TimelineEntryRow` | `src/components/timeline/timeline-entry.tsx:57-62` | The `never`-exhaustive dispatcher — do not defeat it |
| `parsePagination` | `src/lib/api/pagination.ts:19` | Clamped offset/limit for the read-only REST GET |
| `cleanupStaleImportSessions` | `src/lib/import/import-session-cleanup.ts:15` | The startup-cleanup precedent |
| `startExecutionProcessor` | `src/lib/execution/execution-processor.ts:30-56` | The `setTimeout`-chaining processor precedent (never `setInterval`) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff — and why it loses here |
|------------|-----------|---------------------------------|
| Bus subscriber | PostgreSQL trigger + `plpgsql` | Would catch *all* writes including the three non-emitting paths — but there is no way to get the actor kind, the user id or the workflow run id into a trigger without a session GUC set per connection, and the pool has no per-request connection affinity. Also violates AUDIT-02 verbatim. Rejected. |
| `AsyncLocalStorage` | Thread an `actor` param through every mutation signature | Exactly what AUDIT-02 exists to prevent, and would touch all 24 emit sites. Rejected. |
| `AsyncLocalStorage` | Read the actor from the payload's `userId` | CONTEXT explicitly forbids it, and it cannot distinguish a workflow run from the user who authored the workflow (`context._workflowUserId = workflow.createdBy`, `engine.ts:146`). Rejected. |
| One row per event | One row per changed field | ~2.7× the row count on this dataset's edit shape; CONTEXT-locked against. |
| `DELETE … WHERE ctid IN (…)` | `DELETE … WHERE id IN (SELECT id … ORDER BY created_at LIMIT n)` | **Measured 311 ms vs 17.8 ms** at 1M rows: the planner turns the `id IN` form into a Hash Semi Join with a full Seq Scan of the outer relation. Rejected on measurement. |
| Batched delete | Partitioning by month + `DROP PARTITION` | Genuinely the better long-run answer, but it needs `PARTITION BY RANGE` in the `CREATE TABLE`, which `drizzle-kit generate` does not emit — so it would require hand-written DDL and break Phase 33 D-06. Defer. |
| `app_settings` JSONB value | A typed `audit_retention_days integer` column | The CONTEXT locks a shared key/value table for Phases 40/42. JSONB with a zod parse at read is the honest shape. |

**Installation:** none. `npm install` is not run in this phase.

---

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.**

Every module listed above is either already in `package.json` (versions verified by reading
`node_modules/<pkg>/package.json` directly, not by trusting the manifest) or is a Node.js built-in
(`node:async_hooks`). No registry lookup, no `npm view`, and no slopcheck run was required, because
no new name enters the dependency graph.

If a plan later proposes adding a package, the Package Legitimacy Gate must be run before that plan
is approved. **The default answer for this phase is: do not add one.**

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| — | — | — | — | — | n/a | No packages added |

---

## Architecture Patterns

### System Architecture Diagram

```
 ENTRY BOUNDARIES (where auth is proven — the ONLY place the actor may be established)
 ─────────────────────────────────────────────────────────────────────────────────────
  browser ──▶ server action              ──┐   auth() session          → kind 'user'
              (15 call sites, 4 files)     │
  API key ──▶ withApiAuth                ──┤   ApiAuthContext          → kind 'api_key'
              (src/lib/api/auth.ts:52 —     │   {userId, keyId}
               ONE wrap covers every        │
               /api/v1 route)               │
  trigger ──▶ executeRun                 ──┤   workflowRuns.id +       → kind 'workflow_run'
              (engine.ts:108 — ONE wrap)    │   workflow.createdBy       + workflowRunId
  import  ──▶ importFromPipedrive /      ──┘   importSessions.id      → kind 'import'
              importCsv                        ⚠ EMITS NO EVENTS TODAY (Open Question 2)
                     │
                     ▼
        actorStorage.run({ kind, userId, workflowRunId }, () => …)
                     │
                     ▼  (ALS propagates across every await — PROVEN, not assumed)
 ┌───────────────────────────────────────────────────────────────────────────────────┐
 │ MUTATION LAYER + inline /api/v1 emit sites   (NOT EDITED, except to add `previous`)│
 │                                                                                    │
 │   1. pre-read  db.query.X.findFirst({where: id AND deleted_at IS NULL})            │
 │                └─▶ FULL ROW, no `columns:` projection = `previous` for free        │
 │   2. write     db.update / db.insert … .returning()                                │
 │   3. recalc    recalculateFormulas(...)   ← writes child rows, emits NOTHING       │
 │   4. emit      crmBus.emit(event, {…, previous})   ◀── SYNCHRONOUS                 │
 └───────────────────────────────────────────────────────────────────────────────────┘
                     │ EventEmitter.emit — calls every handler inline, in this stack
        ┌────────────┼────────────┬──────────────────────────┐
        ▼            ▼            ▼                          ▼
   webhook.ts   workflow-     stage-history.ts        ★ audit.ts  (NEW)
                trigger.ts                             │
                                                       │ read actorStorage.getStore()
                                                       │ SYNCHRONOUSLY, at handler entry
                                                       │
                                                       ├─ normaliseKeys(data)  ← snake↔camel
                                                       ├─ diff(previous, data)
                                                       ├─ drop keys where
                                                       │  isFormulaWrapper(from||to)
                                                       └─ db.insert(auditLog).catch(log)
                                                                  │  fire-and-forget
                                                                  ▼
                                                        ┌────────────────────┐
                                                        │  audit_log         │
                                                        │  (entity, id,      │
                                                        │   action, changes  │
                                                        │   JSONB, actor,    │
                                                        │   workflow_run_id) │
                                                        └────────────────────┘
                                                          ▲        ▲        ▲
              read pattern 1 ────────────────────────────┘        │        │
              (timeline branch, index: entity_type,               │        │
               entity_id, created_at DESC)                        │        │
              read pattern 2 ─────────────────────────────────────┘        │
              (run→records, partial index on workflow_run_id)              │
              read pattern 3 ──────────────────────────────────────────────┘
              (prune scan, index: created_at)
                                                                  ▲
 RETENTION                                                        │
 instrumentation.ts register()  ──▶ startAuditPruner()  ──setTimeout chain──┘
                                        │ reads app_settings['audit.retention_days']
                                        │ zod-parse; unset/unparseable ⇒ DELETE NOTHING
                                        └ DELETE … WHERE ctid IN (SELECT ctid … LIMIT 5000)
```

Trace of the primary use case (SC-1): a user drags a deal → `updateDealStage` server action →
`actorStorage.run({kind:'user'})` → `updateDealStageMutation` pre-reads the row at `deals.ts:484` →
writes → `crmBus.emit("deal.updated")` at `deals.ts:540` → audit subscriber reads the store, diffs
`previous.stageId` against `data.stageId`, inserts one row → the deal's timeline renders it as a
fourth-source entry.

### Recommended Project Structure

```
src/db/schema/
├── audit-log.ts              # NEW — table + indexes + AuditActorKind/AuditAction types
├── app-settings.ts           # NEW — key/value with JSONB value
├── index.ts                  # + 2 export lines
└── _relations.ts             # + auditLog relations (users, workflowRuns) — keeps FKs
                              #   out of the entity files and avoids circular imports

src/lib/audit/
├── actor-context.ts          # NEW — AsyncLocalStorage<AuditActor>, runWithActor(),
│                             #   getCurrentActor(). Mirrors execution/recursion.ts.
│                             #   MUST NOT import @/db (the four boundaries import it).
├── diff.ts                   # NEW — PURE. normaliseEventData() + buildChanges().
│                             #   No db, no bus. This is where all the testable logic lives.
├── settings.ts               # NEW — read/write app_settings, zod-parse the retention value
└── prune.ts                  # NEW — startAuditPruner(), setTimeout chain, capped batches

src/lib/events/
├── types.ts                  # + `previous?: Record<string, unknown>` on CrmEventPayload
└── subscribers/audit.ts      # NEW — ~40 lines, mirrors stage-history.ts exactly

src/lib/timeline/
├── types.ts                  # + 'audit' to TimelineEntryKind, + AuditTimelineEntry
└── sources.ts                # + auditSource, + append to TIMELINE_SOURCES

src/components/timeline/
└── audit-entry.tsx           # NEW renderer (+ one branch in timeline-entry.tsx)

src/app/
├── api/v1/audit/route.ts     # NEW — GET only, withApiAuth + resolveActorRole admin gate
├── admin/settings/…          # NEW — retention number input + count/oldest display
└── workflows/[id]/runs/[runId]/components/linked-records.tsx   # NEW

scripts/
└── audit-log-checks.sql      # NEW — the psql evidence artifact (the suite mocks @/db)
```

### Pattern 1: The capture subscriber (copy `stage-history.ts` structurally)

```typescript
// Source: modelled line-for-line on src/lib/events/subscribers/stage-history.ts:15-48
import { crmBus } from "@/lib/events"
import type { CrmEventName, CrmEventPayload } from "@/lib/events/types"
import { db } from "@/db"
import { auditLog } from "@/db/schema"
import { getCurrentActor } from "@/lib/audit/actor-context"
import { buildChanges } from "@/lib/audit/diff"

const AUDITED_EVENTS: CrmEventName[] = [
  "deal.created", "deal.updated", "deal.deleted",
  "person.created", "person.updated", "person.deleted",
  "organization.created", "organization.updated", "organization.deleted",
  "activity.created", "activity.updated", "activity.deleted",
]
// NOTE: "deal.stage_changed" is deliberately absent. It is emitted ALONGSIDE
// "deal.updated" at all four stage-change sites (deals.ts:406+428, 540+561, 664+684,
// v1/deals/[id]:352+356), so subscribing to both would write two audit rows per drag.

let registered = false

export function registerAuditSubscriber(): void {
  if (registered) return

  for (const event of AUDITED_EVENTS) {
    crmBus.on(event, (payload: CrmEventPayload) => {
      // READ THE STORE SYNCHRONOUSLY, HERE, AT HANDLER ENTRY.
      // EventEmitter.emit runs handlers inline in the emitter's own stack, so the
      // ALS context is still the mutation's. Capturing it into a local before the
      // promise is created is what makes the fire-and-forget insert safe. (Proven
      // to work in the continuation too — but do not rely on that.)
      const actor = getCurrentActor()

      const changes = buildChanges(payload)
      // A no-op update (a save that changed nothing) writes no row at all.
      if (payload.action === "updated" && Object.keys(changes).length === 0) return

      db.insert(auditLog).values({
        entityType: payload.entity,
        entityId: payload.entityId,
        action: payload.action,
        changes,
        actorKind: actor?.kind ?? "system",       // NEVER payload.userId
        actorUserId: actor?.userId ?? null,
        workflowRunId: actor?.workflowRunId ?? null,
      }).catch((err) => console.error("[audit]", err))
    })
  }

  registered = true
}

export function _resetForTesting(): void {
  if (registered) for (const e of AUDITED_EVENTS) crmBus.removeAllListeners(e)
  registered = false
}
```

### Pattern 2: The actor context (mirror `recursion.ts`, but db-free)

```typescript
// Source: shape mirrored from src/lib/execution/recursion.ts:1-25
import { AsyncLocalStorage } from "node:async_hooks"

export type AuditActorKind = "user" | "workflow_run" | "api_key" | "import" | "system"

export interface AuditActor {
  kind: AuditActorKind
  /** null for a run whose workflow author is unknown; NEVER inferred from the event. */
  userId: string | null
  workflowRunId?: string | null
}

const actorStorage = new AsyncLocalStorage<AuditActor>()

/** Returns undefined outside any boundary. The subscriber maps that to 'system'. */
export function getCurrentActor(): AuditActor | undefined {
  return actorStorage.getStore()
}

export function runWithActor<T>(actor: AuditActor, fn: () => T | Promise<T>): T | Promise<T> {
  return actorStorage.run(actor, fn)
}
```

Applied at exactly four places (§ Boundary Map):

```typescript
// src/lib/api/auth.ts:52 — ONE edit covers EVERY /api/v1 route, present and future.
- return handler(request, result)
+ return runWithActor(
+   { kind: "api_key", userId: result.userId },
+   () => handler(request, result)
+ ) as Promise<NextResponse>

// src/lib/execution/engine.ts:108 — ONE edit covers every CRM action in every run.
  return runWithExecutionDepth(run.depth ?? 0, () =>
+   runWithActor(
+     { kind: "workflow_run", userId: workflow.createdBy, workflowRunId: runId },
+     () => executeRunGraph(runId, run, workflow)
+   )
- executeRunGraph(runId, run, workflow)
  ) as Promise<void>
```

The workflow boundary must be **inside** `runWithExecutionDepth` (or wrap it — either nesting works,
proven by the probe's "nested" case) and must sit at `engine.ts:108`, not in
`crm.ts:260/272/284`. Wrapping at `engine.ts` also covers the three `runWithExecutionDepth(depth+1, …)`
calls in `crm.ts` for free, because those are nested inside it.

### Pattern 3: The diff, and formula exclusion without a definitions query

```typescript
// Source: src/lib/formula-helpers.ts:144 (isFormulaWrapper) — db-free by design,
// with a checked-in test that fails if a database alias import ever appears there.
import { isFormulaWrapper } from "@/lib/formula-helpers"

/**
 * PURE. No db, no bus, no clock. This is where the whole phase's testable logic lives —
 * the suite mocks @/db entirely, so anything that touches it cannot be unit-tested.
 */
export function buildChanges(payload: CrmEventPayload): Record<string, { from: unknown; to: unknown }> {
  const before = normaliseEventData(payload.entity, payload.previous ?? {})
  const after  = normaliseEventData(payload.entity, payload.data)

  const changes: Record<string, { from: unknown; to: unknown }> = {}

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORED_COLUMNS.has(key)) continue           // updatedAt, position, id
    if (key === "customFields") continue             // handled below, key by key
    if (!deepEqual(before[key], after[key])) changes[key] = { from: before[key], to: after[key] }
  }

  const cfBefore = (before.customFields ?? {}) as Record<string, unknown>
  const cfAfter  = (after.customFields  ?? {}) as Record<string, unknown>
  for (const key of new Set([...Object.keys(cfBefore), ...Object.keys(cfAfter)])) {
    // THE FORMULA GATE. A formula value is stored as { formula: true, value, error }
    // (formula-recalc.ts:712). Testing the VALUE means no custom_field_definitions
    // read is needed at all — the discriminator travels inside the payload.
    // Test BOTH sides: a definition flipped to formula-typed leaves an unwrapped
    // `from` beside a wrapped `to`, and that is still derived noise.
    if (isFormulaWrapper(cfBefore[key]) || isFormulaWrapper(cfAfter[key])) continue
    if (!deepEqual(cfBefore[key], cfAfter[key])) {
      changes[`customFields.${key}`] = { from: cfBefore[key], to: cfAfter[key] }
    }
  }

  return changes
}
```

`normaliseEventData` is the fix for the payload-shape split (§ Pitfall 1). It maps
`serializeDeal`/`serializePerson`/`serializeActivity` key names back to the raw column names using
one table derived from `src/lib/api/serialize.ts:32-107`. Without it, a `PUT /api/v1/people/:id`
produces a diff claiming that `firstName`, `lastName`, `email` … all vanished and `first_name`,
`last_name`, `email` … all appeared.

### Pattern 4: The audit timeline source

```typescript
// Source: shape copied from stageChangeSource, src/lib/timeline/sources.ts:297-369
export const auditSource: TimelineSource = {
  kind: "audit",

  // Unlike activitiesSource and stageChangeSource, this applies to ALL FOUR types —
  // which is what makes the non-deal timeline a two-branch UNION for the first time
  // and falsifies assemble.test.ts:232 (§ The Timeline Extension).
  appliesTo: () => true,

  branch({ entityType, entityId }, cursor, limit) {
    const keyset = cursor
      ? sql` AND (al.created_at, al.id) < (${bindInstant(cursor.instant)}, ${cursor.id})`
      : sql``
    // No deleted_at predicate, and that is not an omission: audit rows are immutable
    // append-only facts, exactly like deal_stage_history (sources.ts:307-308).
    return sql`(
      SELECT 'audit' AS kind, al.id, al.created_at AS occurred_at,
             ${instantKey(sql`al.created_at`)}
      FROM ${auditLog} al
      WHERE al.entity_type = ${entityType}
        AND al.entity_id = ${entityId}${keyset}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT ${limit}
    )`
  },
  // countBranch + hydrate follow the same two-step pattern; hydrate left-joins users
  // for the actor name and returns AuditTimelineEntry[].
}
```

### Pattern 5: The pruner (`setTimeout` chain, never `setInterval`)

```typescript
// Source: shape copied from src/lib/execution/execution-processor.ts:30-56
const INITIAL_DELAY = 60_000          // let the server finish booting
const TICK_INTERVAL = 24 * 60 * 60 * 1000
const BATCH_SIZE = 5_000              // measured: 17.8 ms per batch at 1M rows
const MAX_BATCHES_PER_TICK = 20       // ⇒ ≤100k rows/day, ≤~0.4 s of DELETE per tick

export function startAuditPruner(): void { scheduleTick(INITIAL_DELAY) }

function scheduleTick(delay: number): void {
  setTimeout(async () => {
    try {
      const days = await readRetentionDays()      // zod-parsed from app_settings
      if (days === null) {
        // FAILS CLOSED: unset or unparseable ⇒ delete nothing at all. Keeping data
        // is always the safe direction for an audit log.
        console.log("[audit-prune] retention unset or invalid — no rows deleted")
      } else {
        let total = 0
        for (let i = 0; i < MAX_BATCHES_PER_TICK; i++) {
          const n = await deleteBatch(days, BATCH_SIZE)
          total += n
          if (n < BATCH_SIZE) break               // caught up
        }
        console.log(`[audit-prune] deleted ${total} row(s) older than ${days}d`)
      }
    } catch (error) {
      console.error("[audit-prune] Tick error:", error)
    }
    scheduleTick(TICK_INTERVAL)                   // ALWAYS reschedule
  }, delay)
}
```

The delete itself, in its measured-winning form:

```sql
-- 17.8 ms / 5,000 rows at 1,000,000 rows in steady state. Takes RowExclusiveLock only,
-- which does NOT block concurrent readers or other row writers.
DELETE FROM audit_log
WHERE ctid IN (
  SELECT ctid FROM audit_log
  WHERE created_at < now() - make_interval(days => $1)
  LIMIT $2
);
```

### Anti-Patterns to Avoid

- **Subscribing to `deal.stage_changed` in the audit subscriber.** It is emitted alongside
  `deal.updated` at all four stage-change sites. Two audit rows per drag.
- **Making the handler `async`.** `crmBus.emit` cannot await; an async handler returns a floating
  promise with no `.catch`, which is an unhandled rejection and a silently lost audit row. Both
  existing subscribers avoid this deliberately (`stage-history.ts:19-21`).
- **Reading `getCurrentActor()` inside the `.then()`/`await` continuation.** It happens to work
  (probed), but capturing it into a local at handler entry is unconditionally correct and does not
  depend on ALS continuation semantics staying the same across Node upgrades.
- **Falling back to `payload.userId` when no actor context exists.** CONTEXT forbids it, and it would
  attribute every workflow-driven change to the workflow's *author* rather than to the run.
- **Adding the audit source to `TIMELINE_SOURCES` before updating `assemble.test.ts`.** Eight
  assertions hard-code the branch count; the suite goes red immediately (§ The Timeline Extension).
- **Hand-writing the `CREATE INDEX` statements into `drizzle/0014_*.sql`.** Phase 33 D-06. A
  hand-written index was silently dropped by a later `generate` in this repo (0009→0010).
- **`CREATE INDEX CONCURRENTLY`.** Phase 33 D-03: drizzle wraps migrations in a transaction.
- **`drizzle-kit push`.** It exists in `package.json` and is never used here.
- **A backfill of historical audit rows.** There is no before-state to reconstruct for the 188,629
  existing records. An empty table is the honest starting point; say so explicitly in the plan so it
  is not treated as an oversight.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Actor propagation across awaits | A request-id map, a module-level `currentUser`, or a threaded param | `AsyncLocalStorage` (`recursion.ts:5` precedent) | Module-level state cross-contaminates concurrent requests. **Probed**: two concurrent ALS contexts kept their stores perfectly separate; a module global would not have. |
| Identifying formula-derived values | Query `custom_field_definitions` per audit event | `isFormulaWrapper` on the value (`formula-helpers.ts:144`) | A DB read per event on a fire-and-forget path is a per-write query amplification; and the `!Array.isArray` guard in the existing helper already handles the multi-select-stored-as-array case that a naive `'formula' in v` gets wrong. |
| Batched delete | `LIMIT` inside `DELETE` (invalid in Postgres), or an unbounded `DELETE` | `ctid IN (SELECT ctid … LIMIT n)` | Measured 3 ways; see § Retention. An unbounded delete of 738,401 rows is the exact long-write-lock the CONTEXT forbids. |
| Timeline paging | `LIMIT/OFFSET` for the audit branch | The existing keyset cursor + `instantKey`/`bindInstant` | Phase 35 already paid for these. `bindInstant`'s `::text::timestamp` is load-bearing (`sources.ts:90-107`). |
| Deep-equality for the diff | `JSON.stringify(a) === JSON.stringify(b)` | A small explicit recursive compare, or `node:util.isDeepStrictEqual` | Key order in a JSONB round-trip is not stable, so stringify produces false positives — every save would look like every custom field changed. |
| Admin gate on the REST GET | `context.userId === someAdminId` | `resolveActorRole` + a role check | `ApiAuthContext` is `{userId, keyId}` with no role (`auth.ts:6-9`). Phase 35 already solved this once. |
| Schema DDL | Hand-written SQL in the migration | Declare in `src/db/schema/*.ts`, run `generate` | D-06. Proven to emit partial + `DESC NULLS LAST` correctly — see `drizzle/0013_parched_redwing.sql:27-28`. |

**Key insight:** every "hard" piece of this phase already exists in the repo in working, tested form.
The genuinely new code is one pure diff module, one 40-line subscriber, one 30-line ALS module, one
processor and one table. If a plan is producing more novel machinery than that, it has drifted.

---

## Common Pitfalls

### Pitfall 1 — Three emit sites carry snake_case payloads and will corrupt every diff (HIGH)

**What goes wrong:** `buildChanges(previous, data)` on a `PUT /api/v1/people/:id` reports that
`firstName`, `lastName`, `email`, `phone`, `organizationId`, `ownerId`, `customFields` were all
**removed** and `first_name`, `last_name`, `email`, `phone`, `organization_id`, `owner_id`,
`custom_fields`, `full_name` were all **added** — a 14-key change map for a one-field edit.

**Why it happens:** these three sites emit through the serializer, and two of them carry an explicit
"do NOT harmonise the casing here, it would break existing webhook consumers (T-34-23)" comment:

| Emit site | `data` shape |
|-----------|--------------|
| `src/app/api/v1/people/route.ts:243` (create) | `serializePerson(...)` — **snake_case** |
| `src/app/api/v1/people/[id]/route.ts:257` (update) | `serializePerson(...)` — **snake_case** |
| `src/app/api/v1/people/batch/route.ts:171` (create) | `serializePerson(...)` — **snake_case** |
| `src/app/api/v1/deals/route.ts:335` (create) | `serializeDeal(...)` — **snake_case** |
| `src/app/api/v1/deals/batch/route.ts:231` (create) | `serializeDeal(...)` — **snake_case** |
| `src/app/api/v1/deals/[id]/route.ts:356` (update) | **raw camelCase** (comment at :332-337 says so on purpose) |
| `src/app/api/v1/activities/[id]/route.ts:241` (update) | **raw camelCase** |
| every `src/lib/mutations/*.ts` site | **raw camelCase** |

Worse, in the people update the *same payload* disagrees with itself: `changedFields` carries
camelCase (`"firstName"`, `people/[id]/route.ts:194`) while `data` carries snake_case.

**How to avoid:** `normaliseEventData(entity, obj)` in `src/lib/audit/diff.ts`, applied to **both**
`previous` and `data` before diffing, keyed off one mapping table derived from
`src/lib/api/serialize.ts:32-107`. Do **not** "fix" the routes — the comments say webhook consumers
depend on the current shapes.

**Warning signs:** an audit entry for a REST-updated person listing more changed fields than the
request body had keys; `full_name` appearing as a changed field (it is computed, not stored).

---

### Pitfall 2 — Three write paths emit nothing, so a pure subscriber cannot see them (HIGH)

**What goes wrong:** AUDIT-01 says "Every CRM write". Three paths write CRM rows and emit no event:

| Path | file:line | What it writes | Volume on this dataset |
|------|-----------|----------------|------------------------|
| `saveFieldValues` | `src/lib/custom-fields.ts:238` | `custom_fields` + `updatedAt` on any of the four tables | **The record detail page's custom-field editor.** 169 definitions live; this is the dominant edit surface for this data. |
| CSV importer | `src/app/import/actions.ts:71` | Bulk `db.insert(table).values(batch)`, 100 rows/batch | Whole-dataset scale |
| Pipedrive importer | `src/lib/import/pipedrive-api-import-actions.ts:92`, `:1006` | Same, plus a direct `activities` insert | 25,206 deals / 46,055 orgs / 38,345 people / 79,023 activities were loaded this way |

Verified by exhaustive grep of every `.update(deals|people|organizations|activities|table)` and
`.insert(...)` in non-test source. The only other non-emitting writes are
`src/lib/formula-recalc.ts:734` (correctly excluded by design) and
`src/app/api/internal/email/process/route.ts:77` (a `reminderSentAt` bookkeeping stamp, correctly
excluded).

**Why it matters beyond AUDIT-01:** ROADMAP **SC-3** reads "*Changes made via API key **and via the
Pipedrive importer** are distinguishable by actor kind*". With no event, there is no audit row, so
the `import` actor kind can never appear. SC-3 is **unachievable as written** without a decision.

**How to avoid:** decide before planning (Open Questions 1 and 2). Adding `crmBus.emit` to the
importers is the *wrong* fix: it would also fire `workflow-trigger.ts`, which subscribes to all 13
events (`workflow-trigger.ts:5-10,17-23`), turning a 25,206-deal import into 25,206 trigger matches
and potentially that many workflow runs.

**Warning signs:** a verification step that says "edit a custom field on a deal and see it in the
history" — it will fail, and it is the most natural thing a verifier would try.

---

### Pitfall 3 — The subscriber can be silently dead in Docker

**What goes wrong:** every audit row is lost in production while all tests pass.

**Why it happens:** Next.js standalone tracing omits `instrumentation.js`, so `register()` never runs
and **all** processors and subscribers are dead. This has already happened in this repo — see
STATE.md 2026-08-08: "*Next.js standalone build omitting instrumentation.js so register() never ran
in Docker (all four processors dead in production)*". The fix is a post-build copy at
`Dockerfile:22-28`, which must keep working.

**How to avoid:** the phase gate must include a **browser** verification in Docker at
`http://localhost:3001` that an edit produces a visible audit entry — not only a passing unit test.
Phase 35 made this mandatory for the same reason.

**Warning signs:** `docker compose logs app` shows no `[audit-prune]` startup line.

---

### Pitfall 4 — Without a `created_at` index the daily prune is 22× slower and scans the whole table

**Measured** on a 1,000,000-row probe in steady state (1% of rows past the 90-day window — which is
what a *daily* tick actually faces, not the one-off first prune):

| Strategy | Index present | Plan | Time for 5,000 rows |
|----------|---------------|------|---------------------|
| `ctid IN (SELECT ctid … LIMIT 5000)` | `(created_at)` | Bitmap Index Scan → Tid Scan | **17.8 ms** ✅ |
| `ctid IN (SELECT ctid … LIMIT 5000)` | none | Seq Scan, `Rows Removed by Filter: 1000000` | 395.7 ms |
| `id IN (SELECT id … ORDER BY created_at LIMIT 5000)` | `(created_at)` | **Hash Semi Join + full Seq Scan** | 311.5 ms |

The `id IN` form is the one a careful engineer reaches for first, and it is the second-worst option
*even with* the index, because the planner hashes the 5,000-row subselect and then sequentially scans
all 1,005,000 rows to probe it.

**How to avoid:** declare `index('audit_log_created_at_idx').on(table.createdAt)` in the schema file
and use the `ctid` form. Both are non-obvious; write them into the plan as decisions with these
numbers attached.

---

### Pitfall 5 — The audit source will swamp the timeline it was added to

**Measured** on the real deal with the most activities (`768ca731-…`, 117 activities, 0 notes, 0 stage
changes) against a probe audit table averaging 40 audit rows per deal:

> Of the top 21 merged entries: **15 audit, 6 activity, 0 note.**

The audit source `appliesTo` all four entity types and, in normal use, produces far more rows than
notes and stage changes combined. Page one of every record timeline becomes a change log, and the
header badge count (`countTimeline`, `assemble.ts:176-195`) silently changes meaning from "things
people did to this record" to "every field write ever".

The query cost itself is negligible — 4-branch `Merge Append` at **0.516 ms** warm vs **0.456 ms** for
today's 3 branches, +7 shared buffers. The badge's audit `count(*)` is an **Index Only Scan at
0.088 ms**. This is a product problem, not a performance one.

**How to avoid:** the UI-SPEC / planning stage should decide whether audit entries are collapsed,
filtered, or rendered more compactly than notes. Do not let it be discovered after the feed ships.

---

### Pitfall 6 — "A two-edit extension" understates it by about eight assertions

Adding `auditSource` to `TIMELINE_SOURCES` is two edits to *production* code and breaks **eight**
existing assertions in `src/lib/timeline/assemble.test.ts`, because they hard-code branch counts:

| Line | Assertion | Becomes |
|------|-----------|---------|
| 223-230 | "builds three branches for a deal", `union all` count `2` | four branches, count `3` |
| 232-242 | "builds a single notes branch with **no UNION ALL** for organization, person and activity", `union all` count `0` | **Falsified in kind, not degree.** The audit source applies to all four types, so non-deal timelines become a two-branch union for the first time. |
| 254 | `occurred_at_key` count `4` | `5` (deal) / `3` (non-deal) |
| 273 | `to_char(` count `3` | `4` |
| 275 | `deleted_at is null` count `2` | unchanged (audit rows are immutable, no soft-delete predicate — see `sources.ts:307-308`) |
| 283 | `order by` count `4` | `5`; non-deal `2` → `3` |
| 285 | `limit` count `4` | `5`; non-deal `2` → `3` |
| 291-294 | `p === 21` length `4` / `2` | `5` / `3` |

Plus, beyond the "two edits": a new `AuditTimelineEntry` interface in `types.ts`, a new
`audit-entry.tsx` renderer, a branch in the `never`-gated dispatcher
(`timeline-entry.tsx:57-62` — **it will fail `tsc` the moment `'audit'` joins the union, by design**),
and new i18n keys in all three files under `src/messages/` gated by `locale-parity.test.ts` (which
asserts whole-file key-set parity across 544 leaves, plus an explicit `REQUIRED_NOTE_KEYS` list).

**This is not an argument against the design — it is the correct sequencing information.** Plan the
test-file edit as a task, not as collateral.

---

### Pitfall 7 — A JS `Date` bound into a raw `sql` fragment throws, and truncates before it does

The audit branch must reuse `instantKey` and `bindInstant` from `sources.ts:83-111` verbatim. The
`::text::timestamp` double cast is load-bearing: a bare `::timestamp` lets postgres.js resolve the
parameter to OID 1114 and re-serialize it through a `Date`, silently truncating microseconds and
permanently dropping every entry inside that millisecond from every subsequent page. Phase 35
measured this against the live database (`sources.ts:96-102`). On an audit surface, omitting history
is the worst available failure.

---

### Pitfall 8 — Timeline reads are open to every authenticated user

`loadMoreTimeline` (`src/app/notes/actions.ts:238-242`) requires only a session, with no per-record
ownership check, and `RecordTimeline` (`record-timeline.tsx:43`) the same. The CONTEXT locks
admin-only for the **REST** surface but says nothing about the timeline. Adding field-level
before/after values there makes every authenticated user able to read the full change history of any
record they can reach a detail page for — including former values of fields that have since been
corrected. See § Security Domain and Open Question 4.

---

### Pitfall 9 — The `app_settings` read is on the hot path of a background loop, not of a request

`readRetentionDays()` must fail closed and must not throw out of the tick. `import-session-cleanup.ts`
wraps its whole body in try/catch (`:16,44-46`) and `execution-processor.ts` does the same per tick
(`:37,49-51`) — and critically, **always reschedules** (`:54`). A pruner that stops rescheduling after
one bad read is a silently disabled retention policy, which is the AUDIT-04 failure mode.

---

### Pitfall 10 — Two databases, two wrong URLs (backlog 999.20, will bite this phase)

`npm run db:migrate` cannot reach the DB from the host: `.env` points at `postgres:5432` (unresolvable
from the host) and `.env.local` at `localhost:5432` — the **wrong port**, since Postgres publishes on
**5433**. Every migration in this phase must either run inside the container or with an inline
`DATABASE_URL` override. The container entrypoint runs `npx drizzle-kit migrate` on start
(`docker-entrypoint.sh:5`), so `docker compose up -d --build` applies 0014 automatically.

---

## Code Examples

### The `previous` enrichment — what actually has to change in a mutation

```typescript
// Source: src/lib/mutations/deals.ts:257-259 (the pre-read, ALREADY THERE)
const deal = await db.query.deals.findFirst({
  where: and(eq(deals.id, id), isNull(deals.deletedAt)),
})
// ^ No `columns:` projection ⇒ the FULL row: every native column AND customFields.
//   This is `previous`, for free, at every update and delete site in the repo.

// Source: src/lib/mutations/deals.ts:406-412 (the emit) — the ONLY change needed
crmBus.emit("deal.updated", buildEventPayload(
  id, "updated", eventData, userId,
  changedFields.length > 0 ? changedFields : null,
+ deal as unknown as Record<string, unknown>,   // ← `previous`
))
```

`buildEventPayload` is a local helper in each of the four mutation modules
(`deals.ts:51-67`, and the equivalents in `people.ts`, `organizations.ts`, `activities.ts`), so the
signature change is four small local edits plus a `previous?:` field on `CrmEventPayload`
(`src/lib/events/types.ts:4-12`). **Making it optional is what keeps creates honest** — a create has
no previous state, and `previous: {}` would be a lie. This resolves the CONTEXT's discretion item in
favour of the shared type: a narrower update-only payload type would need parallel changes in
`DealStageChangedPayload` and the 13-entry `CrmEventMap`.

### The delete case — `data` is `{ id }`, so `previous` is the *only* source of a tombstone

```typescript
// Source: src/lib/mutations/deals.ts:464-469 — identical shape at organizations.ts:318,
// people.ts:357, activities.ts:330, v1/deals/[id]:402, v1/people/[id]:300, v1/activities/[id]:273
crmBus.emit("deal.deleted", buildEventPayload(id, "deleted", { id }, userId))
//                                                            ^^^^^^
// The delete payload carries NO row state at all. Without `previous`, a delete
// audit row can record only "it was deleted" — which is what Phase 37's TRASH-01
// ("shows who deleted a record") depends on the audit log to supply.
```

### The formula-recalc write that must stay invisible

```typescript
// Source: src/lib/formula-recalc.ts:730-741 — READ THE COMMENT, IT NAMES THIS PHASE
const merged: Record<string, unknown> = { ...existing, ...computed }
const table = entityTables[entityType]
await db.update(table).set({ customFields: merged }).where(eq(table.id, entityId))
// NOTE: `updatedAt` is deliberately NOT set. The entity's own write already bumped it, and a
// second bump would make a derived-value refresh indistinguishable from a user edit in
// Phase 36's audit log.
//
// AND: no crmBus.emit anywhere in this module. The entire depth-1 cascade over up to
// 124 child rows (CASCADE_CHILD_RELATIONS, :225-262) is invisible to a bus subscriber
// by construction. Formula noise is a much smaller problem than the CONTEXT assumed.
```

### The proven ALS behaviour (executed, not reasoned)

```
$ docker compose exec -T app node /tmp/als-probe.mjs         # Node v20.20.2

  awaited        syncStore {kind:'user',        userId:'u1'}      asyncStore {kind:'user', userId:'u1'}
  nested         syncStore {kind:'workflow_run', runId:'r1-nested'} asyncStore {same}
  no-context     syncStore undefined                              asyncStore undefined     ← ⇒ 'system'
  exited         syncStore {kind:'import',      sessionId:'s1'}   asyncStore {same}
  concurrent-A   syncStore {kind:'user',        userId:'A'}       asyncStore {same}
  concurrent-B   syncStore {kind:'api_key',     keyId:'B'}        asyncStore {same}
```

The probe reproduced the exact production shape: `als.run(...)` around an async function that
`await`s three times (`setTimeout`, `setImmediate`, `Promise.resolve`) before a **synchronous**
`EventEmitter.emit`, whose **non-async** handler creates a fire-and-forget promise with a `.catch`.
Both the synchronous read at handler entry and the read inside the `.then()` continuation returned
the correct store, nesting resolved to the innermost context, absence returned `undefined`, and two
concurrent contexts did not cross-contaminate.

### Measured plans

```
### Read pattern 1 — per-record audit branch, 1,000,000 rows, index (entity_type, entity_id, created_at DESC)
 Limit (actual time=35.884..35.887 rows=21)            ← 26 buffers, COLD
   -> Incremental Sort  (Presorted Key: a.created_at)
        -> Index Scan using audit_probe_record_idx  (rows=22)

### Merged 4-branch timeline vs today's 3, WARM, on a real deal (117 activities)
 3 branches (today)   Merge Append   0.456 ms   101 shared buffers
 4 branches (+audit)  Merge Append   0.516 ms   108 shared buffers      ← +0.06 ms, +7 buffers
 top-21 composition:  audit 15, activity 6, note 0                       ← § Pitfall 5

### Read pattern 2 — workflow run → records, partial index WHERE workflow_run_id IS NOT NULL
 GroupAggregate (actual time=0.308..0.320 rows=28)
   -> Bitmap Heap Scan   Recheck Cond: (workflow_run_id = 'run-1234')
        -> Bitmap Index Scan on audit_probe_run_idx   (rows=28, 2 buffers)
 Execution Time: 0.408 ms

### Header badge count for the audit source
 Index Only Scan using audit_probe_record_idx   Heap Fetches: 40
 Execution Time: 0.088 ms
```

### Measured storage at 1,000,000 rows

| Component | Size | Per row |
|-----------|------|---------|
| Heap (incl. TOAST) | 267 MB | 267 B |
| `audit_log_pkey` (text UUID PK) | 73 MB | 73 B |
| `(entity_type, entity_id, created_at DESC)` | 74 MB | 74 B |
| `(created_at)` | 21 MB | 21 B |
| `(workflow_run_id) WHERE NOT NULL` (14% of rows) | 1,096 kB | ~1 B |
| **Total** | **437 MB** | **~437 B** |

`avg(pg_column_size(changes))` = **126 B** for a two-field `{from,to}` map. A create recording a
whole deal's initial state will be larger: measured `custom_fields` on the live `deals` table averages
**604 characters** of JSON text with a max of **5,059**. Plan the retention default against
~437 bytes/row plus create-row overhead.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact here |
|--------------|------------------|--------------|-------------|
| Inline `triggerWebhook` calls at each mutation | One `crmBus` with 13 typed events and N subscribers | Phase 24 | Is why AUDIT-02 is even expressible |
| Threading a context parameter through every signature | `AsyncLocalStorage` | Phase 26 (`recursion.ts`) | The actor context is a direct copy of a working precedent |
| Hand-written index SQL in migrations | Schema-declared, `generate`-emitted | Phase 33 D-06 | Verified again here: `drizzle/0013:27-28` shows partial + `DESC NULLS LAST` emitted intact |
| `LIMIT/OFFSET` deep paging | Keyset on `(occurred_at, id)` | Phase 35 | Reused verbatim for the audit branch |
| A per-entity history table (`deal_stage_history`) | A pluggable timeline source array | Phase 35 | `sources.ts:371-375` names Phase 36 explicitly |
| Formula values stored bare | `{ formula: true, value, error }` wrapper | Phase 34 | Makes formula exclusion a value test, not a definitions query |

**Deprecated / do not use in this phase:**
- `npm run db:push` (`drizzle-kit push`) — present in `package.json`, never used in this repo.
- `setInterval` for background loops — all four existing processors chain `setTimeout` to prevent
  tick overlap (`execution-processor.ts:27`).
- Numbered-page pagination (`runs-table.tsx`) — the timeline is keyset "Load more"; do not copy.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker Compose stack | All dev + verification | ✓ | app / postgres / mailhog all `Up` | — |
| PostgreSQL | Schema, indexes, prune, timeline | ✓ | **16.13** | — |
| `gen_random_uuid()` | Probe data (not production — ids come from `crypto.randomUUID()`) | ✓ | built-in on PG 13+ | — |
| Partial index support | `workflow_run_id` index | ✓ | proven in `drizzle/0013:28` and re-measured here (1,096 kB) | full index (+~14 MB/M rows) |
| `make_interval(days => …)` | Retention cutoff without string interpolation | ✓ | executed | `now() - ($1 \|\| ' days')::interval` (worse — string concat) |
| `ctid` pseudo-column | Batched delete | ✓ | measured | none needed |
| `drizzle-kit generate` | DDL emission (D-06) | ✓ | 0.31.9 | — |
| `drizzle-kit migrate` | Applied at container start | ✓ | last applied **0013**; this phase emits **0014** | — |
| `node:async_hooks` | Actor context | ✓ | Node **20.20.2** in the container — probe executed | none |
| vitest (2 projects) | `npm test` | ✓ | 4.0.18 | — |
| `npm run typecheck` / `npm run lint` | CI gates | ✓ | tsc 5.x / eslint | — |
| GitHub Actions CI | Required check on master | ✓ | typecheck → lint → test | — |
| **Live-DB integration harness** | Migration, index and prune verification | **✗** | — | **Checked-in SQL script + recorded psql evidence** (the Phase 33 / 35 pattern) |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:**
- No live-database test harness. `npm test` mocks `@/db` in every mutation test, so the migration,
  the real query plans and the prune behaviour **cannot** be covered by vitest. They are verified by
  `scripts/audit-log-checks.sql` plus pasted psql output, exactly as Phases 33 and 35 did.
- Backlog **999.20**: `npm run db:migrate` cannot reach the DB from the host (see Pitfall 10).

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`, and `workflow.tdd_mode` is `true`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest **4.0.18**, two projects |
| Config (base) | `vitest.config.ts` — `environment: 'node'`, includes `src/**/*.{test,spec}.*`, excludes `*.rsc.test.*` |
| Config (rsc) | `vitest.rsc.config.ts` — `ssr.resolve.conditions: ['react-server']`, includes only `src/**/*.rsc.test.*` |
| Quick run | `npx vitest run <path>` |
| Full suite | `npm test` (= `vitest run && vitest run --config vitest.rsc.config.ts`) |
| Type gate | `npm run typecheck` |
| Lint gate | `npm run lint` |
| CI | `.github/workflows/ci.yml` — required check on master |

**Constraint 1 — the suite mocks `@/db` entirely.** There is no live-DB harness. Every module this
phase adds that touches the database (`subscribers/audit.ts`, `prune.ts`, `settings.ts`,
`sources.ts`'s `hydrate`) is testable only against a mocked driver. **This is why
`src/lib/audit/diff.ts` must be pure and must hold all the logic** — it is the only part that can be
tested properly.

**Constraint 2 — `assemble.test.ts` will go red the moment the source array grows.** Eight
assertions hard-code branch counts (§ Pitfall 6). Updating them is a task, not collateral.

**Constraint 3 — `timeline-entry.tsx` will fail `tsc` the moment `'audit'` joins
`TimelineEntryKind`.** That is the Phase 35 `never` gate working as designed. Do not defeat it.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIT-01 | `buildChanges` diffs native columns and yields `{from,to}` per changed key | unit (pure) | `npx vitest run src/lib/audit/diff.test.ts` | ❌ Wave 0 |
| AUDIT-01 | A formula-wrapped value on **either** side is excluded from `changes` | unit (pure) | `npx vitest run src/lib/audit/diff.test.ts -t "formula"` | ❌ Wave 0 |
| AUDIT-01 | A `multi_select` array value is **not** mistaken for a formula wrapper (the `!Array.isArray` guard) | unit (pure) | `npx vitest run src/lib/audit/diff.test.ts -t "multi_select"` | ❌ Wave 0 |
| AUDIT-01 | `normaliseEventData` maps `serializePerson`/`serializeDeal`/`serializeActivity` keys back to column names; a snake_case `data` vs camelCase `previous` yields a **one-key** diff | unit (pure) | `npx vitest run src/lib/audit/diff.test.ts -t "normalise"` | ❌ Wave 0 |
| AUDIT-01 | A create records initial state; a delete records a tombstone built from `previous` (because `data` is `{id}`) | unit (pure) | `npx vitest run src/lib/audit/diff.test.ts -t "create\|delete"` | ❌ Wave 0 |
| AUDIT-01 | An update whose diff is empty writes **no** row | unit | `npx vitest run src/lib/events/subscribers/audit.test.ts -t "no-op"` | ❌ Wave 0 |
| AUDIT-02 | Subscriber registers once; double `register()` is a no-op; `_resetForTesting` clears | unit | `npx vitest run src/lib/events/subscribers/audit.test.ts` | ❌ Wave 0 (mirror `stage-history.test.ts`) |
| AUDIT-02 | Handler is **not** async and the insert carries a `.catch` (a rejected insert does not become an unhandled rejection) | unit | `npx vitest run src/lib/events/subscribers/audit.test.ts -t "fire-and-forget"` | ❌ Wave 0 |
| AUDIT-02 | Subscribing to `deal.stage_changed` would double-write — assert the subscriber does **not** listen to it | unit | `npx vitest run src/lib/events/subscribers/audit.test.ts -t "stage_changed"` | ❌ Wave 0 |
| AUDIT-02 | Actor kind resolves from ALS across awaits; absent context ⇒ `system`, **never** `payload.userId` | unit | `npx vitest run src/lib/audit/actor-context.test.ts` | ❌ Wave 0 (mirror `recursion.test.ts:130`) |
| AUDIT-02 | Two concurrent `runWithActor` scopes do not cross-contaminate | unit | `npx vitest run src/lib/audit/actor-context.test.ts -t "concurrent"` | ❌ Wave 0 |
| AUDIT-02 | `withApiAuth` establishes the `api_key` actor around the handler | unit | `npx vitest run src/lib/api/auth.test.ts` | ❌ Wave 0 (no such file today) |
| AUDIT-02 | `executeRun` establishes the `workflow_run` actor with the run id | unit | `npx vitest run src/lib/execution/engine.test.ts -t "actor"` | ✅ file exists — add cases |
| AUDIT-02 | **SC-5 gate:** no `src/lib/mutations/*.ts` file imports anything from `src/lib/audit/` or `@/db/schema/audit-log` | unit (source grep, à la Phase 44's repo-wide gate) | `npx vitest run src/lib/audit/no-mutation-coupling.test.ts` | ❌ Wave 0 |
| AUDIT-03 | Assembler emits **4** branches for a deal and **2** for the other three types | unit (SQL string) | `npx vitest run src/lib/timeline/assemble.test.ts` | ✅ exists — **8 assertions must be updated** |
| AUDIT-03 | The audit branch carries the keyset predicate and **no** `deleted_at` filter | unit | `npx vitest run src/lib/timeline/assemble.test.ts -t "audit"` | ✅ exists — add case |
| AUDIT-03 | `TimelineEntryRow` renders an audit entry; the `never` branch still compiles | typecheck | `npm run typecheck` | ✅ gate exists |
| AUDIT-03 | Run detail page lists distinct records mutated by a run | unit | `npx vitest run src/lib/audit/linked-records.test.ts` | ❌ Wave 0 |
| AUDIT-03 | Merged timeline plan is `Merge Append` over 4 index scans, <1 ms warm | **manual (psql)** | `docker compose exec -T postgres psql -U pipelite -d pipelite -c "EXPLAIN (ANALYZE, BUFFERS) …"` | manual — `@/db` is mocked |
| AUDIT-03 | Edit a deal in the browser → the entry appears with field, before/after and the user's name | **manual (browser, MANDATORY)** | Docker at `http://localhost:3001` — see Pitfall 3 | manual |
| AUDIT-04 | Retention read: unset ⇒ `null`; non-numeric ⇒ `null`; ≤0 ⇒ `null`; a valid integer ⇒ that integer | unit | `npx vitest run src/lib/audit/settings.test.ts` | ❌ Wave 0 |
| AUDIT-04 | Pruner deletes nothing when retention is `null` (fails closed) | unit | `npx vitest run src/lib/audit/prune.test.ts -t "fails closed"` | ❌ Wave 0 |
| AUDIT-04 | Pruner caps at `MAX_BATCHES_PER_TICK`, logs the count, and **always reschedules** even after a throw | unit (fake timers) | `npx vitest run src/lib/audit/prune.test.ts` | ❌ Wave 0 |
| AUDIT-04 | Delete uses the `ctid IN (… LIMIT n)` form, not `id IN` | unit (SQL string) | `npx vitest run src/lib/audit/prune.test.ts -t "ctid"` | ❌ Wave 0 |
| AUDIT-04 | Batch delete at 1M rows uses `Bitmap Index Scan on audit_log_created_at_idx`, ~18 ms | **manual (psql)** | `scripts/audit-log-checks.sql` part 3 | ❌ Wave 0 (the script) |
| AUDIT-04 | All four indexes present in `pg_indexes` after migrate | **manual (psql)** | `scripts/audit-log-checks.sql` part 1 | ❌ Wave 0 |
| cross | All new `audit.*` keys exist in all three locale files | unit | `npx vitest run src/messages/locale-parity.test.ts` | ✅ exists — extend the required-keys list |
| cross | No React element crosses the RSC boundary into a Radix `asChild` slot (new admin + run-detail UI) | unit (existing repo-wide gate) | `npx vitest run "src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx"` | ✅ exists — must stay green |

### Sampling Rate

- **Per task commit:** `npx vitest run <the touched test file>` + `npm run typecheck`
- **Per wave merge:** `npm test` (both projects) + `npm run lint`
- **After the migration task specifically:** run `scripts/audit-log-checks.sql` in the container and
  paste the index list and the two `EXPLAIN` plans into the plan file — vitest cannot cover it
- **Phase gate, all mandatory, in Docker at `http://localhost:3001` before `/gsd:verify-work`:**
  (a) edit a deal in the browser → the audit entry renders with field, before/after and the user's
  name; (b) run a workflow with a CRM action → the record's entry attributes it to the run **and**
  the run detail page lists the record; (c) `PUT /api/v1/people/:id` with a real API key → the entry
  shows actor kind `api_key` and a **one-field** change map (this is the Pitfall 1 regression test);
  (d) set retention to 1 day in `/admin`, confirm the count/oldest display, and observe the
  `[audit-prune]` log line

### Wave 0 Gaps

- [ ] `src/lib/audit/diff.test.ts` — the pure diff, formula exclusion, key normalisation (AUDIT-01)
- [ ] `src/lib/audit/actor-context.test.ts` — ALS across awaits, concurrency, absence (AUDIT-02)
- [ ] `src/lib/events/subscribers/audit.test.ts` — mirror `stage-history.test.ts` (AUDIT-02)
- [ ] `src/lib/audit/no-mutation-coupling.test.ts` — the SC-5 source gate
- [ ] `src/lib/audit/settings.test.ts` — retention parse, fail-closed (AUDIT-04)
- [ ] `src/lib/audit/prune.test.ts` — batching, cap, reschedule-on-throw, `ctid` form (AUDIT-04)
- [ ] `src/lib/audit/linked-records.test.ts` — run → records (AUDIT-03)
- [ ] `src/lib/api/auth.test.ts` — **no test file exists for `withApiAuth` today**, and this phase
      edits it. Add one before editing.
- [ ] `scripts/audit-log-checks.sql` — checked-in, re-runnable psql evidence (AUDIT-04, indexes)
- [ ] `src/lib/timeline/assemble.test.ts` — **update 8 existing assertions** (not a new file)
- [ ] `src/messages/locale-parity.test.ts` — extend the required-keys list with the `audit.*` keys
- [ ] Framework install: **none needed**

---

## Security Domain

`security_enforcement` is absent from `.planning/config.json`, so it is treated as **enabled**.

An audit log is simultaneously a **security control** and a **disclosure surface**, and the actor
attribution is the highest-value spoofing target in the phase.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (reused) | Two existing surfaces, unchanged: Auth.js JWT via `auth()` for the UI; `withApiAuth` (API key + rate limit) for `/api/v1`. **Do not invent a third.** The actor context is derived from these, never from a request field. |
| V3 Session Management | no | No new session state. The ALS store is per-async-context and dies with the request — verified not to leak across concurrent contexts. |
| V4 Access Control | **yes — the core control** | REST audit GET is **admin-only**, via `resolveActorRole` (`ApiAuthContext` has no role, `auth.ts:6-9`). Admin retention UI inherits `src/app/admin/layout.tsx:16-18`'s `role !== "admin"` redirect. **The timeline read has no per-record check today** — see Open Question 4. |
| V5 Input Validation | yes | zod on the retention value read from `app_settings` (integer, >0, sane upper bound); zod on `entity_type` before it reaches a SQL predicate (`assemble.ts:33-41` precedent); `parsePagination` clamps the REST GET. |
| V6 Cryptography | no | No crypto beyond `crypto.randomUUID()` for row ids (the repo-wide `$defaultFn` pattern). |
| V7 Error Handling | yes | The subscriber's `.catch` logs server-side and never surfaces. The REST GET returns `Problems.*` shapes; never a raw Postgres error. |
| V8 Data Protection | **yes — new** | The `changes` blob stores *former* values verbatim, including values a user later corrected or redacted. This is a new class of data-at-rest in this application. The retention window is the only expiry mechanism, which is why the pruner failing closed is a privacy trade-off as well as a safety one. |
| V9 Logging | **yes — this phase IS the control** | Append-only, never `UPDATE`d, never soft-deleted. No `deletedAt` column (matching `deal_stage_history`). The only permitted deletion is the retention pruner. |
| V13 API | yes | The new GET wraps `withApiAuth`, inheriting rate limiting. A route that forgets the wrapper is unauthenticated **and** unrated. Grep-verifiable. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **Actor-kind spoofing** — a caller supplies `actor_kind: 'system'` or a forged `workflow_run_id` to launder a change | **Spoofing / Repudiation** | The actor is **only** derivable from ALS, established at the four boundaries after auth succeeds. `runWithActor` is never called with request-controlled data. No route or action accepts an actor field. Gate this with a source-grep test. |
| **Attribution laundering by absence** — code path with no ALS scope logs a change with the victim's `userId` | Repudiation | `actor?.kind ?? "system"` and `actor?.userId ?? null`. **Never** `payload.userId`. CONTEXT-locked; enforce with a grep gate on the subscriber file. |
| **Audit-write suppression** — an attacker causes the insert to fail so the change is unlogged | Repudiation | The `.catch` logs to stderr. Accepted limitation: fire-and-forget means a DB failure loses the row. Documenting this explicitly is the control; the alternative (awaiting the insert inside the mutation) violates AUDIT-02 and would make audit failures block user writes. |
| **Information disclosure via the timeline** — any authenticated user reads any record's full change history | **Information Disclosure** | Currently unmitigated (`notes/actions.ts:238-242` checks only for a session). Open Question 4 — must be an explicit decision, not an accident. |
| **Information disclosure via the REST GET** — any API key reads the whole audit log | Information Disclosure | Admin-only via `resolveActorRole`, fail-closed on an unresolvable actor (the Phase 35 T-35-25 pattern). CONTEXT-locked. |
| **Secret leakage into `changes`** — a field holding a token or credential has its value copied into the log twice (from and to) | Information Disclosure | No CRM field is a designated secret today (verified: `serializeWorkflow` redacts webhook secrets, but workflows are out of scope). Note the risk and re-check if Phase 40+ adds one. |
| **SQL injection via the audit branch** | Tampering | Reuse `sources.ts`'s discipline verbatim: identifiers literal, **every** value a `${}` bind, `entityType` zod-validated against the four literals before composition (`assemble.ts:33-41`). |
| **Retention as a destruction primitive** — an admin sets retention to 0/1 to erase evidence | Tampering | Out of scope to prevent (admin is trusted), but: reject `≤ 0` at validation, and the retention change itself should be logged. Flag for Phase 42. |
| **Unbounded `changes` blob DoS** — a 5,059-character `custom_fields` blob × 2 sides per row | Denial of Service | The formula gate already drops the largest derived keys. Measured worst realistic case is ~10 kB/row; the retention window bounds the aggregate. Consider a per-row cap. |
| **Pruner starvation** — the daily tick can never catch up with the write rate | DoS (self-inflicted) | `MAX_BATCHES_PER_TICK = 20` ⇒ 100k rows/day. If steady-state writes exceed that, the table grows forever *and the log says so*. Log rows-deleted every tick precisely so this is visible. |
| **Rate-limit bypass by omitting `withApiAuth`** | Elevation of Privilege | Every `/api/v1` handler wraps in `withApiAuth`. Now doubly important: it is also the actor boundary, so a route that skips it produces `system`-attributed audit rows. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The audit subscriber listens to the 12 create/update/delete events and **not** `deal.stage_changed` | Pattern 1 | MEDIUM. Getting it wrong doubles every stage-drag audit row. The facts (both are emitted at all four sites) are verified; the *choice* is mine. |
| A2 | `previous` goes on the shared `CrmEventPayload` as optional, not on a narrower update-only type | Code Examples | LOW. CONTEXT explicitly delegates this. Optional keeps creates honest and avoids parallel changes to `DealStageChangedPayload` and the 13-entry `CrmEventMap`. |
| A3 | `updatedAt`, `position` and `id` are excluded from the `changes` map | Pattern 3 | LOW-MEDIUM. `updatedAt` changes on literally every write and would appear in every entry; `position` changes on every kanban reorder. But nothing locks this and a reviewer could reasonably want `position`. |
| A4 | The audit source `appliesTo` all four entity types | Pattern 4 | MEDIUM. It is what AUDIT-01 implies, but it is also what turns the non-deal timeline into a union for the first time and falsifies `assemble.test.ts:232`. Confirm during planning. |
| A5 | No backfill: the table starts empty on 188,629 existing records | Anti-Patterns | LOW as a fact (there is no before-state to reconstruct), MEDIUM as an expectation — a verifier opening an old record will see an empty change history and may read it as a bug. State it in the plan. |
| A6 | 5,000-row batches, 20 batches/tick, 24 h interval | Pattern 5 | LOW. Batch size is measured; the cap and interval are judgement. All three are CONTEXT-delegated discretion. |
| A7 | The retention key is `audit.retention_days` with an integer JSONB value | Pattern 5 | LOW. Naming is discretion; the shape matters only for Phases 40/42 reuse. |
| A8 | Audit rows have no `deleted_at` and are never updated | § Security V9 | LOW. Matches `deal_stage_history` (`deal-stage-history.ts:18-20`), which carries an explicit comment justifying the same deviation. |
| A9 | `resolveActorRole` is the right admin gate for the REST GET | § Security V4 | LOW. Verified precedent at `api/v1/notes/[noteId]/route.ts:51`. |
| A10 | A per-row size cap on `changes` is not required in this phase | § Security DoS | LOW-MEDIUM. Measured worst case is ~10 kB. If a plan adds it, pick the number from the 5,059-char `custom_fields` max, not from a guess. |

---

## Open Questions (RESOLVED)

These four had to be answered before planning; two of them decided whether ROADMAP success criteria
were achievable at all. **All four were answered by `36-CONTEXT.md` § Post-Research Addendum
(decided 2026-08-16) and are implemented in the phase plan set.** The original analysis is kept
below unedited, because the reasoning is what justifies the answers. Each question now opens with
its resolution.

| # | Question | Resolution | Implemented by |
|---|----------|-----------|----------------|
| 1 | `saveFieldValues` emit | **YES** — recommendation accepted; the webhook/workflow fan-out is an accepted, user-approved behaviour change | `36-06` Task 2; observed in `36-20` browser step 5 |
| 2 | `import` actor kind | **Option 2** — one summary audit row per import session, written by the importer. SC-3 met at session granularity; SC-5 holds for the mutation modules but not the importers | `36-12`; stated in `36-20` phase statements 1-2 |
| 3 | Run linked-records scope | **Match the page's existing session-only auth**, and say so rather than silently tightening it | `36-09` (T-36-04), `36-16` (T-36-04) |
| 4 | Timeline audit visibility | **Keep the timeline open** to any user who can already see the record — confirmed, not assumed. Density is handled by a filter toggle, OFF by default, not by an access gate | `36-17` (T-36-04), `36-19` (the toggle) |

### 1. Does `saveFieldValues` get an event, so custom-field edits are audited? — **RESOLVED: YES**

> **Resolution.** The recommendation below was accepted (36-CONTEXT § Post-Research Addendum, first
> bullet). Implemented in `36-06` Task 2, which also requires rewriting the stale "deliberately emits
> NO crmBus event" comment at `src/lib/custom-fields.ts:189-193`. The accepted side effect —
> custom-field-only saves now firing webhooks and workflow triggers for the first time — is planned
> explicitly, carries threat id T-36-16, and must have an OBSERVED outcome recorded from `36-20`
> browser step 5 rather than an assumed one.

- **What we know:** `src/lib/custom-fields.ts:238` writes `custom_fields` + `updatedAt` directly and
  emits nothing. It is what `POST /api/custom-fields/save` calls, which is what the record detail
  page's custom-fields section calls. This dataset has 169 live definitions. AUDIT-01 says "Every
  CRM write".
- **What's unclear:** whether the CONTEXT's "no mutation code changes" spirit forbids adding an
  emit here. It is not a *mutation function* — it is a helper in `src/lib/custom-fields.ts`.
- **Recommendation:** **add a `{entity}.updated` emit to `saveFieldValues`, carrying `previous`.**
  It already reads the previous blob at `:213` (`const previous = await getFieldValues(...)`), so
  `previous` costs nothing. The cost is that it also newly fires `webhook.ts` and
  `workflow-trigger.ts` for custom-field-only saves — which is arguably correct and arguably a
  behaviour change users will notice. **This is the single most consequential decision in the phase.**
  If the answer is no, AUDIT-01's "every" must be narrowed in writing.

### 2. How is the `import` actor kind ever populated? — **RESOLVED: option 2**

> **Resolution.** Option 2 (one summary audit row per import session, written by the importer) was
> accepted. Implemented in `36-12`, across all five entry points — four in
> `src/app/import/actions.ts` and one in `src/lib/import/pipedrive-api-import-actions.ts`; the
> "singular importer" in the analysis below is corrected by 36-PATTERNS. Two consequences are stated
> plainly in `36-12` and again in `36-20`'s phase statements: SC-3 is satisfied at SESSION
> granularity, not per-record; and SC-5 holds for the four CRM mutation modules but NOT for the
> importers. Option 1 was rejected on the measured cost recorded below.

- **What we know:** both importers bulk-insert with no events
  (`src/app/import/actions.ts:71`, `src/lib/import/pipedrive-api-import-actions.ts:92,1006`).
  SC-3 requires import-made changes to be distinguishable by actor kind. With no event, there is no
  audit row, so `import` never appears.
- **What's unclear:** which of three shapes is wanted.
- **Options:**
  1. **Per-record events from the importer.** Correct in principle, catastrophic in practice: it
     also drives `workflow-trigger.ts` (subscribed to all 13 events), so a 25,206-deal import
     becomes 25,206 trigger evaluations and up to that many workflow runs, plus 25,206 audit rows
     per import. **Reject.**
  2. **One summary audit row per import session** — `entity_type: 'import_session'` or a
     `changes` map of counts, `actor_kind: 'import'`. Satisfies "distinguishable by actor kind"
     without the fan-out. Requires a small write inside the importer (allowed — the importer is not
     a mutation function, and the ALS boundary is already being added there).
  3. **Narrow SC-3.** Drop the importer clause and satisfy the `import` kind only via whatever
     future import path routes through mutations. Honest, but changes a ROADMAP criterion.
- **Recommendation:** **option 2.** It is the only one that satisfies SC-3 without a fan-out that
  would make the feature dangerous.

### 3. Is the workflow-run linked-records list scoped to the run's own workflow? — **RESOLVED: no**

> **Resolution.** Recommendation accepted (36-CONTEXT § Post-Research Addendum, recommendation 3):
> match the run detail page's existing session-only auth and declare it rather than silently
> tightening it. Carried as an explicit `accept` disposition — threat T-36-04 — in both `36-09` (the
> reader) and `36-16` (the page section), each of which grep-asserts that no new ownership check was
> added.

- **What we know:** the run detail page (`workflows/[id]/runs/[runId]/page.tsx:18-21`) requires only
  a session — no ownership check — and STATE.md records "Workflows not owner-scoped; all
  authenticated users can CRUD any workflow".
- **What's unclear:** whether listing *which CRM records* a run touched is a bigger disclosure than
  the run's step inputs/outputs already are. It probably is not — `step.input`/`step.output` already
  render CRM data in `step-detail.tsx`.
- **Recommendation:** match the existing page's auth (session only), and note it. Do not silently
  tighten it here — that would be an undeclared behaviour change in a phase that is not about auth.

### 4. Should the record timeline's audit entries be visible to every authenticated user? — **RESOLVED: yes**

> **Resolution.** Recommendation accepted (36-CONTEXT § Post-Research Addendum, recommendation 4),
> and 36-UI-SPEC § Assumptions Flagged item 1 records it as CONFIRMED rather than assumed: gating
> them would change the `TimelineSource` interface, and the record itself is already visible to that
> user. Carried as `accept` (T-36-04) in `36-17`. The density problem this question gestures at was
> instead solved by a product control, not an access control — the filter toggle in `36-19`, audit
> entries OFF by default, which 36-UI-SPEC § Density adopts after retracting its earlier no-filter
> position.

- **What we know:** `loadMoreTimeline` (`notes/actions.ts:238-242`) and `RecordTimeline`
  (`record-timeline.tsx:43`) check only for a session. The CONTEXT locks admin-only for the **REST**
  surface but is silent on the timeline. Adding before/after values makes former values readable by
  anyone who can open the detail page.
- **What's unclear:** whether admin-only was intended for the data or only for the API.
- **Recommendation:** **keep the timeline open** (consistent with the CONTEXT's "not a separate
  tab" framing and with `deal_stage_history` already showing actor names to everyone), but surface
  the decision explicitly rather than letting it be inherited. If the user wants audit entries
  admin-gated in the feed, the `auditSource` needs a viewer-role parameter, which changes the
  `TimelineSource` interface — a materially larger change that must be known before planning.

---

## Project Constraints (from CLAUDE.md)

**No `./CLAUDE.md` exists in this repository** [VERIFIED: `ls CLAUDE.md` → No such file].
`.claude/` exists but contains no `skills/` directory [VERIFIED]. No `.agents/skills/` either.
No `.planning/graphs/graph.json` [VERIFIED], so no graph context was injected.

Binding constraints therefore come from the environment brief, `.planning/STATE.md` and the
Phase 33/34/35 decision log:

- **Docker only.** `docker compose up -d` from the repo root. App at `http://localhost:3001`,
  Postgres at `localhost:5433` (host) / `postgres:5432` (in-network), Mailhog at `:8025`.
  **Never** `npm run dev` / `next dev`. `docker` needs **no** sudo.
- **Never embed a password in a command.** Historical incident; see project memory.
- **Migrations:** `drizzle-kit generate` then `drizzle-kit migrate`. **Never `drizzle-kit push`.**
  Latest on disk is `0013_parched_redwing.sql`; this phase's is **0014**.
- **D-06 (Phase 33):** schema changes and indexes are declared in `src/db/schema/*.ts` and emitted by
  `generate` — **never** hand-written into migration SQL. Data migrations are the one sanctioned
  hand-edit, and this phase needs none.
- **D-03 (Phase 33):** no `CREATE INDEX CONCURRENTLY` — drizzle wraps migrations in a transaction.
- **D-01 (Phase 33):** `Bitmap Index Scan` counts as an index scan. Do not write a verification step
  demanding a literal `Index Scan` node — read patterns 2 and 3 both produce Bitmap plans.
- **CFUI-01 (Phase 44):** no React element may cross the RSC boundary into a Radix `asChild` slot.
  Enforced by a repo-wide gate; the new admin and run-detail UI must respect it.
- **Repo rule (logged):** ownership/authorization checks live in server actions and API routes;
  mutations only check entity existence.
- **Phase 35:** timestamps take no `mode` option; a JS `Date` must never be bound into a raw `sql`
  fragment — bind `${iso}::text::timestamp`.
- **Phase 35:** a doc comment that NAMES a token gated at zero occurrences is itself a gate
  violation. Reword rather than weaken the gate.
- **CI gates every merge:** `npm run typecheck`, `npm run lint`, `npm test` — all green.
- **i18n:** every user-facing string via next-intl, in all three files under **`src/messages/`**,
  and `locale-parity.test.ts` enforces whole-file key-set parity across 544 leaves.
- **LIVE DATA.** Probe only inside rolled-back transactions. Verified after this session:
  `deals` 25,206 and `notes` 75,235 unchanged, zero `audit_probe%` tables remain, `git status` clean.

---

## Sources

### Primary (HIGH confidence — measured or read line by line in this session)

- **Live PostgreSQL 16.13** via `docker compose exec -T postgres psql`. Four probe scripts, each
  wrapped `BEGIN … ROLLBACK`: table sizing at 1,000,000 rows, index sizing, three read-pattern
  `EXPLAIN (ANALYZE, BUFFERS)` plans, three prune strategies compared in both first-prune and
  steady-state distributions, a 4-branch merged-timeline comparison against real `notes` /
  `activities` / `deal_stage_history` data, and live row counts and `custom_fields` size
  distributions. Database verified unchanged afterwards.
- **Executed Node probe** inside the app container (Node v20.20.2) reproducing the exact
  ALS → async mutation → synchronous `EventEmitter.emit` → non-async handler → fire-and-forget
  insert shape, across five boundary scenarios plus concurrency.
- **Repo source read directly:** `src/lib/events/{bus,types}.ts`;
  `src/lib/events/subscribers/{stage-history,workflow-trigger}.ts`;
  all four `src/lib/mutations/*.ts`; `src/lib/formula-recalc.ts`; `src/lib/formula-helpers.ts`;
  `src/lib/custom-fields.ts`; `src/lib/execution/{recursion,engine,execution-processor}.ts`;
  `src/lib/execution/actions/crm.ts`; `src/lib/triggers/create-run.ts`;
  `src/lib/api/{auth,pagination,serialize}.ts`; `src/lib/notes/authorize.ts`;
  `src/lib/timeline/{types,sources,assemble,assemble.test}.ts`;
  `src/components/timeline/{timeline-entry,timeline-list,record-timeline}.tsx`;
  `src/db/schema/{notes,deal-stage-history,custom-fields,index}.ts`;
  every `src/app/api/v1/**` emit site; `src/app/notes/actions.ts`;
  `src/app/admin/{layout,page}.tsx`; `src/app/workflows/[id]/runs/[runId]/page.tsx`;
  `src/app/import/actions.ts`; `src/lib/import/{pipedrive-api-import-actions,import-session-cleanup}.ts`;
  `src/app/api/internal/email/process/route.ts`; `src/messages/locale-parity.test.ts`;
  `instrumentation.ts`; `Dockerfile`; `docker-entrypoint.sh`; `package.json`;
  `drizzle/0013_parched_redwing.sql`.
- **Exhaustive write-path grep** over every `.insert(...)` / `.update(...)` targeting the four CRM
  tables in non-test source — this is what surfaced the three non-emitting paths.
- **Installed versions** read from `node_modules/<pkg>/package.json`, not from the manifest.
- `.planning/{STATE,REQUIREMENTS,ROADMAP,config.json}` and `36-CONTEXT.md`;
  `.planning/phases/35-notes-record-timeline/35-RESEARCH.md` (§ Validation Architecture and
  § Security Domain used as the template for this document's equivalents).

### Secondary (MEDIUM confidence)

- None. Every claim above was either read from repo source, measured against the live database, or
  produced by an executed probe.

### Tertiary (LOW confidence)

- None. **No WebSearch, no Context7, no external documentation was consulted, and none was needed** —
  this phase introduces no new library and every open question was answerable from the repo or the
  database, which produced better answers than a search would have.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Zero new packages; every version read from `node_modules`, not the manifest |
| The `previous` problem | HIGH | Every pre-read located at file:line; all use unprojected `findFirst`, so the full row including `customFields` is already loaded at every update and delete emit site |
| ALS actor context | HIGH | **Executed probe**, not reasoning — five scenarios including nesting, absence and concurrency, in the production Node version and container |
| Formula-noise exclusion | HIGH | The recalc write's absence of a `crmBus.emit` is read at `formula-recalc.ts:733-741`, and Phase 34's `updatedAt` comment names this phase explicitly. `isFormulaWrapper` is db-free and test-gated to stay so |
| Index and prune design | HIGH | 1,000,000-row probe, three strategies compared in two data distributions, sizes and plans captured |
| Timeline extension cost | HIGH | The 8 breaking assertions were read individually; the 4-branch plan was measured warm against real data |
| Payload-shape split | HIGH | All 24 emit sites enumerated with file:line and their `data` shape read directly |
| **Scope of "Every CRM write"** | **MEDIUM** | The *facts* are verified exhaustively (three non-emitting paths). The *decision* about which are in scope is Open Questions 1 and 2 and **needs a user answer before planning** — two ROADMAP success criteria hang on it |
| Timeline read authorization | **MEDIUM** | The current behaviour is verified; whether audit entries should inherit it is undecided (Open Question 4) |
| Pitfalls | HIGH | Every pitfall is grounded in a specific file, line or measurement — none is generic advice |

**Research date:** 2026-08-15
**Valid until:** 2026-09-14 (30 days — the stack is stable and entirely in-repo; the only staleness
risk is the repo itself changing under it)
