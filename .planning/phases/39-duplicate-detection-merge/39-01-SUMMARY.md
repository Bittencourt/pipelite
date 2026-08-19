---
phase: 39-duplicate-detection-merge
plan: 01
subsystem: dedup
tags: [normalization, unaccent, pg_trgm, matching, vitest, brazilian-legal-suffixes]

# Dependency graph
requires: []
provides:
  - "src/lib/dedup/normalize.ts — TS mirror of public.dedup_norm_org / public.dedup_norm_person"
  - "src/lib/dedup/normalize.fixtures.ts — NORMALIZATION_CASES, the 13-row case table shared verbatim with scripts/dedup-checks.sql"
  - "src/lib/dedup/scoring.ts — classifyOrganizationMatch, classifyPersonMatch, isValidMatchEmail"
  - "src/lib/dedup/constants.ts — LEGAL_SUFFIXES, thresholds, measured sentinel sets"
  - "src/lib/dedup/types.ts — DedupTier, DedupReason, DuplicatePairStatus, MergeableEntityType"
affects:
  - "39-03 (the SQL normalization functions must reproduce NORMALIZATION_CASES exactly)"
  - "39-05 (scripts/dedup-checks.sql quotes NORMALIZATION_CASES as its assertion table)"
  - "39-07, 39-08 (scan and create-time warning consume classify* and the constants)"
  - "39-15 (duplicate custom-field labels are reconciled at the field-list build site, not here)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared TS/SQL fixture table: a .fixtures.ts file outside the vitest include glob, asserted from both TypeScript and psql"
    - "Two named normalizers instead of one with a boolean flag, so a call site cannot pick the wrong ruleset silently"

key-files:
  created:
    - src/lib/dedup/constants.ts
    - src/lib/dedup/types.ts
    - src/lib/dedup/normalize.ts
    - src/lib/dedup/normalize.fixtures.ts
    - src/lib/dedup/normalize.test.ts
    - src/lib/dedup/scoring.ts
    - src/lib/dedup/scoring.test.ts
  modified:
    - src/lib/import/fuzzy-match.ts

key-decisions:
  - "isComparableOrgName requires a token of length >= 3, not a total string length >= 3, so a name of one-letter initials cannot rebuild the token-less clique"
  - "The spaced `S A` -> `SA` join runs BEFORE the legal-suffix pass and is implemented over the token array, never as a regex on the joined string"
  - "classifyOrganizationMatch takes identityFields as an argument and stays pure; an empty list yields no certain tier and never falls back to name-only"
  - "Identity custom-field values are compared trimmed and lowercased; non-string JSONB values are read as absent rather than coerced with String()"
  - "The superseded reason identifier is not spelled anywhere under src/lib/dedup/, so the acceptance grep returns zero"

patterns-established:
  - "NORMALIZATION_CASES is the single statement of TS/SQL agreement; a row added to it must be added to scripts/dedup-checks.sql"
  - "Every measured guard carries the number that justifies it in its own comment, so it is not later deleted as defensive noise"

requirements-completed: [DEDUP-01]

# Metrics
duration: 22min
completed: 2026-08-19
---

# Phase 39 Plan 01: Dedup Normalization and Confidence Tiers Summary

**Accent-folding, Brazilian-legal-suffix-stripping name normalization mirrored from `public.dedup_norm_org`, plus a fail-closed certain/likely classifier whose two most expensive wrong answers — a `#` e-mail clique and a name-only "certain" tier — are each blocked by a guard proven by a run negative proof.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-19T08:25:00Z
- **Completed:** 2026-08-19T08:47:00Z
- **Tasks:** 2 (both TDD, 4 commits)
- **Files modified:** 8 (7 created, 1 modified)

## Accomplishments

