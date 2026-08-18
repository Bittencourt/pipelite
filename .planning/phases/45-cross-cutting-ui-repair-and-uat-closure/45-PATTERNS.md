# Phase 45: Cross-Cutting UI Repair and UAT Closure - Pattern Map

**Mapped:** 2026-08-18
**Files analyzed:** 31 (12 new, 19 modified)
**Analogs found:** 27 / 31 (4 new-category files have no repo analog — see § No Analog Found)

> **Read § Resolved Questions first.** Research assumption A4 is settled here, and two environment
> facts were discovered that change what the plan can assume (`tsx` is not installed;
> `@playwright/test@1.62.1` is already physically in `node_modules` but absent from `package.json`).

---

## Resolved Questions

### A4 — RESOLVED: `activities-client.tsx` **does** expose a `loadedIds` set at the render site

`src/app/activities/activities-client.tsx:110` (verified by direct read):

```tsx
const loadedIds = useMemo(() => new Set(activities.map((a) => a.id)), [activities])
const selectedIds = useMemo(
  () => Object.keys(rowSelection).filter((id) => rowSelection[id] && loadedIds.has(id)),
  [rowSelection, loadedIds]
)
```

`BulkFailureReport` is rendered at line 292, inside the same component body, so `loadedIds` is in
scope with no derivation work. **A4's medium-risk branch does not fire. No caller needs a new set.**

### All four `BulkFailureReport` callers, mapped

| Caller | Prune set | Set defined | `<BulkFailureReport>` rendered | Shape |
|--------|-----------|-------------|-------------------------------|-------|
| `src/app/organizations/data-table.tsx` | `loadedIds` | line 155 | line 324 (`{cond && (…)}`) | `new Set(data.map(r => r.id))` |
| `src/app/people/data-table.tsx` | `loadedIds` | line 185 | line 282 (`{cond ? (…) : null}`) | `new Set(data.map(r => r.id))` |
| `src/app/activities/activities-client.tsx` | `loadedIds` | line 110 | line 292 (`{cond && (…)}`) | `new Set(activities.map(a => a.id))` |
| `src/app/deals/kanban-board.tsx` | `renderedIds` | lines 136-144 | line 515 (`{cond && (…)}`) | `Set` built by looping `openStages` → `dealsByStage` |

All four render the identical four-prop call today. The prop block to extend is byte-identical in
three of the four (organizations / activities / deals) and differs only in `? :` vs `&&` in people.

### Environment findings that affect the plan

| Finding | Evidence | Consequence |
|---------|----------|-------------|
| `tsx` is **not installed** (not in `node_modules/.bin`, not on `PATH`) | `ls node_modules/.bin` → no `tsx`; `which tsx` → empty | The existing seed convention `"db:seed-activities": "tsx drizzle/seed-activity-types.ts"` is **currently unrunnable**. The e2e admin seed cannot copy that invocation verbatim — it needs `npm i -D tsx`, or must run as a Playwright `globalSetup`/`setup` project (TypeScript already transpiled by Playwright), or as a plain SQL/`psql` step. **Prefer the Playwright setup-project route** — it adds no dependency and keeps the seed inside the harness that owns it. |
| `@playwright/test@1.62.1` is physically present in `node_modules` but **absent from `package.json`** | `node_modules/@playwright/test/package.json` → `1.62.1`; `package.json` devDependencies → no entry; `git status` clean | `./node_modules/.bin/playwright` already resolves. Do **not** treat a working local run as proof the dependency is recorded — the plan must still run `npm install -D @playwright/test` so the lockfile records it (Research § Runtime State Inventory). |
| `src/components/ui/sheet.tsx` does not exist | `ls src/components/ui/` — 26 files, no `sheet.tsx` | Confirmed; it is a NEW file. |
| Zero `@radix-ui/react-*` imports anywhere in `src/` | `grep -rn "@radix-ui/react-" src/` → no matches | The unified `radix-ui` convention is total, not merely dominant. The `sheet` registry block matches it as-shipped. |

---

## File Classification

### New files

| New file | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `playwright.config.ts` | config | n/a (test config) | `vitest.config.ts` | role-match (different runner, same repo config idiom) |
| `e2e/auth.setup.ts` | test / setup | request-response (real login) | `src/app/(auth)/login/page.tsx` (selectors) + `drizzle/seed-activity-types.ts` (script shape) | partial |
| `e2e/viewport-320.spec.ts` | test (e2e) | batch / matrix assertion | `src/messages/locale-parity.test.ts` (table-driven locale loop) | partial (assertion shape only) |
| `e2e/deals-drag.spec.ts` | test (e2e) | event-driven (pointer) | none — see § No Analog Found | none |
| `e2e/theme.spec.ts` (may fold into another spec) | test (e2e) | request-response | `e2e/viewport-320.spec.ts` (sibling in same wave) | n/a |
| e2e admin seed (recommended: `e2e/seed-admin.ts`, invoked from `auth.setup.ts`) | script / migration-adjacent | CRUD (one upsert) | `drizzle/seed-activity-types.ts` + `src/lib/password.ts` | role-match |
| `src/components/ui/sheet.tsx` | component (shadcn primitive) | n/a | `src/components/ui/dialog.tsx` | **exact** |
| `src/components/admin-mobile-bar.tsx` (or a second export inside `admin-sidebar.tsx`) | component (client) | event-driven (open/close) | `src/components/admin-sidebar.tsx` + `src/components/ui/dialog.tsx` consumers | role-match |
| `src/components/global-search/search-results.tsx` (extracted shared tree — Research Pattern 5) | component (client) | transform (results → list) | `src/components/global-search/global-search.tsx:146-209` | **exact** (it is a lift of that exact subtree) |
| `src/app/__tests__/theme-wiring.test.ts` | test (source gate) | file-I/O | `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` | **exact** |
| shell-literal gate (e.g. `src/components/__tests__/shell-literals-wiring.test.ts`) | test (source gate) | file-I/O | same | **exact** |
| bulk-caller gate (new file, or extend the existing report gate) | test (source gate) | file-I/O | `src/app/trash/__tests__/trash-client-wiring.test.ts` (multi-source variant) | **exact** |

### Modified files

| Modified file | Role | Data Flow | Rule(s) | Closest in-repo pattern to copy |
|---------------|------|-----------|---------|---------------------------------|
| `src/app/layout.tsx` | layout (async RSC) | request-response | T-1, T-2, T-3 | itself (lines 42-58 provider nesting) |
| `src/app/admin/layout.tsx` | layout (async RSC) | request-response | R-2 | itself (lines 20-27) |
| `src/components/admin-sidebar.tsx` | component (client) | event-driven | R-2, S-1 | `nav-header.tsx` (`t()` on every link) |
| `src/components/nav-header.tsx` | component (client) | event-driven | R-1, S-5 | itself (lines 40-46 link pattern) |
| `src/components/user-menu.tsx` | component (client) | event-driven | T-4, C-1 | itself (lines 58-63 menu-item pattern) |
| `src/components/global-search/global-search.tsx` | component (client) | request-response (fetch) | R-1 | itself + `ui/command.tsx` |
| `src/components/ui/dialog.tsx` | component (primitive) | n/a | S-2 | itself (lines 70-78, 112-116) |
| `src/components/ui/command.tsx` | component (primitive) | n/a | Correction #1 | `ui/dialog.tsx` prop-destructure-then-forward idiom |
| `src/components/bulk/bulk-failure-report.tsx` | component (client) | transform | SC-4 | itself (lines 76, 101) |
| 4 bulk callers | component (client) | CRUD | SC-4 | `organizations/data-table.tsx:155,324` |
| `src/lib/audit/present.ts` | utility (pure lib) | transform | S-6 | itself (lines 58-91) |
| `src/components/timeline/audit-entry.tsx` | component (client) | transform | S-6 | itself (lines 222-249) |
| `src/messages/{en-US,pt-BR,es-ES}.json` | config (copy catalog) | n/a | 23 keys × 3 | existing `bulk.failures.*` / `common.*` blocks |
| `src/messages/locale-parity.test.ts` | test (contract gate) | file-I/O | L-1, V-4 | itself (`REQUIRED_BULK_KEYS`, lines 302-374) |
| `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` | test (source gate) | file-I/O | SC-4 | itself (`FAILURE_KEYS`, lines 89-94) |
| `.gitignore` / `.dockerignore` | config | n/a | Pitfall 10/11 | itself |
| `package.json` | config | n/a | `-D @playwright/test` | itself |

