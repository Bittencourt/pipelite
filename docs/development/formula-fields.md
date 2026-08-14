# Formula Fields

Formula fields are custom fields whose value is **computed by the server** from other fields on the
same row, or from a parent row, every time something they depend on is saved. This document
describes how a formula value is produced, the vocabulary a formula may reference, the bounds the
recalculation runs under, and — at least as importantly — the things this system deliberately does
**not** do.

The engine itself (`src/lib/formula-engine.ts`) evaluates expressions in a QuickJS WASM sandbox and
is treated as frozen. The recalculation orchestration lives in `src/lib/formula-recalc.ts`.

---

## How a Formula Value Is Produced

A formula value is stored in the entity's `custom_fields` JSONB column as a **wrapper object**:

```jsonc
{
  "Margin": { "formula": true, "value": 1035, "error": null }
}
```

On failure the same shape carries the error and a `null` value:

```jsonc
{
  "Margin": { "formula": true, "value": null, "error": "Unknown field: Cost" }
}
```

Four properties of this pipeline are load-bearing:

1. **The server is the sole writer.** Every write path strips formula-typed keys out of
   caller-supplied `custom_fields` before persisting (`stripFormulaKeys`). An API client or a
   browser cannot hand-write a value into a derived field; whatever it sends is discarded and
   overwritten by the computed result.
2. **The browser keeps a live preview, and it is not the source of truth.**
   `src/components/custom-fields/formula-field.tsx` still evaluates as you type so the UI feels
   immediate. It reads the stored wrapper when one is present and only re-evaluates otherwise.
3. **Recalculation is synchronous, in the same request as the save.** It runs immediately after the
   entity row is written, so a `GET` issued right after a save reads the recomputed value from the
   database (D-01).
4. **Recalculation completes strictly before the CRM event is emitted.** The webhook body
   (`src/lib/events/subscribers/webhook.ts`) and the workflow trigger envelope
   (`src/lib/triggers/matcher.ts`) are both **emit-time snapshots of the row object** — they do not
   re-read the database. If the recalculation ran after the emit, the database row would be right
   while every webhook and every workflow saw the stale value (D-17).

Recalculation is also **dependency-scoped**: a save whose changed fields intersect no formula's
reference set performs zero evaluations, issues zero child queries and writes nothing. That is not
an optimisation, it is a requirement (FORMULA-02).

---

## Referencing Fields

Use `{{Field Name}}` to reference a custom field on the same entity. Field names are used verbatim,
including spaces and accents: `{{Consumo Médio em MWh}}` is a valid reference.

The function library (`MATH`, `TEXT`, `DATE`, `LOGIC`) is defined in `FORMULA_FUNCTIONS` in
`src/lib/formula-helpers.ts` and surfaced in the authoring dialog; it is not restated here.

### Native attributes

Formulas may also reference the entity's native (non-custom) columns. The vocabulary is defined
once, server-side, in `ENTITY_NATIVE_ATTRIBUTES` (`src/lib/formula-recalc.ts`):

| Entity | Referenceable native attributes |
|---|---|
| `deal` | `Value`, `Title`, `Notes`, `ExpectedCloseDate` |
| `organization` | `Name`, `Website`, `Industry`, `Notes` |
| `person` | `FirstName`, `LastName`, `Email`, `Phone`, `Notes` |
| `activity` | `Title`, `Notes`, `DueDate`, `CompletedAt` |

Activities had **no** referenceable native attributes before this vocabulary existed, which made
activity formulas nearly useless; the four above were added deliberately.

---

## Cross-Entity References

A formula on a child row may reference a field on its parent using a dot-prefixed reference:

```
{{Organization.Industry}}
{{Person.Email}}
{{Deal.Value}}
```

**Full entity names only.** The accepted prefixes are exactly `Organization`, `Person` and `Deal`
(`FORMULA_ENTITY_PREFIXES`). There is no short alias:

```
{{Org.Name}}   ->   { "formula": true, "value": null, "error": "Unknown entity: Org" }
```

This is a **permanent formula-language API**. A full entity name never needs disambiguating as more
entity types appear, and renaming a prefix later would break every authored formula. An unknown
prefix is not special-cased anywhere — it falls through to the engine's own `Unknown entity: X`
error, which is then stored as a visible error on the field.

### What cascades

Saving a **parent** refreshes the dependent child rows whose formulas reference the field that
changed. Four directions are supported, all backed by real foreign keys and by indexes added in
Phase 33:

