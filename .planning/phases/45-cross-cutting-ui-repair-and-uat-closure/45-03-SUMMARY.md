---
phase: 45-cross-cutting-ui-repair-and-uat-closure
plan: 03
subsystem: ui
tags: [next-themes, dark-mode, radix, next-intl, react, accessibility, source-gate]

# Dependency graph
requires:
  - phase: 45-01
    provides: the four theme.* message keys (label/light/dark/system) in all three locale files, plus their REQUIRED_SHELL_KEYS presence contract
provides:
  - dark mode is reachable for the first time — ThemeProvider mounted in the root layout with the four locked props
  - a three-value theme control (light / dark / system) inside UserMenu, persisted by next-themes' default localStorage key
  - suppressHydrationWarning on <html>, covering both attributes the pre-hydration script writes
  - the C-1 colour repair — sign-out reads --destructive instead of red-600
  - src/app/__tests__/theme-wiring.test.ts — a comment-blind source gate over both files
  - a free fix with no edit of its own — src/components/ui/sonner.tsx's useTheme() now resolves for real (T-7)
affects: [45-08 e2e theme spec, 45-11 rebuild-and-verify, every future "check it in dark mode" UAT item anywhere in Pipelite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a library provider that ships its own client directive imports DIRECTLY into the async server layout — no local wrapper module"
    - "provider position justified by what it EMITS (an inline script) rather than by convention, and pinned by an index-comparison assertion rather than by a substring"

key-files:
  created:
    - src/app/__tests__/theme-wiring.test.ts
  modified:
    - src/app/layout.tsx
    - src/components/user-menu.tsx

key-decisions:
  - "No mounted hydration gate, and the reason is written into the failure message: react-hooks/set-state-in-effect is severity 2 here so the standard recipe fails lint, AND a closed Radix menu portal renders nothing, so the radio items first mount on a user click — there is no mismatch to guard"
  - "value={theme ?? \"system\"} is required, not defensive — next-themes' state initializer returns undefined while there is no window, so theme is genuinely undefined during SSR"
  - "ThemeProvider sits between NextIntlClientProvider and HotkeysProvider so its inline script is the first DOM node inside <body>; the gate asserts this by comparing indexOf positions, because a substring check cannot express 'above'"
  - "Three flat radio rows, not a DropdownMenuSub — a 224px (w-56) menu spawning a nested panel inside a ~305px client width has nowhere to open, and nested menus are hostile to touch"
  - "No local src/components/theme-provider.tsx was created and its absence is gated: a wrapper would be a second place for the four locked props to drift"
  - "The provider's four props are gated individually because each is silently survivable — the app still builds and renders with any of them dropped, it just stops honouring the theme"

patterns-established:
  - "Position gate: assert provider nesting with indexOf comparisons (intlAt < themeAt < hotkeysAt), so moving a wrapper up or down the tree fails loudly"
  - "A forbidden-recipe assertion carries BOTH of its independent reasons in the message, because a reader who knows only one of them will delete it"

requirements-completed: [SC-2]

# Metrics
duration: 10min
completed: 2026-08-18
---

# Phase 45 Plan 03: Dark Mode Provider and Toggle Summary

**Dark mode is reachable: `ThemeProvider` is mounted in the root layout with the four locked props, and `UserMenu` carries a three-value light/dark/system radio group whose choice persists through next-themes' `localStorage` key.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-18T09:47:00Z
- **Completed:** 2026-08-18T09:57:08Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `ThemeProvider` from `next-themes@0.4.6` mounted in `src/app/layout.tsx` between `NextIntlClientProvider` and `HotkeysProvider`, with exactly `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`. Imported directly — the library's dist entry begins with its own client directive, so no wrapper module exists and none was invented.
- `suppressHydrationWarning` on `<html>`, covering both attributes the pre-hydration script writes: the `class` (from `attribute="class"`) and `style="color-scheme: …"` (from `enableColorScheme`, which defaults to true and is not disabled).
- A three-row theme control in `src/components/user-menu.tsx` — `DropdownMenuLabel` + `DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}` with `light` / `dark` / `system`, each carrying `Sun` / `Moon` / `Monitor` at `mr-2 h-4 w-4` to match the four existing items exactly. All four strings come from the `theme.*` keys 45-01 landed.
- **C-1 repaired:** the sign-out item moved from `text-red-600 focus:text-red-600` to `text-destructive focus:text-destructive`. `red-600` (`#dc2626`) on the dark popover surface (`oklch(0.205 0 0)`) is roughly 3.4:1, below the 4.5:1 AA text threshold — and this plan is what makes that surface reachable.
- `src/app/__tests__/theme-wiring.test.ts` pins all of it: 13 tests, four vocabulary tables, three anti-vacuity assertions, and a prose second argument on every one of the 18 `expect(` calls.
- **T-7, free and recorded rather than "fixed":** `src/components/ui/sonner.tsx` already calls `useTheme()` and until now always read the default because no provider was mounted. It now follows the theme with **zero edits** — `git diff --stat src/components/ui/sonner.tsx` is empty, deliberately.

## Task Commits

Each task was committed atomically:

1. **Task 1: theme-wiring source gate (RED)** — `917e8d9` (test)
2. **Task 2: mount ThemeProvider + three-way toggle (GREEN)** — `4401a82` (feat)

**Plan metadata:** see the docs commit following this summary.

RED → GREEN was a real transition, not a formality: `917e8d9` alone runs **8 failed / 5 passed**, and the failure output names `next-themes` six times. The five that passed at RED are the anti-vacuity assertions plus the negative tables — which is exactly the intended shape, since a file with no theme code trivially satisfies every negative.

## Files Created/Modified

- `src/app/__tests__/theme-wiring.test.ts` (created) — comment-blind gate over both sources via `readStrippedSource`. Four tables: `LAYOUT_RECOGNISED` (7 tokens), `LAYOUT_LEFT_ALONE` (`<head`, `@/components/theme-provider`), `MENU_RECOGNISED` (10 tokens), `MENU_LEFT_ALONE` (the hydration-gate idioms plus the shared `FORBIDDEN_COLOURS` list). Plus the radio-item arity check, the provider-position index comparison, and a `theme.*` catalog resolution loop.
- `src/app/layout.tsx` (modified) — one import, `suppressHydrationWarning` on `<html>`, one `<ThemeProvider>` wrapper. The existing provider chain was not restructured.
- `src/components/user-menu.tsx` (modified) — `useTheme` + three lucide icons + two dropdown primitives imported, `tTheme` bound alongside the existing `t` / `tAuth`, the toggle block inserted above the sign-out separator, and the C-1 className swap.

## Decisions Made

- **No `mounted` gate, and the gate says why.** The standard next-themes recipe wraps theme UI behind a flag set from an effect. Forbidden here for two independent reasons, both written into the assertion message because a reader who knows only one of them will delete it: (a) `react-hooks/set-state-in-effect` resolves to severity 2 in this repo, so `useEffect(() => setMounted(true), [])` fails `npm run lint` and therefore CI — three Phase 38 plans hit that rule on code their own spec had specified; (b) it is unnecessary, because Radix `MenuPortal` renders `Presence present={forceMount || context.open}` and shadcn's `DropdownMenuContent` passes no `forceMount` to the Portal, so a closed menu renders nothing at all and the radio items first mount on a user click. **`user-menu.tsx` still contains zero `useEffect` and zero `useState`, and that is asserted.**
- **`theme ?? "system"` is load-bearing.** next-themes initialises with `useState(() => …)` whose initializer returns `undefined` when `typeof window === "undefined"`, so `theme` is genuinely `undefined` during SSR and a bare `value={theme}` would silently select nothing on a Radix radio group.
- **Position asserted by index comparison, not by substring.** `indexOf("<NextIntlClientProvider") < indexOf("<ThemeProvider") < indexOf("<HotkeysProvider")`. A `toContain` check cannot express "above", and the position is the whole point: `ThemeProvider` renders `[<ThemeScript/>, children]` and neither surrounding provider emits DOM, so at this position that `<script>` is the first DOM node inside `<body>` — the earliest moment the theme class can land. Nested any lower, `NavHeader` paints in the wrong theme first.
- **Three values, not two.** `defaultTheme="system"` makes OS-following the initial state, so a light/dark pair would strand the user outside it forever. The arity is pinned at exactly three: a fourth value would render a row the library can never select.
- **No `<head />` element.** The shadcn dark-mode doc shows one; it predates Next's automatic head management, changes nothing here, and risks disturbing the existing `next/font` variable classes. Its absence is gated.
- **`globals.css` untouched.** `git diff --stat src/app/globals.css` is empty. The `.dark` token block was already complete and correct; C-1 is a specific named repair, not a palette redesign.

## Deviations from Plan

None — plan executed exactly as written.

One implementation detail worth recording, since it is a JSX rule rather than a plan choice: the `suppressHydrationWarning` rationale is a **plain block comment above `return (`**, not a `{/* … */}` JSX comment. A JSX comment cannot sit as a sibling of the single root element inside a `return (…)` — it is a second child and a syntax error. Caught immediately by the compiler, before any commit.

## Issues Encountered

None. The gate went red as designed, the implementation turned it green in one pass, and all three quality gates were clean on the first run.

## Verification

| Gate | Result |
|------|--------|
| `vitest run src/app/__tests__/theme-wiring.test.ts` at `917e8d9` (RED) | **8 failed / 5 passed**, failure text names `next-themes` |
| `vitest run src/app/__tests__/theme-wiring.test.ts` at `4401a82` (GREEN) | **13/13 passed** |
| `npm run test` (both vitest projects) | 97 files + 1 skipped, **2120 passed** / 21 skipped; RSC project **8 passed** |
| `npm run typecheck` | exit 0 |
| `npm run lint` | **0 errors**, 127 warnings (unchanged pre-existing baseline) |
| `eslint src/app/__tests__/theme-wiring.test.ts` | exit 0 — `react-hooks/set-state-in-effect` never fires |
| `grep -c "text-red-600" src/components/user-menu.tsx` | **0** (raw file, not comment-stripped) |
| `grep -c "DropdownMenuRadioItem value=" src/components/user-menu.tsx` | **3** |
| `test ! -e src/components/theme-provider.tsx` | passes — no wrapper module invented |
| `git diff --stat src/components/ui/sonner.tsx` | empty (T-7 is free) |
| `git diff --stat src/app/globals.css` | empty |
| Every `expect(` carries a prose second argument | 18/18 — zero single-line bare assertions (`grep "expect(.*)\."` returns nothing) |

Per the phase's VALIDATION rule V-7, **no Docker rebuild was performed** — Wave 4 (45-11) pays the phase's single rebuild. Behavioural proof that the choice survives a reload is `e2e/theme.spec.ts`, authored in 45-08 and run in 45-11.

## Threat Model Coverage

| Threat ID | Disposition | Outcome |
|-----------|-------------|---------|
| T-45-09 (tampering, localStorage `theme`) | accept | Unchanged. The value is consumed only as a CSS class name from the closed three-member set; it reaches no server action, no query, and no `dangerouslySetInnerHTML` this plan writes |
| T-45-10 (info disclosure, inline `ThemeScript`) | accept | Unchanged. Library-authored, fixed body, no project value interpolated |
| T-45-11 (DoS, hydration mismatch on `<html>`) | **mitigated** | `suppressHydrationWarning` present and asserted, with the failure message naming both attribute sources |
| T-45-12 (accessibility, sign-out contrast) | **mitigated** | C-1 applied; `text-red-` absent and asserted, alongside the whole shared `FORBIDDEN_COLOURS` list and a raw-hex check |
| T-45-SC (tampering, npm installs) | **mitigated** | Nothing installed. `next-themes@^0.4.6` was already a recorded dependency |

No new threat surface: this plan adds no endpoint, no auth path, no file access and no schema change.

## Known Stubs

None. Every control added is wired to real state.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Dark mode is now a real user state, which was the plan's cross-cutting purpose: every "check it in dark mode" UAT item anywhere in Pipelite is verifiable from here on. Concretely:

- **45-08** can author `e2e/theme.spec.ts` against a control that exists — the menu path is avatar trigger → `Theme` label → one of three radio rows, and persistence is next-themes' default `theme` key in `localStorage`.
- **45-11** will exercise it after the phase's single Docker rebuild.
- Any later plan touching a surface in this phase can verify it in both themes without further wiring.

One thing for whoever writes the e2e spec: the toggle rows do **not** exist in the DOM until the menu is opened, by design (a closed Radix portal renders nothing). A selector query before the trigger click will find nothing — that is correct behaviour, not a broken locator.

---
*Phase: 45-cross-cutting-ui-repair-and-uat-closure*
*Completed: 2026-08-18*

## Self-Check: PASSED

All three source files and this summary exist on disk; both task commits (`917e8d9`, `4401a82`) are present in `git log`.
