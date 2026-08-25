# Phase 45 — Deferred Items

Out-of-scope discoveries logged during execution. Not fixed here.

## D-45-04 — The admin drawer cannot be dismissed by swiping, because Radix Dialog has no swipe

**Found:** 2026-08-18, by the user on a real phone — the one check no instrument in this repo can
drive. This is the single item from 45-VALIDATION.md's Manual-Only Verifications table that did not
pass.

**What was tested, and what happened.** On a real device against `/admin/audit`:

| # | Check | Result |
|---|---|---|
| 1 | No horizontal scrollbar; hamburger top-left | ✅ pass |
| 2 | Tap hamburger → drawer opens, menu in the active language | ✅ pass |
| 3 | Dismiss by tapping the overlay | ✅ pass |
| 4 | **Dismiss by swiping left** | ❌ **does nothing** |
| 5 | Tap an entry → navigates AND closes | ✅ pass |
| 6 | Repeat in es-ES | ✅ pass |

**Root cause — this is an unimplemented capability, not a regression.** `src/components/ui/sheet.tsx`
wraps Radix's `Dialog` primitive (`import { Dialog as SheetPrimitive } from "radix-ui"`). Radix
Dialog has no gesture layer: grepping the file for `swipe`, `touchstart`, `pointerdown`, `onDrag` and
`translate` returns **zero** matches, and `vaul` — the library that actually provides
swipe-dismissable drawers — is **not** in `package.json`. shadcn's official `sheet` block has never
supported swipe. Nothing Phase 45 did removed this; it was never there.

**The actual defect is in the validation document, and it is worth naming.** `45-VALIDATION.md`'s
Manual-Only Verifications table instructed the tester to "dismiss by overlay tap **and by swipe**".
That expectation was written without checking whether the chosen primitive could do it, so it
promised a capability the implementation never had and could not have acquired without a new
dependency. A manual test that asserts an un-implementable behaviour will fail forever and teaches
the team to discount manual results — the precise habit this phase exists to break. **When
`45-VALIDATION.md` is next revised, that row should be corrected**, not silently dropped.

**Why deferred rather than fixed here.** Swipe-to-dismiss appears in none of SC-1..SC-5, and the
phase goal ("the app is usable on a phone") is met: the drawer has three working dismissal paths —
overlay tap, the close button, and navigation — plus Escape from a keyboard. Adding it means adding
`vaul` and replacing the Sheet primitive, which is a new dependency and a shared-component swap
landing after this phase's single Docker rebuild and after its verification passed. That is a
scope expansion, and it belongs to a phase that plans for it.

**How to fix, when someone picks it up:** install `vaul`, swap `src/components/ui/sheet.tsx` for the
shadcn `drawer` block (or a vaul-backed Sheet), and keep the `common.close` translation treatment
that 45-04 applied — the vaul block ships the same hardcoded English `sr-only` close label the Radix
one did, so re-adding it verbatim would reintroduce exactly the defect SC-3 removed. Re-run the
manual table on a real device afterwards; no automated check in this repo can confirm a swipe.

**Suggested owner:** whichever phase next does mobile or design-system work.

---

## D-45-01 — `src/lib/execution/toggle.test.ts` intermittently times out its `beforeEach` hook under parallel workers

**Found:** 2026-08-18, during 45-06's `npm run test` gate.

**Symptom:**

```
FAIL src/lib/execution/toggle.test.ts > toggleWorkflow > returns error when not authenticated
Error: Hook timed out in 10000ms.
  ❯ src/lib/execution/toggle.test.ts:61:3   (beforeEach)
```

**Measured:** in isolation the whole file passes in 6.57 s, with that single test taking **3.75 s**
of vitest's 10 s default `hookTimeout`. Under the full suite's parallel workers it crossed the
threshold in 2 of 5 consecutive `npm run test` runs on this machine; the other 3 runs were clean
(2178 passed / 21 skipped, exit 0). Nothing in 45-06 touches `src/lib/execution/` — the failure is
a wall-clock margin, not a behaviour change.

**Why deferred:** out of 45-06's scope boundary (a Phase 25/26 file), and it is the same class of
defect STATE.md already records for `src/lib/execution/condition-evaluator.test.ts` T-34-20 — a
wall-clock assertion that fails under vitest's own workers and passes in isolation. Both are live
CI-flake risks on master and both want the same fix: raise the budget or remove the dependence on
wall-clock, in the phase that owns the file. Do not chase either one per-phase.

