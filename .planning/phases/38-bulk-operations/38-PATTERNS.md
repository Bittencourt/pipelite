# Phase 38: Bulk Operations - Pattern Map

**Mapped:** 2026-08-17
**Files analyzed:** 48 (16 new, 32 modified)
**Analogs found:** 45 / 48 (35 exact-role + exact-flow, 10 role-match, 3 with no analog)

> **How to read this file.** Every excerpt below is verbatim from this repo at the line numbers
> given. Where a pattern must be copied *verbatim per entity* (the ownership predicates) that is
> said explicitly. Where the closest analog is a **trap** rather than a template (the export
> `getExportData` action, `updateDealMutation`, `deals/page.tsx`'s owner query) it is listed under
> § Anti-Analogs — those files look like the right place to copy from and are not.

---

## File Classification

### New files

| New file | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/lib/bulk/limits.ts` | config (isomorphic) | — | `src/app/api/v1/organizations/batch/route.ts:8` (`MAX_BATCH_SIZE = 100`) + `src/lib/trash/entity-types.ts` (the documented *client-safe* sibling of a server-only module) | role-match |
| `src/lib/bulk/types.ts` | model / types (isomorphic) | — | `src/lib/export/types.ts` (whole file) + `src/app/trash/actions.ts:57-67` (`TrashErrorCode` closed union + `TrashActionResult<T>`) | exact |
| `src/lib/bulk/dispatch.ts` | service (server-only dispatch map) | request-response | `src/lib/trash/dispatch.ts` (whole file) | **exact** |
| `src/lib/bulk/dispatch.test.ts` | test (unit) | — | `src/lib/trash/dispatch.test.ts` (whole file) | **exact** |
| `src/components/bulk/select-column.tsx` | component / hook returning `ColumnDef[]` | — | `src/app/trash/trash-columns.tsx:238-248` (`useTrashColumns(tab): ColumnDef<TrashRow, unknown>[]`, translated headers) | exact |
| `src/components/bulk/select-column.test.ts` | test (pure column def) | — | `src/lib/trash/entity-types.test.ts` (pure-module unit shape) | role-match |
| `src/components/bulk/select-wiring.test.ts` | test (comment-stripped source gate) | — | `src/app/trash/__tests__/trash-client-wiring.test.ts` + `src/components/custom-fields/__tests__/source-scan.ts` | **exact** |
| `src/components/bulk/bulk-action-bar.tsx` | component (fixed bar + export download) | request-response | `src/components/keyboard/shortcuts-hint.tsx:30-53` (the only fixed bottom bar in the repo) + `src/app/admin/export/export-form.tsx:31-40` (`downloadFile`) | role-match |
| `src/components/bulk/bulk-delete-dialog.tsx` | component (controlled AlertDialog) | request-response | `src/app/trash/trash-table.tsx:452-492` (controlled, `event.preventDefault()`, retention-aware copy) | **exact** |
| `src/components/bulk/bulk-reassign-dialog.tsx` | component (controlled Dialog + form) | request-response | `src/app/organizations/organization-dialog.tsx:42-60` (controlled Dialog, no trigger) + `src/app/deals/deal-dialog.tsx:410-430` (owner `Select`) | exact |
| `src/components/bulk/bulk-failure-report.tsx` | component (inline Alert) | — | `src/app/admin/import/pipedrive-api/steps/api-key-step.tsx:79-83` (`Alert variant="destructive"` + `AlertCircle`) | exact |
| `src/components/ui/checkbox-indeterminate.test.ts` | test (source gate) | — | `src/app/trash/__tests__/trash-client-wiring.test.ts` | exact |
| `src/app/organizations/bulk-actions.test.ts` | test (server action, session-swapping) | request-response | `src/app/trash/actions.test.ts:1-60` (whole mock scaffold) | **exact** |
| `src/app/people/bulk-actions.test.ts` | test | request-response | same | **exact** |
| `src/app/deals/bulk-actions.test.ts` | test | request-response | same | **exact** |
| `src/app/activities/bulk-actions.test.ts` | test | request-response | same | **exact** |

### Modified files

| Modified file | Role | Data Flow | Closest Analog (in-file where possible) | Match |
|---|---|---|---|---|
| `src/lib/mutations/organizations.ts` (+`updateOrganizationOwnerMutation`) | model / mutation | CRUD | `src/lib/mutations/deals.ts:760-855` (`updateDealStageMutation` — the narrow single-field mutation) + `organizations.ts:343-380` (delete's pre-read/emit shape) | **exact** |
| `src/lib/mutations/people.ts` (+`updatePersonOwnerMutation`) | model / mutation | CRUD | same, mirrored into `people.ts` | **exact** |
| `src/lib/mutations/deals.ts` (+`updateDealOwnerMutation`) | model / mutation | CRUD | `deals.ts:760-855`, same file | **exact** |
| `src/lib/mutations/activities.ts` (+`updateActivityOwnerMutation`) | model / mutation | CRUD | same | **exact** |
| `src/lib/mutations/{organizations,people,deals,activities}.test.ts` | test (unit, mocked db) | — | `src/lib/mutations/organizations.test.ts:1-70` (the mock header, verbatim) | **exact** |
| `src/lib/audit/diff.test.ts` | test (pure) | transform | itself (extend) | **exact** |
| `src/app/organizations/actions.ts` (+3 bulk actions) | controller (server action) | request-response | `organizations/actions.ts:108-145` (`deleteOrganization`) — same file | **exact** |
| `src/app/people/actions.ts` (+3) | controller | request-response | `people/actions.ts:121` predicate + org shape | **exact** |
| `src/app/deals/actions.ts` (+3) | controller | request-response | `deals/actions.ts:138-168` (`deleteDeal`, **admin bypass**) | **exact** |
| `src/app/activities/actions.ts` (+3) | controller | request-response | `activities/actions.ts:177` predicate + org shape | **exact** |
| `src/lib/export/types.ts` (+`ids?: string[]`) | model / types | — | itself (whole file is 21 lines) | **exact** |
| `src/lib/export/formatters.ts` (4 fetchers) | service | batch read | `formatters.ts:249-267` (`fetchOrganizations`) — the `conditions.push` idiom | **exact** |
| `src/lib/export/formatters.test.ts` | test | — | itself — **but see § Anti-Analogs**: it stubs `db: { query: {} }`, so it cannot test `ids` narrowing | partial |
| `src/components/ui/checkbox.tsx` | component (primitive, additive patch) | — | itself, `:22-27` | **exact** |
| `src/app/organizations/data-table.tsx` | component (TanStack table) | CRUD list | itself `:125-134` / `:174-205` | exact-in-file |
| `src/app/people/data-table.tsx` | component | CRUD list | **byte-identical to `organizations/data-table.tsx`** modulo the Organization→Person rename (verified by diff) | **exact** |
| `src/app/activities/activity-list.tsx` | component | CRUD list | `organizations/data-table.tsx`, with three declared divergences (§ Surface 1c) | exact |
| `src/app/activities/activities-client.tsx` | component (parent, owns filter + Load More) | — | itself `:157-192` | exact-in-file |
| `src/app/deals/kanban-board.tsx` | component (kanban, owns selection `Set`) | event-driven | itself `:71-129` / `:334-358` | exact-in-file |
| `src/app/deals/kanban-column.tsx` | component | — | itself `:29-45` (header row) | exact-in-file |
| `src/app/deals/deal-card.tsx` | component (draggable card) | event-driven | itself `:126-179` | exact-in-file |
| `src/app/organizations/page.tsx` (+`retentionDays`, `owners`) | route (RSC page) | request-response | `src/app/trash/page.tsx:80-84,116-123` (retention read + prop) + `src/app/activities/page.tsx:102-114` (owners query) | **exact** |
| `src/app/people/page.tsx` (+both props) | route | request-response | same | **exact** |
| `src/app/deals/page.tsx` (+`retentionDays`, +**separate** `bulkOwners`) | route | request-response | `trash/page.tsx:80-84`; the owners query is a NEW query — **do not** touch `deals/page.tsx:159-163` | exact |
| `src/app/activities/page.tsx` (+`retentionDays`, +separate `bulkOwners`) | route | request-response | same | exact |
| `src/messages/{en-US,es-ES,pt-BR}.json` (+43-44 `bulk.*` keys) | config (i18n) | — | the checked-in `trash.*` namespace in the same three files | **exact** |
| `src/messages/locale-parity.test.ts` (+`REQUIRED_BULK_KEYS`) | test (contract gate) | — | itself `:28-60`, `:344-374`, `:446-500` | **exact** |

---

## Pattern Assignments

### 1. `src/lib/bulk/dispatch.ts` (service, server-only dispatch map)

**Analog:** `src/lib/trash/dispatch.ts` — copy the whole file's shape, including its header. It maps
`EntityType → restore/purge` only; there is **no** delete map and no owner map, so this is genuinely
a new fifth/sixth map, not duplication.

**Header pattern to restate verbatim in intent** (`src/lib/trash/dispatch.ts:1-27`) — three rules the
new module inherits and must state again, because a reader of `bulk/dispatch.ts` will not have read
`trash/dispatch.ts`:

```ts
/**
 * SERVER-ONLY. Unlike its sibling `entity-types.ts`, this module imports the mutation layer at
 * RUNTIME and therefore pulls `@/db` (and through it `pg`) with it. Never import it from a
 * `"use client"` component; import `entity-types.ts` there instead.
 *
 * NO ERROR HANDLING LIVES HERE. Each mutation already contains its own catch and returns
 * `{ success: false; error }` for anything it can describe.
 *
 * NO PERMISSION CHECK LIVES HERE EITHER, deliberately. [...] mutations check entity existence
 * and nothing more.
 */
```

For this phase the third rule is the load-bearing one: the per-entity ownership predicate is
**asymmetric** (deals has an admin bypass) and therefore cannot live in a dispatch map at all
without a second map of predicates. Keep it in the server action.

**Result type re-declaration** (`:39-53`) — do this rather than importing a result type from one of
four mutation modules:

```ts
export type RestoreResult = { success: true } | { success: false; error: string }
```

**The map shape + the `satisfies` — this is the Phase 37 lesson the phase brief flags**
(`src/lib/trash/dispatch.ts:55-91`):

```ts
type RestoreMap = Readonly<Record<EntityType, (id: string) => Promise<RestoreResult>>>

/**
 * THE `satisfies` IS NOT DECORATION — it catches a class of error the annotation alone does not.
 * A MISSING key fails on the annotation (verified: removing `person` gives TS2741). An EXTRA key
 * does NOT: the literal is an argument to `Object.freeze`, so by the time the result is assigned to
 * the annotated const it is no longer a fresh literal and excess-property checking has been
 * skipped. Without the `satisfies`, `note: purgeDealMutation` compiles cleanly [...]
 */
const RESTORE_BY_TYPE: RestoreMap = Object.freeze({
  deal: restoreDealMutation,
  person: restorePersonMutation,
  organization: restoreOrganizationMutation,
  activity: restoreActivityMutation,
} satisfies RestoreMap)
```

**Accessor shape — no `if (!fn) throw` fallback** (`:92-109`):

```ts
export function restoreRecordByType(entityType: EntityType, id: string): Promise<RestoreResult> {
  return RESTORE_BY_TYPE[entityType](id)
}
```

**Signature note for the new maps.** The delete map's arm is `(id: string, userId: string)` — all
four `delete{Entity}Mutation` take `(id, userId)` (verified: `organizations.ts:343`, `people.ts:381`,
`deals.ts:473`, `activities.ts:326`). The owner map's arm is `(id, ownerId, userId)`. Both are
structurally uniform across the four entities, so no per-arm wrapper is needed (RESEARCH assumption
A2 — typecheck it, do not assume it).

---

### 2. `src/lib/bulk/dispatch.test.ts` (test)

**Analog:** `src/lib/trash/dispatch.test.ts` — copy the whole scaffold.

**Mock only the two functions each module contributes** (`:34-56`) — so a dispatch that reaches for a
third export becomes a TypeError here instead of silently widening coupling:

```ts
vi.mock("@/lib/mutations/deals", () => ({
  restoreDealMutation: vi.fn(),
  purgeDealMutation: vi.fn(),
}))
```

**The spy table with `satisfies Record<EntityType, unknown>`** (`:66-84`) — makes the *test file*
fail to compile when a fifth entity type appears:

```ts
const restoreSpies = {
  deal: vi.mocked(restoreDealMutation),
  person: vi.mocked(restorePersonMutation),
  organization: vi.mocked(restoreOrganizationMutation),
  activity: vi.mocked(restoreActivityMutation),
} satisfies Record<EntityType, unknown>
```

**The mis-wiring assertion — the thing types cannot catch** (`:88-105`, and the reason stated at
`:14-21`: `person: restorePersonMutation` and `person: restoreOrganizationMutation` typecheck
identically):

```ts
function expectOnlySpyCalled(expected: (typeof ALL_SPIES)[number]): void {
  for (const spy of ALL_SPIES) {
    if (spy === expected) continue
    expect(spy).not.toHaveBeenCalled()
  }
}
```

**Identity, not equality, on the returned result** (`:112-120`):

```ts
const result: RestoreResult = { success: true }
spy.mockResolvedValue(result)
const returned = await restoreRecordByType(entityType, `${entityType}-1`)
expect(returned).toBe(result)   // identity — a rebuilt equal-looking result fails
```

**On asserting both directions of the `satisfies`:** `dispatch.test.ts:22-30` records that the maps
are module-private on purpose, so `Object.keys(map)` is not reachable and exhaustiveness is asserted
**behaviourally** (drive all four types through, plus show a fifth type has no entry). Copy that
resolution; do not widen the module's exports to make a test convenient.

---

### 3. `src/lib/mutations/{organizations,people,deals,activities}.ts` — the four new owner mutations

**Analog:** `src/lib/mutations/deals.ts:760-855` (`updateDealStageMutation`) for the *narrow
single-field* shape, and `src/lib/mutations/organizations.ts:343-380`
(`deleteOrganizationMutation`) for the pre-read / emit / catch skeleton.

**Pre-read with `isNull(deletedAt)`, then the emit's `previous`** (`organizations.ts:343-373`):

```ts
export async function deleteOrganizationMutation(
  id: string,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), isNull(organizations.deletedAt)),
  })

  if (!organization) {
    return { success: false, error: "Organization not found" }
  }

  try {
    await db
      .update(organizations)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(organizations.id, id))

    crmBus.emit("organization.deleted", buildEventPayload(
      id,
      "deleted",
      { id },
      userId,
      null,
      organization as unknown as Record<string, unknown>,
    ))

    return { success: true }
  } catch (error) {
    console.error("Failed to delete organization:", error)
    return { success: false, error: "Failed to delete organization" }
  }
}
```

**`buildEventPayload`'s positional signature — module-private, one per mutation module**
(`organizations.ts:145-163`). The new mutation calls it with the same argument order:

```ts
function buildEventPayload(
  entityId: string,
  action: "created" | "updated" | "deleted",
  data: Record<string, unknown>,
  userId: string,
  changedFields: string[] | null = null,
  previous?: Record<string, unknown>
): CrmEventPayload
```

**Post-write full row via `.returning()`, and the `changedFields` array**
(`organizations.ts:310-334` — the update mutation's tail):

```ts
    const [updatedOrg] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, id))
      .returning()
    ...
    crmBus.emit("organization.updated", buildEventPayload(
      id,
      "updated",
      { ...updatedOrg, customFields } as unknown as Record<string, unknown>,
      userId,
      changedFields.length > 0 ? changedFields : null,
      // The pre-write row, from the existence check at the top of this function.
      organization as unknown as Record<string, unknown>,
    ))
