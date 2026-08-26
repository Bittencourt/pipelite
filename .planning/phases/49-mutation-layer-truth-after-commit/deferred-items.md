# Phase 49 — Deferred Items

Out-of-scope discoveries, logged rather than fixed. Each names the plan that found it, what was
measured, and why it was not changed there.

---

## DEF-49-01 — `GET /api/v1/activities/[id]` returns 403 where its three siblings return 404

**Found by:** plan 49-05, Task 2, while closing plan 49-03's ablation 3 (cross-route owner scoping).
**Measured, against unablated shipped code:**

```
AssertionError: A read B's activity — the GET-by-id predicate is not owner-scoped. This is the
exact term plan 49-03's ablation 3 removed and nothing caught.: expected 403 to be 404
- Expected
+ Received
- 404
+ 403
```

**What the four routes actually do:**

| Route | Predicate | Foreign record |
|---|---|---|
| `organizations/[id]` GET | `id`, `owner_id`, `deleted_at is null` | **404** |
| `people/[id]` GET | `id`, `owner_id`, `deleted_at is null` | **404** |
| `deals/[id]` GET | `id`, `owner_id`, `deleted_at is null` | **404** |
| `activities/[id]` GET | `id`, `deleted_at is null`, **then** `activity.ownerId !== ctx.userId` → `Problems.forbidden()` (`src/app/api/v1/activities/[id]/route.ts:112-123`) | **403** |

**Why it matters:** a 403 where the siblings return 404 is an existence oracle — it confirms to an
unauthorized caller that a record with that id exists. The three sibling routes deliberately make a
foreign record indistinguishable from a missing one.

**Why plan 49-05 did not change it:** changing an API's status code is a contract change to a
published surface (`public/openapi.yaml`), it is not DATA-02, and it would need the OpenAPI document
and `openapi-error-coverage.test.ts` amended in the same commit. 49-05 asserts the **measured**
behaviour per entity through `FOREIGN_READ_STATUS` in
`src/app/api/v1/__tests__/create-response-canonical.db.test.ts`, which reddens in both directions if
anybody harmonises the four silently.

---

## DEF-49-02 — `activities/route.ts`'s DATA-02 comment names a predicate its GET does not use

**Found by:** plan 49-05, Task 2, same investigation as DEF-49-01.

`src/app/api/v1/activities/route.ts`'s canonical-read comment (landed by plan 49-03) reads:

> It is read back through the same three-term predicate `GET /api/v1/activities/[id]` uses

That GET's predicate has **two** terms (`id`, `deleted_at is null`); its ownership check is a
post-fetch comparison on the fetched row. Plan 49-03's SUMMARY repeats the claim for all four
entities. It is accurate for `organizations`, `people` and `deals`, and inaccurate for `activities`.

**Not a functional defect.** The activities canonical read IS three-term and IS correctly scoped —
it is strictly narrower than the GET it is described as mirroring, and it resolves the row the
insert just committed either way. Only the sentence about *which* predicate it mirrors is wrong.

**Why plan 49-05 did not change it:** editing another plan's shipped comment mid-phase would make
49-03's recorded evidence and the tree disagree, and 49-09 is the sign-off that should decide
whether the comment or the route is what moves. The inaccuracy is recorded here and in the
`FOREIGN_READ_STATUS` doc-comment of 49-05's proof file.

---

## DEF-49-03 — the owner term in a create's canonical read is structurally unobservable

**Found by:** plan 49-05, Task 2, ablation 6a. Recorded so no later plan spends time trying to
build a behavioural gate for it.

Dropping `eq(organizations.ownerId, context.userId)` from the POST canonical read leaves
**23/23 green**, and no test can do better. The insert immediately above wrote `ownerId` as the
caller's id, so the owner term is satisfied by construction on every reachable execution: the
two-term and three-term predicates resolve the same row, always. The term is defence-in-depth
against a future refactor that changes what the read is keyed on, not an observable behaviour.

**Consequence for 49-09:** the four canonical reads' owner terms are held by 49-03's rendered-
predicate assertion (organizations only) and by review, not by behaviour — and that is a property
of the code shape, not a gap a proof was lazy about. The **GET-by-id** owner terms, which ARE
observable, are covered behaviourally for all four entities by 49-05.

---

## DEF-49-04 — **CLOSED 2026-08-26, commit `37202ce`** (see the note directly below)

