---
phase: 35-notes-record-timeline
plan: 05
subsystem: timeline
tags: [tdd, types, pagination, keyset-cursor, base64url, zod, security]

# Dependency graph
requires:
  - phase: 35
    plan: 01
    provides: "notes/deal_stage_history schema — timestamps declared with no `mode` option, so Drizzle yields `Date`, which is what TimelineCursor.occurredAt compares"
provides:
  - "TimelineEntry discriminated union (note | activity | stage_change) — the render contract for every downstream plan"
  - "TimelineCursor, TimelinePage and TIMELINE_PAGE_SIZE = 20 (D-07)"
  - "encodeCursor / decodeCursor — opaque base64url keyset cursor codec that never raises"
  - "The T-35-02 decode -> zod safeParse -> bind boundary that plan 35-08 binds against"
affects: [35-08 timeline assembler, 35-09 server action, 35-11 timeline rendering, 35-12 entry components, 35-13 load-more]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Opaque keyset cursor: base64url(JSON) with short keys `t`/`i`, validated by zod `safeParse` before any value is trusted"
    - "Non-raising parser: every failure path returns null so attacker-controlled input degrades to page 1, never to a 500"
    - "Length-ceiling-before-decode guard (512 chars) so an oversized payload is unparseable rather than merely slow"

key-files:
  created:
    - src/lib/timeline/types.ts
    - src/lib/timeline/cursor.ts
    - src/lib/timeline/cursor.test.ts
  modified: []

key-decisions:
  - "decodeCursor returns null for BOTH absent and malformed input — a single failure mode callers cannot forget to handle, and a hostile cursor renders page 1 rather than a 500 (T-35-20)"
  - "zod 4.3.6 exposes both z.iso.datetime() and the deprecated z.string().datetime(); z.iso.datetime() was chosen and empirically confirmed to reject 'yesterday', '2026-13-45T99:99:99Z', an offset-bearing timestamp and a SQL fragment"
  - "Three guards run BEFORE Buffer.from: a typeof check, a 512-character ceiling, and a strict ^[A-Za-z0-9_-]+$ charset test — Node's base64url decoder is lenient and silently ignores invalid characters, so the charset test is what makes 'not a cursor!!' a rejection rather than a coincidence"
  - "Wire keys are `t`/`i` rather than `occurredAt`/`id`: it halves the blob and adds nothing to reverse — the cursor is opaque, not secret"
  - "types.ts stays runtime-free apart from TIMELINE_PAGE_SIZE, so importing the contract can never pull `db` into a client bundle"

patterns-established:
  - "Attacker-reachable parser pattern for this repo: charset + length guard -> try/catch decode -> zod safeParse -> post-validation sanity assert -> null on every failure"

requirements-completed: [NOTE-02]

# Metrics
duration: 18min
completed: 2026-08-15
---

# Phase 35 Plan 05: Timeline Types + Keyset Cursor Codec Summary

**The timeline's render contract (a three-arm discriminated union) plus an opaque base64url keyset cursor whose decoder validates through zod and never raises, so an attacker-crafted cursor degrades to page 1 instead of reaching SQL or producing a 500.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2 (RED, GREEN) + 1 auto-fix commit
- **Files created:** 3
- **Tests:** 14 new, all passing; full suite 888 passed / 4 skipped, unregressed

## Accomplishments

- `src/lib/timeline/types.ts` declares `TimelineEntry` = `NoteTimelineEntry | ActivityTimelineEntry | StageChangeTimelineEntry`, plus `TimelineEntryKind`, `TimelineCursor`, `TimelinePage` and `TIMELINE_PAGE_SIZE = 20`. It is a pure contract module: zero `db` import, zero runtime logic beyond the one constant, and it typechecks standalone.
- `src/lib/timeline/cursor.ts` implements the codec. `encodeCursor` emits `base64url(JSON.stringify({ t: ISO-8601-with-ms, i: id }))`; `toISOString()` guarantees the `.SSS` component that preserves the sort key's precision.
- `decodeCursor` layers four defences before anything is trusted: a `typeof` check, a 512-character ceiling, a strict base64url charset regex, and `JSON.parse` inside `try/catch` — then a zod `safeParse` gate (`t` = `z.iso.datetime()`, `i` = `z.string().min(1).max(128)`), then a `Number.isNaN` sanity assert on the constructed `Date`.
- The module contains **zero raise statements**. Every failure path returns `null`.
- 14 tests cover round-trip with millisecond precision, wire opacity (no `+`/`/`/`=`, and neither the raw id nor the ISO string appears in plaintext), absent input, and nine distinct rejection classes.

## Task Commits

