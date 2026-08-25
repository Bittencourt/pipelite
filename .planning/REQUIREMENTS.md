# Requirements: Pipelite — v1.4 Debt Paydown

**Defined:** 2026-08-24
**Core Value:** API-complete CRM core that handles fundamentals well — pipelines, orgs, people, deals,
activities, and custom fields. Advanced features can be built externally via the API.

> **Every requirement below is remediation.** v1.4 adds no new user-facing capability, by decision.
> Each requirement maps 1:1 to a seeded item in `ROADMAP.md` § *v1.4 seed*, whose evidence — measured
> against the tree at `a58b9e1` on 2026-08-24, not copied from a document — lives in `BACKLOG.md`
> under the ID in the **Source** column.
>
> **Two conventions that apply to every requirement here**, because v1.4 exists partly because they
> were not followed:
>
> 1. **A gate must be observed failing before it is trusted.** v1.3 shipped six gates that could not
>    fail. Where a requirement below names a gate, the gate is not done until someone has broken the
>    thing on purpose and watched it go red.
> 2. **Behavioural proof and source proof are not interchangeable.** `F-39-07` was reproduced inside
>    the very suite Phase 45 built to prevent it, because that suite asserted the page did not scroll
>    sideways rather than that the button could be clicked.

## v1.4 Requirements

### Deployment — the product can be installed from its own repository

- [ ] **DEPLOY-01**: A self-hoster can build a working database from the migration chain alone —
      `drizzle-kit migrate` against an empty database completes and produces the full schema.
      *Source: `MIG-01`. Today it dies `42P01` at `0006` (`ALTER TABLE "import_sessions"`) and, because
      the run is transactional, leaves **0 tables**. No migration creates `import_sessions`; it arrived
      via `db:push`. Gate: a CI job or documented script that migrates a throwaway database from
      scratch — the only check that can catch a recurrence.*
- [ ] **DEPLOY-02**: The documented migrate command works from the host without an inline override.
      *Source: `999.20`. `.env.local:1` points at `localhost:5432`; Postgres publishes on **5433**.
      Every phase since 33 that ran a migration paid a manual workaround.*
- [ ] **DEPLOY-03**: The container's base image satisfies the toolchain's declared engines floor and
      cannot silently drift below it. *Source: `999.14`. `node:20-alpine` is pinned at all three build
      stages; `vite@7` declares `^20.19.0 || >=22.12.0`. Latent, not broken — CI pins Node 24
      independently, which is why nothing has failed.*

### Security — every route authorizes, and a delete deletes

- [ ] **SEC-01**: A user cannot read, modify or delete another user's activity through the REST API,
      and the list endpoint returns only activities they may see. *Source: `999.17`. GET/PUT/DELETE on
      `/api/v1/activities/[id]` and GET on `/api/v1/activities` perform **no ownership check**;
      the PUT can reassign `owner_id`. These route files have **zero test coverage**, so tests ship
      with the fix.*
- [ ] **SEC-02**: A stage's legitimate owner can read it without passing `?expand=pipeline`.
      *Source: `999.15`. The GET builds `withOptions` as `undefined` unless expand is requested, so the
      relation the ownership check reads is never loaded and the owner gets a 403. The file's own
      `ownershipWith` helper already does this correctly for PUT/DELETE.*
- [ ] **SEC-03**: A view export cannot return substantially the whole table to a non-admin.
      *Source: `WR-04`. `search=a` still matches 44,254 of 46,054 organizations (96.1%) under
      `EXPORT_ROW_CAP = 50_000`. Phase 38 gated this behind admin; Phase 40 Decision 2 removed the
      gate and replaced it with a refuse-empty-filters rule, which a filter that narrows nothing
      satisfies. **This needs a decision, not a patch** — minimum selectivity, a lower non-admin cap,
      or restoring the admin gate. The existing audit row makes exports attributable, not bounded, and
      does not close this.*