---

## Pattern Assignments

### `playwright.config.ts` (config, new)

**Analog:** `vitest.config.ts` (repo root, 30 lines). Different runner — what transfers is the
**repo's config-file idiom**, not the option names.

**What the analog establishes** (`vitest.config.ts:1-29`):

```ts
import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Anchored at src/ so build output under .next/ can never match.
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    // test.exclude REPLACES the defaults - spread them, never write a bare array,
    // or vitest walks node_modules and executes vendored test files.
    exclude: [ ...configDefaults.exclude, '**/.next/**', '**/*.rsc.test.?(c|m)[jt]s?(x)' ],
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

Three transferable conventions, all visible above:

1. **Default export of `defineConfig({...})`, single-quoted strings, no semicolons.**
2. **Every non-obvious option carries an inline comment stating what breaks without it.**
   `vitest.rsc.config.ts` takes this to 25 comment lines above a 20-line config, including a
   *measured* justification ("measured on vitest 4.0.18, the inline project form does not apply the
   condition to bare `react`"). This is the house style for a config decision that looks removable.
   → The `launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] }` line (V-1) and the **absence**
   of a `webServer` block must both carry that kind of comment, or a future reader deletes them.
3. **The `@` alias is declared per-config**, not inherited. `tsconfig.json` already has
   `"paths": { "@/*": ["./src/*"] }` and `resolveJsonModule: true`, so `e2e/*.spec.ts` can import
   `@/messages/en-US.json` — but Playwright does not read vitest's alias, so if the specs use `@/`
   the config needs its own resolution, or the specs use relative paths (`../src/messages/…`).
   **Relative paths are the lower-risk choice** and are what Research Example 4 shows.

**Two vitest facts the Playwright config must not collide with** (`vitest.config.ts:8`):
the include glob is `src/**/*.{test,spec}.…`. An `e2e/` directory at the repo root is structurally
invisible to it. Anything named `*.spec.ts` placed under `src/` would be executed by `npm test` in a
`node` environment with no browser — V-3's failure mode.

**Package-script convention** (`package.json:5-16`): every script is a bare binary name resolved
from `node_modules/.bin` (`"lint": "eslint"`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run && …"`).
No `npx` appears anywhere in `package.json`. If an e2e script is added, `"test:e2e": "playwright test"`
matches; `npx playwright test` does not.

---

### `src/components/ui/sheet.tsx` (component / shadcn primitive, new)

**Analog:** `src/components/ui/dialog.tsx` — **exact**. Sheet is Radix `Dialog` under a different
name, and `dialog.tsx` is the file the registry block is a variant of.

**Import convention — copy this exactly** (`src/components/ui/dialog.tsx:1-8`):

```tsx
"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
```

This repo uses the **unified `radix-ui@1.4.3` package**, aliased on import as `<Name>Primitive`.
Verified across every primitive in `src/components/ui/`:

```
alert-dialog.tsx:4  import { AlertDialog as AlertDialogPrimitive } from "radix-ui"
avatar.tsx:4        import { Avatar as AvatarPrimitive } from "radix-ui"
checkbox.tsx:5      import { Checkbox as CheckboxPrimitive } from "radix-ui"
collapsible.tsx:3   import { Collapsible as CollapsiblePrimitive } from "radix-ui"
dialog.tsx:5        import { Dialog as DialogPrimitive } from "radix-ui"
dropdown-menu.tsx:5 import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"
popover.tsx:4       import { Popover as PopoverPrimitive } from "radix-ui"
select.tsx:5        import { Select as SelectPrimitive } from "radix-ui"
tabs.tsx:5          import { Tabs as TabsPrimitive } from "radix-ui"
```

`grep -rn "@radix-ui/react-" src/` returns **zero matches**. The `shadcn add sheet` block already
emits `import { Dialog as SheetPrimitive } from "radix-ui"` — no normalisation needed.

**Component-declaration pattern — plain `function`, `data-slot`, `cn()` merge** (`dialog.tsx:34-48`):

```tsx
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}
```

No `React.forwardRef`, no `displayName`, no arrow-function components. Every wrapper carries
`data-slot="<kebab-name>"`. Named exports in one alphabetised block at the bottom (`dialog.tsx:147-158`).

**The S-4 close-label pattern — this is the site to change before first use** (`dialog.tsx:70-78`):

```tsx
{showCloseButton && (
  <DialogPrimitive.Close
    data-slot="dialog-close"
    className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
  >
    <XIcon />
    <span className="sr-only">Close</span>
  </DialogPrimitive.Close>
)}
```

The registry `sheet` block ships this same `<span className="sr-only">Close</span>` verbatim.
S-4 requires it become `{closeLabel ?? t("close")}` in the same change that creates the file.

**The `showCloseButton` optional-prop idiom to copy for `closeLabel`** (`dialog.tsx:50-57`):

```tsx
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
```

An extra prop is added by intersecting an inline object type onto `React.ComponentProps<…>` and
destructuring it out before the rest spread. `alert-dialog.tsx:47-53` uses the identical idiom for
its `size?: "default" | "sm"` prop. `closeLabel?: string` follows exactly.

---

### `src/components/ui/dialog.tsx` (component / primitive, modified — S-2)

**Analog:** itself, plus `bulk-failure-report.tsx:52,72` for the `useTranslations` call shape.

**Two sites, not one.** Site 1 is `dialog.tsx:76` above. **Site 2 is easy to miss** (`dialog.tsx:112-116`):

```tsx
{showCloseButton && (
  <DialogPrimitive.Close asChild>
    <Button variant="outline">Close</Button>
  </DialogPrimitive.Close>
)}
```

This is inside `DialogFooter`, whose own `showCloseButton` defaults to `false` (line 96) — a
*different* prop from `DialogContent`'s. Both literals are the same defect class.

**The hook call to add** — `bulk-failure-report.tsx:51-52,72`:

```tsx
import { useTranslations } from "next-intl"
…
const t = useTranslations("bulk")
```

`dialog.tsx` is already `"use client"` (line 1), so the hook is legal. `common.close` exists in all
three locales (`en-US.json` → `"close": "Close"`, verified alongside `"search": "Search"` in the
same `common` block).

**S-3 is an assertion, not an edit.** `src/components/ui/alert-dialog.tsx` was read: it imports
`Button` (line 7) and defines `AlertDialogCancel` rendering only `children`. It ships **no**
`sr-only` span and **no** literal `"Close"`. Do not add a default there — assert its absence in the
new shell-literal gate.

---

### `src/components/ui/command.tsx` (component / primitive, modified — Research Correction #1)

**Analog:** `dialog.tsx`'s destructure-then-forward idiom (above).

**The blocker, verbatim** (`src/components/ui/command.tsx:32-61`):

