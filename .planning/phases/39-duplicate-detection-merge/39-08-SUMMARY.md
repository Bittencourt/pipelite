---
phase: 39-duplicate-detection-merge
plan: 08
subsystem: database
tags: [dedup, app-settings, zod, drizzle, pg-trgm, generated-columns, vitest]

# Dependency graph
requires:
  - phase: 39-05
    provides: "the generated columns `organizations.norm_name`, `people.norm_name` / `norm_email` / `norm_phone`, the btree + trigram indexes over them, and `scripts/dedup-checks.sql` Part 4 — the EXPLAIN'd query shapes this module copies"
  - phase: 39-01
    provides: "`classifyOrganizationMatch`, `classifyPersonMatch`, `isValidMatchEmail`, `normalizeOrgName`, `normalizePersonName`, `isComparableOrgName`, `CREATE_TIME_MATCH_LIMIT`, `DEFAULT_SIMILARITY_THRESHOLD`, `DedupReason`, `MergeableEntityType`"
provides:
  - "`readOrgIdentityFields` / `writeOrgIdentityFields` — the admin-configurable organization identity-field list, fail-closed to `null`"
  - "`readSimilarityThreshold` — the *likely*-tier trigram floor, falling back to 0.85"
  - "`ORG_IDENTITY_FIELDS_KEY` / `DEDUP_SIMILARITY_KEY` and their bounds constants"
  - "`findCertainMatches` — the create-time certain-match lookup for both entity types, capped at 5"
  - "`CertainMatch` / `CertainMatchInput` — the shape 39-UI-SPEC W-7's three-line warning row renders from"
affects: [39-09, 39-15, create-time warning, admin identity-field settings, duplicates scan]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "third `app_settings` key group, copied from `src/lib/trash/settings.ts` (key constant, private zod schema, fail-closed read, discriminated Write result, validate-before-write)"
    - "an `app_settings` key deliberately seeded by NO migration — the first in the codebase"
    - "statement-level tests: the built WHERE clause rendered with `PgDialect.sqlToQuery` and asserted, rather than the result set"

key-files:
  created:
    - src/lib/dedup/identity-settings.ts
    - src/lib/dedup/identity-settings.test.ts
    - src/lib/dedup/matching.ts
    - src/lib/dedup/matching.test.ts
  modified: []

key-decisions:
  - "`readOrgIdentityFields` returns `null` for an unset, empty, malformed, over-cap or unreadable row — one safe answer meaning no certain tier and no create-time warning, never a fall back to name-only (the fallback measures 1,030,436 pairs)"
  - "`readSimilarityThreshold` DOES fall back to 0.85 while the identity key does not; the asymmetry is the module's central point and is asserted by tests, not just commented"
  - "the identity-field array is capped at 2 on READ as well as on write, so an out-of-band write cannot widen the certain check (T-39-11)"
  - "no `writeSimilarityThreshold`: the 39-VALIDATION sweep is an operator UPDATE against one row, and an admin control for an uncalibrated number would be a surface with no owner"
  - "`findCertainMatches` lives in `src/lib/dedup/`, not `src/lib/mutations/dedup.ts` as 39-RESEARCH sketched — it is a read, and the split also keeps plans 39-08 and 39-09 off one file"
  - "three no-query early returns on the organization branch (unconfigured key, no draft identity value, non-comparable draft name) and four on the person branch (absent, junk, sentinel, syntactically invalid e-mail): the degraded paths cost nothing, asserted by counting `db.select` calls"
  - "the visibility predicate is composed ONCE in a shared `scope()` helper for both branches, following `trashScope` in `src/lib/trash/queries.ts`, rather than written out per branch"
  - "the tier decision stays in `scoring.ts` for BOTH entity types — `matching.ts` narrows candidates and post-filters through the pure classifier, so it cannot drift from the background scan"
  - "test fixtures use deployment-neutral field labels (`Tax ID`, `Contact Email`) so the phase's own `grep` gate for hardcoded field names holds over the test files too"

patterns-established:
  - "Fail-closed asymmetry: two settings in one module with deliberately OPPOSITE failure directions, each stated in prose and pinned by a named test"
  - "Query-shape provenance comment: every statement names the `scripts/dedup-checks.sql` part that EXPLAINs it, and states that changing the shape without updating that part breaks the index proof silently"
  - "Visibility binding comment: `deleted_at IS NULL` is the only predicate, with the reason (`/organizations` and `/people` are not owner-scoped) and the instruction that the two must change together"
  - "No-query assertions: `expect(mockSelect).not.toHaveBeenCalled()` is how a documented graceful degradation is proven to be free"

