---
phase: 39-duplicate-detection-merge
plan: 15
subsystem: dedup
tags: [dedup, merge, radix-radio-group, rsc, next-intl, server-actions, authorization, responsive]

# Dependency graph
requires:
  - phase: 39-11
    provides: "`layout.tsx` — the authority for the whole `/duplicates` subtree, which already covers this route; `DedupErrorCode` / `DedupActionResult<T>`; the `auth() -> NOT_AUTHENTICATED -> NOT_ADMIN -> narrow -> runWithActor` ordering this plan's action copies"
  - phase: 39-09
    provides: "`mergeRecordsMutation`, `MergeErrorCode` (`NOT_FOUND | SAME_RECORD | NOT_IN_PAIR | FAILED`), the mutation's own V-9 membership check, and `MERGE_EXCLUDED_COLUMNS` carrying the three generated columns"
  - phase: 39-07
    provides: "`getPairDetail` — the pair, both rows in full, and child counts computed from the same column predicates the merge reparents on"
  - phase: 39-02
    provides: "`buildMergeFieldGroups`, `resolveMergeDefaults`, `applyMergeChoices`, `MergeChoice` / `MergeChoiceMap`, and `describeField`'s export from the audit layer"
  - phase: 39-04
    provides: "every `dedup.merge.*` key in three locales, plus `audit.value.empty` / `unavailable` / `files` / `yes` / `no`"
provides:
  - "`src/components/ui/radio-group.tsx` — the vendored shadcn block, unmodified, on the repo's unified `radix-ui` convention"
  - "`src/app/duplicates/[pairId]/actions.ts` — `mergeRecords`, the admin-gated merge endpoint; entity type read from the pair row, membership re-validated, `NOT_FOUND` / `SAME_RECORD` / `NOT_IN_PAIR` collapsed to one user-facing code"
  - "`src/app/duplicates/[pairId]/page.tsx` — the server render: the comparable field set, both survivor orientations, the pre-selection and every display value computed server-side"
  - "`src/app/duplicates/[pairId]/merge-form.tsx` — M-1 through M-9: the stacked field picker, the survivor selector, the what-moves list, the confirmation and the submit"
  - "`src/app/duplicates/__tests__/merge-form-wiring.test.ts` — 32 comment-stripped source assertions gating R-3, M-9, M-7, M-5, M-4 and the action's ordering"
