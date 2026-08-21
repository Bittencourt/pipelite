# Phase 40: Saved Views & Shared Filters - Context

**Gathered:** 2026-08-21
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 4 decisions taken by the user, remainder on grounded defaults

<domain>
## Phase Boundary

The filter combinations users rebuild daily become named, shareable, exportable objects.

IN: persisting an existing filter set as a named view; private vs shared visibility; a per-user
default view per entity type; exporting the records a view matches.

OUT: **adding any new filter to any list page.** Decided explicitly — see the scope decision below.
Also out: sort persistence, column selection, per-user share grants, non-CSV export formats.
</domain>

<decisions>
## Implementation Decisions

### Decided by the user

**1. Persistence only — Phase 40 adds NO new filters.**
`/organizations` and `/people` today have exactly one filter each (a free-text `search` ILIKE across
three fixed columns, `organizations/page.tsx:29-31`). So a saved view on those pages stores one
string, and that is accepted. `/deals` and `/activities` already carry richer param sets and get
proportionally richer views. Adding filters to orgs/people is deferred to its own phase — it is a
second feature and neither the success criteria nor POLISH requirements ask for it.
Consequence to accept openly: on two of the four surfaces a "saved view" is thin. That is a truthful
reflection of today's filtering, not a defect of this phase.

**2. View export extends `ExportFilters`, with a hard no-empty-filters guard.**
This deliberately touches a locked Phase 38 decision, so the reasoning is recorded in full:
38-CONTEXT.md:110-116 forbids a filters-taking export action reachable by non-admins, because an
action receiving `{}` returns all 46,054 organizations — an admin-gate bypass. But `ExportFilters`
(`src/lib/export/types.ts:5`) is `{stage,owner,dateFrom,dateTo,ids}` and cannot express `search`,
`type`, `status` or `assignee`, so today it CANNOT reproduce a saved activities or organizations
view. Resolving a view to ids instead is not viable either: `BULK_MAX_IDS` caps at 100 and a view can
match tens of thousands of rows, which would make criterion 4 misleading rather than met.
So: extend `ExportFilters` with the missing params, AND make the action refuse an empty filter set
outright so it can never degrade into "export everything". 38's INTENT (no unbounded export reachable
without an admin gate) is preserved by the guard; its LETTER is amended. The guard is the load-bearing
part — it must be impossible to satisfy the action with no filters, not merely discouraged.

**3. A private view is invisible to everyone, admins included.**
Criterion 2 says a private view "stays invisible to everyone else", and that is taken literally. This
DEPARTS from the app's established `owner || role === "admin"` visibility idiom
(`src/app/deals/actions.ts:83`, locked for Trash in 37-CONTEXT.md:31) — the departure is intentional,
because "private" that an admin can read is not private, and a user marking a view private is making
a statement about their own workspace, not about record access. Note this does NOT weaken record
visibility: a shared or private view is only a saved filter set; the records it resolves to remain
governed by the existing per-record rules.

**4. A saved deals view includes its `pipeline`, and degrades if that pipeline is gone.**
`pipeline` selects which kanban board renders, so a deals view without it is not reproducible. An
invalid pipeline currently renders a "pipeline not found" page (`deals/page.tsx:87`); a saved view
pointing at a deleted pipeline must fall back to the default board instead of that page.

### Claude's discretion — grounded defaults from the codebase scout

**Storage.** One table for all entity types with an `entityType` discriminator (mirrors
`dedup_scans`). The filter set is a JSONB `filters` column holding the URL param map, NOT typed
columns — the four surfaces have disjoint param sets and typed columns would mean ~12 nullable ones.
Validate on both save and read, with the READ side authoritative and non-throwing: a stale `stage` or
`owner` id must degrade, never 500. Follow `src/app/duplicates/url-params.ts` for the parser-module
shape (one exported parser shared by the server page and the client writer, never throws, no DB
import) and `src/db/schema/dedup-scans.ts` for the table shape, registering in
`src/db/schema/index.ts` and `_relations.ts`.

**A view stores filters only** — not sort, columns, or page number. No sort or column UI exists
anywhere in the app today, so storing them would invent features. Reserving a JSONB key for later is
fine.

**Sharing.** An `isShared` boolean, not per-user share rows — criterion 2 asks for "a teammate sees
it", and per-user grants are unrequested. Only the owner (or an admin) may edit or delete a view.
A user MAY set someone else's shared view as their own default, otherwise sharing has little payoff.
Deleting a shared view that someone had defaulted to falls back to unfiltered, with no error.

**Default view.** Stored as a per-user, per-entityType flag on the view row rather than in a separate
prefs table. Applied by REDIRECTING to the view's params, not by silently applying filters behind a
bare URL — the URL must remain the single source of truth, because every toolbar reads
`searchParams`. Applied only when the incoming URL carries no params, so a deliberate bare-filter
visit is never hijacked. Provide an explicit "All records" pseudo-view as the escape hatch.

**Export.** CSV only (38 precedent, `exportToCSV` in `src/lib/export/formatters.ts:218`). Cap the row
count (~50k) rather than streaming. Note the papaparse header defect is ALREADY FIXED —
`deriveCsvColumns` (`src/lib/export/csv-columns.ts:35`) unions all row keys — so custom-field columns
are safe for anything routed through `exportToCSV`.

**Failure posture.** There is no `error.tsx` above these routes, so a failed view read must degrade to
the unfiltered list, following the `readOrgIdentityInputFields` precedent
(`organizations/page.tsx:123`).
</decisions>

<code_context>
## Existing Code Insights