- `normalizeOrgName` reproduces all four outputs measured against the live database verbatim, and `NORMALIZATION_CASES` states in 13 checked-in rows what "the TypeScript and the SQL agree" means — so plan 39-03's SQL function has a target rather than a description.
- The `S A` ordering decision is settled and defended: the spaced two-token form is joined into `sa` **before** the suffix pass, which is the only reason `UNIAO DE LOJAS LEADER S A` and `Uniao de Lojas Leader S.A.` reach the same string.
- The person/organization split is proven in both directions in a single test: `normalizePersonName("José de Sá") === "jose de sa"` while `normalizeOrgName("LOJAS SA") === "lojas"`. Neither half can pass vacuously.
- `isValidMatchEmail` keeps the measured 212-person `#` group (22,366 pairs on its own) out of the certain tier entirely, and additionally rejects the two placeholder addresses that survive the syntax test.
- `classifyOrganizationMatch` degrades gracefully rather than dangerously: with no identity custom field configured it emits *likely* only, never the name-only "certain" tier that measures 1,030,436 pairs on this dataset.
- 61 new assertions; full suite 2,285 + 8 passing (baseline 2,224 + 8), typecheck 0 errors, lint 0 errors and no new warnings.

## Task Commits

1. **Task 1: Normalization, fixtures, comparability guards** — `b3ee790` (test, RED: 41 failing) → `e71d6a8` (feat, GREEN: 41 passing)
2. **Task 2: Confidence-tier classification** — `c0dcb9d` (test, RED: 20 failing) → `1ca44cd` (feat, GREEN: 20 passing)

No REFACTOR commit was needed on either task.

## TDD Gate Compliance

Both tasks ran the full RED→GREEN sequence with a real failing run recorded before any implementation existed. `test(...)` precedes `feat(...)` for each task in `git log`. Neither RED run passed unexpectedly.

## Files Created/Modified

- `src/lib/dedup/constants.ts` — `LEGAL_SUFFIXES`, `DEFAULT_SIMILARITY_THRESHOLD`, `SCAN_MIN_NAME_LENGTH`, `MIN_PERSON_NAME_TOKENS`, `MIN_PERSON_NAME_LENGTH`, `CREATE_TIME_MATCH_LIMIT`, `PAIR_PAGE_SIZE`, `SENTINEL_EMAILS`, `SENTINEL_NORM_NAMES`. Every measured value carries its count inline.
- `src/lib/dedup/types.ts` — the closed vocabulary. `MergeableEntityType` is `Extract<EntityType, …>` from the schema's single declaration, never a restated union. Runtime-import-free so it is safe in a client bundle.
- `src/lib/dedup/normalize.ts` — `normalizeOrgName`, `normalizePersonName`, `normalizePhone`, `isComparableOrgName`, `isComparablePersonName`, with a header stating the module is a MIRROR of the SQL functions and that drift is caught by `scripts/dedup-checks.sql`.
- `src/lib/dedup/normalize.fixtures.ts` — `NORMALIZATION_CASES`, 13 rows, each with a `name` so `it.each` reports failures by case.
- `src/lib/dedup/normalize.test.ts` — 41 assertions.
- `src/lib/dedup/scoring.ts` — `isValidMatchEmail`, `classifyPersonMatch`, `classifyOrganizationMatch` plus the `PersonMatchSide` / `OrganizationMatchSide` / `DedupClassification` shapes. Pure: no db, no settings read, no SQL.
- `src/lib/dedup/scoring.test.ts` — 20 assertions.
- `src/lib/import/fuzzy-match.ts` — header cross-reference only, recording that its private `normalize()` and `src/lib/dedup/normalize` deliberately disagree and that its caller is NOT being repointed in this phase. No behaviour change.

## Negative Proofs (RUN, not reasoned)

Four mutations were applied to working code, the suite was re-run, the named failure was observed, and the file was restored from a backup taken beforehand.

| # | Mutation | Observed failure | Restored |
|---|---|---|---|
| 1 | `normalizePersonName` filters `LEGAL_SUFFIXES` | 1 failed — `normalizePersonName > keeps the surname Sá while normalizeOrgName strips the SA suffix`: `expected 'jose de' to be 'jose de sa'` | yes |
| 2 | step (5) removed from `normalizeOrgName` | 2 failed — `'joins a spaced S A into SA and then s…': 'UNIAO DE LOJAS LEADER S A'` and the dotted `S.A.` case: `expected 'uniao de lojas leader s a' to be 'uniao de lojas leader'` | yes |
| 3 | `SENTINEL_EMAILS` rejection deleted from `isValidMatchEmail` | 1 failed — `isValidMatchEmail > rejects the measured placeholder addresses teste@teste.com and teste@gmail.com` | yes |
| 4 | `identityFields.length === 0` guard returns `certain` instead of `likely` | 1 failed — `classifyOrganizationMatch > never reports certain when no identity field is configured` | yes |