```tsx
function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent className={cn("overflow-hidden p-0", className)} showCloseButton={showCloseButton}>
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground …">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

`...props` spreads onto `Dialog` (Radix Root), never onto the inner `<Command>`. There is no path
for `shouldFilter={false}`.

**The fix follows the same destructure-then-forward shape already in this file:** add
`shouldFilter` and `loop` to the destructure and the inline type, and pass them to `<Command>`.
The inner `<Command>` is the repo's own wrapper (`command.tsx:16-30`), which already spreads
`...props` onto `CommandPrimitive`, so nothing downstream needs touching.

**Why this matters** — `global-search.tsx` items are keyed by UUID (`:154 value={org.id}`,
`:172 value={person.id}`, `:190 value={deal.id}`) and the popover path only works because its outer
`<Command>` sets `shouldFilter={false}` (`global-search.tsx:118-122`).

---

### `src/app/layout.tsx` (layout / async RSC, modified — T-1, T-2, T-3)

**Analog:** itself. The provider-nesting shape is the pattern; do not restructure it.

**The exact tree to nest into** (`src/app/layout.tsx:42-59`):

```tsx
  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          <HotkeysProvider>
            <NavHeader user={user} />
            <main className="min-h-[calc(100vh-3.5rem)]">
              {children}
            </main>
            <ShortcutsHint />
            <Toaster />
          </HotkeysProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
```

**Two edits, both surgical:** `<html lang={locale} suppressHydrationWarning>` (line 43), and one
`<ThemeProvider …>` wrapper inserted between `NextIntlClientProvider` (line 47) and
`HotkeysProvider` (line 48). Import block convention (`layout.tsx:1-10`) is un-grouped, un-sorted,
double-quoted, no semicolons — `import { ThemeProvider } from "next-themes"` goes at the end of it.

**The precedent for importing a `"use client"` library directly into this server file** is already
in the file: `NextIntlClientProvider` (line 9) and `HotkeysProvider` (line 6) are both client
components imported into this async server component with no local wrapper. next-themes ships
`"use client"` in its dist, so it needs no `components/theme-provider.tsx` either — **there is no
such wrapper file in this repo and the plan should not invent one.**

---

### `src/components/user-menu.tsx` (component / client, modified — T-4, C-1)

**Analog:** itself. Every new menu row copies the shape already there four times.

**Menu-item pattern** (`user-menu.tsx:58-63`):

```tsx
<DropdownMenuItem asChild>
  <a href="/settings/api-keys" className="flex items-center">
    <Key className="mr-2 h-4 w-4" />
    <span>{t("apiKeys")}</span>
  </a>
