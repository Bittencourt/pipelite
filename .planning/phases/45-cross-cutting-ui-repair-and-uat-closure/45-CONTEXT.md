# Phase 45: Cross-Cutting UI Repair and UAT Closure - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 16 decisions across 4 areas, all accepted as recommended

<domain>
## Phase Boundary

This phase repairs five app-wide defects surfaced when the outstanding Phase 36-38 human UAT was
re-run in a real authenticated browser, and closes the one UAT item that session could not drive.
None of the five was introduced by Phases 36-38; items 1-3 predate them and are app-wide, which is
why they are collected here rather than retro-fitted into a shipped phase.

In scope:

1. Header overflow at 320px (`src/components/nav-header.tsx` + `src/components/global-search/global-search.tsx`)
2. Admin layout not collapsing at mobile (`src/app/admin/layout.tsx` + `src/components/admin-sidebar.tsx`)
3. Dark mode unreachable — theme tokens exist and are correct, no provider and no toggle (`src/app/layout.tsx`)
4. Untranslated shell strings — admin sidebar, dialog close controls, timeline "Deleted at", header "Workflows"
5. Bulk failure panel asserting a selection state that is not true (`src/components/bulk/bulk-failure-report.tsx`)
6. Carried-over verification: the deals-kanban drag-with-selection check, to be closed by an
   automated test that can actually drive it

Explicitly NOT in scope: any change to the `.dark` token block itself (it is complete and correct),
any migration of the broader test suite to e2e, and any new CRM feature surface. This phase touches
shell, theme, copy, and one bulk component — it must not collide with Phases 39-43.

</domain>

<decisions>
## Implementation Decisions

### Mobile Layout Strategy (scope items 1 & 2)

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

### Dark Mode (scope item 3)

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

### Shell Translation (scope item 4)

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

### Bulk Failure Copy & the Drag Check (scope item 5 + carried-over)

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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `next-themes@^0.4.6` — already in `package.json`, currently imported only by
  `src/components/ui/sonner.tsx`, whose `useTheme()` therefore always reads the default.
- shadcn `Sheet` primitive — available for the admin drawer.
- `globals.css` — `@custom-variant dark` plus a complete `.dark` token block; 69 `dark:` utilities
  already in use across the app. Forcing the class at runtime correctly flips `body` from
  `lab(100 0 0)` to `lab(2.75381 0 0)`. No token work is needed.
- `src/messages/{en-US,pt-BR,es-ES}.json` — three-locale next-intl setup already in place; the bulk
  namespace at `bulk.failures.*` is where `retryHint` lives (`en-US.json` line 523).
- `NextIntlClientProvider` is already mounted in `src/app/layout.tsx`, so any new provider nests
  inside the existing tree without restructuring.

### Established Patterns

- Client components declare `"use client"` and pull copy via `useTranslations("<namespace>")`.
- `src/app/layout.tsx` is an async server component resolving `locale`, `messages`, and `timeZone`
  via `next-intl/server`, then wrapping children in `NextIntlClientProvider` → `HotkeysProvider`.
- `src/components/nav-header.tsx` main nav is already `hidden md:flex` — the established mobile
  collapse point.
- `src/app/admin/layout.tsx` is a server component doing `auth()` + role gate, rendering
  `<AdminSidebar />` (client) beside `<main className="flex-1 p-6 bg-muted/30">`.
- Bulk components carry long explanatory header comments documenting *why* a decision was made;
  changes to `bulk-failure-report.tsx` should update rather than contradict that comment block.

### Integration Points

- **Theme provider** mounts in `src/app/layout.tsx`, wrapping (or wrapped by) `NextIntlClientProvider`;
  `<html>` needs `suppressHydrationWarning`.
- **Theme toggle** lands in `src/components/user-menu.tsx`.
- **Search collapse** spans `src/components/nav-header.tsx` (the `flex items-center gap-4` right
  cluster) and `src/components/global-search/global-search.tsx:134` (`className="w-64 pl-9 pr-9"`).
- **Admin drawer** spans `src/app/admin/layout.tsx` and `src/components/admin-sidebar.tsx`
  (the `sidebarItems` array holds the 11 English literals).
- **Dialog close label** in `src/components/ui/dialog.tsx` and `src/components/ui/alert-dialog.tsx`.
- **Failure copy** in `src/components/bulk/bulk-failure-report.tsx` plus its caller, which owns the
  selection prune and must pass down what survived.

</code_context>

<specifics>
## Specific Ideas

- The measured evidence is recorded and should be treated as the acceptance baseline, not
  re-derived: `scrollWidth` 416 vs `clientWidth` 305 on every main route; `/admin/audit` at 508
  (pt-BR) and 526 (es-ES); `<main>` starting at x≈206px under the uncollapsed rail.
- The es-ES-worse-than-pt-BR asymmetry on `/admin/audit` is the specific failure mode the original
  Phase 36 UAT item was written to catch — any fix must be verified in es-ES, not only in en-US.
- Dark mode is load-bearing for verification across the whole project: while it is unreachable,
  every "check it in dark mode" UAT item anywhere in Pipelite is unverifiable as a real user state.
  Prioritise it accordingly within the phase.
- The bulk panel's false sentence is not an artefact of a forced test — it is exactly what happens
  when another user deletes the records concurrently.

</specifics>

<deferred>
## Deferred Ideas

- Broad migration of the existing suite to e2e — the harness added here stays minimal and
  single-purpose.
- Any redesign of the `.dark` token palette; the tokens are correct as shipped.

</deferred>
