# Phase 43: Type Safety & Deployment Docs — Research

**Researched:** 2026-08-23
**Domain:** TypeScript module augmentation (TanStack Table v8) + PostgreSQL 16 backup/restore + Docker volume persistence
**Confidence:** HIGH — every recommendation below was executed against this repo and this running stack, not inferred

## Summary

**A (POLISH-01) is settled by experiment, not by argument.** `@tanstack/react-table@8.21.3` declares
`TableMeta<TData>` as an empty **interface** (`node_modules/@tanstack/table-core/build/lib/types.d.ts:31`),
which makes it augmentable. Augmenting it through `declare module "@tanstack/react-table"` works despite
the `export * from '@tanstack/table-core'` re-export — verified by running `npx tsc --noEmit`. With a
single ~13-line `src/types/tanstack-table.d.ts` and all 14 `@ts-expect-error` lines deleted, **`tsc --noEmit`
exits 0 with no other file in the repo modified** (measured). This removes the casts rather than
substituting a different cast, satisfies "one shared `TableMeta` interface" using the library's own
declaration, and leaves `TrashTableMeta` working untouched provided `renderActions?` is one of the
augmented members (proven necessary — see A2).

**B (POLISH-02) has one non-obvious landmine and it is not the `db`-vs-`postgres` typo.** The dump is
taken as role `pipelite`; restoring it into a deployment whose `POSTGRES_USER` differs produces **45
`ALTER … OWNER TO pipelite` failures and `pg_restore` exit code 1** — while still restoring all data
correctly. `--no-owner --no-privileges` reduces that to exit 0 / 0 errors with byte-identical row
counts (both measured, against a throwaway `postgres:16-alpine` cluster whose superuser was `appuser`).
Custom format (`-Fc`) is 34,299,898 bytes against 121,722,344 for plain SQL — 3.55× smaller, 9s to
dump, ~10-20s to restore. `drizzle.__drizzle_migrations` restores intact, so the entrypoint's
unconditional `npx drizzle-kit migrate` is a no-op after a restore (verified: 12 rows,
`max(created_at)=1787441440793`, identical to live).

**C (D-3) is worse than CONTEXT.md measured, and the docs already describe a fix that would silently
fail three separate ways.** The app does not write to `/app/uploads`; `UPLOAD_DIR` defaults to
**`/tmp/uploads`** (`src/app/api/upload/route.ts:12`) and `UPLOAD_DIR` is not in the compose `app`
environment list, so it is empty inside the running container (verified). Meanwhile
`docs/admin/deployment/docker.md:207-225` already documents `uploads:/app/uploads` on a service called
`db`. Even corrected to `app`, that snippet would not work: `/app/uploads` does not exist in the image,
so Docker creates the fresh named volume **root:root 0755**, and the container runs as `USER nextjs`
(uid 1001) — I measured `touch: Permission denied`. The fix therefore needs **three** coordinated
changes (volume + `UPLOAD_DIR` env + `mkdir`/`chown` in the Dockerfile), and a plan that ships only the
volume will produce a container that cannot upload at all, which is strictly worse than today.

**Primary recommendation:** Augment `TableMeta` in one `src/types/tanstack-table.d.ts`; make the
uploads fix a three-part atomic change (compose volume + `UPLOAD_DIR` + Dockerfile `mkdir`/`chown`)
proven by the `curl` + Playwright-cookie upload probe validated below; write the runbook around
`pg_dump -Fc` and `pg_restore --no-owner --no-privileges`, and drill it against
`pipelite_restore_drill`.

---

<user_constraints>
## User Constraints (from 43-CONTEXT.md)

### Locked Decisions

**D-1 — The two test-file suppressions STAY.** The repo has 16 `@ts-expect-error` occurrences, not 14.
`src/lib/views/__tests__/actions.test.ts:343` and `src/lib/audit/export-events-live.test.ts:149` are
deliberate negative tests. **Any gate asserting a repo-wide count of zero must exclude test files, or
it will force a regression.** Phase 42 shipped several gates that could not fail; do not add one that
fails for the wrong reason.

**D-2 — Copy the existing in-repo pattern; do not invent one.** `src/app/trash/trash-columns.tsx`
implements criterion 2 with zero suppressions (interface at :36, cast at :305, typed consumer at
`trash-table.tsx:295`). Replicate this shape. The open question the plan must settle is whether the
three tables share ONE interface or take one generic interface parameterised per row type — prefer
whatever keeps each consumer's required members honest while still being one declaration.

**D-3 — Uploads are ephemeral today. FIX IT, and prove it with a real file.** Add a named volume for
uploads to `docker-compose.yml`, document backup and restore for **both** the database and the files,
and **verify by experiment**: upload a real file, rebuild the container, confirm the file survives.
Documentation alone is not acceptance here.

**D-4 — POLISH-02 ships a dedicated runbook covering BOTH deployment paths.** Create
`docs/admin/backup-restore.md` as the single authoritative procedure, covering Docker and bare-metal.
Replace the existing block in `docs/admin/deployment/docker.md` with a pointer to it.
`docs/admin/deployment/bare-metal.md:359`'s `**Backups scheduled**` checklist item points at the
runbook too. **The existing documented procedure is BROKEN and must be fixed, not copied.**

**D-5 — The restore drill targets a SCRATCH database. Never the live one.** Create and restore into a
throwaway database (e.g. `pipelite_restore_drill`), verify row counts or a checksum against the
source, then drop it. **Under no circumstances restore over `pipelite`.** State the scratch database's
name in the plan and drop it in the same task that creates it.

**D-6 — Fold in Phase 42's one deferred cosmetic item.** `src/lib/import/pipedrive-api-client.ts:42`
is `log.warn("Pipedrive API", …)`. Normalize to `pipedrive-api`. One-line change plus whatever
assertion references it. Keep it a separate small task so its diff stays legible.

### Claude's Discretion