| Parent save | Refreshes | Child formula prefix |
|---|---|---|
| `organization` | its `deals` | `{{Organization.…}}` |
| `organization` | its `people` | `{{Organization.…}}` |
| `person` | its `deals` | `{{Person.…}}` |
| `deal` | its `activities` | `{{Deal.…}}` |

`activity` is a leaf — nothing cascades from it.

> **Cross-entity formulas did not work at all before this system existed.** The engine has always
> accepted a `relatedEntities` argument, but no caller ever populated it, so every dot-reference
> resolved to `Unknown entity`. If you find an old expression using `Org.`, it has never produced a
> value.

---

## Formula-to-Formula Chaining

A formula may reference another formula field on the same entity. `{{Margin}} * 2` where `Margin`
is itself a formula works: the stored wrapper is unwrapped before evaluation, and formulas are
evaluated in **topological order**, so a dependency is always computed before its dependent and the
dependent reads the fresh value rather than the previously stored one.

Cycles are detected (reusing `detectCircularDependency` from the engine) and store
`Circular dependency detected` rather than hanging. Detection is deliberately conservative: a
formula that merely *reaches* a cycle also stores the circular error, rather than a garbage value
computed from a partially-evaluated chain.

---

## Bounds

Every recalculation runs under three independent limits.

| Bound | Value | Constant |
|---|---|---|
| Cascade depth | 1 hop | `CASCADE_DEPTH` |
| Total evaluations per save | 500 | `FORMULA_EVALUATION_BUDGET` |
| Memory per evaluation | 8 MiB | `FORMULA_EVAL_MEMORY_LIMIT_BYTES` |
| Wall-clock per evaluation | 500 ms | `FORMULA_EVAL_TIMEOUT_MS` |

`FORMULA_EVALUATION_BUDGET` is **500**, and the arithmetic behind it should survive future
"optimisation":

- A single evaluation costs **0.876 ms measured inside the Docker container** (1.195 ms on the
  host). 500 × 0.876 ms = **438 ms**, comfortably inside the ~2000 ms a synchronous save can absorb.
- It admits the entire measured single-hop worst case. The largest organization in the live dataset
  has **114 deals and 10 people** = 124 child rows; even four formulas each is 496 evaluations.
- It rejects the two-hop case (organization → deals → activities, ~626 evaluations, ~750 ms) by
  construction, through `CASCADE_DEPTH`.
- A row-count cap would be strictly worse — it does not scale with formulas per entity, so
  200 rows × 5 formulas = 1000 evaluations would slip straight through it.

`CASCADE_DEPTH = 1` is enforced **structurally**, not by a counter: cascaded children are
recalculated by a function that contains no cascade step, so a second hop is unreachable rather
than merely unintended.

When the evaluation budget is exhausted, a single `console.warn` with a `[formula-recalc]` prefix
names the parent entity type and id, the child entity type, and how many children were skipped —
enough to diagnose from logs without a reproduction. The skipped rows keep their previous values
and self-heal on their next save.

The database is not the bottleneck. All four reverse lookups are index-backed and `EXPLAIN`-verified
at 0.909 ms for the worst-case 114-row fetch. QuickJS is.

The 8 MiB / 500 ms per-evaluation bounds matter more than they look: `evaluateFormula`'s resource
limit is an **opt-in argument and is inert unless passed**. A `while(true)` expression does not
merely time out — synchronous WASM blocks the event loop, so a Node worker is wedged with no
timeout able to reclaim it. Every server-side evaluation in this system flows through a single call
site that passes the bounds; do not add a second one that omits them.

---

## Errors

A formula that fails **stores its error and lets the save succeed** (D-05). A broken
admin-authored formula must never block a user's edit.

- The error string is **sanitised**: first line only, capped at 200 characters
  (`FORMULA_ERROR_MAX_LENGTH`), so no stack trace or database error reaches the stored JSONB or the
  UI.
- The previous value is **replaced, not retained** (D-06). Silently keeping the last good value is
  exactly the staleness this system exists to remove.
- A failed recalculation never fails the enclosing write. Every call site catches, logs with a
  `[formula-recalc]` prefix, and continues.
- A referenced field that exists but has never been filled in evaluates to **blank, not an error**.
  Field values are seeded with `null` for every active definition before evaluation; without that
  seeding roughly 90% of rows would store a fabricated `Unknown field:` error.

---

## Write-Path Coverage

Seventeen server-side write paths can change a field a formula reads. All seventeen are accounted
for; the table below is the condensed audit (verified by source inspection).

