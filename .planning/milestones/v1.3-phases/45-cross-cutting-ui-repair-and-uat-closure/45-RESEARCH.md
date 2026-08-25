# Phase 45: Cross-Cutting UI Repair and UAT Closure - Research

**Researched:** 2026-08-17
**Domain:** Next.js 16 App Router shell repair (responsive layout, theming, i18n) + a first Playwright e2e harness
**Confidence:** HIGH

> **Every load-bearing claim in this document was verified in this session against the installed
> tree, the running Docker app, or a live Playwright run.** Where a claim could not be verified it is
> tagged `[ASSUMED]` and listed in § Assumptions Log. Five upstream claims were found to be wrong or
> incomplete — see § Corrections to Upstream Documents. Read that section before planning.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mobile Layout Strategy (scope items 1 & 2)**

- **Header search collapses to an icon button below the breakpoint**, opening the existing search
  dialog rather than rendering a shrunken inline input. Rationale: `w-64` resolves to 256px, which is
  84% of a 320px viewport — shrinking it in place yields a technically-non-overflowing but unusable
  control. The icon button removes the non-shrinkable 256px from the flex row entirely, which is the
  actual cause of the measured `scrollWidth` 416 vs `clientWidth` 305.
- **Admin sidebar becomes a Sheet drawer behind a hamburger trigger below the breakpoint.** shadcn
  `Sheet` is already a dependency. Rationale: `/admin/audit` measures `scrollWidth` 508 in pt-BR and
  526 in es-ES — a width-based rail degrades further with longer translations, so any fix that keeps
  the rail on screen (icon rail, scroll strip) keeps losing as locales grow.
- **Breakpoint is `md` (768px) for both**, matching the existing `hidden md:flex` on the main nav, so
  the header has exactly one collapse point rather than two.
- **The 320px criterion gets an automated regression check** asserting
  `document.scrollWidth <= document.clientWidth` across the six routes (`/organizations`, `/people`,
  `/deals`, `/activities`, `/trash`, `/admin/audit`) in all three locales. Manual measurement alone
  is the exact debt this phase exists to pay off.

**Dark Mode (scope item 3)**

- **Use `next-themes`** with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, and
  `disableTransitionOnChange`. It is already a dependency at `^0.4.6`, and `src/components/ui/sonner.tsx`
  already calls `useTheme()` — that hook currently always reads the default because no provider is
  mounted, so mounting one also fixes the toaster's theme.
- **The toggle lives inside `UserMenu`**, not as a standalone header button. Rationale: the header is
  the surface that overflows at 320px (scope item 1); adding another fixed-width control to it works
  against that fix.
- **Three-way toggle: light / dark / system.** Because `defaultTheme="system"` makes "system" a real
  state, a two-way toggle would give the user no way back to following the OS once they switched.
- **`suppressHydrationWarning` on `<html>`** in `src/app/layout.tsx` — mandatory, since next-themes
  writes the theme class before hydration.

**Shell Translation (scope item 4)**

- **All 11 admin sidebar strings move to a new `admin.nav.*` namespace** in `en-US.json`, `pt-BR.json`,
  and `es-ES.json`. This deliberately **overrides** the in-code comment in `admin-sidebar.tsx` that
  justified the English literals — that comment's argument was "don't half-migrate a single entry",
  and this migrates the entire array, which satisfies it rather than violating it. Remove or rewrite
  those comments as part of the change so the file does not carry a stale justification.
- **The dialog close `sr-only` label defaults from a shared `common.close` key inside
  `ui/dialog.tsx` and `ui/alert-dialog.tsx`**, keeping the prop available as a per-caller override.
  One edit fixes every call site; requiring ~16 callers to pass a label invites the same leak again.
- **The timeline "Deleted at" entry becomes a proper translated sentence**, matching the sibling
  delete entry, instead of a raw DB column name beside a raw ISO timestamp.
- **The hardcoded "Workflows" link in `nav-header.tsx` is in scope** — same defect class, same shell,
  found during this phase's scout. Every other link in that nav already calls `t()`.

**Bulk Failure Copy & the Drag Check (scope item 5 + carried-over)**

- **Fix the false retry hint by making the copy conditional on what survived the selection prune**,
  not by retaining vanished ids. The panel is told which failed ids are still selected and states
  only what is true. Rationale: re-selecting rows that have left the table would reintroduce ids the
  table cannot render, which is precisely what the prune exists to prevent — it would trade a false
  sentence for a broken selection.
- **When nothing survived the prune, render a distinct sentence**: the records are gone, so "fix the
  problem and try again" is actively wrong advice. Tell the user the list has moved on and to
  refresh. Keep the existing `retryHint` for the case where failed rows are genuinely still selected,
  and add a sibling key for the pruned case. Both need entries in all three locale files.