</DropdownMenuItem>
```

Icon class is **`mr-2 h-4 w-4`** on all four existing items (lines 60, 72, 79, 89) — `Sun`/`Moon`/
`Monitor` take the same, per T-4.

**Import + hook pattern** (`user-menu.tsx:3-15, 25-26`):

```tsx
import { signOut } from "next-auth/react"
import { LogOut, User, Key, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
…
const t = useTranslations("nav")
const tAuth = useTranslations("auth")
```

Multiple namespaces are held as separate `t` / `tAuth` bindings — `tTheme = useTranslations("theme")`
matches. `DropdownMenuRadioGroup` / `DropdownMenuRadioItem` must be added to the existing named
import block (both are already exported by `ui/dropdown-menu.tsx`).

**Insertion point — above the existing final separator** (`user-menu.tsx:84-91`):

```tsx
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-red-600 focus:text-red-600"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{tAuth("logout")}</span>
        </DropdownMenuItem>
```

**C-1 is line 87 of this excerpt**: `text-red-600 focus:text-red-600` → `text-destructive
focus:text-destructive`. It is the only hardcoded palette colour in the nine touched files.

**Do not add a `mounted` gate.** There is no `useState`/`useEffect` in this file today; keep it that
way. The one `eslint-disable` for `react-hooks/set-state-in-effect` in the repo lives in
`src/components/ui/relative-time.tsx` and is a logged deferral, not a precedent.

---

### `src/components/nav-header.tsx` (component / client, modified — R-1, S-5)

**Analog:** itself. Six of the seven nav links already do the right thing.

**The correct link pattern, repeated six times** (`nav-header.tsx:40-46`):

```tsx
<Link
  href="/organizations"
  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
>
  <Building2 className="h-4 w-4" />
  {t("organizations")}
</Link>
```

**The one defect (S-5)** — `nav-header.tsx:82-88`, identical markup, literal label:

```tsx
<Link
  href="/workflows"
  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
>
  <Workflow className="h-4 w-4" />
  Workflows
</Link>
```

→ `{t("workflows")}`. `t` is already bound at line 20 as `useTranslations("nav")`.

**The two flex clusters that need `min-w-0` (R-1)** — `nav-header.tsx:33-34` and `:92`:

```tsx
<div className="container flex h-14 items-center justify-between">
  <div className="flex items-center gap-6">        {/* left cluster */}
  …
  <div className="flex items-center gap-4">        {/* right cluster */}
    {user && <GlobalSearch />}
    {user ? (<UserMenu user={user} />) : (…)}
```

**The established mobile-collapse idiom is already in this file** (`nav-header.tsx:39`):
`<nav className="hidden md:flex items-center gap-4">`. The `md` breakpoint the whole responsive
contract pins to comes from this exact line — reuse `hidden md:block` / `md:hidden`, do not
introduce a hook.

---

### `src/components/global-search/global-search.tsx` + new `search-results.tsx` (component / client)

**Analog for the extraction:** the file itself, lines 146-209 — the subtree lifted *is* the pattern.

**The subtree to extract into a shared `SearchResults` component** (`global-search.tsx:146-209`,
abridged to the repeating unit at 149-166):

```tsx
<CommandList>
  {hasResults ? (
    <>
      {results!.organizations.length > 0 && (
        <CommandGroup heading={tNav("organizations")}>
          {results!.organizations.map((org) => (
            <CommandItem
              key={org.id}
              value={org.id}
              onSelect={() => handleSelect(`/organizations/${org.id}`)}
            >
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <SearchResultItem label={org.name} detail={tNav("organizations")} query={query} />
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      … people (167-184) … deals (185-202) …
    </>
  ) : (
    <CommandEmpty>{t("noResults")}</CommandEmpty>
  )}
</CommandList>
```

Note `<CommandList>` is the *wrapper*, not part of the shared unit — Research Pattern 5 requires the
groups be children of each surface's own `CommandList`. Extract from line 147 (`{hasResults ? …`)
inward; leave `<CommandList>` at each call site.

**Sibling-file precedent for the extraction** — `src/components/global-search/` already holds
`global-search.tsx`, `search-result-item.tsx` and a barrel `index.tsx` (47 bytes). Adding
`search-results.tsx` beside them is the established shape of this directory.

**The input that becomes `md`-and-up only (R-1)** — `global-search.tsx:125-139`:

```tsx
<div className="relative">
  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  <Input
    ref={inputRef}
    type="search"
    placeholder={`${t("search")}... (/)`}
    value={query}
    onChange={handleInputChange}
    onKeyDown={handleInputKeyDown}
    className="w-64 pl-9 pr-9"
  />
  {loading && (<Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />)}
</div>
```

`w-64` at line 134 is the 256px the UI-SPEC names. The wrapper at line 125 gains `hidden md:block`.

**The `/` hotkey to branch (Pattern 4)** — `global-search.tsx:46-49`:

```tsx
useHotkeys("/", (e) => {
  e.preventDefault()
  inputRef.current?.focus()
}, { scopes: ["global"], useKey: true })
```

The `{ scopes: ["global"], useKey: true }` options object is the repo's hotkey convention — five more
instances at `nav-header.tsx:24-28`. Keep it; change only the body.

**`t` bindings already present** (`global-search.tsx:38-39`): `t = useTranslations("common")`,
`tNav = useTranslations("nav")`. So `t("search")` and `tNav("searchDescription")` for the S-7
`CommandDialog` props need no new hook.

---

### `src/app/admin/layout.tsx` (layout / async RSC, modified — R-2)

**Analog:** itself + `src/app/layout.tsx` (the auth-then-render server-layout shape).

**Current file, complete** (`src/app/admin/layout.tsx:20-27`):

```tsx
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <AdminSidebar />
      <main className="flex-1 p-6 bg-muted/30">
        {children}
      </main>
    </div>
  )
```

**The auth gate above it must not move** (`:10-18`) — `auth()`, `redirect("/login?callbackUrl=/admin")`,
`session.user.role !== "admin"` → `redirect("/?error=unauthorized")`. Security domain V4: the drawer
is presentation only; this stays authoritative.

**The `min-w-0` content column (R-2) is the new element** and has no in-repo precedent to copy —
`grep` for `min-w-0` finds it only on inner text nodes (e.g. `audit-entry.tsx:234`
`className="min-w-0 text-sm leading-normal break-words"`). Take the shape from Research Pattern 6.

---

### `src/components/admin-sidebar.tsx` (component / client, modified — R-2, S-1)

**Analog for the translated array:** the sibling nav in `nav-header.tsx` (above) — every entry calls
`t()`.

**The 11 literals, all in one file** (`admin-sidebar.tsx:9-61` array + `:70` + `:95`):

```tsx
const sidebarItems = [
  { title: "Dashboard",        href: "/admin",                        icon: Home },
  { title: "User Management",  href: "/admin/users",                  icon: Users },
  { title: "Pipelines",        href: "/admin/pipelines",              icon: Layers },
  { title: "Custom Fields",    href: "/admin/fields",                 icon: SlidersHorizontal },
  { title: "Webhooks",         href: "/admin/webhooks",               icon: Radio },
  { title: "Audit Log",        href: "/admin/audit",                  icon: ScrollText },
  { title: "Trash",            href: "/admin/trash",                  icon: Trash2 },
  { title: "Export Data",      href: "/admin/export",                 icon: Database },
  { title: "Pipedrive Import", href: "/admin/import/pipedrive-api",   icon: Key },
]
…
<h2 className="text-lg font-semibold">Admin Panel</h2>          {/* line 70 */}
…
<Button variant="outline" className="w-full">
  <Home className="mr-2 h-4 w-4" />
  Back to App                                                    {/* line 95 */}
</Button>
```

**The stale comments S-1 requires removed** are at `:35-38` and `:44-45` — inside the array,
between entries:

```tsx
  // The English literal is deliberate: every sibling in this array is one, and
  // half-migrating a single entry would read as a bug rather than as progress. This is the
  // one new user-visible English literal phase 36 writes; the dashboard tile that points at
  // the same route IS translated, because that grid already is.
```

Since the array becomes translated, the `title` field should hold a **key** (e.g. `"dashboard"`) and
the renderer call `t(item.title)`. That is the shape `audit-entry.tsx:226-229` already uses for the
same key-in-data problem:

```tsx
const label =
  !isCustomField && change.label.startsWith(FIELD_LABEL_KEY_PREFIX)
    ? t(change.label.slice(MESSAGE_NAMESPACE_PREFIX.length))
    : change.label
```

**The item renderer to share between rail and drawer** (`admin-sidebar.tsx:73-89`):

```tsx
{sidebarItems.map((item) => {
  const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)
  return (
    <Link key={item.href} href={item.href}>
      <Button
        variant={isActive ? "secondary" : "ghost"}
        className={cn("w-full justify-start", isActive && "bg-secondary")}
      >
        <item.icon className="mr-2 h-4 w-4" />
        {item.title}
      </Button>
    </Link>
  )
})}
```

R-2 requires **one** copy of this consumed by both surfaces. The `cn()` + `variant={isActive ? …}`
idiom is the pattern; the `item.icon` capital-letter component reference is what makes the array
data-driven and must survive the extraction.

---

### `src/components/bulk/bulk-failure-report.tsx` (component / client, modified — SC-4)

**Analog:** itself. The three-branch change replaces exactly one line.

**Prop interface to extend** (`bulk-failure-report.tsx:58-71`):

```tsx
export interface BulkFailureReportProps {
  kind: BulkOperationKind
  failures: BulkFailure[]
  /** id -> display name, captured AT SUBMIT TIME by the caller. */
  labelById: Record<string, string>
  onDismiss: () => void
}

export function BulkFailureReport({
  kind,
  failures,
  labelById,
  onDismiss,
}: BulkFailureReportProps) {
  const t = useTranslations("bulk")
```

Note the **doc comment above `labelById`** — the file documents *why* a prop is shaped as it is, at
the prop. `stillSelected: number` needs the same treatment ("the caller owns the intersection
because the caller owns `data`; the report renders a truth it is told").

**The line that becomes three branches** (`bulk-failure-report.tsx:101`):

```tsx
<p className="text-muted-foreground mt-2 text-xs">{t("failures.retryHint")}</p>
```

**The existing conditional-key idiom to copy** is two lines above (`:82-84`):

```tsx
{kind === "delete"
  ? t("failures.deleteTitle", { count: failures.length })
  : t("failures.reassignTitle", { count: failures.length })}
```

— ternary inline in JSX, `{ count }` passed as the second argument. `retryHintPartial` takes
`{ count: stillSelected }` the same way.

**Constraints the existing wiring gate enforces on the new code** (`bulk-failure-report-wiring.test.ts:100-129`):
the new branching must **not** introduce `.slice(`, `setTimeout`, `setInterval`, `aria-live`,
`bg-destructive`, or either dispatch import; it must **keep** `variant="destructive"`, `AlertTitle`,
`AlertDescription`, `useTranslations("bulk")`, `failures.length === 0`, `max-h-48`, `overflow-y-auto`,
`font-semibold`, `reason.${`, `text-muted-foreground`, `onDismiss`.

**The header comment must be updated, not deleted.** `bulk-failure-report.tsx:3-49` is a 47-line
block explaining each decision. The gate's own header states the rule
(`bulk-failure-report-wiring.test.ts:11`): *"THE CORRECT RESPONSE TO A COLLISION IS TO REWORD THE
COMMENT, NEVER TO WEAKEN THE GATE."* Because the gate strips comments before asserting, prose is
free — but a comment that still says the hint is unconditional is a stale justification of the same
class S-1 removes from `admin-sidebar.tsx`.

---

### The four bulk callers (component / client, modified — SC-4)

**Analog:** `src/app/organizations/data-table.tsx` — the other three are near-identical.

**The prune set** (`organizations/data-table.tsx:155-159`, with its doc comment at 145-154):

```tsx
  const loadedIds = useMemo(() => new Set(data.map((r) => r.id)), [data])
  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id] && loadedIds.has(id)),
    [rowSelection, loadedIds],
  )
```

**Why intersecting against `loadedIds` (not `rowSelection`) is correct** — `handleOutcome`
re-asserts every failed id unconditionally (`organizations/data-table.tsx:232-247`):

```tsx
  const handleOutcome = (next: BulkOutcome) => {
    const succeeded = new Set(next.succeeded)

    setRowSelection((prev) => {
      const remaining: RowSelectionState = {}
      for (const id of Object.keys(prev)) {
        if (prev[id] && !succeeded.has(id)) remaining[id] = true
      }
      for (const failure of next.failed) {
        remaining[failure.id] = true
      }
      return remaining
    })

    setOutcome(next.failed.length > 0 ? next : null)
    refresh?.()
  }
```

`rowSelection[failedId]` is therefore always `true`; only leaving `data` can drop a failed row.
`failed ∩ loadedIds` is exactly "still selected".

**The call site to extend** (`organizations/data-table.tsx:318-330`):

```tsx
      {/*
        ABOVE THE TABLE, below the search row — a report to READ, not a control to press, and it can
        run to as many lines as there were failures. It is deliberately not inside the fixed bar,
        which has to stay one compact control cluster down to 320px.
      */}
      {outcome !== null && outcome.failed.length > 0 && (
        <BulkFailureReport
          kind={outcome.kind}
          failures={outcome.failed}
          labelById={outcome.labelById}
          onDismiss={() => setOutcome(null)}
        />
      )}
```

Add `stillSelected={outcome.failed.filter((f) => loadedIds.has(f.id)).length}`.

**Per-caller deltas** (the only three things that differ):

| Caller | Set name | Render-site line | Conditional form |
|--------|----------|------------------|------------------|
| organizations | `loadedIds` | 324 | `{cond && (…)}` |
| people | `loadedIds` | 282 | `{cond ? (…) : null}` |
| activities | `loadedIds` | 292 | `{cond && (…)}` |
| deals/kanban | `renderedIds` | 515 | `{cond && (…)}` |

**Kanban's set is built differently** (`kanban-board.tsx:132-144`) — open stages only:

```tsx
  /**
   * Every deal id currently on the board, across the OPEN stages only — the won and lost stages
   * render summary tiles and no cards, so nothing there is ever selectable.
   */
  const renderedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const stage of openStages) {
      for (const deal of dealsByStage[stage.id] || []) {
        ids.add(deal.id)
      }
    }
    return ids
  }, [openStages, dealsByStage])
```

Both `loadedIds` and `renderedIds` are `Set<string>`, so `.has(f.id)` reads identically at all four
call sites.

---

### `src/lib/audit/present.ts` + `src/components/timeline/audit-entry.tsx` (utility + component, modified — S-6)

**Analog for the label map:** the map itself, and its own load-bearing comment
(`present.ts:53-79`):

```ts
/**
 * INSERTION ORDER IS LOAD-BEARING: it is the display order of native columns (see
 * `buildAuditFieldChanges`). Labels name the relationship, not the column - `stageId` is
 * "Stage", not "Stage ID", because the id is an implementation detail and never reaches a
 * screen.
 */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  title: "audit.field.title",
  …
  completedAt: "audit.field.completedAt",
}

const NATIVE_ORDER: ReadonlyMap<string, number> = new Map(
  Object.keys(AUDIT_FIELD_LABELS).map((column, index) => [column, index])
)
```

→ any `deletedAt` entry must be **appended last** so no existing rank shifts.

**The date-classification set to extend (defence in depth, S-6)** (`present.ts:85-91`):

```ts
/** Date columns, mapped to whether the time of day is part of the value. */
const DATE_COLUMNS: Record<string, boolean> = {
  dueDate: true,
  completedAt: true,
  // A close date is a day, not an instant: showing 00:00 next to it would invent precision.
  expectedCloseDate: false,
}
```

`deletedAt: true` here also makes `nativeKind()` return `"date"` (`present.ts:334-339`,
`if (column in DATE_COLUMNS) return "date"`).

**The fallback that currently produces `"Deleted at"`** (`present.ts:276-287, 322-331`):

```ts
/**
 * A column name split on capitals and sentence-cased: `someNewColumn` to "Some new column".
 *
 * THIS PATH SHOULD BE UNREACHABLE. …
 */
function humaniseColumn(column: string): string { … }
…
  const nativeIndex = NATIVE_ORDER.get(changeKey)
  return {
    field: changeKey,
    label: nativeIndex === undefined ? humaniseColumn(changeKey) : AUDIT_FIELD_LABELS[changeKey],
    …
  }
```

The `THIS PATH SHOULD BE UNREACHABLE` comment is factually wrong (S-6 requires rewriting it).

**Where the direction branch belongs** — `audit-entry.tsx:222-249`, the one place the from/to pair
is in hand:

```tsx
function AuditFieldRow({ change }: { change: AuditFieldChange }) {
  const t = useTranslations("audit")

  const isCustomField = change.field.startsWith(CUSTOM_CHANGE_PREFIX)
  const label =
    !isCustomField && change.label.startsWith(FIELD_LABEL_KEY_PREFIX)
      ? t(change.label.slice(MESSAGE_NAMESPACE_PREFIX.length))
      : change.label

  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="min-w-0 text-sm leading-normal break-words">
        {change.from === null ? null : (
          <>
            <AuditValueText value={change.from} muted />
            <span className="sr-only">{t("value.changedTo")}</span>
            <ArrowRight className="text-muted-foreground mx-1 inline h-3 w-3 align-middle" aria-hidden="true" />
          </>
        )}
        <AuditValueText value={change.to} muted={false} />
      </dd>
    </div>
  )
}
```

Key constants for the branch (`audit-entry.tsx:106-108`):
`CUSTOM_CHANGE_PREFIX = "custom:"`, `MESSAGE_NAMESPACE_PREFIX = "audit."`,
`FIELD_LABEL_KEY_PREFIX = "audit.field."`. `t` is `useTranslations("audit")`, so a key stored as
`"audit.field.movedToTrash"` is resolved by slicing the `"audit."` prefix — same as every other
native label. The `→` arrow / from-to pair must be **suppressed** for this row per S-6, which means
the `deletedAt` case returns early with one `<dt>`-only line rather than falling through the `<dd>`.

---

### `src/messages/locale-parity.test.ts` (test / contract gate, modified — L-1, V-4)

**Analog:** itself. Adding `REQUIRED_SHELL_KEYS` is a copy of the `REQUIRED_BULK_KEYS` block.

**The contract-list declaration pattern** (`locale-parity.test.ts:291-310`, head of the bulk list):

```ts
/**
 * The copy contract from 38-UI-SPEC.md § Copywriting Contract → New key inventory. Same rule as the
 * three lists above: adding a `bulk.*` string to the UI means adding its dot-path here first, and the
 * exact-contract assertion below turns a string that skipped this list into a red suite rather than
 * copy that ships gated by nothing.
 *
 * 44 keys, all inside the `bulk` namespace — unlike `trash`, this phase adds nothing to `nav` or
 * `admin.dashboard`, which is why `bulkKeys` below needs no `*_EXTRA_KEYS` sibling. The per-group
 * counts in the comments are load-bearing: they are how a reader sees at a glance that a group lost
 * a key.
 */