- The exact shape of the shared meta type (D-2's open question) — answered in § A below.
- The scratch database name and drill mechanics (D-5) — answered in § B5 below.

### Deferred Ideas (OUT OF SCOPE)

- **A lockfile-desync guard.** Out of scope for POLISH-01/02.
- **Normalizing the remaining historical `Dockerfile:24` mentions** in `heartbeat.ts:14`,
  `scan-cleanup.ts:27`, `scan-cleanup.test.ts:11` — correct as written, do not "fix" them.
- **An `app` healthcheck** — explicitly deferred by `42-CONTEXT.md` A8. **Do not add one** while
  editing `docker-compose.yml` for the uploads volume.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POLISH-01 | The codebase has zero `@ts-expect-error` suppressions — a shared typed `TableMeta` interface replaces all 14 in `admin/pipelines/columns.tsx`, `organizations/columns.tsx`, `people/columns.tsx` | § A — module augmentation verified to reach zero with `tsc --noEmit` exit 0; exact file contents given in A5; the real suppressed error identified as TS2339 in A4 |
| POLISH-02 | Operator can follow documented backup and restore procedures for a self-hosted deployment | § B — command pair executed against the live stack and a foreign-role cluster; § C — the uploads half, without which a restore yields dangling file references |
</phase_requirements>

## Project Constraints (from project memory / global CLAUDE.md)

There is **no `./CLAUDE.md`** in this repo (verified: `ls CLAUDE.md` → no such file). The binding
constraints come from the user's global instructions and the project memory file:

| Constraint | Consequence for this phase |
|---|---|
| Always use Docker, never a local dev server | The D-3 experiment and the B drill both run through `docker compose`. Never `npm run dev`. |
| `docker` needs **no** `sudo` (user is in the `docker` group) | Verified again this session — every command in this document ran without sudo. **Never embed a password**; a leak already happened once in this repo. |
| `docker compose restart` runs the OLD image | The D-3 survival test must use `docker compose up -d --build`. `restart` would produce a vacuous pass. |
| `.planning` is gitignored but tracked | Commit this file with `git add -f <file>`, never `git add .planning`. |
| The rtk hook elides redirected output for some commands | Confirmed harmless for `docker compose exec … > file` (tested: 34,299,898-byte dump written intact, `file` reports a valid PostgreSQL custom dump). Use the `Write` tool for authoring docs, not heredocs. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Table row-action callbacks (`onEdit`/`onDelete`/`onSetDefault`) | Browser / Client | — | All five call sites are `"use client"`; the callbacks close over `useState`/`useTransition` in the data-table component. Nothing crosses the RSC boundary. |
| The shared `TableMeta` type declaration | Build-time types only | — | A `.d.ts` module augmentation emits no runtime code and is erased by the bundler. Correct tier for a contract with no behaviour. |
| Upload byte storage | Filesystem / Volume | CDN / S3 (when `FILE_STORAGE=s3`) | `src/app/api/upload/route.ts:92-98` writes with `fs/promises`; persistence is an infrastructure concern (Docker volume), not application code. |
| Upload path configuration | Container runtime env | Image build (directory + ownership) | `UPLOAD_DIR` is read at module scope (`route.ts:12`); the *writability* of that path is decided in the image, before `USER nextjs`. Two tiers must agree or the feature fails. |
| Database backup / restore | Database / Storage | Operator runbook (docs) | `pg_dump`/`pg_restore` run inside the `postgres` service. The app tier is uninvolved and must not be asked to do it. |
| Migration-state consistency after restore | Database / Storage | Container entrypoint | `drizzle.__drizzle_migrations` lives in the dump; `docker-entrypoint.sh` runs `drizzle-kit migrate` on every start and must find nothing to do. |

---

# A. The shared `TableMeta` type (POLISH-01, criterion 2)

## A0. Installed version — the thing that actually matters

| Fact | Value | Source |
|---|---|---|
| Declared range | `"@tanstack/react-table": "^8.21.3"` | `package.json:30` [VERIFIED: file read] |
| Installed `@tanstack/react-table` | **8.21.3** | `node_modules/@tanstack/react-table/package.json` [VERIFIED] |
| Installed `@tanstack/table-core` | **8.21.3** | `node_modules/@tanstack/table-core/package.json` [VERIFIED] |

## A1. Does 8.21.3 support module augmentation of `TableMeta`? — YES, verified two ways

**Declaration form (the augmentability precondition):**

```
node_modules/@tanstack/table-core/build/lib/types.d.ts:31
  export interface TableMeta<TData extends RowData> {
  }
```

It is an `interface`, and it is **empty**. Both matter:
- `interface` → declaration merging applies. A `type` alias would not be augmentable, and this is the
  check the phase brief asked for. [VERIFIED: node_modules read]
- Empty → this is why `meta: { onEdit, onDelete, … }` compiles today with no error. TypeScript performs
  no excess-property check against the empty object type, so every meta literal in the repo is
  currently **completely unchecked**. That is the real defect; the 14 suppressions are only its
  visible symptom.

**The re-export concern, resolved empirically.** `node_modules/@tanstack/react-table/build/lib/index.d.ts`
contains `export * from '@tanstack/table-core';` — `TableMeta` is not declared in the `@tanstack/react-table`
module, only re-exported from it. It is therefore not obvious that `declare module "@tanstack/react-table"`
merges into the original interface rather than shadowing it. **It merges.** Measured this session:

```bash
# probe file src/types/PROBE-tanstack.d.ts declaring onEdit/onDelete/refresh,
# with the 4 suppressions in organizations/columns.tsx deleted
$ npx tsc --noEmit
src/app/admin/pipelines/columns.tsx(92,9): error TS2578: Unused '@ts-expect-error' directive.
src/app/admin/pipelines/columns.tsx(94,9): error TS2578: Unused '@ts-expect-error' directive.
src/app/admin/pipelines/columns.tsx(199,7): error TS2578: Unused '@ts-expect-error' directive.
src/app/admin/pipelines/columns.tsx(201,7): error TS2578: Unused '@ts-expect-error' directive.
src/app/admin/pipelines/data-table.tsx(117,7): error TS2353: Object literal may only specify known properties, and 'onSetDefault' does not exist in type 'TableMeta<Pipeline>'.
src/app/people/columns.tsx(113,9): error TS2578: Unused '@ts-expect-error' directive.
src/app/people/columns.tsx(115,9): error TS2578: Unused '@ts-expect-error' directive.
src/app/people/columns.tsx(223,7): error TS2578: Unused '@ts-expect-error' directive.
src/app/people/columns.tsx(225,7): error TS2578: Unused '@ts-expect-error' directive.
src/app/trash/trash-table.tsx(355,5): error TS2559: Type 'TrashTableMeta' has no properties in common with type 'TableMeta<TrashRow>'.
```

Organizations' four TS2339 errors are **gone** — the augmentation reached the type. Everything else in
that output is signal, not noise, and each line is a planning constraint:

| Observed error | What it proves | Planning consequence |
|---|---|---|
| `TS2578` × 8 on pipelines/people | The augmentation is **global and instant**. The moment it lands, every remaining suppression becomes an *error* for being unnecessary. | **The augmentation and all 14 deletions must land in a single atomic change.** A wave that adds the type in task 1 and deletes suppressions in task 2 has a red `tsc` between them, which breaks the tdd/commit-per-task rhythm and any per-task typecheck gate. |
| `TS2353` on `pipelines/data-table.tsx:117` | Excess-property checking now applies to `meta:` literals. `onSetDefault` and `settingDefaultId` were silently unchecked; now they must be declared. | The augmented interface must be a **superset of every key any table passes**, or the phase turns 14 suppressions into new compile errors elsewhere. Full inventory in A3. |
| `TS2559` on `trash-table.tsx:355` | An all-optional non-empty interface is a **weak type**. `TrashTableMeta` (`{ renderActions }`) shares no member with it, so the assignment is rejected. | `renderActions?` **must** be one of the augmented members, or Phase 37's trash table breaks and this phase has to edit it. See A2. |

## A2. Does augmentation satisfy "ONE shared interface" better? — Yes, and it forces the `TrashTableMeta` question closed

**Recommendation: use module augmentation.** It is better than a hand-rolled interface plus casts on
four independent grounds, in descending order of importance:

1. **It removes the cast instead of relabelling it.** The trash pattern (D-2) still contains
   `table.options.meta as TrashTableMeta | undefined` — an unchecked assertion. If the consumer passes
   the wrong shape, the cast lies and the column reads `undefined` at runtime. Augmentation makes
   `table.options.meta` correctly typed with **no assertion anywhere**, so both ends are checked by the
   same declaration. The columns file becomes `table.options.meta?.onEdit` with no comment and no cast.
2. **It is the mechanism the library ships for exactly this.** `TableMeta` is declared empty *in order
   to be augmented*; that is the only reason an empty exported interface exists in a type definition file.
3. **It checks the producer, not just the consumer.** The `TS2353` above is a capability the trash
   pattern does not have: today nothing verifies that a data-table's `meta:` literal matches what its
   columns read. That is a real latent bug class (rename a callback in one file, the other silently
   reads `undefined`), and it is closed for free.
4. **It is literally one declaration** — criterion 2's words — and it is the *library's* declaration,
   so a fourth table gets it with no import.

**What happens to `trash-columns.tsx`'s `TrashTableMeta`:** it gets **folded in — mandatorily, not
optionally.** `renderActions?: (row: TData) => ReactNode` must appear in the augmented interface or
`trash-table.tsx:355` fails with the TS2559 shown above. Once it does, `TrashTableMeta` and its cast at
`trash-columns.tsx:305` still compile **unchanged** (verified: the full-shape run below is exit 0 with
zero edits to any trash file), because `TrashTableMeta` remains assignable to the augmented
`TableMeta<TrashRow>` and the cast direction is still valid.

So the phase has a choice, and it should make it explicitly rather than by omission:

- **Recommended (Tier 1):** add `renderActions?` to the augmentation, leave both trash files
  completely untouched. Zero risk to Phase 37's gates. The mild inconsistency — trash keeps a local
  `TrashTableMeta` alias while the three retyped tables read the augmented type directly — is worth
  it, and is smaller than it looks: `TrashTableMeta` is now a *narrowing of the one shared interface*,
  not a competing declaration.
- **Optional (Tier 3, only if the phase wants full consistency):** redefine
  `TrashTableMeta = Required<Pick<TableMeta<TrashRow>, "renderActions">>` and delete the cast at
  `trash-columns.tsx:305`. This makes the codebase have exactly one meta declaration. It edits two
  Phase 37 files that carry their own source-scan gates, so it must be its own task with the full
  suite run after it. **Do not bundle this with Tier 1.**

## A3. The concrete shape — and the trade-off, named

**Full inventory of every `meta` key any table produces or consumes** (grep-verified across `src/`):

| File:line | Keys passed / read | Row type |
|---|---|---|
| `src/app/organizations/data-table.tsx:410` | `refresh`, `onEdit`, `onDelete` | `Organization` |
| `src/app/people/data-table.tsx:350` | `refresh`, `onEdit`, `onDelete` | `Person` |
| `src/app/admin/pipelines/data-table.tsx:114` | `onEdit`, `onDelete`, `onSetDefault`, `settingDefaultId` | `Pipeline` |
| `src/app/admin/users/data-table.tsx:41` | `refresh` | `AllUser` |
| `src/app/trash/trash-table.tsx:355` | `renderActions` (via typed const at :295) | `TrashRow` |
| `src/app/admin/users/columns.tsx:68,248` | reads `refresh` via inline cast `as { refresh: () => void } \| undefined` | `AllUser` |
| `src/app/trash/trash-columns.tsx:305` | reads `renderActions` via cast to `TrashTableMeta` | `TrashRow` |

Note `settingDefaultId` is `string | null` (`pipelines/data-table.tsx:40`
`useState<string | null>(null)`) — a **value**, not a callback, and it is passed but never read by the
columns file. It still must be declared or `TS2353` fires.

**The trade-off, stated plainly, because it is the one thing that could make this a net loss:**

A single interface shared by every table in the app **cannot have required members.** If
`onEdit` were required, `admin/users/data-table.tsx:41` (`meta: { refresh }`) would fail with TS2741.
So every augmented member is optional, which means the columns files read `meta?.onEdit` and get
`((row) => void) | undefined`. **On its own that trades 14 suppressions for unenforced callbacks —
exactly the silent-`undefined` risk the brief warns about.** It is not a regression (today those reads
are `any`, which is strictly worse), but it is not the win criterion 2 is asking for either.

**The fix, and it is cheap: enforce required members at the consumer, using the same one declaration.**

```ts
// One declaration, narrowed per consumer. No second interface.
type OrganizationTableMeta = Required<Pick<TableMeta<Organization>, "onEdit" | "onDelete" | "refresh">>
type PipelineTableMeta    = Required<Pick<TableMeta<Pipeline>, "onEdit" | "onDelete" | "onSetDefault" | "settingDefaultId">>
```

then in the data-table: `const meta: OrganizationTableMeta = { … }` and `meta,` in the options — the
identical shape `trash-table.tsx:295` already uses, which is what D-2 asked for.

**Verified non-vacuous.** I built this variant on `organizations/data-table.tsx`, confirmed `tsc`
exit 0, then deleted one member and got:

```
src/app/organizations/data-table.tsx(395,9): error TS2741: Property 'onDelete' is missing in type
'{ refresh: () => void; onEdit: (org: Organization) => void; }' but required in type
'Required<Pick<TableMeta<Organization>, "refresh" | "onEdit" | "onDelete">>'.
```

So the required-member contract genuinely fails when violated. That is the Phase 42 lesson applied:
a gate that cannot fail is not a gate.

**Recommended decision for the planner:**

| Tier | Change | Files touched | Verified | Risk |
|---|---|---|---|---|
| **1 — required** | `src/types/tanstack-table.d.ts` augmentation + delete all 14 suppressions | 4 (1 new + 3 columns) | `tsc --noEmit` exit 0, `eslint` exit 0 | Very low — no data-table, no trash, no test-scanned file changes |
| **2 — strongly recommended** | Add `Required<Pick<…>>` consumer contracts in the three data-tables | +3 | exit 0; negative test TS2741 confirmed | Low, but touches files read by 7 source-scan test files — run `npm test` |
| **3 — optional** | Fold `TrashTableMeta` into the shared declaration, drop its cast | +2 | not attempted | Touches Phase 37 gated files — separate task or defer |

Tier 1 alone satisfies criteria 1 and 2 literally. Tier 2 is what makes criterion 2 *worth* satisfying.
Ship both, in that order, as separate tasks.

## A4. What each of the 14 suppressions is actually suppressing — measured

Each one is load-bearing (as the brief predicted; a no-op `@ts-expect-error` is itself `ts(2578)`, which
I also observed above). I deleted the four in `organizations/columns.tsx` and ran the typechecker:

```
$ npx tsc --noEmit
TypeScript: 4 errors in 1 files
src/app/organizations/columns.tsx (4 errors)
  L102: TS2339 Property 'onEdit' does not exist on type 'TableMeta<Organization>'.
  L103: TS2339 Property 'onDelete' does not exist on type 'TableMeta<Organization>'.
  L202: TS2339 Property 'onEdit' does not exist on type 'TableMeta<Organization>'.
  L203: TS2339 Property 'onDelete' does not exist on type 'TableMeta<Organization>'.
```

**The error is `TS2339 — Property '<name>' does not exist on type 'TableMeta<TRow>'`, all 14, without
exception.** It is the direct consequence of `TableMeta` being declared empty. Substituting the row
type per file: `TableMeta<Organization>` (4), `TableMeta<Person>` (4), `TableMeta<Pipeline>` (6).

**Structural detail the plan needs and CONTEXT.md's line table does not make explicit:** the two
clusters per file are **two separate column definitions**, not one used twice.

| File | ~line 100 cluster | ~line 200 cluster |
|---|---|---|
| `organizations/columns.tsx` | inside `export function useColumns()` (:30) | inside `export const columns` (:135) |
| `people/columns.tsx` | inside `useColumns()` (:33) | inside `columns` (:146) |
| `admin/pipelines/columns.tsx` | inside `useColumns()` (:29) | inside `columns` (:139) |

The second is introduced by the comment `// Keep legacy export for backward compatibility (without
translations)` and is a near-verbatim copy with hardcoded English headers. **`useColumns` from these
three modules is imported nowhere** (grep across `src/` and `e2e/`: the only hits are its own
declarations). The rendered tables use the legacy `columns` const —
`organizations/page.tsx:7`, `people/page.tsx:7`, `admin/pipelines/page.tsx:5` all
`import { columns } from "./columns"`.

**Do not act on that.** Deleting the dead `useColumns` exports would remove 7 of the 14 suppressions
"for free" and is tempting, but (a) POLISH-01's text says the suppressions are *replaced by a shared
typed interface*, not deleted with their host code, (b) the duplicate is the untranslated-header debt
Phase 45 worked on and deleting the translated variant points the wrong way, and (c) it is a scope
expansion with no requirement behind it. **Retype both clusters.** Flag the duplication as a backlog
item instead; it is a genuine find and the phase summary is the right place for it.

## A5. Exact recommended file (verified to produce `tsc` exit 0 with 14 deletions)

```ts
// src/types/tanstack-table.d.ts
import type { ReactNode } from "react"
import type { RowData } from "@tanstack/react-table"

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends RowData> {
    onEdit?: (row: TData) => void
    onDelete?: (row: TData) => void
    onSetDefault?: (row: TData) => void
    settingDefaultId?: string | null
    refresh?: () => void
    renderActions?: (row: TData) => ReactNode
  }
}
```

Measured with exactly this content and all 14 suppressions removed:

```bash
$ npx tsc --noEmit
TypeScript compilation completed
TSC_EXIT=0
$ npx eslint src/types/tanstack-table.d.ts
ESLINT_EXIT=0
```

Notes the plan should carry:
- **`src/types/` is the established home** — `src/types/next-auth.d.ts:4` and
  `src/types/react-server-dom-webpack.d.ts:15` are the two existing `declare module` precedents.
- **`.d.ts` is correct, not a shortcut.** The augmentation has no runtime component. `tsconfig.json`'s
  `include` is `**/*.ts`, so it is picked up; `eslint.config.mjs` ignores only `next-env.d.ts`, so it is
  linted, and it lints clean (measured above — `TData` is used, so no unused-type-param warning).
- **Generic, not flat.** `(row: TData) => void` means `Table<Pipeline>`'s `meta.onEdit` is typed
  `(row: Pipeline) => void` automatically. A non-generic flat interface with `(row: unknown)` would
  compile but would hand every consumer an unusable parameter — that is the alternative to reject.
- `next.config.ts` sets no `typescript.ignoreBuildErrors`, so `npm run build` (and therefore
  `docker compose build`) type-checks this too. `COPY . .` in the builder stage picks the file up.

## A6. Interaction with the existing source-scan gates — checked, safe

`src/components/bulk/__tests__/select-wiring.test.ts` reads `organizations/columns.tsx` and
`people/columns.tsx` as text and calls them "the two static column modules this phase is required NOT
to have touched" (:51-52, :962-985). Phase 43 **does** touch them, so I read the assertions:

- `:420-430` — each stripped source `.length > 500` (anti-vacuity). Retyping does not shrink them.
- `:965-985` — each source must `toContain("ColumnDef")` and must **not** contain `useSelectColumn`,
  `components/bulk`, `components/ui/checkbox`, or `rowSelection`.

**All four negative tokens stay absent under the recommended change**, and `ColumnDef` stays present.
So the gate remains green. **One trap:** do not put the shared meta type anywhere under
`src/components/bulk/`, and do not name anything in these files after those tokens — an import path
containing `components/bulk` would turn that gate red for a reason unrelated to what it guards.
`src/types/tanstack-table.d.ts` needs no import in the columns files at all, which sidesteps this
entirely — a further argument for augmentation over an imported interface.

Six other source-scan test files read the three data-tables
(`duplicate-warning-wiring.test.ts`, `bulk-caller-wiring.test.ts`, `views-bar-mount.test.ts`,
`record-dialog-note-failure.test.ts`, `toolbar-wiring.test.ts`, `view-escape-call-sites.test.ts`).
None asserts on `meta`. Tier 2 must still run the full suite.

---

# B. PostgreSQL 16 backup/restore that works for a real operator (POLISH-02, criterion 3)

**Environment, re-verified this session:**

| Fact | Value |
|---|---|
| Server version | `16.13` (`postgres:16-alpine`) |
| `pg_dump` version in container | `16.13` |
| Compose services | `app`, `postgres`, `mailhog` — **no `db`** |
| Credentials | `POSTGRES_USER=pipelite`, `POSTGRES_DB=pipelite` (from `.env`) |
| Database size | 228 MB, 36 tables in `public` + 1 in `drizzle` |
| Extensions | `pg_trgm 1.6`, `unaccent 1.1`, `plpgsql 1.0` |
| Custom routines in `public` | 38 (incl. `dedup_norm_org`, `dedup_norm_person`, `immutable_unaccent`) |
| Indexes / constraints in `public` | 81 / 83 |
| Compose project name | `pipelite` → volumes are named `pipelite_<volume>` |

## B1. Plain SQL vs custom format — use `-Fc`

**Measured, same database, same moment:**

| Format | Size | Dump time |
|---|---|---|
| Plain SQL (`pg_dump … pipelite`) | 121,722,344 bytes | — (CONTEXT.md measurement, reconfirmed as the default path) |
| **Custom (`-Fc`)** | **34,299,898 bytes** | **9.0 s** |

3.55× smaller with zlib compression built in, and it buys three things plain SQL cannot:

1. **`--clean --if-exists` restores are idempotent.** Measured: re-running
   `pg_restore --clean --if-exists --no-owner --no-privileges` over an already-populated database →
   **exit 0, 0 errors, row count unchanged (46,054 organizations)**. The same restore *without*
   `--clean` → **exit 1, 193 errors**. Plain SQL through `psql` has no equivalent; it emits
   `already exists` errors and `psql` keeps going by default, leaving a half-applied schema and an
   exit status the operator cannot trust.
2. **Selective restore.** `pg_restore -l` / `-L` lets an operator recover one table. Impossible from a
   flat `.sql` without hand-editing 121 MB.
3. **`-j` parallel restore.** See below — real, but conditional.

**Is `--clean --if-exists` needed?** For the recommended procedure, **no — and it should not be the
headline command.** The runbook should restore into a *freshly created empty database*, where
`--clean` has nothing to drop. Document `--clean --if-exists` only as the "restore over an existing
database" variant, with the reason it exists (idempotence) and the reason it is second choice (it
issues `DROP` statements against a live database; if the operator has the target name wrong, `--clean`
is what turns a mistake into data loss). This ordering is what keeps D-5's spirit in the docs, not just
in the drill.