affects: [39-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "the server computes BOTH survivor orientations and the client selects one, so a survivor toggle is instant without moving the partition decision into the browser"
    - "stored values formatted server-side through `toAuditValue`, with whitespace collapsed and NOTHING truncated — the audit timeline's 120-character cap is right for a history row and wrong for a value the user is choosing between"
    - "a dynamic message key resolved with the root translator's `has` rather than a prefix test, so the native label-key prefix is never spelled in the file that renders it"
    - "a source gate whose every negative assertion has an anti-vacuity partner, so deleting the subject fails a different assertion"

key-files:
  created:
    - src/components/ui/radio-group.tsx
    - src/app/duplicates/[pairId]/actions.ts
    - src/app/duplicates/[pairId]/page.tsx
    - src/app/duplicates/[pairId]/merge-form.tsx
    - src/app/duplicates/__tests__/merge-form-wiring.test.ts
  modified: []

key-decisions:
  - "`mergeRecords` does NOT take an entity type. The browser names the pair and the two records; the entity type is read off the `duplicate_pairs` row. A caller-supplied one would be a way to point the merge's reads and writes at the wrong table (T-39-04). This is narrower than the plan's signature."
  - "The server computes the field partition and the defaults for BOTH possible survivors, not one. Which section a field belongs to depends on which record survives, so a single orientation would have forced the client to recompute the partition on every survivor flip — moving the server's authority over the comparable field set into the browser."
  - "Values are formatted on the server through `toAuditValue`, not stringified. A person's `organizationId` is a foreign key and an id must never reach a user (T-36-22); a file or multi-select custom field holds an array that template-stringifies into something nobody can act on."
  - "Whitespace is collapsed but nothing is truncated. `collapseAndTruncate` (the timeline's helper) also caps at 120 characters, which would defeat M-5's whole point — a value the user is choosing between must be readable whole."
  - "Organization reference names are read WITHOUT a `deletedAt` predicate. A person can point at an organization in Trash; the row is still there and its name is still the honest answer, and filtering it out would render \"no longer available\" on BOTH sides of a conflict, making the choice unmakeable."
  - "`pairId` failing its shape test renders the SAME refusal as a pair with nothing to merge, and without touching the database. Telling the two apart would say more about the database than this screen has any reason to."
  - "The gone state keeps the form on screen and disabled rather than replacing it. The user is looking at two records and needs to be told which state they are in; the only live control is the way out."
  - "The CLI's `radix-ui` ^1.4.3 -> ^1.6.7 bump and its 1184-line lockfile rewrite were reverted. The block needs nothing from 1.6.x, and `node_modules` is a shared symlink with a parallel executor this wave."

requirements-completed: []

metrics:
  duration: ~55 min of execution (after one API-terminated exploration pass)
  completed: 2026-08-19
  tasks: 3
  files-created: 5
  files-modified: 0
  commits: 4
---

# Phase 39 Plan 15: The Merge Screen — Summary

`/duplicates/[pairId]` is a stacked per-field option list at every viewport, whose survivor selector
sets every default in one click, whose what-moves list states what will be reassigned before the
merge rather than after it, and whose endpoint re-validates the pair's membership independently of
the mutation that performs it.

## What was built

| Commit | What |
|---|---|
| `5434b89` | the vendored `radio-group` block and `mergeRecords` |
| `7eb171d` | `merge-form.tsx` — M-1 through M-9 |
| `479354e` | `page.tsx` — the server render |
| `63f2233` | the 32-assertion source gate, and the three run negative proofs |

The commit order puts the client component before the page that renders it, deliberately: the API
terminated an earlier session of this plan mid-flight, so each commit had to typecheck on its own,
and `page.tsx` cannot typecheck before the component it imports exists. The plan's task order is
otherwise unchanged.

## The vendored block, and the dependency bump that was reverted

`./node_modules/.bin/shadcn add radio-group` produced exactly the file 39-RESEARCH described. All
three properties confirmed by reading it:

| Property | Result |
|---|---|
| `grep -c "from \"radix-ui\"" ` | **1** — the repo's unified convention (K-5), no import normalisation needed |
| `grep -c "@radix-ui/react-radio-group"` | **0** |
| user-visible strings | **zero** (unlike the `sheet` block 45-04 had to fix) |
| `fetch` / `process.env` / `eval` / dynamic import | **0** |
| length | **45 lines** |

**The CLI also bumped `radix-ui` from `^1.4.3` to `^1.6.7` and rewrote 1184 lines of
`package-lock.json`. Both were reverted** (`git checkout -- package.json package-lock.json`), for
two reasons that agree: the plan's acceptance criteria require no dependency change, and
`node_modules` in this worktree is a **symlink into the shared checkout** that a sibling executor
(plan 39-13) is reading from at the same time. `git diff <base> HEAD -- package.json
package-lock.json` is **empty**.

The shared install was **not** disturbed by the CLI: `/home/pedro/programming/pipelite/package.json`
still reads `^1.4.3`, the installed `radix-ui` is still **1.4.3**, and the mtimes of
`node_modules/radix-ui`, `node_modules/@radix-ui/react-slot` and `node_modules/react-dom` are all
from **2026-08-18 22:29**, hours before this session. `RadioGroup` is present in the installed 1.4.3
(`typeof require("radix-ui").RadioGroup === "object"`), and the whole suite typechecks against it.

## The authorization, stated plainly

**This route adds no page-render control, and that is the design.** `src/app/duplicates/layout.tsx`
(plan 39-11) is the authority for the subtree and renders for every nested route, so it already
refuses a non-admin here — including on a direct URL navigation, since its redirect happens
server-side before any markup exists. `page.tsx` says so in its header, so that a reader neither adds
a redundant redirect nor assumes one exists somewhere else. `grep -c 'role !== "admin"' page.tsx` =
**0**, asserted by the gate.

**What a layout cannot protect is a server action**, and `mergeRecords` therefore re-checks the role
at its own top. `grep -c 'role !== "admin"' '[pairId]/actions.ts'` = **1** (one exported action, the
39-11 discipline of one check per action). The order is asserted by index in the gate: `auth()` →
`NOT_AUTHENTICATED` → the role check → argument narrowing → the pair read and membership test →
**then** `runWithActor`, so a refused call establishes no actor at all (T-36-02).

### The membership control, and both code locations

The plan requires the survivor-in-pair check to exist at this layer **independently** of the
mutation's. Both quoted, as the acceptance criteria ask:

**This plan, `src/app/duplicates/[pairId]/actions.ts`:**

```ts
const members = [pair.recordAId, pair.recordBId]
const membersMatch =
  survivorId !== loserId && members.includes(survivorId) && members.includes(loserId)

if (!membersMatch) { … return { success: false, code: "PAIR_GONE" } }
```

**Plan 39-09, `src/lib/mutations/dedup.ts` (unchanged by this plan):**

```ts
if (pairId !== null) {
  const [pairRow] = await db.select({ recordAId: …, recordBId: … }) …
  const members = pairRow ? [pairRow.recordAId, pairRow.recordBId] : []
  if (!members.includes(survivorId) || !members.includes(loserId)) {
    return { success: false, error: "NOT_IN_PAIR" }
  }
}
```

Neither is redundant, and the file says so at the site: **this** one covers a crafted POST, because
`pairId`, `survivorId` and `loserId` all arrive from a browser and without it a request naming one
pair and two unrelated ids would merge anything into anything; **the mutation's** covers a future
call site — a workflow action, a CLI, a second screen — that never passes through this file. It is
the one tampering path in this phase whose success the user cannot undo.

**The distinctness test is folded into the same condition** rather than answered separately. The two
stored members are distinct by construction, so a request whose survivor equals its loser fails for
the same reason an outsider does, and gets the same answer — a self-merge would soft-delete the
record it had just updated and reparent its children onto themselves.

### One answer for three refusals (T-39-37)

```ts
const code = result.error === "FAILED" ? "FAILED" : "PAIR_GONE"
```

`NOT_FOUND`, `SAME_RECORD` and `NOT_IN_PAIR` are three facts to the mutation and **one** fact to the
browser. If a crafted request could tell "that pair does not contain that id" apart from "one of
these records has been deleted", the response would be an oracle for probing which of the two ids
was wrong. The gate asserts the mapping literally **and** asserts that neither `"NOT_IN_PAIR"` nor
`"NOT_FOUND"` is spelled as a returned code anywhere in the file, so the three cannot be split apart
without the test changing.

## The one signature change from the plan

**`mergeRecords` takes no `entityType`.** The plan's Task 1 text narrows `pairId`, `survivorId` and
`loserId`; the mutation additionally needs to know which table it is merging. That value is now read
off the `duplicate_pairs` row inside the action:

```ts
mergeRecordsMutation({ entityType: pair.entityType, pairId, survivorId, loserId, choices })
```

A client-supplied entity type would be a way to point every read and write of the most destructive
operation in the application at the wrong table, and no narrowing can catch it — both values are
legal literals. Removing the parameter removes the attack rather than validating it. Gated:
`entityType: pair.entityType` is asserted present, and `input?.entityType` asserted absent.

The choice map is also **bounded** (200 entries, 128 characters per key) and **strict about values**
— anything outside `{"survivor","loser"}` refuses the call. `applyMergeChoices`' leniency (an
unrecognised value falls back to the default rather than throwing) exists so a client bug cannot
destroy a filled-in form; it is not a licence for the boundary to forward whatever arrived.

