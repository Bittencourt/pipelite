---
phase: 39-duplicate-detection-merge
plan: 21
subsystem: dedup
tags: [dedup, identity-fields, admin-settings, i18n, gap-closure]
gap_closure: true
closes_gaps: [D-39-04]
requires:
  - "39-18: selectIdentityInputFields and its collectability rule (the predicate is extracted from it)"
  - "39-11: the /duplicates identity-field picker and its admin gate"
provides:
  - "isCollectableIdentityField — the ONE implementation of the collectability rule"
  - "collectableIdentityFieldNames — the admin picker's option source"
  - "FieldTypeByName as an exported type"
  - "dedup.identity.unsupported in three locales"
  - "the stranded-configuration affordance in identity-fields-form.tsx"
affects:
  - "/duplicates: the picker now offers 6 labels where it offered 7"
  - "src/messages/locale-parity.test.ts: the dedup contract is 80 keys"
tech-stack:
  added: []
  patterns:
    - "one exported predicate consumed by both the offer side and the collect side, rather than two filters"
    - "an unofferable stored value is APPENDED to a Radix Select's options rather than dropped"
key-files:
  created:
    - src/app/duplicates/__tests__/identity-fields-form-wiring.test.ts
  modified:
    - src/lib/dedup/identity-inputs.ts
    - src/lib/dedup/identity-inputs.test.ts
    - src/app/duplicates/page.tsx
    - src/app/duplicates/identity-fields-form.tsx
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json
    - src/messages/locale-parity.test.ts
decisions:
  - "The write path is NOT hardened (T-39G-17): the picker is a control, not the enforcement. What makes a bad configuration safe is the READ side refusing to collect it."
  - "A stranded stored label is appended to the options and explained, never erased and never hidden."
  - "hasUnsupportedIdentityField takes the OFFERED list, never the option list, where it would be false by construction."
metrics:
  duration: ~65 min
  completed: 2026-08-20
---

# Phase 39 Plan 21: The Identity-Picker Type Filter Summary

The `/duplicates` organization identity-field picker now offers only labels the create dialog can
actually collect, and it offers them through the **same predicate** the dialog applies rather than
through a second filter of its own — so the two cannot drift into disagreeing again.

## What Changed

Plan 39-18 made the configured organization identity fields collectable at create time and, in the
same commit, created a new asymmetry it recorded in its own module header: the picker offered EVERY
organization field label with no type filter, while `identityValue` in `matching.ts` returns `""`
unless `typeof raw === "string"`. After 39-18, a text identity field worked and a non-text one
silently did nothing — an admin could choose `Tier`, see `Identity fields saved.` and get no check at
all. Before 39-18 no configuration worked, so the asymmetry was genuinely new, and it lived in the one
control that turns the feature on.

**The deliverable is one predicate with two callers, not a filter in the form.** Two independently
maintained type filters would disagree on the shared-name case 39-18 discovered — a label whose two
active definitions disagree about type is collectable by neither side — and that disagreement would
rebuild the defect one layer up.

| Piece | Where |
|---|---|
| `isCollectableIdentityField(label, definitions)` | `src/lib/dedup/identity-inputs.ts` — the rule, extracted from `selectIdentityInputFields`' loop |
| `collectableIdentityFieldNames(definitions)` | same file — the picker's option source: distinct admitted names, definition (`position`) order, **not** capped at `ORG_IDENTITY_FIELDS_MAX` |
| `selectIdentityInputFields` | same file — now *calls* the predicate instead of restating it |
| `readOrgFieldNames` | `src/app/duplicates/page.tsx` — projects through `collectableIdentityFieldNames(definitions)` |
| `selectableOptions` / `hasUnsupportedIdentityField` | `src/app/duplicates/identity-fields-form.tsx` — local, prop-only, no import from `src/lib/dedup/` |
| `dedup.identity.unsupported` | three locales; `dedup.identity.help` amended to say **text** custom fields |

## Measured Offered-Label Counts

Read-only `SELECT` against the live dev database (`docker exec` on the already-running container — no
`docker compose up`, no restart):

```
8 rows for entity_type='organization', deleted_at is null
7 distinct names
6 distinct names whose EVERY row is text
```

**7 offered before → 6 after. `Tier` (`multi_select`, position 1) is the one that drops** — a field
that could never have worked. This agrees exactly with the orchestrator's figure, including the
shared-name case: `Segmento Organização` has two active rows, both `text` (positions 15 and 18), so it
is one label offered once, on both sides.