export const REQUIRED_BULK_KEYS: string[] = [
  // Selection — 4. …
  "bulk.selectRow",
  …
```

Conventions: `export const REQUIRED_<NS>_KEYS: string[]`, a doc block naming the source UI-SPEC,
inline `// Group — N.` comments carrying the count, keys as full dot-paths.

**The two exact-set assertions the new keys will break** (`locale-parity.test.ts:549-578`):

```ts
    const auditContract = [...REQUIRED_AUDIT_KEYS].sort()
    for (const locale of LOCALES) {
      expect(
        auditKeys[locale],
        `${AUDIT_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(auditContract)
    }
    …
    const bulkContract = [...REQUIRED_BULK_KEYS].sort()
    for (const locale of LOCALES) {
      expect(
        bulkKeys[locale],
        `${BULK_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(bulkContract)
    }
```

→ `bulk.failures.retryHintPartial`, `bulk.failures.prunedHint` **must** go into `REQUIRED_BULK_KEYS`
(insert in the "Failure report — 4" group at lines 353-357, and update the count to 6);
`audit.field.movedToTrash`, `audit.field.restoredFromTrash` **must** go into `REQUIRED_AUDIT_KEYS`.

**The `*_EXTRA_KEYS` pattern for a contract that spans namespaces** (`locale-parity.test.ts:432-462`):

```ts
/** The three trash strings that live outside the trash namespace: the tile and the sidebar entry. */
const TRASH_EXTRA_KEYS = [
  "admin.dashboard.trash",
  "admin.dashboard.trashDescription",
  "nav.trash",
]
…
const trashKeys = keysMatching(
  (key) => inNamespace(TRASH_NAMESPACE)(key) || TRASH_EXTRA_KEYS.includes(key),
)
```

`REQUIRED_SHELL_KEYS` spans `admin.nav.*`, `theme.*` **and** `nav.*` — and `nav` already contains 12
pre-existing keys (`organizations, people, deals, activities, pipelines, admin, settings, apiKeys,
userManagement, team, analytics, trash`). **A whole-`nav`-namespace scope would drag all 12 into an
exact-set contract.** Either scope the shell contract to `admin.nav.*` + `theme.*` and list
`nav.workflows` / `nav.searchDescription` as `SHELL_EXTRA_KEYS`, or accept enumerating all 14 `nav`
keys. The `TRASH_EXTRA_KEYS` shape is the precedent for the former.

**`IDENTICAL_TRANSLATION_ALLOWED` — currently empty** (`locale-parity.test.ts:376-381`):

```ts
/**
 * Keys whose translation is legitimately byte-identical to the en-US string in BOTH other
 * locales — proper nouns, brand names, units. Empty today. A key only belongs here after a
 * human decides the identical string is correct, not because a translation was skipped.
 */
const IDENTICAL_TRANSLATION_ALLOWED: string[] = []
```

Used only inside `untranslatedInBoth()` (`:497-504`), which iterates only the `REQUIRED_*` lists.
Adding `REQUIRED_SHELL_KEYS` makes it load-bearing: `admin.nav.pipelines`, `admin.nav.webhooks`,
`nav.workflows` must be added in the same change.

**The five shared assertion bodies to call, not copy** (`:476-532`): `missingIn`, `blankIn`,
`untranslatedInBoth`, `placeholderDrift`, `expectIdenticalKeySets`. Their header comment
(`:469-474`) states the rule explicitly: *"a contract is gated by calling them rather than by copying
an `it` block … passed separately — never concatenated — so a failure diff names which contract broke."*
Each existing `it()` block (`:535-604`) lists the four contracts as four separate `expect(...)` calls;
a fifth line per block is the whole edit.

**Pitfall 5 confirmed by direct read** (`:414-417`):

```ts
/** The `{placeholder}` tokens a next-intl message interpolates, sorted and de-duplicated. */
function placeholders(message: string): string[] {
  return [...new Set(message.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])].sort()
}
```

The regex cannot match `{count, plural, one {# …} other {# …}}` (comma, spaces, `#`), so
`placeholderDrift` `continue`s at line 513 (`if (expected.length === 0) continue`). The ICU wrapper
on `retryHintPartial` is **not** gated. Do not claim it is.

---

### `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` (test / source gate, modified)

**Analog:** itself. The edit is two array entries.

```ts
/** The four copy keys the report is required to render. */
const FAILURE_KEYS = [
  "failures.deleteTitle",
  "failures.reassignTitle",
  "failures.retryHint",
  "failures.dismiss",
]
```

(`bulk-failure-report-wiring.test.ts:88-94`) → add `"failures.retryHintPartial"` and
`"failures.prunedHint"`, and update the doc comment's count from "four" to "six".

---

### New source-scan gates (test, new — theme wiring, shell literals, bulk callers)

**Analogs, both to be read as one:**
`src/components/custom-fields/__tests__/source-scan.ts` (the helper) and
`src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` (the gate shape).
`src/app/trash/__tests__/trash-client-wiring.test.ts` is the multi-source variant.

**The helper's public surface — do not re-implement it** (`source-scan.ts:12, 20, 67-70, 78`):

```ts
import { readFileSync } from "node:fs"

/**
 * Remove `//` line comments and block comments, respecting string and template literals.
 *
 * String-awareness is not decoration: `href="https://..."` in a page source would otherwise be
 * truncated as a line comment, silently swallowing the rest of the line and any JSX prop on it.
 */
export function stripComments(source: string): string { … }

/** Read a repo-relative source file with comments stripped. */
export function readStrippedSource(path: string): string {
  return stripComments(readFileSync(path, "utf8"))
}

/**
 * Return the argument text of every `${callee}(...)` call in `source`, using string-aware brace
 * matching so a `)` inside a string literal cannot close the argument list early.
 */
export function callArguments(source: string, callee: string): string[] { … }
```

`source-scan.ts` is deliberately **not** named `*.test.ts` — its header says so (`:10`): *"Not a
`.test.ts`, so vitest's include glob does not try to run it."* Paths passed to `readStrippedSource`
are **repo-relative from cwd**, not `@/`-aliased.

**The gate's import + module-scope header** (`bulk-failure-report-wiring.test.ts:40-47`):

```ts
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import enUS from "@/messages/en-US.json"

const REPORT = readStrippedSource("src/components/bulk/bulk-failure-report.tsx")
const ALERT_PRIMITIVE = readStrippedSource("src/components/ui/alert.tsx")
const BULK_TYPES = readStrippedSource("src/lib/bulk/types.ts")
```

`globals: false` in `vitest.config.ts`, so `describe/expect/it` are **always explicitly imported**.
Sources are read once at module scope into SCREAMING_CASE consts. Message JSON is imported via the
`@/` alias (`resolveJsonModule` is on).

**The three-part gate skeleton every new gate must reproduce**
(`bulk-failure-report-wiring.test.ts:22-32` states the contract, `:131-159` and `:347-366` implement it):

```ts
const SOURCES: [string, string][] = [
  ["bulk-failure-report.tsx", REPORT],
  ["alert.tsx", ALERT_PRIMITIVE],
  ["types.ts", BULK_TYPES],
]

// ANTI-VACUITY 1 AND 2. These run before every negative assertion in this file, deliberately.
describe("the gate reads the right sources", () => {
  it("read all three sources", () => {
    for (const [name, source] of SOURCES) {
      expect(
        source.length,
        `${name} must have been read: a helper returning an empty string would satisfy every negative assertion in this file perfectly`
      ).toBeGreaterThan(0)
    }
  })

  it("found the report inside the alert primitive, as an unfilled destructive region", () => {
    expect(REPORT, '…').toContain('variant="destructive"')
  })
})

// ANTI-VACUITY 3. Both vocabulary tables, iterated, so a new idiom cannot sail through unasserted.
describe("the gate's own vocabulary", () => {
  it("finds every RECOGNISED token in the report", () => {
    for (const token of RECOGNISED) {
      expect(REPORT, `bulk-failure-report.tsx must still contain "${token}". …`).toContain(token)
    }
  })

  it("finds no LEFT-ALONE token in the report", () => {
    for (const token of LEFT_ALONE) {
      expect(REPORT.includes(token), `… must not contain "${token}". …`).toBe(false)
    }
  })
})
```

Requirements 1-3 are named in the file header (`:22-32`): **(1)** prove the files were read,
**(2)** prove it is the right file via known positive markers, **(3)** two iterated vocabulary tables
(`RECOGNISED` present / `LEFT_ALONE` absent).

**Two vocabulary tables, each with a why-comment** (`:96-129`):

```ts
/**
 * VOCABULARY TABLE 1 — RECOGNISED. What must be PRESENT in the report. Every entry is a decision
 * with no pure-function home, so its only proof is that it is still written down.
 */
const RECOGNISED = [ 'variant="destructive"', "AlertTitle", …, "onDismiss" ]

/**
 * VOCABULARY TABLE 2 — LEFT ALONE. What must be ABSENT. Each entry would break something silently
 * rather than loudly: …
 */
const LEFT_ALONE = [ ".slice(", "setTimeout", "setInterval", "aria-live", "bg-destructive", "@/lib/bulk/dispatch", "@/lib/trash/dispatch" ]
```

**Reusable regex constants shared across both existing gates** (`bulk-failure-report-wiring.test.ts:49-73`
and `trash-client-wiring.test.ts:26-41` — note they are duplicated verbatim across the two files,
which is the repo's accepted level of duplication for gate vocabulary):

```ts
/** Every colour the UI contract forbids on these surfaces, plus any raw hex literal. */
const FORBIDDEN_COLOURS = ["text-red-", "text-green-", "bg-red-", "bg-green-", "bg-white", "text-black"]
const HEX_LITERAL = /#[0-9a-fA-F]{3,6}/

/** A button that does not name its object, per the copy contract. */
const BARE_LABELS = [">Save<", ">Cancel<", ">Confirm<", ">OK<", ">Yes<", ">Apply<"]

/** The first non-comment token of a client module. */
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/

/** Anything that would make the report disappear without the user asking. */
const SELF_DISMISSAL = /setTimeout|setInterval/
```

`FORBIDDEN_COLOURS` is directly reusable by the shell-literal gate for C-1 (`text-red-`).

**Every `expect` carries a prose second argument explaining what breaks.** Not one bare assertion
exists in either gate. This is the single most consistent convention in the repo's test code.

**Mapping the three new gates onto this shape:**

| New gate | `readStrippedSource` targets | RECOGNISED candidates | LEFT_ALONE candidates |
|----------|------------------------------|-----------------------|-----------------------|
| theme wiring | `src/app/layout.tsx`, `src/components/user-menu.tsx` | `"next-themes"`, `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`, `suppressHydrationWarning`, `DropdownMenuRadioGroup`, `value="light"`, `value="dark"`, `value="system"`, `theme ?? "system"`, `text-destructive` | `setMounted`, `useEffect`, `text-red-`, `useMediaQuery` |
| shell literals | `admin-sidebar.tsx`, `nav-header.tsx`, `ui/dialog.tsx`, `ui/sheet.tsx`, `ui/alert-dialog.tsx` | `useTranslations("admin.nav")`, `t("workflows")`, `closeLabel`, `t("close")` | `>Workflows<`, `>Admin Panel<`, `>Back to App<`, `>Close<`, `"Audit Log"`, `"User Management"` — and for alert-dialog (S-3) `sr-only` + `Close` |
| bulk callers | the four caller files | `stillSelected`, `loadedIds.has(` / `renderedIds.has(`, `.filter(` | (per-file) re-selection idioms |

> **Comment-collision warning.** These gates strip comments before asserting, so prose in the
> *scanned* file is safe. But a `LEFT_ALONE` entry that names a token appearing in the **gate's own**
> plan document or in the scanned file's *code* (not comment) breaks it. The gate header's rule
> applies: reword, never weaken.

---

### `e2e/auth.setup.ts` + the e2e admin seed (test/setup + script, new)

**Analog A — the seed script shape:** `drizzle/seed-activity-types.ts` (only seed script in the repo).

```ts
/**
 * Seed script for default activity types
 * Run with: npm run db:seed-activities
 */

import { db } from "@/db"
import { activityTypes } from "@/db/schema"
import { eq } from "drizzle-orm"

const defaultTypes = [ … ]

async function seed() {
  console.log("Seeding default activity types...")

  for (const type of defaultTypes) {
    try {
      // Check if type already exists
      const existing = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.id, type.id),
      })

      if (!existing) {
        await db.insert(activityTypes).values(type)
        console.log(`✓ Created activity type: ${type.name}`)
      } else {
        console.log(`→ Activity type already exists: ${type.name}`)
      }
    } catch (error) {
      console.error(`✗ Failed to create activity type ${type.name}:`, error)
    }
  }

  console.log("Done!")
}

seed().catch(console.error)
```

What transfers: **idempotency by find-then-insert** (exactly what Wave 0 requires), the
`✓ / → / ✗` console vocabulary, top-level `seed().catch(console.error)`.

What does **not** transfer: the invocation. `"db:seed-activities": "tsx drizzle/seed-activity-types.ts"`
and **`tsx` is not installed** (not in `node_modules/.bin`, not on `PATH`). Also `@/db` throws at
import if `DATABASE_URL` is unset (`src/db/index.ts:5-7`) — which is simultaneously the natural
**dev-database guard** V-2 asks for:

```ts
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set")
}
```

**Analog B — the password hash:** `src/lib/password.ts:7-14` (use it, do not re-derive the params):

```ts
import * as argon2 from "argon2"

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  })
}
```

**Analog C — the users row shape:** `src/db/schema/users.ts:11-25`. The columns the seed must set
for a login to succeed:

```ts
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  name: text('name'),
  image: text('image'),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').default('member').notNull(),      // must be 'admin'
  status: userStatusEnum('status').default('pending_verification').notNull(),  // must be 'approved'
  locale: text('locale').default('en-US').notNull(),
  timezone: text('timezone').default('America/New_York').notNull(),
  …
})
```

`role` and `status` both default to values that would fail login/`/admin` — the seed must set
`role: 'admin'` and `status: 'approved'`, and `emailVerified` to a date (the login page maps
`email_not_verified` as a refusal reason, `login/page.tsx:71`).

**Analog D — the login form selectors** (`src/app/(auth)/login/page.tsx:105-160`):

```tsx
<Label htmlFor="email">Email</Label>
<Input id="email" type="email" placeholder="you@example.com" {...register("email")} … />
…
<Label htmlFor="password">Password</Label>
<Input id="password" type="password" {...register("password")} … />
…
<Checkbox id="rememberMe" … />
…
<Button type="submit" className="w-full" disabled={isLoading}>
  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Sign In