- **Close the deals-drag check with a real e2e runner** (a Playwright test project able to emit a held
  pointer sequence satisfying dnd-kit's activation constraint). SC-5 explicitly permits "converted
  into an automated test that can actually drive it", and this also gives regression G1 somewhere to
  be pinned — no current test can defend it. Synthetic pointer events remain refused as evidence:
  G1 proved synthetic dispatch hides a real defect on this exact component.
- **Keep the e2e harness minimal** — one config plus one spec covering drag-with-selection and the G1
  Escape regression. This is not a migration of the existing 2086-test suite, and the harness must
  not become a prerequisite for the remaining feature phases.

### Claude's Discretion

- Exact hamburger placement and Sheet width for the admin drawer.
- Whether the 320px check runs as a Playwright spec inside the new harness or as a jsdom-free
  layout assertion — plan-phase should pick whichever gives real layout measurement, since jsdom
  computes no layout and would make the assertion vacuous.
- Naming of the new message keys beyond the `admin.nav.*` namespace and `common.close`.
- Whether the theme toggle renders as a submenu or as three flat menu items in `UserMenu`.

> **All four discretion items were already resolved by `45-UI-SPEC.md` and are marked
> `[DISCRETION RESOLVED]` there.** They are: hamburger at the left of a `md:hidden` bar that is the
> first child of the admin content column; Sheet width `w-64` (256px); the 320px check runs in
> Playwright (V-1); flat radio items, not a submenu (T-4); bulk keys named `retryHintPartial` /
> `prunedHint`. The planner should treat those as settled and not re-open them.

### Deferred Ideas (OUT OF SCOPE)

- Broad migration of the existing suite to e2e — the harness added here stays minimal and
  single-purpose.
- Any redesign of the `.dark` token palette; the tokens are correct as shipped.

### Also out of scope, stated so the plan-checker does not flag them

- 234 hardcoded palette utilities across 45 other `.tsx` files (`45-UI-SPEC.md` § Color). Only
  `user-menu.tsx:87` is repaired, as rule C-1.
- `data-table.tsx` hardcoded `"Search organizations..."` / `"Add Organization"` (rule S-8) — Phases
  39–43 own those files.
- The trash tablist overflow (37-UAT G3) is already fixed (rule R-3). Do not re-touch it.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

Phase 45 has no entries in `.planning/REQUIREMENTS.md`. Its requirements are the five ROADMAP
success criteria, each traceable to a browser-UAT finding. The table below is the traceability map
the planner should use in place of REQ-IDs.

| ID | Source | Behaviour required | Research support |
|----|--------|--------------------|------------------|
| SC-1 | 37-UAT G5 + 36-HUMAN-UAT | `document.documentElement.scrollWidth <= .clientWidth` at a 320px viewport on 6 routes × 3 locales | § Pattern 3 (header collapse), § Pattern 4 (admin drawer), § Pattern 6 (the Playwright viewport spec, including the `--hide-scrollbars` finding that makes the measurement match the recorded baseline) |
| SC-2 | 37-UAT G6 | User can switch to dark mode from the UI; choice survives reload | § Pattern 1 (provider placement), § Pattern 2 (toggle without a `mounted` gate), § Code Example 1–2 |
| SC-3 | 36-HUMAN-UAT | Admin shell renders in the active locale; no hardcoded English in the sidebar or dialog close controls | § Pattern 5, § Pitfall 4 (the locale-parity contract lists), § Don't Hand-Roll |
| SC-4 | 38-UAT (major gap) | No bulk message asserts a selection state that is not true | § Pattern 7 (the exact prop and the three callers' data), § Pitfall 7 (the wiring gate) |
| SC-5 | 38-UAT item 1 (BLOCKED) + item 6 (G1) | The deals-kanban drag-with-selection check is verified or converted to an automated test that can drive it | § Pattern 8, § Code Example 5 — **verified live this session**: Playwright's `page.mouse.*` emits `isTrusted: true` `pointerdown`/`pointermove`/`pointerup` with `pointerType: "mouse"` |
</phase_requirements>

---

## Summary

This phase has almost no unknown technology in it. Every library it needs is already installed at a
pinned version (`next-themes@0.4.6`, `radix-ui@1.4.3`, `next-intl@4.8.3`, `@dnd-kit/core@6.3.1`), and
`45-UI-SPEC.md` already fixes every dimension, every message key and every className. What is
genuinely unknown — and what this research spent its effort on — is **whether the mechanisms the spec
depends on actually behave as claimed in this exact tree**, and **whether a Playwright harness can be
added to this repo without becoming a CI gate or a false-negative machine**. Both questions now have
verified answers.

The three highest-value findings are mechanical and each one changes what the plan must contain.
**First:** Playwright's headless Chromium hides scrollbars by default, which reports
`clientWidth === 320` at a 320px viewport instead of the `305` recorded in the UAT baseline — making
the harness 15px *more permissive than reality*. Launching with
`ignoreDefaultArgs: ["--hide-scrollbars"]` restores `clientWidth === 305` exactly; this was measured
live in this session against Playwright 1.60.0. Without that one option the regression check would
green-light layouts that still overflow on a real phone. **Second:** `page.mouse.move/down/up`
dispatch *trusted* pointer events (`isTrusted: true`, `pointerType: "mouse"`) — measured directly —
so the raw mouse API satisfies dnd-kit's `PointerSensor` activation constraint (`distance: 5`,
listeners attached to the owner `document`, activator requiring `isPrimary && button === 0`) and
does so without violating the 38-UAT rule that refuses synthetic dispatch as evidence. The prior
`browser_drag` timeout was a `locator.dragTo()` actionability problem, not a pointer-event problem.
**Third:** `CommandDialog` in `src/components/ui/command.tsx` renders its own `<Command>` with
cmdk's default `shouldFilter` of `true` and provides no way to pass it through — and the app's
`CommandItem value` is a UUID, so client-side filtering against a typed name matches nothing. The
mobile search dialog will render an empty results list unless `command.tsx` is edited. The UI-SPEC
lists that file as "unchanged, newly used"; that is not achievable as written.

Everything else checked out. `MenuPortal` really does gate on `forceMount || context.open` and
shadcn's `DropdownMenuContent` really does pass no `forceMount` to the Portal, so a closed menu
renders nothing and the `mounted` gate T-6 forbids is genuinely unnecessary —
`react-hooks/set-state-in-effect` really is severity `2` in this repo's resolved config. `next-themes`
ships `"use client"` in its dist bundle, so `ThemeProvider` imports straight into the async server
root layout. The shadcn `sheet` block really does import `{ Dialog as SheetPrimitive } from "radix-ui"`
and really does ship a hardcoded `sr-only "Close"`. `common.close` really exists in all three locales.
And a `playwright.config.ts` plus an `e2e/` directory pass `npm run lint` and `npm run typecheck`
unchanged while being structurally invisible to `npm test` (vitest's include glob is anchored at
`src/`), which is exactly what constraint V-3 requires.

**Primary recommendation:** sequence the theme provider first (it is the cheapest change and it
unblocks dark-mode verification for the whole project, per V-4), land the message-catalog and
locale-gate changes as one atomic unit (three contract lists in `locale-parity.test.ts` will fail
otherwise), edit `ui/command.tsx` to forward `shouldFilter` before touching `global-search.tsx`, and
build the Playwright harness as a separate, self-contained wave that ends the phase — with
`ignoreDefaultArgs: ["--hide-scrollbars"]` in the config and locale-dependent anti-vacuity anchors
read from the message JSON.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Theme class on `<html>` before paint | Browser (inline script) | Frontend Server (renders the `<script>` tag) | next-themes' `ThemeScript` is a server-rendered `<script dangerouslySetInnerHTML>` that runs synchronously in the browser. There is no server round-trip and no cookie — verified from `next-themes/dist/index.mjs` |
| Theme persistence | Browser (`localStorage`, key `theme`) | — | T-8, locked. No DB column, no cookie, no server involvement |
| Theme selection UI | Browser (client component) | — | `useTheme()` is a client hook; `UserMenu` is already `"use client"` |
| Responsive collapse (header + admin) | Browser (CSS media queries) | — | `md:hidden` / `hidden md:flex` are pure CSS. **No JS breakpoint state**, which is what keeps this hydration-safe |
| `/` hotkey target selection | Browser, **at event time** | — | Reading `window.matchMedia` inside the hotkey handler avoids React state entirely — see § Pitfall 2 |
| Locale resolution | Frontend Server (`src/i18n/request.ts`) | Browser (`locale` cookie is the input) | `getRequestConfig` reads `cookies().get('locale')`; the browser only writes the cookie |
| Message rendering | Frontend Server (RSC) **and** Browser (client components) | — | Both `getTranslations` and `useTranslations` are in use; `ui/dialog.tsx` is `"use client"` so it uses the hook |
| Audit field label decision | Frontend Server / pure lib (`src/lib/audit/present.ts`) | Browser (`audit-entry.tsx` resolves the key to text) | `present.ts` is I/O-free by design and emits *message keys*; the client resolves them. The `deletedAt` direction branch must live where the from/to pair is known |
| Bulk selection prune | Browser (the four caller components) | — | `loadedIds` / `renderedIds` are derived from the `data` prop in the client. The report component is told a number; it never recomputes |
| Layout measurement (SC-1) | Test tier (Playwright / real Chromium) | — | jsdom computes no layout — `scrollWidth === clientWidth === 0` there, making the assertion vacuous. Confirmed: this repo has **no** DOM test environment at all |
| Drag activation (SC-5) | Test tier (Playwright raw mouse API) | Browser (dnd-kit `PointerSensor` on `document`) | Activation is a browser-level pointer-event sequence; only a real browser can emit trusted ones |

---

## Standard Stack

### Core — already installed, versions verified against `node_modules`

| Library | Installed version | Purpose | Why standard |
|---------|-------------------|---------|--------------|
| `next` | **16.1.6** | App Router, RSC, standalone output | pinned exactly (no `^`) in package.json `[VERIFIED: node_modules/next/package.json]` |
| `react` / `react-dom` | **19.2.3** | — | pinned exactly `[VERIFIED: node_modules]` |
| `next-themes` | **0.4.6** | Theme provider, `useTheme`, pre-hydration script | already a dependency; `sonner.tsx` already consumes it `[VERIFIED: node_modules/next-themes/package.json]` |
| `radix-ui` | **1.4.3** | Unified primitives package (`Dialog`, `DropdownMenu`, …) | repo convention is the unified package, **not** `@radix-ui/react-*` `[VERIFIED: node_modules/radix-ui/package.json]` |
| `next-intl` | ^4.8.3 | i18n; `getRequestConfig` reads the `locale` cookie | `[VERIFIED: package.json + src/i18n/request.ts]` |
| `@dnd-kit/core` | **6.3.1** | `DndContext`, `PointerSensor`, `DragOverlay` | `[VERIFIED: node_modules/@dnd-kit/core/package.json]` |
| `@dnd-kit/sortable` | ^10.0.0 | `useSortable` on `deal-card.tsx` | `[VERIFIED: package.json + src/app/deals/deal-card.tsx:4]` |
| `lucide-react` | ^0.575.0 | `Sun`, `Moon`, `Monitor`, `Menu`, `Search` icons | all five exist in this version `[ASSUMED — icon names not individually verified]` |
| `shadcn` (CLI) | **3.8.5** (devDep) | Adds the `sheet` block | `./node_modules/.bin/shadcn view sheet` ran successfully this session `[VERIFIED]` |

> **`@dnd-kit/react` is NOT installed and is not what this repo uses.** The project-memory note
> claiming `@dnd-kit/react` throughout is wrong for the kanban. `node_modules/@dnd-kit/` contains
> exactly `accessibility/`, `core/`, `sortable/`, `utilities/`. The kanban uses the classic
> `@dnd-kit/core` `DndContext` + `useSensors` API. `[VERIFIED: ls node_modules/@dnd-kit]`

### Supporting — the one genuinely new dependency

| Library | Version to install | Purpose | When to use |
|---------|--------------------|---------|-------------|
| `@playwright/test` | `^1.62.1` (latest at 2026-08-17) or `~1.60` to match the already-downloaded browsers | The e2e harness for V-1 and V-2 | Install as **devDependency**: `npm install -D @playwright/test` |

**Version note.** `@playwright/test@1.62.1` is `latest` on npm as of this session
`[VERIFIED: npm view @playwright/test version]`. The **globally installed** `playwright` is `1.60.0`
and `~/.cache/ms-playwright` (symlinked to `/mnt/data/cache/ms-playwright`) already contains
`chromium-1217`, `chromium-1223`, `chromium_headless_shell-1217/1223` and `ffmpeg-1011`
`[VERIFIED: ls]`. If the installed `@playwright/test` version wants a chromium revision not in that
cache, `./node_modules/.bin/playwright install chromium` downloads it (network is available — the
shadcn registry fetch succeeded this session). Pinning to `~1.60.0` avoids a download entirely; the
planner may prefer that for a faster first run.

### The shadcn `sheet` block — read from the registry this session

`./node_modules/.bin/shadcn view sheet` (run 2026-08-17) returns a registry item whose only
dependency is `radix-ui` (already installed) and whose source begins:

```
"use client"
import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"
```

`[VERIFIED: ./node_modules/.bin/shadcn view sheet, 2026-08-17]` — the import style **already matches
this repo's unified-`radix-ui` convention**. No hand-editing of imports is needed.

Three further facts read from that same source:

1. It ships `<span className="sr-only">Close</span>` verbatim inside `SheetContent`, behind
   `showCloseButton = true`. Rule S-4 requires this be routed through `common.close` **before first
   use**. `[VERIFIED]`
2. `SheetContent`'s `side="left"` classes are
   `"inset-y-0 left-0 h-full w-3/4 border-r … sm:max-w-sm"`. Passing `className="w-64"` overrides
   `w-3/4` via tailwind-merge (same `w-` group). `sm:max-w-sm` is a *different* group and survives,
   but is inert: `max-width: 384px` never reduces a `width: 256px` element. **The drawer is 256px at
   every viewport**, which is what the UI-SPEC claims. `[VERIFIED by reading the block source]`
3. `SheetHeader` is `"flex flex-col gap-1.5 p-4"` with no border — the UI-SPEC's `p-4 border-b`
   header comes from the caller's `className`. `[VERIFIED]`

**Installation:**

```bash
# The one new dependency
npm install -D @playwright/test

# Browsers: already cached at ~/.cache/ms-playwright (chromium-1217, chromium-1223).
# Run only if the installed @playwright/test wants a revision that is not there:
./node_modules/.bin/playwright install chromium

# The sheet component (shadcn CLI is a local devDependency — no npx needed)
./node_modules/.bin/shadcn add sheet
```

> **On `npx`.** The UI-SPEC claims "`npx` resolves to `npm run` in this environment and will fail
> with 'Missing script'". That is **not what was observed**: `which npx` →
> `/home/pedro/.nvm/versions/node/v24.13.1/bin/npx`, `npx --version` → `11.10.0`, and
> `npx tsc --version` → `Version 5.9.3` `[VERIFIED]`. Regardless, **prefer
> `./node_modules/.bin/<tool>`** in every plan task: it is unambiguous, it cannot resolve to a
> registry download, and it sidesteps the disagreement entirely.

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Playwright for SC-1 | jsdom + `@testing-library/react` | **Disqualified.** jsdom computes no layout; `scrollWidth`/`clientWidth` are both `0`, so the assertion passes on any markup. CONTEXT names this disqualifier explicitly, and this repo has **no** DOM test environment to extend (`vitest.config.ts` → `environment: 'node'`) `[VERIFIED]` |
| Playwright for SC-1 | Keep manual browser measurement | This is the exact debt the phase exists to pay off |
| `next-themes` | Hand-rolled `localStorage` + `useEffect` | Would trip `react-hooks/set-state-in-effect` (severity `2`) and reintroduce the flash next-themes' pre-hydration script prevents |
| `Sheet` drawer for admin | Icon-only rail (`w-16`) | Loses harder as locales grow — es-ES already measures worse than pt-BR (526 vs 508), which is the exact failure mode being fixed |
| `page.mouse.*` for the drag | `locator.dragTo()` / `page.dragAndDrop()` | `dragTo` runs actionability checks on the drop target; a `DragOverlay` (which `kanban-board.tsx:623` renders) covers the page during the drag and fails "receives pointer events", which is the likely cause of the observed `browser_drag` timeout `[ASSUMED — root cause inferred, not reproduced]` |

---

## Package Legitimacy Audit

Only one external package is added by this phase.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@playwright/test` | npm | created 2020-09-24 (≈5.9 yrs) | **37,489,737 / week** (2026-08-09→15) | `github.com/microsoft/playwright` | `[OK]` | **Approved** |

`[VERIFIED: npm view @playwright/test version time.created repository.url scripts; api.npmjs.org/downloads/point/last-week; slopcheck install @playwright/test → [OK]]`

- `npm view @playwright/test scripts` → `{}` — **no `postinstall` script**. Browser downloads are
  triggered explicitly by `playwright install`, never on `npm ci`. This matters for CI: adding the
  devDependency does **not** make CI download ~150MB of browsers. `[VERIFIED]`
- Already-installed packages this phase newly *uses* (`next-themes`, `radix-ui`, `@dnd-kit/core`) were
  not re-audited beyond `next-themes`, which slopcheck also rated `[OK]`.

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

> ⚠️ **Operational warning for the executor, discovered the hard way this session.**
> `slopcheck install <pkg>` does not merely *check* — it runs `npm install <pkg>` as a side effect,
> and it installs into `dependencies`, not `devDependencies`. Running it during research mutated
> `package.json` and `package-lock.json`; both were reverted with `git checkout --` and the tree is
> clean `[VERIFIED: git status --short → empty]`. **Do not use `slopcheck install` as a read-only
> check in a plan task.** Use `slopcheck scan` or plain `npm view`, and install with an explicit
> `npm install -D @playwright/test`.

---

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────┐
   browser request ──────▶│  middleware.ts (Edge, authConfig)        │
   (locale cookie,        │  gates ONLY /settings and /admin         │
    authjs session)       │  → /admin needs role === "admin"         │
                          └──────────────┬──────────────────────────┘
                                         │ (the other 5 routes are
                                         │  gated by page-level auth())
                                         ▼
                    ┌────────────────────────────────────────────────┐
                    │  src/app/layout.tsx  (async SERVER component)  │
                    │  auth() → user | getLocale/getMessages/getTZ   │
                    │  <html lang suppressHydrationWarning>          │
                    └──────────────┬─────────────────────────────────┘
                                   │
                                   ▼
                    ┌────────────────────────────────────────────────┐
                    │  NextIntlClientProvider (locale, messages, tz) │
                    └──────────────┬─────────────────────────────────┘
                                   │
                                   ▼
              ┌────────────────────────────────────────────────────────┐
              │  ★ ThemeProvider (next-themes) ← NEW, mount HERE        │
              │    emits <script> that sets html.class BEFORE paint     │
              │    reads/writes localStorage["theme"]                   │
              └──────────────┬─────────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────────────────┐
              │  HotkeysProvider (react-hotkeys-hook)        │
              └──────────────┬───────────────────────────────┘
                             │
        ┌────────────────────┼─────────────────────────────────┐
        ▼                    ▼                                 ▼
  ┌───────────────┐   ┌────────────┐                    ┌─────────────┐
  │  NavHeader    │   │  {children}│                    │ Toaster     │
  │  (client)     │   └─────┬──────┘                    │ useTheme()  │
  │               │         │                           │ ← fixed for │
  │ ┌───────────┐ │         │                           │   free (T-7)│
  │ │GlobalSearch│         │                            └─────────────┘
  │ │ md+: Input │         │
  │ │ <md: icon ─┼─▶ CommandDialog ─┐                 ┌────────────────────────┐
  │ │            │        │          │                │  app/admin/layout.tsx  │
  │ │ / hotkey ──┼── matchMedia AT   │                │  auth() + role gate    │
  │ │            │   EVENT TIME ─────┘                │  ┌──────────────────┐  │
  │ └───────────┘ │  (no React state)                 │  │ <aside> RAIL     │  │
  │               │         │                         │  │ hidden md:flex   │  │
  │ ┌───────────┐ │         ▼                         │  └──────────────────┘  │
  │ │ UserMenu  │ │   ┌──────────────────┐            │  ┌──────────────────┐  │
  │ │ ★ theme   │ │   │ shared results   │            │  │ min-w-0 flex-1   │  │
  │ │   radio×3 │ │   │ subcomponent     │            │  │ ┌──────────────┐ │  │
  │ │ ★ C-1 fix │ │   │ (CommandGroup ×3)│            │  │ │★ mobile bar  │ │  │
  │ └───────────┘ │   └────────┬─────────┘            │  │ │  md:hidden   │ │  │
  └───────────────┘            │                      │  │ │  ☰ → Sheet   │ │  │
                               │ same tree            │  │ └──────┬───────┘ │  │
                               ▼                      │  │        │         │  │
                     ┌──────────────────┐             │  │  <main p-6>      │  │
                     │ Popover (md+)    │             │  └──────────────────┘  │
                     └──────────────────┘             └───────────┬────────────┘
                                                                  │
                                            ONE item array + ONE renderer
                                            shared by rail and drawer

  ─────────────────── bulk failure data flow (SC-4) ───────────────────

  server action ──▶ BulkOutcome { succeeded[], failed[{id,reason}], labelById }
                          │
                          ▼
      caller (4 files) ── handleOutcome ──▶ rowSelection (failed ids re-asserted)
                          │
                          ├─▶ loadedIds  = new Set(data.map(r => r.id))     ← orgs/people
                          │   renderedIds = ids across OPEN stages only      ← kanban
                          │
                          └─▶ ★ stillSelected = failed.filter(f => loadedIds.has(f.id)).length
                                     │
                                     ▼
                          BulkFailureReport  ── 3 mutually exclusive branches ──▶
                            === failures.length  → failures.retryHint       (unchanged)
                            0 < n < length       → failures.retryHintPartial ({count})
                            === 0                → failures.prunedHint

  ─────────────────── verification tier (SC-1, SC-5) ───────────────────

   host: npm run test / typecheck / lint          ← vitest, environment: 'node', NO DOM
   host: ./node_modules/.bin/playwright test      ← real Chromium, baseURL localhost:3001
                                  │
                                  ▼
          Docker (compose): app:3001 → 3000  |  postgres:5433  |  mailhog:8025
          PRODUCTION standalone build — every source change needs `--build`
```

### Recommended Project Structure

```
e2e/                              # NEW — outside src/, so vitest cannot see it
├── auth.setup.ts                 # logs in once, writes storageState
├── .auth/                        # gitignored — holds a real session cookie
│   └── admin.json
├── viewport-320.spec.ts          # V-1: 6 routes × 3 locales = 18 assertions
└── deals-drag.spec.ts            # V-2: drag-with-selection + G1 Escape
playwright.config.ts              # NEW — repo root
```

`[VERIFIED empirically this session]` — a `playwright.config.ts` at the repo root plus an `e2e/`
directory containing a `.spec.ts` that imports `@playwright/test` passes both
`./node_modules/.bin/eslint e2e playwright.config.ts` (exit 0) and `./node_modules/.bin/tsc --noEmit`
(exit 0) with the repo's existing configs unchanged. The probe files were deleted afterwards; the
tree is clean.

---

### Pattern 1 — Mounting `ThemeProvider` in an async server root layout

**What:** `next-themes@0.4.6` ships `"use client"` as the first bytes of `dist/index.mjs`
`[VERIFIED: head -c 20 node_modules/next-themes/dist/index.mjs → `"use client";import*as t from"react"`]`.
It therefore imports **directly** into `src/app/layout.tsx` (an async server component) with no
`components/theme-provider.tsx` wrapper. shadcn's docs show a wrapper; it is optional here because
every prop this phase passes (`attribute`, `defaultTheme`, `enableSystem`,
`disableTransitionOnChange`) is a serializable string or boolean.

**When to use:** always, for this phase.

**Where exactly:** immediately **inside** `NextIntlClientProvider` and **outside** `HotkeysProvider`.

Rationale, from reading the minified provider: `ThemeProvider` renders
`[<ThemeScript/>, children]`. Neither `NextIntlClientProvider` nor `HotkeysProvider` emits DOM, so
putting `ThemeProvider` above `HotkeysProvider` makes the `<script>` the **first DOM node inside
`<body>`** — the earliest point at which `document.documentElement.classList` can be set. Nesting it
below `NavHeader` would let the header paint in the wrong theme first.

**Verified mechanics (all read from `node_modules/next-themes/dist/index.mjs`):**

| Mechanism | What the code does | Consequence |
|-----------|--------------------|-------------|
| `ThemeScript` | `React.createElement("script", { suppressHydrationWarning: true, dangerouslySetInnerHTML: { __html: "(<fn>)(...)" } })` | a synchronous inline script — no `next/script`, no `beforeInteractive` needed |
| the script body | `d = document.documentElement; … localStorage.getItem(i) \|\| s; d.classList.remove(...); d.classList.add(n)` | writes the class on `<html>` before hydration → **`suppressHydrationWarning` on `<html>` is mandatory** (T-2) |
| `enableColorScheme` (default `true`) | `P.style.colorScheme = D` | also mutates the `<html>` `style` attribute client-side — a *second* reason `<html>` needs `suppressHydrationWarning` |
| `useState(() => H(m, l))` where `H` returns `undefined` when `typeof window === "undefined"` | `theme` is **`undefined` during SSR** | `value={theme ?? "system"}` in the radio group is not decoration — it is required |
| `ThemeProvider` export | `e => useContext(x) ? <Fragment>{children}</Fragment> : <V {...e}/>` | nested providers are a no-op; mounting one cannot break `sonner.tsx` |
| `disableTransitionOnChange` | injects a `*{transition:none!important}` `<style>`, forces a reflow, removes it on a `setTimeout` | no extra config needed |
| storage key | default `"theme"` in `localStorage` | T-8 satisfied by the library; no override |

**Anti-pattern:** do **not** add `<head />` to the layout "because the docs show it". The docs'
snippet predates Next's automatic head management; adding it here changes nothing and risks
disturbing the existing `next/font` variable classes.

---

### Pattern 2 — A theme toggle with **no** `mounted` gate (T-6), verified twice over

**What:** three flat `DropdownMenuRadioItem`s inside `UserMenu`, with no `useState`/`useEffect`
hydration guard.

**Both halves of the UI-SPEC's justification were verified independently:**

1. **The lint rule really is an error.** `./node_modules/.bin/eslint --print-config
   src/components/user-menu.tsx` resolves `react-hooks/set-state-in-effect` to severity **`2`**
   `[VERIFIED]`. (The full resolved React Compiler rule set is also error-level:
   `purity`, `immutability`, `refs`, `gating`, `use-memo`, `set-state-in-render`,
   `preserve-manual-memoization`, `static-components`, `component-hook-factories`,
   `error-boundaries`, `globals`, `rules-of-hooks`, `config` — all `2`. Only `exhaustive-deps`,
   `incompatible-library` and `unsupported-syntax` are warnings.) So
   `useEffect(() => setMounted(true), [])` fails `npm run lint` and therefore CI.

2. **The gate is unnecessary.** `node_modules/@radix-ui/react-menu/dist/index.mjs` line 109 reads:

   ```js
   var MenuPortal = (props) => {
     const { __scopeMenu, forceMount, children, container } = props;
     const context = useMenuContext(PORTAL_NAME, __scopeMenu);
     return jsx(PortalProvider, { scope: __scopeMenu, forceMount,
       children: jsx(Presence, { present: forceMount || context.open, … }) });
   };
   ```

   `[VERIFIED: direct read]` and `src/components/ui/dropdown-menu.tsx:40` wraps `Content` in a bare
   `<DropdownMenuPrimitive.Portal>` with **no** `forceMount` prop `[VERIFIED]`. A closed menu
   therefore renders **nothing** — on the server, during hydration, and until the user clicks. The
   radio items first mount long after next-themes has read `localStorage`, so there is no mismatch
   to guard.

   Corollary the UI-SPEC already states and this research confirms: the `forceMount` on
   `user-menu.tsx:48` is passed to `DropdownMenuContent`, which forwards it to
   `DropdownMenuPrimitive.Content` — but `MenuContent` sits *inside* the Portal that already
   rendered nothing. It is **inert**. Leave it or remove it; either is correct.

**Anti-pattern:** the standard internet recipe
(`const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])`) is
**forbidden here**. The existing eslint-disable in `src/components/ui/relative-time.tsx` is a
documented deferral, not a precedent.

---

### Pattern 3 — Header collapse without a JS breakpoint

**What:** render *both* controls and let CSS choose. Never store the breakpoint in React state.

```
<div className="flex items-center gap-4">
  {user && <GlobalSearch />}   ← inside, it renders:
                                   <div className="relative hidden md:block"> …Input… </div>
                                   <Button className="md:hidden" size="icon-lg" variant="ghost">
  …UserMenu…
</div>
```

`size="icon-lg"` resolves to `size-10` (40px) — `src/components/ui/button.tsx:31` `[VERIFIED]`. The
repo's button also has `xs`, `icon-xs`, `icon-sm`, so the spec's 40px choice is real and available.

**The `min-w-0` rule is the mechanism, not a style preference.** A flex item defaults to
`min-width: auto`, which refuses to shrink below its content. That is what turns a 256px input into
416px of `scrollWidth`. Every flex child in both header clusters needs `min-w-0`.

**Why no `useMediaQuery` hook:** a hook returns `false` on the server and the real value after an
effect → either a hydration mismatch or a `setState`-in-effect lint error. CSS has neither problem.

---

### Pattern 4 — The `/` hotkey with two targets and zero state

**The problem:** below `md` the inline input is not in the DOM, so `inputRef.current?.focus()` is a
no-op; above `md` the dialog should not open. `global-search.tsx:47` currently does only the former.

**The solution — read the media query *at event time*, inside the handler:**

```tsx
useHotkeys("/", (e) => {
  e.preventDefault()
  if (window.matchMedia("(min-width: 768px)").matches) {
    inputRef.current?.focus()
  } else {
    setDialogOpen(true)
  }
}, { scopes: ["global"], useKey: true })
```

This never runs during render or in an effect, so it produces no hydration mismatch and trips no
React Compiler rule. `768px` must stay in sync with Tailwind's `md`; note it in a comment.
`[ASSUMED — pattern reasoning, not executed in this repo]`

---

### Pattern 5 — Sharing one results tree between the Popover and the Dialog

**⚠️ This pattern contains a blocker the UI-SPEC does not account for. Read § Pitfall 1 first.**

`src/components/ui/command.tsx:32-61` — `CommandDialog` renders its **own** `<Command>`:

```tsx
<Dialog {...props}>
  <DialogHeader className="sr-only"><DialogTitle>{title}</DialogTitle>…</DialogHeader>
  <DialogContent …><Command className="…">{children}</Command></DialogContent>
</Dialog>
```

Three structural consequences:

1. **You cannot nest the existing outer `<Command>` inside it.** `global-search.tsx` currently wraps
   the whole Popover in `<Command shouldFilter={false} loop>`. The dialog path must instead put
   `CommandInput` + `CommandList` + the groups directly as `CommandDialog`'s children. **Extract the
   `CommandGroup`/`CommandEmpty` tree into a shared subcomponent** (e.g. `SearchResults`) consumed by
   both the popover's `CommandList` and the dialog's — the UI-SPEC's "the same `CommandList` tree"
   requires this extraction to be literal, not conceptual.
2. **`shouldFilter` cannot be passed through.** See § Pitfall 1 — `command.tsx` must be edited.
3. **`DialogHeader` is a sibling of `DialogContent`, not a child.** The sr-only `title` and
   `description` therefore render into the page **whenever `CommandDialog` is mounted, open or not**.
   With the hardcoded defaults that means the literal strings "Command Palette" and "Search for a
   command to run…" would be present in the DOM of every page — which is precisely why rule S-7
   demands both props be passed. It also means a Playwright text anchor could accidentally match
   them; prefer role/heading-based anchors.

---

### Pattern 6 — The admin shell's two-column-becomes-one-column shape

```tsx
<div className="flex min-h-[calc(100vh-3.5rem)]">
  <aside className="hidden md:flex w-64 border-r bg-background">…rail…</aside>
  <div className="flex min-w-0 flex-1 flex-col">      {/* min-w-0 is load-bearing */}
    <AdminMobileBar className="md:hidden" />          {/* h-12 border-b px-4, outside main's p-6 */}
    <main className="flex-1 p-6 bg-muted/30">{children}</main>
  </div>
</div>
```

The current file is `<div className="flex …"><AdminSidebar /><main className="flex-1 p-6 …">`
`[VERIFIED: src/app/admin/layout.tsx]`. Without `min-w-0` on the new content column its
`min-width: auto` reproduces exactly the overflow this phase removes.

**One array, one renderer.** `admin-sidebar.tsx` currently holds `sidebarItems` (9 entries) plus two
inline literals — `"Admin Panel"` (the `<h2>`) and `"Back to App"` (the footer button) — for 11
strings total `[VERIFIED: full file read]`. Both the rail and the drawer must consume the same array
and the same item renderer; two copies is how the next locale leak gets in.

**`admin/layout.tsx` is a server component** doing `auth()` + role gate. The mobile bar and the Sheet
are client-only, so they belong in a new `"use client"` component (or in `admin-sidebar.tsx` itself,
which is already `"use client"`) that the server layout renders.

---

### Pattern 7 — The bulk-failure prune prop

**The four callers and the data each already has at render time** (all verified by direct read):

| Caller | The set to intersect against | Where it is defined |
|--------|------------------------------|---------------------|
| `src/app/organizations/data-table.tsx` | `loadedIds = new Set(data.map(r => r.id))` | line 155 |
| `src/app/people/data-table.tsx` | `loadedIds = new Set(data.map(r => r.id))` | line 185 |
| `src/app/activities/activities-client.tsx` | imports `BulkFailureReport` — the equivalent set must be located | `[grep confirms the import; the exact variable was not read]` |
| `src/app/deals/kanban-board.tsx` | `renderedIds` — ids across **open stages only** (won/lost render summary tiles, no cards) | lines 134-144 |

**The computation is `failures.filter(f => loadedIds.has(f.id)).length` and it belongs in the
caller.** It is correct to intersect against `loadedIds` alone rather than against `rowSelection`,
because `handleOutcome` **re-asserts every failed id into `rowSelection`** unconditionally
(`organizations/data-table.tsx:243-245`: `for (const failure of next.failed) remaining[failure.id] = true`)
`[VERIFIED]`. So `rowSelection[failedId]` is always `true`; the only thing that can remove a failed
row from the effective selection is it leaving `data`. `failed ∩ loadedIds` is therefore exactly the
"still selected" set.

**Prop shape:** a single `number` (`stillSelected`). Do **not** pass the row array — the component
must render a truth it is told, not recompute an intersection. This also keeps the report free of
any dependency on the caller's data shape, which is what lets one component serve four different
list surfaces.

**The three branches** (UI-SPEC, locked):

| Condition | Key | Note |
|-----------|-----|------|
| `stillSelected === failures.length` | `bulk.failures.retryHint` | text unchanged, verbatim, all three locales `[VERIFIED: en/pt/es values read]` |
| `0 < stillSelected < failures.length` | `bulk.failures.retryHintPartial` with `{count: stillSelected}` | new |
| `stillSelected === 0` | `bulk.failures.prunedHint` | new; "fix the problem and try again" must not appear in any form |

---

### Pattern 8 — Driving `@dnd-kit/core`'s `PointerSensor` from Playwright

**The sensor's actual requirements, read from `node_modules/@dnd-kit/core/dist/core.cjs.development.js`:**

| Requirement | Source | Consequence for the spec |
|-------------|--------|--------------------------|
| Activator fires on React `onPointerDown` and requires `event.isPrimary && event.button === 0` | `PointerSensor.activators` `[VERIFIED]` | `page.mouse.down()` (default left button, primary mouse pointer) satisfies both |
| `pointermove` / `pointerup` / `pointercancel` listeners are attached to the **owner `document`** | `class PointerSensor extends AbstractPointerSensor { … getOwnerDocument(event.target) }` `[VERIFIED]` | events dispatched anywhere on the page reach the sensor; no need to keep the cursor over the card |
| Drag starts only when `hasExceededDistance(delta, 5)` on a `pointermove` | `handleMove` + `activationConstraint: { distance: 5 }` at `kanban-board.tsx:313-318` `[VERIFIED both]` | at least one `pointermove` must land **> 5px** from the pointerdown coordinates |
| `windowListeners.add(Resize, handleCancel)` and `VisibilityChange → handleCancel` | `attach()` `[VERIFIED]` | **never resize the viewport mid-drag**; the drag will silently cancel |
| `documentListeners.add(Keydown, handleKeydown)`; `Esc → handleCancel` | `[VERIFIED]` | Escape cancels a drag — relevant when the same spec also exercises G1 |

**The pointer-event question, settled empirically.** A live Playwright 1.60.0 run against a local
page that logs every pointer/mouse event produced:

```
counts { pointermove: 16, mousemove: 16, pointerdown: 1, mousedown: 1, pointerup: 1, mouseup: 1 }
first5  [{"t":"pointermove","x":50,"y":50,"trusted":true,"ptype":"mouse"},
         {"t":"mousemove", "x":50,"y":50,"trusted":true},
         {"t":"pointerdown","x":50,"y":50,"trusted":true,"ptype":"mouse"},
         {"t":"mousedown", "x":50,"y":50,"trusted":true},
         {"t":"pointermove","x":52,"y":52,"trusted":true,"ptype":"mouse"}]
allTrusted true      pointerTypes ['mouse']
```

`[VERIFIED: live run this session]`. Three things this settles:

1. `page.mouse.*` **does** emit `pointerdown` / `pointermove` / `pointerup`, ahead of each mouse
   event — Playwright's own docs only mention `mousemove`, so this needed measuring.
2. Every event is `isTrusted: true`. **This is not "synthetic dispatch"** in the sense 38-UAT
   refused. That rule was about `element.dispatchEvent(new PointerEvent(...))`, which produces
   `isTrusted: false` and bypasses the browser's input pipeline. Playwright drives CDP `Input.*`,
   which is the same pipeline a real mouse uses. The evidence rule is satisfied.
3. `{ steps: 5 }` produced 5 interpolated pointermove/mousemove pairs (16 total = 1 + 5 + 10),
   confirming `steps` is what generates the intermediate moves dnd-kit needs.

**Use the raw `page.mouse` API, not `locator.dragTo()`.** `dragTo` performs actionability checks on
the drop target (visible, stable, receives pointer events). `kanban-board.tsx:623` renders a
`<DragOverlay>` during the drag; an overlay covering the drop point fails "receives pointer events"
and `dragTo` hangs. Raw `page.mouse.*` performs no actionability checks at all.

---

### Anti-Patterns to Avoid

- **Storing the breakpoint in React state.** Any `useMediaQuery` / `useState(window.innerWidth)`
  approach either mismatches on hydration or trips `set-state-in-effect` (severity 2). Use CSS
  classes for rendering and `window.matchMedia` at event time for behaviour.
- **Adding a `mounted` gate to the theme toggle.** Forbidden by T-6 and by the lint config; also
  unnecessary — verified above.
- **Passing the row array to `BulkFailureReport`.** It must receive a number.
- **Using `locator.dragTo()` for the kanban.** See Pattern 8.
- **Letting the Playwright spec into `src/`.** vitest's include glob is `src/**/*.{test,spec}.…`;
  a spec under `src/` would be executed by `npm test` in a `node` environment with no browser and
  would fail CI. `e2e/` at the repo root is invisible to it.
- **Hardcoding `305` (or `320`) as a magic number in the assertion.** Assert
  `scrollWidth <= clientWidth` and *report* both numbers in the failure message.
- **Re-selecting pruned ids** to make `retryHint` true. Explicitly locked against.
- **Adding a message key to a locale JSON without adding it to its contract list.** See § Pitfall 4.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Theme persistence + pre-paint class | `localStorage` read in an effect | `next-themes` `ThemeProvider` | The pre-hydration inline script is the entire value; an effect-based version flashes, and `setState`-in-effect is a lint **error** here |
| System-preference tracking | `matchMedia` listener in a component | `enableSystem` + `resolvedTheme` | next-themes already registers the listener, handles `storage` events across tabs, and exposes `systemTheme` |
| Mobile drawer | Custom `position:fixed` panel + backdrop + focus trap | shadcn `Sheet` (Radix `Dialog`) | Focus trap, scroll lock, `Esc`, overlay click, `aria-modal`, and focus return to the trigger are all free and all easy to get wrong |
| Modal search surface | Hand-rolled overlay around the search input | `CommandDialog` (+ the `shouldFilter` fix) | Same as above, plus cmdk's keyboard navigation |
| Pluralised "N of M still selected" | `count === 1 ? "…" : "…"` in TSX | ICU `{count, plural, one{…} other{…}}` in the locale JSON | pt-BR/es-ES pluralisation is not English's; the repo already has 20+ ICU plural messages `[VERIFIED]` |
| Field-label direction logic | A second `AUDIT_FIELD_LABELS` entry for `deletedAt` | A direction branch where the from/to pair is known | `AUDIT_FIELD_LABELS` maps **one** column → **one** key; "Moved to Trash" vs "Restored from Trash" is two keys for one column. Adding `deletedAt` to that map also silently changes native field **display order** (`NATIVE_ORDER` is derived from its insertion order — `present.ts:82`) `[VERIFIED]` |
| Layout measurement in tests | jsdom + a fake `getBoundingClientRect` | Playwright + real Chromium | jsdom returns `0` for every layout metric — the assertion would be vacuous |
| Trusted input for a drag | `dispatchEvent(new PointerEvent(...))` | Playwright `page.mouse.*` | `isTrusted: false` vs `true`; 38-UAT G1 proved synthetic dispatch hides a real defect on this exact component |
| Auth for the e2e specs | Logging in inside every test | A Playwright `setup` project + `storageState` | One login, reused by every spec and every locale project |

**Key insight:** every "hand-rolled" option in this phase fails for the same structural reason —
it needs to know something before React hydrates (the theme, the viewport, the real layout, whether
an event was trusted). Libraries that solve those problems do so *outside* React's render cycle, and
this repo's React Compiler lint rules make the inside-React workaround an outright error.

---

## Common Pitfalls

### Pitfall 1 — `CommandDialog` filters client-side, and the results' `value` is a UUID

**What goes wrong:** the mobile search dialog shows "No results found" for every query, even though
the network request returned matches.

**Why it happens:** `CommandDialog`'s props type is
`React.ComponentProps<typeof Dialog> & { title?; description?; className?; showCloseButton? }`
`[VERIFIED: src/components/ui/command.tsx:32-43]`. Extra props therefore spread onto `Dialog`, not
onto the inner `<Command>` — **there is no way to pass `shouldFilter={false}` through**. cmdk
defaults `shouldFilter` to `true`, and it filters against each item's `value`. In `global-search.tsx`
every item is `<CommandItem value={org.id}>` — a UUID `[VERIFIED: lines 148, 165, 182]`. A user
typing "Acme" matches no UUID, so cmdk hides everything and renders `CommandEmpty`. The existing
popover path avoids this only because its outer `<Command>` sets `shouldFilter={false}`
(`global-search.tsx:113`).

**How to avoid:** edit `src/components/ui/command.tsx` to forward the cmdk props the dialog needs —
minimally `shouldFilter`, ideally `loop` too — from `CommandDialog` to its inner `<Command>`. This
contradicts the UI-SPEC's Component Inventory, which lists `ui/command.tsx` as "unchanged, newly
used". **The inventory row must change to "changed".** The alternative — building the dialog from
`Dialog` + `DialogContent` + the existing `<Command shouldFilter={false}>` by hand — reimplements
`CommandDialog` and loses rule S-7's title/description plumbing.

**Warning signs:** the dialog opens, the spinner runs, the network tab shows a 200 with results, and
the list is empty.

---

### Pitfall 2 — The `/` hotkey focusing a node that is not rendered

**What goes wrong:** below `md` the inline `<Input>` is not in the DOM, so `inputRef.current` is
`null` and `/` does nothing. Silent — no error, no console warning.

**How to avoid:** Pattern 4. Branch inside the handler on `window.matchMedia("(min-width: 768px)")`.

**Warning signs:** `/` works on desktop, is inert on mobile, and no test catches it because no test
has a layout.

---

### Pitfall 3 — Hydration mismatch on `<html>` from *two* sources

**What goes wrong:** React logs a hydration warning and, in dev, may discard the server HTML.

**Why it happens:** next-themes' inline script writes **both** `class` (from `attribute="class"`)
**and** `style="color-scheme: …"` (from `enableColorScheme`, default `true`) onto
`document.documentElement` before hydration `[VERIFIED from the dist source]`. The server rendered
neither.

**How to avoid:** `<html lang={locale} suppressHydrationWarning>`. It applies one level deep only, so
it suppresses exactly these two attributes and nothing else. This is T-2 and it is mandatory, not
advisory.

**Warning signs:** a `Warning: Prop 'className' did not match` or `'style' did not match` naming
`<html>`.

---

### Pitfall 4 — The locale-parity gate is an **exact-set contract**, not a presence check

This is the single most likely way this phase turns CI red, and it is fully mechanical.

`src/messages/locale-parity.test.ts` runs five assertions. Two of them are exact-set equalities that
fail when a namespace *grows* without its contract list growing too `[VERIFIED: full file read]`:

```
expect(auditKeys[locale]).toEqual([...REQUIRED_AUDIT_KEYS].sort())   // line ~576
expect(bulkKeys[locale]).toEqual([...REQUIRED_BULK_KEYS].sort())     // line ~572
```

Concrete consequences for this phase:

| New key | Namespace | Contract list that MUST be updated in the same commit |
|---------|-----------|---------------------------------------------------------|
| `bulk.failures.retryHintPartial` | `bulk` | **`REQUIRED_BULK_KEYS`** (line 302) — otherwise the exact-set assertion fails |
| `bulk.failures.prunedHint` | `bulk` | **`REQUIRED_BULK_KEYS`** |
| `audit.field.movedToTrash` | `audit` | **`REQUIRED_AUDIT_KEYS`** (line 73) — otherwise the exact-set assertion fails |
| `audit.field.restoredFromTrash` | `audit` | **`REQUIRED_AUDIT_KEYS`** |
| the 12 `admin.nav.*` keys | `admin` | **no contract list exists for `admin`** — no exact-set gate applies |
| the 4 `theme.*` keys | `theme` (new top level) | no contract list — none applies |
| `nav.workflows`, `nav.searchDescription` | `nav` | no contract list — none applies |

A **third** assertion applies to *every* key regardless of namespace:

```
it("all three locales have identical whole-file key sets", …)
```

All three files currently carry **770 leaves each** `[VERIFIED: counted]`. All 23 new keys must land
in all three files or this fails.

**On `IDENTICAL_TRANSLATION_ALLOWED` (rule L-1).** `untranslatedInBoth()` only iterates the four
`REQUIRED_*` lists (line 499: `if (IDENTICAL_TRANSLATION_ALLOWED.includes(key)) return false`)
`[VERIFIED]`. Since **no contract list covers `admin.nav.*` or `nav.*`**, the three
legitimately-identical product nouns (`admin.nav.pipelines`, `admin.nav.webhooks`, `nav.workflows`)
are **not** currently reachable by that gate — so `IDENTICAL_TRANSLATION_ALLOWED` needs no entries
*unless* the plan chooses to add a `REQUIRED_SHELL_KEYS` list. If it does (recommended for
consistency with how every prior phase gated its copy), those three keys must go into
`IDENTICAL_TRANSLATION_ALLOWED` (currently `[]`, line 381) **in the same change**, or the gate fails
on correct copy. The existing precedent is real: `nav.pipelines` is already "Pipelines" in all three
locales `[VERIFIED]`.

---

### Pitfall 5 — `placeholderDrift()` does **not** protect the ICU plural wrapper (UI-SPEC L-2 is wrong)

**What goes wrong:** a translator drops the `{count, plural, …}` wrapper from
`bulk.failures.retryHintPartial` in one locale; the gate stays green; the Spanish UI renders a
sentence with no number in it.

**Why it happens:** `placeholders()` is
`[...new Set(message.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])].sort()` `[VERIFIED: line ~415]`. That regex
requires the brace contents to be a bare identifier. `{count, plural, one {# …} other {# …}}` contains
a comma and spaces and does **not** match; `{# …}` does not match either (`#` is outside the class).
So `expected.length === 0` and `placeholderDrift` **`continue`s** without checking anything. The same
is already true of every existing plural message (`bulk.deleteDialog.title`, `audit.value.files`, …)
— only their non-plural siblings like `{days}` and `{stage}` are actually gated.

**How to avoid:** do not rely on L-2. If the plan wants the plural wrapper defended, it must add an
explicit assertion (e.g. every locale's value for the key contains `plural,`). Otherwise, state
plainly that this key's ICU structure is protected by review, not by the gate.

**Warning signs:** none. That is the point.

---

### Pitfall 6 — `AUDIT_FIELD_LABELS` cannot express a direction, and adding to it reorders the timeline

**What goes wrong:** adding `deletedAt: "audit.field.deletedAt"` to `AUDIT_FIELD_LABELS` gives one
label for two opposite events, and simultaneously changes the display order of native fields.

**Why it happens:** `const NATIVE_ORDER = new Map(Object.keys(AUDIT_FIELD_LABELS).map((c, i) => [c, i]))`
— *"INSERTION ORDER IS LOAD-BEARING: it is the display order of native columns"*
`[VERIFIED: src/lib/audit/present.ts:58-83]`. And `describeField` emits a single `label` per column
(`present.ts:326`), with no access to the from/to pair.

**How to avoid:** decide the copy key where the direction is known — i.e. in
`src/components/timeline/audit-entry.tsx`, from the `AuditValue` pair — and keep `present.ts`'s job
limited to (a) classifying `deletedAt` as a `date` column so any surviving render formats in the
viewer's locale (`DATE_COLUMNS`, `present.ts:86`), and (b) whatever ordering rank is wanted. If
`deletedAt` **is** added to `AUDIT_FIELD_LABELS`, append it at the **end** so no existing field's
rank shifts, and add `audit.field.deletedAt` to `REQUIRED_AUDIT_KEYS` (Pitfall 4).

**Also note:** the fallback that currently produces `"Deleted at"` is `humaniseColumn`
(`present.ts:284`), whose own doc comment reads *"THIS PATH SHOULD BE UNREACHABLE"* — the comment is
wrong and rewriting it is part of rule S-6.

---

### Pitfall 7 — The bulk wiring gate is comment-blind and iterates a checked-in vocabulary

`src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` reads
`bulk-failure-report.tsx` through `readStrippedSource` (comments removed, string-aware) and then
asserts `[VERIFIED: full file read]`:

- `FAILURE_KEYS = ["failures.deleteTitle", "failures.reassignTitle", "failures.retryHint", "failures.dismiss"]`
  — **each must appear in the source**. Adding branches does not break this, but the two new keys
  will be **unasserted** unless added to the list. Add them.
- `RECOGNISED` (must be present) includes `'useTranslations("bulk")'`, `"failures.length === 0"`,
  `"max-h-48"`, `"overflow-y-auto"`, `"font-semibold"`, `"reason.${"`, `"text-muted-foreground"`,
  `"onDismiss"`, `'variant="destructive"'`, `"AlertTitle"`, `"AlertDescription"`.
- `LEFT_ALONE` (must be absent) includes **`".slice("`**, `"setTimeout"`, `"setInterval"`,
  `"aria-live"`, `"bg-destructive"`, and both dispatch module paths. The new branching must not
  introduce any of these.

The file's own header states the rule for collisions: *"THE CORRECT RESPONSE TO A COLLISION IS TO
REWORD THE COMMENT, NEVER TO WEAKEN THE GATE."* The `bulk-failure-report.tsx` header comment block
must be **updated** to describe the three branches — not deleted, and not left contradicting the code.

---

### Pitfall 8 — Playwright headless hides scrollbars, making the SC-1 assertion 15px too lenient

**This is the highest-consequence finding in the Playwright half of this research.**

Measured live this session against a 416px-wide page at a 320×640 viewport:

| Launch mode | `scrollWidth` | `clientWidth` | `innerWidth` |
|-------------|---------------|---------------|--------------|
| default headless | 416 | **320** | 320 |
| `ignoreDefaultArgs: ["--hide-scrollbars"]` | 416 | **305** | 320 |
| `headless: false` | 416 | **305** | 320 |
| `isMobile: true, hasTouch: true` | 980 | 980 | 980 |

`[VERIFIED: live Playwright 1.60.0 runs this session]`

**What goes wrong:** default headless Chromium reports `clientWidth === 320`, so a layout that
overflows by up to 15px passes the harness but still shows a horizontal scrollbar on a real 320px
device. The recorded UAT baseline (`clientWidth 305`) came from a headed browser with classic
scrollbars.

**How to avoid:**

```ts
// playwright.config.ts
use: {
  launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
}
```

This restores `clientWidth === 305` exactly, reproducing the baseline. `launchOptions.ignoreDefaultArgs`
is a valid field — a config using it typechecks clean `[VERIFIED: tsc --noEmit exit 0]`.

**Do not use `isMobile: true`.** It activates mobile viewport emulation; on the test page (no viewport
meta) it reported 980px. Next injects a `width=device-width` viewport meta so the real app would
behave differently, but the emulation adds a variable this phase does not need. Plain
`viewport: { width: 320, height: 640 }` plus the scrollbar flag is the closest match to the recorded
evidence.

---

### Pitfall 9 — A 320px spec that passes on a blank page or on the wrong locale

**Two independent vacuity modes**, and the UI-SPEC names only the first:

1. **The page never loaded.** A blank 200, a redirect to `/login`, or an error page all have
   `scrollWidth === clientWidth` and pass silently.
2. **The `locale` cookie did not apply.** If it is set on the wrong domain/path, or the app falls
   back to `defaultLocale` (`en-US` — `src/i18n/config.ts` `[VERIFIED]`), then all three "locale"
   runs measure en-US and the es-ES-worse-than-pt-BR asymmetry the phase exists to catch is never
   exercised.

**How to avoid both with one assertion:** anchor on a **locale-dependent** heading read from the
message JSON. All six anchors were verified to exist and to differ by locale:

| Route | Anchor key | en-US | pt-BR | es-ES |
|-------|-----------|-------|-------|-------|
| `/organizations` | `organizations.title` | Organizations | Empresas | Empresas |
| `/people` | `people.title` | People | Pessoas | Personas |
| `/deals` | `deals.title` | Deals | Negócios | Ofertas |
| `/activities` | `activities.title` | Activities | Atividades | Actividades |
| `/trash` | `trash.title` | Trash | Lixeira | Papelera |
| `/admin/audit` | `audit.retention.title` | Audit Log | Registro de auditoria | Registro de auditoría |

`[VERIFIED: read from all three message files]`. Each is rendered as
`<h1 className="text-3xl font-bold">{t('title')}</h1>` (`organizations/page.tsx:138`,
`people/page.tsx:138`, `deals/page.tsx:66`, `activities-client.tsx:238`, `trash/page.tsx:102`,
`admin/audit/page.tsx:62`) `[VERIFIED]` — so
`await expect(page.getByRole("heading", { level: 1, name: expected })).toBeVisible()` before
measuring closes both holes at once.

> Note: `/admin/audit` is the **retention settings** page (`audit.retention.*`), not an audit-entry
> list. Do not anchor on `audit.filter.label` or an entry row.

---

### Pitfall 10 — The Docker app is a production build; source edits are invisible until rebuild

`Dockerfile` stage 2 runs `npm run build`; stage 3 runs `node server.js` against
`.next/standalone` with `NODE_ENV=production` `[VERIFIED]`. There is no bind mount and no watcher —
`docker-compose.yml` has no `volumes:` on the `app` service `[VERIFIED]`. So **every** source change
requires:

```bash
docker compose up -d --build     # no sudo — the user is in the docker group
```

before Playwright can observe it. The image is 1.72GB `[VERIFIED: docker images]`. Plans that pair a
code task with a Playwright verification in the same task will spend a full rebuild per iteration —
**batch the UI changes, then rebuild once, then run the specs.**

Two related build hazards:

- `next.config.ts` sets no `typescript.ignoreBuildErrors` `[VERIFIED]`, so `next build` typechecks.
- `.dockerignore` does **not** exclude `e2e/` or `playwright.config.ts` `[VERIFIED]`, so `COPY . .`
  would ship them into the build context and `next build` would typecheck them (they would resolve,
  since `npm install --legacy-peer-deps` in the deps stage installs devDependencies). It works, but
  it is pointless surface. **Add `e2e/`, `playwright.config.ts`, `playwright-report/` and
  `test-results/` to `.dockerignore`.**

---

### Pitfall 11 — Committing a real session cookie

`storageState` JSON contains a live Auth.js session token for an admin account. `.gitignore`
currently has no entry for it `[VERIFIED: full file read]`. Add before the first run:

```
/e2e/.auth/
/playwright-report/
/test-results/
```

---

### Pitfall 12 — `slopcheck install` mutates `package.json`

See the warning in § Package Legitimacy Audit. It ran `npm install` and added `@playwright/test` to
**`dependencies`**. Reverted this session; do not repeat it in a plan task.

---

## Code Examples

### Example 1 — Root layout with the theme provider (T-1, T-2, T-3)

```tsx
// src/app/layout.tsx — only the changed parts shown
import { ThemeProvider } from "next-themes"   // ships "use client" — no wrapper file needed
                                              // [VERIFIED: node_modules/next-themes/dist/index.mjs:1]

return (
  <html lang={locale} suppressHydrationWarning>          {/* T-2, mandatory */}
    <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* ThemeProvider renders [<ThemeScript/>, children]; sitting above HotkeysProvider
              makes that <script> the first DOM node in <body>. */}
          <HotkeysProvider>
            <NavHeader user={user} />
            <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
            <ShortcutsHint />
            <Toaster />        {/* useTheme() now resolves for real — T-7, no edit to sonner.tsx */}
          </HotkeysProvider>
        </ThemeProvider>
      </NextIntlClientProvider>
    </body>
  </html>
)
```

Source: `next-themes@0.4.6` dist read + https://github.com/pacocoursey/next-themes +
https://ui.shadcn.com/docs/dark-mode/next

---

### Example 2 — The theme radio group in `UserMenu` (T-4, T-5, T-6, C-1)

```tsx
"use client"
import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"
import {
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

const { theme, setTheme } = useTheme()
const tTheme = useTranslations("theme")

// …inside DropdownMenuContent, ABOVE the existing final separator:
<DropdownMenuSeparator />
<DropdownMenuLabel className="font-normal">{tTheme("label")}</DropdownMenuLabel>
{/* `theme` is undefined during SSR (next-themes' useState initializer returns undefined
    when typeof window === "undefined") — `?? "system"` is required, not decorative. */}
<DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
  <DropdownMenuRadioItem value="light">
    <Sun className="mr-2 h-4 w-4" />{tTheme("light")}
  </DropdownMenuRadioItem>
  <DropdownMenuRadioItem value="dark">
    <Moon className="mr-2 h-4 w-4" />{tTheme("dark")}
  </DropdownMenuRadioItem>
  <DropdownMenuRadioItem value="system">
    <Monitor className="mr-2 h-4 w-4" />{tTheme("system")}
  </DropdownMenuRadioItem>
</DropdownMenuRadioGroup>

// C-1, same file, line 87:
//   className="text-red-600 focus:text-red-600"  →  "text-destructive focus:text-destructive"
```

No `mounted` state. See Pattern 2 for why that is safe here and why the usual recipe is forbidden.

---

### Example 3 — Defaulting the dialog close label from `common.close` (S-2)

```tsx
// src/components/ui/dialog.tsx — already "use client" [VERIFIED: line 1]
// No global-error.tsx / error.tsx / not-found.tsx exists in src/app [VERIFIED: find],
// and only src/app/layout.tsx renders <html> [VERIFIED], so NextIntlClientProvider is
// unconditionally above every DialogContent — useTranslations here cannot throw.

function DialogContent({ className, children, showCloseButton = true, closeLabel, ...props }) {
  const t = useTranslations("common")
  const label = closeLabel ?? t("close")     // "Close" / "Fechar" / "Cerrar" [VERIFIED all three]
  …
  <span className="sr-only">{label}</span>
}

// Site 2 — DialogFooter's visible button at line 114 is the same defect class (S-2):
//   <Button variant="outline">Close</Button>  →  <Button variant="outline">{label}</Button>
```

**S-3 is an assertion, not a change:** `src/components/ui/alert-dialog.tsx`'s `AlertDialogCancel`
renders only `children` and ships no hardcoded string `[VERIFIED: grep — no `sr-only`, no literal
"Close"]`. Do not add a default there.

**S-4 applies the same treatment to `ui/sheet.tsx` before its first use** — the registry block ships
`<span className="sr-only">Close</span>` verbatim (§ Standard Stack).

**Testing note:** the repo has **no DOM test environment**, so no existing test renders a Dialog and
none can break from this change. `src/app/admin/fields/[entityType]/__tests__/*.rsc.test.tsx` are the
only render-adjacent tests and they exercise the Flight serializer, not `ui/dialog.tsx` `[VERIFIED]`.

---

### Example 4 — The V-1 viewport spec

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,          // one app instance, shared DB
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    ...devices["Desktop Chrome"],
    // Playwright's headless Chromium passes --hide-scrollbars by default, which reports
    // clientWidth 320 at a 320px viewport instead of the 305 the UAT baseline recorded.
    // Removing it restores 305 and keeps the assertion as strict as a real device.
    // [measured: 320 default vs 305 with this flag vs 305 headed]
    launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
  },
  // Deliberately NO `webServer`: the app runs in Docker (docker compose up -d).
  // Never start a local dev server.
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/admin.json", viewport: { width: 320, height: 640 } },
    },
  ],
})
```

```ts
// e2e/viewport-320.spec.ts
import { expect, test } from "@playwright/test"
import en from "../src/messages/en-US.json"
import pt from "../src/messages/pt-BR.json"
import es from "../src/messages/es-ES.json"

