---
phase: 39-duplicate-detection-merge
plan: 20
subsystem: i18n
tags: [i18n, next-intl, audit, dedup, locale-parity, message-keys]

# Dependency graph
requires:
  - phase: 36-audit-log
    provides: AUDIT_FIELD_LABELS, describeField, humaniseColumn, the audit message namespace
  - phase: 39-duplicate-detection-merge
    provides: "39-04's exact-set locale contract; 39-15's M-4 single-resolver tests; 39-17's checkpoint that observed the leak"
provides:
  - "`audit.field.notes` as the 21st and LAST entry of AUDIT_FIELD_LABELS"
  - "`audit.field.notes` copy in en-US, pt-BR and es-ES"
  - "REQUIRED_AUDIT_KEYS extended to 86 with the exact-set assertion intact"
  - "a presenter-level gate proving describeField('notes') returns a key, not a database word"
  - "NATIVE_ORDER_PREFIX extended to 21, pinning the appended position"
affects: [any future phase adding an audited native column, locale contract changes, merge screen work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mirror-image gate: a deliberate PRESENCE in AUDIT_FIELD_LABELS documented in the same posture as the deliberate ABSENCE beside it"
    - "reword-never-delete applied to a stale COUNT by removing the number from the claim rather than correcting it"

key-files:
  created: []
  modified:
    - src/lib/audit/present.ts
    - src/lib/audit/present.test.ts
    - src/messages/locale-parity.test.ts
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json

key-decisions:
  - "APPEND as the 21st key, never insert: NATIVE_ORDER is the map's insertion order and that index is the display order of native columns in every record timeline."
  - "Extend REQUIRED_AUDIT_KEYS; do NOT relax the exact-set assertion to a subset check. The pin was extended deliberately, per 39-GAPS.md."
  - "Do NOT add notes to MERGE_EXCLUDED_COLUMNS. The brief requires the label translated, and excluding the column would hide a real value difference from the person deciding a merge."
  - "One shared message key, not per-entity keys. All four CRM tables carry notes and it means the same free text on each; no gender agreement is involved, unlike the audit.entry.* predicates."
  - "Change nothing in field-groups.ts, audit-entry.tsx or duplicates/[pairId]/page.tsx. The M-4 single resolver resolves correctly the moment the key exists; a second change there would be a second field-label map by another name."
  - "notes stays out of DATE_COLUMNS, NUMBER_COLUMNS and AUDIT_REFERENCE_COLUMNS — it is free text and nativeKind 'auto' is correct."

patterns-established:
  - "Stale-count remedy: when a comment's NUMBER is what keeps going stale, reword to remove the number and keep the rule, rather than incrementing the number."
  - "Probe-expectation verification: a plan's predicted failure COUNT is itself an assertion to be checked against the gate's own documented design, not trusted."

requirements-completed: [DEDUP-03]

# Metrics
duration: 34min
completed: 2026-08-20
---

# Phase 39 Plan 20: audit.field.notes in Three Locales Summary

**`notes` was audited from Phase 36 onward with no `AUDIT_FIELD_LABELS` entry, so `describeField` fell through to `humaniseColumn` and every locale rendered the English word "Notes"; this appends the 21st message key, extends the exact-set locale pin, and gates both halves of the chain.**

## Performance

- **Duration:** ~34 min
- **Started:** 2026-08-20T01:04Z
- **Completed:** 2026-08-20T01:38Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments

### Task 1 — the key, the contract, and all three catalogs (`72fe556`)

- `audit.field.notes` added as the LAST leaf of `audit.field` in all three catalogs: en-US `"Notes"`, pt-BR `"Notas"`, es-ES `"Notas"`.
- `REQUIRED_AUDIT_KEYS` extended with the dot-path at the end of the Field-labels group. **The exact-set assertion is unchanged in kind** — still `toEqual` on the sorted key set for each of the three locales, not relaxed to a subset check.
- Three prose counts corrected: 83 → 84 keys in the `audit` namespace (85 → 86 total), Field labels 22 → 23, and the Phase 39 provenance sentence **reworded, not replaced**, to record 39-20's fifth key and why the leak survived three phases of passing locale gates.
- `IDENTICAL_TRANSLATION_ALLOWED` deliberately untouched. `untranslatedInBoth` compares each locale against **en-US**, not the two locales against each other, so "Notas" / "Notas" against "Notes" does not satisfy it. This was verified by running the gate, not by predicting it (UI-SPEC L-4).

### Task 2 — the presenter stops printing a database word (`d0598f7` RED, `ea0928e` GREEN)

- New `describe("the free-text notes column")` block placed beside the soft-delete block, in the same posture: pure functions through the real public entry point, catalog copy read straight from the imported JSON, no new source-scan gate and no new file.
- Four assertions: `describeField("notes").label` is the key; `buildAuditFieldChanges(...)[0].label` is the key **and explicitly not `"Notes"`**; `describeField("notes").group` is `0`; and the copy is a non-empty string in all three catalogs.
- The block's header spells out the full chain, since no unit test can render a page: step 1 (`describeField` returns the key) and step 3 (`tRoot.has` is true iff the catalog carries the leaf) are asserted here; step 2 (`resolveLabel` translates whatever it can find and holds no map of its own) is **cited** to 39-15's M-4 tests rather than duplicated.
- `notes: "audit.field.notes"` appended as the 21st and last map entry. `NATIVE_ORDER_PREFIX` extended with `"notes"` — extended, not bypassed — so the appended position is itself checked in.
- `deletedAt` remains absent from the map; its gate at `present.test.ts:708` and `deleted-at-wiring.test.ts` are untouched and green.

## The one real ordering consequence

Recorded rather than glossed, because "no ordering change at all" would be false.

`notes` moves from `group 1, rank 0` (the unmapped-column fallback) to `group 0, rank 20`. Since `compareChanges` sorts by group, then rank, then `label.localeCompare`, then field:

- Against every **mapped native column**: unchanged. It was after all of them (group 1 > group 0) and it is still after all of them (rank 20 is the highest rank in group 0).
- Against every **custom field**: unchanged. Custom fields are group 2, which is after both.
- Against another **unmapped native column in the same entry**: **this is the change.** `notes` now sorts before it by group, where previously the two were both group 1 rank 0 and were tie-broken by `label.localeCompare`. Today the only such column is `deletedAt`, which `audit-entry.tsx` intercepts and renders as a translated sentence with no value cell — so nothing visible moves, but the sort order itself genuinely changed and a future unmapped column would land after `notes` rather than being alphabetised against it.

The pin (`REQUIRED_AUDIT_KEYS`) was extended **deliberately**, per `39-GAPS.md`'s must-hold list, and the exact-set assertion that made the extension necessary was kept exactly as strong as it was.

## Negative proofs — all five RUN, each failing by name, each restored

### Task 1

| Probe | Expected | Observed |
|-------|----------|----------|
| (RED) dot-path in the contract, catalogs not yet | contract fails | **3 tests failed**: missing-key, non-empty-string, and the exact-set contract for all three locales (`expected […84] to deeply equal […85]`) |
| (a) `audit.field.notes` removed from pt-BR only | exact-set fails naming pt-BR **and** the cross-locale identity check fails | **Both fired.** `audit key set in pt-BR.json diverges from the checked-in contract` **and** `audit key set differs in pt-BR.json`, plus `pt-BR.json key set diverges from en-US.json`. Not one but three distinct instruments. |
| (b) dot-path removed with all three catalogs present | exact-set fails for all three locales | Fired for all three. This is the direction that would have let the key ship ungated, and it is the whole reason the list is checked in. |

### Task 2

| Probe | Expected | Observed |
|-------|----------|----------|
| (a) map entry removed | 1, 2, 3 fail; 1 and 2 report `"Notes"` | **6 failures.** `expected 'Notes' to be 'audit.field.notes'` twice, `expected 1 to be +0` once, plus the length guard, the prefix guard and the anti-vacuity guard. |
| (b) entry INSERTED after `name` instead of appended | `NATIVE_ORDER_PREFIX` order guard fails | Fired: `expected ['title','name','notes',…] to deeply equal ['title','name','firstName',…]`. **One failure, not the four the plan predicted — see deviation 1.** |
| (c) pt-BR and es-ES set byte-identical to en-US | `untranslatedInBoth` flags the new key | Fired: `expected ['audit.field.notes'] to deeply equal []`. |

## Deviations from Plan

### 1. [Rule 3 — stale plan expectation, corrected] Probe (b) produces ONE failure, not four; the guard is not narrowed

- **Found during:** Task 2, probe (b).
- **Issue:** The plan stated "45-06 recorded that an insertion produces four failures, so a single failure means the guard has been narrowed." The insertion produced exactly one failure. Under the plan's own criterion this would have meant the guard was compromised.
- **Investigation:** I did not accept the count on either side. `present.test.ts:636-637` — the order guard's own checked-in doc comment — states that a reordering "silently changes which three fields a reader sees first **and nothing else in the suite would notice**." That is the file's own documented design: the prefix guard is the *sole* instrument for a pure reorder. And the mechanism confirms it — an insertion changes neither the key count nor the key set, so `toHaveLength(21)` still passes, `toEqual(expected)` is documented at `:630-631` as "entirely blind to order", the anti-vacuity `>= 21` still passes, and my three new assertions are about *labelling*, which is position-independent and correctly so. Inserting after `name` shifts ranks by +1 uniformly and leaves every mapped column's *relative* order intact, so nothing else can see it.
- **Conclusion:** One failure is the **designed** outcome. The plan's "four failures" was carried over from 45-06, whose change also *removed* a key and therefore additionally tripped the length and contents assertions — a different change with a different blast radius. This is exactly the failure mode the plan's own `assertion_quality` section warned about ("a stale assertion in this phase propagated into three documents while proving nothing"), arriving in the plan's own text.
- **Action:** No code change. The expectation was corrected, evidence recorded here and in `ea0928e`'s message. The guard discriminates correctly.

### 2. [Documentation] Each locale JSON shows `2 insertions, 1 deletion`, not the "1 insertion per file" the plan's verification predicted

- **Found during:** Task 1.
- **Issue:** `git diff --stat src/messages/*.json` shows `3 ++-` per file.
- **Cause:** Mechanical and unavoidable. The plan mandated placing the leaf **last**, so the previously-final line (`restoredFromTrash`) must gain a trailing comma. That is one line changed plus one line added per file.
- **Action:** None. Exactly one leaf was added per file, which is what the constraint meant. Recording the diffstat arithmetic so a verifier does not read it as a second edit.

### 3. [Rule 1 — self-inflicted, caught and reverted] A too-broad `sed` during probe (c) hit two unrelated keys

- **Found during:** Task 2, probe (c).
- **Issue:** `sed -i 's/"notes": "Notas"/"notes": "Notes"/'` was intended to hit only `audit.field.notes`, but `organizations.notes` and `people.notes` (the form-field labels, correctly "Notas" in both locales) matched the same pattern and were also rewritten.
- **Fix:** Caught immediately from the tool's own change report. Both files restored with a file-scoped `git checkout -- src/messages/pt-BR.json src/messages/es-ES.json` (not a blanket reset), and the probe redone with a precise two-line `Edit` anchored on `restoredFromTrash` so only the audit leaf changed. Re-verified: the probe's diffstat was then exactly `1 +-` per file, and `organizations.notes` / `people.notes` read "Notas" again in both locales.
- **Net effect on the commits:** None — the collateral edit never reached a commit, and the final tree has the two form labels untouched.
- **Note for future executors:** in these catalogs `"notes"` is a leaf name in at least three separate namespaces. Anchor any edit on its parent, never on the leaf alone.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/messages/locale-parity.test.ts` | 9/9 green, all four exact-set contracts intact |
| `npx vitest run src/lib/audit/present.test.ts` | green, incl. the 45-06 order guard and the untouched soft-delete block |
| `deleted-at-wiring.test.ts`, `merged-entry-wiring.test.ts`, `merge-form-wiring.test.ts` | green (135/135 across the five gate files) |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 125 warnings (baseline 127 — below, not above) |
| `npm run test` | 126 files passed / 1 skipped; 2678 tests passed / 21 skipped |
| `git diff --stat package.json package-lock.json` | empty |
| `ls drizzle/*.sql \| tail -1` | `0017_dedup_schema.sql` — no `0018` |
| Docker | not rebuilt, not restarted; no database read or written |

## Success Criteria

1. `audit.field.notes` a non-empty string in all three locales and a dot-path in `REQUIRED_AUDIT_KEYS` — **met**.
2. Exact-set assertion unchanged in kind and still passing; both task-1 probes ran and failed — **met**.
3. `describeField("notes")` returns `"audit.field.notes"` with `group: 0`, and `buildAuditFieldChanges` agrees — **met**.
4. `notes` the 21st and LAST key; `NATIVE_ORDER_PREFIX` pins it there; the insertion probe fails the order guard — **met** (see deviation 1 on the failure count).
5. `humaniseColumn`'s comment records that `notes` used to reach the fallback, still names `deletedAt`, still points at `audit-entry.tsx`, still makes no unreachability claim — **met**, both raw-source gates green.
6. `deletedAt` still absent from the map, its gate untouched — **met**.
7. All three prose counts corrected; provenance sentence reworded not replaced — **met**.

## Notes for the Verifier

- **The browser check that this plan cannot do.** No unit test renders a page. The chain is proven in three links: `describeField` returns the key (gated here), `resolveLabel` translates any label `tRoot.has()` finds and holds no map of its own (gated by 39-15's M-4 tests), and `tRoot.has()` is true per-locale exactly when the catalog carries the leaf (gated here). If a human re-runs 39-17's step 8, the merge screen's third field label should read **Notes / Notas / Notas** by locale.
- **Not fixed, and correctly so:** the loser's empty `{name}` in its own `merged` timeline row. Explicitly out of scope — it needs a 5th and 6th `audit.entry.merged.*` key and would break 39-04's exactly-four pin, and the row is currently unreachable because the detail page filters `isNull(deletedAt)` before `notFound()`.
- **Threat register:** T-39G-13 and T-39G-14 (tampering with the locale contract and with the native display order) are both *mitigated by probes that were actually run*, not by prose. T-39G-16 (a stale comment misleading the next reader) is mitigated by the reword, and deviation 1 is a live instance of that same failure mode caught in the plan's own text. T-39G-SC: nothing installed, `package.json` and `package-lock.json` byte-identical.
- **Out-of-scope files confirmed untouched:** `src/app/organizations/**`, `src/lib/dedup/identity-inputs.*`, `identity-fields-form.tsx`, `src/app/duplicates/page.tsx`, `src/lib/dedup/field-groups.ts`, `src/components/timeline/audit-entry.tsx`, `src/app/duplicates/[pairId]/page.tsx`.

## Known Stubs

None. No placeholder, no empty-value fallback, no deferred wiring.

## Threat Flags

None. This plan changes one LABEL. No endpoint, auth path, file access or schema was added or altered; the `notes` VALUE already rendered on both surfaces behind their existing gates (`/duplicates/*` is admin-only via `layout.tsx`'s double gate; the record timeline is the record's own page).

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `72fe556` | feat | `audit.field.notes` in three locales and the extended pin |
| `d0598f7` | test | RED: notes must be labelled by a key, not by a database word |
| `ea0928e` | fix | append notes to `AUDIT_FIELD_LABELS`, closing D-39-03 |
</content>
