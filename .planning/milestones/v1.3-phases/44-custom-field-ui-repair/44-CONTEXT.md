# Phase 44 — Custom Field UI Repair — Context

**Source:** browser end-to-end verification pass, 2026-08-15, over the completed v1.3 phases (32, 33, 34).
Promoted from backlog items **999.25**, **999.26**, **999.27**.
Companion record: `.planning/phases/34-formula-reactivity/34-VERIFICATION.md` § Browser E2E Amendment.

All three defects are in the **UI layer**. The server-side contracts underneath them were re-verified
live during the same pass and are correct — see "What is already proven working" below. Do not
"fix" the recalculation engine; it is not the problem.

---

## Environment note — read before reproducing

The defects were first observed against a container built **before** the Phase 34 gap-closure commits.
Re-verify against a fresh build or you will chase ghosts:

```bash
docker compose up -d --build     # no sudo needed; user is in the docker group
```

On the stale build the People CSV export emitted **zero** `custom_*` columns for 17,741 rows that had
custom data. After rebuild: 8 columns, correct values. Findings 999.25–27 below were all **re-confirmed
on the fresh build** and are not build artifacts.

App: `http://localhost:3001` · Postgres: `localhost:5433` (`docker exec pipelite-postgres-1 psql -U pipelite -d pipelite`)

---

## CFUI-01 (999.25) — BLOCKER: admins cannot add custom fields to Deals

The header "Add Field" button never renders on `/admin/fields/deal`. It renders correctly on
`/admin/fields/person` (6 definitions), `/organization` (8) and `/activity` (0). Deal has **155**.

Observed on a clean rebuild of current master:

- absent from the **server-rendered HTML** (fetched the route directly; the header `div.flex.items-center.justify-between` contains only the title `div`)
- still absent after 20s of waiting
- no browser console error, no server-log error
- the rest of the page hydrates normally — 474 buttons present and interactive

**Cause is strongly indicated, not merely suspected.** The row-level pencil `FieldDialog`s on the *same*
deal page render fine while receiving the *same* 155-item `availableFields` prop — but those are
client→client, rendered by `fields-list.tsx:61` (a client component). Only the header `FieldDialog`
crosses the **server→client RSC boundary**, at `src/app/admin/fields/[entityType]/page.tsx:46`, which
passes `availableFields={activeFields}` — 155 full `CustomFieldDefinition` rows — out of a server
component. Person and organization pass 6–8 rows across that same boundary and work.

> **⚠ CORRECTED 2026-08-15 by `44-RESEARCH.md` — read that document, not this paragraph, for the fix.**
>
> The hypothesis above ("the payload is dropped/truncated") is **wrong**, and the slim-projection fix
> suggested here is **measured not to work**. The research pass instrumented the real Flight serializer
> and proved the actual chain:
>
> The payload is **complete**. React Flight's `MAX_ROW_SIZE = 3200` causes the *element* child to be
> emitted as a lazy reference (`"children":"$L19"`) instead of inline. Radix's `SlotClone` behind
> `asChild` then sees a non-element, hits `Children.count(children) > 1 ? Children.only(null) : null`,
> and returns **`null` silently** — which is exactly why nothing errors anywhere.
>
> Measured deferral thresholds: full rows defer at **n=21**; the slim `{id,name,type}` projection
> **still defers at n=100 and n=155**. Organization at 8 definitions is ~13 rows from the same cliff.
>
> The correct fix is **structural**, not a projection: move the trigger into a client wrapper so no
> React element crosses the boundary — the pattern already used at
> `src/app/workflows/new-workflow-button.tsx` and already proven to work with all 155 rows at
> `fields-list.tsx:61`. A slim projection remains worthwhile as a *payload optimisation*
> (~78 KB, and it stops leaking `config` JSONB to the browser) but must not be mistaken for the repair.
>
> The general rule this establishes: **a server component must never pass JSX children into a client
> component that slots them through `asChild` if that element also carries a data prop that can grow.**

Impact: Deals is the primary CRM entity and the entry point for Phase 34's formula fields. There is
currently **no UI path to create any custom field on a deal**.

## CFUI-02 (999.26) — formula display is one save behind

On a freshly loaded record detail page, editing a formula's source field updates the stored value
correctly but leaves the **rendered** formula value stale until a manual reload.