| # | Write path | Disposition |
|---|---|---|
| 1 | `POST /api/custom-fields/save` → `saveFieldValues` | **Covered** — `src/lib/custom-fields.ts` |
| 2 | Entity server actions ×4 | **Covered transitively** — they delegate 100% to the mutation layer |
| 3 | Mutation layer create ×4 | **Covered** — `create{Deal,Person,Organization,Activity}Mutation` |
| 4 | Mutation layer update ×4 | **Covered** — `update{Deal,Person,Organization,Activity}Mutation`, plus `updateDealStage`, `reorderDeals`, `toggleActivityCompletion` |
| 5 | `POST /api/v1/deals` | **Covered** — direct call |
| 6 | `PUT /api/v1/deals/[id]` | **Covered** — direct call |
| 7 | `POST /api/v1/people` | **Covered** — direct call |
| 8 | `PUT /api/v1/people/[id]` | **Covered** — direct call |
| 9 | `POST /api/v1/organizations` | **Covered transitively** — `createOrganizationMutation`, no direct write |
| 10 | `PUT /api/v1/organizations/[id]` | **Covered transitively** — `updateOrganizationMutation`; the route's second write was removed |
| 11 | `POST /api/v1/activities` | **Covered transitively** — `createActivityMutation`, no direct write |
| 12 | `PUT /api/v1/activities/[id]` | **Covered** — direct call |
| 13a | `POST /api/v1/deals/batch` | **Covered** — one shared budget across the request |
| 13b | `POST /api/v1/people/batch` | **Covered** — one shared budget across the request |
| 13c | `POST /api/v1/organizations/batch` | **Covered transitively** — per-item mutation |
| 14 | CSV importer | **Covered** for all four entity flows; see the auto-created-row gap below |
| 15 | Pipedrive API importer | **Covered** for all four entity blocks plus its auto-created stubs |
| 16 | Workflow `crm_action` node | **Covered transitively** — dispatches to mutations, no direct write |
| 17 | `POST /api/internal/email/process` | **Out of scope** — writes only `reminderSentAt`, which is absent from `ENTITY_NATIVE_ATTRIBUTES.activity` and is not a custom field, so no formula can reference it |

Soft-delete paths (mutation deletes and the three v1 `DELETE` handlers) deliberately do not
recalculate — see the limitations below.

---

## Known Limitations

These are deliberate boundaries, not defects. Read them before concluding something is broken.

**No backfill.** The database held **0 formula definitions and 0 stored formula values** across all
189,000 CRM rows when this system was built. When an admin authors the first formula field, existing
rows show blank for it **until each row is next saved**. There is no backfill job and no read-time
recalculation; a blank formula column on old rows is expected behaviour.

**`multi_select` arithmetic string-concatenates.** `multi_select` values are stored as arrays, so
`{{Origem}} + 1` where `Origem` is `["Outbound Manual"]` yields the string `"Outbound Manual1"` —
plain JavaScript array-to-primitive coercion inside the sandbox. Changing evaluation semantics is
out of scope; use `TEXT.concat` or index into the array instead. This behaviour is pinned by a test
so it cannot change silently.

**Time-dependent formulas go stale.** `DATE.diffDays(DATE.today(), {{Start Date}})` — one of the
shipped examples — is correct at save time and wrong the next day. No save-triggered recalculation
can fix that. Recalculating on a schedule or on read is deferred.

**Expressions are not validated at authoring time.** `validateFormula` and the `FormulaEditor`
component are dead code; the live authoring dialog writes `{ expression }` with no checks at all.
Every failure mode therefore surfaces as a *stored error on a row* rather than as an authoring-time
rejection. Nothing prevents saving a self-reference or unbalanced parentheses.

**Workflow conditions can address any field name, but nothing generates the syntax.** Condition
paths are resolved by `resolveFieldPath`, which now accepts bracket-quoted segments, so
`trigger.data.customFields["Consumo Médio em MWh"]` resolves correctly. But a dot path against the
same name still splits on `.` and yields `undefined`, and **152 of the 169 live field definitions
have names that require the bracket syntax**. The condition builder UI offers no field picker that
emits bracket paths, so an operator must type the syntax and the exact name — accents included — by
hand. Additionally, a name containing the same quote character used to delimit it cannot be
expressed at all (use the other quote style; a name containing both remains unaddressable). No live
definition currently hits that case.

**A UI custom-field edit fires no webhook and no workflow.** `POST /api/custom-fields/save` has
never emitted a CRM event, and this system did not add one. The stored value is now correct, but no
subscriber is notified. Adding an event would start firing workflows on every custom-field edit — a
side-effecting behaviour change that was deliberately kept out of scope.

