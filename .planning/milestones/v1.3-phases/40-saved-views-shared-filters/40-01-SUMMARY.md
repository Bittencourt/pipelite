---
phase: 40-saved-views-shared-filters
plan: 01
subsystem: lib
tags: [url-params, whitelist, input-validation, export-guard, pure-functions, vitest, tdd]

# Dependency graph
requires:
  - phase: 37-trash-soft-delete
    provides: "src/lib/trash/entity-types.ts — the database-free parser module shape: frozen literal arrays, membership scans instead of property lookups, one type-only import from the schema"
  - phase: 39-duplicate-detection-merge
    provides: "src/app/duplicates/url-params.ts — the per-concern total parser this file copies verbatim in shape, including MAX_PAGE_DIGITS as the length-cap precedent"
  - phase: 38-bulk-actions-export
    provides: "38-CONTEXT.md:110-116 — the unbounded-export prohibition that hasExportableFilter now carries instead of an admin gate"
provides:
  - "SAVEABLE_FILTER_KEYS — the per-entity stored-key whitelist (U-3); this table IS the definition of what a view may contain"
  - "EXPORTABLE_FILTER_KEYS — an independently written second table; deal excludes pipeline (E-2)"
  - "hasSaveableFilter / hasExportableFilter — the two predicates, computed from the picked map so a junk value cannot authorize"
  - "pickFilterParams — the T-40-01/T-40-02 input-validation control; walks the whitelist, never the source"
  - "countFilters — the number views.manage.filterCount renders (G-3), defined as the size of the picked map"
  - "filtersToSearchParams — whitelist-ordered serialisation, so 40-05's URL-vs-blob comparison is order-independent"
  - "withViewEscape — the ?view=none serialiser (U-1), idempotent by construction"
  - "SavedViewsBarProps — the eight-prop B-2 contract, declared in src/lib/views/types.ts and read by V-40-5"
  - "SavedViewSummary, ViewEntityType, ViewFilters"
  - "V-40-6 — 460 pure-function assertions, with five RUN negative probes recorded below"