- [ ] **SEC-04**: A purged record's uploaded files are unreachable — removed from storage, and not
      served even while they exist. *Source: `CR-01`. Blobs survive purge, and
      `api/files/[entityId]/[fieldName]/[filename]` authorizes on `session?.user` alone with no record
      lookup, so anyone who held the URL can still download them — and the URL is recoverable from the
      audit tombstone indefinitely. The route fix alone closes the exposure even before blob deletion
      lands; order it first. Blob deletion must run **post-commit**, so a storage failure cannot roll
      back a committed purge.*
- [ ] **SEC-05**: The committed lockfile's advisories are triaged, and CI has a stated audit policy.
      *Source: `999.16`. 4 critical / 22 high as of 2026-08-24. Re-measure at plan time — the count is
      not the requirement, the decision is.*

### Performance

- [ ] **PERF-01**: Opening the busiest pipeline board does not load or render every deal on it.
      *Source: `PERF-01`. 15,415 deals on Closer, ~88 s to first paint, roughly linear at 5.7 ms/deal.
      Needs per-column pagination; note the board is the `@dnd-kit` drag surface and a sortable context
      must know every item it can reorder, so this is not a drop-in virtualisation.*

### Interface — controls are reachable, and displayed numbers are true

- [ ] **UX-01**: A user at a 320px viewport can reach and activate the primary control of any dialog
      or popover. *Source: `F-39-07` + the `popover.tsx` entry. `dialog.tsx` and `popover.tsx` both
      have **zero** height clamps; the org create dialog renders 940px tall in a 640px viewport with
      nothing to scroll. **`viewport-320.spec.ts` must gain a clickability assertion** — it currently
      asserts only `scrollWidth <= clientWidth`, which is why Phase 45's 320px pass shipped green over
      this. Blast radius is `DialogContent`, a primitive behind ~16 dialogs.*
- [ ] **UX-02**: Pressing Enter on a focused control inside a modal does not navigate the list behind
      it or discard the draft. *Source: `F-39-08`. Six surfaces. `data-table-keyboard.tsx` registers
      `useHotkeys("enter", …, { preventDefault: true })` with no ref and `isFormFocused` exempts
      INPUT/TEXTAREA/SELECT but not BUTTON. **The failing assertion is already in the suite** as
      `test.fail()` at `e2e/saved-views-320.spec.ts:980` — delete the marker in the same commit as the
      fix, or the suite goes red on success. The obvious `stopPropagation` one-liner is wrong: it also
      kills Radix's Escape handling.*
- [ ] **UX-03**: The `/activities` summary counts state the truth, or state what they are counting.
      *Source: `STATS-01`. Unfiltered it asserts `Pending: 0` / `Overdue: 0` when the truth is 14 and
      4,151; `Completed: 50` is the page cap. Counts must be computed server-side — do not derive a
      total by summing what is on the page.*

### Data correctness

- [ ] **DATA-01**: A merge leaves the survivor's formula fields consistent with its post-merge values.
      *Source: `FORM-01`. An ordinary edit recalculates; a merge calls only `recalcReparentedChildren`
      and never recalculates the survivor, even though it writes the survivor's field values from the
      user's merge choices. **Dormant at 0 `type='formula'` definitions** — verify that count still
      holds at plan time. Must run post-commit: `recalculateFormulas` uses the module-level `db` and
      cannot take a `tx`.*
- [ ] **DATA-02**: A create response carries the same field values a subsequent read would.
      *Source: `999.23`. POST returns the raw `.returning()` row, so the 201 body carries the
      un-computed custom-field blob. Stored value, `crmBus` event and GET are all correct; PUT has no
      such gap. Decide once for all four entities. Note two plan 34-02 fixture assertions compare
      against the current shape and will need amending in the same commit.*
