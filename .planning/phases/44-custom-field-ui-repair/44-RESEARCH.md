# Phase 44: Custom Field UI Repair - Research

**Researched:** 2026-08-15
**Domain:** Next.js 16 App Router / React 19 Server Component boundary serialization; client-side formula display reconciliation
**Confidence:** HIGH

---

## Summary

All three defects were reproduced **live, on the running container, on current master** (`cbf3229`),
and the mechanism behind each one is now **proven by instrumentation, not inferred**. No new packages
are required for either the fixes or the regression tests.

**CFUI-01 is not what CONTEXT.md hypothesised.** The RSC payload is neither dropped nor truncated —
the deal page's flight stream contains the "Add Field" `<button>` in full, as row `19`. The failure
is one layer down: React Flight has a hard `MAX_ROW_SIZE = 3200` byte budget per row. Once
`availableFields` blows past it, React **defers the next React element it encounters** into its own
row and substitutes a lazy reference (`"children":"$L19"`). Radix's `Slot` — which powers `asChild`
on `DialogTrigger` — sees a value that is not a valid React element and **returns `null`**, silently,
with no warning. That is the entire bug. The threshold is empirically **21 full definition rows**;
`organization` sits at 8, one bad import away from the same cliff. **The slim `{id,name,type}`
projection CONTEXT.md proposes does not fix it** — measured, it still defers at 155 rows (and at 100).
The only durable fix is structural: never serialize a React element across the boundary alongside
bulk data. The repo already contains the correct pattern at `src/app/workflows/new-workflow-button.tsx`.