**Is `-j` worth it?** Marginally, and it has a sharp edge. Measured: `-j 4` restoring from a file
inside the container took **20.1 s**; a single-threaded restore streaming from host stdin took
**9.9 s**. At 228 MB the fork/connect overhead dominates, so `-j` buys nothing at this size. Worse, it
is **incompatible with the streaming form** the runbook wants:

```
$ docker compose exec -T postgres pg_restore -U pipelite -d pipelite_restore_drill -j 4 … < dump
pg_restore: error: parallel restore from standard input is not supported
EXIT=1
```

**Recommendation: omit `-j` from the runbook's primary commands.** Mention it once, in a note, as
"worth trying for databases in the tens of GB, and only when the dump file is inside the container
(`docker compose cp` first) — parallel restore cannot read stdin." Getting this wrong is exactly the
kind of copy-paste failure the phase exists to eliminate.

**What breaks with a different database name?** Nothing structural — a custom-format dump carries no
`CREATE DATABASE` and no database name is baked into the object DDL, so restoring `pipelite` into
`pipelite_restore_drill` worked with full parity (verified below). The operator's `DATABASE_URL` must
of course name the new database. **A different *role* name is a different story — see B2.**

## B2. Ownership and roles — the actual most-common self-hoster failure, measured

Test method: throwaway `postgres:16-alpine` container with `POSTGRES_USER=appuser`,
`POSTGRES_DB=appdb`, in which the role `pipelite` **does not exist**. The real dump was copied in and
restored three ways.

**Without `--no-owner` (the naive command):**

```
$ pg_restore -U appuser -d appdb2 /tmp/drill.dump
pg_restore: error: could not execute query: ERROR:  role "pipelite" does not exist
Command was: ALTER SCHEMA drizzle OWNER TO pipelite;
pg_restore: error: could not execute query: ERROR:  role "pipelite" does not exist
Command was: ALTER TYPE public.stage_type OWNER TO pipelite;
… (45 total)
pg_restore: warning: errors ignored on restore: 45
PG_RESTORE_EXIT=1
```

**The nuance that makes this dangerous rather than merely annoying: the data restores anyway.** The
same database reported 36 public tables and 46,054 rows in `organizations`. Every one of the 45 errors
was an `ALTER … OWNER TO pipelite`. So:
- an operator who scripts `pg_restore … && echo OK` sees **failure** on a restore that actually worked,
  and may re-run it or panic;
- an operator who ignores stderr proceeds on a database that is fine *except* that every object is
  owned by `appuser` rather than the role their `DATABASE_URL` expects — which is usually also
  `appuser`, so it works, until it doesn't.

Both outcomes are bad, and both are avoidable with two flags.

**With `--no-owner --no-privileges`:**

```
$ pg_restore -U appuser -d appdb3 --no-owner --no-privileges -j 4 /tmp/drill.dump
PG_RESTORE_EXIT=0
error lines: 0
```

Parity in the foreign-role cluster: 46,054 organizations, 36 public tables, 12
`drizzle.__drizzle_migrations` rows, 3 extensions, 81 indexes — identical to source on every count.

**Decision: `--no-owner --no-privileges` is MANDATORY in the runbook's restore command, not an
option.** Rationale to put in the doc: the flags are harmless when the role names *do* match (all
objects end up owned by the connecting role, which is the same role) and they are the difference
between a clean restore and 45 errors when they don't. There is no case where omitting them is better.
`--no-privileges` is included for the same reason — this schema grants nothing to other roles, so
dropping `GRANT`/`REVOKE` statements loses nothing and removes a second class of "role does not exist"
failure.

## B3. Extensions — present, and fortunately the easy kind

`drizzle/0016_dedup_functions.sql:31-32`:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

Live: `pg_trgm 1.6`, `unaccent 1.1`, both in the `public` schema, plus 38 routines in `public` of
which three are the app's own (`dedup_norm_org`, `dedup_norm_person`, `immutable_unaccent`) and the
rest are the extensions' own functions. No `uuid-ossp`, no `pgcrypto`, no `citext` — and
`drizzle/0013_parched_redwing.sql:58` explicitly documents why: *"gen_random_uuid() is built into
PostgreSQL 13+; no pgcrypto extension is required on 16.13."* [VERIFIED: migration read]

