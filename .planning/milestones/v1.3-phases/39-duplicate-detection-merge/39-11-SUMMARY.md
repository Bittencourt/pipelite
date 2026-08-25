---
phase: 39-duplicate-detection-merge
plan: 11
subsystem: dedup
tags: [dedup, authorization, rsc, next-intl, radix-tabs, server-actions, url-state, admin-settings]

# Dependency graph
requires:
  - phase: 39-07
    provides: "`countPairs`, `listPairs` (`{ ok: false }` rather than an empty success), `MAX_PAIR_PAGE`, `runDuplicateScan`"
  - phase: 39-06
    provides: "`createScanState` (per-entity-type running guard + `SCAN_ALREADY_RUNNING` sentinel), `getScanState`, `getLatestScan`, `cancelScan`, `calculateScanProgress`, and the deliberate decision NOT to bury the ownership check inside `cancelScan`"
  - phase: 39-08
    provides: "`readOrgIdentityFields` (null means no certain tier), `writeOrgIdentityFields` (zod before the write)"
  - phase: 39-04
    provides: "every `dedup.*` message key in all three locales, plus the exact-set `REQUIRED_DEDUP_KEYS` contract this plan extends by one"
  - phase: 39-16
    provides: "the `Find duplicates` links already pointing at `/duplicates?type=organizations|people`, which 404'd until this plan's layout existed"
provides:
  - "`src/app/duplicates/layout.tsx` — the T-39-01 route gate, the authority for the whole subtree including the `/duplicates/[pairId]` route plan 39-15 adds"
  - "`src/app/duplicates/actions.ts` — six server actions, each with its own independent admin re-check: `startDuplicateScan`, `getScanProgress`, `cancelDuplicateScan`, `dismissPair`, `undismissPair`, `saveOrgIdentityFields`"
  - "`DedupErrorCode` / `DedupActionResult<T>` / `ScanProgressPayload` — the failure and poll vocabulary plan 39-13's scan panel and pair cards switch on"
  - "`src/app/duplicates/url-params.ts` — the ONE definition of `?type=`, `?page=`, `?dismissed=`, shared by the page and the tab bar"
  - "`src/app/duplicates/page.tsx` — the URL-driven server render: header, tabs, counts, three distinguishable emptinesses and a degraded-read panel that is not one of them"
  - "`src/app/duplicates/duplicates-tabs.tsx` — controlled Radix tabs, manual activation, `page` dropped on switch"
  - "`src/app/duplicates/identity-fields-form.tsx` — the admin control that turns the organization certain tier on"
  - "`dedup.review.unavailable` in all three locales (the degraded-read sentence; `REQUIRED_DEDUP_KEYS` 77 -> 78)"
