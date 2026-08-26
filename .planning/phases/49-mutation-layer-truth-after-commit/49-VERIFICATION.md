---
phase: 49-mutation-layer-truth-after-commit
verified: 2026-08-26T16:24:03Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 49: Mutation-Layer Truth After Commit Verification Report

**Phase Goal:** What the four entity mutations leave behind is what they told the user they would —
a purge removes the bytes and the route that served them, a merge leaves the survivor's formulas
consistent, and a create response carries what a read would.
**Verified:** 2026-08-26T16:24:03Z
**Status:** passed
**Re-verification:** No — initial verification

## Method

This report does not trust `SUMMARY.md`/`ROADMAP.md` narrative. Every claim below was checked
against the actual tree: reading the implementation files named by the plans, reading the review
(`49-REVIEW.md`) and the fix-pass commits it produced, and **running** the relevant test files
directly (not reading their names) to confirm they pass on the current tree. Where the ROADMAP/
STATE/BACKLOG record a limitation or a refusal, that record was checked against the code for
whether it is still true (i.e., not quietly upgraded).

## Goal Achievement

### Observable Truths (roadmap Success Criteria 1-4)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1 — under `FILE_STORAGE=local`, a file URL whose record the caller may not see, or which no longer exists, returns no bytes on both GET and DELETE; the route resolves the entity first | ✓ VERIFIED (local only, as amended) | `src/lib/api/file-access.ts` (`findOwnedRecordById`, `recordReferencesStoredName`, `resolveContainedPath`) wired into `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` GET/DELETE. Ran `route-containment.test.ts` → **52/52 passed**; ran `files-route-ownership.db.test.ts` against real PostgreSQL and a real filesystem → **18/18 passed**, including the foreign-record 404 with zero bytes, the DELETE-survives-on-disk assertion, and the exploit reproduction (removing the ownership term serves the victim's bytes again). SC-1's S3 exclusion (`SEC-49-A`) is still accurately stated: `src/app/api/upload/route.ts:89` still stores `publicUrl` as `${S3_PUBLIC_URL}/${key}` for S3, bypassing the guarded route — confirmed in code, not claimed fixed anywhere. |
| 2 | SC-2 — after a purge the blob is gone and its URL serves nothing; an injected storage failure leaves the purge COMMITTED and logs a count mismatch | ✓ VERIFIED | All four purge mutations (`organizations.ts`, `people.ts`, `deals.ts`, `activities.ts`) collect blob refs via `collectFileFieldRefs` under `SELECT … FOR UPDATE` inside the transaction and delete the bytes via `deleteEntityFiles` **post-commit**, in a `try/catch` that never rethrows. Ran `purge-blobs.db.test.ts` → **29/29 passed** (four entity types, the URL going dark, and the injected `EISDIR` failure leaving the purge committed with a logged mismatch). |
| 3 | SC-3 — merging two records whose formula inputs disagree leaves the survivor's stored formula value equal to a fresh computation from its post-merge values | ✓ VERIFIED — on the record's own corrected, wider evidence | The sign-off (`49-09`) originally verified this only for the case where the survivor adopts the loser's formula **input** (74→174). A post-signoff code review (`49-REVIEW.md` WR-01) found this false when the survivor adopts the loser's formula **output** via the `filledOnly` default with no user action: stored 574 (the loser's own value) against a fresh computation of 122 from the survivor's actual inputs. Fixed in `80b5098`/`429166f`; confirmed in code at `src/lib/dedup/field-groups.ts` (`isFormulaMergeValue` now refuses a stored formula result as a compared/adoptable merge key) and `src/lib/mutations/dedup.ts` (`loserHeldADifferentFormulaValue` pushes `CHANGED_FIELDS_CUSTOM_SENTINEL` so the post-commit recalculation still fills a genuinely-blank formula key). Ran `dedup-formula.db.test.ts` → **18/18 passed**, including the three WR-01 cells that reproduce the exact 574-vs-122 scenario in both directions (adoption case recomputes to 122; explicit `loser` choice on the formula key is refused; a genuinely-changed input still yields the mixture 174, so the fix did not degenerate into "never touch the formula key"). The re-open/re-close is itself documented transparently in `ROADMAP.md`, `STATE.md` and `49-09-SUMMARY.md` (original verdict text kept, correction appended) — the record does not hide its own miss. |
| 4 | SC-4 — a `POST /api/v1/{organizations,people,deals,activities}` 201 body carries the same custom-field values a subsequent GET returns, for all four entities | ✓ VERIFIED | All four `/api/v1/*/route.ts` POST handlers now issue a canonical `findFirst` re-read after insert+recalc and serialize that, not the `.returning()` row. Ran `create-response-canonical.db.test.ts` against real PostgreSQL through real `withApiAuth` → **23/23 passed**, for all four entities, with per-entity ablation controls (reverting one entity's re-read reddens only that entity's cell) and a manufactured `type='formula'` definition per entity so the comparison is non-vacuous. The recorded limitation (`DATA-49-A` — nothing discriminates the canonical read from the rejected in-process merge; ablation 5 passes 23/23 and 5b, sabotaged further, is still 23/23) is still accurately stated: this is inherent to the recalc writing exactly one column, not a gap anyone tried to hide. |

**Score:** 4/4 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/__tests__/custom-field-definition-fixture.ts` | subject-manufacturing fixture | ✓ VERIFIED | Exists; used by 49-05, 49-08 db tests, exercised in test runs above |
| `src/lib/trash/{collect-file-field-refs,delete-entity-files,purge-sentinel,prune}.ts` | blob enumeration, deletion, purge-sentinel, retired gap comment | ✓ VERIFIED | `purge-sentinel.ts` exports `NOT_IN_TRASH_INSIDE_TRANSACTION`, imported by all four mutations; `prune.ts` comment no longer claims blobs are unhandled (confirmed by direct read) |
| `src/lib/mutations/{organizations,people,deals,activities}.ts` | post-commit blob deletion, `.returning({id})`-gated row DELETE | ✓ VERIFIED | Confirmed identical shape across all four files: `SELECT … FOR UPDATE` inside tx, `.returning({id: table.id})` on row DELETE with `purged.length === 0` throwing `NOT_IN_TRASH_INSIDE_TRANSACTION`, post-commit `deleteEntityFiles` in `try/catch` |
| `src/lib/mutations/dedup.ts` | post-commit survivor recalculation | ✓ VERIFIED | `survivorChangedFields` built from bare names/column names, `CHANGED_FIELDS_CUSTOM_SENTINEL` pushed on `loserHeldADifferentFormulaValue`, `cascade: false`, wrapped in try/catch (D-05) |
| `src/lib/dedup/field-groups.ts` | file- and formula-typed keys excluded from compared merge fields by value shape | ✓ VERIFIED | `isFileMergeValue` (CR-02) and `isFormulaMergeValue` (WR-01) both present and wired into `buildMergeFieldGroups`'s key loop |
| `src/app/api/v1/{organizations,people,deals,activities}/route.ts` | canonical read after create | ✓ VERIFIED | All four POST handlers issue `db.query.<entity>.findFirst` with owner+not-deleted predicate before `createdResponse`; `people`/`deals` fall back to `{...row, customFields: recalculatedCustomFields}` on a miss, `organizations`/`activities` fall back to the pre-recalc row (documented as `DEF-49-08`, not silently claimed fixed) |
| `src/components/custom-fields/file-field.tsx` | `handleDelete` checks `res.ok` before dropping the descriptor | ✓ VERIFIED | CR-03 fix present at the exact line reviewed |
| `src/lib/custom-fields.ts` `saveFieldValues` | `isNull(deletedAt)` on read+write, `.returning({id})` + rowcount check on the UPDATE | ✓ VERIFIED | Confirmed at lines ~268-309; deliberately no owner term, reasoned in-comment (`DEF-49-07`) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| file route GET/DELETE | `findOwnedRecordById` | entity resolution before storage access | WIRED | Confirmed in route source and exercised by both test files |
| purge mutations | `collectFileFieldRefs` / `deleteEntityFiles` | pre-collected-under-lock refs, post-commit deletion | WIRED | Confirmed identically in all four mutation files |
| `dedup.ts` merge | `recalculateFormulas` (survivor) | post-commit, `cascade:false`, sentinel-augmented `changedFields` | WIRED | Confirmed and behaviourally proven by `dedup-formula.db.test.ts` |
| `/api/v1/*` POST | canonical `findFirst` | re-read of the just-recalculated row | WIRED | Confirmed in all four route files and proven behaviourally |

### Behavioral Spot-Checks (executed directly, not read from SUMMARY)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SC-3 fix (574 vs 122) | `vitest run --config vitest.db.config.ts src/lib/mutations/dedup-formula.db.test.ts` | 18/18 passed | ✓ PASS |
| SC-2 purge/blob deletion | `vitest run --config vitest.db.config.ts src/lib/trash/purge-blobs.db.test.ts` | 29/29 passed | ✓ PASS |
| SC-4 canonical read | `vitest run --config vitest.db.config.ts src/app/api/v1/__tests__/create-response-canonical.db.test.ts` | 23/23 passed | ✓ PASS |
| SC-1 route containment (handler-level, mocked db) | `vitest run src/app/api/files/__tests__/route-containment.test.ts` | 52/52 passed | ✓ PASS |
| SC-1 route ownership (real PostgreSQL, real filesystem) | `vitest run --config vitest.db.config.ts src/app/api/files/__tests__/files-route-ownership.db.test.ts` | 18/18 passed | ✓ PASS |
| CR-02 field-groups exclusions | `vitest run src/lib/dedup/field-groups.test.ts` | 31/31 passed | ✓ PASS |
| WR-03 custom-fields save guard | `vitest run src/lib/custom-fields.test.ts` | 37/37 passed | ✓ PASS |
| CR-01 regression — 11 exact `toEqual({success:true,detached:N})` still green | `vitest run src/lib/mutations/{organizations,people,deals,activities}.test.ts` | 227/227 passed | ✓ PASS |
| Debt markers in phase-touched files | `grep TBD\|FIXME\|XXX` across all 15 touched core files | 0 matches | ✓ PASS |
| `PurgeResult` type unwidened | direct read of `src/lib/trash/dispatch.ts` | `{success:true;detached:number} \| {success:false;error:string}`, unchanged | ✓ PASS |
| Upload write-side vulnerability (SEC-49-D/DEF-49-06) still open, not silently fixed | direct read of `src/app/api/upload/route.ts` | `session?.user` (not `.user?.id`), no entity resolution, `path.resolve(UPLOAD_DIR, entityId, fieldName)` from unvalidated form fields — unchanged | ✓ CONFIRMED STILL OPEN (as recorded) |
| Tree clean | `git status --short` | empty | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files or plan-declared probes exist for this phase; the phase's proof surface is `*.db.test.ts`/`*.test.ts` files run directly above. Not applicable.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SEC-04 | 49-01, 49-02, 49-04, 49-06, 49-07, 49-09 | A purged record's uploaded files are unreachable — removed from storage, and not served even while they exist | ✓ SATISFIED for `FILE_STORAGE=local` (accurately scoped) | SC-1 + SC-2 evidence above; S3 exclusion (`SEC-49-A`) and upload-write exposure (`SEC-49-D`) both correctly recorded as open, not claimed |
| DATA-01 | 49-01, 49-08, 49-09 | A merge leaves the survivor's formula fields consistent with its post-merge values | ✓ SATISFIED on wider evidence after re-open/re-close | SC-3 evidence above; the record's own self-correction (WR-01) is verified in code, not merely asserted |
| DATA-02 | 49-01, 49-03, 49-05, 49-09 | A create response carries the same field values a subsequent read would | ✓ SATISFIED | SC-4 evidence above; mechanism (canonical read vs in-process merge) correctly recorded as unproven/inherent (`DATA-49-A`), not the requirement itself |

No orphaned requirements: `REQUIREMENTS.md` maps exactly SEC-04, DATA-01, DATA-02 to Phase 49, and all three appear in the `requirements:` frontmatter of at least one of the nine plans.

### Anti-Patterns Found

None. Scanned all fifteen core files this phase's plans and fix-pass touched
(`purge-sentinel.ts`, all four `mutations/*.ts`, `dedup.ts`, `field-groups.ts`, `custom-fields.ts`,
`file-field.tsx`, `file-access.ts`, the files route, and all four `/api/v1/*/route.ts`) for
`TBD`/`FIXME`/`XXX`/placeholder patterns: zero matches. No stub returns, no empty handlers found in
the mutation-critical paths touched by this phase.

### Claims Deliberately NOT Upgraded (checked against code, not just prose)

| Claim the phase refuses | Still accurately stated? |
|---|---|
| DATA-02's mechanism (canonical read vs in-process merge) is not proven — `DATA-49-A` | Yes — confirmed inherent in `formula-recalc.ts`'s single-column write; not contradicted anywhere |
| SC-1 is local-storage only — `SEC-49-A` | Yes — `upload/route.ts:89` still builds an S3 `publicUrl` that bypasses the guarded route |
| Five negative controls NOT DELIVERED, each structurally impossible | Consistent with code: the rejected in-process merge equivalence, a create's unobservable owner term, the inner catch's unreachable rethrow, survivor-first ordering with no behavioural detector, `updated_at` not bumped — none of these were quietly resolved |
| `nyquist_compliant: false` | Confirmed in `49-VALIDATION.md` frontmatter, with the five-refusal reasoning documented, not softened |
| DEF-48-05 / SEC-48-C stays OUT of Phase 49 | Confirmed — `BACKLOG.md` still lists it "recorded, owned by Phase 49" (not closed), and `STATE.md`'s inherited-open-items table restates it explicitly as still open entering Phase 50 |

### Post-Sign-Off Review and Fix Pass — Verified in Code

The code review (`49-REVIEW.md`) found 3 critical and 3 warning issues after the phase's own
sign-off. All six were checked directly against the current tree rather than trusted from commit
messages:

- **CR-01** (unconditional post-commit unlink) — FIXED, confirmed identically in all four purge
  mutations via `.returning({id})` + `NOT_IN_TRASH_INSIDE_TRANSACTION`.
- **CR-02** (merge copies file descriptors without re-homing bytes) — FIXED via `isFileMergeValue`
  in `field-groups.ts`, confirmed by value-shape (not definition-type) reasoning that matches the
  documented rationale (empty `AuditResolution` at the mutation call site).
- **CR-03** (client drops descriptor on failed storage DELETE) — FIXED in `file-field.tsx`; the
  owner-model reconciliation half was deliberately NOT taken (`DEF-49-07`), confirmed still absent
  (detail pages carry no owner term).
- **WR-01** (survivor adopts loser's formula OUTPUT unrecomputed) — FIXED, this phase's most
  significant finding, verified with a passing 18/18 db-test run reproducing the exact 574-vs-122
  numbers named in the task brief.
- **WR-02** (canonical-read fallback comments falsely claimed unreachability) — FIXED; comments and
  log lines now name reachable causes in all four routes; the partial fix (`organizations`/
  `activities` still fall back to the pre-recalc blob, `DEF-49-08`) is correctly still true in code.
- **WR-03** (refs collected too early, missing a same-window write) — FIXED via `SELECT … FOR UPDATE`
  inside the transaction in all four mutations, plus `saveFieldValues`'s `isNull(deletedAt)` +
  rowcount guard.

No sixth or seventh finding was uncovered by this independent pass beyond what the record already
names.

### Human Verification Required

None. This phase's proof surface is entirely backend/API/db-level and was proven behaviourally
against real PostgreSQL and a real filesystem by the phase's own plans; no `<human-check>` blocks
were found deferred in any of the nine `*-PLAN.md` files, and nothing here requires a browser.

### Gaps Summary

No gaps found. Every observable truth was independently verified against running code (not
SUMMARY prose), including re-executing the exact test files that discriminate each fix, and every
claim of a deliberate limitation or refusal was checked and found still accurately stated. The
phase's own post-sign-off self-correction (SC-3's re-open/re-close on WR-01) is the strongest
positive signal here: the record shows its own miss, names the narrow evidence that produced it,
and the fix is verifiably present and tested in both directions (recompute-on-adoption and
does-not-degenerate-to-never-recompute). Independent execution of the eleven cited test files
against the current tree (no full suite rerun, per instructions) produced zero failures.

---

_Verified: 2026-08-26T16:24:03Z_
_Verifier: Claude (gsd-verifier)_