</Button>
```

`#email`, `#password` and a submit button labelled `Sign In` — **all three are hardcoded English**
(this page is not in the message catalog), so a Playwright selector on them is locale-independent.
Submission goes through `signIn("credentials", { …, redirect: false })` (`:59-64`) and the page then
navigates itself, so `auth.setup.ts` must wait for the post-login navigation rather than for a form
response.

**Recommendation for the invocation:** run the seed **from inside `auth.setup.ts`** (or a Playwright
`globalSetup`) rather than as an npm script. Playwright transpiles TypeScript itself, so no `tsx`
dependency is added; `DATABASE_URL` must be set to the host-mapped `localhost:5433` (the app's own
value points at `postgres:5432` inside the Docker network).

---

## Shared Patterns

### 1. Copy access — `useTranslations("<namespace>")` at the top of a client component

**Source:** `src/components/bulk/bulk-failure-report.tsx:51-52,72`
**Apply to:** `ui/dialog.tsx`, `ui/sheet.tsx`, `admin-sidebar.tsx`, the new mobile bar, `user-menu.tsx`

```tsx
import { useTranslations } from "next-intl"
…
const t = useTranslations("bulk")
```

Multiple namespaces → multiple bindings, named `t`, `tNav`, `tAuth`, `tCommon`
(`user-menu.tsx:25-26`, `global-search.tsx:38-39`, `nav-header.tsx:20-21`). Never one deep namespace
with dotted lookups.