**Both extensions are `trusted = true` on PostgreSQL 16** — read directly from the container:

```
$ cat /usr/local/share/postgresql/extension/pg_trgm.control
default_version = '1.6'
relocatable = true
trusted = true
```

A trusted extension can be installed by a role holding `CREATE` on the database (i.e. the database
owner) **without superuser**. Restoring into a fresh database owned by the app role therefore works,
and it did (0 errors, 3 extensions present).

**Two caveats the runbook must state, because I cannot verify either from here:**
- **Managed Postgres** (RDS, Cloud SQL, Neon, Supabase) restricts extensions to a provider allow-list
  regardless of the `trusted` flag. `pg_trgm` and `unaccent` are on essentially every such list, but
  the runbook should tell the operator to confirm with
  `SELECT * FROM pg_available_extensions WHERE name IN ('pg_trgm','unaccent');` **before** restoring —
  a failed `CREATE EXTENSION` cascades into failures for all 38 dependent routines and the dedup
  indexes. [ASSUMED: allow-list contents — not verified against any provider this session]
- If `CREATE EXTENSION` does fail, the restore is **not** salvageable by ignoring it. The runbook
  should say so rather than letting an operator conclude "just some warnings" as they reasonably might
  from the B2 output.

## B4. Drizzle migration state — verified consistent, and the entrypoint depends on it

**The table's real name is `drizzle.__drizzle_migrations`** — in its own `drizzle` **schema**, not in
`public`. Verified: `select table_schema||'.'||table_name from information_schema.tables where
table_name ilike '%drizzle%'` → `drizzle.__drizzle_migrations`. This matters more than it looks: a
runbook that recommends `pg_dump --schema=public` (a common instinct, to "skip the noise") would
silently omit the migration ledger, and the next container start would attempt to re-run all 20
migrations against a populated database. **The runbook must not narrow the dump to one schema, and
should say why.**

**State:** 12 rows; `max(created_at) = 1787441440793`, which is exactly the `when` value of journal
entry 19 (`0019_concerned_runaways`) in `drizzle/meta/_journal.json` — the last of 20 entries. (The
12-vs-20 gap is historical, from migrations applied before the ledger tracked them individually; it is
**not** drift, because drizzle-kit decides what to apply by comparing each journal entry's `when`
against `max(created_at)` in the ledger, and the newest entry is already recorded.)

**After restore into the scratch database:** 12 rows, `max(created_at) = 1787441440793` — identical.

**Why this is load-bearing:** `docker-entrypoint.sh` is four lines and runs migrations on **every**
container start, unconditionally:

```sh
echo "Running database migrations..."
cd /app && npx drizzle-kit migrate
echo "Starting application..."
exec node server.js
```

So a restore is followed by a migrate on the very next `docker compose up`. Because the ledger came
back with the dump, that migrate is a no-op. If it were not, the app would attempt DDL against
restored data.

**How an operator verifies the restore is consistent with the app's expected schema version** — give
them this, it is three commands and it is the only honest answer:

```bash
# 1. The restored database's recorded position
docker compose exec -T postgres psql -U pipelite -d pipelite -qAt \
  -c "select count(*), max(created_at) from drizzle.__drizzle_migrations;"

# 2. The position the deployed code expects (last entry of the journal it shipped with)
docker compose exec -T app node -e \
  "const j=require('/app/src/db/../../drizzle/meta/_journal.json');const e=j.entries.at(-1);console.log(e.idx,e.tag,e.when)"

# 3. The authoritative check: migrate must report nothing to do
docker compose exec -T app npx drizzle-kit migrate
```

Step 2's path should be confirmed by the executing agent against the standalone image layout before it
goes in the doc — `drizzle/` is not among the `COPY` lines in the runner stage (`drizzle.config.ts`,
`src/db`, `package.json`, `node_modules` are), so **the journal file may not be present in the runner
image at all.** [ASSUMED — not verified this session; verify before writing step 2, and if the journal
is absent, replace step 2 with reading `drizzle/meta/_journal.json` from the git checkout on the host,
which the operator has anyway.] Step 3 is the one that cannot be wrong and should lead.

## B5. The minimum correct command pair, and the D-5 scratch drill — all executed

### Backup (Docker) — two commands, both verified

```bash
# Database. -Fc streams cleanly through `exec -T`: verified byte-for-byte (34,299,898 bytes,
# `file` reports "PostgreSQL custom database dump - v1.15-0").
docker compose exec -T postgres pg_dump -U pipelite -Fc pipelite > "pipelite-db-$(date +%F).dump"

# Uploaded files. See § C3 — a database-only backup restores rows pointing at files that are gone.
docker run --rm -v pipelite_uploads_data:/data:ro -v "$PWD:/backup" alpine:3 \
  tar czf "/backup/pipelite-uploads-$(date +%F).tar.gz" -C /data .
```

Note the service is **`postgres`**, not `db`. `-U pipelite pipelite` is correct
(`POSTGRES_USER=POSTGRES_DB=pipelite`), so only the service name in
`docs/admin/deployment/docker.md:276,279` is wrong — as D-4 states.

### Restore (Docker) — into a fresh, empty database

```bash
# 1. Stop the app so nothing writes during the restore. Leave postgres up.
docker compose stop app

# 2. Create the target database (skip if restoring into an existing one — then add
#    --clean --if-exists to step 3 and re-read the warning in § B1).
docker compose exec -T postgres createdb -U pipelite pipelite

# 3. Restore. --no-owner --no-privileges is MANDATORY: see § B2.
docker compose exec -T postgres pg_restore -U pipelite -d pipelite \
  --no-owner --no-privileges < pipelite-db-2026-08-23.dump

# 4. Restore the files.
docker run --rm -v pipelite_uploads_data:/data -v "$PWD:/backup:ro" alpine:3 \
  tar xzf /backup/pipelite-uploads-2026-08-23.tar.gz -C /data

# 5. Bring the app back. The entrypoint's `drizzle-kit migrate` must report nothing to do.
docker compose up -d app
docker compose logs --tail=20 app
```

Every command in that block was executed this session against a scratch target
(steps 2-3 verbatim with `-d pipelite_restore_drill`; step 4's tar round-trip against throwaway
volumes, confirming uid/gid 1001 is preserved through `tar czf`/`tar xzf`).

### The D-5 scratch drill — create, restore, verify, drop

Scratch database name: **`pipelite_restore_drill`**. Executed end to end; all output below is real.

```bash
# 0. Dump the live database (read-only; 9s, 34,299,898 bytes)
docker compose exec -T postgres pg_dump -U pipelite -Fc pipelite > /tmp/pipelite-drill.dump

# 1. Create the scratch target. NEVER `pipelite`.
docker compose exec -T postgres createdb -U pipelite pipelite_restore_drill

# 2. Restore into it
docker compose exec -T postgres pg_restore -U pipelite -d pipelite_restore_drill \
  --no-owner --no-privileges < /tmp/pipelite-drill.dump
# → exit 0, no output   (measured 9.9s)

# 3. VERIFY — a checksum over per-table row counts across BOTH schemas
docker compose exec -T postgres sh -c '
Q="SELECT string_agg(format('"'"'SELECT %L AS t, count(*) FROM %I.%I'"'"', schemaname||'"'"'.'"'"'||tablename, schemaname, tablename), '"'"' UNION ALL '"'"') FROM pg_tables WHERE schemaname IN ('"'"'public'"'"','"'"'drizzle'"'"');"
SQL=$(psql -U pipelite -d pipelite -qAt -c "$Q")
psql -U pipelite -d pipelite               -qAt -c "$SQL" | sort | md5sum
psql -U pipelite -d pipelite_restore_drill -qAt -c "$SQL" | sort | md5sum'
# → 870a172d371b44a03f0941466e29cbcc  -    (live)
# → 870a172d371b44a03f0941466e29cbcc  -    (drill)   37 tables compared

# 4. DROP the scratch database in the same task that created it (D-5)
docker compose exec -T postgres dropdb -U pipelite pipelite_restore_drill
rm -f /tmp/pipelite-drill.dump
```

Additional parity confirmed on the restored scratch database: indexes 81 = 81, constraints 83 = 83,
routines 38 = 38, extensions `pg_trgm 1.6` / `plpgsql 1.0` / `unaccent 1.1`,
`drizzle.__drizzle_migrations` 12 rows with matching `max(created_at)`.

**A md5 over per-table counts is the right verification for the drill** and better than eyeballing a
few tables: it covers all 37 tables including the migration ledger, it is one line of output, and it
fails loudly on any discrepancy. It does **not** verify column values — say so in the doc rather than
implying a checksum means "identical database".

**The drill executed in this research session is not a substitute for the phase's own.** Criterion 3
requires the restore be exercised as part of the work, and the phase's version must additionally cover
the uploads volume (§ C), which did not exist when I ran this. Reuse these exact commands.

### Bare metal

`docs/admin/deployment/bare-metal.md:121-135` installs `postgresql postgresql-contrib` from apt and
creates the database via `sudo -u postgres psql`. The equivalent pair, with the same two mandatory
flags:

```bash
sudo -u postgres pg_dump -Fc pipelite > "pipelite-db-$(date +%F).dump"
sudo -u postgres createdb pipelite
sudo -u postgres pg_restore -d pipelite --no-owner --no-privileges "pipelite-db-2026-08-23.dump"
sudo tar czf "pipelite-uploads-$(date +%F).tar.gz" -C /var/lib/pipelite/uploads .
```

The uploads path there is **not** a fact — it is the value § C recommends the bare-metal doc start
prescribing. Today bare-metal inherits the `/tmp/uploads` default (§ C1), which is the same latent
defect as Docker's and arguably worse: `systemd-tmpfiles` cleans `/tmp` on a schedule on most distros,
so a bare-metal install can lose uploads **without any redeploy at all**. [ASSUMED: distro tmp-cleaning
schedule — the mechanism is standard but the interval is distro-specific and was not verified here.]

---

# C. Persisting uploads (D-3)

## C1. Where the app actually writes — not `/app/uploads`

```
src/app/api/upload/route.ts:10   const STORAGE_TYPE = process.env.FILE_STORAGE || 'local'
src/app/api/upload/route.ts:11   // Use UPLOAD_DIR env var, or fallback to /tmp/uploads for containerized environments
src/app/api/upload/route.ts:12   const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads'
src/app/api/upload/route.ts:92         const uploadDir = path.resolve(UPLOAD_DIR, entityId, fieldName)
src/app/api/upload/route.ts:93-95      if (!existsSync(uploadDir)) { await mkdir(uploadDir, { recursive: true }) }
src/app/api/upload/route.ts:97-98      filePath = path.join(uploadDir, storedName); await writeFile(filePath, buffer)

src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:9-10   same two constants
src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:74     path.resolve(UPLOAD_DIR, entityId, fieldName, filename)
```

**The default is `/tmp/uploads`, and inside the running container `UPLOAD_DIR` is empty.** Verified
directly:

```
$ docker compose exec -T app sh -c 'echo "UPLOAD_DIR=[${UPLOAD_DIR}] FILE_STORAGE=[${FILE_STORAGE}]"'
UPLOAD_DIR=[] FILE_STORAGE=[]
```

Neither variable appears in the `app` service's `environment:` list, and `docker-compose.yml` has no
`env_file:` — the file's own comment (lines 21-26) explains that exact mechanic for `LOG_LEVEL` and
`SENTRY_DSN`. So the app falls through to `'local'` and `/tmp/uploads`.

**Consequence for the plan: mounting a volume at `/app/uploads` alone changes nothing.** The app would
keep writing to `/tmp/uploads` and the volume would stay empty forever — a fix that appears to ship,
passes review, and does not work. This is the same failure shape as Phase 42's silently-broken
`docker compose build`.

**Also verified: there are no `file`-type custom field definitions today.** 169 definitions exist
(`text` 62, `multi_select` 56, `single_select` 28, `number` 12, `date` 11) and **none** of type `file`.
So no live data is being lost right now — the defect is latent, and the fix is preventive. This is
worth stating in the plan for two reasons: it means the D-3 experiment must **create** its own upload
rather than relying on existing data, and it means the change carries no data-migration obligation.

## C2. Named volume vs bind mount, and the ownership trap

**Recommendation: named volume.** For a self-hoster, `uploads_data:/app/uploads`:
- is created and managed by Docker with no host-side `mkdir` or permissions work;
- is backed up and restored with the two `tar` commands in § B5, which work identically on every host;
- matches the file's existing precedent (`postgres_data`, `docker-compose.yml:41`), so the operator
  learns one idiom;
- avoids the bind-mount uid-mismatch problem, where the host directory's owner must happen to be uid
  1001 or the container cannot write.

A bind mount is the better choice only for an operator who wants uploads inside an existing host backup
sweep. **Mention it in one line as an alternative** (`- ./uploads:/app/uploads`) with the explicit
caveat that the host directory must be `chown 1001:1001`, and move on. Do not present them as equals.

**The ownership trap, and it is real — I measured both directions.**

Fresh named volume at a path that does **not** exist in the image:

```
$ docker run --rm -u 1001:1001 -v probe_uploads_test:/app/uploads alpine:3 \
    sh -c 'id; ls -ld /app/uploads; touch /app/uploads/probe.txt || echo "WRITE FAILED"'
uid=1001 gid=1001 groups=1001
drwxr-xr-x    2 root     root          4096 /app/uploads
touch: /app/uploads/probe.txt: Permission denied
WRITE FAILED
```

Docker created the volume **root:root 0755**. The container runs as `USER nextjs` (uid 1001,
`Dockerfile` runner stage), so **every upload would fail with EACCES** — a volume mounted over a
directory the app user cannot write, which is worse than no volume, exactly as the brief anticipated.

With the directory pre-created and chowned in the image, the volume inherits that ownership:

```
$ # image built with: RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads  (before USER nextjs)
$ docker run --rm -v probe_uploads_test2:/app/uploads probe-uploads-fix \
    sh -c 'id; ls -ld /app/uploads; mkdir -p /app/uploads/e1/f1 && echo hi > /app/uploads/e1/f1/probe.txt && echo "WRITE OK"'
uid=1001(nextjs) gid=65533(nogroup) groups=65533(nogroup)
drwxr-xr-x    2 nextjs   nodejs        4096 /app/uploads
WRITE OK
$ # second, separate container against the same volume
hi
SURVIVED NEW CONTAINER
```

**Sharp detail the plan must not get wrong:** note `gid=65533(nogroup)`. The Dockerfile does
`addgroup --system --gid 1001 nodejs` then `adduser --system --uid 1001 nextjs` **without `-G nodejs`**,
so `nextjs`'s primary group is `nogroup` and it is **not a member of `nodejs`**. The write above
succeeded through the **owner** bit, not the group bit. Therefore:
- `chown nextjs:nodejs /app/uploads` — **works** (owner is `nextjs`).
- `chown root:nodejs /app/uploads && chmod g+w` — **would not work**. Do not write it that way.

Confirming evidence from the live container: files under `/tmp/uploads` are owned `nextjs nogroup`.

**Also note `/tmp` is mode 1777**, which is the entire reason nobody has hit EACCES so far. Moving off
`/tmp` is what makes ownership suddenly matter.

## C3. The complete change set — three parts, one atomic commit

**1. `docker-compose.yml`** — add a volumes block to `app`, add `UPLOAD_DIR`, declare the volume:

```yaml
services:
  app:
    environment:
      # ... existing entries ...
      # MANDATORY alongside the volume below, and load-bearing rather than tidiness:
      # UPLOAD_DIR defaults to /tmp/uploads (src/app/api/upload/route.ts:12) and this file
      # has no `env_file:`, so without this line the app writes to /tmp and the volume
      # below stays empty forever — a persistence fix that ships, reviews clean, and does
      # nothing. Hardcoded rather than ${UPLOAD_DIR} so it can never disagree with the
      # mount target on the next line.
      - UPLOAD_DIR=/app/uploads
    volumes:
      - uploads_data:/app/uploads

volumes:
  postgres_data:
  uploads_data:
```

Hardcode `/app/uploads`; do **not** write `${UPLOAD_DIR:-/app/uploads}`. An operator who then sets
`UPLOAD_DIR=/srv/files` in `.env` would move the write path out from under the mount and silently lose
persistence again — the same class of bug being fixed. An operator who genuinely wants another path can
edit both lines, which is honest.

**2. `Dockerfile`** — runner stage, **before** `USER nextjs`:

```dockerfile
# A fresh named volume mounted at a path absent from the image is created root:root 0755,
# and this container runs as uid 1001 — measured: `touch: Permission denied`. Pre-creating
# and chowning the directory here is what makes the volume writable, because Docker copies
# the image directory's ownership onto a new volume. chown to the USER (not the group):
# `adduser` above has no `-G nodejs`, so nextjs's primary group is nogroup and group-write
# would not help.
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads
```

Place it after the `adduser`/`addgroup` lines and before `USER nextjs`. Do not add it to the builder
stage.