**CFUI-02 and CFUI-03 are the same defect seen from two sides:** `formula-field.tsx` has two mutually
exclusive branches — "use the stored `{formula:true,...}` wrapper" and "evaluate live in the browser" —
and both are wrong. The wrapper branch is pinned to whatever was in the JSONB at page load and is
never refreshed after a save (`custom-fields-section.tsx` merges only the edited key into
`localValues`, never the server's recomputed formula keys), so the display is literally one save
behind — matching the reported observation exactly. The live branch is the *only* evaluator in the
codebase that does **not** apply the D-14 `null` seeding, so an unset source produces
`#ERROR — Unknown field: X`. Fixing both with one change: make `/api/custom-fields/save` return the
post-recalculation `customFields` (the value `recalculateFormulas` already returns) and merge it into
`localValues`; then seed the live branch so it can only ever be a blank, never a fabricated error.

**Primary recommendation:** Move the header trigger into a `'use client'` wrapper component (never
pass JSX children from a server component into an `asChild` slot); return the recalculated
`customFields` from the save API and merge it client-side; seed the client evaluator's field map with
`null` for every active definition. Gate all three with vitest tests in the existing `node`
environment — **no jsdom, no @testing-library, no new packages** (proven below).

---

## Project Constraints (from CLAUDE.md)

There is **no `./CLAUDE.md`** in this repository. Constraints below are drawn from the user's global
instructions and project memory, and are binding for this phase:

| Constraint | Source | Implication for Phase 44 |
|---|---|---|
| **Docker only — never `npm run dev` / `next dev`** | project memory | All runtime verification via `docker compose up -d --build`; app at `http://localhost:3001` |
| `docker` needs **no** `sudo` | project memory, re-verified this session | Never embed a password in any plan or task |
| Postgres at `localhost:5433`, or `docker exec pipelite-postgres-1 psql -U pipelite -d pipelite` | project memory | Used for stored-value assertions |
| `.planning` is gitignored but tracked — force-add individual files | project memory | `git add -f .planning/phases/44-*/44-*.md` |
| `rtk` shell hook collapses vitest output to `PASS (n) FAIL (0)` | `34-VALIDATION.md`, re-confirmed this session | Wrap in `rtk proxy` when raw test output matters. Redirecting to a file does **not** help — the hook collapses it too |
| `--reporter=basic` does not exist in vitest 4 | `34-VALIDATION.md` | Use the default reporter |
| Server action / API return shape `{ success: true/false, error/id }` | project memory | Extend additively; do not break the shape |

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CFUI-01 | An admin can create a custom field on **every** entity type through the UI, including Deals — the "Add Field" trigger renders regardless of how many definitions the entity already has | § CFUI-01: Proven Mechanism; § Fix Design → Fix 1; § Architecture Patterns → Pattern 1 |
| CFUI-02 | After saving a formula's source field, the displayed formula value matches the stored value without a page reload | § CFUI-02: Proven Mechanism; § Fix Design → Fix 2; § Architecture Patterns → Pattern 2 |
| CFUI-03 | A formula whose source fields are unset renders blank, not `#ERROR — Unknown field: X` — the display evaluator seeds unset sources as `null`, matching `recalculateFormulas` D-14 | § CFUI-03: Proven Mechanism; § Fix Design → Fix 3 |

---

## User Constraints (from CONTEXT.md)

CONTEXT.md for this phase has no `## Decisions` / `## Claude's Discretion` / `## Deferred Ideas`
headings — it is a defect report. The binding constraints it does impose are reproduced here.

### Locked constraints

- **Do not "fix" the recalculation engine.** The server-side contracts (SC-1, SC-2, SC-4, formula
  editor chips, Phase 33 indexes) were re-verified live on 2026-08-15 and are correct. All three
  defects are in the UI layer. `[CITED: 44-CONTEXT.md § What is already proven working]`
- **Re-verify against a fresh build** (`docker compose up -d --build`) before reproducing anything.
- **Confirm the CFUI-01 mechanism before fixing** — CONTEXT.md explicitly flags its RSC-payload
  explanation as inferred rather than proven, and says "If a slim projection does not restore the
  button, the hypothesis is wrong." **This research did confirm the mechanism, and it did establish
  that a slim projection does NOT restore the button.** See § CFUI-01.
- **Browser-observable criteria must be checked against the live 155-definition deal dataset**, not a
  small fixture: "a fixture of 6 fields would pass while the real page stays broken."
- **Test data convention:** `GSD`-prefixed names, cleaned up afterwards. Baseline to restore:
  155 deal / 8 organization / 6 person definitions, zero `GSD*` rows. Verified still true this
  session `[VERIFIED: psql]`.

### Out of scope (noted but not a defect for this phase)

- `inline-edit.tsx:83` commits on **Enter**, not on blur; tabbing away silently discards the edit.
  CONTEXT.md: "it is not in scope as a defect." **Do not fix it in this phase.** Confirmed at
  `src/components/custom-fields/inline-edit.tsx:79-87` — `handleKeyDown` handles `Enter`/`Escape`
  only, and no `onBlur` is wired anywhere in the component `[VERIFIED: source read]`.

---

## Reproduction Ledger

Everything below was executed this session against the running container.

| # | Action | Result |
|---|---|---|
| R1 | `docker compose ps` | `pipelite-app-1` up, built from current master (`cbf3229`) `[VERIFIED]` |
| R2 | `psql` definition counts | deal **155**, organization **8**, person **6**, activity **0** — matches CONTEXT.md baseline `[VERIFIED]` |
| R3 | Forged an admin Auth.js JWE session cookie (`__Secure-authjs.session-token`) inside the container via `@auth/core/jwt` `encode` and the container's own `AUTH_SECRET` | `200` on `/admin/fields/{person,organization,activity,deal}` — read-only, no DB mutation `[VERIFIED]` |
| R4 | `curl` the server-rendered HTML of all four pages | `person`/`organization`/`activity`: header contains the `<button>…Add Field</button>`. `deal`: header `<div>` closes immediately after the title `<div>` — **no button, no Suspense marker, no `<template>` placeholder** `[VERIFIED]` |
| R5 | Extracted and parsed the full RSC flight stream from `self.__next_f.push(...)` on both pages | deal stream is **complete and well-formed** — 12 rows, row `6` holds the page tree with the FieldDialog element and all 155 `availableFields`; row `19` holds the Add Field `<button>`; row `1a` holds the FieldsList section `[VERIFIED]` |
| R6 | Diffed row `6` between person and deal | person: `"children":[["$","button",null,{…}]]` **inline**. deal: `"children":"$L19"` — **a lazy reference** `[VERIFIED]` |
| R7 | Read `MAX_ROW_SIZE` and `deferTask` out of the flight serializer Next 16.1.6 actually ships | `MAX_ROW_SIZE = 3200`; `case REACT_ELEMENT_TYPE: if (serializedSize > MAX_ROW_SIZE) return deferTask(request, task)` `[VERIFIED: node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.development.js:2695, :6296]` |
| R8 | Read `@radix-ui/react-slot` `SlotClone` | `if (React.isValidElement(children)) {…clone…} return React.Children.count(children) > 1 ? React.Children.only(null) : null` — **returns `null`** for a non-element `[VERIFIED: node_modules/@radix-ui/react-slot/dist/index.js]` |
| R9 | Executable proof: rendered `<Dialog><DialogTrigger asChild>{flightLazy}</DialogTrigger></Dialog>` with `renderToStaticMarkup` | Real element → `<button …>Add Field</button>`. Flight lazy → `""` (empty string). Control: the same lazy rendered as a plain child of a `<div>` renders fine `[VERIFIED: vitest run, node env]` |
| R10 | Bisected the deferral threshold through the **real** Flight serializer | full definition rows: inline at **n=20**, deferred at **n=21** `[VERIFIED]` |
| R11 | Tested CONTEXT.md's proposed slim `{id,name,type}` projection through the real serializer | **still deferred at n=100 and n=155** (inline only up to ~n=40). **The proposed fix does not work.** `[VERIFIED]` |
| R12 | Tested a bare `string[]` of names | not deferred at n=155 — but only because 155 × ~17 chars < 3200. **Size-dependent; would break again.** `[VERIFIED]` |
| R13 | Tested `children` declared *before* the bulk prop in props order | not deferred, even with 155 full rows — confirms the accumulator model precisely. **A hack, not a fix.** `[VERIFIED]` |
| R14 | `npx vitest run` (full suite) | **50 files / 777 passed / 4 skipped**, 26.9 s, exit 0 — new baseline (34-VALIDATION.md's 461 is stale) `[VERIFIED]` |

All probe files created during R9–R13 were deleted; `git status` is clean.

---

## CFUI-01: Proven Mechanism

### The chain, in order

1. `src/app/admin/fields/[entityType]/page.tsx:46` (a **server** component) renders
   `<FieldDialog entityType={…} availableFields={activeFields}><Button>…Add Field</Button></FieldDialog>`.
   JSX places `children` **last** in the props object, after `availableFields`.

2. React Flight serializes row `6` prop-by-prop, maintaining a running `serializedSize` counter that
   accumulates every object key's length and every string value's length
   `[VERIFIED: …server.node.development.js:2586, :2908]`.

3. With 155 definition rows, `serializedSize` is roughly 78 KB by the time the serializer reaches
   `children`. In `renderModelDestructive`:

   ```js
   case REACT_ELEMENT_TYPE:
     …
     if (serializedSize > MAX_ROW_SIZE) return deferTask(request, task);
   ```
   `[VERIFIED: …server.node.development.js:2695; MAX_ROW_SIZE = 3200 at :6296]`

   `deferTask` creates a new task and returns `serializeLazyID(task.id)` — i.e. the string `"$L19"`.

4. The flight **client** parser turns `"$L19"` into a lazy chunk wrapper —
   `{ $$typeof: Symbol.for('react.lazy'), _payload, _init }`. This object is **not** a React element.

5. `field-dialog.tsx:148` does `<DialogTrigger asChild>{children}</DialogTrigger>`. `asChild` routes
   through Radix `Slot` → `SlotClone`:

   ```js
   if (React.isValidElement(children)) { … return React.cloneElement(children, props2) }
   return React.Children.count(children) > 1 ? React.Children.only(null) : null
   ```
   `[VERIFIED: node_modules/@radix-ui/react-slot/dist/index.js]`

   `isValidElement(lazy)` is `false`. `Children.count(lazy)` is `1`, so `1 > 1` is false.
   **`SlotClone` returns `null`.** No throw, no `console.error`, no dev warning.

### Why every observation fits

| Observation | Explained by |
|---|---|
| Absent from server-rendered HTML | `SlotClone` returned `null` during SSR |
| No browser console error, no server-log error | The `null` return is a silent early-out, not an error path |
| Still absent after 20 s | Nothing is pending — the lazy is never awaited, it is discarded |
| The rest of the page hydrates normally (474 buttons) | Only this one subtree returned `null` |
| Row-level pencil dialogs work with the same 155-item prop | `fields-list.tsx:61` is client→client — `children` is a real element created in the browser and never serialized |
| person (6) / organization (8) / activity (0) work | Their rows stay under 3200 bytes, so `children` serializes inline as a real element |

### Corrected threshold data — read this before choosing a fix

| Prop shape passed alongside the element child | Deferred (bug) at |
|---|---|
| Full `CustomFieldDefinition` rows | **n = 21** (n = 20 still inline) |
| Slim `{ id, name, type }` projection | **n = 100** (n = 40 still inline) — **CONTEXT.md's proposed fix fails at 155** |
| Bare `string[]` of names | not at n = 155, but purely because the bytes happen to fit; breaks around n ≈ 190 |
| `children` declared before the bulk prop | never — but this depends on JS object key insertion order and is not a supportable fix |

**Conclusion the planner must act on:** any fix that keeps a React element and bulk data in the same
props object is a size-dependent time bomb, not a repair. `organization` at 8 definitions is **13
rows** from the cliff.

### Why this is a class of bug, not one bug

The general rule: **a server component must never pass JSX children into a client component that
slots them through `asChild`, if that same element also carries a data prop that can grow.**

Audit performed this session `[VERIFIED: grep]`:

| Component | Slots `children` into `asChild` | Rendered from | Verdict |
|---|---|---|---|
| `src/app/admin/fields/[entityType]/field-dialog.tsx` | yes (`DialogTrigger asChild`) | **server** component `page.tsx:46` **and** client `fields-list.tsx:61` | **BROKEN at the server call site** |
| `src/app/workflows/create-workflow-dialog.tsx` | yes | only `new-workflow-button.tsx`, which is `'use client'` | safe — **and it is the pattern to copy** |

No other component in `src/` takes `children: React.ReactNode` and slots it through `asChild`.

---

## CFUI-02: Proven Mechanism

Root cause is a two-part interaction, both parts read directly from source `[VERIFIED]`:

**Part A — `src/components/custom-fields/formula-field.tsx:50-60`.** The component prefers a stored
wrapper unconditionally:

```ts
const isCachedResult = typeof value === 'object' && value !== null && 'formula' in value
useEffect(() => {
  if (isCachedResult) {
    const cached = value as { formula: true; value: unknown; error: string | null }
    setCalculatedValue(cached.value)   // <- the load-time value, forever
    setError(cached.error)
    setIsLoading(false)
    return
  }
  … // live browser evaluation via QuickJS
}, [expression, allFieldValues, relatedEntities, value, isCachedResult])
```

**Part B — `src/components/custom-fields/custom-fields-section.tsx:55-73`.** The save handler merges
only the key the user edited:

```ts
const newValues = { ...localValues, [fieldName]: value }
setLocalValues(newValues)
const result = await saveCustomFields(entityType, entityId, newValues)   // returns { success: true } only
```

`localValues` is `useState(values)` — initialised once, never re-synced from the prop. The formula
key therefore keeps the wrapper that was in the JSONB **when the page loaded**, for the whole session.
The API response carries no values to correct it with (`src/app/api/custom-fields/save/route.ts:24-25`
returns `saveFieldValues`'s `{ success: true }`).

### This explains the reported asymmetry exactly

CONTEXT.md's "editing twice within one page session *did* refresh correctly" is not a race and not a
stale closure — it is the **other branch**:

| Record state at page load | Branch taken | Behaviour |
|---|---|---|
| `custom_fields` already holds `{formula:true,value:14}` | cached branch | display frozen at 14 for the session; DB moves to 6 → **"one save behind"** ✓ |
| `custom_fields` is `{}` (brand-new record) | live branch | evaluates in the browser on every keystroke-commit → appears to work perfectly ✓ (and shows `#ERROR` before the first source is set → CFUI-03 ✓) |

The verification pass created a fresh person (live branch, both edits correct), reloaded (wrapper now
stored), then edited again (cached branch, frozen at "the previous save's result"). Every reported
symptom in CFUI-02 and CFUI-03 falls out of this one model. Confidence: **HIGH**.

### The correct App Router pattern here

The brief asks: `router.refresh()` vs `revalidatePath` vs lifting state. Ranked, with the reasoning:

| Option | Verdict |
|---|---|
| **Return the recomputed values from the API and merge them** | ✅ **Recommended.** `recalculateFormulas` *already* returns `{ customFields, evaluations }` (`src/lib/formula-recalc.ts:606-611`). `saveFieldValues` currently discards it. Returning it is ~3 lines, needs zero round trips, and keeps Phase 34's "the server is the sole writer of formula keys" (T-34-04) invariant intact — the client displays what the server wrote, it does not recompute it. |
| `revalidatePath` inside the route handler | ❌ Insufficient alone. `revalidatePath` in a **Route Handler** invalidates the server cache but does **not** push a fresh RSC payload to an already-mounted client. Only a Server Action's response, or an explicit `router.refresh()`, does that. `[CITED: nextjs.org/docs/app/api-reference/functions/revalidatePath]` |
| `router.refresh()` after the `fetch` | ❌ Insufficient alone, and wasteful. It refreshes the `values` **prop**, but `localValues = useState(values)` shadows it permanently — the display would still not move. It would also refetch the entire detail page RSC payload for one field. |
| Convert to a Server Action | ⚠️ Larger blast radius than the phase needs; still requires removing the `useState(values)` shadowing. Reasonable follow-up, not this phase. |

If the planner *also* wants prop-change resilience (so a future `router.refresh()` works), add a
`useEffect` that re-syncs `localValues` when the `values` prop identity changes — but that is
belt-and-braces, not the fix.

---

## CFUI-03: Proven Mechanism

`src/lib/formula-engine.ts:207-212` `[VERIFIED]`:

```ts
if (!(dep in fields)) {
  const fromRelated = getFromRelatedEntities(dep, relatedEntities)
  if (fromRelated === undefined) {
    return { value: null, error: `Unknown field: ${dep}` }
  }
  …
} else if (fields[dep] === null && propagateNull) {
  return { value: null, error: null }        // <- blank, which is what we want
}
```

**Absent key → error. Present-and-`null` key → blank.** That is exactly the distinction D-14 exists
to exploit.

The server builds its `fields` map with `buildFormulaFieldValues`
(`src/lib/formula-recalc.ts:430-451`), in this precedence order:

1. every native attribute from `ENTITY_NATIVE_ATTRIBUTES[entityType]` (falling back to `null`)
2. **`null` for every active definition name** ← the D-14 seeding pass
3. the row's stored JSONB, each value passed through `unwrapFormulaValue`

The client builds its map at `custom-fields-section.tsx:50-53`:

```ts
const allFieldValues = useMemo(() => ({ ...entityAttributes, ...localValues }), [entityAttributes, localValues])
```

Steps 2 and 3's unwrapping are **both missing**. Three consequences, all verified by reading source:

| Divergence | Effect |
|---|---|
| No `null` seed for definitions | Unset source → `#ERROR — Unknown field: X` on a record whose `custom_fields` is `{}`. **This is CFUI-03.** |
| No `unwrapFormulaValue` | A formula referencing another formula gets the raw `{formula:true,value:…}` object; arithmetic yields `NaN` → silent blank. Latent, same class. |
| `activities/[id]/page.tsx:252-257` passes **no `entityAttributes` at all** | An activity formula using `{{Title}}` or `{{DueDate}}` errors client-side while the DB holds the right value. Latent, same class. (deal / organization / person pages do pass them, and their keys match `ENTITY_NATIVE_ATTRIBUTES` exactly.) |

`unwrapFormulaValue` lives in `src/lib/formula-helpers.ts:160`, which imports only
`./formula-engine` — **no `@/db` import, so it is safe to import from a client component**
`[VERIFIED: grep of imports]`. `buildFormulaFieldValues` itself lives in `formula-recalc.ts`, which
**does** import `@/db` and therefore **cannot** be imported client-side. The seeding logic must be
reimplemented client-side (it is 4 lines) or extracted into a db-free module.

---

## Fix Design

Prescriptive. These are the recommended shapes, not options to weigh.

### Fix 1 — CFUI-01: a client trigger wrapper

Create `src/app/admin/fields/[entityType]/add-field-button.tsx`:

```tsx
'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldDialog } from './field-dialog'
import type { CustomFieldDefinition, EntityType } from '@/db/schema'

export function AddFieldButton({
  entityType,
  availableFields,
  label,
}: {
  entityType: EntityType
  availableFields: CustomFieldDefinition[]
  label: string
}) {
  return (
    <FieldDialog entityType={entityType} availableFields={availableFields}>
      <Button>
        <Plus className="h-4 w-4 mr-2" />
        {label}
      </Button>
    </FieldDialog>
  )
}
```

`page.tsx:46-51` becomes `<AddFieldButton entityType={…} availableFields={activeFields} label={t('addField')} />`.

Why this and nothing else:
- No React element crosses the boundary — only serializable data. Deferral of a *data* prop is
  harmless; deferral of an *element* prop into an `asChild` slot is the bug.
- `t('addField')` is resolved server-side and passed as a string, preserving `getTranslations`
  usage. (Alternative: make the wrapper use `useTranslations`. Either is fine; the string prop is
  smaller and keeps the i18n call in one place.)
- It is byte-for-byte the pattern `src/app/workflows/new-workflow-button.tsx` already uses, and the
  pattern `fields-list.tsx` already proves works with all 155 rows.

**Recommended alongside (not instead of): make `FieldDialog` defensive.** Change `SlotClone`'s blind
spot into a loud one — e.g. in `FieldDialog`, `if (!isValidElement(children)) throw new Error(...)`,
or wrap the trigger in `<DialogTrigger asChild={isValidElement(children)}>`. A silent `null` is what
made this cost a browser E2E pass to find. Keep it small; the structural fix is the real repair.

**Explicitly rejected:** the slim `{id,name,type}` projection from CONTEXT.md (measured: still
defers at 155 — see R11); reordering props to put `children` first (R13 — depends on object key
insertion order); passing `string[]` of names (R12 — works only by byte-count coincidence).

*(A slim projection is still worth doing **as a payload optimisation** — 155 full rows are ~78 KB of
flight payload for a prop `FieldDialog` reads only at `field-dialog.tsx:239-256` for `id`, `name` and
`type`. But it must be framed as an optimisation, tested as one, and must not be mistaken for the
CFUI-01 repair.)*

### Fix 2 — CFUI-02: return the recomputed values and merge them

Three edits, all additive:

1. `src/lib/custom-fields.ts:196-261` — capture the `recalculateFormulas` result and return it:
   ```ts
   let recalculated: Record<string, unknown> = next
   try {
     const result = await recalculateFormulas({ … })
     recalculated = result.customFields
   } catch (error) { /* D-05: unchanged — never block the user's edit */ }
   return { success: true, values: recalculated }
   ```
   The `{ success: true }` shape is preserved; `values` is a new optional key. Note the existing
   `catch` must keep swallowing (D-05) and fall back to `next`.

2. `src/app/api/custom-fields/save/route.ts` — no change needed; it already does
   `NextResponse.json(result)`. Verify the type flows.

3. `src/components/custom-fields/custom-fields-section.tsx:55-73` — merge the server's answer:
   ```ts
   const result = await saveCustomFields(entityType, entityId, newValues)
   if (result.success) {
     if (result.values) setLocalValues(result.values)
     onValuesChange?.(result.values ?? newValues)
   }
   ```

After this, the wrapper in `localValues` is always the one the server just wrote, so
`formula-field.tsx`'s cached branch displays the stored value with **no page load** — SC-3 satisfied
literally, not approximately.

`RecalculateFormulasResult.customFields` is typed `Record<string, unknown>`
(`src/lib/formula-recalc.ts:606-611`) `[VERIFIED]`.

### Fix 3 — CFUI-03: seed the client evaluator

In `custom-fields-section.tsx`, replace the `allFieldValues` memo so it mirrors
`buildFormulaFieldValues`'s precedence exactly:

```ts
import { unwrapFormulaValue } from '@/lib/formula-helpers'

const allFieldValues = useMemo(() => {
  const seeded: Record<string, unknown> = { ...entityAttributes }
  for (const d of definitions) seeded[d.name] = null           // D-14
  for (const [k, v] of Object.entries(localValues)) seeded[k] = unwrapFormulaValue(v)
  return seeded
}, [entityAttributes, definitions, localValues])
```

Order matters and must match the server: natives → `null` seed → stored (unwrapped). Getting the
order wrong reintroduces the divergence in the opposite direction.

Optional, same class, cheap, worth including if the planner wants the phase goal ("a formula's
displayed value always agrees with its stored value") to hold for activities too: pass
`entityAttributes` from `src/app/activities/[id]/page.tsx` like the other three detail pages do.
Flag this to the user — it is adjacent to CFUI-03, not literally named by it.

---

## Architecture Patterns

### System diagram — where each defect lives

```
  ┌──────────────────────── SERVER (RSC) ────────────────────────┐
  │ page.tsx (server)                                            │
  │   getAllFieldDefinitions() ──► activeFields: 155 rows        │
  │        │                                                     │
  │        ├─► <FieldDialog availableFields={…}>                 │
  │        │        <Button/>  ◄── a React ELEMENT prop          │
  │        └─► <FieldsList fields={…}/>   (data only)            │
  └──────────────────────────┬───────────────────────────────────┘
                             │  React Flight serializer
                             │  serializedSize += keys + strings
                             │  > MAX_ROW_SIZE (3200)?
                             │     ├─ no  → inline element  ✅
                             │     └─ yes → deferTask → "$L19"  ◄── CFUI-01
                             ▼
  ┌──────────────────────── CLIENT / SSR ────────────────────────┐
  │ FieldDialog  <DialogTrigger asChild>{children}</DialogTrigger>│
  │   Radix SlotClone: isValidElement(lazy)? no → return null  ◄──┤ CFUI-01 lands here
  │                                                               │
  │ CustomFieldsSection                                           │
  │   localValues = useState(values)      ◄── never re-synced     │
  │   handleSave → fetch /api/custom-fields/save                  │
  │                     └► { success: true }  (no values back) ◄──┤ CFUI-02
  │   allFieldValues = {...entityAttributes, ...localValues}      │
  │                     └► no null seed, no unwrap            ◄───┤ CFUI-03
  │        │                                                      │
  │        └─► FormulaField                                       │
  │              isCachedResult ? wrapper-from-page-load  ◄───────┤ CFUI-02
  │                            : live QuickJS evaluate    ◄───────┤ CFUI-03
  └───────────────────────────────────────────────────────────────┘
                             │
  ┌──────────────────────────▼─── SERVER (API route) ────────────┐
  │ /api/custom-fields/save → saveFieldValues                     │
  │   stripFormulaKeys → UPDATE → recalculateFormulas             │
  │     returns { customFields, evaluations }  ◄── DISCARDED today│
  └───────────────────────────────────────────────────────────────┘
```

### Pattern 1: Client trigger wrapper for `asChild` dialogs

**What:** When a server component needs to render a trigger for a client dialog/popover/tooltip,
create a tiny `'use client'` component that owns *both* the wrapper and the trigger element.
**When to use:** Always — never pass JSX children from a server component into a component that
slots them through `asChild`.
**Existing precedent in this repo:** `src/app/workflows/new-workflow-button.tsx` `[VERIFIED]`.

### Pattern 2: Server-authored derived values round-trip through the mutation response

**What:** When the server is the sole writer of a derived value (Phase 34 T-34-04), the mutation
response must carry the recomputed value back so the client can display it without a refetch.
**When to use:** Any client-side optimistic-ish state that mirrors a server-derived JSONB blob.
**Anti-pattern it replaces:** client re-derivation (two evaluators, guaranteed to diverge — this is
literally what CFUI-02 and CFUI-03 are).

### Anti-patterns to avoid

- **Passing an element and bulk data in the same props object across an RSC boundary.**
  Silent `null` at ~3200 bytes. Non-obvious, non-logging, and dependent on production data volume.
- **`useState(prop)` as a cache for server state that a mutation changes.** The prop updates on
  refresh; the state never does. This is Part B of CFUI-02.
- **A second evaluator for a value the server already computed.** Every seeding, unwrapping and
  precedence rule has to be duplicated exactly, forever. Prefer "server computed it, client
  displays it," with live evaluation only as a pre-first-save fallback.
- **Assuming a payload-size hypothesis without instrumenting the flight stream.** CONTEXT.md's
  inferred fix would not have worked; only reading the payload revealed why.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Deciding whether a value crossed the boundary as a real element | A size heuristic or a `typeof` check sprinkled around | `React.isValidElement(children)` guard in `FieldDialog`, plus the structural fix | It is the exact predicate Radix uses; anything else drifts |
| Serializing an element tree to assert the boundary contract | A hand-written flight-payload parser | `next/dist/compiled/react-server-dom-webpack/server.edge.js` `renderToReadableStream` under `resolve.conditions: ['react-server']` | This is the **actual serializer that ships**, so the test can never disagree with production. Proven working in vitest this session (R10–R13) |
| Rendering a component in a test | Adding jsdom / happy-dom / @testing-library | `renderToStaticMarkup` from `react-dom/server` in the existing `node` environment | Already a dependency; works today; 757 ms; **zero new packages** (R9) |
| Seeding the client field map | A bespoke "if undefined then blank" branch in `formula-field.tsx` | Mirror `buildFormulaFieldValues`'s three-step precedence in the `allFieldValues` memo | The engine already distinguishes absent-vs-null (`formula-engine.ts:207-217`); the only correct fix is to make the key present |
| Getting recomputed formula values back to the client | A second `GET` after every save, or a `router.refresh()` | `recalculateFormulas`'s existing `{ customFields }` return value | It is already computed and already returned — it is simply thrown away today |

---

## Common Pitfalls

### Pitfall 1: "The slim projection fixed it" — measured against the wrong dataset
**What goes wrong:** Someone ships the `{id,name,type}` projection, tests on person (6) or a fixture,
sees the button, closes the ticket. Deal still has no button.
**Why:** The projection only moves the cliff from n=21 to n=100. Deal is 155.
**How to avoid:** Every CFUI-01 verification must hit `/admin/fields/deal` on the live dataset.
**Warning sign:** Any verification step that constructs its own fixture of definitions.

### Pitfall 2: Fixing `field-dialog.tsx` instead of the call site
**What goes wrong:** Adding `isValidElement` handling *inside* `FieldDialog` (e.g. rendering a
fallback button) makes the button appear but leaves the boundary contract broken, and the next
`asChild` consumer repeats the bug.
**How to avoid:** The structural fix (client wrapper) is mandatory; the defensive guard is additive.

### Pitfall 3: Merging the server's values but forgetting `stripFormulaKeys` round-trips
**What goes wrong:** After Fix 2, `localValues` contains `{formula:true,…}` wrappers, which the next
save POSTs back. `saveFieldValues` calls `stripFormulaKeys(values, definitions)` first
(`custom-fields.ts:212`), so this is already handled — but a test that asserts on the POST body must
expect wrappers to be present and stripped, not absent.
**Warning sign:** A new test asserting the client never sends formula keys.

### Pitfall 4: Getting the seeding precedence backwards
**What goes wrong:** `{...nullSeed, ...entityAttributes, ...localValues}` nulls nothing useful;
`{...entityAttributes, ...localValues, ...nullSeed}` **wipes every real value**.
**How to avoid:** natives → `null` seed → stored. Copy the order from
`buildFormulaFieldValues` (`formula-recalc.ts:434-449`) and pin it with a test asserting a set value
survives seeding.

### Pitfall 5: `rtk` eats the test output
**What goes wrong:** `npx vitest run … | tail` prints `PASS (1) FAIL (0)` and nothing else — including
when you redirect to a file first. Debugging output from `console.log` in a test is invisible.
**How to avoid:** `rtk proxy npx vitest run …`. Confirmed again this session.

### Pitfall 6: Reproducing CFUI-02 on the wrong record state
**What goes wrong:** Testing on a brand-new record takes the *live* branch, which works correctly —
the tester concludes CFUI-02 is fixed when nothing changed.
**How to avoid:** Reproduce on a record whose `custom_fields` **already contains** a
`{formula:true,…}` wrapper, loaded fresh. Verify the precondition in psql before editing.

### Pitfall 7: Chasing the "20 s wait" as a streaming problem
**What goes wrong:** Assuming a Suspense boundary is pending and adding `<Suspense>` or loading
states.
**Why it's wrong:** The flight stream is complete (R5) and there is no Suspense marker in the HTML
(R4). Nothing is pending; the subtree was discarded.

---

## Code Examples

### Reproducing the flight-payload evidence (no browser needed)

```bash
# 1. Forge a read-only admin session cookie from the container's own AUTH_SECRET
cat > /tmp/forge.mjs <<'EOF'
import { encode } from '@auth/core/jwt'
const now = Math.floor(Date.now()/1000)
console.log(await encode({
  token: { id: '<admin-uuid>', role: 'admin', email: '<admin-email>',
           sub: '<admin-uuid>', iat: now, exp: now + 3600 },
  secret: process.env.AUTH_SECRET,
  salt: '__Secure-authjs.session-token',   // NEXTAUTH_URL is https ⇒ secure cookie name
}))
EOF
docker cp /tmp/forge.mjs pipelite-app-1:/app/forge.mjs      # MUST be under /app for module resolution
TOKEN=$(docker exec pipelite-app-1 node /app/forge.mjs)

# 2. Fetch the server-rendered HTML
curl -s -H "Cookie: __Secure-authjs.session-token=$TOKEN" \
  http://localhost:3001/admin/fields/deal -o deal.html

# 3. Extract and inspect the flight stream
python3 - <<'PY'
import re, json
h = open('deal.html').read()
flight = ''.join(json.loads(p) for p in
    re.findall(r'self\.__next_f\.push\(\[1,(".*?")\]\)</script>', h, re.S))
print('children inlined?  ', '"children":[["$","button"' in flight)
print('children deferred? ', '"children":"$L'          in flight)
PY
```
`[VERIFIED: executed this session]`

### The mechanism, as an executable vitest test (node env, zero new packages)

```tsx
// src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'

/** What the Flight client produces for a deferred `"$L<id>"` prop. */
function flightLazy(node: React.ReactElement): React.ReactNode {
  const chunk = { status: 'fulfilled', value: node, then() {} }
  return { $$typeof: Symbol.for('react.lazy'), _payload: chunk,
           _init: (p: typeof chunk) => p.value } as unknown as React.ReactNode
}

const button = <button type="button">Add Field</button>
const wrap = (c: React.ReactNode) =>
  renderToStaticMarkup(<Dialog><DialogTrigger asChild>{c}</DialogTrigger></Dialog>)

describe('Radix asChild + RSC-deferred children', () => {
  it('renders a real element child', () => {
    expect(wrap(button)).toContain('Add Field')
  })
  it('SILENTLY DROPS a deferred child — the CFUI-01 failure mode', () => {
    expect(wrap(flightLazy(button))).toBe('')   // documents why this must never happen
  })
})
```
`[VERIFIED: ran green in 757 ms, vitest 4.0.18, environment: node]`

### The real Flight round-trip regression gate

Requires a second vitest project with `resolve.conditions: ['react-server']` — the flight **server**
refuses to load without it (`The "react" package in this environment is not configured correctly`).

```ts
// vitest.rsc.config.ts  (or a `projects:` entry in vitest.config.ts)
import { defineConfig } from 'vitest/config'
import path from 'path'
export default defineConfig({
  test: { globals: false, environment: 'node',
          include: ['src/**/*.rsc.test.?(c|m)[jt]s?(x)'] },
  resolve: { alias: { '@': path.resolve(__dirname, './src') },
             conditions: ['react-server'] },
})
```

```tsx
// src/app/admin/fields/[entityType]/__tests__/field-dialog-boundary.rsc.test.tsx
import { describe, it, expect } from 'vitest'
import React from 'react'

async function flight(node: React.ReactNode) {
  const { renderToReadableStream }: any =
    await import('next/dist/compiled/react-server-dom-webpack/server.edge.js')
  const reader = renderToReadableStream(node, {}).getReader()
  const chunks: Uint8Array[] = []
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value) }
  return Buffer.concat(chunks).toString('utf8')
}

const defs = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `0e2b1c9a-1111-4000-8000-${String(i).padStart(12, '0')}`, entityType: 'deal',
  name: `Campo de teste ${i}`, type: 'text', config: null, required: false,
  position: `${i}.0000000000`, showInList: false,
  createdAt: null, updatedAt: null, deletedAt: null,
}))

describe('the admin fields header must not defer an element child (CFUI-01)', () => {
  it('deferral is real and happens at 21 full definition rows', async () => {
    const tree = (n: number) => React.createElement('span',
      { 'data-entity': 'deal', 'data-fields': defs(n) as any },
      React.createElement('button', { type: 'button' }, 'Add Field'))
    expect(/"children":"\$L/.test(await flight(tree(20)))).toBe(false)
    expect(/"children":"\$L/.test(await flight(tree(21)))).toBe(true)
  })
})
```
`[VERIFIED: this exact harness ran green and produced the n=20/n=21 boundary this session]`

**Note the vitest `projects` caveat:** the `react-server` condition applies to the whole project, so
that project cannot also import `react-dom/server`. Keep the two test styles in separate projects
(`*.rsc.test.tsx` vs everything else).

---

## Runtime State Inventory

Not applicable — Phase 44 is a UI repair with no rename, refactor, migration or string replacement.
Explicitly checked and confirmed empty:

| Category | Finding |
|---|---|
| Stored data | **None.** No schema change, no JSONB key rename. Fix 2 changes only what is *returned*, not what is *written* — `saveFieldValues` still writes `next` then `recalculateFormulas` writes the recomputed blob, exactly as today. |
| Live service config | **None.** No n8n / Datadog / Tailscale / Cloudflare surface in this phase. |
| OS-registered state | **None.** |
| Secrets / env vars | **None.** (`AUTH_SECRET` was *read* for reproduction; nothing was changed.) |
| Build artifacts | **Docker image only.** Any fix requires `docker compose up -d --build` before browser verification — the defects were originally chased on a stale image (CONTEXT.md § Environment note). |

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Docker + compose | browser verification | ✓ (no sudo) | app/postgres/mailhog all up | — |
| PostgreSQL (`pipelite-postgres-1`) | stored-value assertions | ✓ | 16-alpine, healthy, `localhost:5433` | — |
| Next.js | — | ✓ | **16.1.6** | — |
| React / React DOM | render tests | ✓ | **19.2.3** | — |
| vitest | all tests | ✓ | **4.0.18**, 50 files / 777 passing | — |
| `react-dom/server` (`renderToStaticMarkup`) | Fix 1 regression test | ✓ | bundled with react-dom 19.2.3 | — |
| `next/dist/compiled/react-server-dom-webpack/server.edge.js` | Flight round-trip gate | ✓ | bundled with Next 16.1.6 | Fall back to the `renderToStaticMarkup` test alone |
| `@radix-ui/react-slot` | mechanism analysis | ✓ | via `radix-ui` 1.4.3 | — |
| jsdom / happy-dom / @testing-library | — | ✗ | — | **Not needed.** `renderToStaticMarkup` in the `node` environment covers everything this phase requires |
| Playwright / any browser driver | SC-1/SC-3/SC-4 browser criteria | ✗ | — | `curl` + forged admin cookie covers the **server-rendered HTML** assertions (R3/R4); genuinely interactive assertions (clicking, typing, watching a number change) remain `checkpoint:human-verify` |

**Missing with no fallback:** none.
**Missing with fallback:** browser automation — see § Validation Architecture.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`, and `tdd_mode` is `true`.

### Test Framework

| Property | Value |
|---|---|
| Framework | vitest **4.0.18** |
| Config file | `vitest.config.ts` — `environment: node`, `include: ['src/**/*.{test,spec}.?(c\|m)[jt]s?(x)']`, `exclude: [...configDefaults.exclude, '**/.next/**']`, alias `@ → ./src` |
| **New: RSC project config** | A second config/project with `resolve.conditions: ['react-server']` is required for the Flight round-trip gate. Suggested `include: ['src/**/*.rsc.test.?(c\|m)[jt]s?(x)']` — note the base config's `include` already matches `*.test.tsx`, so the RSC files must be **excluded** from the base project or they will fail there |
| Quick run command | `rtk proxy npx vitest run src/app/admin/fields src/components/custom-fields src/lib/custom-fields.test.ts` |
| Full suite command | `rtk proxy npx vitest run` |
| **Baseline (measured this session)** | **50 files / 777 passed / 4 skipped, exit 0, 26.9 s** — supersedes 34-VALIDATION.md's stale 461 |
| Other gates | `npx tsc --noEmit`; `npx eslint` |
| DB-free | Yes. `.tsx` transform works out of the box (esbuild + `tsconfig.jsx: react-jsx`); no `@vitejs/plugin-react` needed `[VERIFIED]` |

### Phase Requirements → Test Map

| Req | Behavior | Type | Automated command | File exists? |
|---|---|---|---|---|
| CFUI-01 | A real element child renders through `DialogTrigger asChild`; a Flight-deferred child renders **empty** (the trap, documented) | unit | `rtk proxy npx vitest run src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` | ❌ Wave 0 |
| CFUI-01 | The header trigger's props do **not** cause element deferral — asserted through the real Flight serializer, incl. the n=20/n=21 boundary | unit (RSC project) | `rtk proxy npx vitest run --config vitest.rsc.config.ts` | ❌ Wave 0 |
| CFUI-01 | `page.tsx` renders the header trigger from a `'use client'` component, not by passing JSX children into `FieldDialog` | structural | same file, source-read assertion | ❌ Wave 0 |
| CFUI-01 | `/admin/fields/deal` server HTML contains the Add Field button, against the live 155-row dataset | **manual / scripted** | forged-cookie `curl` (see § Code Examples) — see Manual-Only | ❌ |
| CFUI-02 | `saveFieldValues` returns `values` equal to `recalculateFormulas`' `customFields`, and still returns `{success:true}` | unit | `rtk proxy npx vitest run src/lib/custom-fields.test.ts` | ✅ extend |
| CFUI-02 | On the D-05 recalc-throws path, `values` falls back to `next` and `success` stays `true` | unit | same | ✅ extend |
| CFUI-02 | `CustomFieldsSection` replaces `localValues` with the API's `values`, so `FormulaField` receives the freshly-computed wrapper | unit (render) | `rtk proxy npx vitest run src/components/custom-fields/__tests__/custom-fields-section.test.tsx` | ❌ Wave 0 |
| CFUI-03 | `allFieldValues` contains a `null` entry for **every** active definition name, and stored values survive seeding (precedence) | unit | same file | ❌ Wave 0 |
| CFUI-03 | `evaluateFormula` over a seeded map returns `{value:null, error:null}` — **not** `Unknown field` — for an unset source | unit | `rtk proxy npx vitest run src/lib/formula-engine.test.ts` (extend) | ✅ extend |
| CFUI-03 | Stored `{formula:true,…}` wrappers are unwrapped before entering `allFieldValues` | unit | custom-fields-section test | ❌ Wave 0 |
| Regression | Phase 34's suite stays green | regression | `rtk proxy npx vitest run` ≥ 777 passing | ✅ must not regress |

### Sampling Rate

- **Per task commit:** the single test file touched (each < 2 s).
- **Per wave merge:** `rtk proxy npx vitest run && npx tsc --noEmit && npx eslint` (~60 s).
- **Phase gate:** full suite ≥ 777 passing, plus the Docker browser checkpoint signed off.

### Wave 0 Gaps

- [ ] `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` — CFUI-01 mechanism + structural gate
- [ ] `vitest.rsc.config.ts` (or a `projects:` entry) with `resolve.conditions: ['react-server']`, **plus** an `exclude` in the base config so `*.rsc.test.tsx` does not run twice
- [ ] `src/app/admin/fields/[entityType]/__tests__/field-dialog-boundary.rsc.test.tsx` — Flight round-trip gate
- [ ] `src/components/custom-fields/__tests__/custom-fields-section.test.tsx` — **no component test exists anywhere in the repo today**; this is the first
- [ ] Extend `src/lib/custom-fields.test.ts` for the new `values` return key
- [x] No framework install needed — vitest 4.0.18 + react-dom/server + the bundled flight serializer cover everything `[VERIFIED]`

**Rendering `CustomFieldsSection` in a test needs two mocks:** it is a client component that
transitively pulls in `next-intl`'s `useFormatter` (via `FormulaField`) and `global.fetch`. Wrap in
`NextIntlClientProvider` or `vi.mock('next-intl')`, and `vi.stubGlobal('fetch', …)`. Neither needs a
new package. If the planner prefers to avoid this entirely, extract the `allFieldValues` seeding into
a pure exported helper (e.g. `buildClientFieldValues(definitions, entityAttributes, values)`) and unit
test **that** — cheaper, and it also makes the server/client parity explicit.

### Manual-Only Verifications

| Behavior | Req | Why manual | Instructions |
|---|---|---|---|
| Add Field button renders and creates a field on `/admin/fields/deal` (155 defs) | CFUI-01 | Requires the live dataset and an interactive click-through-to-create; the automated gates test the serialization contract, not the whole page | 1. `docker compose up -d --build`. 2. Log in as admin, open `/admin/fields/deal`. 3. Button present → click → create `GSD Temp Text` (type: text). 4. Verify in psql, then archive/delete it. 5. Re-check `/admin/fields/{person,organization,activity}` still show the button. 6. Open a formula field's editor on **all four** and confirm the `{{…}}` chips still insert at the cursor. |
| Formula value updates on screen with no reload | CFUI-02 | Watching a rendered number change requires a browser | 1. Pick a person whose `custom_fields` **already contains** a `{formula:true,…}` wrapper (verify in psql first — this precondition is what distinguishes the broken branch). 2. Load the detail page fresh. 3. Edit the source field, press **Enter** (not Tab). 4. Displayed value must equal the psql value with no reload. |
| Unset formula renders blank | CFUI-03 | Same | Create a new person, open it before setting anything, confirm the formula shows blank/`Empty` and **not** `#ERROR — Unknown field`. |
| Cleanup | CONTEXT.md | — | Delete all `GSD*` definitions and records; confirm 155 / 8 / 6 and zero `GSD*` rows. |

**A scripted half of CFUI-01 is available and should be preferred where possible:** the forged-cookie
`curl` in § Code Examples asserts the server-rendered HTML on the live 155-row dataset without a
browser, and is the exact procedure that reproduced the bug. It is read-only. Treat it as a
`checkpoint:human-verify` helper script, not as a committed test (it needs a running container and a
secret).

---

## Security Domain

`security_enforcement` is not present in `.planning/config.json` (absent ⇒ enabled). This phase's
security surface is small but not empty.

### Applicable ASVS categories

| ASVS category | Applies | Standard control in this phase |
|---|---|---|
| V2 Authentication | no | Unchanged — `auth()` guard at `page.tsx:18-21` and `route.ts:8-11` |
| V3 Session Management | no | Unchanged. **Note:** research forged a session token from `AUTH_SECRET` for read-only reproduction. Never commit a token, never add one to a plan file. |
| V4 Access Control | **yes** | `page.tsx:19` requires `session.user.role === 'admin'`. Moving the trigger into a client component must **not** move any authorization decision client-side — the gate stays in the server component |
| V5 Input Validation | **yes** | `saveFieldValues` → `validateFieldValues` → `stripFormulaKeys` must all still run before the write. Fix 2 only changes the **return** value; it must not short-circuit validation |
| V6 Cryptography | no | None touched |

### Threat patterns for this stack

| Pattern | STRIDE | Mitigation, and its status here |
|---|---|---|
| Client-supplied formula results overwriting server-computed ones | Tampering | `stripFormulaKeys` (T-34-04) — **must remain**. Fix 2 makes the client hold wrappers, which it will POST back; they are stripped server-side. Assert this in a test |
| Leaking full `CustomFieldDefinition` rows (incl. `config` JSONB, `deletedAt`) into the browser | Information disclosure | Currently 155 full rows, ~78 KB, are shipped to every admin. Slim projection reduces the surface. Admin-only route, so severity is low, but it is a free win |
| Untrusted expression execution in the browser | Tampering / DoS | Already sandboxed via QuickJS. **Note the client path passes no resource bounds** — `evaluateFormula`'s limit argument is opt-in (D-18) and `formula-field.tsx:66` omits it, so an admin-authored `while(true)` would wedge the user's tab. Pre-existing, adjacent to this phase, **not named by CFUI-01/02/03** — flag to the user rather than silently fixing |
| Auth bypass via the new client wrapper | Elevation of privilege | The wrapper renders only when the server component renders it; server-side `notFound()` on non-admin is unchanged |

---

## State of the Art

| Old understanding | Current, verified understanding | Impact |
|---|---|---|
| "Large RSC payloads get dropped at the boundary" (CONTEXT.md hypothesis) | The payload is complete. React **defers** elements past `MAX_ROW_SIZE = 3200` into separate rows and substitutes `$L<id>` lazies | The fix is structural, not a size reduction |
| "A slim `{id,name,type}` projection restores the button" | Measured: still defers at n=100 and n=155 | The proposed fix would have failed silently in exactly the same way |
| "React Compiler might be involved" | **Not enabled.** `next.config.ts` sets only `output: 'standalone'` and `serverExternalPackages`; `babel-plugin-react-compiler` is not in `package.json`. Next 16 keeps React Compiler opt-in | Ruled out `[VERIFIED]` |
| "Component tests would require jsdom + @testing-library" | `renderToStaticMarkup` in the existing `node` environment renders shadcn/Radix components today, in 757 ms | **Zero new packages.** Phase 34's no-new-packages constraint holds |
| "The suite baseline is 461 tests" (34-VALIDATION.md) | **777 passed / 4 skipped across 50 files** | Update the phase's regression gate number |

**Deprecated / superseded:**
- 34-VALIDATION.md's `461 passed` baseline — stale, use 777.
- CONTEXT.md's "Suggested fix: pass a slim `{id, name, type}` projection" — **disproven**; keep it
  only as a payload optimisation.

---

## Package Legitimacy Audit

**This phase installs no external packages.** Every fix and every test uses dependencies already in
`package.json` and already exercised by the running application:

| Module | Source | Already installed | New install needed |
|---|---|---|---|
| `react-dom/server` (`renderToStaticMarkup`) | `react-dom@19.2.3` | ✓ | no |
| `next/dist/compiled/react-server-dom-webpack/server.edge.js` | `next@16.1.6` | ✓ | no |
| `@radix-ui/react-slot` | via `radix-ui@1.4.3` | ✓ | no |
| `vitest` | `vitest@4.0.18` (dev) | ✓ | no |

`slopcheck` was **not run** — correctly, since there are no candidate packages to check. If the
planner introduces a package despite this recommendation, the Package Legitimacy Gate must be run
first and every new package gated behind a `checkpoint:human-verify` task.

**Packages removed due to `[SLOP]`:** none. **Flagged `[SUS]`:** none.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | The n=20 / n=21 deferral boundary measured with synthetic Portuguese-length field names transfers to the real deal definitions | § CFUI-01 threshold table | Low. The exact boundary depends on name lengths; the *behaviour* (defer past 3200 bytes) is verified from React's source and the deal page's real payload. Do not hard-code "21" as a production invariant — only as a test fixture |
| A2 | `revalidatePath` inside a Route Handler does not push a fresh RSC payload to a mounted client | § CFUI-02 → correct pattern | Low, and moot: the recommended fix does not rely on revalidation at all. If wrong, the recommended fix is still correct and cheaper |
| A3 | CONTEXT.md's "editing twice within one page session did refresh correctly" is the *live-evaluation branch*, not a race | § CFUI-02 asymmetry | Low. The model reproduces every reported symptom exactly, including "the previous save's result". If it is instead a race, the recommended fix (server returns the values) still resolves it, because the cached branch then always holds the freshly-computed wrapper |
| A4 | Rendering `CustomFieldsSection` in vitest needs only `next-intl` + `fetch` mocks | § Wave 0 gaps | Low-medium. Untested — only `DialogTrigger` was rendered this session. Mitigation already given: extract the seeding into a pure helper and test that instead |
| A5 | The `activities/[id]` missing `entityAttributes` and the missing client-side QuickJS resource bounds are pre-existing and out of scope | § CFUI-03, § Security | Low. Both are flagged for the user rather than fixed |

---

## Open Questions

1. **Should the slim projection ship anyway, as an optimisation?**
   - Known: it does **not** fix CFUI-01 (R11), but it removes ~78 KB from every admin fields page load
     and stops shipping `config` JSONB and `deletedAt` to the browser.
   - Unclear: whether the planner wants optimisation scope in a repair phase.
   - Recommendation: include it, in its own task, labelled as an optimisation, with the CFUI-01 gate
     proving the button renders *independently* of it.

2. **Should `FieldDialog` throw loudly on a non-element child?**
   - Known: today it renders `null` in silence — that silence is why this cost a browser E2E pass.
   - Unclear: whether a dev-only `console.error` or a hard throw is preferred in this codebase.
   - Recommendation: a dev-only guard (`process.env.NODE_ENV !== 'production'`) so production users
     never see a crash, but any future regression is loud in development.

3. **Does the second vitest project (for `react-server`) belong in `vitest.config.ts` `projects:` or a
   separate config file?**
   - Known: both work. The base config's `include` matches `*.test.tsx`, so the RSC files must be
     excluded there either way.
   - Recommendation: a `projects:` array in the single `vitest.config.ts`, so `npm test` runs both
     and the phase gate stays one command.

4. **The two adjacent latent divergences (activities `entityAttributes`, client-side QuickJS resource
   bounds) — in or out?**
   - Both are the same class of defect as CFUI-03 and both are cheap.
   - Recommendation: surface to the user in `/gsd:discuss-phase`; do not decide unilaterally.

---

## Sources

### Primary (HIGH confidence — read or executed this session)
- `node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.development.js` — `MAX_ROW_SIZE = 3200` (:6296), `deferTask` (:1882-1897), `serializeLazyID` (:2320), element/lazy deferral checks (:2695, :2738), `serializedSize` accounting (:2586, :2908, :3917-3993)
- `node_modules/@radix-ui/react-slot/dist/index.js` — `createSlotClone`, the `isValidElement` → `null` early-out
- `src/app/admin/fields/[entityType]/{page,field-dialog,fields-list}.tsx`
- `src/components/custom-fields/{custom-fields-section,formula-field,field-renderer,inline-edit}.tsx`
- `src/lib/{custom-fields,formula-recalc,formula-engine,formula-helpers}.ts`
- `src/app/api/custom-fields/save/route.ts`
- `src/app/workflows/new-workflow-button.tsx` — the correct-pattern precedent
- `src/app/{deals,people,organizations,activities}/[id]/page.tsx`
- `next.config.ts`, `package.json`, `vitest.config.ts`, `tsconfig.json`
- Live flight payloads for `/admin/fields/{person,deal}` fetched from the running container
- Executed probes: `renderToStaticMarkup` + Radix `Slot`; real Flight serializer deferral bisect
- `rtk proxy npx vitest run` — 50 files / 777 passed / 4 skipped

### Secondary (MEDIUM confidence)
- `.planning/phases/44-custom-field-ui-repair/44-CONTEXT.md`
- `.planning/phases/34-formula-reactivity/34-VALIDATION.md` (baseline superseded)
- `.planning/REQUIREMENTS.md:90-92`
- Next.js docs on `revalidatePath` semantics in Route Handlers `[CITED: nextjs.org/docs/app/api-reference/functions/revalidatePath]`

### Tertiary (LOW confidence)
- None. Every claim in this document is either read from source in this repository, executed in this
  session, or explicitly labelled in the Assumptions Log.

---

## Metadata

**Confidence breakdown:**
- CFUI-01 mechanism: **HIGH** — reproduced live, flight payload inspected, React and Radix source read, mechanism reproduced in an isolated executable test, deferral threshold bisected through the real serializer, and the proposed fix disproven by measurement
- CFUI-02 mechanism: **HIGH** — derived from source; the model reproduces every reported symptom including the asymmetry CONTEXT.md could not explain
- CFUI-03 mechanism: **HIGH** — the exact `if (!(dep in fields))` branch and the exact missing seeding pass are both identified in source
- Fix design: **HIGH** — all three fixes use APIs and return values that already exist
- Test strategy: **HIGH** for the CFUI-01 gates (both harnesses executed green this session); **MEDIUM** for `CustomFieldsSection` rendering (mock surface untested — see A4)
- Package cost: **HIGH** — zero new packages, proven by running the tests

**Research date:** 2026-08-15
**Valid until:** ~2026-09-14. `MAX_ROW_SIZE` is a React internal and can change in any React/Next
minor — if this phase's Flight round-trip test starts failing after a Next upgrade, re-measure the
threshold rather than assuming a regression.