`app_settings` holds **zero** `dedup%` rows and was left that way. The stranded-configuration path
stays a designed path covered by unit assertions rather than a live state manufactured on a shared
database.

## The Stranded Configuration, As Shipped

A stored setting naming a label the picker can no longer offer is **neither erased nor hidden**:

1. **Appended, not dropped.** `selectableOptions(fieldNames, configured)` puts the offered labels
   first (so the normal case reads in `position` order and the stranded entry is visibly an appendix),
   then any non-empty configured label not among them. Without this, `<Select value={primary}>` has no
   matching `SelectItem` and Radix renders an **empty trigger** — telling the admin their
   configuration is gone while `app_settings` still holds it, and inviting a "corrective" save that
   really would erase it.
2. **Nothing is written on render.** All three `useState` initialisers still seed from `configured`, so
   `saved` still holds the stored pair, `changed` is false and Save stays disabled. This was already
   true; G5 is what keeps it true, because seeding from the *offered* list is exactly the fix a reader
   reaches for when a trigger blanks.
3. **Explained once, from the catalog.** `Alert variant="default"` beneath the help paragraph, its id
   added to both selects' `aria-describedby`. Never `destructive` (C-1): nothing the admin did failed
   and nothing is lost — the field simply is not being checked.

Both helpers answer honestly for **both** reasons a label can be unofferable — a non-text type, and a
definition renamed or deleted after being configured — and the copy covers both rather than claiming
the cause is always the type.

## The Picker Is A Control, Not The Enforcement (T-39G-17)

**The write path was deliberately not hardened, and that is the correct outcome rather than a gap.**
`saveOrgIdentityFields` → `writeOrgIdentityFields` validates the submitted array's *shape* through zod
and has never validated type, so a crafted POST can still store a `multi_select` label. Filtering two
selects does not change that and was never going to.

What makes a bad configuration safe is **the read side refusing to collect it**:
`selectIdentityInputFields` drops the label, no input renders, `identityValue` never sees a string, and
the certain tier does not fire. The configuration degrades to *exactly* the unconfigured behaviour.
Adding type validation to a settings write would mean a definitions read inside a settings write, for
an outcome the read side already makes safe. All six `/duplicates` server actions gate on
`role !== "admin"` (39-11), so the only actor who could do this is an admin storing a setting the read
side then refuses.

**This plan removes a way to make a mistake, not a way to attack.**

## Probes — All Six Run, With Real Output

### Task 1

| Probe | Predicted | Actually failed |
|---|---|---|
| (a) drop `matching.length === 0` from the predicate | the empty-array case, the unknown-label case, **and** the equivalence test | 4 tests: 39-18's `drops a configured label that no active definition describes`, `refuses a name NO definition carries`, `refuses ANY name against an EMPTY definitions array`, and the equivalence test **for `FIELD_E` only** |
| (b) `collectableIdentityFieldNames` returns the unfiltered `definitions.map(d => d.name)` | the non-text case, the dedup case, and the equivalence test | 5 tests: `excludes a non-text name`, `returns a name shared by TWO TEXT definitions exactly ONCE`, `excludes a shared name whose definitions disagree`, and the equivalence test for `FIELD_B` and `FIELD_D` |
| (c) revert `page.tsx` to the unfiltered projection | **nothing** | nothing — 42/42 still passed, and no test file in the repo reads `duplicates/page.tsx` |

### Task 2

| Probe | Predicted | Actually failed |
|---|---|---|
| (a) feed `hasUnsupportedIdentityField` the `options` | G3, on the zero-occurrences-of-`options` half | G3 — see the deviation below; after the fix, both halves fire, including the named one |
| (b) `selectableOptions(fieldNames, [])` | G2, on the missing `configured` | G2: `expected 'fieldNames, []' to contain 'configured'` |
| (c) remove the key from `REQUIRED_DEDUP_KEYS` | the exact-set assertion for all three locales **and** the length pin | both, exactly: `expected […] to have a length of 80 but got 79`, plus `dedup key set in {en-US,es-ES,pt-BR}.json diverges from the checked-in contract` |
| (d) hardcode an English sentence in place of `t("identity.unsupported")` | G4's exact-expression assertion | G4: `expected '"use client"…' to contain 't("identity.unsupported")'` |

### Probe (a): the equivalence test's honest limit, measured rather than reasoned

**The plan predicted the equivalence test would stay GREEN under probe (a) and it did not — it went
red, for a reason more specific than either prediction.** Reported plainly because the plan asked for
exactly that, and because the real answer is more useful than the predicted one:

Four of the five candidates — `FIELD_A`, `FIELD_B`, `FIELD_C`, `FIELD_D`, i.e. **every label the
fixture's definitions actually carry** — kept agreeing and stayed green with the shared predicate
broken. Only `FIELD_E`, the label carried by nothing, went red. The reason:
`collectableIdentityFieldNames` **iterates the definitions**, so a label no definition carries can
never enter its result whatever the predicate says, while `selectIdentityInputFields` iterates the
**configured** list and asks the predicate about a label that is not there. The two callers' iteration
*domains* differ, and that difference is the only part of a broken shared rule the equivalence test can
see.

So the plan's core reasoning holds — the equivalence test catches a rule wrong in ONE place, not a rule
wrong in the SHARED place — and it is 4/5 blind rather than 5/5 blind. The plan's insistence on
including a label carried by nothing in the candidate set turned out to be load-bearing for a reason
beyond the one it gave. Probe (b), where only one side changed, is what proves the test is not vacuous:
there it discriminated on both `FIELD_B` and `FIELD_D`.

This finding is recorded in the test file's own header, replacing the claim I had written there before
running the probe (see deviations).

### Probe (c) of task 1: stated explicitly, because a reader will assume otherwise

Reverting `page.tsx` broke **nothing**. No unit test in the repository reads `duplicates/page.tsx` —
`grep -rln "duplicates/page.tsx" src/` returns only a component and a comment. That is precisely why
task 2 carries G1 as a call-site assertion on that exact line, and why G1's anti-vacuity partner
(`getActiveFieldDefinitions` still present, `readOrgFieldNames` still present) matters: without it a
page that stopped reading the definitions entirely would satisfy the `definition.name` zero.

## Deviations from Plan

**1. [Rule 1 - Bug] G3's three sub-assertions made `expect.soft`.**
- **Found during:** Task 2, probe (a) — the plan's headline probe.
- **Issue:** The plan requires probe (a) to fail G3 "on the zero-occurrences-of-`options` half".
  With hard assertions it failed on the *`fieldNames`* half first (`expected 'options, configured' to
  contain 'fieldNames'`) and the zero-occurrences assertion — the one carrying the reasoning — never
  executed. The gate caught the inversion, but the evidence that its named mechanism discriminates was
  invisible.
- **Fix:** `expect.soft` for all three, so every half reports. Probe (a) re-run: both fire, including
  `hasUnsupportedIdentityField fed 'options' is false by construction — the sentence would be
  unreachable: expected 1 to be +0`.
- **Files modified:** `src/app/duplicates/__tests__/identity-fields-form-wiring.test.ts`
- **Commit:** `1d86500`

**2. [Rule 1 - Bug] A comment I wrote was falsified by my own probe, and was corrected rather than
shipped.**
- **Found during:** Task 1, probe (a).
- **Issue:** The equivalence describe's header, written before the probe ran, asserted "Breaking the
  shared predicate leaves both sides wrong together and this test green." Probe (a) measured that this
  is true for 4 of 5 candidates and false for the fifth. This phase has already shipped two false
  comments (45-06's unreachable-path claim, 39-20's `humaniseColumn` claim); a third would have been
  worse than none.
- **Fix:** Reworded to state what was measured, including *why* `FIELD_E` is the one candidate that
  surfaces it, and why it must stay in the candidate list.
- **Files modified:** `src/lib/dedup/identity-inputs.test.ts`
- **Commit:** `db59ccc`

**3. [Implementation choice, stated because it is load-bearing for two assertions] The two form
helpers are arrow-function `const`s, not `function` declarations.**
`callArguments(source, callee)` matches the marker `callee(`, which a `function selectableOptions(`
declaration also satisfies — the character before the marker is a space, not `[A-Za-z0-9_$]`. Declared
with `function`, G2 and G3 would each see **two** call sites (the parameter list and the real call) and
the plan's `toHaveLength(1)` would be wrong. As `const selectableOptions = (…) =>`, the marker appears
exactly once, at the call. The plan's assertions hold as written.

**4. `docker compose exec` could not be used for the read-only SELECT.** From inside the worktree the
compose project name derives from the worktree directory, so `docker compose ps` reports 0 services
while `pipelite-postgres-1` is up. Used `docker exec -i pipelite-postgres-1 psql …` instead — the same
read-only SELECT, no `compose up`, no restart. `pipelite-app-1` was still `Up 19 hours` afterwards, so
plan 39-19's free RED from the pre-39-18 image is intact.