Each mutation failed **only** the tests naming the behaviour it broke, so none of the four assertions is vacuous.

## Decisions Made

- **`isComparableOrgName` tests tokens, not total length.** The plan's Test 10 (`""`→false, `"ab"`→false, `"abc"`→true) is satisfied by either rule, but a total-length rule accepts `"a b c"` and would reassemble exactly the clique the measured "9 token-less organizations" finding warns about. The token rule is strictly stricter, and an extra named assertion for `"a b c"` pins it. Plan 39-03's SQL must mirror the token rule, not `length(norm) >= 3`.
- **Step (5) is implemented over the token array, not as a regex on the joined string.** A regex `/s a/` (or even `/\bs a\b/` reasoning) invites a match inside neighbouring tokens; matching whole array elements makes that impossible by construction rather than by careful regex.
- **`firstSharedIdentity` returns the first field populated on BOTH sides and no later field votes.** "All populated fields must agree" was rejected: two branches of one company legitimately share `E-mail de Contato 1` while carrying different CNPJs, so letting the weaker field speak after the stronger one would manufacture certain matches.
- **Non-string JSONB identity values read as absent.** `String(value)` would turn two unrelated `{}` values into the matching string `[object Object]` — a silent certain match from two blank fields. A named test pins this.
- **Identity values compare trimmed and lowercased.** `CNPJ / CPF` is punctuated inconsistently in this data and contact e-mail is case-insensitive by nature; the ordered-fallthrough test uses `Contato@Cogumelo.com.br` vs `contato@cogumelo.com.br` to pin it.
- **Both e-mails are validated independently before the equality test**, so a junk value on one side can never be promoted by a good value on the other.

## Deviations from Plan

### 1. [Rule 3 — Blocking] The worktree was created from a stale `origin/master`

- **Found during:** worktree bootstrap, before task 1.
- **Issue:** The agent branch `worktree-agent-a1eecf7b2bcbe1c24` was branched from `origin/master` (`cbf3229`, "docs(34): mark phase 34 complete") rather than local `master` (`c09a1cf`). That base is **493 files and ~142,000 insertions behind**, and it does not contain `.planning/phases/39-duplicate-detection-merge/` at all — the plan being executed was not present in its own worktree. Executing there and merging back would have reverted every phase 35–39 change on `master`.
- **Fix:** `git reset --hard master` on the agent branch at startup, before any work. This is the sanctioned startup branch check; the branch had no commits of its own (it was identical to `cbf3229`), so nothing was lost.
- **Verification:** `git log --oneline -1` → `c09a1cf`; `.planning/phases/39-duplicate-detection-merge/` present with all 17 plans; `git status` clean; baseline `npm run typecheck` 0 errors and `npm run lint` 0 errors before any edit.
- **Committed in:** n/a (branch pointer move, no content commit).
- **Note for the orchestrator:** the branch listing shows many sibling `worktree-agent-*` branches also sitting at `cbf3229` / `5ae175e`. If those are live wave-1 agents, they have the same stale base and the same risk. Worth checking before merging the wave.

### 2. [Rule 1 — Bug] The plan's own instruction contradicted its acceptance criterion

- **Found during:** Task 2 verification.
- **Issue:** The task 1 `<action>` block instructs the `types.ts` comment to read "note `nameIdentity`, not `nameDomain`, because the domain conjunct was superseded", while the task 2 acceptance criterion requires `grep -c "nameDomain" src/lib/dedup/` = 0. Writing the comment as literally specified made the criterion fail (1 occurrence, in `types.ts`).
- **Fix:** The comment keeps the full explanation — the superseded rule was "identical normalized name + identical website domain", `website` measured NULL on all 46,054 rows — but names the superseded rule descriptively instead of spelling its identifier, and says so explicitly ("deliberately not spelled anywhere in `src/lib/dedup/`, so a grep for it returns nothing"). The criterion's intent (the dead identifier must not be greppable and mislead a future reader) is met and the rationale survives.
- **Files modified:** `src/lib/dedup/types.ts`.
- **Verification:** `grep -rn "nameDomain" src/lib/dedup/ | wc -l` → `0`.
- **Committed in:** `1ca44cd`.