## The server owns what may be chosen

`page.tsx` computes the comparable field set, the three-way partition, the pre-selection **and the
display form of every value**, and passes them down. `merge-form.tsx` contains **zero** occurrences
of `buildMergeFieldGroups` and `resolveMergeDefaults`; `page.tsx` contains exactly **one call site**
of each.

**On the acceptance criterion's `grep -c` = 1:** a raw `grep -c` returns **2** for each, because the
import line matches as readily as the call does — the same trap this phase hit four times. The gate
therefore asserts **call sites** with `callArguments(pageSource, "buildMergeFieldGroups").length ===
1`, which is what the criterion means and what a `grep -c` cannot express. Both functions are invoked
**twice** from that one site, which is the next decision:

**Both survivor orientations are computed on the server.** Which section a field falls into depends
on which record survives — a field only the loser fills is a "filled only" question, and the moment
the survivor flips it becomes a field the survivor already answers, which lands in `identical`. With
one orientation, flipping the selector would have forced the client to re-partition, i.e. to decide
which keys a merge may write. Instead `buildOrientation` is called once per possible survivor and the
selector picks the matching set. `resolveMergeDefaults` rides along inside it, so the two orientations
cannot stop agreeing about how an orientation is built.

### Values are typed, not stringified

Every value goes through `toAuditValue` and then a nine-case formatter mirroring `AuditValueText`,
**minus the truncation**. Two of the nine make this load-bearing rather than tidy:

- **`people.organizationId` is a foreign key** — the only reference column in the compared set, since
  `ownerId` is excluded from the merge outright (T-39-13). Without resolution the picker would ask a
  user to choose between two UUIDs, and an id must never reach a user (T-36-22). Resolved through
  `resolution.references`, keyed `organizationId:<id>` exactly as `present.ts` keys it.
- **File and multi-select custom fields hold arrays**, which template-stringify into something no
  user can act on.

`collapseAndTruncate` was deliberately **not** reused: its 120-character cap is right for a history
row and wrong here, and it is the same rule that forbids a CSS clamp on these cards (M-5).
Whitespace collapsing is kept, because one pasted paragraph would otherwise contribute forty
blank-ish lines to an option card.

### Labels: one resolver, and no label key spelled in the client

`describeField` emits two kinds of string — a message key for a mapped native column, the verbatim
user-authored name for a custom field. `buildMergeFieldGroups` already applies it, so `page.tsx`
resolves rather than re-names:

```ts
if (field.key.startsWith(CUSTOM_FIELD_PREFIX)) return field.label
return tRoot.has(field.label) ? tRoot(field.label) : field.label
```

`has` on the ROOT translator rather than a prefix test, for three reasons: an unmapped native column
carries an already-humanised string that no catalog holds (`deletedAt` is the one column that reaches
that path today, and it is excluded from merges anyway); the custom test comes first, so a field
somebody named after a message key still renders as the name they typed; and it means the native
label-key prefix is **never spelled** in either of these files. `AUDIT_FIELD_LABELS` = **0** in the
form and that prefix = **0** in the form, both asserted — with the test building the token by
concatenation so its own assertion cannot satisfy itself.

## The three RUN negative proofs

Each mutation was applied, the suite re-run, the named failure recorded, and the file restored with
`git checkout -- <file>` (never a blanket reset).

| # | Mutation | Failing test, by name | Message |
|---|---|---|---|
| 1 | dropped the `sm:` prefix from the first `sm:grid-cols-2` in `merge-form.tsx` | `R-3: nothing puts two records side by side below sm > src/app/duplicates/[pairId]/merge-form.tsx has no unprefixed two-column grid` | "a two-column grid with no breakpoint prefix would put two values side by side at 320px, where each column is about 112px wide" — `expected [ '' ] to deeply equal []` |
| 2 | added `sticky bottom-0` to the submit row | `M-9: the submit row is not pinned to the viewport > the submit row is attached to nothing` | "the submit row uses \"sticky\". Phase 45's D-45-02 is an OPEN UAT item…" — `expected 1 to be +0` |
| 3 | imported `AlertDialogTrigger` into `merge-form.tsx` | `M-7: the confirmation has no trigger component > declares no AlertDialogTrigger` | "an asChild trigger whose child crossed the RSC boundary renders as null, silently — the CFUI-01 defect" — `expected 1 to be +0` |