requirements-completed: [DEDUP-01]

# Metrics
duration: 21min
completed: 2026-08-19
---

# Phase 39 Plan 08: Identity Settings & Certain-Match Lookup Summary

**The admin-configurable organization identity key plus `findCertainMatches` — a btree-equality certain-match lookup for both entity types that is capped at 5 on the query, bound-parameterised, fail-closed, and provably silent when the identity field is unconfigured or the e-mail is junk.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-08-19T09:36:20Z
- **Completed:** 2026-08-19T09:57:40Z
- **Tasks:** 2 (both TDD, RED → GREEN)
- **Files modified:** 4 created, 0 modified

## Accomplishments

- **`src/lib/dedup/identity-settings.ts`** — the third `app_settings` key group, copied from
  `src/lib/trash/settings.ts`. `readOrgIdentityFields` collapses unset, empty, malformed, over-cap
  and unreadable rows onto a single `null` that means *no certain tier and no create-time warning*;
  `readSimilarityThreshold` deliberately does the opposite and falls back to 0.85.
- **`src/lib/dedup/matching.ts`** — `findCertainMatches`, the server half of DEDUP-01 / SC-1. Both
  statements copy `scripts/dedup-checks.sql` Part 4 probes 2 and 5 character for character, so the
  EXPLAIN assertions in that script remain this module's proof that an index is chosen.
- **The graceful degradation is now a tested behaviour rather than a comment.** An unconfigured
  identity key produces `[]` and issues *no database query at all*, asserted by counting
  `db.select` calls — so an unconfigured install pays nothing on every organization create.
- **The B2 precision guard runs before the round trip.** A person draft carrying `#`, a sentinel
  placeholder, an absent address or anything failing `isValidMatchEmail` returns `[]` without
  querying — the 212-row `#` group is never fetched.
- **43 new tests** (25 + 18), all green, with three negative proofs RUN and recorded below.

## Task Commits

Each task was committed atomically, RED gate then GREEN gate:

1. **Task 1: The two app_settings keys this phase owns**
   - `87c6dfe` (test) — RED: 25 failing cases for both reads, the write, and the asymmetry
   - `81dce47` (feat) — GREEN: `identity-settings.ts`
2. **Task 2: findCertainMatches — the create-time lookup**
   - `f1f20a0` (test) — RED: 18 failing cases, statement-level via `PgDialect.sqlToQuery`
   - `230c37f` (feat) — GREEN: `matching.ts`

No REFACTOR commit on either task — neither implementation needed cleanup after going green.

**TDD gate sequence verified in `git log`:** `test(...)` precedes `feat(...)` for both tasks.

## Files Created/Modified

- `src/lib/dedup/identity-settings.ts` (10.4K) — `ORG_IDENTITY_FIELDS_KEY`,
  `DEDUP_SIMILARITY_KEY`, `ORG_IDENTITY_FIELDS_MAX`, `SIMILARITY_MIN`, `SIMILARITY_MAX`,
  `readOrgIdentityFields`, `writeOrgIdentityFields`, `WriteOrgIdentityFieldsResult`,
  `readSimilarityThreshold`.
- `src/lib/dedup/identity-settings.test.ts` (13.8K) — 25 cases. `@/db` mocked down to one
  `findFirst` and one `insert`, whose `values()` throws if `onConflictDoUpdate` is skipped.
- `src/lib/dedup/matching.ts` (15.3K) — `findCertainMatches`, `CertainMatchInput`, `CertainMatch`,
  plus the private `scope`, `identityValue`, `draftHasIdentityValue`, `matchedIdentityValue`.
- `src/lib/dedup/matching.test.ts` (16.6K) — 18 cases. `@/db` mocked down to `select` alone and
  `./identity-settings` mocked, so "no query issued" is a countable fact.

## Decisions Made