1. **Task 1 (RED): types contract + failing cursor tests** — `e5f3272` (test)
2. **Task 2 (GREEN): cursor codec implementation** — `7f51eac` (feat)
3. **Auto-fix: NUL byte in the test fixture array** — `f6c446e` (fix)

REFACTOR was not needed — the GREEN implementation required no cleanup pass.

## TDD Gate Compliance

- **RED** — `e5f3272`. `npx vitest run src/lib/timeline/cursor.test.ts` exited non-zero with exactly the expected cause: `Cannot find module './cursor'`. The failure was a missing module, not a broken test. `npm run typecheck` reported the same single error (`TS2307: Cannot find module './cursor'`); `types.ts` was separately confirmed to compile standalone under `--strict`.
- **GREEN** — `7f51eac`. 14/14 passing, `npm run typecheck` exit 0, `npm run lint` exit 0 (128 pre-existing warnings repo-wide, none in `src/lib/timeline`), `npm test` 888 passed / 4 skipped across 58 files plus 8 RSC tests.
- Gate order verified in git log: `test(35-05):` precedes `feat(35-05):`.

## Files Created/Modified

- `src/lib/timeline/types.ts` — the entry union, cursor shape, page shape, page-size constant. Comments carry the forward note that phase 36 appends `'audit'` to `TimelineEntryKind` and one file to the assembler's source array, and record why `fromStageColor`/`toStageColor`/`typeName` are carried on the entry (they key the existing pastel maps in `src/app/deals/[id]/page.tsx` and `src/app/activities/activity-list.tsx`).
- `src/lib/timeline/cursor.ts` — `encodeCursor`, `decodeCursor`, `MAX_CURSOR_LENGTH`, `BASE64URL_PATTERN`, `cursorPayloadSchema`. Threat IDs T-35-02/19/20 are cited at the module docblock and at the guards that implement them.
- `src/lib/timeline/cursor.test.ts` — 14 tests, 157 lines.

## Decisions Made

- **Charset guard added beyond the plan's letter.** The plan specified length guard → decode → zod. Node's `Buffer.from(x, 'base64url')` silently discards characters outside the alphabet, so `'not a cursor!!'` would have been rejected only incidentally, by `JSON.parse` failing on the resulting garbage. An explicit `^[A-Za-z0-9_-]+$` test makes the rejection intentional and cheap. Treated as Rule 2 (missing critical validation), not a deviation from intent.
- **zod API selection was verified, not assumed.** The plan flagged uncertainty between `z.iso.datetime()` and `z.string().datetime()` on the installed 4.3.6. Both exist; `z.iso.datetime()` was selected and its behaviour was empirically checked against all six timestamp vectors in the test suite before the test file was written.
- **The word "throw" is absent from the source entirely**, including comments, so the plan's grep gate (`throw ` occurrences = 0 outside `//` comments) holds under any stricter re-reading a verifier might apply. The docblock says "has zero raise statements".
- **Two extra rejection classes beyond the plan's list**: valid JSON that is not an object (`42`, `null`, `["t","i"]`) and a numeric epoch `t`. Both are reachable shapes the plan's list did not name, and both must return `null`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Literal NUL byte in the test fixture array**

- **Found during:** self-check after Task 2, while confirming commit contents with `git show --stat`.
- **Issue:** `git show --stat e5f3272` reported `src/lib/timeline/cursor.test.ts | Bin 0 -> 5672 bytes`. A raw `0x00` byte had landed at offset 551 in the `HOSTILE_INPUTS` array (intended as a whitespace entry). Git classifies any blob with a NUL in the first 8000 bytes as binary — the file would have had no diffs, no blame and no three-way merge for the rest of the project's life. Tests passed either way, so nothing else would have caught it.
- **Fix:** Replaced the raw byte with the `\u0000` TypeScript escape sequence (a strictly better hostile-input case, since it is now explicit) and added the intended whitespace-only entry alongside it.
- **Files modified:** `src/lib/timeline/cursor.test.ts`
- **Commit:** `f6c446e`
- **Verification:** `file src/lib/timeline/cursor.test.ts` now reports `JavaScript source, Unicode text, UTF-8 text`; 14/14 tests still pass; typecheck and lint clean. Diffs from `f6c446e` forward are textual.

### Acceptance Criterion That Cannot Hold at RED

Task 1's acceptance list includes `npm run typecheck` exits 0. This is unsatisfiable at RED by construction: the RED test file imports `./cursor`, which does not exist yet, so `tsc` necessarily emits `TS2307`. The criterion's parenthetical — "types.ts compiles standalone" — was verified directly instead, with `npx tsc --noEmit --strict src/lib/timeline/types.ts` (clean), and the full `npm run typecheck` was confirmed to report that single import error and nothing else. It exits 0 from the GREEN commit onward. Recording this so the phase verifier does not read the RED-commit typecheck state as a failure.