In each case exactly **1 of 32** tests failed and the other 31 passed, which is also evidence the
assertions are scoped rather than global.

## Verification

| Check | Result |
|---|---|
| `vitest run src/app/duplicates src/components/ui` | **108 passed** (5 files) |
| `vitest run src/app/duplicates/__tests__/merge-form-wiring.test.ts` | **32 passed** |
| `vitest run src/lib/mutations/dedup.test.ts` (the generated-column drift alarm) | **25 passed** |
| `vitest run src/messages` (locale parity, 78-key contract) | **passed**, unchanged — this plan added no message key |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**; 125 pre-existing warnings, **none in any file this plan touched** (`npm run lint \| grep -c "duplicates\|radio-group"` = 0) |
| `npm run test` (both projects) | **2636 passed / 21 skipped / 1 failed** — the one failure is pre-existing and out of scope, see below |
| `git diff <base> HEAD -- package.json package-lock.json vitest.config.ts vitest.db.config.ts src/app/duplicates/page.tsx` | **empty** |
| `git diff <base> HEAD --name-only` | exactly the five new files |
| migration journal | still ends at `idx: 17`; no migration generated |

**Grep counts recorded:**

| Grep | File | Count |
|---|---|---|
| `role !== "admin"` | `[pairId]/actions.ts` | **1** |
| `role !== "admin"` | `[pairId]/page.tsx` | **0** |
| `text-3xl font-bold` | `[pairId]/page.tsx` | **1** |
| `from "radix-ui"` / `@radix-ui/react-radio-group` | `radio-group.tsx` | **1** / **0** |
| `AlertDialogTrigger` | `merge-form.tsx` | **0** |
| `truncate` / `line-clamp` | `merge-form.tsx` | **0** / **0** |
| `variant="destructive"` | `merge-form.tsx` | **2** — the dialog's action, and the gone-state Alert; each read and asserted individually |
| `useEffect` | `merge-form.tsx` | **0** — asserted directly, because a loop over zero effect bodies proves nothing |
| `sm:grid-cols-2` | `merge-form.tsx` | **2** — the survivor selector and the field row, both anti-vacuity anchors |

**Hand inspection of every string literal, as the acceptance criteria require.** All 74 literals in
`merge-form.tsx` and all 42 in `page.tsx` were listed and read. Every one is a Tailwind class, a
variant or size token, a message key, a namespace name, an internal value (`"survivor"`, `"loser"`,
`"conflict"`, `"filled"`, `"PAIR_GONE"`), an `AuditValue` discriminant, a format option, an href, a
log prefix, or prose inside a comment. **No rendered string is hardcoded**; every one comes from
`t(…)`, `tAudit(…)` or `tCommon(…)`. The `>[A-Z][a-z]+ [a-z]` JSX-prose scan returns **zero matches**
in both files and is part of the committed gate.

No Docker rebuild and no Playwright run were paid here — plan 39-17 owns both, and R-2's 320px
measurement of this screen is the single most valuable verification in the phase.

## Deviations from Plan

### Auto-fixed / auto-added

**1. [Rule 2 - security] `mergeRecords` does not accept an entity type**
- **Found during:** Task 1
- **Issue:** the plan narrows three ids; the mutation needs a fourth value, the entity type, and
  taking it from the caller cannot be validated — both values are legal literals, and the wrong one
  points every read and write of the merge at the wrong table.
- **Fix:** the value is read off the `duplicate_pairs` row the action re-reads anyway for the
  membership test. Gated in both directions (`entityType: pair.entityType` present, `input?.entityType`
  absent).