affects: [40-04 actions, 40-05 server resolver, 40-07 export filters, 40-10 saved-views-bar, 40-11 orgs/people call sites, 40-12 deals call sites, 40-13 activities call sites, 40-14 the withViewEscape call-site gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two independent literal tables instead of one derived table, when the two encode DIFFERENT rules that merely agree today"
    - "A parser loop that walks the WHITELIST rather than the source: an unlisted key is never looked up, so page/view/__proto__/constructor are ordinary non-members and the result object cannot be polluted"
    - "Idempotence by construction: delete unconditionally, re-append conditionally — so f(f(x)) === f(x) is a property of the code shape rather than of the input"
    - "An anti-vacuity assertion beside every negative one: the suite contains a test that FAILS when the escape is simply dropped, because every 'has no view key' test would still pass"

key-files:
  created:
    - src/lib/views/types.ts
    - src/lib/views/url-params.ts
    - src/lib/views/__tests__/url-params.test.ts
  modified: []

key-decisions:
  - "MAX_FILTER_VALUE_LENGTH = 256. A uuid is 36 and an ISO date is 10; the only free-text value is a search string a human typed. The cap's job is to stop a megabyte reaching an ILIKE pattern, a JSONB column and a log line — not to validate the value, which the queries own"
  - "withViewEscape REWRITES the whitelisted portion of the query from pickFilterParams instead of only appending the escape. The plan's own five-step recipe contradicted the plan's own asserted result for ?search= ; the assertion won. See the deviation below"
  - "pickFilterParams reads only whitelisted keys, so prototype-named keys need no special case. The returned object is a plain {} whose prototype is asserted to be Object.prototype"
  - "The entityType is treated as untrusted too: keysFor() scans VIEW_ENTITY_TYPES rather than indexing the table, because SAVEABLE_FILTER_KEYS['__proto__'] is Object.prototype and .includes on it would throw — turning a crafted entity type into the error page this module promises never to produce"
  - "Values survive VERBATIM, untrimmed. Trimming would be the parser repairing input, and it would make the URL and the stored blob disagree about what the list actually applied — which is exactly the comparison the 'Modified' badge is computed from"
  - "VIEW_ENTITY_TYPES is exported as the membership array; exhaustiveness is enforced by the tables' Record<ViewEntityType, …> type at compile time and by a runtime test asserting the array and the table keys are the same set"

patterns-established:
  - "When two predicates must diverge, write both tables out in full and put the reasoning between them — a derived table (SAVEABLE.filter(k => k !== 'pipeline')) is tidier and encodes the wrong rule"
  - "Negative probes are run against the COMMITTED implementation and restored with git checkout, and each is recorded with the exact test titles it turned red"

requirements-completed: [VIEW-01, VIEW-02, VIEW-03]

# Metrics
duration: 42min
completed: 2026-08-21
---

# Phase 40 Plan 01: The Saved-View URL Vocabulary Summary

**One database-free module now owns what a saved view may contain, when it may be saved, and when its records may be exported — with `hasSaveableFilter` and `hasExportableFilter` written as two independent tables so a pipeline-only `/deals` view is saveable but not exportable, and `withViewEscape` made idempotent by deleting `view` unconditionally before re-appending it.**

## Performance

- **Duration:** ~42 min
- **Tasks:** 2 of 2
- **Assertions:** 460 (354 after task 1, 460 after task 2)

## What Shipped

| Task | Commit | Content |
|------|--------|---------|
| 1 | `b56a5b0` | `types.ts` (four exports incl. the eight-prop `SavedViewsBarProps`), the two whitelist tables, `pickFilterParams`, `countFilters`, `filtersToSearchParams`, both predicates — 354 assertions |
| 2 | `ba46ad4` | `withViewEscape` plus its idempotence, anti-vacuity and read-only-params assertions — 460 assertions |

### The two predicates (E-2)

Written as two literal tables with the reasoning between them, because they encode different
rules that merely agree on three of four surfaces:

| entityType | SAVEABLE | EXPORTABLE |
|---|---|---|
| `organization` | `search` | `search` |
| `person` | `search` | `search` |
| `deal` | `pipeline`, `stage`, `owner`, `assignee`, `dateFrom`, `dateTo` | `stage`, `owner`, `assignee`, `dateFrom`, `dateTo` |
| `activity` | `type`, `owner`, `assignee`, `status`, `dateFrom`, `dateTo`, `search` | `type`, `owner`, `assignee`, `status`, `dateFrom`, `dateTo`, `search` |

A test computes the set difference across all four and asserts it is exactly `{ deal: ["pipeline"] }`,
and a second test asserts EXPORTABLE ⊆ SAVEABLE as a loop over `VIEW_ENTITY_TYPES` so a fifth entity
type cannot be added without satisfying it. The rule written above `EXPORTABLE_FILTER_KEYS` is
deliberately *not* "not pipeline" — it is "every key here is applied as a SQL predicate by the
matching `fetch*`, so it provably narrows the exported set", which is the invariant 40-07 gates.

## Deviations from Plan

### 1. [Rule 1 — Plan-internal contradiction] `withViewEscape` rewrites the whitelisted portion; the plan's recipe only appended

- **Found during:** Task 2 GREEN — one of 105 new assertions failed.
- **The contradiction:** the plan's `<behavior>` asserts
  `withViewEscape("organization", new URLSearchParams("search=")) === "view=none"`, while its
  `<action>` prescribes five steps (clone → delete `view` → pick → maybe set → stringify) that
  return `search=&view=none`. Both are the plan. I implemented the recipe first and the assertion
  failed by name with `expected 'search=&view=none' to be 'view=none'`.
- **Investigation:** `src/app/organizations/data-table.tsx:287-295` — when the search box is emptied
  today, the app pushes `router.push("/organizations")`, with no `search` key at all. `/people` does
  the same. So the assertion describes today's user-visible URL and the recipe would have introduced
  a `?search=` the app has never emitted.
- **Resolution:** the assertion is the contract. `withViewEscape` now deletes every saveable key and
  re-sets only the ones `pickFilterParams` accepted. Two classes of param, treated differently and
  documented as such: keys this module owns are rewritten (so a blank, over-long or repeated value
  disappears instead of lingering meaninglessly in the address bar), keys it does not own — `page`,
  `sort`, anything else — are preserved verbatim. `?page=2` still comes back as `page=2&view=none`,
  which is the plan's other asserted case.
- **Side benefit, load-bearing for 40-05:** the whitelisted portion now comes out in canonical
  whitelist order, so `withViewEscape` and `filtersToSearchParams` agree and the URL-vs-blob
  comparison stays a string comparison.
- **Recorded in the source** at `withViewEscape`, addressed to the next reader who diffs the code
  against the plan.
- **Files:** `src/lib/views/url-params.ts`, `src/lib/views/__tests__/url-params.test.ts`
- **Commit:** `ba46ad4`

### 2. [Rule 2 — missing critical coverage] Three assertions the plan did not ask for

Each closes a gap that would have shipped a green suite over a broken helper:

1. **`withViewEscape` must not mutate its argument.** Four of the six call sites build their query
   string from `useSearchParams()`, which returns a `ReadonlyURLSearchParams` whose `set`/`delete`
   **throw**. A helper that mutated in place would pass every value assertion in the plan and throw
   in the browser. The test uses a `URLSearchParams` subclass whose `delete`/`set`/`append` throw,
   and the implementation clones (inside a `try`, so an unreadable init cannot throw either).
2. **A repeated `view` param.** `?view=a&view=b&view=c` must collapse to `view=none`, i.e. `delete`
   must remove *every* value, not the first. Asserted directly.
3. **A throwing accessor on the source object.** "Never throws" is a property of the function, not
   of today's callers; `readRawValue` wraps the read per key so one hostile key cannot take the
   others down with it. This is also the assertion that caught negative probe 5.

## Negative Probes — all five RUN against the committed code, then restored

Each was applied to the committed implementation, run, and reverted with `git checkout --`. The
final state is the committed one: 460 pass, 0 fail, `tsc --noEmit` clean, `eslint` clean.

| # | Defect introduced | Result | Test titles that turned RED |
|---|---|---|---|
| 1 | `pipeline` added back to `EXPORTABLE_FILTER_KEYS.deal` | **3 failed** | `deal exports on exactly [...] — pipeline ABSENT`; `differs from SAVEABLE_FILTER_KEYS in exactly one place: deal/pipeline`; **`a pipeline-only deals view is NOT exportable`** |
| 2 | the escape append deleted from `withViewEscape` | **8 failed** | **`ANTI-VACUITY: a params object of ONLY non-saveable keys still gets the escape`**; `appends the escape to a URL with no params at all`; `escapes an EMPTY search value`; `preserves page and still escapes`; `normalises a hostile view value (T-40-05)`; +3 |
| 3 | `delete(view)` removed and `set` → `append` (idempotence broken) | **11 failed** | 7 × `is idempotent: …` (`no params at all`, `an empty search value`, `a whitespace-only search value`, `page alone`, `an already-escaped bare URL`, `a hostile view value`, `only non-saveable keys`); `REMOVES a pre-existing escape once a real filter is present`; `normalises a hostile view value (T-40-05)`; +2 |
| 4 | the `MAX_FILTER_VALUE_LENGTH` check removed (T-40-02) | **4 failed** | `drops a value longer than MAX_FILTER_VALUE_LENGTH`; `both predicates are computed from the PICKED map, so a junk value cannot authorize`; `removes a whitelisted key whose value the parser rejected`; `never throws on invalid percent-encoding or a megabyte value` |
| 5 | `pickFilterParams` "simplified" to copy every key except `EXCLUDED_URL_KEYS` (whitelist bypass, T-40-01) | **23 failed** | `keeps whitelisted keys and drops everything else`; `treats prototype-named keys as ordinary non-members and pollutes nothing`; `takes the FIRST value of a repeated param`; `returns keys in whitelist order`; 4 × `never throws: … with 'a throwing getter'` (×2 suites, ×4 entity types) |

Probe 5 is the one that matters most for the pattern's sake: the "simplified" version still passed
`drops page and view on every entity type`, because it special-cased those two keys. Only the
whitelist-positive assertions caught it. A grep-style gate on the string `page` would have been
satisfied by either version.

## TDD Gate Compliance

RED was recorded before each implementation:

- **Task 1 RED:** collection failure — `Cannot find module '../url-params'`. 1 suite failed,
  **0 tests ran**. GREEN: 354 pass.
- **Task 2 RED:** `TypeError: withViewEscape is not a function` — **104 failed / 354 passed** of 458.
  The 354 task-1 assertions stayed green, which is what confirmed the RED was scoped to the new
  behaviour and not a broken import. GREEN: 460 pass.

Gate commits are `feat(...)` rather than `test(...)` + `feat(...)`: the plan's two tasks each pair
their test file with their implementation, and splitting the RED into its own commit would have
committed a file that does not compile against the module it imports. Recorded here per the
plan-level gate rule rather than left implicit.

## Verification

| Check | Result |
|---|---|
| `npx vitest run src/lib/views/` | **460 pass, 0 fail** |
| `npm run typecheck` | **0 errors** |
| `npm run lint` (whole repo) | **exit 0** |
| `npx eslint src/lib/views` | **No issues found** |
| `grep -c 'from "@/db"' src/lib/views/url-params.ts` | **0** — the only `@/db` mention is in a prose comment |
| Type-only schema import (`key_links`) | `src/lib/views/types.ts:17` — `import type { EntityType } from "@/db/schema/custom-fields"` |
| Files touched outside `src/lib/views/**` | **none** — `git diff --stat` versus base is 3 new files, 1160 insertions, 0 deletions |

## Notes for Later Plans

**For 40-07 and 40-13 — my table assumes A8 gets fixed, and it does not break when it does.**
`hasExportableFilter("activity", { status: "overdue" })` is `true`, and I confirmed 40-CONTEXT
amendment A8 against the code: `activities/page.tsx:92` applies `status` only as
`params.status === "completed" → filters.completed = true`, and `page.tsx:168-178` filters
`dateFrom`/`dateTo` in JavaScript *after* the `limit` slice. So today three of `activity`'s seven
exportable keys narrow nothing. My table is written on the assumption that 40-13 makes them real SQL
predicates, and **no row of it needs to change when that lands** — the keys are already listed as
exportable, so 40-13 makes the guard honest rather than making it disagree with me. The failure mode
to watch is the reverse: if 40-13 slips and 40-07's structural gate ("every exportable key is a SQL
predicate in its fetcher") runs first, that gate will fail on `activity`/`status`,
`activity`/`dateFrom` and `activity`/`dateTo`. That is the gate working correctly, and the fix is
40-13, not this table.

**For 40-11/12/13 — the helper's contract in one line.** `withViewEscape` preserves params it does
not own and canonicalises the ones it does. Do not pre-filter the params you hand it, and do not
strip `page` before calling — it is preserved deliberately. Selecting a view (V-9) is the one case
that *should* build a fresh `URLSearchParams` from the view's stored filters rather than editing the
current one, because V-9 requires dropping `page`.

**For 40-14 — the call-site gate can rely on idempotence.** Applying the helper twice is applying it
once, proved over an 11-row table, so a call site that routes an already-escaped string through it
again is harmless. The gate can therefore check "every `router.push`/`replace` argument is or
interpolates a `withViewEscape(...)` call" without also having to prove each is applied exactly once.

**`EXCLUDED_URL_KEYS` is documentation, not mechanism.** `page` and `view` are excluded because they
are absent from all four whitelist rows, not because that array filters them. The array exists so
the exclusion is nameable and assertable. Anyone adding an exclusion must add it to the whitelists'
absence, not to this array.

## Self-Check: PASSED

- `src/lib/views/types.ts` — FOUND
- `src/lib/views/url-params.ts` — FOUND
- `src/lib/views/__tests__/url-params.test.ts` — FOUND
- commit `b56a5b0` — FOUND
- commit `ba46ad4` — FOUND
- working tree clean after all five probes restored — CONFIRMED

## Known Stubs

None. Every exported function is implemented and asserted; nothing in this plan returns a
placeholder, and no consumer is wired to mock data.
