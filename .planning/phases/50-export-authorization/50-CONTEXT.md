# Phase 50: Export Authorization - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — three decisions taken by the user

<domain>
## Phase Boundary

A non-admin cannot walk the customer table out of the product through a filter that narrows nothing.

Requirement: **SEC-03**. One guard and one decision — and the roadmap is right that the decision is
the work.

**Out of scope:** everything in Phases 51-54; the `/api/v1` authorization surface (Phase 48); the
mutation layer (Phase 49); and **SEC-49-D** (`POST /api/upload` has no ownership check or containment)
which is recorded with its own owner and must not be absorbed here.

</domain>

<decisions>
## Implementation Decisions

### The fix: a MINIMUM SELECTIVITY RULE (user decision, 2026-08-27)

Refuse when the result exceeds a fraction of the live table.

- **Why this and not the other two candidates.** It is the only one that satisfies SC-1 and SC-2
  *together*, because it is the only one that distinguishes a narrow export from a broad one. A
  non-admin row cap is an absolute bound where the requirement is relative — set it low and legitimate
  mid-size exports break, set it at 10,000 and 22% of the customer table still walks out.
- **SC-2 rules the pure admin gate OUT.** "A legitimately narrow export still completes for the same
  non-admin, so the fix is a bound and not a removal of the feature." Restoring Phase 38's admin gate
  removes the feature for non-admins; it cannot satisfy SC-2. State this in the plan rather than
  leaving a reader to wonder why the third candidate was dropped.
- **`MAX_EXPORT_FRACTION` must be a tunable with a recorded measurement behind it, not a guess.**
  Phase 46's `BATCH_SIZE = 200` is the cautionary analog — its own comment admits it "has not been
  measured" and was "chosen to keep one batch well under a second of database work rather than from a
  measurement." Do not add a second such number. Measure, and record what the measurement was.
- **The refusal must carry the numbers** (`matched`, `total`) so SC-3 is satisfiable with an actionable
  message rather than a generic one. Phase 40 already had to reword this string once — its verifier
  found `views.export.disabledReason` said "Choose at least one filter first. An unfiltered export
  isn't allowed." in the one case the narrowing exists for, and G-2 was closed by rewording. Do not
  regress that.
- **Admins are unaffected**, which is what makes SC-2 provable at all: the same broad export that a
  non-admin is refused must still complete for an admin, or the rule is a feature removal wearing a
  guard's clothes.

### Absorb `formatters-live.test.ts` (user decision, 2026-08-27)

Make its 24 tests runnable in CI as part of this phase.

- They guard the exact path this phase changes. A phase that bounds exports while leaving its own
  formatter tests unrun proves less than it could.
- **This is the same defect class the milestone exists to remove, in its purest form.** Phase 40's
  verifier put it exactly: "This is the same disease phases 42 and 43 kept finding (a check that
  cannot fail), in its purest form: **a check that never runs at all.**" The file reports as 24
  skipped inside the suite; CI never runs it because CI has no `DATABASE_URL`. So the milestone's
  headline pass count says nothing about the export path.
- Its own header records that it exists because a wholly-mocked suite once passed a malformed drizzle
  fragment in Phase 37 — **the risk it guards is real and has materialised before.**
- Phase 40 declined it as "an infrastructure decision, not a drive-by edit on the last day of a
  milestone." That reasoning was sound then and does not apply now: this is the start of a phase whose
  subject is that very path.

### The v1.3 override: judged from the documents, not from intent (user asked me to judge)

**It was a knowing, documented acceptance on both sides — NOT an override of a blocking finding, and
the ROADMAP's own history note was inaccurate.** Corrected in place in `.planning/ROADMAP.md`.

- Phase 40's verifier did **not** call the export exposure blocking. G-3 reads: *"G-3 asked for them to
  be tracked somewhere a later reader will look, not fixed — that is satisfied. WR-04 remains a real
  open exposure."*
- The blocking-flavoured language belonged to a **different** item, the unrun `formatters-live.test.ts`
  — and even there the verifier declined to block.
- The v1.3 audit enumerated **both** at ship time with the measurement, as known gaps 2 and 3.

**No re-litigation of v1.3 is owed.** The lesson worth carrying is narrower and more useful: a roadmap
can misdescribe its own history in the direction of drama, so check a history claim at source before
building a phase on it.

### Claude's Discretion

- Where the selectivity check lives relative to `guardExportInput` (it is currently a **synchronous
  pure function** and the check needs a count, so something has to give — say what and why).
- How `total` is obtained per entity type, and whether it is cached or read per attempt.
- The shape of the refusal payload and how it reaches the UI string.
- How CI gets a database for `formatters-live.test.ts`, and whether that file stays a separate project
  or joins an existing one.

</decisions>

<code_context>
## Existing Code Insights

### The defect, read directly

`src/lib/export/view-export-guard.ts` — 139 lines. `guardExportInput` is the whole guard:

```ts
export function guardExportInput(input: { entityType: ViewEntityType; filters: FilterParamSource }): ExportGuardResult {
  const picked = pickFilterParams(input.entityType, input.filters)
  if (!hasExportableFilter(input.entityType, picked)) {
    return { ok: false, error: "refused" }
  }
  return { ok: true, filters: toExportFilters(picked) }
}
```

**The presence of a filter is treated as authorization.** No admin branch, no selectivity rule, no
cardinality check. `search=a` is a filter, so it passes.