```

**The narrow-mutation precedent** (`deals.ts:760-832`) — note three properties to copy:
`changedFields: ["stageId"]` is a literal array, the emit happens **after** any recalculation
(D-17), and the "before" value is the untouched pre-read row while the "after" is that row with the
new field spread over it:

```ts
    const rowAfterUpdate = { ...deal, stageId, position } as unknown as Record<string, unknown>
    ...
    // `stageId` is absent from ENTITY_NATIVE_ATTRIBUTES.deal, so a stage drag scopes to zero
    // evaluations (SC-4); the call is retained so this path stays correct if the native attribute
    // map ever grows.
    const recalculatedCustomFields = await recalcCustomFields({ ..., changedFields: ["stageId"], ... })
    ...
    // `deal` is the pre-write row; `rowAfterUpdate` is that row with the new stage and position
    // spread over it, so `deal` itself is untouched and is the correct before-value.
    const previousDeal = deal as unknown as Record<string, unknown>

    crmBus.emit("deal.updated", buildEventPayload(id, "updated", eventData, userId, ["stageId"], previousDeal))
```

`ownerId` is likewise absent from `ENTITY_NATIVE_ATTRIBUTES` for all four entities
(`src/lib/formula-recalc.ts:103-130`), so `changedFields: ["ownerId"]` scopes recalculation to zero
evaluations. Prefer `.returning()` (as `updateOrganizationMutation` does) over the
`{ ...row, ownerId }` spread `updateDealStageMutation` uses — a real post-write row is what lets
`buildChanges` diff without a hand-built object drifting from the table.

**The idempotent early return** (no analog in the repo — new, and locked by CONTEXT):
`if (row.ownerId === ownerId) return { success: true }` **before** the `try`, so no event and no
audit row is produced for a same-owner reassign. State in the plan that this is by design.

**Naming is load-bearing.** `update{Entity}OwnerMutation` — the `update` prefix is what puts the new
function inside Phase 36's per-function SC-5 gate. See § Shared Patterns → SC-5 gate.

**`buildChanges` reads `previous` for a delete and `data` for an update** (`src/lib/audit/diff.ts:136-146`):

```ts
export function buildChanges(payload: CrmEventPayload): AuditChangeMap {
  const isDelete = payload.action === "deleted"
  const isUpdate = payload.action === "updated"
  const before = normaliseEventData(payload.entity, payload.previous ?? {})
  const after = isDelete ? {} : normaliseEventData(payload.entity, payload.data)
```

→ for the new owner mutation (an **update**), `data` must be the full post-write row. A partial
`{ id, ownerId }` payload silently narrows the diff (diff.ts skips native keys absent from `data`
on updates only). This is what `src/lib/audit/diff.test.ts` must be extended to pin.

---

### 4. `src/lib/mutations/*.test.ts` — extending the four mutation suites

**Analog:** `src/lib/mutations/organizations.test.ts:1-70` — the mock header, verbatim. Note the
hard fact from RESEARCH: importing any `src/lib/mutations/*` module without mocking `@/db` throws
`DATABASE_URL environment variable is not set`.

```ts
vi.mock("@/db", () => ({
  db: {
    query: { organizations: { findFirst: vi.fn() } },
    insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn(),
  },
}))

vi.mock("@/lib/events", () => ({ crmBus: { emit: vi.fn() } }))

vi.mock("@/lib/audit/actor-context", () => ({ getCurrentActor: vi.fn(() => undefined) }))

vi.mock("@/lib/custom-fields", () => ({ getActiveFieldDefinitions: vi.fn(async () => []) }))

// `importOriginal` keeps ENTITY_NATIVE_ATTRIBUTES real, so a drift between the map and the
// create path's changedFields cannot pass silently.
vi.mock("@/lib/formula-recalc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/formula-recalc")>()
  return { ...actual, recalculateFormulas: vi.fn(async () => RECALC_RESULT), stripFormulaKeys: vi.fn((v) => v) }
})
```

For `deals.test.ts` the Pitfall-2 regression gate is `expect(db.delete).not.toHaveBeenCalled()` —
the mock already exposes `delete: vi.fn()`, so nothing new is needed.

---

### 5. `src/app/{organizations,people,deals,activities}/actions.ts` — the twelve new bulk actions

**Analog:** `src/app/organizations/actions.ts:108-145` (`deleteOrganization`) for three of the four
entities; `src/app/deals/actions.ts:138-168` (`deleteDeal`) for deals.

**The full skeleton** (`organizations/actions.ts:108-145`):

```ts
export async function deleteOrganization(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Check ownership
  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, id), isNull(organizations.deletedAt)),
  })

  if (!organization) {
    return { success: false, error: "Organization not found" }
  }

  if (organization.ownerId !== session.user.id) {
    return { success: false, error: "Not authorized" }
  }

  const result = await runWithActor({ kind: "user", userId: session.user.id }, () =>
    deleteOrganizationMutation(id, session.user.id)
  )

  if (!result.success) {
    return result
  }

  revalidatePath("/organizations")

  return { success: true }
}
```

**`runWithActor` placement is a documented rule, not a style** (`organizations/actions.ts:34-36`):

```ts
  // The actor scope opens AFTER the session check above, never before it, so an
  // unauthenticated call establishes no actor at all (T-36-02). `userId` is
  // `session.user.id` and nothing else — never a form field, never a search param.
```

For a bulk action the scope opens **once**, around the whole loop, and `revalidatePath` runs
**once** after it.

**The four ownership predicates — copy VERBATIM, never unify** (all verified by grep this session):

| Entity | Predicate, verbatim | Sites |
|---|---|---|
| organization | `if (organization.ownerId !== session.user.id) {` | `organizations/actions.ts:83, 130` |
| person | `if (person.ownerId !== session.user.id) {` | `people/actions.ts:73, 121` |
| activity | `if (activity.ownerId !== session.user.id) {` | `activities/actions.ts:84, 131, 177` |
| deal | `if (deal.ownerId !== session.user.id && session.user.role !== "admin") {` | `deals/actions.ts:83, 155, 191, 228` |

Only deals carries `&& session.user.role !== "admin"`. Unifying grants a privilege escalation on
three entities or a regression on one.

**Sequential per-record loop precedent** (`src/app/api/v1/organizations/batch/route.ts:53-63`) —
reuse the loop shape, **reject the swallow**: this route pushes only successes and sets
`meta.total = created.length`, so it can never report a failure. SC-3 forbids that.

```ts
    const created = []
    for (const item of items) {
      const result = await createOrganizationMutation({ ...item, userId: context.userId })
      if (result.success) {
        created.push(result.organization)
      }
    }
```

**The cap constant precedent** (`same file:8, 20`) — `MAX_BATCH_SIZE = 100` already exists in the
batch routes, which is why `BULK_MAX_IDS = 100` is a continuation and not an invention:

```ts
const MAX_BATCH_SIZE = 100
...
  .max(MAX_BATCH_SIZE, `Maximum ${MAX_BATCH_SIZE} organizations per batch`)
```

**Closed error-code union in a server action** (`src/app/trash/actions.ts:57-92`) — the analog for
`BulkFailureReason` and for returning codes rather than prose:

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

/** `NOT_IN_TRASH` is the one mutation failure the UI must be able to tell apart. */
function toErrorCode(error: string): TrashErrorCode {
  return error === "NOT_IN_TRASH" ? "NOT_IN_TRASH" : "FAILED"
}
```

Note `trash/actions.ts` uses `code`, while every CRM entity action uses `error`. CONTEXT locks the
established `{ success, error }` convention for this phase; the *per-record* reason is the closed
union. Also worth copying: `parseRecordId` (`trash/actions.ts:111-116`) narrows an `id: string`
argument at runtime, on the stated ground that a server action is a POST endpoint and the annotation
is not a control — the same reasoning applies to `ids: string[]`.

---

### 6. `src/lib/export/types.ts` + `formatters.ts` — where `ExportFilters.ids` plugs in

**Analog:** the files themselves. `types.ts` is 21 lines, verbatim:

```ts
export interface ExportFilters {
  stage?: string
  owner?: string
  dateFrom?: string
  dateTo?: string
}
```

→ add `ids?: string[]`. `ExportOptions` and `ExportResult` need no change.

**The `conditions.push` idiom, per fetcher.** Two of the four annotate the array; two infer it:

```ts
// formatters.ts:249-266 — fetchOrganizations (inferred array)
  const conditions = [isNull(organizations.deletedAt)]
  if (filters?.owner) {
    conditions.push(eq(organizations.ownerId, filters.owner))
  }
  const rows = await db.query.organizations.findMany({
    where: and(...conditions),
    with: { owner: { columns: { id: true, name: true, email: true } } },
  })
  return rows.map((r) => flattenOrganization(r as OrgRow, includeCustomFields))
```

```ts
// formatters.ts:294 (fetchDeals) and :326 (fetchActivities) — explicitly annotated
  const conditions: ReturnType<typeof eq>[] = [isNull(deals.deletedAt)]
```

Four insertion points: `fetchOrganizations` `:253-257`, `fetchPeople` `:273-277`, `fetchDeals`
`:294-307`, `fetchActivities` `:326-336`. `inArray` returns `SQL<unknown>`, so the two annotated
arrays are the typecheck risk (RESEARCH A1) — verify, do not assume.

**The filename the scoped action must override** (`formatters.ts:417-426`):

```ts
    const formatSuffix = format.startsWith("pipedrive") ? "-pipedrive" : ""
    const entityPlural =
      entityType === "person"
        ? "people"
        : entityType === "activity"
          ? "activities"
          : `${entityType}s`
    const filename = `${entityPlural}${formatSuffix}-${timestamp}.${ext}`

    return { success: true, data, filename, count: flatData.length }
```

The scoped action rewrites `result.filename` on the way out (recommended option (a)) — the
`entityPlural` mapping above is the exact English-slug source for `{entity}-selected-{count}-{date}.csv`.

**The `downloadFile` helper to copy — do not write a third copy**
(`src/app/admin/export/export-form.tsx:31-40`):

```ts
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

and its call site (`:89-96`) for the disable → call → download → error shape:

```ts
    const result = await getExportData({ ... })
    setIsExporting(false)
    if (result.success) {
      downloadFile(result.data, result.filename, getMimeType(format))
      setLastExport({ count: result.count, filename: result.filename })
    } else {
      setError(result.error)
    }
```

CSV mime string, verbatim (`:42-46`): `"text/csv;charset=utf-8;"`.

---

### 7. `src/components/ui/checkbox.tsx` — the additive `indeterminate` branch

**Analog:** the file itself. Current indicator, verbatim (`:22-27`):

```tsx
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
```

Root class string that the `group/checkbox` marker must be added to (`:16-19`) — note it already
ships `data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground`, which is the
phase's selection indicator for free, and `disabled:opacity-50` for the empty-table disabled header.
Verified this session: **zero** occurrences of the string `indeterminate` anywhere under `src/`, so
the new branch is unreachable for all 8 existing consumers (UI-SPEC assumption #5 confirmed).

---

### 8. `src/components/bulk/select-column.tsx` (hook returning a `ColumnDef`)

**Analog:** `src/app/trash/trash-columns.tsx:238-248` — a `use client` hook that returns
`ColumnDef[]` and calls `useTranslations`, which is exactly the translated-`aria-label` requirement:

```tsx
export function useTrashColumns(tab: TrashTab): ColumnDef<TrashRow, unknown>[] {
  const t = useTranslations("trash")
  const tCommon = useTranslations("common")
  const format = useFormatter()

  return [
    {
      id: "record",
      header: t(RECORD_HEADER_KEYS[tab]),
      cell: ({ row }) => <RecordCell row={row.original} />,
    },
```

Contrast with `src/app/organizations/columns.tsx`, which exports a **static** array that both
`page.tsx` files import (`organizations/page.tsx:5`, `people/page.tsx`) — a static array cannot call
`useTranslations`, which is UI-SPEC § Surface 1's reason for putting the select column in
`data-table.tsx` instead. Do not edit either `columns.tsx`.

---

### 9. The three TanStack surfaces

#### 9a. `src/app/organizations/data-table.tsx` (and `people/data-table.tsx`, structural twins)

> **CORRECTED during execution of plan 38-16, and re-verified by the orchestrator.** The original
> claim here — that the sed-normalised diff returns *identical*, so the two files are byte-identical —
> **was already false at the phase base commit.** Re-measured at the wave-3 merge point:
> `diff <(sed -e 's/Organization/Person/g' -e 's/organization/person/g' organizations/data-table.tsx) people/data-table.tsx`
> reports **40 differing lines (20 pairs)**. The differences are local identifier abbreviations that no
> entity-name substitution can bridge (`editingOrg` vs `editingPerson`, `orgToDelete` vs
> `personToDelete`, the `org`/`person` parameter names), the `organization-dialog` filename, and a
> genuinely different `DeleteDialog` name prop — people have `firstName`/`lastName`, organizations have
> a single `name`.
>
> They are **structural** twins, not textual ones: the same edit applies to both, but the two files are
> not interchangeable text. **Consequence for any gate:** do NOT assert byte parity between them.
> Plans 38-15 and 38-16 both left these pre-existing differences alone rather than normalising a file
> another agent was editing concurrently, which was the right call.

Whatever is done to one is done to the other in substance.

**The `useReactTable` call to extend** (`:125-134`):

```ts
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      refresh: refresh || (() => {}),
      onEdit: handleEdit,
      onDelete: handleDeleteClick,
    },
  })
```

→ add `columns: columnsWithSelect`, `getRowId: (row) => row.id`, `state: { rowSelection }`,
`onRowSelectionChange: setRowSelection`, `enableRowSelection: true`. **No `rowSelection` exists
anywhere in the repo today** (verified: zero matches for `rowSelection`, `enableRowSelection`,
`getIsAllPageRowsSelected` across `src/`) — this configuration has no in-repo analog; use RESEARCH
§ Code Examples.

**The row that already carries the inert selected hook** (`:174-205`) — `data-state` is already
present and `table.tsx:60` already styles it, so zero new CSS:

```tsx
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => {
                const rp = rowProps(index)
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    data-selected={rp["data-selected"]}
                    className={rp.className}
                    onClick={rp.onClick}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No organizations found.
                </TableCell>
              </TableRow>
            )}
```

`colSpan={columns.length}` reads the **prop**, not the table → Pitfall 10. Change to
`table.getAllLeafColumns().length` (or `columnsWithSelect.length`) in all three files
(`organizations:199`, `people:199`, `activity-list:499`).

**The keyboard hook the checkbox must coexist with** (`:116-123`) — `rowProps(index).onClick` moves
the keyboard cursor only; `onOpen` is bound to `enter`, so the checkbox's `stopPropagation` is
defence in depth:

```ts
  const { containerProps, rowProps } = useDataTableKeyboard({
    data,
    onEdit: handleEdit,
    onDelete: handleDeleteClick,
    onOpen: (org) => router.push(`/organizations/${org.id}`),
    onCreate: handleAddNew,
    getId: (org) => org.id,
  })
```

**The `search` prop that the clear-on-filter effect must key on** (`:38`):
`search = ""` is already a prop on both tables → `useEffect(() => setRowSelection({}), [search])`
is available in-file. Never key on `[data]` (Pitfall 8).

**Where the bar and its `h-20` spacer go**: after the `Load More` block (`:210-223`), inside the
root `<div className="space-y-4">` (`:137`), so nothing above the fold moves.

**The `onRecordSaved` / refresh-only convention, and the comment explaining why the body is nearly
empty** (`:93-103`) — do not reintroduce `onSuccess`, and note the measured fact the bulk handlers
depend on:

```ts
  // ... Measured for WR-12 against Next 16.1.6: an action that calls
  // `revalidatePath` at all re-renders the CURRENT client tree a few milliseconds after
  // the action resolves, whichever path it names ...
  const handleRecordSaved = () => {
    refresh?.()
  }
```

#### 9b. `src/app/activities/activity-list.tsx` + `activities-client.tsx`

Same table body shape (`activity-list.tsx:473-505`), with three divergences from
`organizations/data-table.tsx`:

1. `getFilteredRowModel()` is configured (`:391-396`) but **inert** — no filter state is ever set:

```ts
  const table = useReactTable({
    data: sortedActivities,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })
```

2. The header reads `getSize()` (`:461`), which is why the select column's `size: 44` is honoured
   here and auto-sized on the other two:

```tsx
                  <TableHead key={header.id} style={{ width: header.getSize() }}>
```

3. Its props carry **no** `search` (`:83-88`), so the clear-on-filter key does not exist in this
   file — Pitfall 9's reason to lift `rowSelection` to the parent:

```ts
interface ActivityListProps {
  activities: Activity[]
  activityTypes: ActivityType[]
  onEdit: (activity: Activity) => void
  onRefresh?: () => void
}
```

**The parent that owns the filter row and `Load More`** (`activities-client.tsx:157-192`) — the bar,
the spacer and the failure report belong here, after the `Load More` button:

```tsx
        <TabsContent value="list">
          <div className="space-y-4">
            <ActivityFilters ... search={search} />
            ...
                <ActivityList
                  activities={activities}
                  activityTypes={activityTypes}
                  onEdit={handleEdit}
                  onRefresh={handleRefresh}
                />
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={handleLoadMore}>
                      Load More
                    </Button>
                  </div>
                )}
```

`activities-client.tsx:35-46` already receives `search` and `activeFilters`, so
`JSON.stringify({ search, ...activeFilters })` is the available filter signature.

#### 9c. Deals kanban trio

**`kanban-board.tsx` owns the selection `Set`** — the state block to extend (`:71-80`), including the
existing sync effect that shows the file's idiom for reacting to new server data:

```ts
  const [dealsByStage, setDealsByStage] = useState(initialDealsByStage)
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [dealDialogOpen, setDealDialogOpen] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Sync state when server data changes
  useEffect(() => {
    setDealsByStage(initialDealsByStage)
  }, [initialDealsByStage])
```

**Won/lost stages render summary tiles with no `DealCard` children** (`:360-400`) — Pitfall 12; only
`openStages` (`:83`, `:335-357`) get cards, so only open stages get checkboxes.

**The card render site to thread selection props through** (`:345-354`) — note `isSelected` is
already taken by the **keyboard cursor**, so the bulk prop needs a different name:

```tsx
                  {(dealsByStage[stage.id] || []).map((deal, itemIndex) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onEdit={handleEditDeal}
                      isSelected={getItemProps(columnIndex, itemIndex)["data-selected"]}
                      data-kanban-col={columnIndex}
                      data-kanban-item={itemIndex}
                    />
                  ))}
```

**The dnd-kit sensor the checkbox must survive** (`:120-129`):

```ts
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
```

**`deal-card.tsx` — the props interface and the three-way ring collision** (`:53-62`, `:126-144`):

```tsx
interface DealCardProps {
  deal: Deal
  onEdit?: (deal: Deal) => void
  isOverlay?: boolean
  isSelected?: boolean            // keyboard cursor — NOT bulk selection
  "data-kanban-col"?: number
  "data-kanban-item"?: number
}
```

```tsx
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "bg-card border rounded-lg p-3 cursor-pointer transition-all",
          isDragging && "opacity-50",
          isExpanded && "ring-2 ring-primary",
          isSelected && !isExpanded && "ring-2 ring-primary ring-offset-2"
        )}
        data-selected={isSelected || undefined}
        data-kanban-col={kanbanCol}
        data-kanban-item={kanbanItem}
        onClick={() => setIsExpanded(!isExpanded)}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
```

Both ring treatments are taken → the bulk-selected card gets `bg-primary/5`, per UI-SPEC. The
checkbox goes as the first child of the `flex items-start justify-between gap-2` row at `:144`,
before the `flex-1 min-w-0` block. `onClick`, `onPointerDown` and `onKeyDown` must all be stopped —
`:140` is the expand toggle, `:141-142` spread `attributes` + `listeners`.

**Precedent for stopping propagation inside the card** (`:183`) — the expanded block already does it:

```tsx
          <div className="mt-3 pt-3 border-t space-y-2" onClick={e => e.stopPropagation()}>
```

**`kanban-column.tsx` header row to prepend the stage select-all into** (`:29-40`):

```tsx
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <div className={cn("w-3 h-3 rounded-full", colorStyle.bg)} />
          <span className="font-medium text-sm">{stage.name}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {deals.length} deals
        </span>
      </div>
```

`KanbanColumnProps` (`:9-18`) currently takes `{ stage, deals, children }` — the select-all
callbacks and the two boolean states are new props.

---

### 10. `src/components/bulk/bulk-delete-dialog.tsx`

**Analog:** `src/app/trash/trash-table.tsx:434-492` — the controlled AlertDialog with retention-aware
copy, an `onOpenChange` that refuses to close in flight, and `event.preventDefault()`:

```tsx
      <AlertDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => {
          if (isPurging) return
          if (!open) closePurgeDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("purgeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {purgeImpact === null
                ? t("purgeDialog.descriptionUnknownImpact", { name: purgeTarget?.name ?? "" })
                : t("purgeDialog.description", { name: purgeTarget?.name ?? "", detached: purgeImpact })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPurging}>
              {t("purgeDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Radix closes on click by default; the dialog has to stay open while the
                // request is in flight so the spinner and the disabled state are visible.
                event.preventDefault()
                if (purgeTarget !== null) confirmPurge(purgeTarget)
              }}
              disabled={isPurging}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPurging ? <Loader2 className="size-4 animate-spin" /> : null}
              {isPurging ? t("deleting") : t("purgeDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

**The `retentionDays === null` copy branch** (`trash-table.tsx:412-415`) — the exact pattern for
`descriptionNoRetention`; note there is **no** `?? 30`:

```tsx
                    {retentionDays === null
                      ? t("empty.bodyNoRetention")
                      : t("empty.body", { days: retentionDays })}
```

**The prop declaration to copy** (`trash-table.tsx:60-63`):

```ts
  /** Visibility only. The server action re-checks the role on every call; this is never the gate. */
  isAdmin: boolean
  /** `null` means nothing is emptied automatically, and the empty state must say so. */
  retentionDays: number | null
```

**Secondary analog** (`activity-list.tsx:511-532`) — same primitives, no `preventDefault`, and it
uses `tCommon('cancel')` / `tCommon('delete')`, which UI-SPEC's copy contract forbids for this
phase. Copy the structure from `trash-table.tsx`, not the labels from here.

---

### 11. `src/components/bulk/bulk-reassign-dialog.tsx`

**Controlled Dialog, no trigger** — `src/app/organizations/organization-dialog.tsx:1,42-60`:
`"use client"` at line 1, `interface OrganizationDialogProps { open: boolean; onOpenChange: (open: boolean) => void; ... }`,
and no `DialogTrigger` in the file. `:51` documents that closing is the dialog's decision taken
through `onOpenChange`.

**The owner `Select` — the established owner-picking idiom** (`src/app/deals/deal-dialog.tsx:410-430`):

```tsx
            {users.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="ownerId">Owner</Label>
                <Select
                  value={ownerId || ""}
                  onValueChange={(value) => setValue("ownerId", value === "none" ? "" : value)}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an owner (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No owner</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
```

Two deliberate divergences for the bulk dialog: **no `"none"` item** (`owner_id` is `NOT NULL`, and
UI-SPEC forbids an unassign), and `SelectTrigger id="bulk-owner"` matched by
`<Label htmlFor="bulk-owner">` (this analog puts `htmlFor` on a trigger with no `id` — do not copy
that part).

---

### 12. `src/components/bulk/bulk-action-bar.tsx`

**Closest fixed-bar analog** (`src/components/keyboard/shortcuts-hint.tsx:30-53`) — the only
`fixed bottom` element in the app, and both a template and a hazard:

```tsx
  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
      <div className="container flex items-center justify-between py-2 px-4">
```

Copy: the early `return null` when there is nothing to show (UI-SPEC: 0 selected ⇒ the bar is
**absent** from the DOM), and the outer-fixed / inner-flex two-div structure.

> **Two collision findings the planner must resolve, both measured this session:**
>
> 1. `ShortcutsHint` is rendered globally (`src/app/layout.tsx:53`) at **`z-50`**, `bottom-0`,
>    full-width, for the first 10 s of any session where `localStorage.pipelite_shortcuts_hint_dismissed`
>    is unset. UI-SPEC specifies the bulk bar at `z-30`, `bottom-4`. On a fresh browser profile the
>    hint will sit **on top of** the bar. Either raise the bar above `z-50` or make the 320px/UAT
>    steps dismiss the hint first — and say which, in writing.
> 2. `<Toaster />` (`src/app/layout.tsx:54`) is mounted with **no `position` prop**, so sonner's
>    default bottom-right applies. The bar is `bottom-4` + horizontally centred `w-fit`, so the two
>    regions can overlap on a narrow viewport. This is UI-SPEC's checklist item "The bar does not
>    cover the Sonner toast region" — it is a real, reachable condition, not a formality.

**Transition + toast + `action` deep-link pattern** (`src/app/trash/trash-table.tsx:178-241`) — the
model for the bulk handlers, including the `Open Trash` toast action and the second warning toast for
a shortfall:

```tsx
  function handleRestore(row: TrashRow) {
    setPendingRowId(row.id)
    startTransition(async () => {
      try {
        ...
        toast.success(t("restored", { name: result.name, list: tNav(result.tab) }), {
          action: {
            label: t("openRecord"),
            onClick: () => router.push(`/${result.tab}/${row.id}`),
          },
        })
        settle()
      } catch {
        toast.error(t("error.restoreFailed"))
      } finally {
        setPendingRowId(null)
      }
    })
  }
```

```tsx
        // AND THE SHORTFALL, when there is one. Without this second toast the user asked for
        // three records, was told "1 record restored." and got no account of the other two ...
        if (result.unrestoredParents > 0) {
          toast.warning(t("linkedNotRestored", { count: result.unrestoredParents }))
        }
```

`toast.warning` is therefore **already in production use** in this repo — UI-SPEC assumption #6 is
confirmed by an existing call site, not just by the type surface.

For the trash deep link, `ENTITY_TO_TRASH_TAB` is the constant to use
(`src/lib/trash/entity-types.ts:47-52`):

```ts
export const ENTITY_TO_TRASH_TAB: Readonly<Record<EntityType, TrashTab>> = Object.freeze({
  deal: "deals",
  person: "people",
  organization: "organizations",
  activity: "activities",
})
```

Note this module is `entity-types.ts`, the **client-safe** sibling — importing
`@/lib/trash/dispatch` from the bar would pull `@/db` into the client bundle.

---

### 13. `src/components/bulk/bulk-failure-report.tsx`

**Analog:** `src/app/admin/import/pipedrive-api/steps/api-key-step.tsx:79-83` — the only
`Alert variant="destructive"` + `AlertCircle` composition in the repo:

```tsx
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
```

**Primitive facts that constrain the report** (`src/components/ui/alert.tsx`):
- `Alert` hardcodes `role="alert"` (`:27`) — no bespoke live region needed.
- `destructive` is `"border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive"` (`:12-13`) — **no background fill**, which is what makes a destructive *region* admissible here.
- `AlertTitle` is `"mb-1 font-medium leading-none tracking-tight"` (`:40`) — weight 500. UI-SPEC's preferred resolution is adding `font-semibold` in the consumer's `className`; do **not** patch `alert.tsx`.
- The base class has `[&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3 [&>svg~*]:pl-7` (`:7`) — the icon is positioned by the primitive, and the `absolute right-2 top-2` Dismiss button UI-SPEC specifies needs `relative` on the Alert, which the base class already provides.

---

### 14. `src/app/{organizations,people,deals,activities}/page.tsx` — the two new props

**`retentionDays` read + prop** — `src/app/trash/page.tsx:77-84, 110-123`:

```ts
  // Three independent reads, none of which throws — every one fails closed inside its own
  // module — so the page renders even when the database is unhappy.
  const [counts, list, retentionDays] = await Promise.all([
    countTrashed(viewer),
    listTrashed(tab, page, viewer),
    readTrashRetentionDays(),
  ])
```

```tsx
                /*
                  `retentionDays` is `null` whenever the window is unset, corrupted or out of
                  range. That null is what selects the empty state's no-retention copy, so the
                  page never promises a window the pruner is not enforcing.
                */
                <TrashTable ... retentionDays={retentionDays} />
```

The function is `readTrashRetentionDays` (`src/lib/trash/settings.ts:71`), **not**
`readRetentionDays` as 38-UI-SPEC writes it. Its contract, verbatim from `settings.ts:61-68`:

```
 *   2. There is deliberately NO code-level fallback in this function, and none may ever be
 *      added. [...]
 * Default in data, fail closed in code. A nullish-coalescing fallback here would collapse the
 * two and turn a corrupt row back into an unbounded delete.
```

**The owners query shape** — `src/app/activities/page.tsx:102-114, 167-171`:

```ts
  const [activitiesResult, typesResult, dealsForDropdown, ownersResult] = await Promise.all([
    getActivities(filters),
    getActivityTypes(),
    getDealsForDropdown(),
    db.query.users.findMany({
      where: isNull(users.deletedAt),
      columns: { id: true, name: true, email: true },
      orderBy: [users.name],
    }),
  ])
```

```ts
  // Map owners to include name (handle null name)
  const owners = ownersResult.map((u) => ({
    id: u.id,
    name: u.name || "Unknown",
  }))
```

→ the new `bulkOwners` query is the same shape with
`where: and(isNull(users.deletedAt), eq(users.status, "approved"))`. It must be a **separate**
query/prop (Pitfall 16): this array is fed to `ActivityFilters` **and** `ActivityDialog`
(`activities-client.tsx:159-164, 205-213`), and `deals/page.tsx:158-163` feeds `allUsers` to
`DealFilters` and `DealDialog`. Changing either `where` clause changes an existing dropdown.

**`organizations/page.tsx` and `people/page.tsx` fetch no users at all** (verified —
`organizations/page.tsx:1-58` selects `users.name` via a `leftJoin` only, for the `ownerName`
column). Both need the query outright, plus the `PAGE_SIZE` cumulative-limit context that makes
"selection persists across Load More" true (`organizations/page.tsx:16-20, 48-49`):

```ts
const PAGE_SIZE = 50
async function getOrganizations(search?: string, pageNum: number = 1) {
  const limit = PAGE_SIZE * pageNum + 1
  ...
  const hasMore = rows.length > PAGE_SIZE * pageNum
  const result = hasMore ? rows.slice(0, PAGE_SIZE * pageNum) : rows
```

The `<DataTable ... />` call site to extend is `organizations/page.tsx:95-101`.

---

### 15. `src/messages/locale-parity.test.ts` — `REQUIRED_BULK_KEYS`

**Analog:** the file itself. Four edit sites, all mechanical.

**(a) The contract list, with the doc comment that states its purpose** (`:23-28`, mirrored at
`:63-72` for audit):

```ts
/**
 * The copy contract from 35-UI-SPEC.md § Copywriting Contract. Every key the notes/timeline
 * surface renders must exist in every locale. Adding a `notes.*` string to the UI means adding
 * its dot-path here first — that is the point of the list being checked in.
 */
export const REQUIRED_NOTE_KEYS: string[] = [
  "notes.timeline",
  ...
]
```

**(b) The namespace constant + the scoped key selector** (`:342-374`):

```ts
const NOTES_NAMESPACE = "notes"
const AUDIT_NAMESPACE = "audit"
const TRASH_NAMESPACE = "trash"

/** The three trash strings that live outside the trash namespace: the tile and the sidebar entry. */
const TRASH_EXTRA_KEYS = ["admin.dashboard.trash", "admin.dashboard.trashDescription", "nav.trash"]

/** Matches a namespace root and everything nested under it, and nothing that merely shares a prefix. */
function inNamespace(namespace: string): (key: string) => boolean {
  return (key) => key === namespace || key.startsWith(`${namespace}.`)
}

const trashKeys = keysMatching(
  (key) => inNamespace(TRASH_NAMESPACE)(key) || TRASH_EXTRA_KEYS.includes(key),
)
```

UI-SPEC says **zero** keys are added outside `bulk.*`, so `bulkKeys = keysMatching(inNamespace(BULK_NAMESPACE))`
needs no `EXTRA_KEYS` sibling.

**(c) The five assertion bodies — pass the list SEPARATELY, never concatenated** (`:381-386`,
`:446-500`):

```ts
/*
 * The five assertion bodies below are shared by every copy contract in this file [...]
 * REQUIRED_NOTE_KEYS, REQUIRED_AUDIT_KEYS and REQUIRED_TRASH_KEYS are passed separately —
 * never concatenated — so a failure diff names which contract broke and lists only its keys.
 */
```

```ts
    expect(missingIn(REQUIRED_TRASH_KEYS)).toEqual(emptyPerLocale)
    ...
    expect(blankIn(REQUIRED_TRASH_KEYS)).toEqual(emptyPerLocale)
    ...
    expect(untranslatedInBoth(REQUIRED_TRASH_KEYS)).toEqual([])
    ...
    expect(placeholderDrift(REQUIRED_TRASH_KEYS)).toEqual({})
```

**(d) The exact-contract assertion — the one that makes an ungated key fail** (`:470-477`):

```ts
    // Same exact-contract rule for trash, and the same reason.
    const trashContract = [...REQUIRED_TRASH_KEYS].sort()
    for (const locale of LOCALES) {
      expect(
        trashKeys[locale],
        `${TRASH_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(trashContract)
    }
```

This is why Open Question 1's 44th key (`bulk.selectAllInStageCapped`) **must** land in
`REQUIRED_BULK_KEYS` in the same commit as the string: an extra shipped key fails here, not just a
missing one.

**Note on `placeholderDrift`** (`:329-332`): `placeholders()` matches `/\{[a-zA-Z0-9_]+\}/g`, so ICU
plural syntax like `{count, plural, one {...} other {#...}}` yields **no** simple-placeholder match
for `count` (the comma breaks the pattern) but **does** match nested simple placeholders such as
`{stage}`, `{days}`, `{name}`, `{owner}`, `{max}`. Translators must preserve those exactly; the
plural skeleton itself is not covered by this gate.

**The whole-file parity gate** (`:502-513`) applies to all three locale files with no scoping, so all
43-44 keys must land in all three in the same commit.

---

### 16. `src/app/{entity}/bulk-actions.test.ts` (4 new files)

**Analog:** `src/app/trash/actions.test.ts:1-60` — the only scaffold in the repo that swaps sessions
per test, which is exactly what the authorization-asymmetry tests need:

```ts
/**
 * SCAFFOLD NOTE — `src/app/notes/actions.test.ts:1-30` is the only other suite in this repo that
 * mocks `@/auth` [...] the whole point is to swap the SESSION per test (absent / member-owner /
 * member-non-owner / admin), which the `vi.mock("@/lib/api/auth")` auto-approve bypass used by the
 * `/api/v1` route tests cannot do. `auth` is therefore a bare `vi.fn()` and every test drives
 * `mockResolvedValue` itself.
 *
 * THE ASSERTION THAT MATTERS MOST IS AN ABSENCE. A refusal returned AFTER the write was issued
 * would satisfy any test that only inspects the return value, so every denial case below asserts
 * the dispatch was never called.
 */

vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/trash/dispatch", () => ({
  restoreRecordByType: vi.fn(),
  purgeRecordByType: vi.fn(),
}))
vi.mock("@/lib/trash/queries", () => ({ findTrashedRecord: vi.fn(), ... }))

// `runWithActor` is replaced by a spy that RECORDS its actor and still invokes the callback, so
// both the wrapping and the identity inside it are assertable (T-37-08).
vi.mock("@/lib/audit/actor-context", () => ({
  runWithActor: vi.fn((_actor: unknown, fn: () => unknown) => fn()),
}))
```

That `runWithActor` mock is exactly what makes "wrapped once, not per record"
(`expect(runWithActor).toHaveBeenCalledTimes(1)`) and "`revalidatePath` called once after the loop"
assertable. Also copy the deliberate non-mock (`:20-27`): the authorization predicate itself is
never stubbed — it lives inline in the action and it is the subject of the file.

---

## Shared Patterns

### Authentication + actor scope (all 12 bulk actions)

**Source:** `src/app/organizations/actions.ts:27-42`
**Apply to:** every new server action

```ts
  const session = await auth()

  // Verify authentication
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // The actor scope opens AFTER the session check above, never before it, so an
  // unauthenticated call establishes no actor at all (T-36-02). `userId` is
  // `session.user.id` and nothing else — never a form field, never a search param.
  const result = await runWithActor({ kind: "user", userId: session.user.id }, () => ...)
```

### Per-record authorization (asymmetric — copy verbatim, do not unify)

**Source:** the four `actions.ts` files, line numbers in § 5 above.
**Apply to:** every bulk delete and bulk reassign action, inside the loop, before the mutation call.
Failed predicate → `notPermitted`; `findFirst` miss (which already carries `isNull(deletedAt)`) →
`notFound`. Do not ship `alreadyDeleted` as reachable on the delete path without a second read
(RESEARCH A6) — and state that collapse in the plan, in writing.

### `revalidatePath` once, after the loop

**Source:** `src/app/organizations/actions.ts:142`, `deals/actions.ts:163-165` (which guards it on
success). **Apply to:** all bulk write actions. Never inside the loop.

### Closed reason codes, never prose, across the client boundary

**Source:** `src/app/trash/actions.ts:57-92` (`TrashErrorCode`, `toErrorCode`) and its consumer
`trash-table.tsx:160-175` (a `switch` on the code, mapping `NOT_IN_TRASH` to a distinct string):

```tsx
        toast.error(t("error.alreadyPurged"))
        router.refresh()
        break
      case "NOT_AUTHENTICATED":
      case "NOT_AUTHORIZED":
      case "NOT_ADMIN":
      case "FAILED":
      default:
        // The row stays and the buttons re-enable, so the action is still reachable.
        toast.error(t("error.restoreFailed"))
```

**Apply to:** `BulkFailureReason` → `bulk.reason.*`. Never render a server `error` string in the
failure report.

### SC-5 gate — the `update` prefix is what keeps the new mutations covered

**Source:** `src/lib/audit/no-mutation-coupling.test.ts:163-166`

```ts
/**
 * The event-less audit writers of Phase 37 — the ONLY functions permitted to reach the audit
 * layer from inside a mutation module, because they emit nothing for the subscriber to hear.
 */
const EVENTLESS_AUDIT_WRITER = /export async function (?:restore|purge)[A-Za-z]*Mutation\b/g

/** Everything the subscriber captures instead. These must stay uncoupled, per function. */
const EVENT_EMITTING_MUTATION = /export async function (?:create|update|delete)[A-Za-z]*Mutation\b/g
```

`export async function updateOrganizationOwnerMutation` matches `EVENT_EMITTING_MUTATION` and is
therefore sliced out and asserted uncoupled for free. A `reassign…` name would match neither regex
and would sit outside the gate. The gate asserts `> 0`, never an exact count
(`no-mutation-coupling.test.ts:216-230` area), so adding four functions is non-breaking.

The per-function slicer, for reference (`:196-205`) — note the WR-13 discipline it documents:

```ts
function sliceDeclaration(source: string, declaration: string): string {
  const start = source.indexOf(declaration)
  if (start === -1) return ""
  const end = source.indexOf("\nexport ", start + 1)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}
```

### Comment-stripped source gates — MANDATORY for every source gate this phase adds

**Source:** `src/components/custom-fields/__tests__/source-scan.ts` (the shared, string-aware
stripper — use this, do not write a fourth):

```ts
/** Read a repo-relative source file with comments stripped. */
export function readStrippedSource(path: string): string {
  return stripComments(readFileSync(path, "utf8"))
}
```

`stripComments` there is **string-aware** (`:20-65`) — it tracks `"`, `'` and backticks, so
`href="https://…"` is not truncated. Prefer it over the regex variant in
`no-mutation-coupling.test.ts:79-81`, which needs a `[^:]` guard for exactly that reason.

**Consumer template** (`src/app/trash/__tests__/trash-client-wiring.test.ts:19-24, 43-50`):

```ts
import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const TABLE = readStrippedSource("src/app/trash/trash-table.tsx")
const COLUMNS = readStrippedSource("src/app/trash/trash-columns.tsx")

/** The first non-comment token of a client module. */
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/

describe("trash-table.tsx wiring", () => {
  it("is a client module, so its dialog never crosses the RSC boundary (CFUI-01)", () => {
    expect(
      CLIENT_DIRECTIVE.test(TABLE),
      "trash-table.tsx must open with the 'use client' directive: it owns an AlertDialog, and a server module handing children to a Radix asChild slot renders nothing at all, silently"
    ).toBe(true)
  })
```

It also carries reusable forbidden-token tables (`:26-40`) the new gates can copy directly:

```ts
/** Every colour the UI contract forbids on these surfaces, plus any raw hex literal. */
const FORBIDDEN_COLOURS = ["text-red-", "text-green-", "bg-red-", "bg-green-", "bg-white", "text-black"]
const HEX_LITERAL = /#[0-9a-fA-F]{3,6}/
/** A button that does not name its object, per the copy contract. */
const BARE_LABELS = [">Save<", ">Cancel<", ">Confirm<", ">OK<", ">Yes<", ">Apply<"]
```

> **THE REPO-WIDE LANDMINE, carried into every gate this phase writes.** STATE.md, Phase 37: a
> grep-based acceptance gate that searched **raw file text** collided with an explanatory COMMENT
> **nine times in one phase** — including once with the plan's own suggested wording; Phase 35 hit it
> three times. This phase is unusually exposed, because its single most important rule is a
> *negative about a function name* (`update{Entity}Mutation` must never be called with `{ ownerId }`)
> that will inevitably be explained in a comment right beside the call site, and because
> `src/lib/bulk/dispatch.ts` is required to restate `trash/dispatch.ts`'s header prose.
> **Rule for every gate in this phase: assert against `readStrippedSource(...)`, never against raw
> text, and say so in the gate's own header.** Reword a comment only if the gate is genuinely
> comment-blind; never weaken the gate. `no-mutation-coupling.test.ts:52-60` states the same rule and
> even asserts that four files carry a tombstone comment saying "audit" out loud, precisely so the
> stripping is *proven* to run rather than assumed.

### Anti-vacuity requirements for any new source gate

**Source:** `no-mutation-coupling.test.ts:38-50` — three requirements, each of which a real gate in
this repo shipped without:

```
 *   1. Prove the files were found and read. A glob that silently matches zero files passes
 *      a "no file imports X" test perfectly. Hence the explicit count assertions below.
 *   2. Prove they are the RIGHT files, by asserting a known POSITIVE marker (`crmBus.emit`)
 *      before asserting the negative.
 *   3. A gate for the gate: two vocabulary tables pinning what the detector recognises and
 *      what it must leave alone.
```

Apply to `select-wiring.test.ts`, `checkbox-indeterminate.test.ts` and the export-signature gate:
assert the positive first (e.g. `useReactTable` is present in all three tables) before asserting the
negative (no `AlertDialogTrigger`, no `ExportFilters` in the scoped action's signature).

---

## Anti-Analogs (look like the right analog; are not)

| Do NOT copy from | Why | Copy instead |
|---|---|---|
| `src/app/admin/export/actions.ts::getExportData` | Admin-gated (`role !== "admin"`) and takes a full `ExportOptions`. A non-admin scoped action modelled on it and accepting filters is an admin-gate bypass returning all 46,054 organizations (Pitfall 4). | RESEARCH § Scoped export action — `(ids: string[])` and nothing else; construct `ExportOptions` server-side. |
| `updateDealMutation` (`src/lib/mutations/deals.ts`, the assignee teardown at `:406`) | `updateDealSchema = dealSchema.partial()` preserves `assigneeIds`' `.default([])`, and the mutation unconditionally deletes every `deal_assignees` row before deciding what to re-insert. Unaudited (join table). | `updateDealStageMutation` (`deals.ts:760-855`) — the narrow shape that touches one field. |
| `updateOrganizationMutation` / `updatePersonMutation` / `updateActivityMutation` with `{ ownerId }` | `ownerId` is absent from all three Zod schemas; Zod strips unknown keys, so the call writes only `updatedAt`, emits an empty diff, and the audit subscriber drops the row. `{ success: true }` with nothing written. | The four new `update{Entity}OwnerMutation`. |
| `src/app/deals/page.tsx:158-163` (`allUsers`) | Filters on `isNull(users.deletedAt)` **only**, no `status` predicate, and feeds `DealFilters` + `DealDialog`. Copying it offers unapproved users as bulk-reassign targets; editing it changes existing dropdowns (Pitfall 16). | A **new, separate** `bulkOwners` query with `and(isNull(deletedAt), eq(status, "approved"))`. Same for `activities/page.tsx:106-113`. |
| `src/app/api/v1/*/batch/route.ts` failure handling (`organizations/batch/route.ts:53-71`) | Pushes only successes and sets `meta.total = created.length`, so it can never report a failure. SC-3 requires the opposite. | The loop shape only; return `{ succeeded, failed: [{ id, reason }] }`. |
| `src/app/activities/activity-list.tsx:400-452` (the overdue banner) | Contains `border-red-200 bg-red-50 text-red-600 text-red-700` and `bg-white` — pre-existing token debt in a block this phase does not touch. | The token set. Do not copy it and do not fix it here. |
| `src/components/ui/entity-combobox.tsx`, `src/components/assignee-picker.tsx` | `EntityCombobox` routes through `searchEntities(entityType: EntityType)` and `EntityType` is a four-literal union reused by two *persisted* columns; `assignee-picker` is multi-select. | The vendored `Select`, per `deals/deal-dialog.tsx:410-430`. |
| `src/lib/export/formatters.test.ts:6-9` as the analog for testing `ids` narrowing | It stubs `db: { query: {} }` on the stated ground that no function under test touches the DB. An `ids` test needs either a shaped `db.query.<table>.findMany` mock **or** the live-DB probe RESEARCH § Validation mandates. A mocked query cannot catch a malformed `inArray`. | Extend the file for the flatteners; put the `ids` proof in a live-DB probe (`docker compose exec postgres psql`) as Phase 37's lesson requires. |
| `activity-list.tsx:521-528` dialog labels (`tCommon('cancel')`, `tCommon('delete')`) | UI-SPEC § Copy rules forbids bare "Cancel"/"Delete" in these surfaces and explicitly excludes `common.*` reuse. | `bulk.deleteDialog.cancel` = "Keep records", `bulk.deleteDialog.confirm` = "Delete {N} records". |

---

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|---|---|---|---|
| TanStack `rowSelection` wiring in the three tables | component config | — | **Zero** occurrences of `rowSelection`, `enableRowSelection`, `getIsAllPageRowsSelected`, `getIsSomePageRowsSelected` or `toggleAllPageRowsSelected` anywhere under `src/` (verified this session). No table in the repo has ever had selection enabled. Use RESEARCH § Code Examples + the TanStack 8.21.3 type surface; the only in-repo asset is the already-inert `data-state={row.getIsSelected() && "selected"}` on all three tables. |
| The floating bulk action bar's layout contract (`fixed inset-x-4 bottom-4 z-30 mx-auto w-fit max-w-[calc(100%-2rem)]` + `flex-wrap` + `h-20` spacer) | component | — | The only fixed bottom element in the repo is `shortcuts-hint.tsx:33`, which is full-bleed `bottom-0 left-0 right-0 z-50` with no wrap requirement and no spacer. Take the `return null` and two-div structure from it; the wrap/max-width/spacer contract is new and comes from UI-SPEC § Surface 3. **And resolve the `z-50` collision** (§ 12). |
| `indeterminate` / `aria-checked="mixed"` rendering | component (primitive) | — | Zero occurrences of `indeterminate` under `src/`. The Radix `CheckedState` API supports it; the visual branch is new code with no precedent to copy. |

Everything else in the phase has a concrete in-repo analog above.

---

## Metadata

**Analog search scope:** `src/lib/{trash,mutations,export,audit,events,bulk}`, `src/app/{organizations,people,deals,activities,trash,admin/export,api/v1/*/batch}`, `src/components/{ui,bulk,keyboard,custom-fields/__tests__}`, `src/messages`, `src/app/layout.tsx`
**Files read (full or targeted ranges):** 33
**Analog searches run:** 12 greps (`rowSelection`, `indeterminate`, `fixed bottom-`, `role="region"`, `variant="destructive"`, `ownerId !== session.user.id`, `MAX_BATCH_SIZE`, `REQUIRED_*_KEYS`, `readTrashRetentionDays`, `ENTITY_TO_TRASH_TAB`, `Toaster`/`ShortcutsHint`, `@/components/ui/alert`) + 1 byte-diff (`organizations/data-table.tsx` vs `people/data-table.tsx`)
**Project instructions:** no `./CLAUDE.md`, no `.claude/skills`, no `.agents/skills` in this repo (re-verified 2026-08-17) — global user instructions and project memory govern
**Pattern extraction date:** 2026-08-17
