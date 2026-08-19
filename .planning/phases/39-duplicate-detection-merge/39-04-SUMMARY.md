---
phase: 39-duplicate-detection-merge
plan: 04
subsystem: i18n
tags: [next-intl, icu-plurals, vitest, locale-parity, copy-contract]

# Dependency graph
requires:
  - phase: 38-bulk-operations
    provides: REQUIRED_BULK_KEYS — the total exact-set contract shape this plan copied
  - phase: 45-cross-cutting-ui-repair-and-uat-closure
    provides: the expect.soft posture, and the finding that a component written against a key that does not exist renders its dot-path to the user
provides:
  - 77 dedup.* message keys in en-US, pt-BR and es-ES
  - 4 audit.entry.* merge keys (merged.organization, merged.person, mergedNoFieldChanges, mergedChildren)
  - REQUIRED_DEDUP_KEYS — a total, both-directions exact-set contract over the whole dedup namespace
  - ICU_PLURAL_KEYS — the dedicated plural gate, taken from 1 key to 11
  - placeholderCounts() — the multiset placeholder check placeholderDrift() structurally cannot do
affects: [39-11, 39-12, 39-13, 39-14, 39-15, 39-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A phase's entire message catalog lands in wave 1, before any component consumes it"
    - "Multi-key ICU plural gating via a listed (not auto-detected) ICU_PLURAL_KEYS array"
    - "Occurrence-count placeholder assertion for messages that use one placeholder twice"

key-files:
  created: []
  modified:
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json
    - src/messages/locale-parity.test.ts

key-decisions:
  - "dedup.reason.nameDomain renamed to nameIdentity and re-worded — the approved copy described a rule that can never fire, since website is NULL on all 46,054 organizations"
  - "Eight dedup.identity.* keys added for the admin identity-field control that 39-CONTEXT locked but 39-UI-SPEC has no surface for"
  - "audit.entry.merged carries exactly two children, organization and person — deals and activities are out of scope for deduplication"
  - "The dedicated ICU gate switched from a hard expect to expect.soft when it went from 1 key to 11, so one broken wrapper no longer hides the other ten"
  - "placeholderCounts() added because placeholders() de-duplicates through a Set, making placeholderDrift() a set comparison that cannot see a lost second {loser}"

patterns-established:
  - "Catalog-first waves: every string a phase will render exists in all three locales before any component is written"
  - "Contract counts are read from the source constant, never carried from a planning document"

requirements-completed: [DEDUP-01, DEDUP-02, DEDUP-03]

# Metrics
duration: 38min
completed: 2026-08-19
---

# Phase 39 Plan 04: Message Catalog and Locale Contract Summary

**The phase's whole copy surface — 77 `dedup.*` keys and 4 merge `audit.entry.*` keys in three locales — shipped ahead of every component that consumes it, under an exact-set contract that fails in both directions and whose three failure modes were demonstrated by running them.**

## Performance

- **Duration:** ~38 min
- **Started:** 2026-08-19T08:20Z
- **Completed:** 2026-08-19T08:58Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- **The catalog exists before the components do.** 77 `dedup.*` leaves and 4 `audit.entry.*` leaves are present, non-blank, placeholder-consistent and ICU-structurally-valid in en-US, pt-BR and es-ES. Whole-file leaf count went 792 → 873, identical across the three files. Plans 39-11 through 39-16 can call `t()` on any of these without a dot-path reaching a user.
- **The contract fails in both directions, proven by running it.** `REQUIRED_DEDUP_KEYS` is compared *totally* against the shipped namespace: a 78th string added without a contract entry fails, and a contract entry left without a shipped key fails. Both were induced and observed, not argued.
- **The ICU blind spot is closed and its existence demonstrated.** Removing the `other {` arm from one pt-BR plural produced exactly one failing test — the dedicated ICU gate — while the placeholder-drift assertion stayed green, which is the blind spot itself rendered as evidence.
- **A second, previously unnoticed blind spot was found and closed.** `placeholders()` de-duplicates through a `Set`, so `placeholderDrift()` compares sets rather than multisets. `dedup.merge.confirmBody` uses `{loser}` twice; a translation naming the loser once would have passed every assertion in the file. It now has its own occurrence-count gate.

## Task Commits

1. **Task 1: Add 77 dedup keys and 4 audit keys to all three locale files** — `933736f` (feat)
2. **Task 2: The REQUIRED_DEDUP_KEYS exact-set contract and the extended gates** — `ede15e0` (test)

## Files Created/Modified

- `src/messages/en-US.json` — new top-level `dedup` namespace (inserted after `bulk`), `audit.entry.merged` + `mergedNoFieldChanges` + `mergedChildren`
- `src/messages/pt-BR.json` — the same additions, translated, accents intact
- `src/messages/es-ES.json` — the same additions, translated, accents intact
- `src/messages/locale-parity.test.ts` — `REQUIRED_DEDUP_KEYS`, `DEDUP_NAMESPACE`, `dedupKeys`, `ICU_PLURAL_KEYS`, `placeholderCounts()`, the dedup exact-set assertion, the `confirmBody` occurrence assertion, and `REQUIRED_AUDIT_KEYS` 81 → 85

## Contract Numbers, Read From Source

39-RESEARCH assumption A7 flagged that `REQUIRED_AUDIT_KEYS`' size is reported inconsistently across planning documents, so every number below was counted from the file rather than carried from a document:

| Constant | Before | After |
|---|---|---|
| `REQUIRED_AUDIT_KEYS` | **81** | **85** (exactly +4) |
| `REQUIRED_DEDUP_KEYS` | — | **77** (asserted in-file, plus a no-duplicates assertion) |
| `ICU_PLURAL_KEYS` | 1 (inline) | **11** |
| `IDENTICAL_TRANSLATION_ALLOWED` | 3 entries | **3 entries — unchanged** |
| Whole-file leaves per locale | 792 | **873** |

The 81 figure was confirmed twice: by counting the array, and by the run at the end of task 1, where the pre-existing exact-set audit assertion reported `expected …(80 more) to deeply equal …(84 more)` — i.e. 81 contracted vs 85 shipped.

`dedup.*` group sizes: warning 4, reason 4, scan 13, review 17, merge 27, import 3, identity 8, findDuplicates 1 = **77**.

## Decisions Made

**1. The catalog was extracted from 39-UI-SPEC mechanically, not transcribed by hand.**
A throwaway script parsed the UI-SPEC's markdown tables into `{key, en, pt, es}` rows (73 rows: 69 `dedup` + 4 `audit`, matching the spec's own stated counts) and a build script wrote them into the three JSON files. Hand-transcribing 219 accented strings across three languages is exactly the operation that silently loses a `ç` or an `ú`, and the copy was signed off as copy — it was not this plan's job to re-key it. Both scripts were deleted before the commit; neither is checked in.