**Suggested owner:** whichever phase next touches `src/lib/execution/`. Fix the two together.

---

## D-45-02 (F-1) — the fixed `ShortcutsHint` bar occludes actionable controls

**Found:** 2026-08-18, during 45-11's Task 2 visual verification (agent-driven Chromium against the
rebuilt image — see `45-11-SUMMARY.md` § Task 2 for who verified and how).

**Symptom:** `ShortcutsHint` renders as a fixed bottom bar and nothing reserves vertical space for
it, so it sits on top of page content rather than below it.

- Dark `/admin/audit` at 1280x900: it clips the sidebar's **Back to App** button.
- `/admin/audit` at 320x640 in es-ES: it wraps to two lines and covers
  **"Guardar período de retención"** — the save control for the retention setting.

**Why deferred:** this is *vertical occlusion*, not horizontal overflow, so it is outside SC-1 and
outside Phase 45's scope. It predates Phase 45 and is not a regression from any plan in it. It is
recorded rather than dismissed because it hides an actionable control, which is a real usability
defect and arguably an accessibility one.

**Suggested fix:** Phase 38 solved the identical class of problem for the bulk action bar with an
`h-40 sm:h-20` spacer that reserves the bar's height in normal flow. The same remedy very likely
applies here. Verify at 320px in **es-ES**, which is where the bar wraps to two lines and the
occlusion is worst — a fix validated only at en-US desktop will not be enough.

**Suggested owner:** whichever phase next touches the global shell or takes on mobile UX polish.

---

## D-45-03 (F-2) — `/deals` pipeline select renders with an empty label on dark — RESOLVED, NOT A DEFECT

> **RESOLVED 2026-08-18, same day, by direct measurement. No code change was needed or made.**
>
> Re-checked on a settled page in a real Chromium (reusing the harness `storageState`, read-only,
> no database write), at 1280x900, in BOTH themes:
>
> | theme | `[data-slot="select-trigger"]` count | `innerText` | boundingBox |
> |---|---|---|---|
> | light | 1 | `"BDR - Base Fria"` | 200x36 |
> | dark  | 1 | `"BDR - Base Fria"` | 200x36 |
>
> The label is present, identical in both themes, and the trigger is correctly sized. The original
> observation was a **capture-timing artefact**: `/deals` populates its pipeline list from a client
> component, and the first screenshot was taken before it settled. Waiting ~3.5s makes it render
> every time.
>
> This also **rules IN** 45-11's `min-w-0 max-w-full` addition to this trigger — the class is present
> in the measured `class` attribute (`w-[200px] min-w-0 max-w-full`) and the label renders anyway, so
> that SC-1 change is not implicated.
>
> 45-11 was right to refuse to edit code on the strength of one screenshot. Recording the negative
> result rather than silently deleting the item, so the next person does not re-investigate it.

**Found:** 2026-08-18, during 45-11's Task 2 visual verification.

**Symptom:** in the dark desktop capture of `/deals`, the pipeline `SelectTrigger` appeared to render
with no visible label text.

**Status: UNCONFIRMED, and deliberately recorded as such.** It may be a capture-timing artefact
(the trigger's value is populated by a client component and the screenshot may have been taken
before it settled) rather than a defect. This item asserts neither that it is broken nor that it is
fine — it asks someone to look.

**Why deferred:** unverified, and 45-11 declined to "fix" a symptom it could not reproduce
deterministically. Guessing at a repair here would have meant editing code on the strength of one
screenshot, which is exactly the failure mode this phase exists to correct.

**How to confirm:** load `/deals` in dark mode at a desktop viewport, let it settle, and read the
pipeline `SelectTrigger`. If it is genuinely empty, check `selectedPipelineId` against the pipeline
list — an id with no matching `SelectItem` renders the placeholder, and an empty placeholder renders
nothing. Note that 45-11 added `min-w-0 max-w-full` to this trigger for SC-1; if the label proves
genuinely absent, rule that change in or out first.

**Suggested owner:** whichever phase next touches `src/app/deals/kanban-board.tsx`.