### 2. Radix primitive wrapper — unified import, `data-slot`, `cn()`

**Source:** `src/components/ui/dialog.tsx:1-8, 34-48, 147-158`
**Apply to:** `ui/sheet.tsx` (new), any edit to `ui/command.tsx` / `ui/dialog.tsx`

Covered in full under § `ui/sheet.tsx`. The three invariants: `import { X as XPrimitive } from "radix-ui"`;
`data-slot="<kebab>"` on every wrapper; `className={cn("<base>", className)}` last-wins merge.

### 3. Responsive collapse — CSS variants only, never React state

**Source:** `src/components/nav-header.tsx:39` — `<nav className="hidden md:flex items-center gap-4">`
**Apply to:** `nav-header.tsx`, `global-search.tsx`, `admin/layout.tsx`, `admin-sidebar.tsx`

There is exactly one breakpoint idiom in the shell and it is a Tailwind variant. The repo contains
**no** `useMediaQuery` hook and no `window.innerWidth` state (grep-verified during this mapping).
`react-hooks/set-state-in-effect` is severity 2, which is why. `window.matchMedia` at *event time*
inside a handler (Research Pattern 4) is the only JS-side branch permitted.

### 4. Comment-as-contract — a decision without a pure-function home is written down at the site

**Source:** `bulk-failure-report.tsx:3-49`; `locale-parity.test.ts:4-16`; `vitest.rsc.config.ts:3-27`;
`kanban-board.tsx:146-153`; `admin-sidebar.tsx:35-38`
**Apply to:** every file this phase touches

