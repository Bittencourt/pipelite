---
phase: 40-saved-views-shared-filters
plan: 04
subsystem: e2e-harness
tags: [playwright, storage-state, fixtures, anti-vacuity, member-session]
requires:
  - "saved_views + saved_view_defaults tables (40-02, migration 0018)"
  - "e2e/seed-admin.ts + e2e/auth.setup.ts (45-08)"
  - "E2E_DATABASE_URL, E2E_ADMIN_PASSWORD, E2E_MEMBER_PASSWORD in .env"
provides:
  - "e2e/.auth/member.json — a non-admin, approved member storageState"
  - "chromium-member Playwright project, narrowed to *-member.spec.ts"
  - "seedE2eMember() + E2E_MEMBER_EMAIL"
  - "VIEWS_FIXTURE_PREFIX / openDb / userIdByEmail / insertViewFixture / setDefaultFixture / purgeViewFixtures"
  - "retries: 1 on the setup project (BACKLOG flake)"
affects:
  - "40-15 and 40-16 (the V-40-8 private-visibility spec) consume all of the above"
tech-stack:
  added: []
  patterns:
    - "inverted anti-vacuity: a setup spec proves a session is REFUSED, not merely that it exists"
    - "prefix-scoped fixture purge that mutates only and returns counts, asserting nothing"
key-files:
  created:
    - e2e/seed-member.ts
    - e2e/member.setup.ts
    - e2e/views-fixtures.ts
  modified:
    - playwright.config.ts
decisions:
  - "Declined V-40-8's 'live member account': seeded a dedicated member instead"
  - "E2E_MEMBER_PASSWORD has no fallback and does not reuse E2E_ADMIN_PASSWORD"
  - "chromium-member narrows testMatch by filename so no existing spec runs twice"
  - "purgeViewFixtures also clears defaults owned by the two e2e accounts, not just those pointing at prefixed views"
metrics:
  duration: ~50 min
  completed: 2026-08-21
  tasks: 2
  commits: 2
---

# Phase 40 Plan 04: E2E Harness — Member Session and View Fixtures Summary

A second Playwright `storageState` holding a genuinely non-admin session — proven non-admin by
being **refused** at `/admin/audit` — plus a prefix-scoped saved-view fixture module whose purge was
shown to be selective by tampering it until it wasn't.

## What Was Built

| Artifact | What it is |
|---|---|
| `e2e/seed-member.ts` | idempotent seed for `pipelite-e2e-member@local.test`, `role: "member"`, own `E2E_MEMBER_PASSWORD`, loopback-only `E2E_DATABASE_URL` guard |
| `e2e/member.setup.ts` | logs in through the real form, runs the two-half anti-vacuity check, writes `e2e/.auth/member.json` |
| `e2e/views-fixtures.ts` | `VIEWS_FIXTURE_PREFIX`, `openDb`, `userIdByEmail`, `insertViewFixture`, `setDefaultFixture`, `purgeViewFixtures` |
| `playwright.config.ts` | `retries: 1` on `setup` only; new `chromium-member` project with `testMatch: /.*-member\.spec\.ts/` |

## The `/admin/audit` Refusal — Observed, Not Assumed

`member.setup.ts` asserts in two halves, in this order, because the order is the substance:

1. **The session is real.** `/organizations` renders an `h1` and `pathname === "/organizations"`.
   Without this, half 2 is fakeable: a *failed* login would also be bounced off `/admin/audit`
   (to `/login?callbackUrl=/admin`), so a bare `pathname !== "/admin/audit"` check would go green
   while proving nothing.