- [ ] **DATA-03**: An imported Pipedrive stage carries its real type rather than a hardcoded default.
      *Source: `999.19`. `pipedrive-api-transformers.ts:167` reads `const type = "open"` under a comment
      promising a `rotten_flag`/`deal_probability` mapping that was never written. This is a product
      decision about stage semantics, not a mechanical fix.*

### Workflow usability

- [ ] **WF-01**: An operator can select a custom field for a workflow condition without hand-typing
      its name. *Source: `999.21` + `999.22`. The engine was fixed in 34-12 — bracket-quoted paths
      parse — but nothing in `src/app/workflows/` emits that syntax, so **152 of 169 live definitions
      (90%)** remain effectively unreachable; this dataset's names are Portuguese with spaces and
      punctuation. Also unsupported: escaping inside brackets, so a name containing both quote
      characters is unaddressable (no live definition hits this today).*

### Quality gates — a gate that cannot fail is not a gate

- [ ] **QG-01**: No test asserts on wall-clock time in a way that fails under parallel workers.
      *Source: `999.28` **and `D-45-01` — one item, not two.** `condition-evaluator.test.ts` (T-34-20)
      asserts a wall-clock ratio and failed twice in Phase 44's parallel waves (once as `25.5 < 10`);
      `toggle.test.ts:61` times out its `beforeEach` in 2 of 5 runs. Phase 45 explicitly said to fix
      the two together and not to chase either per-phase. Assert operation counts or algorithmic
      shape, or mark serial-only.*
- [ ] **QG-02**: The `react-hooks` rules pass without suppressions in the six sites that carry them.
      *Source: `999.13`. **Re-derive the set with `grep -rn 'eslint-disable-next-line react-hooks/' src/`
      — do not trust the Suppression Register in `32-04-SUMMARY.md`, which is out of date.** The set
      drifted: `import-wizard.tsx:91` is gone, and `entity-combobox.tsx:96` and
      `webhook-response-config.tsx:39` are new. Each is behaviour-adjacent, which is why none was
      mechanically fixed inside an infrastructure phase — this needs UI test coverage.*
- [ ] **QG-03**: No query builds a SQL `IN` clause by interpolating a JavaScript array.
      *Source: `999.18`. `stages/route.ts:73` uses ``sql`${pipelines.id} IN ${pipelineIds}` `` instead
      of `inArray()`. Unreachable today because `stageList` is guarded non-empty; a future refactor
      removing that guard turns it from awkward into broken.*

## Future Requirements

Deferred, recorded in `BACKLOG.md` as **recorded** rather than promoted. Real, but not v1.4 scope.

### Interface polish

- **`D-45-02`**: The fixed `ShortcutsHint` bar occludes actionable controls — clips *Back to App* at
  1280x900 and covers *"Guardar período de retención"* at 320px in es-ES. Phase 38's `h-40 sm:h-20`
  spacer is the known remedy; validate in es-ES, where the bar wraps.
- **`D-45-04`**: The admin drawer has no swipe-to-dismiss. Radix `Dialog` has no gesture layer and
  `vaul` is not a dependency, so this is an unimplemented capability, not a regression. **The
  actionable half is a document fix:** `45-VALIDATION.md` tells a human tester to verify a behaviour
  the primitive cannot perform. Correct that row whether or not swipe is ever built.
- Two list surfaces (`deals/deal-filters.tsx`, `deals/kanban-board.tsx`) are not internationalised —
  23 hardcoded strings, plus five unlabelled icon-only chip buttons.
- `F-39-04`: `ProgressBar` has no `role="progressbar"` / `aria-valuenow`.
- `F-39-06`: dark-mode `text-primary` links measure `lab(90.9)` against a `lab(98.3)` foreground.

### Reliability and tooling