**3. `.env.example` and `docs/admin/configuration.md`** — `UPLOAD_DIR` is documented **nowhere**.
`configuration.md:253-266` documents `FILE_STORAGE` (`local` = "Store files on local filesystem
(default)") and `:230-245` documents `MAX_FILE_SIZE`, but no section tells an operator *where* local
files land. `.env.example` (33 lines, read in full) contains no `FILE_STORAGE`, no `UPLOAD_DIR`, no
`MAX_FILE_SIZE` — and no `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` either, though
`docker-compose.yml` requires all three. An operator who copies `.env.example` cannot bring up the
Docker stack at all. Adding an `UPLOAD_DIR` entry is in scope; the missing `POSTGRES_*` block is
adjacent and is flagged in § D3.

## C4. The D-3 experiment — smallest reliable path, validated end to end

**Do not drive a browser and do not add a Playwright spec.** A direct `curl` against `/api/upload`
using the existing Playwright storage state is enough, and I ran it:

```bash
TOK=$(python3 -c "import json;d=json.load(open('e2e/.auth/admin.json'));print([c['value'] for c in d['cookies'] if c['name']=='__Secure-authjs.session-token'][0])")
printf 'phase43 upload probe %s\n' "$(date -Is)" > /tmp/probe-upload.txt
curl -s -w 'HTTP=%{http_code}\n' -X POST http://localhost:3001/api/upload \
  -H "Cookie: __Secure-authjs.session-token=$TOK" \
  -F "file=@/tmp/probe-upload.txt" -F "entityId=phase43probe" -F "fieldName=probefield"
```

```json
HTTP=200
{ "success": true,
  "file": { "id": "567f367d-…", "storedName": "567f367d-….txt",
            "path": "/tmp/uploads/phase43probe/probefield/567f367d-….txt",
            "publicUrl": "/api/files/phase43probe/probefield/567f367d-….txt",
            "size": 47, "mimeType": "text/plain" } }
```

Then the read side, same cookie, returned `HTTP=200` and the exact bytes. The container filesystem
confirmed `/tmp/uploads/phase43probe/probefield/567f367d-….txt`, owner `nextjs nogroup`. Probe files
removed afterwards.

Facts this establishes for the plan:
- `POST /api/upload` authorizes on `await auth()` alone (`route.ts:33-36`) — session cookie is
  sufficient, **no CSRF token and no form origin check**, so `curl` works.
- The required multipart fields are exactly `file`, `entityId`, `fieldName` (`route.ts:39-50`). Both
  ids are arbitrary strings; **no database row is needed**, which is what makes this experiment small.
  Use a namespaced literal like `phase43probe` — `entityId` flows unsanitized into `path.resolve`
  (pre-existing traversal debt already logged in `.planning/STATE.md`; do not exercise it).
- The cookie names are the `__Secure-`/`__Host-` variants because `.env` sets
  `NEXTAUTH_URL=https://…`. `curl` does not enforce cookie prefixes, so this works over plain HTTP on
  `localhost:3001`.
- **The storage state expires 2026-08-29T23:35.** If the executing agent finds it expired, regenerate
  with `npx playwright test e2e/auth.setup.ts` rather than hand-crafting a token.

**The survival test, in order:**

```bash
# 1. Apply all three changes from § C3.
# 2. Rebuild — NOT `restart`, which runs the old image (project memory).
docker compose up -d --build

# 3. Upload via the curl above. ASSERT the response `path` is /app/uploads/... — not /tmp/uploads.
#    This single assertion is what proves part 1 of the change (UPLOAD_DIR) took effect, and it is
#    the assertion a plan that only added the volume would fail.
# 4. Confirm on disk AND in the volume:
docker compose exec -T app sh -c 'ls -l /app/uploads/phase43probe/probefield/'
docker volume inspect pipelite_uploads_data

# 5. Rebuild again — the actual survival event.
docker compose up -d --build

# 6. Same file still there, and still served:
docker compose exec -T app sh -c 'cat /app/uploads/phase43probe/probefield/<stored>.txt'
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://localhost:3001/api/files/phase43probe/probefield/<stored>.txt" \
  -H "Cookie: __Secure-authjs.session-token=$TOK"     # expect 200

# 7. Clean up the probe (leave no fixture behind).
docker compose exec -T app sh -c 'rm -rf /app/uploads/phase43probe'
```

Step 3's path assertion is the non-vacuous part. A survival check alone would also pass if the app
never wrote anything and the read never happened.

## C5. Backing up and restoring the volume — commands validated

The compose project is `pipelite`, so the volume is `pipelite_uploads_data` (confirmed by
`docker volume ls`: the existing one is `pipelite_postgres_data`).

```bash
# Backup
docker run --rm -v pipelite_uploads_data:/data:ro -v "$PWD:/backup" alpine:3 \
  tar czf "/backup/pipelite-uploads-$(date +%F).tar.gz" -C /data .

# Restore
docker run --rm -v pipelite_uploads_data:/data -v "$PWD:/backup:ro" alpine:3 \
  tar xzf "/backup/pipelite-uploads-2026-08-23.tar.gz" -C /data
```

Verified against throwaway volumes with a uid/gid-1001 payload: `-rw-r--r-- 1 1001 1001` before the
tar, and `-rw-r--r-- 1 1001 1001` with intact contents after extracting into a **different fresh
volume**. Ownership survives because `tar` runs as root in the helper container. The runbook should
say that explicitly — an operator who reasonably tries `docker compose exec app tar …` runs as uid
1001 and gets a different (and on restore, broken) result.

Also worth one line in the runbook: `FILE_STORAGE=s3` deployments should skip the volume steps
entirely and rely on bucket versioning; `docs/admin/deployment/vercel.md:18` already establishes that
Vercel **must** use S3 ("No local file storage"), so the runbook covers three paths in effect, not two.

---

# D. Risks and ordering

## D1. Recommended task ordering

| # | Task | Why here | Gate |
|---|---|---|---|
| 1 | Add `src/types/tanstack-table.d.ts` **and** delete all 14 suppressions | Cannot be split — the augmentation makes every un-deleted suppression a `TS2578` error (measured). | `npx tsc --noEmit` exit 0; `grep -c @ts-expect-error src/` = **2** |
| 2 | Add `Required<Pick<TableMeta<T>,…>>` consumer contracts in the three data-tables | Depends on 1. Separate so its diff is legible and revertible if a source-scan gate collides. | `tsc` 0; **full** `npm test` (7 files text-scan these data-tables) |
| 3 | `docker-compose.yml` + `Dockerfile` + `.env.example` uploads fix | Independent of 1-2. Must be one commit — any two of the three alone produce a broken or inert result (§ C3). | `docker compose config` parses; `docker compose up -d --build` succeeds |
| 4 | The D-3 upload survival experiment | Depends on 3 and on a rebuilt image. | Response `path` starts `/app/uploads`; file survives a second `up -d --build`; read returns 200 |
| 5 | Write `docs/admin/backup-restore.md`; repoint `docker.md` and `bare-metal.md:359` | Depends on 3 (the runbook documents the volume that must exist) and 4 (documents a procedure proven to work). | Doc names service `postgres`, carries `--no-owner --no-privileges`, no `db` service anywhere |
| 6 | The restore drill against `pipelite_restore_drill`, create-and-drop in one task | Depends on 5 — the drill executes the runbook as written, which is the point. | md5 of per-table counts matches live; scratch DB dropped; `psql -l` proves it |
| 7 | D-6: `log.warn("Pipedrive API", …)` → `"pipedrive-api"` | Independent. Last, so its one-line diff is not buried. | `grep` finds 0 remaining |

Tasks 1-2 and 3-6 are independent and can run as parallel waves. Task 7 is independent of everything.

## D2. Risks

**R1 — `docker-compose.yml` is edited, and Phase 42's A8 constraint applies. (medium)**
Do **not** add an `app` healthcheck while in that file. `docker-compose.yml:28-33` carries a comment
explaining that `/api/health` legitimately returns 503 and that a probe plus `restart: unless-stopped`
could restart-loop the container. An executor "improving" the file while adding volumes would ship the
outage the observability feature exists to reveal.

**R2 — A three-part change that appears to work when only partially applied. (high — the phase's
biggest trap)** Volume without `UPLOAD_DIR` → app writes to `/tmp`, volume empty, uploads still
ephemeral, and nothing errors. `UPLOAD_DIR` without the Dockerfile `chown` → **every upload returns
500** (EACCES, measured). `UPLOAD_DIR` + `chown` without the volume → writes succeed to a container
path and vanish on rebuild. Mitigation: one commit, and the § C4 step-3 assertion on the returned
`path`, which distinguishes all four states.

**R3 — CI runs `npm ci` first, and it was broken for this entire milestone until `58139b9`. (low, if
nothing touches `package.json`)** Nothing in this phase needs a dependency:
- the `TableMeta` augmentation is pure TypeScript;
- a compose-parsing gate (§ Validation Architecture) can use **`yaml@^2.8.2`, already a direct
  dependency** at `package.json:61` and installed at 2.8.2.
**`npm install` is forbidden and unnecessary. If any task proposes touching `package.json`, treat it
as a scope error.** If one turns out to be genuinely required, re-verify `npm ci` from a clean tree
before merging (note `--legacy-peer-deps` is not needed — the `@auth/core` conflict is peerOptional).

**R4 — The augmentation's global reach. (low, bounded)** `TableMeta` is now shared by all 12
`useReactTable` call sites. Any future table passing a meta key not in the interface gets `TS2353`.
That is the feature, but the plan should say so in the `.d.ts` comment so the next developer adds a
member rather than reaching for a cast. Present blast radius fully enumerated in § A3 — 7 sites, all
covered by the recommended shape (`tsc` exit 0 measured with zero edits to any of them).

**R5 — Text-based source-scan gates. (low, checked)** `select-wiring.test.ts:962-985` asserts the two
columns modules contain `ColumnDef` and do **not** contain `useSelectColumn`, `components/bulk`,
`components/ui/checkbox`, `rowSelection`. The recommended change keeps all five conditions true.
Constraint: **do not place the shared meta type under `src/components/bulk/`** and do not introduce any
of those tokens into the columns files. This repo has lost 15+ gate runs to prose collisions across
phases 37-38; the correct response to a collision is to reword the prose, never to weaken the gate.

**R6 — The drill runs against a 228 MB live database. (low, but the blast radius is total)** D-5's
constraint is absolute: scratch database only. Two concrete guards for the plan: the target name
`pipelite_restore_drill` appears as a literal in the task (never a variable that could default empty),
and `--clean` **must not** appear in the drill command — `--clean --if-exists` against a mistyped
target is what turns a typo into `DROP` statements on a live database.

**R7 — The rebuild cost. (informational)** Tasks 3-4 and 6 each need `docker compose up -d --build`,
which rebuilds a Next.js standalone image. Budget for it, and note the app service is currently up
(`app Up 2 hours`) — the rebuild interrupts the dev environment briefly. Migrations re-run on every
start and are a no-op (12 ledger rows, § B4).

**R8 — `no-console` is `error` since Phase 42. (low)** Task 5 writes docs and task 6 may add a drill
script. A `console.*` in non-test **source** now fails lint. Doc code blocks are not linted; a
`scripts/*.ts` helper would be (`drizzle/**` and `e2e/**` are exempt, `scripts/**` is not — verified
against `eslint.config.mjs`). Prefer shell over a TypeScript script, or use `src/lib/log.ts`.
Gate on **errors (0)**, never on a warning total — warning counts are environment-dependent (124 vs
122) because `.planning`'s untracked files carry exactly 2.

## D3. Doc defects found beyond POLISH-02's literal scope

All verified by reading the files. The planner should decide scope; my recommendation is to fix the
first two in task 5 because the runbook's credibility depends on the service being called `postgres`
everywhere, and a reader who finds `db` two screens away will not trust the new page.

| Location | Defect | Recommend |
|---|---|---|
| `docs/admin/deployment/docker.md:270-282` | The `db` service in both backup and restore commands. **D-4's target.** | Replace with a pointer to the runbook |
| `docs/admin/deployment/docker.md:207-225` | "Volume Mounts for Persistence" already documents `uploads:/app/uploads` — on a service named `db`, with no `UPLOAD_DIR`, and against a path absent from the image. **Triple-broken; would fail silently even after the `db`→`app` fix.** | Rewrite to match the real compose file from § C3 |
| `docs/admin/troubleshooting.md:561` | `docker compose logs db` — same phantom service | Fix (one line, same defect class) |
| `docs/admin/deployment/docker.md:118` | `DATABASE_URL=postgresql://pipelite:yourpassword@db:5432/pipelite` — the **hostname** is the phantom service. `.env` correctly uses `@postgres:5432`. A new operator following this doc cannot connect. | Fix — one line, and it is a setup-blocking error, more severe than the backup typo |
| `docs/admin/deployment/docker.md` (whole file) | `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`: **0 occurrences**, though compose requires all three | Flag; fixing is scope-adjacent |
| `.env.example` | No `POSTGRES_*`, no `FILE_STORAGE`, no `UPLOAD_DIR`, no `MAX_FILE_SIZE`. Copying it cannot start the Docker stack. | Add `UPLOAD_DIR` (in scope, § C3); flag the rest |
| `docs/admin/configuration.md:253-266` | Documents `FILE_STORAGE=local` as "local filesystem (default)" but never says where | Add `UPLOAD_DIR` (in scope) |
| `docs/admin/deployment/bare-metal.md:359` | `**Backups scheduled**` checklist item with no procedure. **D-4's target.** | Point at the runbook |
| `docs/index.md:60-70` | Admin doc index — needs a `backup-restore.md` entry | Add in task 5 |
| `docs/admin/import-export.md:5,17,165,175,177` | Calls CSV/JSON export "backup" five times. Related but different (no schema, no migration ledger, no files). | Cross-reference both ways; do not merge |

## D4. Package Legitimacy Audit

**No packages are installed by this phase.** `npm install` is forbidden by the brief and unnecessary:
the type work is pure TypeScript, and the only library a new gate might want (`yaml`) is already a
direct dependency (`package.json:61`, installed 2.8.2). The Package Legitimacy Gate therefore has an
empty surface — no slopcheck run was required.

**Packages removed due to slopcheck `[SLOP]`:** none (none proposed)
**Packages flagged `[SUS]`:** none (none proposed)

If any task later proposes a dependency, it must run the full legitimacy gate **and** re-verify
`npm ci` from a clean tree (R3).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Typing `table.options.meta` | A hand-rolled `AppTableMeta` interface plus a cast at every read | `declare module "@tanstack/react-table" { interface TableMeta<TData> … }` | Removes the assertion instead of relabelling it, checks the producer too, and is the library's own mechanism. Verified to reach `tsc` exit 0. |
| A per-consumer required-member contract | A second hand-written interface per table | `Required<Pick<TableMeta<Row>, "a" \| "b">>` | Stays "one declaration" (criterion 2) while making omissions a compile error (TS2741, verified). |
| Consistent database backup | `psql -c "COPY … TO"` per table, or a `.sql` dump loop | `pg_dump -Fc` | A single consistent snapshot, extensions and 38 routines and the migration ledger included, 3.55× smaller, with selective restore. |
| Cross-deployment restore | Pre-creating roles to match the dump, or editing the dump | `pg_restore --no-owner --no-privileges` | Turns 45 errors / exit 1 into 0 errors / exit 0 with identical data (both measured). |
| Volume backup | `docker cp` from a running container | `docker run --rm -v vol:/data alpine tar czf` | Works when the container is stopped, runs as root so uid 1001 ownership survives (verified), needs no app image. |
| Parsing compose in a gate | A regex over YAML | `yaml@2.8.2` (already a dependency) | Indentation-correct, no new install, no `npm ci` risk. |

**Key insight:** every hand-rolled option in this phase is *reachable* — a cast compiles, a `.sql` dump
restores, a regex matches. Each fails only in the case the phase exists to protect against: the cast
lies when the shapes drift, the plain dump is what an operator has when their role name differs, and
the regex passes on the malformed compose file. Prefer the mechanism whose failure mode is a compile
error or a non-zero exit.

## Common Pitfalls

### Pitfall 1: Splitting the augmentation from the suppression deletions
**What goes wrong:** `tsc` is red between the two tasks.
**Why it happens:** The augmentation is global and instantaneous; every remaining `@ts-expect-error`
becomes `TS2578: Unused '@ts-expect-error' directive` the moment it lands (8 such errors observed).
**How to avoid:** One task, one commit, all 15 files.
**Warning signs:** A plan with "add the shared type" and "remove the suppressions" as separate tasks.

### Pitfall 2: A repo-wide `@ts-expect-error` count of zero
**What goes wrong:** The gate forces deletion of the two deliberate test suppressions (D-1), removing
the assertion each test exists to make.
**Why it happens:** Criterion 1's literal wording.
**How to avoid:** Gate on `src/**` **excluding** `**/*.test.ts` — expected count 0 there, 2 repo-wide.
Assert both numbers so the gate cannot pass vacuously.
**Warning signs:** `grep -rc "@ts-expect-error" src/ | … = 0` anywhere in a plan.

### Pitfall 3: Mounting a volume the container user cannot write
**What goes wrong:** Every upload returns 500 (EACCES). Strictly worse than today's ephemeral uploads.
**Why it happens:** Docker creates a fresh named volume root:root 0755 when the mount path is absent
from the image; the container runs as uid 1001. Measured: `touch: Permission denied`.
**How to avoid:** `RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads` before `USER nextjs`.
Chown the **user**, not the group — `nextjs`'s primary group is `nogroup`, not `nodejs`.
**Warning signs:** A compose diff with no matching Dockerfile diff.

### Pitfall 4: Testing persistence with `docker compose restart`
**What goes wrong:** A vacuous pass — `restart` runs the old image, so the test proves nothing about
the new one.
**Why it happens:** It is the intuitive command and it exits 0.
**How to avoid:** `docker compose up -d --build`. Recorded in project memory from Phase 42.
**Warning signs:** `restart` anywhere in a verification step.

### Pitfall 5: `--schema=public` on the dump
**What goes wrong:** `drizzle.__drizzle_migrations` is omitted (it lives in the `drizzle` schema), so
the next container start re-runs all 20 migrations against restored data.
**Why it happens:** Narrowing to `public` looks like sensible noise reduction.
**How to avoid:** Dump the whole database. State the reason in the runbook.
**Warning signs:** `--schema`, `-n`, or `-t` in a backup command.

### Pitfall 6: `pg_restore -j` from stdin
**What goes wrong:** `pg_restore: error: parallel restore from standard input is not supported`, exit 1.
**Why it happens:** `-j` and `< dumpfile` are each individually sensible.
**How to avoid:** Omit `-j` from the runbook; it saves nothing at 228 MB (measured slower, in fact).
**Warning signs:** `-j` and `<` on the same line.

### Pitfall 7: Trusting `pg_restore`'s exit code without reading it
**What goes wrong:** Exit 1 with 45 `role does not exist` errors on a restore whose **data is
complete and correct** — the operator cannot tell recoverable from catastrophic.
**Why it happens:** `pg_restore` continues past errors by default and reports "errors ignored on restore".
**How to avoid:** `--no-owner --no-privileges` makes it exit 0 with 0 errors. Then the exit code means
something and the runbook can tell operators to trust it.
**Warning signs:** A restore command without both flags.

## Runtime State Inventory

This phase changes runtime configuration, so the inventory applies even though it is not a rename.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | **None requiring migration.** 169 `custom_field_definitions` rows, **zero** of `type='file'` (verified), so no existing `custom_fields` JSONB value points at an upload. The ephemeral-uploads defect is latent. | None — code/config only |
| Live service config | **`docker-compose.yml` is in git and is the only source of the `app` service's env**; there is no `env_file:`, so a variable absent from the `environment:` list never reaches the container. No out-of-git service config (no n8n, no external orchestrator). | Edit compose (§ C3) |
| OS-registered state | **None.** No Task Scheduler, no systemd unit, no pm2 process on this host — the stack runs entirely under `docker compose` (verified: `app`, `mailhog`, `postgres`, all `restart: unless-stopped`). | None |
| Secrets / env vars | **One new variable: `UPLOAD_DIR`** — new to compose, new to `.env.example`, new to `configuration.md`. No secret changes. Verified currently **empty inside the running container**. Also noted: `POSTGRES_*` are required by compose and absent from `.env.example`. | Add `UPLOAD_DIR` to compose + `.env.example` + docs |
| Build artifacts | **The image must be rebuilt**, not restarted — the `mkdir`/`chown` lands in an image layer, and `docker compose restart` runs the old image. Also: `docker volume ls` shows only `pipelite_postgres_data` today; `pipelite_uploads_data` will be created on the next `up`. | `docker compose up -d --build` |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `docker` + `docker compose` (no sudo) | C, D-3 experiment, B drill | ✓ | compose v2, 3 services up | — |
| `postgres` service | B backup/restore drill | ✓ | 16.13 (`postgres:16-alpine`), healthy | — |
| `pg_dump` / `pg_restore` / `createdb` / `dropdb` | B | ✓ | 16.13, in the postgres image | — |
| `app` service running | C4 upload probe | ✓ | up, host 3001 → 3000 | — |
| Playwright storage state | C4 upload probe | ✓ | `e2e/.auth/admin.json`, **expires 2026-08-29T23:35** | `npx playwright test e2e/auth.setup.ts` |
| `curl` | C4 | ✓ | present | — |
| `npx tsc` / `npx eslint` | A gates | ✓ | tsc exit 0 in ~16s; eslint exit 0 | — |
| `yaml` (for a compose-parsing gate) | Validation | ✓ | 2.8.2, **already a direct dependency** | plain-text assertions |
| `alpine:3` image | Volume tar backup/restore | ✓ | pulled and tested this session | any image with `tar` |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** the Playwright storage state expires 2026-08-29 — regenerate
rather than hand-crafting a token.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (3 projects: default, `rsc`, `db`) |
| Config file | `vitest.config.ts` (+ `vitest.rsc.config.ts`, `vitest.db.config.ts`) |
| Collection scope | `src/**/*.{test,spec}.?(c\|m)[jt]s?(x)`, excluding `**/.next/**`, `*.rsc.test.*`, `*.db.test.*` |
| Quick run command | `npx vitest run <path>` (single file, seconds) |
| Full suite command | `npm test` → `vitest run && vitest run --config vitest.rsc.config.ts` |
| Type gate | `npm run typecheck` → `tsc --noEmit` (~16 s, currently exit 0) |
| Lint gate | `npm run lint` → `eslint` (0 errors today; **gate on errors, never on a warning total**) |
| CI | `.github/workflows/ci.yml` — `npm ci` → typecheck → lint → test, all three reported in one run |

### Phase Requirements → Test Map

| Req | Behavior | Type | Automated command | Exists? |
|-----|----------|------|-------------------|---------|
| POLISH-01 | `tsc --noEmit` passes with the shared type and no suppressions | typecheck | `npm run typecheck` | ✅ |
| POLISH-01 | Exactly 2 `@ts-expect-error` remain, both in test files (D-1) | source-scan | `npx vitest run src/types/__tests__/no-standing-suppressions.test.ts` | ❌ Wave 0 |
| POLISH-01 | Omitting a required meta member fails to compile (proves Tier 2 non-vacuous) | typecheck negative | manual: delete a member, expect TS2741, restore | ❌ Wave 0 (or a documented manual check) |
| POLISH-01 | The three columns modules still satisfy the Phase 38 untouched-columns gate | source-scan | `npx vitest run src/components/bulk/__tests__/select-wiring.test.ts` | ✅ |
| POLISH-02 / D-3 | `docker-compose.yml`'s `app` `UPLOAD_DIR` equals its uploads mount target | config-scan | `npx vitest run src/lib/__tests__/compose-uploads-persistence.test.ts` | ❌ Wave 0 |
| POLISH-02 / D-3 | The Dockerfile creates and chowns the upload dir before `USER nextjs` | config-scan | same test file | ❌ Wave 0 |
| POLISH-02 | No doc references a `db` compose service | docs-scan | `npx vitest run src/lib/__tests__/deployment-docs-accuracy.test.ts` | ❌ Wave 0 |
| POLISH-02 | The runbook's restore command carries `--no-owner` | docs-scan | same test file | ❌ Wave 0 |
| POLISH-02 crit. 3 | A real dump restores into a scratch DB with matching row-count checksum | manual drill | § B5 (must be executed, evidenced, and the scratch DB dropped) | manual-only |
| D-3 | An uploaded file survives `up -d --build` | manual experiment | § C4 (needs a container rebuild — not automatable in CI) | manual-only |
| D-6 | No log scope contains a space | source-scan | trivially foldable into an existing or new scan | ❌ Wave 0 |

**The two highest-value new gates**, both cheap and both non-vacuous:

1. `compose-uploads-persistence.test.ts` — parse `docker-compose.yml` with `yaml@2.8.2`, assert
   (a) `services.app.volumes` contains an entry whose **target equals** the `UPLOAD_DIR` value in
   `services.app.environment`, (b) that volume name is declared under top-level `volumes:`, (c) the
   `Dockerfile` runner stage contains a `chown` of that path **before** its `USER` line, and (d) —
   anti-vacuity — `services.app.environment` contains `UPLOAD_DIR` at all. Changing any one of the
   three files alone turns it red. **This is the gate that catches R2**, the phase's biggest trap, and
   nothing else can: the failure is a three-file disagreement invisible in any single diff.
2. `deployment-docs-accuracy.test.ts` — assert no file under `docs/**` matches
   `compose (exec|logs|run) +db\b`, and that the runbook contains `--no-owner` and the literal string
   `postgres`. Anti-vacuity: assert each scanned file is non-empty and that the scan found the runbook.

**Note the D-1 exclusion in gate 1's sibling:** the suppression-count test must assert **both** "0 in
non-test `src/`" and "2 repo-wide", or it is either the regression-forcing gate D-1 warns about or a
gate that cannot fail.

### Sampling Rate

- **Per task commit:** `npm run typecheck` + `npm run lint` + the task's own test file
- **Per wave merge:** `npm test` (full — 7 files text-scan the data-tables Tier 2 edits)
- **Phase gate:** `npm test` green, `tsc` 0, `eslint` 0 errors, `docker compose up -d --build`
  succeeds, and the § B5 drill + § C4 experiment evidenced with real output

### Wave 0 Gaps

- [ ] `src/types/__tests__/no-standing-suppressions.test.ts` — POLISH-01 crit. 1 with the D-1 exclusion
- [ ] `src/lib/__tests__/compose-uploads-persistence.test.ts` — D-3's three-file cross-check
- [ ] `src/lib/__tests__/deployment-docs-accuracy.test.ts` — POLISH-02 phantom-service scan
- [ ] Framework install: **not needed** — vitest and `yaml` are both present

## Security Domain

`security_enforcement` is absent from `.planning/config.json` → treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase changes no auth path |
| V3 Session Management | no | The C4 probe *consumes* an existing session; it changes nothing |
| V4 Access Control | no | `/api/upload` and `/api/files/…` authorization is unchanged |
| V5 Input Validation | **partially** | `entityId`/`fieldName` flow unsanitized into `path.resolve` — **pre-existing** (already logged in `.planning/STATE.md`). The phase must not widen it. Use a literal `phase43probe` in the experiment; never a traversal string. |
| V6 Cryptography | no | No new crypto |
| V7 Error Handling & Logging | **yes** | D-6 renames a log scope. `no-console` is `error`; use `src/lib/log.ts`. |
| V10 Malicious Code | **yes** | No packages installed (§ D4), so the slopsquatting surface is empty by construction |
| V14 Configuration | **yes** | The core of the phase — a Docker volume, an env var, and an image-layer `chown` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Backup file contains all production data in the working directory | Information disclosure | The runbook must state that the dump is unencrypted plaintext data, tell the operator to store it with restrictive permissions off the app host, and **not** suggest committing it. `.gitignore` should be checked for `*.dump`. |
| A restore procedure that requires superuser | Elevation of privilege | `--no-owner --no-privileges` + both extensions being `trusted = true` on PG16 means a database owner suffices. Do not tell operators to use a superuser. |
| `--clean --if-exists` against a mistyped target | Destruction of data | Lead with restore-into-a-fresh-database; present `--clean` second with its risk stated. Never in the drill (R6). |
| A password on a command line | Information disclosure | Use `docker compose exec` (which inherits `POSTGRES_PASSWORD` from the container env) or `~/.pgpass` for bare metal. **Never `PGPASSWORD=… psql` in a doc** — it lands in shell history. This repo has already leaked a password once. |
| Uploads world-readable in a volume | Information disclosure | The `chown nextjs:nodejs` in § C3 keeps ownership at uid 1001; do not add `chmod 777` to "fix" a permission error — that is the wrong fix for the R3/Pitfall-3 failure. |
| Path traversal via `entityId` | Tampering | Pre-existing and out of scope. Do not widen; do not exercise. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Managed Postgres providers (RDS/Cloud SQL/Neon/Supabase) allow `pg_trgm` and `unaccent` | B3 | A runbook caveat is over- or under-stated. Mitigated: the doc tells the operator to run `pg_available_extensions` first, which is correct regardless. |
| A2 | `drizzle/meta/_journal.json` is present in the runner image | B4 | Verification step 2 would fail. **The runner stage's `COPY` lines do not include `drizzle/`, so it probably is NOT present.** Verify before writing the doc; step 3 (`drizzle-kit migrate` reporting nothing to do) is authoritative anyway. |
| A3 | `systemd-tmpfiles` cleans `/tmp` on bare-metal hosts on a schedule | B5 / C1 | The bare-metal urgency is overstated. The mechanism is standard; the interval is distro-specific and unverified here. |
| A4 | Re-restoring without `--clean` cannot duplicate rows | B1 | Measured row count was unchanged (46,054) after a no-`--clean` re-restore, but I did not prove *why* — likely PK conflicts aborting the COPY. Do not claim idempotence for that path in the doc; recommend `--clean` or a fresh database. |
| A5 | The `.d.ts` augmentation is picked up by the Next.js production build as well as `tsc` | A5 | A type error could surface only in `docker compose build`. Low risk: `next.config.ts` sets no `ignoreBuildErrors`, `tsconfig.json` includes `**/*.ts`, and the builder stage does `COPY . .`. Task 3's rebuild exercises it in practice. |

## Open Questions

1. **Should the dead `useColumns` exports be deleted?**
   - Known: all three are exported and imported nowhere; the rendered tables use the legacy `columns`
     const. Deleting them would remove 7 of the 14 suppressions with no retype.
   - Unclear: whether that satisfies POLISH-01's "a shared typed `TableMeta` interface replaces all 14"
     — it would *delete* 7 rather than replace them, and would remove the *translated* variant.
   - Recommendation: **retype both clusters; do not delete.** Log the duplication as a backlog item.
     A scope expansion with no requirement behind it is how a two-requirement phase becomes five.

2. **Should Tier 3 (folding `TrashTableMeta` into the shared declaration) ship this phase?**
   - Known: not required. Tier 1 leaves trash compiling untouched (verified exit 0).
   - Unclear: whether the reviewer will read the surviving local `TrashTableMeta` as violating "one
     shared interface".
   - Recommendation: **ship Tier 1, and state the decision explicitly in the plan** — `TrashTableMeta`
     is a narrowing of the shared interface, not a competitor. Offer Tier 3 as a separate optional task
     so it can be dropped without reopening the argument.

3. **Does the phase add a `POSTGRES_*` block to `.env.example`?**
   - Known: compose requires three `POSTGRES_*` variables; `.env.example` has none, so it cannot start
     the Docker stack. `docker.md` never mentions them either.
   - Unclear: whether this is POLISH-02 ("operator can follow documented procedures" — a restore onto a
     fresh host requires them) or its own item.
   - Recommendation: **add them.** It is four lines, it is on the restore path, and leaving it means
     the runbook's first step cannot be completed on a clean host.

## Sources

### Primary (HIGH confidence — executed or read in this repo this session)
- `node_modules/@tanstack/table-core/build/lib/types.d.ts:31` — `TableMeta` declared as an empty interface
- `node_modules/@tanstack/react-table/build/lib/index.d.ts` — `export * from '@tanstack/table-core'`
- `npx tsc --noEmit` — baseline exit 0; TS2339 × 4 with suppressions removed; TS2578/TS2353/TS2559 with a
  partial augmentation; **exit 0** with the full augmentation and all 14 removed; TS2741 on the negative test
- `npx eslint src/types/PROBE-tanstack.d.ts` — exit 0
- `docker compose exec -T postgres pg_dump -U pipelite -Fc pipelite` — 34,299,898 bytes, 9.0 s, valid
  custom dump (host-redirected copy confirmed by `file`)
- `pg_restore` into `pipelite_restore_drill` — exit 0; row-count md5 `870a172d371b44a03f0941466e29cbcc`
  matching live across 37 tables; 81 indexes / 83 constraints / 38 routines / 3 extensions parity
- Throwaway `postgres:16-alpine` cluster with `POSTGRES_USER=appuser` — 45 errors / exit 1 without
  `--no-owner`; 0 errors / exit 0 with it; `-j` from stdin rejected outright
- `docker run -u 1001:1001 -v <fresh volume>:/app/uploads` — `touch: Permission denied` (root:root 0755);
  and `WRITE OK` / `SURVIVED NEW CONTAINER` with the directory chowned in the image
- `curl -X POST /api/upload` with `e2e/.auth/admin.json`'s session cookie — HTTP 200, response
  `path: /tmp/uploads/…`; download round-trip HTTP 200 with matching bytes
- `tar czf`/`tar xzf` between two throwaway volumes — uid/gid 1001 preserved
- `/usr/local/share/postgresql/extension/{pg_trgm,unaccent}.control` — `trusted = true`
- Repo files read directly: `docker-compose.yml`, `Dockerfile`, `docker-entrypoint.sh`, `tsconfig.json`,
  `eslint.config.mjs`, `vitest.config.ts`, `next.config.ts`, `package.json`, `.env.example`,
  `.github/workflows/ci.yml`, `drizzle/meta/_journal.json`, `drizzle/0016_dedup_functions.sql`,
  `drizzle/0013_parched_redwing.sql`, the three `columns.tsx` and three `data-table.tsx` files,
  `src/app/trash/trash-columns.tsx`, `src/app/trash/trash-table.tsx`,
  `src/components/bulk/__tests__/select-wiring.test.ts`, `src/app/api/upload/route.ts`,
  `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts`,
  `src/lib/import/pipedrive-api-client.ts`, `docs/admin/deployment/{docker,bare-metal,vercel}.md`,
  `docs/admin/{configuration,import-export,troubleshooting}.md`, `docs/index.md`
- Live database introspection: `pg_extension`, `pg_proc`, `pg_indexes`, `pg_constraint`,
  `information_schema.tables/routines`, `drizzle.__drizzle_migrations`, `custom_field_definitions`

### Secondary (MEDIUM confidence)
- `.planning/phases/43-type-safety-deployment-docs/43-CONTEXT.md` — decisions D-1…D-6; every
  measurement in it that I re-checked (14+2 suppressions, the phantom `db` service, the plain-SQL dump
  size, the `postgres`-only volume) reproduced exactly
- `.planning/ROADMAP.md:563-574`, `.planning/REQUIREMENTS.md:82-83`
- Project memory (`~/.claude/projects/.../MEMORY.md`) — Docker-only dev, no sudo for docker,
  `restart` does not rebuild, `.planning` force-add

### Tertiary (LOW confidence — flagged in the Assumptions Log)
- Managed-Postgres extension allow-lists (A1) — not verified against any provider
- Distro `/tmp` cleaning intervals (A3) — mechanism standard, interval unverified
- Why the no-`--clean` re-restore did not duplicate rows (A4) — observed, not explained

**No web search was used.** Every question was answerable from the installed packages, the repo, and
the running stack — which the brief correctly identified as the authoritative sources for the
`TableMeta` question in particular.

## Metadata

**Confidence breakdown:**
- **A / type safety: HIGH.** The recommendation was built and `tsc --noEmit` returned exit 0; the
  negative case returned TS2741; the suppressed error was measured as TS2339. Nothing here rests on
  training data.
- **B / backup-restore: HIGH.** Both commands executed, including the cross-role failure mode and its
  fix, on this exact Postgres 16.13. Two documented caveats are `[ASSUMED]` (A1, A2) and both are
  flagged inline.
- **C / uploads: HIGH.** The `/tmp/uploads` default, the empty container env, the root:root volume
  failure, the chown fix, the survival across containers, the tar round-trip, and the `curl` upload
  path were each executed and observed.
- **D / risks and ordering: MEDIUM-HIGH.** The ordering follows from measured dependencies (TS2578
  forces atomicity; the three-part compose change forces atomicity). The rebuild-cost and gate-collision
  risks are informed judgement, not measurement.

**Side effects of this research session:** none. Every probe file was reverted and every scratch object
dropped — `git status --porcelain` returns 0 lines, `npx tsc --noEmit` exits 0, all 16 `@ts-expect-error`
occurrences are back in place, `pipelite_restore_drill` no longer exists, both host dumps and both
throwaway containers/volumes are removed, and all three compose services are still up (`postgres`
healthy).

**Research date:** 2026-08-23
**Valid until:** 2026-09-22 (30 days — the stack is pinned: `@tanstack/react-table` 8.21.3 in the
lockfile, `postgres:16-alpine`, `node:20-alpine`). **One exception:** `e2e/.auth/admin.json` expires
**2026-08-29**; regenerate with `npx playwright test e2e/auth.setup.ts` if the C4 probe 401s.