> **CLOSED.** The orchestrator fixed this immediately rather than deferring it, because a green suite
> exiting non-zero made `test:db`'s exit code unusable as a gate and had forced a standing caveat into
> every phase from 48 onward, including all nine Phase 49 plans and the five phases still to run.
> Measured before/after with the same command: `1 failed (1) / 28 passed / exit 1` →
> `1 passed (1) / 28 passed / exit 0`; `npm run test:db` → 11 files / 252 tests / **EXIT=0**.
> This also closes **DEF-48-01**. Original entry follows.

## DEF-49-04 (original entry) — `src/lib/views/queries.db.test.ts`'s `afterAll` throws 42703, so the db PROJECT can never be green

**Found by:** plan 49-06, Task 2, running the whole db project after the ablations.

**Measured, in isolation, on unmodified code** (`vitest run --config vitest.db.config.ts
src/lib/views/queries.db.test.ts`):

```
 Test Files  1 failed (1)
      Tests  28 passed (28)
```
```
Serialized Error: { severity: 'ERROR', code: '42703', position: '60', file: 'parse_relation.c',
  routine: 'errorMissingColumn',
  query: 'select count(*)::int as n from "saved_view_defaults" where id::text like $1',
  parameters: [ 'viewsdbt-%' ] }
```

**The defect, at `src/lib/views/queries.db.test.ts:246-257`:** the leftover query is EXECUTED for
every entry in `TOUCHED_TABLES` and only the `expect` around its result is guarded by
`if (table !== "saved_view_defaults")`. `saved_view_defaults` has no `id` column, so the statement
itself raises 42703 before the guard is ever consulted. Every one of its 28 cells passes; the hook is
what fails.