Reproduced twice on a person with `GSD Doubled = {{GSD Base Value}} * 2`: set base to `3`, Postgres
correctly held `{"formula": true, "value": 6}`, the page kept showing `14` (the previous save's result);
reloading showed `6`. Editing twice within one page session *did* refresh correctly.

> **✔ EXPLAINED 2026-08-15 by `44-RESEARCH.md` — no race is involved.** `formula-field.tsx` has two
> branches: with a stored `{formula:true,…}` wrapper it renders the wrapper, and
> `custom-fields-section.tsx` never refreshes that wrapper (`useState(values)`, a merge of only the
> edited key, and an API returning `{success:true}` with no data). So the display is pinned to
> page-load state. With no wrapper it evaluates live and works — which is precisely the observed
> asymmetry. Fix: `recalculateFormulas` **already returns** `{ customFields }`; `saveFieldValues`
> discards it. Return it and merge it (~3 lines each in 2 files). The existing `catch` must keep
> swallowing per D-05 so a formula error never blocks the user's edit.

The server contract (FORMULA-01 / SC-1) is **not** violated — stored value, API GET and CSV export are all
correct. But SC-1's user-facing promise is "without any page load having occurred", and a user watching
the screen sees a stale number.

Entry point: `saveCustomFields` and the state merge in `src/components/custom-fields/custom-fields-section.tsx`.

Note while working here: the inline editor commits on **Enter**, not on blur (`inline-edit.tsx:83`).
Tabbing away silently discards the edit. Worth a second look — it is not in scope as a defect, but it
surprised the verification pass and may surprise users.

## CFUI-03 (999.27) — `#ERROR — Unknown field: X` on new records

A formula whose source field is not yet set renders a red `#ERROR` with `Unknown field: <name>` instead
of blank. Seen immediately on a newly created person, before any custom field had a value (stored
`custom_fields` was `{}`).

This is exactly the failure mode Phase 34's **D-14** ruled out server-side — `fieldValues` is seeded with
every definition name defaulting to `null` precisely so unset sources cannot fabricate `Unknown field`
errors. That seeding exists in `recalculateFormulas` but not in the client display path
(`src/components/custom-fields/formula-field.tsx`), so the two evaluators disagree on the empty case.

Fix: seed the display evaluator the same way, so an unset source yields blank rather than an error.

---

## What is already proven working — do not regress it

Re-verified in the browser on the current build, 2026-08-15:

| Behaviour | Evidence |
|---|---|
| SC-1 — recalc on save persists server-side | Saved through the UI; Postgres held `{"formula": true, "value": 42, "error": null}` — stored, not merely rendered |
| SC-2 — CSV export carries recalculated values | 38,345-row People export: `custom_GSD Doubled = 100`, row 1 blank for that column (the exact header-derivation failure mode 34-13 fixed), **0** `[object Object]` |
| SC-4 — no fan-out on unrelated saves | Saved an unrelated field; wrapper preserved; exactly **1** row in `people` ever carried the formula keys |
| Formula editor field chips | Clicking `{{GSD Base Value}}` inserts correctly at the cursor |
| Phase 33 indexes | All 11 present; kanban (3,465 deals in one stage), people, orgs, activities all render clean |

## Why the existing suite did not catch any of this

Per `34-VALIDATION.md` the suite is deliberately DB-free and mocks `@/db`; every write-path assertion
stops at the mutation return value. CFUI-02 and CFUI-03 are both cases where the server contract is
satisfied and the *display* path diverges from it — a seam no test in Phase 34 observes. CFUI-01 is a
rendering boundary with no test coverage at all.

SC-5 in the phase entry therefore asks for a regression test at the RSC boundary specifically, and the
browser-observable criteria (SC-1, SC-3, SC-4) should be checked against the **live 155-definition deal
dataset**, not a small fixture — a fixture of 6 fields would pass while the real page stays broken.

## Test data convention

The verification pass used `GSD`-prefixed names (`GSD Base Value`, `GSD Doubled`) and a person named
`GSDVerify Formula`, then removed them. Baseline afterwards: 155 deal / 8 organization / 6 person
definitions, zero `GSD*` rows. Use the same convention and clean up.

---

## Scope Decisions (user, 2026-08-15, after research)

Answers to the four open questions `44-RESEARCH.md` raised. These are **locked** for planning.

| # | Decision | Rationale |
|---|---|---|
| D-44-01 | **Fix CFUI-01 structurally** — a client `AddFieldButton` wrapper so no React element crosses the RSC boundary. The slim projection is explicitly **rejected as the repair**. | Measured: the slim projection still defers at n=100 and n=155. Only the structural fix is size-independent. Pattern already in the repo at `src/app/workflows/new-workflow-button.tsx`. |
| D-44-02 | **Also ship the slim `{id,name,type}` projection — as a separate, separately-tested task framed as a payload optimisation.** It must not be presented as the CFUI-01 repair. | ~78 KB of flight payload for a prop read only at `field-dialog.tsx:239-256`, and it stops leaking `config` JSONB (option arrays) to the browser. |
| D-44-03 | **Dev-only loud guard in `FieldDialog`** when `children` is not a valid element. Not enabled in production. | The silent `null` from Radix `SlotClone` is what made this cost a full browser E2E pass to find. A production throw would convert a degraded page into a hard crash for end users — not worth it. |
| D-44-04 | **Both adjacent divergences are IN scope** (new requirements CFUI-04, CFUI-05). | Both are the same class as CFUI-03 — client/server evaluator divergence — and the phase is already in these files. Fixing them here avoids a second pass. |

### CFUI-04 — activities pass no `entityAttributes`

`src/app/activities/[id]/page.tsx` passes no `entityAttributes` to the custom-fields section, so a
formula on an activity cannot resolve any native activity field. The other three entity detail pages
do pass them. Found by the research pass, not by the browser pass.

### CFUI-05 — client evaluator omits QuickJS resource bounds

The client-side formula evaluator does not apply the resource bounds Phase 34's **D-18** applied to the
server call site, and Phase 34 added a regression test guarding against a second *unbounded server* call
site. The browser path is the gap that test does not cover. Bound it to match the server.

### Explicitly still OUT of scope

- The inline editor committing on **Enter** rather than blur (`inline-edit.tsx:83`) — surprising, but a
  separate UX decision, not a defect in this phase's mandate. Capture separately if wanted.
- Anything in the recalculation engine itself. It was re-verified working; see the baseline table above.