- The hydration mismatch (React #418) on `/people`, `/organizations` and `/activities` that can
  swallow a click.
- `formatters-live.test.ts` — 24 tests CI never runs, so the export path it guards has no automated
  proof. **Related to SEC-03 and worth pairing with it**, since both concern the export path.
- Scan-guard atomicity — needs a partial unique index (migration 0018 already exists; renumber).
- e2e auth setup: the first login after a container restart exceeds the 30 s timeout (30.1 s cold,
  1.9 s on retry).
- `ICU_PLURAL_KEYS` has no completeness gate — derive it rather than adding entries by hand.
- Consolidating the four copies of the CSV download idiom, which requires amending a Phase 38 gate
  that asserts the literal `URL.createObjectURL` appears in `bulk-action-bar.tsx`, in the same commit.
- Three private brace/tag walkers, one (`extractToolbarRegion`) carrying a latent self-closing-tag bug
  already fixed in `source-scan.ts`.
- `setViewDefault` returns `forbidden` where its WR-01-fixed siblings return `failed` — same
  exists-vs-not disclosure, one call site.
- `replay.confirmBody` over-states a dry-run replay's consequences; `audit.run.action.merged` is
  untranslated but reachable through an exhaustive `Record<AuditAction, …>`.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Any new user-facing capability | v1.4 is a trust milestone by decision. `MIG-01` means the product cannot be installed from its repository; building on that compounds it |
| Admin visibility into private saved views | Recorded in `BACKLOG.md` as **accepted**. Phase 40 Decision 3 broke the `owner \|\| admin` idiom deliberately — private an admin can read is not private. The consequence (a soft-deleted user's views outlive every actor who can act on them) is documented, not a defect |
| Widening `hasExportableFilter` so a `pipeline`-only `/deals` view is exportable | Recorded as **accepted**. 25,195 deals across 11 pipelines, so a board selector alone scopes an export to as many as 15,415 rows — the unbounded export `38-CONTEXT.md` forbids. If revisited, the change is a row cap or a background job, never a wider whitelist |
| Scrubbing a dead `view=<id>` from the URL on `/deals` and `/activities` | Cosmetic. `withViewEscape` runs client-side with no view list and cannot know an id is unresolvable; fixing it means threading `selectedViewId` into two more components |
| Correcting the locale-parity figures in `40-UI-SPEC` M-13 / `40-CONTEXT` A5, and V-9's wrong helper name | Document drift in **archived** artifacts. The live file wins over every document and says so itself; "correcting" the file to match the docs turns two tests red |
| Free-form canvas editor, AI/LLM agent nodes, native integration nodes, multi-tenancy, mobile app | Unchanged from v1.0–v1.3 |

## Traceability

Which phases cover which requirements. Filled in during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEPLOY-01 | TBD | Pending |
| DEPLOY-02 | TBD | Pending |
| DEPLOY-03 | TBD | Pending |
| SEC-01 | TBD | Pending |
| SEC-02 | TBD | Pending |
| SEC-03 | TBD | Pending |
| SEC-04 | TBD | Pending |
| SEC-05 | TBD | Pending |
| PERF-01 | TBD | Pending |
| UX-01 | TBD | Pending |
| UX-02 | TBD | Pending |
| UX-03 | TBD | Pending |
| DATA-01 | TBD | Pending |
| DATA-02 | TBD | Pending |
| DATA-03 | TBD | Pending |
| WF-01 | TBD | Pending |
| QG-01 | TBD | Pending |
| QG-02 | TBD | Pending |
| QG-03 | TBD | Pending |

**Coverage:**
- v1.4 requirements: 19 total
- Mapped to phases: 0 (roadmap not yet created)
- Unmapped: 19 ⚠️

**Sequencing constraint for the roadmapper.** `DEPLOY-01` should land first. Until a fresh database
can be built from migrations, no later phase can verify itself against a clean database — which is
exactly the position Phase 39 was in when it had to provision its test database from a
`pg_dump --schema-only` instead. This mirrors v1.3's own "CI lands first" note, and for the same
reason.

---
*Requirements defined: 2026-08-24*