- **Commit:** `5434b89`

**2. [Rule 2 - security] The choice map is bounded and its values are strict**
- **Found during:** Task 1
- **Issue:** the plan narrows the map to "string keys with values in `{survivor, loser}`" but names no
  ceiling. A single POST could hand the action an arbitrarily large object to iterate and log.
- **Fix:** at most 200 entries, at most 128 characters per key, and any value outside the two literals
  refuses the whole call. The comment records that a crafted KEY writes nothing regardless
  (`applyMergeChoices` intersects with the server-built group list), so these bounds are about the
  cost of the call rather than about what it can write.
- **Commit:** `5434b89`

**3. [Rule 2 - correctness] Values are formatted through the audit layer rather than stringified**
- **Found during:** Task 2
- **Issue:** the plan describes the option card's value as "the value at `text-sm break-words`". For a
  person pair the compared set includes `organizationId`, which would have rendered a raw UUID on both
  sides of a conflict — an id in front of a user (T-36-22) and a choice nobody can make. Array-valued
  custom fields (file, multi-select) would have rendered as `[object Object]` or a comma-joined blob.
- **Fix:** `toAuditValue` plus a nine-case server-side formatter mirroring `AuditValueText`, with the
  reference case resolved to the organization's NAME through a small `inArray` read, and the
  truncation deliberately dropped.
- **Commit:** `479354e`

**4. [Rule 2 - correctness] Both survivor orientations are computed**
- **Found during:** Task 3 (designing the props), applied in Task 2
- **Issue:** the plan says changing the survivor "recomputes every field default from the
  server-supplied groups". The GROUPS themselves are survivor-dependent, so one orientation is not
  enough: after a flip, a "filled only" field is no longer one, and the client would have to
  re-partition — which is the server's decision (T-39-04) and forbidden by the plan's own grep gate.
- **Fix:** `buildOrientation` is invoked once per possible survivor from a single call site, and the
  selector chooses between the two sets.
- **Commit:** `479354e`