**Every filter is already fully URL-serialisable and server-applied, on all four surfaces.** This is
the phase's most important input: "save a view" is pure persistence, with no serialisation layer to
build.

| Surface | URL params | Client writer |
|---|---|---|
| `/organizations` | `search`, `page` (`page.tsx:67`) | `data-table.tsx:291` (`router.push`) |
| `/people` | `search`, `page` (`page.tsx:75`) | `data-table.tsx:161` |
| `/deals` (kanban) | `pipeline`, `stage`, `owner`, `assignee`, `dateFrom`, `dateTo` (`page.tsx:30-37`) | `deal-filters.tsx:50` |
| `/activities` | `type`, `owner`, `assignee`, `status`, `dateFrom`, `dateTo`, `search`, `page` (`page.tsx:51-60`) | `activity-filters.tsx:65-73` |

All four pages are server components reading `await searchParams`. There are no column filters, no
sort UI, and no custom-field filters anywhere in the app.

**Reusable:** `src/app/activities/activity-filters.tsx:65-93` is the richest filter toolbar and the
natural host for a view picker plus a "Save view" control. `src/lib/export/formatters.ts` provides
`fetchFilteredData(options)`. `src/components/bulk/bulk-action-bar.tsx` holds the Blob/ObjectURL
download idiom (there is no `/api/export` route). `src/db/schema/notification-preferences.ts` is the
per-user-prefs precedent.

**Migration journal ends at `idx: 17`** — this phase adds `0018`, which is also the number the
deferred dedup scan-guard fix wants. Whichever lands first takes it; check the journal before
generating.

**Users:** 2 admins + 1 member live (6 more members soft-deleted). Private-vs-shared is therefore
genuinely testable, though with only one member account. Note for the record: Phase 39 asserted
"every user here is an admin" — that was WRONG, and any reasoning inherited from it should be
re-checked.

**Audit log:** 36-CONTEXT.md:61 explicitly anticipates Phase 40 as a consumer.
</code_context>

<specifics>
## Specific Ideas

- The `/activities` toolbar is the model to follow for where the view picker lives.
- Criterion 3's "lands on it when opening that list" is satisfied by a redirect, so the address bar
  keeps telling the truth about what is filtered.
- Criterion 2 is testable with the real user set: one member account is enough to prove a private
  view stays invisible and a shared one appears.
</specifics>

<deferred>
## Deferred Ideas

- Adding real filters (owner, date, custom fields) to `/organizations` and `/people` — the thing that
  would make saved views genuinely valuable on those two pages. Its own phase.
- Sort and column-selection persistence in a view (no such UI exists yet).
- Per-user share grants, rather than a single shared/private flag.
- Non-CSV export formats.
</deferred>

---

## AMENDMENTS — corrections to this file from the UI-SPEC's measurements (2026-08-21)

The UI-SPEC found three errors in the decisions above. **Where they conflict, 40-UI-SPEC.md wins.**
Recorded here rather than silently overwritten, so the reasoning survives.

**A1. The "All records" escape hatch was unreachable as specified.** This file locked the default-view
redirect to fire "when the incoming URL carries no params" AND an explicit "All records" pseudo-view.
Those two are mutually exclusive: selecting All records navigates to a bare path and gets redirected
straight back into the default view. Worse, **six existing controls already navigate to bare paths**
and would each bounce a user into their default view — the orgs and people empty-search branches,
`activity-filters.tsx`'s `clearAll` and its last-chip `setFilter`, the activities no-results "Clear
filters" button, and `deal-filters.tsx`'s `clearAll` with no pipeline set. The UI-SPEC resolves this
with a `?view=none` param and one `withViewEscape` helper, gated at the call sites (V-40-4).

**A2. The no-empty-filters export guard did not preserve its own intent.** Decision 2 above says the
guard must make it impossible to export with no filters. But Decision 4 requires a deals view to carry
`pipeline`, and a pipeline-only view passes any naive non-empty test while resolving to up to 25,195
deals — precisely the unbounded export 38-CONTEXT.md:110 forbids. Two predicates are required, not
one: `hasSaveableFilter` counts `pipeline`, `hasExportableFilter` does NOT. Consequence, accepted: a
`/deals` view carrying only a pipeline is saveable but **not exportable**. That is the correct trade —
criterion 4 is narrowed rather than the export gate being widened.

**A3. `activity-filters.tsx` is the WRONG host.** This file called it "the richest filter toolbar and
the natural host". Measured at 320x640, it is the one container in the app that already clips content
off the top of the viewport: Radix computed `--radix-popover-content-available-height: 347px` and the
popover rendered **388px tall at `top: -41`**, because `popover.tsx:33` never consumes that variable.
The views bar therefore mounts on its own row ABOVE `<ActivityFilters>`, and nothing in this phase
lives in a Popover.

**A4. Criterion 1 breaks visibly on three of four surfaces without a fix this file did not anticipate.**
The search `<Input>` does not re-sync when the `search` param changes — `defaultValue` is ignored
post-mount, so navigating to a saved view filters the list correctly while the search box still shows
the old text. Three call sites. This is a criterion-1 failure, not polish; the UI-SPEC gates it
(V-40-7).

**A5. Corrections to figures quoted above:** `REQUIRED_DEDUP_KEYS` is **83** (not 79) and
`REQUIRED_AUDIT_KEYS` is **88** (not 86). Also two of the three live users have `name = NULL`, which
any "shared by X" attribution must handle.

**A6. Accepted limitation:** because Decision 3 hides private views from admins too, a soft-deleted
user's private views become permanently unreachable by anyone. Six soft-deleted users exist. Judged
acceptable — a saved view is a filter set, not data — but recorded rather than discovered later.