## Verification Performed

- `npx vitest run src/lib/timeline/cursor.test.ts` — RED: exit 1, `Cannot find module './cursor'`. GREEN: 14 passed, 0 failed.
- `npm run typecheck` — exit 0 at GREEN and after the fix commit.
- `npm run lint` — exit 0; `npx eslint src/lib/timeline` — no issues found.
- `npm test` — 58 files, 888 passed / 4 skipped, plus the RSC project 2 files / 8 passed. No regression from the schema-adjacent suites.
- Cursor invariant gate (evaluated over non-`//` lines of `cursor.ts`): `safeParse` occurrences = 2 (≥ 1 required), `throw ` occurrences = 0, whole-word `throw` occurrences = 0, `MAX_CURSOR_LENGTH` present = yes. `CURSOR_INVARIANTS_OK`.
- `decodeCursor` confirmed to return `null` — asserted with `toBe(null)`, not `toBeFalsy` — for all 18 hostile inputs, and confirmed non-raising for all of them plus `null`, `undefined` and `''`.
- Wire opacity confirmed empirically before the assertion was written: the encoded fixture is `eyJ0IjoiMjAyNi0wOC0xNVQxMjozNDo1Ni43ODlaIiwiaSI6ImFiYy0xMjMifQ`, which contains neither `abc-123` nor `2026-08-15`.

## Issues Encountered

The worktree had no `node_modules` (only the main checkout does), so `npx vitest` and `npm run typecheck` could not resolve anything. Resolved by symlinking `node_modules` to the main checkout's directory; `/node_modules` is gitignored, so nothing entered any commit. The symlink is removed before this agent returns.

## Known Stubs

None. Both artifacts are complete implementations, not placeholders.

## Threat Flags

None beyond the plan's register — this plan adds no endpoint, auth path or file access. Its three registered threats are all closed at this layer:

| Threat | Status | Where |
|--------|--------|-------|
| T-35-02 (SQL injection via cursor) | mitigated | `cursorPayloadSchema.safeParse` gates both fields; `t` is regex-validated ISO-8601, `i` is a bounded non-empty string. Proven by `rejects a SQL-injection payload in either field`. Downstream binding is plan 35-08's obligation. |
| T-35-19 (oversized/nested payload DoS) | mitigated | `MAX_CURSOR_LENGTH = 512` checked before `Buffer.from`; `JSON.parse` inside `try/catch`; `i` capped at 128. Proven by `rejects an oversized cursor before decoding it` with a 1 MB input. |
| T-35-20 (unhandled raise → 500) | mitigated | Zero raise statements in `cursor.ts`, grep-gated; `never throws on hostile input` asserts it over all 18 vectors. |
| T-35-SC (npm supply chain) | accepted | Zero packages installed. `Buffer.toString('base64url')` is a Node built-in already used by `src/lib/api-keys.ts`; `zod` was already a dependency. |

**Carried forward to plan 35-08:** `decodeCursor`'s output is validated, not sanitised. It must be passed to Drizzle as a bind parameter. If it is ever interpolated into a `sql` template as raw text, T-35-02 reopens regardless of the validation done here.

## Next Phase Readiness

- Plans 35-08, 35-09, 35-11, 35-12 and 35-13 can now `import type { TimelineEntry, TimelinePage, TimelineCursor } from "@/lib/timeline/types"` and `import { encodeCursor, decodeCursor } from "@/lib/timeline/cursor"`.
- The assembler (35-08) should set `TimelinePage.nextCursor = encodeCursor({ occurredAt, id })` from the **oldest** returned entry, and `null` when `hasMore` is false.
- `TimelineCursor.occurredAt` is a `Date`. Plan 35-01 deliberately passed no `mode` option to any new timestamp column, so Drizzle returns `Date` on both sides of the comparison. No string/Date coercion is needed anywhere in the keyset predicate.
- Phase 36's audit entries need only a new arm on `TimelineEntryKind` and `TimelineEntry`; nothing in the cursor changes.

## Self-Check: PASSED

- `src/lib/timeline/types.ts` — FOUND
- `src/lib/timeline/cursor.ts` — FOUND
- `src/lib/timeline/cursor.test.ts` — FOUND
- Commit `e5f3272` — FOUND
- Commit `7f51eac` — FOUND
- Commit `f6c446e` — FOUND

---
*Phase: 35-notes-record-timeline*
*Completed: 2026-08-15*