affects: [39-13, 39-15, 39-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a source gate that DERIVES its subject list from the source it gates, so a seventh server action is covered the day it is added rather than the day someone remembers to list it"
    - "grep-gated absences documented WITHOUT spelling the forbidden token, because prose satisfies a grep as readily as code does (three tokens re-worded for this reason: the generic error key, the settings module path, and the display-typography classes)"
    - "search-param parsers in a database-free sibling module, imported by both the server component that reads the URL and the client component that writes it"
    - "conditional parallel reads: `identityNeeded ? read() : Promise.resolve(default)` inside `Promise.all`, so the people tab pays for neither identity query"

key-files:
  created:
    - src/app/duplicates/layout.tsx
    - src/app/duplicates/actions.ts
    - src/app/duplicates/url-params.ts
    - src/app/duplicates/page.tsx
    - src/app/duplicates/duplicates-tabs.tsx
    - src/app/duplicates/identity-fields-form.tsx
    - src/app/duplicates/__tests__/duplicates-actions-wiring.test.ts
  modified:
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json
    - src/messages/locale-parity.test.ts

key-decisions:
  - "The gate is THREE layers, not two: the layout (authority), every action independently, and a defence-in-depth re-check in `page.tsx`. The third exists because a layout and its page render CONCURRENTLY in the App Router — without it a non-admin's discarded response still costs five queries."
  - "`cancelDuplicateScan` refuses a non-starter EVEN WHEN THE CALLER IS AN ADMIN. Every user who can reach this route is an admin, so an admin exemption would make the P-6 check vacuous."
  - "`dismissPair` / `undismissPair` scope their UPDATE to the expected CURRENT status, not just the id. Without it, a stale button in a left-open tab could rewrite a `merged` or `superseded` pair into the review queue."
  - "`ScanProgressPayload` exposes `startedByViewer: boolean` rather than the starter's `userId`. P-6 needs only 'may I cancel'; shipping another user's id to every viewer would be a disclosure bought for nothing."
  - "One new message key (`dedup.review.unavailable`) rather than a hardcoded literal or a wrong-meaning reuse. The degraded-read panel is the FOURTH thing an empty tab can be and had no sentence in the catalog."
  - "The identity form's Save is `variant=\"outline\"`, not `default`. UI-SPEC spends this surface's single filled button on the scan CTA plan 39-13 adds."
  - "The second identity select is disabled until the first is set: 'nothing, then CNPJ' is indistinguishable in effect from 'CNPJ' alone, and offering it invites an admin to believe they configured two checks."
  - "No similarity-threshold control was added. This plan is NOT the first writer for `dedup.similarity_threshold` — that number is uncalibrated against this dataset and changing it remains a one-row operator UPDATE."

requirements-completed: []

metrics:
  duration: ~75 min (across three API-interrupted sessions)
  completed: 2026-08-19
  tasks: 3
  files-created: 7
  files-modified: 4
  commits: 4
---

# Phase 39 Plan 11: The /duplicates Route, Its Admin Gate and Its Shell — Summary

`/duplicates` now exists, is admin-only at three independent layers, and server-renders a
URL-driven two-tab shell whose four possible emptinesses read as four different sentences — plus the
admin control that turns the organization certain tier on.

## THE AUTHORIZATION GATE — what it is and what it covers

Stated plainly, because this plan is the security boundary for the whole feature and plan 39-16
already shipped links into it.

**Before this plan, nothing enforced admin-only on this route.** `src/middleware.ts` is five lines —
a `NextAuth(authConfig).auth` export with a catch-all matcher — and performs **no role check at
all**; it establishes a session for every non-API route and nothing more. `/duplicates` sits outside
`/admin`, so it inherits none of `src/app/admin/layout.tsx`'s enforcement either. The admin-only
visibility of 39-16's `Find duplicates` button was presentation and never a control. **`src/middleware.ts`
was not touched by this plan** (`git diff --stat src/middleware.ts` against the base is empty) — it
is not the control and is gated as not being one.

**Layer 1 — `src/app/duplicates/layout.tsx` is the authority.** Two redirects copied from
`admin/layout.tsx:11-19`: `redirect("/login?callbackUrl=/duplicates")` with no session, and
`redirect("/?error=unauthorized")` when `session.user.role !== "admin"`. A layout renders for
**every nested route**, so this covers:

- `/duplicates` itself,
- `/duplicates?type=…&page=…&dismissed=1` — any query string, since the gate does not read the URL,
- a **direct URL navigation** identically to a click, since the redirect happens server-side before
  any markup is produced,
- **`/duplicates/[pairId]`, which plan 39-15 adds next wave and inherits this file unchanged**, and
  any further segment added under `/duplicates` later.

**Layer 2 — every exported server action re-checks independently.** A layout redirect protects page
RENDERS; it cannot protect a server action, which is a POST endpoint the browser can invoke with no
page involved. All six actions open with the same four lines in the same order — `auth()`, the
`NOT_AUTHENTICATED` return, the `session.user.role !== "admin"` `NOT_ADMIN` return, then runtime
argument narrowing — and `runWithActor` opens only after all of it (T-36-02), so an unauthenticated
or non-admin call establishes no actor at all. `grep -c 'role !== "admin"'` is **6** in `actions.ts`
and **1** in `layout.tsx`.

`cancelDuplicateScan` carries a **second, narrower** authorization on top: `scan.userId !==
session.user.id` returns `NOT_STARTER`. This closes the gap `cancelPipedriveImport` leaves open
(it checks authentication and never ownership), and it refuses a non-starter **even when the caller
is an admin** — every user who reaches this route is an admin, so an admin exemption would make the
check vacuous (T-39-08, UI-SPEC P-6).

**Layer 3 — `page.tsx` re-checks as defence in depth.** Not the authority, and labelled as such in
the file. It exists because a layout and its page render **concurrently** in the App Router: without
it, a non-admin whose response is about to be discarded as a redirect would still cause five
database reads to execute. The precedent is `src/app/admin/fields/[entityType]/page.tsx`, which
double-gates under the already-gated `/admin` layout and has its own test asserting it (T-44-19).

**What is deliberately NOT a control, and is commented as such at each site:** the hidden
`Find duplicates` toolbar button (39-16), the cancel button UI-SPEC P-6 hides from a non-starter, and
the scan CTA P-7 disables during a run.

**Gated by** `src/app/duplicates/__tests__/duplicates-actions-wiring.test.ts` (26 tests), which
**derives** the action list from the source rather than hardcoding it, asserts the ordering by index
within each extracted function body, and carries four anti-vacuity assertions plus a count assertion
so a shared helper cannot make the per-function checks pass by textual accident.

## Task-by-task

### Task 1 — the route gate and every server action (`e8e181c` RED, `0e39f59` GREEN)

Written test-first: the gate test was committed failing (collection error, `actions.ts` absent), then
the implementation made it pass.

Six actions, plus the `DedupErrorCode` union (`NOT_AUTHENTICATED | NOT_ADMIN | INVALID | PAIR_GONE |
NOT_STARTER | SCAN_RUNNING | FAILED`) and `DedupActionResult<T>` in the `TrashActionResult` shape.
Codes, never prose — no driver string and no message-catalog key crosses this boundary.

- **`startDuplicateScan`** — narrows `scanId` with the `parseRecordId` shape test (non-empty, ≤64
  chars) and `entityType` against two frozen literals; maps `createScanState`'s refusal to
  `SCAN_RUNNING`; then calls `runDuplicateScan` **without awaiting**, inside
  `runWithActor({ kind: "user", userId })`. The fire-and-forget is commented with its real
  justification and its real cost: it works because this deployment is a long-lived Node container
  under `docker compose` — which is exactly what `dedup.scan.backgroundHint` promises the user — and
  it would not hold on a serverless platform, where this and the existing Pipedrive importer would
  break together, on the same day, for the same reason. The comment also records that
  `createScanState`'s guard is **read-then-write and therefore advisory, not atomic**, and that
  nothing in the UI may present single-flight as a guarantee.
- **`getScanProgress`** — never throws; a missing/reaped row is `{ success: true, scan: null }` so the
  poller can stop rather than retry forever. Returns `ScanProgressPayload` with a computed
  `percentage`, an ISO `startedAt`, and `startedByViewer` instead of the starter's user id.
- **`cancelDuplicateScan`** — the P-6 ownership comparison described above. Raises only the flag;
  the terminal status stays the scan loop's job, so a cancel arriving just after a scan finished
  cannot rewrite `completed` as `cancelled`.
- **`dismissPair` / `undismissPair`** — status-scoped UPDATEs returning `PAIR_GONE` when no row
  matched, `revalidatePath("/duplicates")` on success, `dismissedByUserId` taken from the session and
  cleared on undismiss.
- **`saveOrgIdentityFields`** — narrows to an array of at most two non-empty trimmed strings before
  `writeOrgIdentityFields` re-validates with zod.

**Both required negative proofs were RUN, not reasoned about:**

| Proof | Mutation | Result |
|---|---|---|
| 1 | deleted the admin re-check from `dismissPair` only | 3 tests failed, **naming `dismissPair`**: `src/app/duplicates/actions.ts: dismissPair does not re-check role !== "admin"`. Restored; green. |
| 2 | inserted a `runWithActor(...)` call above `auth()` in `startDuplicateScan` | 1 test failed, **naming `startDuplicateScan`**: `opens runWithActor BEFORE auth(), so an unauthenticated or non-admin call would establish an actor` (`expected 82 to be less than 8`). Restored; green. |

### Task 2 — the page, its tabs and its emptinesses (`ef12bd1`)

`page.tsx` follows `src/app/trash/page.tsx` shape for shape: `container py-8` / `space-y-6`, the icon
cluster with a `text-3xl font-bold` h1 (`e2e/viewport-320.spec.ts` locates it by role), search params
through validating parsers before anything reaches a query, and independent non-throwing reads via
`Promise.all`.

**Four outcomes, four renderings** — and the fourth is why `listPairs` returning `{ ok: false }`
rather than an empty success matters:

| Condition | Rendering |
|---|---|
| `!list.ok` | bordered, centred, muted `dedup.review.unavailable` — a degraded read, **not** an emptiness |
| rows present | `dedup.review.pairsFound` count line + the region plan 39-13 fills with pair cards |
| no scan row | `emptyNeverScanned` / `emptyNeverScannedBody` |
| open list empty, dismissed count > 0 | `emptyAllDismissed`, whose body **is** the `showDismissed` ghost button (one control, no redundant sentence) |
| dismissed view empty | `emptyNoPairs` + a `hideDismissed` ghost button, deliberately **without** the `{time}` body |
| scan `completed`, zero pairs | `emptyNoPairs` / `emptyNoPairsBody` with a formatted relative `{time}` |
| scan running / cancelled / error, zero pairs | **nothing** — see Known Stubs |

`duplicates-tabs.tsx` copies `trash-tabs.tsx`: controlled root, `activationMode="manual"` (1
occurrence), `TabsList` with `max-w-full overflow-x-auto`, labels from `nav.organizations` /
`nav.people`, counts rendered only when `counts !== null`, and a handler that sets `type` and
`sp.delete("page")` (1 occurrence). `dismissed` deliberately **survives** a tab change — it is a view
mode, not a cursor.

**Tab counts are scoped to the view being shown** (open counts in the open list, dismissed counts
behind `?dismissed=1`), so a label can never read `Organizations (405)` above the dismissed list.

### Task 3 — the organization identity-fields control (`d2cfba3`)

A client component taking `{ fieldNames: string[]; value: string[] }`, both resolved on the server.
Card titled `dedup.identity.title`, `dedup.identity.help` at Label typography muted, two `Select`s
(`primaryLabel` / `secondaryLabel`) each offering `dedup.identity.none` plus the available labels,
and a `dedup.identity.save` button inside a `useTransition` with `toast.success` /
`toast.error`. The selection is retained on failure — `saved` moves only in the success branch.

**All eight `dedup.identity.*` keys are used**; none is hardcoded.

**The offered names are deduped, and the reason is commented at the dedupe site:**
`custom_field_definitions` holds two active rows named `Segmento Organização` for
`entity_type='organization'`, and `customFields` is keyed by NAME, so both definitions address one
blob key. `describeField` in `src/lib/audit/present.ts` already resolves by name and returns the
first match, so collapsing them here is consistent with the presentation layer. **This works around
a pre-existing data anomaly and does not fix it** — the duplicate definition rows are still there.

**The card renders only under the organizations tab.** The conditional, quoted as the acceptance
criteria require:

```tsx
const identityNeeded = tab === "organizations"
…
{identityNeeded ? (
  <IdentityFieldsForm
    fieldNames={orgFieldNames}
    value={orgIdentityFields ?? []}
  />
) : null}
```

The same flag also **skips both identity reads entirely** on the people tab
(`identityNeeded ? readOrgFieldNames() : Promise.resolve([])`), so that tab pays nothing for a card
it will not show. People match on the native `email` column and need no identity field — stated in a
one-line comment at the render site.

`grep -c "identity-settings"` in the client file is **0**: the server-only module never reaches the
browser bundle, and its path is not spelled even in prose (see Deviations).

**Context that matters for whoever reads this next:** this form is the thing that makes the
organization exact-match tier live. `dedup.organization_identity_fields` is currently unconfigured
(`setting_rows = 0`), which is 39-08's deliberate fail-closed design, and it is why 39-07 measured
**405** organization pairs on live data rather than the tens of thousands the research predicted.
That number is not a bug, and it should move once an admin uses this card.

## Verification

| Check | Result |
|---|---|
| `vitest run src/app/duplicates` | **26 passed** |
| `vitest run src/messages/locale-parity.test.ts` | **9 passed** (with the 78-key contract) |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 125 pre-existing warnings, **none in any file this plan touched** |
| `npm run test` (both projects) | **122 passed / 1 skipped**, and **2 passed** in the rsc project |
| `git diff --stat src/middleware.ts` (vs base) | **empty** |
| `grep -c 'role !== "admin"'` | `actions.ts` = **6** (= the six exported actions), `layout.tsx` = **1** |
| `grep -c 'activationMode="manual"'` | **1** |
| `grep -c 'sp.delete("page")'` | **1** |
| `grep -c "text-3xl font-bold" page.tsx` | **1** |
| `grep -c "somethingWentWrong" page.tsx` | **0** |
| `grep -c "identity-settings" identity-fields-form.tsx` | **0** |
| `grep -ci "Segmento" identity-fields-form.tsx` | **1** |

**Hardcoded-literal scan, recorded as the acceptance criteria require:**
`grep -cE '>[A-Z][a-z]+ [a-z]' src/app/duplicates/page.tsx src/app/duplicates/duplicates-tabs.tsx`
returned **zero matches in both files** (exit 1, no output), so there was nothing to inspect by hand.
The same scan over `identity-fields-form.tsx` also returned zero. Every rendered string in all three
files comes from `getTranslations("dedup")` / `useTranslations("dedup")` / `useTranslations("nav")`.

No Docker rebuild was paid by this plan, and no Playwright run — plan 39-17 owns both. No migration
was generated; the journal still ends at `idx: 17`.

## Deviations from Plan

### Auto-fixed / auto-added

**1. [Rule 2 - missing critical functionality] The degraded-read panel had no sentence in the catalog**
- **Found during:** Task 2
- **Issue:** UI-SPEC forbids the generic app-wide error key on this surface and requires every string
  to come from the catalog, but the `{ ok: false }` panel — the whole point of `listPairs` not
  returning an empty success — had no `dedup.*` key. The only alternatives were a hardcoded English
  literal (forbidden, K-1) or reusing `dedup.scan.failedBody`, which is a claim about a scan and not
  about a read.
- **Fix:** added `dedup.review.unavailable` to all three locales (wording mirrored from
  `trash.error.unavailable`, which is the same sentence about a different list), added it to
  `REQUIRED_DEDUP_KEYS`, and updated that contract's exact-set length assertion **77 -> 78** and its
  group comment **17 -> 18**. The locale gate passes in both directions, which is what proves the key
  is present, non-blank, and non-identical across locales.
- **Files modified:** `src/messages/en-US.json`, `src/messages/pt-BR.json`, `src/messages/es-ES.json`,
  `src/messages/locale-parity.test.ts`
- **Commit:** `ef12bd1`

**2. [Rule 2 - security] A defence-in-depth admin check in `page.tsx`**
- **Found during:** Task 2
- **Issue:** the plan describes two controls. A layout and its page render **concurrently** in the App
  Router, so the layout's redirect does not prevent the page's reads from executing for a non-admin;
  the response is discarded, so nothing leaks, but five queries run for a refused visitor.
- **Fix:** the same two redirects in `page.tsx`, explicitly commented as **not** the authority,
  following `src/app/admin/fields/[entityType]/page.tsx`'s recorded T-44-19 precedent of double-gating
  under an already-gated layout. Neither acceptance grep is affected (they scope to `actions.ts` and
  `layout.tsx`).
- **Commit:** `ef12bd1`

**3. [Rule 2 - correctness] `dismissPair` / `undismissPair` scope on status, not only on id**
- **Found during:** Task 1
- **Issue:** `duplicate_pairs.status` has four values. An id-only UPDATE would let a stale button in a
  left-open tab rewrite a `merged` or `superseded` pair into `dismissed` or back into `open` — the
  second of which would put a merge screen in front of an admin for two records that no longer both
  exist.
- **Fix:** `and(eq(id), eq(status, expected))` in both directions, so a wrong-state row answers
  `PAIR_GONE` instead of silently rewriting history. `dismissedByUserId` / `dismissedAt` are cleared
  on undismiss rather than left behind.
- **Commit:** `0e39f59`

**4. [Rule 2 - information disclosure] `startedByViewer` instead of the starter's `userId`**
- **Found during:** Task 1
- **Issue:** the plan's `getScanProgress` says "returns the scan row". The row carries `userId`, and
  UI-SPEC P-6 makes a running scan visible to **everyone** who opens the page — so shipping the row
  verbatim would hand another user's id to every viewer.
- **Fix:** `ScanProgressPayload` resolves the comparison server-side and exposes a boolean. `startedAt`
  crosses as an ISO string.
- **Commit:** `0e39f59`

**5. [Rule 2 - fail-closed posture] `getActiveFieldDefinitions` wrapped**
- **Found during:** Task 3
- **Issue:** it is a bare `db.select()` with no guard, unlike the four dedup reads which all fail
  closed inside their own modules. `/duplicates` has no `error.tsx` above it, so an unguarded
  rejection would take the whole page down over a settings card.
- **Fix:** a local `readOrgFieldNames()` that catches, logs identifiers only, and returns `[]`. It also
  projects to names before the RSC boundary rather than shipping full definition rows (the D-44-02
  payload precedent).
- **Commit:** `d2cfba3`

**6. [Rule 2 - reachability] A view toggle below a non-empty list**
- **Found during:** Task 2
- **Issue:** the plan puts the `showDismissed` control inside the all-dismissed empty state only. An
  admin who dismisses every pair **but one** would then have no route to `?dismissed=1` at all, which
  makes UI-SPEC L-6's reversibility unreachable in the common case.
- **Fix:** a ghost `showDismissed` / `hideDismissed` button below the list when rows are present, shown
  in the open list only when there is something behind the flag (or when the count query failed and
  cannot rule it out). Suppressed where an empty state already carries the same control — one control
  per decision.
- **Commit:** `ef12bd1`

**7. [Rule 3 - blocking] `DedupActionResult`'s default type parameter**
- **Found during:** Task 1
- **Issue:** copying `TrashActionResult`'s `T = Record<string, never>` does not compile for an action
  whose success is just "it worked": intersected with `{ success: true }` it demands `success` itself
  be `never`. Trash never hits this because every trash action carries a payload.
- **Fix:** `T = Record<never, never>`, commented with why the analog's default cannot be copied.
- **Commit:** `0e39f59`

### Within-plan choices worth recording

- **`url-params.ts` is a new sibling module**, which the plan's Task 2 text explicitly permits ("keep
  those parsers in this file or a sibling, exported"). It is required rather than tidy: the parsers
  must be importable by a `"use client"` component, so they cannot live in a `page.tsx` that imports
  the database. The module imports one **type** and nothing at runtime.
- **`MAX_PAIR_PAGE` is not restated** in `url-params.ts`. It lives in `queries.ts`, which imports the
  database and therefore cannot be imported here, and `listPairs` clamps to it itself. The parser
  guarantees "a whole number at or above 1" plus a digit-count cap that stops a megabyte of digits
  reaching `Number()`; the product ceiling stays with its owner rather than being duplicated.
- **Three tokens were re-worded out of comments** so their grep gates keep working: the generic
  app-wide error key, the settings module's path, and the display-typography classes. Each site now
  says the token is deliberately unspelled and why. This follows 39-16's recorded practice — a gate a
  comment can satisfy is not a gate.
- **The identity Save button is `outline`, not `default`**, so this surface's single primary-filled
  button stays reserved for plan 39-13's scan CTA (UI-SPEC § Color).

## Known Stubs

Both are the deliberate seam this plan was split along ("the scan panel and the pair cards land in
plan 39-13, which touches `page.tsx` a second time — deliberately, so this plan's diff is reviewable
as a security boundary rather than as a layout"). Neither renders a false statement.

| Stub | File | Why, and who resolves it |
|---|---|---|
| The rows-present branch renders the `pairsFound` count line and then an **empty region** where the pair cards go | `src/app/duplicates/page.tsx` (comment names 39-13) | Pair cards, `dedup.review.merge` and `dedup.review.dismiss` are plan **39-13**. The actions they call are already exported and gated by this plan. |
| A scan that is `running`, `cancelled` or `error` with zero pairs renders **`panel = null`** | `src/app/duplicates/page.tsx` (comment names 39-13) | None of the three empty copies is true in that state — "no scan yet" is false and "nothing matched in the last scan" is a conclusion the scan has not reached. Plan **39-13**'s scan panel gives `running` a progress bar and `error` a destructive `dedup.scan.failed` Alert, which is what explains that emptiness honestly. Saying nothing was chosen over saying something wrong. |
| The never-scanned and zero-pairs empty states carry **no CTA** | `src/app/duplicates/page.tsx` | The `startOrganizations` / `rescan` controls are transitions with toasts and belong to 39-13's client scan panel. A dead button here would be worse than none. |

## Threat Flags

None. Every trust boundary this plan opens is in the plan's own register and is mitigated at the site:
T-39-01 (three layers, gated by a derived source scan with two run negative proofs), T-39-08
(`NOT_STARTER`, with no admin exemption), T-39-04 (every argument narrowed at runtime before any
query), T-39-07 (`SCAN_RUNNING`, with its advisory nature documented rather than papered over),
T-39-11 (narrowed here, zod'd in the writer, re-validated on every read), T-39-31 (shared parsers, one
definition). No package was installed. No migration was generated. No new network endpoint, file
access path or schema change was introduced beyond the six actions listed above.

## Self-Check: PASSED

All seven created files exist on disk; all four commits (`e8e181c`, `0e39f59`, `ef12bd1`, `d2cfba3`)
are present in `git log`. `STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` were not modified.
`package.json`, `vitest.config.ts` and `vitest.db.config.ts` were not modified (plan 39-10 owns them
this wave).