### 3. [Clarification] Negative proof 4 was run as a substitution, not a literal deletion

- **Found during:** Task 2 acceptance.
- **Issue:** The criterion says "delete the `identityFields.length === 0` guard, re-run, confirm Test 9 fails by name". Literally deleting that line is a **no-op** in the implementation as written: `firstSharedIdentity` iterates the (empty) array, finds nothing and returns `null`, so the certain branch is still not taken. The check fails closed twice, which is a good property but makes a literal deletion unobservable.
- **Fix:** The proof was run in the form that actually tests the criterion's intent — the guard was made to return `certain` (the name-only rule that 39-RESEARCH measured at 1,030,436 pairs, i.e. exactly the failure the guard exists to prevent). Test 9 then failed by name, confirming it is not vacuous. The guard is kept in the code as an explicit early return, with a comment recording that it is belt-and-braces over `firstSharedIdentity`'s own null return.
- **Verification:** see Negative Proofs table, row 4.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug) + 1 clarification.
**Impact on plan:** No scope change. Deviation 1 was a prerequisite for executing the plan at all; deviation 2 resolved a contradiction internal to the plan in favour of the acceptance criterion; deviation 3 strengthened a proof rather than skipping it.

## Issues Encountered

- **`e2e/.auth/admin.json` shows as untracked in this worktree.** The bootstrap instructions assume a `.gitignore` with `/e2e/.auth/` at line 53; the `.gitignore` at the correct base is 48 lines and has no `e2e` rule, and `e2e/` is not tracked at all on `master` at `c09a1cf`. The symlink is therefore untracked but harmless — it was never staged (every commit staged named files individually, never `git add .` or `-A`), and this plan is pure logic that needs no Playwright session. Left in place.
- Nothing else. No database, no Docker, no migration and no package install were required, exactly as the plan predicted.

## Threat Flags

None. `T-39-06` and `T-39-11` are both satisfied as planned: these are pure string functions that build no SQL, and `classifyOrganizationMatch` treats an empty or unrecognised `identityFields` as "no certain tier", failing closed. No new network endpoint, auth path, file access or schema surface was introduced.

## Known Stubs

None. Both modules are fully implemented; nothing returns a hardcoded placeholder.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready. Wave 1's siblings and the downstream waves can now proceed:

- **Plan 39-03** must implement `public.dedup_norm_org` / `public.dedup_norm_person` to reproduce `NORMALIZATION_CASES` exactly. Two things to carry across deliberately: the `S A` join happens **before** the suffix pass, and the comparability rule is "has a token of length >= 3", not `length(norm) >= 3`.
- **Plan 39-05** should import the case table by quoting `src/lib/dedup/normalize.fixtures.ts` verbatim into `scripts/dedup-checks.sql`; the rows carry `name` fields that make good assertion labels.
- **Plan 39-08** owns reading and zod-validating the ordered identity-field setting and passing it into `classifyOrganizationMatch`, which never reads settings itself.
- **Plan 39-15** owns reconciling the two custom-field definitions both named `Segmento Organização`; `readIdentityValue` deliberately does no de-duplication.
- Message keys `dedup.reason.email`, `dedup.reason.nameIdentity`, `dedup.reason.similarName` and `dedup.reason.similarNamePhone` are now fixed by `DedupReason` and need adding in all three locales.

## Self-Check: PASSED

Files verified present: `src/lib/dedup/constants.ts`, `types.ts`, `normalize.ts`, `normalize.fixtures.ts`, `normalize.test.ts`, `scoring.ts`, `scoring.test.ts`, and `src/lib/import/fuzzy-match.ts` modified.
Commits verified in `git log`: `b3ee790`, `e71d6a8`, `c0dcb9d`, `1ca44cd`.
Gates verified: `vitest run src/lib/dedup/` 61/61 passing; `npm run test` 2,285 + 8 passing; `npm run typecheck` 0 errors; `npm run lint` 0 errors (125 pre-existing warnings, unchanged from baseline).

---
*Phase: 39-duplicate-detection-merge*
*Completed: 2026-08-19*