**2. JSON round-trip fidelity was verified before writing.**
`JSON.stringify(JSON.parse(raw), null, 2) + "\n"` was confirmed byte-identical to all three existing files *before* any modification, so the write could not reformat unrelated regions. The diffs contain only the added keys.

**3. `dedup` was inserted after `bulk` at top level, identically in all three files.**
Key order does not affect the gate (`flattenKeys` sorts), but the three files are kept structurally identical so a human diff of one locale against another stays readable.

**4. `audit.entry.merged` was placed after `deleted`; the two detail lines after `noVisibleChanges`.**
`merged` joins the predicate groups it belongs to, and `mergedNoFieldChanges` sits beside `noVisibleChanges`, which is its non-merge sibling in meaning.

**5. The ICU gate switched from hard `expect` to `expect.soft`.**
The file's own comment justified the hard assertion on the grounds that it "gates one key and has nothing to run alongside it". It now gates eleven, so the justification expired and the file's own stated rule — soft, so every broken contract names itself in one run — applies. The comment was updated to say so.

**6. `IDENTICAL_TRANSLATION_ALLOWED` got no addition, and this was run rather than reasoned about (L-4).**
`untranslatedInBoth(REQUIRED_DEDUP_KEYS)` returned `[]`. The two near-misses behaved as 39-UI-SPEC predicted: `dedup.reason.email` differs from en in pt ("Mesmo e-mail"), and `dedup.merge.movesNotes` is identical between pt and es (`# nota`) but not to en — which is not what the function tests. The constant is unchanged at 3 entries and 3 occurrences, matching its pre-plan value.

## Authorized Deltas to the Approved 39-UI-SPEC Catalog

Both were mandated by the plan, and both trace to 39-CONTEXT's "Post-Research Decisions", which superseded a locked matching rule *after* the UI-SPEC was signed off.