const CATALOG = { "en-US": en, "pt-BR": pt, "es-ES": es } as const

const ROUTES = [
  { path: "/organizations", anchor: (m: any) => m.organizations.title },
  { path: "/people",        anchor: (m: any) => m.people.title },
  { path: "/deals",         anchor: (m: any) => m.deals.title },
  { path: "/activities",    anchor: (m: any) => m.activities.title },
  { path: "/trash",         anchor: (m: any) => m.trash.title },
  { path: "/admin/audit",   anchor: (m: any) => m.audit.retention.title },
]

for (const [locale, messages] of Object.entries(CATALOG)) {
  for (const route of ROUTES) {
    test(`${route.path} does not overflow at 320px in ${locale}`, async ({ page, context }) => {
      // src/i18n/request.ts reads exactly cookies().get('locale') [VERIFIED]
      await context.addCookies([
        { name: "locale", value: locale, url: "http://localhost:3001" },
      ])
      await page.goto(route.path)

      // ANTI-VACUITY: proves the page rendered AND that the locale cookie applied.
      // A blank 200 or a /login redirect has scrollWidth === clientWidth and would pass.
      await expect(
        page.getByRole("heading", { level: 1, name: route.anchor(messages) })
      ).toBeVisible()

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

      expect(
        scrollWidth,
        `${route.path} @${locale}: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`
      ).toBeLessThanOrEqual(clientWidth)
    })
  }
}
```

Note `resolveJsonModule: true` is already set in `tsconfig.json` `[VERIFIED]`, so importing the
message JSON typechecks.

---

### Example 5 — The V-2 drag, using raw pointer input

```ts
// e2e/deals-drag.spec.ts
async function dndDrag(page, source, target) {
  const s = (await source.boundingBox())!
  const t = (await target.boundingBox())!
  const sx = s.x + s.width / 2, sy = s.y + s.height / 2

  await page.mouse.move(sx, sy)
  await page.mouse.down()                                  // pointerdown, isPrimary, button 0
  await page.mouse.move(sx + 12, sy + 12, { steps: 4 })    // exceeds activationConstraint distance:5
  await page.mouse.move(t.x + t.width / 2, t.y + 60, { steps: 20 })
  await page.waitForTimeout(150)                           // let collision detection settle
  await page.mouse.up()
}
```

Constraints this respects, each read from `@dnd-kit/core@6.3.1` source:
`activationConstraint: { distance: 5 }` (`kanban-board.tsx:314-317`); listeners on the owner
`document`; `isPrimary && button === 0`; and **no viewport resize during the drag** (`Resize` is
wired to `handleCancel`).

The same spec covers G1: open the delete dialog with two cards checked, press `Escape` **once**,
assert the dialog closed **and** the bulk bar is still mounted with 2 selected. Use
`page.keyboard.press("Escape")` — Playwright key events are trusted, which is exactly the
discriminator 38-UAT identified (a synthetic `KeyboardEvent` preserved the selection and hid the bug).

---

## State of the Art

| Old approach | Current approach | When changed | Impact here |
|--------------|------------------|--------------|-------------|
| `@radix-ui/react-*` per-primitive packages | unified `radix-ui` package | shadcn CLI 3.x / radix-ui 1.x | The `sheet` block already emits the unified import — **no normalisation needed** `[VERIFIED from the registry]` |
| `theme-provider.tsx` wrapper with `"use client"` | direct `import { ThemeProvider } from "next-themes"` | next-themes 0.3+ ships `"use client"` in dist | One fewer file `[VERIFIED]` |
| `mounted` gate around theme UI | not needed when the UI lives inside a portal that does not render while closed | Radix `Presence`-gated portals | T-6; also mandatory here because the effect-based gate is a lint **error** |
| `useMediaQuery` hooks for responsive behaviour | CSS variants for rendering + `matchMedia` at event time for behaviour | React 19 / React Compiler lint rules | Avoids `set-state-in-effect` (severity 2) |
| shadcn button sizes `default/sm/lg/icon` | this repo's button also has `xs`, `icon-xs`, `icon-sm`, `icon-lg` | local extension | `size="icon-lg"` = `size-10` = 40px `[VERIFIED: button.tsx:31]` |

**Deprecated / outdated in the upstream docs, relative to this repo:**

- shadcn's dark-mode doc still shows a `components/theme-provider.tsx` wrapper — unnecessary here.
- shadcn's dark-mode doc shows a two-way `Sun`/`Moon` toggle — T-5 requires three-way.
- Playwright's `page.mouse` docs mention only `mousemove`/`mousedown`/`mouseup`; pointer events are
  emitted too, as measured in this session.

---

## Corrections to Upstream Documents

The planner should treat these as amendments to `45-UI-SPEC.md` / `45-CONTEXT.md`. None of them
touches a locked *decision*; all five are factual corrections to the *mechanics*.

| # | Document | Claim | Finding | Action for the planner |
|---|----------|-------|---------|------------------------|
| 1 | UI-SPEC § Component Inventory | `ui/command.tsx` — "unchanged, newly used" | **False.** `CommandDialog` cannot forward `shouldFilter` to its inner `<Command>`, and the app's `CommandItem value` is a UUID, so cmdk's default client-side filter hides every result once the user types. `[VERIFIED: command.tsx:32-61 + global-search.tsx:113,148,165,182]` | Change the row to **changed**; add a task to forward `shouldFilter` (and `loop`) from `CommandDialog` to `Command` |
| 2 | UI-SPEC § L-2 | "`placeholderDrift()` asserts placeholder-set parity, so the `{count, plural, …}` wrapper must survive translation intact" | **Over-claimed.** The regex `/\{[a-zA-Z0-9_]+\}/g` does not match ICU plural syntax; `expected.length === 0` and the check `continue`s. No existing plural message is gated either. `[VERIFIED: locale-parity.test.ts:415, ~500]` | Either add an explicit `plural,` assertion or state plainly that this key's ICU structure is review-gated, not test-gated |
| 3 | UI-SPEC § L-1 | the three identical nouns "**must** be added to `IDENTICAL_TRANSLATION_ALLOWED`" | **Conditional, correctly hedged in the spec but easy to misread.** `untranslatedInBoth()` only iterates the four `REQUIRED_*` lists; no list covers `admin.nav.*` or `nav.*` today. `[VERIFIED]` | Decide explicitly: add a `REQUIRED_SHELL_KEYS` list (then `IDENTICAL_TRANSLATION_ALLOWED` **must** gain the three keys) or do not (then it needs no entries). Do not leave it implicit |
| 4 | UI-SPEC § Component Inventory | "`npx` resolves to `npm run` in this environment and will fail with 'Missing script'" | **Not reproduced.** `npx --version` → 11.10.0; `npx tsc --version` → 5.9.3 `[VERIFIED]` | Harmless either way — use `./node_modules/.bin/<tool>` in every task |
| 5 | Research brief / project memory | "the kanban uses `@dnd-kit/react`" | **False.** `node_modules/@dnd-kit/` = `accessibility/ core/ sortable/ utilities/`. The kanban uses `@dnd-kit/core@6.3.1`'s `DndContext` + `useSensors`. `[VERIFIED]` | Sensor semantics in this document are the ones that apply |

---

## Runtime State Inventory

Included because two categories are genuinely non-obvious for this phase, even though it is not a
rename or a migration.

| Category | Items found | Action required |
|----------|-------------|------------------|
| Stored data | **None.** No schema change, no migration, no seed. The theme lives in `localStorage`, not the DB (T-8) | none |
| Live service config | **None** — verified: no external SaaS carries any string this phase changes | none |
| OS-registered state | **None** — verified: no cron, no systemd unit, no scheduled task references these files | none |
| Secrets / env vars | **None new.** The e2e harness needs an authenticated session; it must **not** hardcode a password. `.env` holds `AUTH_SECRET`, `DATABASE_URL`, `POSTGRES_*` and is gitignored `[VERIFIED: cut -d= -f1 .env]` | See § Open Question 1 |
| Build artifacts | **`pipelite-app:latest` (1.72GB) is a stale production build.** Every source change in this phase is invisible to the running app and therefore to Playwright until `docker compose up -d --build` `[VERIFIED: Dockerfile stages + no volume mount]` | Every plan whose verification is a browser assertion must include the rebuild step, and plans should batch UI edits to amortise it |
| Local `node_modules` drift | `@playwright/test` was installed into `node_modules` by `slopcheck install` during research; `package.json` / `package-lock.json` were reverted `[VERIFIED: git status clean]` | Harmless (gitignored). The plan should still run `npm install -D @playwright/test` explicitly so the lockfile records it |

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + compose | running the app for e2e | ✓ (no sudo needed) | `pipelite-app` up 44min; postgres + mailhog up 9 days | — |
| App at `http://localhost:3001` | every browser assertion | ✓ | Next 16.1.6 standalone, production | — |
| PostgreSQL at `localhost:5433` | seeding an e2e user, if chosen | ✓ | postgres:16-alpine, healthy | — |
| Node (host) | vitest / tsc / eslint / playwright | ✓ | v24.13.1, npm 11.10.0 | — |
| `@playwright/test` | the harness | ✗ **not a project dependency** | — | `npm install -D @playwright/test` |
| Chromium browser binaries | the harness | ✓ **already cached** | `chromium-1217`, `chromium-1223`, `chromium_headless_shell-1217/1223` in `/mnt/data/cache/ms-playwright` | `./node_modules/.bin/playwright install chromium` (network confirmed working) |
| `playwright` (global npm) | — | ✓ | 1.60.0 | not used by the harness; the project devDependency is authoritative |
| shadcn CLI | adding `sheet` | ✓ local devDependency | 3.8.5 — `shadcn view sheet` succeeded against the live registry | — |
| Network to registry.npmjs.org / ui.shadcn.com | install + `shadcn add` | ✓ | — | — |
| jsdom / happy-dom / testing-library | — | ✗ **absent by design** | — | **None.** `vitest.config.ts` → `environment: 'node'`. Component behaviour is gated by source-scan tests; rendered behaviour by Playwright |
| An admin account for the e2e session | `/admin/audit` (middleware requires `role === "admin"`) | ✓ a row exists (`prbitt@gmail.com`, role `admin`, approved, verified) — **password unknown to the harness** | — | See § Open Question 1 |