### Measured on the live database, 2026-08-27 (re-measured per SC-1's instruction)

| measure | value |
|---|---|
| `organizations` live | **46,054** |
| matching `name ilike '%a%'` | **44,254** |
| fraction | **96.1%** |

The figure is unchanged from what Phase 40 recorded, so SC-1's scale claim still holds.

### `EXPORT_ROW_CAP = 50_000` is a VACUOUS GUARD and has never fired

`src/lib/export/view-export-guard.ts:45`. Organizations are 46,054 and people 38,348 — the cap sits
**above every entity's entire table**, so it cannot fire for any of them. It is a guard that cannot
fail, sitting in the file this phase is about. Name it; do not quietly rely on it.

### Established patterns to reuse

- **The admin idiom is `row.ownerId === viewer.id || viewer.role === "admin"`** — see
  `src/lib/views/write-guards.ts:235` and `src/lib/notes/authorize.ts:53`. Note
  `write-guards.ts:242` documents a deliberate DEPARTURE from it for view visibility, and
  `src/lib/bulk/dispatch.ts:24` documents the asymmetry across the bulk actions. Read those before
  choosing a spelling, and do not invent a fourth.
- **`requireScopedPredicate`** (`src/lib/api/stage-scope.ts`) — but note **SEC-49-B**: it is silent
  when a 3-term predicate loses its owner term, because `MANDATORY_SCOPE_TERMS` is 2 and 2 is not
  `< 2`. A count cannot verify identity. Do not lean on it as a backstop.
- **`src/lib/api/db-errors.ts`** — SQLSTATE → clean 4xx, with a `.cause` walk bounded at 5 that fails
  safe. Reuse rather than re-handling raw `PostgresError`s.
- **The db-test harness** — `mintApiKey` (`src/app/api/v1/__tests__/api-key-fixture.ts`) and
  `mintFieldDefinition` / `removeFieldDefinitions`
  (`src/lib/__tests__/custom-field-definition-fixture.ts`). Seven behavioural proofs now share the
  shape; `49-PATTERNS.md` lists its load-bearing parts.

### Integration points

- `src/lib/export/view-export-guard.ts` — the guard.
- `src/lib/export/formatters-live.test.ts` — 24 tests, currently skipped in every run.
- `src/messages/en-US.json` (`views.export.disabledReason`, plus `pt-BR` and `es-ES`) — **any new
  locale key must be added to the matching `REQUIRED_*_KEYS` array in the same commit**; those
  contracts use an exact `toEqual`.
- **The Phase 38 bulk export actions write NO audit row at all** — only the view path is instrumented.
  SC-5 says the audit row must still record the exports that do complete; check whether the bulk path
  needs one, and if it is out of scope, say so rather than letting SC-5 read as covering both.

</code_context>

<specifics>
## Specific Ideas

- **SC-4 is the criterion most likely to be faked, and it is explicit about it:** *"widen a filter step
  by step until it trips, and observe the refusal at the boundary. A guard whose threshold nobody has
  crossed on purpose is not a guard."* A single at-the-boundary assertion is not enough; the boundary
  must be *approached* and crossed.
- **SC-1 says "measured against the live database at that scale, not against a fixture, and
  re-measured at plan time."** I re-measured at discuss time (above); the plan must re-measure again
  rather than inherit my number.
- The milestone's one rule, which this phase inherits with force given what it is fixing: **break your
  own gate on purpose and watch it go red before you trust it.** v1.3 shipped six gates that could not
  fail; v1.4 has now found nineteen more — eight of them found by Phase 49's own plans auditing their
  own specifications, three more by its fix pass. A gate with no recorded red observation is treated as
  NOT DELIVERED at sign-off.
- Prefer behavioural and parsed-structure assertions over raw-token greps: the comment explaining a
  rule trips that rule's own grep gate, fifteen times in this project.

</specifics>

<deferred>
## Deferred Ideas

Adjacent and explicitly NOT this phase's work:

- **SEC-49-D** — `POST /api/upload` authorizes on `session?.user` alone, with no entity resolution and
  no path containment; `entityId = "../../.."` resolves to `/app`. No test drives that route. Its own
  owner; do not absorb.
- **DEF-49-07** — the owner-model reconciliation (what "may see this record" means). Flagged as needing
  scheduling **before** any further work on `file-access.ts`.
- **DEF-49-08** — `organizations`/`activities` still ship the pre-recalc blob in the canonical-read
  fallback.
- **DEF-49-09** — the merge no longer moves attachments and the UI does not say so.
- **SEC-49-A** (S3 reads bypass the app), **SEC-49-B** (`requireScopedPredicate` silent at 3+ terms),
  **SEC-49-C** (`activities/[id]` answers 403 where siblings answer 404), **DATA-49-A** (the
  canonical-read decision is unenforced, inherently).
- **SEC-47-A** — `src/lib/email/client.ts:20` sets `tls: { rejectUnauthorized: false }`
  unconditionally. Still the largest single exposure in the backlog.
- **DEF-48-05 / SEC-48-C**, **DEF-48-06 / IMP-48-A**, **TS-48-A**, **DOC-48-01**, **SEC-48-D**'s relay
  half.
- `delete-entity-files.ts:129-132` counts an already-absent file as *deleted*, which makes the
  mismatch log unusable as a test observable.

</deferred>