**Nothing else deviated.** No migration, no dependency change, no `shadcn add`, no Docker rebuild, no
container restart, no write to the dev database, no `e2e/` change, no touch to `source-scan.ts` or to
39-18's gate file, and no new brace matcher.

## Comment Blocks Reworded, Not Deleted

Three, per T-39G-20 — plus one more the probes forced (deviation 2):

1. `identity-inputs.ts`' "A KNOWN RESIDUAL ASYMMETRY" paragraph. That residual is closed, so the
   paragraph would have been actively false. Reworded to name `collectableIdentityFieldNames` as the
   picker's source, `/duplicates/page.tsx` as the consumer, and to state that both sides share one
   predicate so the picker cannot offer what the dialog refuses. A second new paragraph records
   T-39G-17 — the picker is a control, the read side is the enforcement.
2. The form's "HARD BOUNDARY" header. **The boundary still holds exactly as written** — this plan
   imports nothing from `src/lib/dedup/` into the client file, both helpers are local, and
   `MAX_IDENTITY_FIELDS` remains a restated mirror. What changed is the *content* of the `fieldNames`
   prop, so a paragraph was added saying the filter runs on the server in `readOrgFieldNames` and
   where to look for the rule. A reader of the form alone could not otherwise tell.
3. The form's dedup paragraph. It presented the client-side `new Set` as *the* workaround for the two
   active `Segmento Organização` rows. Now recorded: the server collapses shared names too, so the
   client dedup survives as a **second belt** inside `selectableOptions`; the data anomaly is still
   unfixed and still worth naming; and a shared name whose definitions **disagree** is a new **third
   outcome** — dropped rather than collapsed.
4. `selectIdentityInputFields`' own doc comment no longer restates the rule, and says why: a second
   copy of it in that loop is exactly how the two sides would drift.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run src/lib/dedup/identity-inputs.test.ts` | 42 passed (22 pre-existing, unedited; 20 new) |
| `npx vitest run …/identity-fields-form-wiring.test.ts …/locale-parity.test.ts …/identity-inputs.test.ts` | 67 passed, 0 failed |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 125 warnings (baseline 127 — not above) |
| `npm run test` | 128 files / 2743 passed, 1 file / 21 skipped; plus the RSC project's 2 files / 8 passed (39-18 baseline: 127 / 2703) |
| `git diff --stat package.json package-lock.json` | empty |
| `git diff --stat .github/workflows/ci.yml` | empty |
| `git diff --stat e2e/` | empty |
| drizzle journal | still ends at `idx: 17`; last migration `drizzle/0017_dedup_schema.sql` |
| `src/messages/*.json` | one new leaf each, one amended value each |
| dev database | READ ONLY — one `SELECT`; `app_settings` untouched and still holding zero `dedup%` rows |
| Docker | NO rebuild, NO restart; `pipelite-app-1` still `Up 19 hours` |

## Commits

| Commit | Message |
|---|---|
| `5c36b22` | `test(39-21): the one-predicate contract and the picker/dialog equivalence test` |
| `db59ccc` | `feat(39-21): one collectability predicate, consumed by the picker and the dialog` |
| `e7265a2` | `test(39-21): the picker's wiring gate and the stranded-configuration rules` |
| `1d86500` | `feat(39-21): the picker offers only collectable labels, and says so when one is stranded` |

## Known Stubs

None. Every surface this plan touches is wired to a real data source: the picker's options come from
`getActiveFieldDefinitions` through the shared predicate, and the Alert's condition is computed from
the same two props the selects render.

## Notes For The Verifier

- **No visual confirmation was taken, deliberately.** Plan 39-19 runs after this one and owns the
  phase's only Docker rebuild and only full Playwright run, so rebuilding here would have destroyed
  its free RED. The unit gates and the read-only SELECT are this plan's instruments.
- **The stranded case is not reachable in the browser today** and should not be made so: it requires a
  stored `dedup.organization_identity_fields` value, and `app_settings` is deliberately unconfigured.
  Its three rules are pinned by G2, G3, G4 and G5 instead.
- **G1 is the only assertion covering `page.tsx`.** Task 1's probe (c) proved nothing else does.

## Self-Check: PASSED

All ten files named above exist on disk. All four commit hashes exist in `git log`. No file deletions
in any of the four commits (`git diff --diff-filter=D HEAD~4 HEAD` is empty) and no untracked files
left behind.