The house rule, and its enforcement clause, from `bulk-failure-report-wiring.test.ts:11-13`:

```
 * THE CORRECT RESPONSE TO A COLLISION IS TO REWORD THE COMMENT, NEVER TO WEAKEN THE GATE. Loosening
 * a pattern, adding an exception, or deleting an assertion converts a real constraint into
 * decoration, which is the bug both of this repo's earlier source-gate analogs shipped.
```

Corollary this phase must honour twice: `admin-sidebar.tsx:35-38,44-45` and
`present.ts:279` (`THIS PATH SHOULD BE UNREACHABLE`) both carry justifications that this phase makes
false. **Rewrite them; do not leave them and do not silently delete them.**

### 5. Assertion messages — every `expect` explains what breaks

**Source:** `bulk-failure-report-wiring.test.ts` (63 assertions, 0 bare)
**Apply to:** every new gate and every new Playwright expect

```ts
expect(
  REPORT,
  "the list must carry max-h-48: without a height bound, forty failures grow the page and push the fixed action bar out of reach"
).toContain("max-h-48")
```

Research Example 4's Playwright assertion follows the same shape
(`expect(scrollWidth, \`${route.path} @${locale}: scrollWidth … > clientWidth …\`)`), which is why it
reads as native to this repo.

### 6. Named exports, no default exports, outside `src/app/`

**Source:** every component read this session — `export function BulkFailureReport(…)`,
`export function AdminSidebar()`, `export function NavHeader({ user })`, `export function UserMenu({ user })`
**Apply to:** `ui/sheet.tsx`, the new mobile bar, `search-results.tsx`

Default exports appear **only** in `src/app/**` route files (`layout.tsx`, `page.tsx`) and in the
root configs (`vitest.config.ts`, `eslint.config.mjs`, `i18n/request.ts`). `playwright.config.ts`
belongs in the second group and takes `export default defineConfig({…})`.

### 7. Ignore-file layout

**Source:** `.gitignore` / `.dockerignore` (both read in full)
**Apply to:** the Wave 0 ignore additions

`.gitignore` uses `# Section` headers with leading-slash anchored paths (`/coverage`, `/.next/`,
`/build`) and ends with three ad-hoc trailing entries (`.planning`, `/.cocoindex_code/`,
`.playwright-mcp/`). Note it **already** has `.playwright-mcp/` — a different directory from
`/playwright-report/`; do not assume the entry exists.
`.dockerignore` uses `# Title-Case Section` headers and **unanchored** names (`node_modules`,
`.next`, `coverage`, `.planning`). Add `e2e`, `playwright.config.ts`, `playwright-report`,
`test-results` under a new `# E2E` section, unanchored, matching that file's style.

### 8. Binary invocation — `node_modules/.bin`, never `npx`

**Source:** `package.json:5-16` — `"lint": "eslint"`, `"typecheck": "tsc --noEmit"`,
`"test": "vitest run && vitest run --config vitest.rsc.config.ts"`
**Apply to:** every plan task's command

Zero occurrences of `npx` in `package.json`. Plan tasks should use `./node_modules/.bin/<tool>`
(research-recommended and unambiguous) and any new script should be a bare binary name.

---

## No Analog Found

Files with no close match in the codebase. The planner should use `45-RESEARCH.md` § Code Examples
4-5 and § Pattern 8 as the source instead, and treat the conventions in § Shared Patterns above as
the local dialect to write them in.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `e2e/deals-drag.spec.ts` | test (e2e) | event-driven (pointer) | No browser-driving test of any kind exists. `@dnd-kit/core`'s `PointerSensor` is configured at `kanban-board.tsx:313-322` (`activationConstraint: { distance: 5 }`) but nothing in the repo drives it. Research § Pattern 8 + Code Example 5 are the only source. |
| `e2e/viewport-320.spec.ts` | test (e2e) | batch / matrix | No layout-measuring test exists; `vitest.config.ts` sets `environment: 'node'` and there is no DOM environment at all. The *shape* (loop locales × routes, table-driven) can be taken from `locale-parity.test.ts:534-618`, but nothing about the measurement can. |
| `e2e/auth.setup.ts` | test / setup | request-response | No test in the repo authenticates. The login-form selectors (`login/page.tsx:105-160`) and the seed shape (`drizzle/seed-activity-types.ts`) are the only in-repo inputs; the `storageState` + `setup`-project mechanics have no precedent. |
| The admin `Sheet` drawer composition | component (client) | event-driven | No `Sheet` consumer exists because `ui/sheet.tsx` does not exist. The closest structural analog is a `Dialog` consumer, but the drawer's specific composition (`SheetContent side="left" className="w-64 gap-0 p-0"`, `aria-describedby={undefined}`, close-on-navigate) comes from UI-SPEC R-2, not from the repo. |

---

## Metadata

**Analog search scope:** `src/app/`, `src/components/`, `src/lib/`, `src/messages/`, `src/db/`,
`src/i18n/`, `drizzle/`, `scripts/`, repo-root configs (`vitest*.config.ts`, `tsconfig.json`,
`eslint.config.mjs`, `package.json`, `.gitignore`, `.dockerignore`, `.github/workflows/ci.yml`)

**Files read in full or in cited ranges:** 34 —
`src/app/layout.tsx`, `src/app/admin/layout.tsx`, `src/app/(auth)/login/page.tsx`,
`src/app/organizations/data-table.tsx`, `src/app/people/data-table.tsx`,
`src/app/activities/activities-client.tsx`, `src/app/deals/kanban-board.tsx`,
`src/app/trash/__tests__/trash-client-wiring.test.ts`, `src/components/nav-header.tsx`,
`src/components/user-menu.tsx`, `src/components/admin-sidebar.tsx`,
`src/components/global-search/global-search.tsx`, `src/components/ui/dialog.tsx`,
`src/components/ui/alert-dialog.tsx`, `src/components/ui/command.tsx`,
`src/components/ui/button.tsx`, `src/components/bulk/bulk-failure-report.tsx`,
`src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts`,
`src/components/custom-fields/__tests__/source-scan.ts`,
`src/components/timeline/audit-entry.tsx`, `src/lib/audit/present.ts`, `src/lib/password.ts`,
`src/db/index.ts`, `src/db/schema/users.ts`, `src/i18n/request.ts`, `src/i18n/config.ts`,
`src/messages/locale-parity.test.ts`, `src/messages/en-US.json` (namespace inspection),
`vitest.config.ts`, `vitest.rsc.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `package.json`,
`drizzle/seed-activity-types.ts`

**Scans run:** `grep` for `BulkFailureReport`, `loadedIds|renderedIds`, `@radix-ui/react-`,
`from "radix-ui"`, `readStrippedSource`, `*wiring*`; `ls` of `src/components/ui/`,
`node_modules/.bin`, `drizzle/`, `scripts/`

**Pattern extraction date:** 2026-08-18