**5. [Rule 3 - blocking] `orientationFor` lifted to module scope**
- **Found during:** Task 3
- **Issue:** `react-hooks/immutability` is an ERROR in this repo and rejected the helper being read
  from a `useState` initialiser declared above it ("`orientationFor` is accessed before it is
  declared").
- **Fix:** a module function taking the orientation list as a parameter, which also makes the
  dependency explicit rather than closed-over. Commented with the mechanical reason.
- **Commit:** `7eb171d`

**6. [Rule 3 - blocking] `describeField` is not imported by `page.tsx`**
- **Found during:** Task 2
- **Issue:** the plan's `key_links` name `describeField` as the link from the merge components to
  `src/lib/audit/present.ts`. Importing it produced an unused-variable lint warning, because
  `buildMergeFieldGroups` (plan 39-02) already applies it to every compared key — the `label` on each
  `MergeField` IS its output.
- **Fix:** the import was removed and replaced by a comment stating that its absence is the point of
  M-4 rather than a gap in it: a second call here would be a second resolver for a field's name,
  which is the drift M-4 exists to prevent. The link to `present.ts` is live through
  `CUSTOM_FIELD_PREFIX` and `toAuditValue`, and through `field-groups.ts` transitively — which is
  where 39-02 deliberately put it.
- **Commit:** `479354e`

### Within-plan choices worth recording

- **The `dedup.merge.moves*` counts appear twice, meaning two different things.** On a survivor option
  card they describe what THAT record carries (M-2's "the counts of what it carries"), joined with
  `format.list` so the phrase is locale-ordered. In section 5 they describe the LOSER's children,
  which is what a merge moves.
- **`audit.value.files` is the one count in the what-moves list with no reparenting statement behind
  it,** and it is rendered only when it is greater than zero. There is no `files` table in this
  schema: file uploads live inside file-type custom fields, so the count is derived from the
  definitions and the loser's blob. `dedup.merge.filesStayInPlace` is the sentence that qualifies it —
  the blob entries follow whichever value the user keeps, the uploaded bytes stay at their path. Both
  facts are stated at the derivation site.
- **`dedup.merge.keepThis` is used as the survivor option's screen-reader-only name.** M-2 does not
  place it; the key exists, and visually the border and the radio dot already say "this one", so the
  sentence would be redundant on screen and is exactly right for the accessible name.
- **`dedup.merge.movesPeople` is rendered only when the count is non-null,** which is how
  `getPairDetail` expresses "a person has no people" — the absence of the concept rather than a zero.
  `movesDeals` and `movesNotes` render at zero, because zero deals is a fact about the record.
- **Organization reference names are read with no `deletedAt` predicate,** so a person pointing at an
  organization in Trash still shows that organization's name. The alternative renders "no longer
  available" on both sides of a conflict, which makes the choice unmakeable.
- **The identical section is rendered as a `<dl>` of the surviving value with no control,** matching
  `AuditFieldRow`'s `<dt>`/`<dd>` shape. There is nothing to decide there by construction.
- **A malformed `pairId` is answered without a query.** The same bare shape test the two sibling
  action modules apply, and the same rendering as a vanished pair.

## Known Stubs

None. Every branch of both files renders a true statement, and no control on this screen is inert.

## Deferred Issues

**One pre-existing test failure, out of scope, NOT caused by this plan:**

`src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx > CFUI-01: Radix asChild silently
drops an RSC-deferred child > renders NOTHING AT ALL when the child arrived Flight-deferred` fails
with `expected '<button type="button" aria-haspopup="…' to be ''`. That test documents the CFUI-01
defect by asserting Radix's `SlotClone` discards a Flight-lazy child; the installed Radix now renders
it, so the documentation test's premise no longer holds in this environment.

Evidence that it is not this plan's doing, gathered rather than asserted:

- `git diff <base> HEAD --name-only` lists **only** the five files this plan created. The failing test
  reads `src/components/ui/dialog.tsx` and `node_modules`, neither of which this plan touched.
- The shared `node_modules` was not modified by the `shadcn` run: `radix-ui` is still **1.4.3**,
  `@radix-ui/react-slot` **1.2.3**, `react`/`react-dom` **19.2.3**, and all three directories carry
  mtimes of **2026-08-18 22:29** — hours before this session began.
- This worktree's `package.json` and `package-lock.json` are byte-identical to the base commit.

Since every input to that test is identical to the base commit, its result at the base commit is the
same. It belongs to whichever phase next opens `alert-dialog`/`dialog` or bumps Radix — fixing it
here would mean editing another plan's threat-model documentation, and the scope boundary says not to.

## Threat Flags

None. Every trust boundary this plan opens is in the plan's own register and is mitigated at the
site: T-39-01 (the inherited layout gate plus an independent re-check in the action, both asserted),
T-39-02 (membership re-validated here AND in the mutation, both quoted above), T-39-04 (the entity
type removed from the boundary entirely, the comparable field set computed on the server, the choice
map bounded and strictly narrowed), T-39-37 (three refusals collapsed to one code, asserted
literally), T-39-03 (codes only; no driver message and no catalog key crosses the boundary), T-39-SC
(the block read before use, no dependency added, the CLI's bump reverted). No new network endpoint
beyond `mergeRecords`, no file access path, no schema change, and no migration.

## Self-Check: PASSED

All five created files exist on disk. All four commits (`5434b89`, `7eb171d`, `479354e`, `63f2233`)
are present in `git log`. `STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` were **not** modified.
`package.json`, `package-lock.json`, `vitest.config.ts`, `vitest.db.config.ts` and plan 39-13's files
(`src/app/duplicates/page.tsx`, `scan-panel.tsx`, `pair-card.tsx`, either `progress-bar.tsx`) were
**not** modified. No `git stash`, no `git clean`, no migration.