**Why it matters beyond that file:** it means the db project reports `1 failed | 10 passed` on a run
where all 252 tests pass, and it is a plausible cause of **DEF-48-01** ("`npm run test:db` exits
NON-ZERO on a GREEN suite"). The fix is to move the query inside the guard, or to give
`saved_view_defaults` its own predicate the way `LEFTOVER_PREDICATE` does in the later db-tests.

**Why plan 49-06 did not change it:** it is a Phase 40 file (`f097b5b`), untouched by this phase, in
a subsystem this phase does not own. The executor scope boundary says pre-existing failures in
unrelated files are logged, not fixed. It is independent of this plan's work: it reproduces on the
file alone, and 49-06's own file contributes 18 passing cells with a clean two-part `afterAll`
(234 → 252 passed, nothing else moved).

---

## DEF-49-05 — the survivor-first ORDERING has no behavioural detector

**Found by:** plan 49-08, ablation A3.
**Status:** deferred, named, not absorbed.

Plan 49-08's decision 4 orders the survivor's post-commit recalculation BEFORE the reparented
children's, and hands the recomputed blob forward so the children resolve `{{Organization.*}}`
against fresh parent values rather than against the row captured by the survivor UPDATE's
`.returning()`.

**Ablation A3 moved the survivor's block after the children's. Two unit cells reddened. The
behavioural file stayed 15/15 GREEN.** That is not a gap in the ablation — it is a gap in the
FIXTURE, and it is structural: `dedup-formula.db.test.ts` reparents a `deal`, and there are no
`type='formula'` definitions on `deal`, so `childReferencesChangedParentField` returns false and no
child is ever recomputed whichever order the two blocks run in.

**What closing it would take:** a second minted definition, `type='formula'` on `deal`, whose
expression reads `{{Organization.<parent formula name>}}`, plus a cell asserting the reparented
deal's stored value is derived from the survivor's POST-recalculation parent value and not from its
pre-recalculation one. That is a SECOND-HOP claim about `recalcReparentedChildren`, which is
Phase 39 work this phase did not open, and it belongs with WR-02 (the survivor's PRE-EXISTING
children keeping `Organization.*` values that a merge made stale) rather than with DATA-01.

**Until then the ordering claim rests on two unit cells and is reported that way** — see 49-08's
SUMMARY, which does not claim behavioural discrimination for it.

---

## DEF-49-06 — `POST /api/upload` still has the defect 49-04 closed on the read side

**Found by:** plan 49-09, sign-off, deliberately looking ONE CALL-CHAIN HOP outside the phase's own
declared file surface. **That is the specific failure mode that cost Phase 48's sign-off five
criticals** — 48-10 judged 26 controls and reported 26 DELIVERED, and a later code review found five
it had missed, two of them live cross-tenant reads, because it audited only the files the phase
declared.

**Recorded as `SEC-49-D` in `.planning/BACKLOG.md`.** Full evidence there. In short:
`src/app/api/upload/route.ts:33-36` authorizes on `session?.user` **alone** — no entity resolution,
no ownership predicate — and `:99` builds the destination as
`path.resolve(UPLOAD_DIR, entityId, fieldName)` from two **unvalidated form fields**, with no
containment check of any kind. Reproduced by executing that exact expression against the container's
measured `UPLOAD_DIR=/app/uploads`:

```
INSIDE   /app/uploads/9f1c…0001/Anexos                 <- a legitimate upload
INSIDE   /app/uploads/victim-record-id/Anexos          <- ANOTHER USER's record id, no ownership check exists
OUTSIDE  /app                                          <- entityId = "../../.."   fieldName = "app"
OUTSIDE  /etc/cron.d                                   <- entityId = "/etc"
OUTSIDE  /var/tmp                                      <- fieldName = "../../../var/tmp"
```

**It does NOT reopen SC-1, and that is stated so the finding is not over-read.** The read guard
requires the requested name to already be a value the server wrote into *that record's own*
`customFields`, and an attacker cannot write the victim's JSONB without owning the victim's record.
So a planted blob is not retrievable through `/api/files/...`. What is real is (a) an
ownership-unchecked WRITE into any record's field directory, (b) a WRITE outside the upload root
entirely, as the application user, available to any authenticated caller, and (c) the loose
`!session?.user` condition that 49-04 tightened to `!session?.user?.id` on the file route and which
is still loose here.

**Why plan 49-09 did not fix it.** SEC-04 is "a purged record's uploaded files are unreachable —
removed from storage, and not served even while they exist". The upload WRITE path is not that, on
any reading, and a sign-off plan inventing a fifth requirement's worth of work is how a phase stops
being auditable. It is also **not covered by any test**: no file under `src/` or `e2e/` drives
`POST /api/upload` — the ten files matching `api/upload` are the route, its client caller, and eight
citations of it in prose or in an env-literal gate.

**Suggested owner:** a plan that reuses this phase's own two helpers rather than inventing a third
spelling — `findOwnedRecordById` for the ownership half and `resolveContainedPath` for the
containment half, both exported from `src/lib/api/file-access.ts` and both proven here. Note the
write side needs one thing the read side does not: the field must be a live `type='file'` definition
on the resolved entity type, or the route will happily create directories for field names that do
not exist.

---

## DEF-49-07 — the session UI and the file guard disagree about who may see a record, and reconciling them is a product decision

**Found by:** the `/gsd:code-review --fix` pass on 49-REVIEW.md's **CR-03**. The MANDATORY half of
CR-03 — the client no longer drops a descriptor on a failed storage `DELETE` — is **FIXED**
(`4c608b7`). This entry is the half that was NOT taken, and why.

**What was measured, against shipped code:**

| surface | owner-scoped? | evidence |
|---|---|---|
| `/api/files/[entityId]/[fieldName]/[filename]` (GET and DELETE) | **YES** | `findOwnedRecordById` carries `eq(source.ownerId, userId)` on all four branches — `src/lib/api/file-access.ts:150-163` |
| all four detail pages | **NO** | `deals/[id]/page.tsx:57`, `people/[id]/page.tsx:47`, `organizations/[id]/page.tsx:41`, `activities/[id]/page.tsx:56` — `and(eq(id), isNull(deletedAt))`, no owner term |
| the deals LIST page | **NO** | `src/app/deals/page.tsx:188` — `params.owner ? eq(deals.ownerId, params.owner) : undefined`. Owner is an optional **FILTER**, not a scope |
| `/api/v1/deals` (and siblings) | **YES** | `src/app/api/v1/deals/route.ts:109`, `:377` — `eq(deals.ownerId, context.userId)` |
| `saveFieldValues` | **NO owner term** (a `deletedAt` term was added by WR-03, `501c813`) | `src/lib/custom-fields.ts` |

So there are **two authorization models in this codebase on purpose**: the `/api/v1` layer is
owner-scoped because an API key belongs to one user, and the session UI is a shared CRM where every
authenticated user sees every record. `file-access.ts` applies the API-key model to a **session**
route. That is the disagreement, and it is not a bug in either model.

**Consequence that remains open after the client fix:** a non-owner viewer (or the uploader after a
BULK-03 owner reassign) still sees an attachment on a detail page and still gets **404** on
download. That is a UX defect. It is no longer a DATA defect: the client now surfaces the refusal
and keeps the descriptor, so the blob stays nameable, servable-once-authorized, deletable and
collectable by a purge.

**Why the fixer did not resolve it, three reasons:**

1. **Widening `file-access.ts` would weaken SC-1**, which plan 49-06 proved at the BYTE level. That
   is a criterion this phase has already signed off; a review-fix pass must not quietly narrow it.
2. **Narrowing the four detail pages is a product decision, not a bug fix.** It would stop
   colleagues seeing each other's records, which is what the list pages currently offer.
3. **Adding an owner term to `saveFieldValues` would have introduced a NEW instance of CR-01.** Its
   `db.update(table).set(…).where(eq(table.id, entityId))` read no rowcount, so an owner term would
   have made every custom-field edit on a colleague's record match zero rows and **still return
   `{ success: true, values }`** — a write reporting success without happening, which is the exact
   defect class this pass exists to remove. WR-03's fix added `.returning({ id })` and a rowcount
   check to that statement, so **the trap is now disarmed**: a future owner term there will fail
   loudly. That was a precondition, not the fix.

**What closing it would take:** a decision on what "may see this record" means, then ONE predicate
used by the pages, the save API and `file-access.ts` — the reviewer's own `canAccessRecord`
suggestion. Plus `disabled` on `CustomFieldsSection` for whoever the answer excludes, so the UI
stops offering an action that will refuse.

**Related and NOT this:** SEC-49-D / DEF-49-06 is the WRITE side of the same route family and has
its own owner.

---

## DEF-49-08 — `organizations` and `activities` creates still ship the PRE-recalc blob on the canonical-read fallback

**Found by:** the `/gsd:code-review --fix` pass on 49-REVIEW.md's **WR-02**, while fixing it
(`b12289c`).

**What WAS fixed:** all four routes' comments stopped claiming the fallback is unreachable (it is
reachable three ways — a `crm_action{operation:"delete"}` workflow on `<entity>.created` through the
synchronous bus, a concurrent DELETE, and a BULK-03 owner reassign, one per predicate term), and all
four log messages now name a reachable cause. `people` and `deals` additionally fall back to
`{ ...row, customFields: recalculatedCustomFields }`, which is strictly better than the raw
`.returning()` row.