**1. `null` is one answer with one meaning, and the empty array is folded into it.**
`readOrgIdentityFields` returns `null` for a missing row, a stored `[]`, a bare string, a non-string
entry, JSON null, an array longer than two, and a rejected query. Test 1 asserts
`expect(result).not.toEqual([])` explicitly, because `findCertainMatches` branches on this exact
value to decide whether to issue a query at all. A stored `[]` warns nothing — clearing the setting
is a legal admin action, and warning on it would train operators to ignore the line that matters.

**2. The asymmetry between the two reads is load-bearing and is pinned by tests.**
An unset identity key must mean "no certain tier" because the alternative (equal normalized name
alone) measures 1,030,436 pairs. An unset threshold has a measured safe default. Both functions
carry the prose, and `readSimilarityThreshold`'s first test asserts the literal `0.85` so the two
can never be "tidied up" into consistency.

**3. The read side enforces the cap of two, not just the write side.**
`z.array(z.string().trim().min(1)).max(2)` is the single validation for both directions (T-39-11):
an out-of-band `UPDATE` that appends a third, weaker identity field cannot widen the certain check,
because the read rejects the row and falls back to no certain tier.

**4. No `writeSimilarityThreshold`.** The plan's export list does not include one and none was
added. The 39-VALIDATION threshold sweep is a one-row operator `UPDATE`; an admin control for a
number nobody has yet calibrated would be a surface with no owner. Recorded here because a reader
looking for the write half of `DEDUP_SIMILARITY_KEY` will not find it.

**5. `findCertainMatches` is a read module, not a mutation.** 39-RESEARCH sketched it inside
`src/lib/mutations/dedup.ts`; it selects, never writes, has no transaction and emits no event, so it
follows S-5's fail-closed posture rather than S-1's mutation return shape. Noted in the file header
as required by the plan. The split also keeps plans 39-08 and 39-09 off the same file.

**6. Both branches post-filter through `scoring.ts`, not just the organization one.**
The plan only asked for `classifyOrganizationMatch`. `classifyPersonMatch` is used on the person
branch too, which is what makes the input's `firstName` / `lastName` load-bearing (they build the
draft's `normName`) and keeps the person rule stated in exactly one place. `normPhone` is passed as
`""` with a comment: phone is only ever a secondary conjunct of the *likely* tier.

**7. The visibility predicate is composed once, not twice.** A shared `scope(deletedAt, id, match,
excludeId)` helper returns `and(isNull(deletedAt), match, exclusion)` for both branches, following
`trashScope` in `src/lib/trash/queries.ts` — the module the plan told me to read for this posture.
This is stronger than the plan's "one `isNull` per entity branch": the two branches now *cannot*
drift, and a future owner-scoping change has one edit site. See the grep note below.

**8. A third no-query early return was added to the organization branch.**
`isComparableOrgName(normalizeOrgName(input.name))` gates the query. Without it a draft named `A B`
or `...` issues a round trip whose rows `classifyOrganizationMatch` is guaranteed to reject, and a
draft with an empty name probes `norm_name = ''` — the 9-row initials clique 39-01 measured. Covered
by its own named test.

## Verification Evidence

**Test runs**

- `./node_modules/.bin/vitest run src/lib/dedup/identity-settings.test.ts` — 25 passed.
- `./node_modules/.bin/vitest run src/lib/dedup/matching.test.ts` — 18 passed.
- `./node_modules/.bin/vitest run src/lib/dedup/` — 6 files, **129 passed**.
- `npm run test` — **2355 passed | 21 skipped** (main project) and **8 passed** (rsc project),
  0 failures.
- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 errors, 125 warnings, **none of them in `src/lib/dedup/`** (all pre-existing,
  in `src/lib/import/*` and elsewhere).

**Three negative proofs, RUN**

| # | Mutation | Result |
|---|----------|--------|
| 1 | `readOrgIdentityFields` returns `[]` instead of `null` when the row is missing | `× Test 1 — returns null, NOT an empty array, when no row exists for the key` — 1 failed, 24 passed. Restored. |
| 2 | removed `if (identityFields === null) return []` from the organization branch | `× Test 1 — returns [] and issues NO query when the identity key is unconfigured` — failed on the `expect(mockSelect).not.toHaveBeenCalled()` assertion. Restored. |
| 3 | removed the `isValidMatchEmail` guard from the person branch | `× Test 5 — returns [] and issues NO query for the junk e-mail '#'`, plus the absent-e-mail and sentinel cases. Restored. |