2. **The session is not an admin.** `/admin/audit` redirects, and the destination is asserted
   exactly — `pathname === "/"` and `searchParams.error === "unauthorized"`, which is what
   `src/app/admin/layout.tsx` sends a signed-in non-admin. That exact target is what separates
   "refused for being a member" (wanted) from "refused for being logged out" (a broken harness in a
   passing test's clothes).

**Observed:** the member session landed on `/?error=unauthorized`. Both setup specs green.

## Negative Proofs — All RUN, Each Failing By Name, Then Restored

| # | Tampered / withheld | Expected failure | Result |
|---|---|---|---|
| 1 | `E2E_MEMBER_PASSWORD=` (empty) | seed refuses, no fallback to admin | **FAIL (1)** — `"E2E_MEMBER_PASSWORD environment variable is not set. There is deliberately no fallback and no reuse of E2E_ADMIN_PASSWORD…"` at `seed-member.ts:73`. Restored. |
| 2 | `E2E_DATABASE_URL=…@db.example.com` | loopback guard refuses | **FAIL (1)** — `"E2E_DATABASE_URL host \"db.example.com\" is not a local development database. The e2e member seed refuses to run anywhere but localhost / 127.0.0.1."` Restored. |
| 3 | **`seed-member.ts` role flipped to `"admin"`** | the inverted anti-vacuity check must catch a mis-seeded member | **FAIL (1)** — `"the member session was NOT refused at /admin/audit — the seed set the wrong role"`, `Expected: not "/admin/audit"`. Restored to `"member"`; two green runs followed. |
| 4 | `PREFIX_PATTERN` widened to `` `[e2e]%` `` | the purge must not reach sibling harnesses' fixtures | purge returned `{defaults:0, views:2}` instead of `1`, and `FAIL  the sibling-harness '[e2e] …' row was DELETED — the purge over-matches '[e2e]%'`. Restored; re-run gave `views:1` and the probe survived. |

Proof 3 is the one that matters. It is the direct answer to "would this gate stay green if its defect
were introduced?" — it does not.

## Fixture Module Proof (Command Line, No Spec File)

The plan explicitly forbids a `views-fixtures.spec.ts` (it would run in the default `chromium`
project and duplicate 40-15's assertions), so the module was proved from the command line. Every
line below was printed by an actual run:

```
prefix = "[e2e] View"
pre-purge reclaimed: {"defaults":0,"views":0}
BASELINE {"views":0,"defaults":0,"orgs":46054,"activities":79022}
ok    insertViewFixture REFUSES an unprefixed name: Fixture view name "not prefixed at all" does not start with …
ok    the refused insert wrote nothing
ok    three distinct fixture ids returned
ok    three prefixed rows are present
ok    filters round-tripped as jsonb: {"stage":"s1","pipeline":"p1"}
ok    G-7: the member defaults to the ADMIN's shared view (cross-owner)
ok    setDefaultFixture UPSERTS on (user_id, entity_type) rather than adding a row
ok    the non-fixture probe row exists
PURGE RETURNED {"defaults":1,"views":3}
ok    purge returned defaults = 1 (got 1)
ok    purge returned views = 3 (got 3)
ok    zero prefixed rows remain
ok    THE PROBE SURVIVED — the purge is selective, not a truncate
ok    the probe was removed by exact name
ok    saved_views back to 0
ok    saved_view_defaults back to 0
ok    organizations still 46054
ok    activities still 79022
ALL PROOF STEPS PASSED
```

- **Purge counts: `defaults = 1`, `views = 3`** — exactly the plan's predicted `(1, 3)`.
- **Anti-vacuity probe:** `zz-not-a-fixture-40-04` was inserted with raw SQL (`insertViewFixture`
  refuses the name — that refusal is itself asserted above), **survived the purge**, and was then
  removed by exact name. The `views === 3` count is independently discriminating: an unqualified
  delete would have returned 4.
- Teardown ordering follows 39-19: `purgeViewFixtures` performs only mutations and returns counts.
  It asserts nothing, so a failing leak assertion can never abort a teardown mid-way and strand the
  row it is complaining about. Assertions live in the caller, after every purge has returned.
- Concurrency: everything is scoped by the `[e2e] View` prefix, never by a global `count(*)`, per
  39-10's finding that spec *files* really do run on two workers under `fullyParallel: false`.

## Verification

| Check | Result |
|---|---|
| `npx playwright test --project=setup` | **PASS (2) FAIL (0)**, run 3× consecutively (idempotence) |
| `e2e/.auth/member.json` | exists, 2104 bytes, `git check-ignore` → `.gitignore:53:/e2e/.auth/` |
| `e2e/.auth` | a real directory, not a symlink |
| every existing spec runs exactly once | `Total: 34 tests in 7 files` — 32 `[chromium]` + 2 `[setup]` + 0 `[chromium-member]` (no `*-member.spec.ts` exists yet). Was 33 before; the one addition is `member.setup.ts`. |
| `npx tsc --noEmit` | clean |
| `npx eslint` on the 4 changed files | 0 problems (`npm run lint` overall: 0 errors, 125 pre-existing warnings, none in these files) |
| `grep -ci playwright .github/workflows/ci.yml` | **0**, and `git diff --stat -- .github/` is empty — CI untouched, per 45-02 |
| migration journal | ends at `"idx": 18`; no migration generated |
| dependencies | `package.json` / lockfile untouched; nothing installed |
| files changed | exactly `e2e/member.setup.ts`, `e2e/seed-member.ts`, `e2e/views-fixtures.ts`, `playwright.config.ts` |
| credentials committed | none — `git log --all --name-only \| grep -c member.json` → **0** |

## Dev Database Row Counts

| Table | Before | After |
|---|---|---|
| organizations | 46054 | 46054 |
| people | 38348 | 38348 |
| deals | 25195 | 25195 |
| notes | 75236 | 75236 |
| activities | 79022 | 79022 |
| audit_log | 213 | 213 |
| saved_views | 0 | **0** |
| saved_view_defaults | 0 | **0** |
| users | 9 | **10** |

**The single change is `users` 9 → 10.** That one added row is this plan's seeded e2e member,
`pipelite-e2e-member@local.test` (`role=member`, `status=approved`, `deleted_at=null`) — stated
plainly because it is the one intended, permanent addition. Nothing else in the database was
touched: every fixture created during the proofs was reclaimed, and both saved-view tables are back
at 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `E2E_MEMBER_PASSWORD` did not exist**

- **Found during:** Task 1, before the first run
- **Issue:** the seed reads `E2E_MEMBER_PASSWORD` with no fallback (by design), and the variable was
  absent from `.env` — so nothing in this plan could be verified, and plans 40-15/40-16 could not run
  the harness either.
- **Fix:** generated a 32-character random secret and appended it to the project `.env` under its own
  commented block. `.env` is gitignored (`.gitignore:34`) and untracked, so no credential entered
  git. The value is not in this summary, in any commit, or in any tracked file.
- **Files modified:** `/home/pedro/programming/pipelite/.env` (gitignored, not committed)
- **Note:** an intermediate verification `grep` echoed the value into the session transcript. The
  secret was **rotated immediately** afterwards, so the echoed value is dead. No further `grep` was
  run against `.env` lines.

**2. [Deliberate departure] Relative imports instead of the `@/` aliases `seed-admin.ts` uses**

- **Found during:** Task 1
- **Issue:** the plan says `seed-member.ts` should be a near-copy of `seed-admin.ts` "with these
  differences and no others", and `seed-admin.ts` imports `@/db/schema/users` and `@/lib/password`.
- **Fix:** used `../src/db/schema/users` and `../src/lib/password`. Relative paths work regardless of
  whether Playwright resolves the alias table, so this is strictly safer. The pre-existing
  contradiction between `seed-admin.ts`'s aliased imports and `merge-screen-320.spec.ts`'s prose
  claim that aliases do not resolve was **not adjudicated** — left exactly as found.
- **Files modified:** `e2e/seed-member.ts`

**3. [Rule 2 - Correctness] `purgeViewFixtures` also clears the e2e accounts' non-fixture defaults**

- **Found during:** Task 2
- **Issue:** the plan's own description was self-inconsistent — it asked the purge to delete
  "`saved_view_defaults` rows whose `view_id` is a prefixed view" *so that* it "also cleans a default
  that was set against a NON-fixture view during a test". The first predicate cannot accomplish the
  second: a default pointing at a non-fixture view is exactly what the prefix predicate misses, and
  the FK cascade misses it too.
- **Fix:** two predicates — `view_id in (prefixed views)` **or** `user_id in (the two e2e accounts)`.
  Scoping the second to accounts that exist only for this harness means a human's default is never
  reachable. A stranded default would otherwise silently redirect the next run's first page load into
  a filtered list.
- **Files modified:** `e2e/views-fixtures.ts`

**4. [Scope note, NOT acted on] `docker compose exec` in the plan's verify block**

The plan's Task 2 `<automated>` block calls `docker compose exec -T postgres …`, which does not work
from a worktree — Compose derives its project name from the directory. Used
`docker exec -i pipelite-postgres-1 psql -U pipelite -d pipelite` instead, same query, same result
(`0`). No file was changed for this.

### Also Noted, Not Changed

- `retries: 1` was added to the `setup` project because the plan explicitly authorises it (and
  BACKLOG.md records the 2-of-8 `waitForURL` flake). It is on that project **only** — `chromium` and
  `chromium-member` have no retries, so no assertion anywhere gets a second chance.
- `auth.setup.ts` itself was **not** modified. Its flake is mitigated by the config-level retry, not
  by editing the spec.

## Threat Model Dispositions

| Threat | Disposition | Evidence |
|---|---|---|
| T-40-13 elevation of privilege via a standing seeded account | mitigated | loopback-only guard copied verbatim; proved by negative proof 2 |
| T-40-14 storageState disclosure | mitigated | `git check-ignore` asserted before the first write; `member.json` appears in 0 commits; `e2e/.auth` kept a real directory |
| T-40-15 spoofing — a "member" session that is secretly an admin | mitigated | the inverted `/admin/audit` refusal, with an exact `/?error=unauthorized` destination; proved discriminating by negative proof 3 |
| T-40-16 data loss via an over-broad purge | mitigated | `insertViewFixture` throws on an unprefixed name (asserted); the non-fixture probe survived; the `[e2e]%` tamper was run and caught (negative proof 4) |
| T-40-SC supply chain | mitigated | nothing installed; `package.json` and the lockfile are untouched |

## Known Stubs

None. `chromium-member` currently matches zero tests by design — the specs that use it arrive in
40-15/40-16, and its `testMatch` is deliberately narrow so it stays at zero until they do. This is
not a stub: the harness artifact (`member.json`) is real, minted, and verified.

## Notes for Downstream Plans (40-15, 40-16)

- Name any spec that needs the member session `*-member.spec.ts`, or `chromium-member` will not pick
  it up.
- `E2E_MEMBER_PASSWORD` is now in `.env`. It is required and has no fallback.
- Import fixtures relatively: `import { insertViewFixture } from "./views-fixtures"`.
- Call `purgeViewFixtures` from **both** `beforeAll` and `afterAll`, and put any leak assertion
  *after* the purge call returns, never before.
- Any leak assertion must be prefix-scoped, never a global `count(*)` — a sibling file on the other
  worker will otherwise be reported as your contamination.

## Self-Check: PASSED

- `e2e/seed-member.ts` — FOUND
- `e2e/member.setup.ts` — FOUND
- `e2e/views-fixtures.ts` — FOUND
- `playwright.config.ts` — FOUND (modified)
- `e2e/.auth/member.json` — FOUND (2104 bytes, gitignored, uncommitted)
- commit `b6e0704` — FOUND
- commit `f78ed35` — FOUND