**What was NOT fixed:** `organizations` and `activities` still fall back to the pre-recalc blob,
because their recalculation happens INSIDE `create{Entity}Mutation` (which needs it for its own
emit) and the post-recalc blob is not in the route's scope. It is stated in each route's comment and
in its log line rather than left implicit.

**What closing it would take:** widen `create{Organization,Activity}Mutation`'s return type to carry
the post-recalc blob it already computes. That touches the mutation, its test file's exact `toEqual`
assertions on the returned shape, and its other callers — a change with its own blast radius, which
is why a review-fix pass declined it.

---

## DEF-49-09 — a merge no longer moves attachments, and the merge UI does not say so

**Found by:** the `/gsd:code-review --fix` pass on 49-REVIEW.md's **CR-02**, as the stated cost of
the fix taken (`9ec44dc`).

`buildMergeFieldGroups` now refuses a file-typed value as a compared field, so the loser's
attachments stay on the loser — which goes to Trash with them intact and restorable for the whole
retention window — and the survivor keeps its own. That was chosen over re-homing the bytes (which
puts filesystem I/O on the merge's critical path and, done post-commit best-effort, leaves the
survivor pointing at the loser's directory whenever the copy fails) and over a reference-aware purge
(which keeps the bytes but leaves the survivor displaying an attachment whose `publicUrl` names the
now-trashed loser, so it 404s from the moment of the merge).

**What closing it would take:** one line in the merge screen saying attachments are not moved.
`src/app/duplicates/[pairId]/page.tsx` already counts each record's files
(`countFiles(record.row, definitions)`) for the record header, so the number is in hand.

**Why it is a deferred item and not part of the fix:** it is a copy change requiring three locale
files, and the fixer's own rule is that a merge losing data silently is worse than a merge whose UI
is briefly incomplete. The data is not lost — it is on the loser, in Trash, for the retention window.