**Delta 1 — `dedup.reason.nameDomain` → `dedup.reason.nameIdentity`, re-worded.**
The approved copy was "Same name and website domain". Research measured `website` as NULL on all 46,054 organizations, so the organization *certain* tier that copy describes can never fire once. The tier is now "same normalized name and the same value in a configured identity custom field", and the copy says so:

| Locale | Copy |
|---|---|
| en-US | Same name and the same identifying field |
| pt-BR | Mesmo nome e mesmo campo de identificação |
| es-ES | Mismo nombre y mismo campo de identificación |

Key count unchanged (still 4 reasons). The superseded copy is **gone, not merely unused** — `nameDomain`, `website domain`, `domínio do site` and `dominio del sitio` all return zero matches across the three files.

**Delta 2 — the eight `dedup.identity.*` keys.**
39-CONTEXT locks that the organization identity key is admin-configurable; 39-UI-SPEC has no surface for naming those fields, so 39-11 adds a settings card on the already-admin-only `/duplicates`. `title`, `help`, `primaryLabel`, `secondaryLabel`, `none`, `save`, `saved`, `saveFailed`. `help` states the degradation explicitly — until a field is chosen, new organizations get no create-time check at all — because silence there would read as a working feature.

69 + 8 = **77**.

## Negative Proofs — RUN, Not Reasoned About

**Proof 1 — a surplus key with no contract entry, and `expect.soft` earning its keep.**
Added `"zzz": "x"` under `dedup` in `en-US.json` only. One run reported four soft failures together: the en-US exact-set divergence (78 vs 77), the `dedup` key-set divergence naming both `pt-BR.json` and `es-ES.json`, and the whole-file parity failure listing `dedup.zzz` as missing. A hard `expect` would have shown only the first. Leaf removed; suite back to 9 passing.

**Proof 2 — a contract entry with no shipped key.**
Deleted `"dedup.merge.gone"` from `REQUIRED_DEDUP_KEYS`. Two tests failed: the length assertion (`expected … to have a length of 77 but got 76`) and the exact-set assertion, which named the surplus shipped key `+ "dedup.merge.gone"` in **all three** locales. Restored; suite back to 9 passing.

**Proof 3 — the ICU blind spot, demonstrated rather than asserted.**
Flattened pt-BR `dedup.review.pairsFound` from `{count, plural, one {…} other {…}}` to the bare string `possíveis duplicados`. **Exactly one test failed** — `every ICU plural wrapper survives translation`, naming `dedup.review.pairsFound` — while `interpolation placeholders survive translation…` stayed **green**. That is the proof `placeholderDrift()` alone would not have caught it. Restored; suite back to 9 passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The worktree was created from a Phase 34 commit and was missing `src/messages/locale-parity.test.ts` entirely**
- **Found during:** Setup, before Task 1
- **Issue:** `HEAD` was at `cbf3229 docs(34): mark phase 34 complete`, roughly five phases behind `master` (`c09a1cf`). `src/messages/locale-parity.test.ts` — the file Task 2 must modify — did not exist in the worktree, nor did `.planning/phases/39-*`, and `en-US.json` was the pre-Phase-35 version (792 leaves, no `audit`/`trash`/`bulk` growth from phases 36-38). Executing the plan against that tree would have produced a catalog built on a five-phase-stale base and a Task 2 with no file to edit.
- **Fix:** Verified the branch had zero commits of its own (`git merge-base --is-ancestor HEAD master` → true) and a clean tree, then `git merge --ff-only master`. A pure fast-forward: no reset, no clean, nothing discarded, and no risk to sibling worktrees.
- **Files modified:** none by the fix itself — it brought the worktree to `master`
- **Verification:** `HEAD` = `c09a1cf`, branch still `worktree-agent-a825e4c09765a3992`, `locale-parity.test.ts` present at 762 lines, `.planning/phases/39-duplicate-detection-merge/` present, working tree clean
- **Committed in:** n/a (no content change; it is the base both task commits sit on)