After each restore the suite was re-run green; `grep -c "NEGATIVE PROOF" src/lib/dedup/matching.ts`
= 0 and the committed files are byte-identical to the verified ones.

**Grep gates**

| Gate | Result |
|------|--------|
| `grep -c "row.value" src/lib/dedup/identity-settings.ts` | **2** — lines 116 and 219, both `…Schema.safeParse(row.value)`. Read each: neither is inside a template literal and neither reaches `console`. Every `console.warn` string interpolates only the key constant and the bounds constants (T-39-10). |
| `grep -rc "CNPJ" src/lib/dedup/` on **this plan's four files** | **0** each. See the deviation note below for the pre-existing files. |
| `grep -cE 'sql\`[^\`]*\$\{(name\|email\|input)' src/lib/dedup/matching.ts` | **2** — the file contains exactly two `sql` templates and both are placeholder-only: `sql\`public.dedup_norm_org(${input.name ?? ""})\`` and `sql\`lower(btrim(coalesce(${email}, '')))\``. Read both: **zero of them concatenate a string.** `grep -n "sql.raw\|sql.identifier"` = 0, and a concatenation grep over the templates returns nothing (T-39-06). |
| `grep -c "deleted_at IS NULL\|isNull(" src/lib/dedup/matching.ts` | **3** (≥ 2 satisfied) — one `isNull(` call in the shared `scope()` helper plus two prose mentions. See decision 7: the single call serves both branches by design. |
| statement shape | Asserted in tests, not only by comment: the rendered WHERE contains `"norm_name" = public.dedup_norm_org(` and `"norm_email" = lower(btrim(coalesce(` with `"deleted_at" is null`, the raw name/e-mail present in `params` and absent from the SQL text. |

## Deviations from Plan

### 1. [Documentation] The `grep -rc "CNPJ" src/lib/dedup/` = 0 gate cannot hold over the whole directory

- **Found during:** Task 1 acceptance verification.
- **Issue:** The criterion is written as a directory-wide grep, but files delivered by plan 39-01 —
  which shipped before this plan — already name the label in comments and fixtures:
  `scoring.ts` (3), `field-groups.ts` (1), `scoring.test.ts` (18), `field-groups.test.ts` (19),
  `merge-defaults.test.ts` (16).
- **Resolution:** Not fixed. Editing another plan's delivered files is outside this plan's scope
  boundary and `files_modified` names only my four. The criterion's stated intent — "no
  deployment-specific field name is hardcoded anywhere in the library" — holds for **this plan's
  four files, which report 0 each**, and none of the pre-existing occurrences is a hardcoded
  *lookup key*; they are all comments and test fixtures.
- **Consequence for the test fixtures:** because the gate is directory-wide, this plan's tests use
  the deployment-neutral stand-ins `Tax ID` and `Contact Email` rather than the labels named in the
  plan's `<behavior>` block. The ordering contract the fixtures prove is label-agnostic, so nothing
  is lost, and both test files carry a header note explaining why.

### 2. [Rule 2 — Missing critical] A third no-query gate on the organization branch

- **Found during:** Task 2.
- **Issue:** The plan's behavior list has no case for a draft whose normalized name is not
  comparable. Without a gate, `findCertainMatches({ name: "" })` probes `norm_name = ''` and
  `{ name: "A B" }` probes an initials string — the exact 9-row clique `isComparableOrgName` exists
  to refuse. The post-filter would discard the rows, so the answer was already correct; the round
  trip was pure cost on a path the phase has measured as dangerous.
- **Fix:** `if (!isComparableOrgName(draftNormName)) return []` before the query, with the named
  test `returns [] and issues NO query when the draft name is not comparable`.
- **Files modified:** `src/lib/dedup/matching.ts`, `src/lib/dedup/matching.test.ts`.
- **Verification:** the new test asserts `expect(mockSelect).not.toHaveBeenCalled()`.
- **Committed in:** `230c37f` / `f1f20a0`.

### 3. [Rule 2 — Missing critical] Two extra person-branch guard tests

- **Found during:** Task 2.
- **Issue:** The plan names `"#"` as the junk-e-mail case. `isValidMatchEmail` also refuses an
  absent address and the two measured sentinel placeholders (`teste@teste.com` x16,
  `teste@gmail.com` x23), and each of those is a distinct real-world create-time path.
- **Fix:** two more named no-query tests, plus one asserting a returned row whose *own* e-mail
  would not qualify is dropped (both sides validated independently).