**Missing dependencies with no fallback:** none.
**Missing dependencies with a fallback:** `@playwright/test` (one `npm install -D`).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Unit framework | vitest **4.0.18**, two projects: `vitest.config.ts` (`environment: 'node'`) and `vitest.rsc.config.ts` (`react-server` condition) |
| Unit config files | `vitest.config.ts`, `vitest.rsc.config.ts` |
| Unit include glob | `src/**/*.{test,spec}.?(c\|m)[jt]s?(x)` — **anchored at `src/`** |
| Quick run | `./node_modules/.bin/vitest run <path>` |
| Full suite | `npm run test` (= `vitest run && vitest run --config vitest.rsc.config.ts`) |
| Gates | `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint`) |
| E2E framework | **none today** — `playwright.config.ts` and `e2e/` are created by this phase |
| E2E run | `./node_modules/.bin/playwright test` (against the Docker app; **no `webServer`**) |
| CI | `.github/workflows/ci.yml` → `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`. **No Docker, no DB, no app server.** Playwright must not enter this pipeline (V-3) |

**There is no DOM test environment in this repo.** Component decisions with no pure-function home are
pinned by *source-scan gates* that read the file through
`src/components/custom-fields/__tests__/source-scan.ts`'s comment-stripping `readStrippedSource`, then
assert on tokens. Follow that established pattern for anything this phase adds — do not introduce
jsdom.