**2. [Rule 2 - Missing critical gate] `placeholderDrift()` compares placeholder SETS, so it cannot see a lost repeated placeholder**
- **Found during:** Task 2 (the plan's L-5 instructed reading the helper's actual behaviour and adding the assertion only if it de-duplicates)
- **Issue:** `placeholders()` is `[...new Set(message.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])].sort()`. It **does** de-duplicate. `dedup.merge.confirmBody` carries `{loser}` twice and `{survivor}` once; a translation naming the loser once would produce an identical sorted set and pass every existing assertion, quietly dropping the half of the sentence that tells the user which record they can restore.
- **Fix:** Added `placeholderCounts(message, tokens)` and a dedicated `it` block asserting `{loser}: 2, {survivor}: 1` per locale, with a comment explaining why the generic gate structurally cannot cover it.
- **Files modified:** `src/messages/locale-parity.test.ts`
- **Verification:** The assertion passes on the shipped copy; all three locales genuinely carry `{loser}` twice.
- **Committed in:** `ede15e0`

---

**Total deviations:** 2 auto-fixed (1 × Rule 3 blocking, 1 × Rule 2 missing critical gate)
**Impact on plan:** No scope creep. The first was pure environment repair with no content change; the second was explicitly conditioned on a finding the plan told me to make by reading the code, and the finding was positive.

## Issues Encountered

**The audit contract was necessarily red between the two commits, and this was left visible on purpose.**
Task 1 ships 4 new `audit.entry.*` keys; `REQUIRED_AUDIT_KEYS` is extended in Task 2, per the plan's own file allocation. So at `933736f` the suite is `1 failed | 6 passed`, and the single failure is the pre-existing exact-set audit assertion naming the four new keys. That is L-2 behaving exactly as documented — "adding the keys without extending the list fails" — observed live rather than asserted, and it is recorded in that commit's own message. `ede15e0` turns it green. There are no git hooks in this repo, so no commit was forced through a gate.

**Pre-existing lint warnings are out of scope.**
`npm run lint` reports 125 warnings, 0 errors. None are in the four files this plan touched; they are unused-variable warnings in `src/lib/import/*`, `src/lib/triggers/*` and similar. Not fixed, per the scope boundary.

## Verification Results

| Check | Result |
|---|---|
| `vitest run src/messages/locale-parity.test.ts` | **9 passed** |
| `npm run test` (project 1) | **102 passed, 1 skipped** (103 files) |
| `npm run test` (rsc project) | **2 passed** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors** (125 pre-existing warnings, all out of scope) |
| dedup leaves per locale | **77 / 77 / 77**, identical key sets |
| `audit.entry.merged` children per locale | **2 / 2 / 2** |
| `nameDomain` / `website domain` / `domínio do site` / `dominio del sitio` | **0 matches in all three files** |
| 10 new ICU plural keys × 3 locales | all carry `{count, plural,`, `one {` and `other {` |

## Known Stubs

None. This plan ships data, not behaviour: every key has real translated copy in all three locales, no placeholder text, no TODO, no "coming soon".

## Threat Flags

None. This plan adds no endpoint, no auth path, no file access and no schema change. T-39-17 (information disclosure through interpolated record names) was accepted in the plan and nothing shipped here changes that: no key uses rich text or HTML, and next-intl escapes interpolated values as React text children.

## Next Phase Readiness

**Ready.** 39-11, 39-12, 39-13, 39-14, 39-15 and 39-16 can now call `t()` against any of the 77 keys with the gate behind them.

Two things downstream plans must honour, both now enforced by the suite:

1. **A 78th `dedup.*` string means a `REQUIRED_DEDUP_KEYS` entry first**, in the right group, with the group's count comment updated, in all three locales. Anything less is a red suite — deliberately.
2. **`audit.entry.merged` must stay at two children.** `AuditEntry` builds its predicate as ``t(`entry.${action}.${entityType}`)``, so a third entity type reaching the merge writer renders a dot-path to the user. The writer must be constrained at the type level (`MergeableEntityType = "organization" | "person"`); the contract list is only the copy half of that constraint, and it cannot stop a bad `entityType` on its own.

Two carry-forwards for plan 39-11 specifically: it owns the identity-fields settings card that `dedup.identity.*` was written for, and the `dedup.reason.nameIdentity` copy commits the matcher to reading a configured identity custom field — the string is now shipped, so the rule behind it has to be the one that ships too.

## Self-Check: PASSED

- `src/messages/en-US.json` — FOUND
- `src/messages/pt-BR.json` — FOUND
- `src/messages/es-ES.json` — FOUND
- `src/messages/locale-parity.test.ts` — FOUND
- commit `933736f` — FOUND
- commit `ede15e0` — FOUND

---
*Phase: 39-duplicate-detection-merge*
*Completed: 2026-08-19*