- **Files modified:** `src/lib/dedup/matching.test.ts`.
- **Committed in:** `f1f20a0` / `230c37f`.

### 4. [Scope] Shared planning artifacts deliberately not written

- **Issue:** This plan executed as a parallel worktree agent.
- **Resolution:** `STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` were **not** modified, per the
  orchestrator's instruction that it owns those writes after the wave merges. Note for the
  orchestrator: `DEDUP-01` is listed in this plan's `requirements` frontmatter and is carried in
  `requirements-completed` above, but **this plan delivers only its server half** — the create-time
  warning UI (39-UI-SPEC Surface 1) is a separate plan. Mark `DEDUP-01` complete only once that
  half lands.

---

**Total deviations:** 4 (1 documentation reconciliation, 2 Rule 2 additions, 1 scope note)
**Impact on plan:** No scope creep. The two Rule 2 additions are extra no-query gates and extra
tests on paths the phase has already measured; both make the plan's own "the degraded paths must
cost nothing" contract hold more completely. Nothing was removed or weakened.

## Issues Encountered

- **The worktree was created from a stale base**, `cbf3229` — roughly 11 phases behind master, the
  systematic problem this project's dispatch notes warn about. Corrected with
  `git reset --hard d7eadeb` as the first action, then verified: `drizzle/0017_dedup_schema.sql`
  present, `drizzle/meta/_journal.json` ending at `idx: 17`, `scripts/` present. Without the reset,
  neither `organizations.norm_name` nor `people.norm_email` would have existed and Task 2 could not
  have been written.
- **One typecheck error in the first draft of the Task 1 test** — the `console.warn` spy's
  `mock.calls` needed an explicit `unknown[]` annotation under `noImplicitAny`. Fixed before the
  GREEN commit.

## User Setup Required

None — no external service configuration, and no package was installed (T-39-SC: this plan installs
nothing).

**Operator note, not setup:** `dedup.organization_identity_fields` is the first `app_settings` key
in this codebase that no migration seeds, and that absence is deliberate — there is no
deployment-neutral custom-field label to seed. Until an admin configures it, organizations have no
certain tier and no create-time warning. The module header states this so nobody hunts for a
missing seed migration. People are unaffected: `people.email` is a real column and the person tier
works out of the box.

## Next Phase Readiness

**Ready to consume:**

- The create-time warning UI can call `findCertainMatches` from the organization and person create
  server actions and render `CertainMatch[]` directly as W-7's three lines
  (`name` → link, `distinguishingValue` → muted Label, `reason` → `dedup.reason.*`). It never
  throws and is already capped at W-8's five.
- The admin identity-field control can call `writeOrgIdentityFields` behind a re-checked admin role
  (the `src/app/admin/audit/actions.ts` posture) and read the current value with
  `readOrgIdentityFields`. It must **re-state** `ORG_IDENTITY_FIELDS_MAX` rather than import it —
  `identity-settings.ts` imports `@/db` and would drag a server-only module into the browser bundle,
  the same constraint `retention-form.tsx` documents.
- The background scan can take its trigram floor from `readSimilarityThreshold`.

**Concerns for whoever wires the UI:**

- `findCertainMatches` returning `[]` is indistinguishable from "no duplicates" by design. That is
  correct for an advisory warning, but it means an unconfigured identity key is invisible in the UI
  — if the admin settings page needs to say "no certain tier is configured", it must read
  `readOrgIdentityFields` itself and branch on `null`.
- `scripts/dedup-checks.sql` Part 4 is the only proof these two statements use an index. Any change
  to either query's shape must be mirrored there or the proof lapses silently.

## Self-Check: PASSED

- `src/lib/dedup/identity-settings.ts` — FOUND
- `src/lib/dedup/identity-settings.test.ts` — FOUND
- `src/lib/dedup/matching.ts` — FOUND
- `src/lib/dedup/matching.test.ts` — FOUND
- `87c6dfe` test(39-08) — FOUND in `git log`
- `81dce47` feat(39-08) — FOUND in `git log`
- `f1f20a0` test(39-08) — FOUND in `git log`
- `230c37f` feat(39-08) — FOUND in `git log`
- working tree clean, no untracked files

---
*Phase: 39-duplicate-detection-merge*
*Completed: 2026-08-19*