### Phase Requirements → Test Map

| Req | Behaviour | Test type | Automated command | File exists? |
|-----|-----------|-----------|-------------------|-------------|
| SC-1 | no horizontal overflow, 6 routes × 3 locales @320px | e2e (layout) | `./node_modules/.bin/playwright test e2e/viewport-320.spec.ts` | ❌ Wave 0 |
| SC-2 | provider mounted with the four locked props; `<html suppressHydrationWarning>` | source gate | `./node_modules/.bin/vitest run src/app/__tests__/theme-wiring.test.ts` | ❌ Wave 0 |
| SC-2 | toggle present, three values, no `mounted` gate | source gate | same file or a `user-menu` sibling | ❌ Wave 0 |
| SC-2 | choice survives reload | e2e | extend `e2e/viewport-320.spec.ts` or a small `theme.spec.ts` — set theme, `page.reload()`, assert `html.class` | ❌ Wave 0 |
| SC-3 | all 23 keys present, non-blank, translated, in all three locales | unit | `./node_modules/.bin/vitest run src/messages/locale-parity.test.ts` | ✅ **exists — must be extended** (Pitfall 4) |
| SC-3 | no English literal remains in `admin-sidebar.tsx` / `nav-header.tsx` / `ui/dialog.tsx` / `ui/sheet.tsx` | source gate | new `*-wiring.test.ts` following the `bulk-failure-report-wiring` pattern | ❌ Wave 0 |
| SC-3 | `AlertDialogCancel` still ships no hardcoded label (S-3 is an assertion) | source gate | same file | ❌ Wave 0 |
| SC-4 | three branches, correct keys, prop is a number | source gate | `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` | ✅ **exists — extend `FAILURE_KEYS`** |
| SC-4 | each of the four callers passes the surviving count | source gate | new or extended caller wiring gate | ❌ Wave 0 |
| SC-5 | drag with an unrelated card checked leaves the selection intact and moves the card | e2e | `./node_modules/.bin/playwright test e2e/deals-drag.spec.ts` | ❌ Wave 0 |
| SC-5 | G1: one Escape closes the dialog only | e2e | same spec | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run typecheck && npm run lint` plus the one vitest file the task touches.
- **Per wave merge:** `npm run test` (both vitest projects).
- **Before any Playwright run:** `docker compose up -d --build`, then wait for the app to answer on
  `http://localhost:3001`.