**Imports emit no CRM events and run with the cascade disabled.** A 5,000-row import would otherwise
become 5,000 workflow executions. The cascade is off per row for the same amplification reason, and
the whole import run spends **one** evaluation budget rather than one per row.

**The CSV importer's auto-created rows are not recalculated.** When a CSV import encounters an
unmatched organization name or person email, it auto-creates that row (`resolveOrganization`, and
the person auto-create inside `importDeals`). Those rows carry real native attributes (`name`,
`notes`, `firstName`, `lastName`, `email`) that a formula may read, but they are written outside the
batch that gets recalculated, so their formula values stay blank until their first real save.
The Pipedrive importer's equivalent stub rows **are** covered. This is the one place the two
importers differ.

**The CSV export drops every custom column unless the first exported row carries it.**
`exportToCSV` calls `Papa.unparse(data, { header: true })`, and papaparse derives the header from
the **first object only** — any `custom_*` key absent from row 1 is silently omitted from every row.
Measured against the live data: a 46,055-row organization export produced **zero** `custom_*`
columns even though 30,264 of those rows have populated custom fields. This is **pre-existing and
affects all custom fields, not formulas specifically**; the formula unwrapping itself is correct and
verified (the JSON export, which shares `flattenCustomFields` and has no header-derivation step,
carries the scalars faithfully). Until it is fixed, a CSV export is not a reliable way to observe a
formula value.

**Attaching a parent does not refresh cross-entity formulas.** Setting a deal's `organization_id`
changes a foreign key, not a field any formula references, so `{{Organization.…}}` formulas on that
deal stay blank until the parent is next saved or the deal's own referenced fields change. Correct
under the scoping rules, and worth knowing when a newly linked row shows a blank cross-entity value.

**Soft deletes do not recalculate.** A child of a soft-deleted parent keeps its last computed value.
The deleted row is excluded from future cascades, so the child's derived value simply stops being
refreshed until that child is itself saved.

**The cascade ignores ownership.** A save may write formula keys on rows the acting user could not
otherwise edit. This is deliberate: a derived value must be correct regardless of who triggered the
save, and leaving another user's row holding a stale computed value is the exact defect this system
removes. Only keys whose definition type is `formula` are written, only on rows reachable by a real
foreign key from the saved parent, and only one hop out. Phase 36's audit log should attribute these
writes to **the system**, not to the user.

**Recalculation is a second `UPDATE` outside any transaction.** The entity write and the formula
write are two statements. A crash between them leaves the formula value stale until the next save.
Threading a transaction through all seventeen write paths was judged scope creep for no correctness
benefit that a subsequent save does not already provide.

**`POST` responses echo pre-recalculation values.** The four v1 `POST` routes return a 201 body
built before the recalculation, while the `PUT` routes return the post-recalculation value. The
stored row, the emitted event and any subsequent `GET` are all correct. Tracked as backlog 999.23,
to be decided once for all four entities.

**Evaluation results are not memoised.** 114 deals sharing one formula still create 114 sandboxes.
Reusing a single QuickJS context across a batch is a measured ~5× win and is a deliberate deferred
lever, not an oversight.

---

## Backlog Candidates

Surfaced while building this system; listed here so they reach a backlog rather than being
rediscovered. **None of these are acted on by the formula system.**

- `PUT /api/v1/activities/[id]` performs no ownership check (pre-existing IDOR, backlog 999.17).
- `POST /api/custom-fields/save` performs no per-entity ownership check on `entityId`.
- CSV formula injection: a cell value beginning with `=`, `+`, `-` or `@` can execute on open. This
  affects every text column in the export, not only formula fields, and wants a dedicated pass.
- Fix the CSV export header derivation: compute the union of keys across all rows and pass it as
  papaparse's `columns` option, so a custom field present on any row survives the export.
- Wire `validateFormula` into the authoring dialog so a broken expression is rejected at authoring
  time instead of stored as an error on every row.
- Update the authoring help text at `src/app/admin/fields/[entityType]/field-dialog.tsx` to document
  the dot-notation vocabulary. It currently mentions only "Functions: MATH, TEXT, DATE, LOGIC" and
  says nothing about `{{Organization.Field}}`. Deliberately not done here — the field authoring UI
  is out of scope.
- Add a field picker to the workflow condition builder that emits bracket-quoted paths
  (backlog 999.21 / 999.22).
- Extract the ten near-identical `stripCallerFormulaKeys` / `recalcCustomFields` / `recalcBatchRow`
  helper copies scattered across the mutation and route files into one shared module.
- Keep the four detail pages' inline `entityAttributes` maps in sync with the server-side
  `ENTITY_NATIVE_ATTRIBUTES`, or derive them from it.