- **Phase gate:** `npm run typecheck` + `npm run lint` + `npm run test` green, **and**
  `./node_modules/.bin/playwright test` green (18 viewport assertions + the drag/G1 spec), before
  `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `npm install -D @playwright/test` — the only new dependency
- [ ] `playwright.config.ts` — repo root; **must** carry `launchOptions.ignoreDefaultArgs: ["--hide-scrollbars"]` (Pitfall 8) and must **not** define a `webServer`
- [ ] `e2e/auth.setup.ts` + `e2e/.auth/` — the authenticated `storageState` (see Open Question 1)
- [ ] `e2e/viewport-320.spec.ts` — SC-1, with the locale-dependent anchors from Pitfall 9
- [ ] `e2e/deals-drag.spec.ts` — SC-5 (drag) + G1 (Escape)
- [ ] `.gitignore` += `/e2e/.auth/`, `/playwright-report/`, `/test-results/`
- [ ] `.dockerignore` += `e2e`, `playwright.config.ts`, `playwright-report`, `test-results`
- [ ] `src/messages/locale-parity.test.ts` — extend `REQUIRED_BULK_KEYS` (+2) and `REQUIRED_AUDIT_KEYS` (+2); decide on `REQUIRED_SHELL_KEYS` and `IDENTICAL_TRANSLATION_ALLOWED`
- [ ] `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` — extend `FAILURE_KEYS` with the two new branch keys
- [ ] New source gates for the theme wiring and the shell-literal removal

---

## Security Domain

`security_enforcement` is absent from `.planning/config.json`, so it is treated as enabled.

### Applicable ASVS Categories

| ASVS category | Applies | Standard control in this phase |
|---------------|---------|-------------------------------|
| V2 Authentication | **yes (test tier only)** | The e2e harness needs an authenticated admin session. Auth.js v5 + Credentials + argon2id (`src/lib/password.ts`: `memoryCost 19456, timeCost 2, parallelism 1`) `[VERIFIED]`. **Never hardcode a real user's password in a spec** — see Open Question 1 |
| V3 Session Management | **yes** | `storageState` persists a live JWT session cookie (`maxAge` 7 days, `src/auth.config.ts`) `[VERIFIED]`. It must be gitignored (Pitfall 11) and must never be committed or uploaded as a CI artifact |
| V4 Access Control | **yes** | `/admin/*` is gated twice — `middleware.ts`'s `authorized()` (`isAdminPath && !isAdmin → redirect`) and `app/admin/layout.tsx`'s `auth()` + `session.user.role !== "admin"` check `[VERIFIED both]`. **This phase must not weaken either.** Making the sidebar a client-side drawer changes only presentation; the server gate stays |
| V5 Input Validation | no | No new user input reaches a server action. The theme value is written by next-themes to `localStorage` and consumed only as a CSS class name from a closed three-value set |
| V6 Cryptography | no | Nothing new. `AUTH_SECRET` is untouched |
| V7 Error Handling / Logging | marginal | The new bulk copy must keep rendering `t("reason.<code>")` from the closed four-member union — never a server sentence (T-38-07, enforced by the existing wiring gate) `[VERIFIED]` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard mitigation | Status here |
|---------|--------|---------------------|-------------|
| Committed session token / credential | Information disclosure | gitignore `storageState`; never inline a password | **Action required** — `.gitignore` has no entry today `[VERIFIED]` |
| Client-side-only authorization | Elevation of privilege | Keep the server gate authoritative | Already correct; the drawer must not become the gate |
| Slopsquatted dependency | Tampering | slopcheck + registry verification | `@playwright/test` `[OK]`, 37M weekly downloads, microsoft/playwright, **no postinstall** `[VERIFIED]` |
| Supply-chain via `npx <pkg>@latest` | Tampering | Use `./node_modules/.bin/<tool>` only | Adopted throughout this document |
| Server error prose leaking to the browser | Information disclosure | Closed reason-code union → `t("reason.<code>")` | Existing gate covers it; the new branches must not add a fallback |
| Untrusted-event test evidence masking a real bug | — (assurance) | Only `isTrusted: true` input counts | Playwright input measured `isTrusted: true` `[VERIFIED]` |

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | `Sun`, `Moon`, `Monitor`, `Menu`, `Search` all exist in `lucide-react@0.575.0` | Standard Stack, Example 2 | Build error; trivially fixed by checking the export at implementation time |
| A2 | The `browser_drag` timeout was caused by `locator.dragTo()`'s actionability check against the `DragOverlay` | Alternatives, Pattern 8 | Low — the recommendation (use raw `page.mouse.*`) is correct regardless of the root cause, and the pointer-event mechanics are verified |
| A3 | The event-time `window.matchMedia` hotkey pattern (Pattern 4) compiles clean under this repo's React Compiler rules | Pattern 4 | Low — it introduces no hook, no state and no effect; worst case is an `exhaustive-deps` warning (severity 1) |
| A4 | `activities-client.tsx` exposes a `loadedIds`-equivalent set at the point where it renders `BulkFailureReport` | Pattern 7 | Medium — if not, that caller needs the set derived first. The import is confirmed; the variable was not read. **Read this file first when planning the SC-4 wave** |
| A5 | The installed `@playwright/test` version will accept one of the cached chromium revisions (1217 / 1223) | Standard Stack, Environment | Low — a mismatch costs one `playwright install chromium` download; network is confirmed working |
| A6 | The Docker rebuild is the only way to make source changes visible to the harness | Pitfall 10 | Low — verified from the Dockerfile and the absence of a volume mount; rebuild duration was not measured |
| A7 | `src/messages/*.json` can be imported from `e2e/*.spec.ts` via a relative path under `moduleResolution: "bundler"` | Example 4 | Low — `resolveJsonModule: true` is set and the `@/*` alias is available too; if the relative import is awkward, use `@/messages/en-US.json` |

---

## Open Questions

### 1. How does the e2e harness obtain an authenticated **admin** session?

- **What we know.** All six routes redirect unauthenticated users (`auth()` + `redirect("/login")` at
  `organizations/page.tsx:77`, `people:86`, `deals:39`, `activities:62`, `trash:62`) `[VERIFIED]`, and
  `/admin/*` additionally requires `role === "admin"` in both `middleware.ts` and
  `app/admin/layout.tsx` `[VERIFIED]`. The DB has exactly one admin: `prbitt@gmail.com`, approved and
  verified `[VERIFIED: psql]`. The login form is at `/(auth)/login` with `#email`, `#password` and a
  submit button `[VERIFIED]`. Sessions are JWT with a 7-day `maxAge`; over `http://localhost:3001` the
  cookie is the non-`__Secure-` `authjs.session-token` `[ASSUMED — derived from `AUTH_TRUST_HOST=true`
  plus an http origin; the prior UAT session did log in successfully at this URL]`.
- **What's unclear.** The harness must not hardcode a human's real password.
- **Recommendation — a dedicated e2e admin, seeded, not borrowed.** Add a small setup script that
  upserts a `pipelite-e2e@local` admin row with an argon2id hash of a password read from
  `process.env.E2E_ADMIN_PASSWORD` (against `localhost:5433`), then have `e2e/auth.setup.ts` log in
  through the real form once and save `storageState` to `e2e/.auth/admin.json`. Benefits: no real
  credential in the repo, the login path itself gets exercised, and the storageState is reusable by
  every locale and every spec.
  Rejected alternative: minting an Auth.js JWT directly with `AUTH_SECRET`. It is faster but couples
  the harness to Auth.js's internal cookie name, salt and `encode` signature, and the session callback
  still refetches the user from the DB on every access — so a row is needed either way.
- **This is the one decision the planner should surface to the user**, because it involves writing to
  the development database.

### 2. Should a `REQUIRED_SHELL_KEYS` contract list be added to `locale-parity.test.ts`?

- **What we know.** Every prior copy-bearing phase checked in a contract list, and the exact-set
  assertions are what caught drift. But no list covers `admin.nav.*`, `theme.*` or `nav.*` today, so
  the 23 new keys would be protected only by the whole-file key-set parity check — which catches a
  missing key but **not** an untranslated one.
- **What's unclear.** Whether the phase wants the stronger gate, given V-3's "keep it minimal".
- **Recommendation.** Add it. It is ~25 lines, it matches every precedent in the file, and it is the
  only thing that would catch someone pasting the English string into `pt-BR.json`. If added, put
  `admin.nav.pipelines`, `admin.nav.webhooks` and `nav.workflows` into `IDENTICAL_TRANSLATION_ALLOWED`
  in the same change (Pitfall 4).

### 3. Does the phase want `theme.*` gated at all?

- `theme.light` = "Claro" in **both** pt-BR and es-ES; `theme.system` = "Sistema" in both. These are
  correct translations that differ from en-US, so `untranslatedInBoth` (which requires equality with
  **en-US**) would not flag them. No action needed — noted only so nobody "fixes" them.

### 4. How long does `docker compose up -d --build` take?

- Not measured (the image is 1.72GB and a build runs `npm install --legacy-peer-deps` + `next build`).
  The planner should assume it is the dominant cost of any browser-verified task and structure waves
  to rebuild once, not per task.

---

## Sources

### Primary (HIGH confidence) — read or executed directly in this session

- `node_modules/next-themes/dist/index.mjs` — `"use client"` banner, `ThemeScript`, `useState(() => H(...))`, `enableColorScheme`, `disableTransitionOnChange`, nested-provider guard, `localStorage` key
- `node_modules/@radix-ui/react-menu/dist/index.mjs:109` — `MenuPortal` `present: forceMount || context.open`
- `node_modules/@dnd-kit/core/dist/core.cjs.development.js` — `AbstractPointerSensor.attach/handleMove`, `PointerSensor` listener target + activators, `getEventListenerTarget`
- `./node_modules/.bin/shadcn view sheet` (2026-08-17) — the full registry block source
- `./node_modules/.bin/eslint --print-config src/components/user-menu.tsx` — `react-hooks/set-state-in-effect: 2`
- `./node_modules/.bin/eslint e2e playwright.config.ts` → exit 0; `./node_modules/.bin/tsc --noEmit` → exit 0 (probe files since removed)
- **Live Playwright 1.60.0 runs** — pointer-event trust/type/count measurement; the 320/305 `clientWidth` comparison across default-headless / `ignoreDefaultArgs` / headed
- `npm view @playwright/test version time.created repository.url scripts`; `api.npmjs.org/downloads/point/last-week/@playwright/test`; `slopcheck install @playwright/test` → `[OK]`
- `docker compose ps`; `docker images`; `psql` against `localhost:5433` (user roles)
- Repo source, read in full or in the cited ranges: `src/app/layout.tsx`, `src/app/admin/layout.tsx`, `src/components/admin-sidebar.tsx`, `src/components/nav-header.tsx`, `src/components/user-menu.tsx`, `src/components/global-search/global-search.tsx`, `src/components/ui/{dialog,command,dropdown-menu,button}.tsx`, `src/components/bulk/bulk-failure-report.tsx`, `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts`, `src/components/custom-fields/__tests__/source-scan.ts`, `src/app/organizations/data-table.tsx`, `src/app/deals/kanban-board.tsx`, `src/lib/audit/present.ts`, `src/messages/locale-parity.test.ts`, `src/messages/{en-US,pt-BR,es-ES}.json`, `src/i18n/{config,request}.ts`, `src/auth.config.ts`, `src/middleware.ts`, `src/lib/password.ts`, `vitest.config.ts`, `vitest.rsc.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `components.json`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.gitignore`, `.github/workflows/ci.yml`
- Planning docs: `45-CONTEXT.md`, `45-UI-SPEC.md`, `ROADMAP.md` § Phase 45, `REQUIREMENTS.md`, `STATE.md`, `38-UAT.md`

### Secondary (MEDIUM confidence) — official docs, cross-checked against the installed tree

- https://github.com/pacocoursey/next-themes — provider recipe, `suppressHydrationWarning` requirement
- https://ui.shadcn.com/docs/dark-mode/next — the App Router setup (its wrapper file is unnecessary here)
- https://playwright.dev/docs/api/class-mouse — `steps` semantics (pointer-event emission is **not**
  documented there; it was measured)
- https://dndkit.com/extend/sensors/pointer-sensor/ and https://docs.dndkit.com/api-documentation/sensors/pointer
  — distance/delay activation constraints, mutually exclusive

### Tertiary (LOW confidence) — not relied on for any claim

- General "Playwright drag-and-drop" articles surfaced by search; none addressed dnd-kit's constraint
  directly, which is why the behaviour was measured instead

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | **HIGH** | Every version read from `node_modules`; the one new package verified on the registry, by download volume, by source repo, and by slopcheck |
| Theme mechanics (T-1…T-9) | **HIGH** | Both load-bearing claims (lint severity, `MenuPortal` gating) verified by direct execution and direct source read; the provider's SSR behaviour read from its dist bundle |
| Sheet / shadcn block | **HIGH** | Full block source fetched from the live registry this session |
| Responsive contract | **MEDIUM-HIGH** | The mechanism (`min-width: auto` on flex children) and the tools (`md:hidden`, `size-10`) are verified; the resulting pixel budget is the UI-SPEC's arithmetic and will be confirmed by the harness, not by this document |
| i18n / locale gate | **HIGH** | Gate read line by line; contract-list consequences enumerated per key; one upstream over-claim (L-2) found and corrected |
| Bulk prune | **HIGH** | Both prune implementations and `handleOutcome`'s re-assertion read directly; two of four callers read in full, one confirmed by grep (A4) |
| Playwright harness | **HIGH** | The two decisive behaviours (trusted pointer events, scrollbar-dependent `clientWidth`) were measured live; the config/lint/typecheck integration was probed against the real repo |
| Pitfalls | **HIGH** | Ten of twelve are backed by a direct read or a live run; two are reasoned (A2, A3) and tagged |

**Research date:** 2026-08-17
**Valid until:** 2026-09-16 (30 days). Shorten to 7 days for the `@playwright/test` version line only —
Playwright ships roughly monthly and `latest` will have moved.
