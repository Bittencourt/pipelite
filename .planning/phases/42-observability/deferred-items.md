# Phase 42 — Deferred Items

## From plan 42-03

### Stale `Dockerfile:24` references in source comments

Plan 42-03 moved the instrumentation copy from `Dockerfile:24` to `Dockerfile:35-38` and removed the
`|| true` suppression. Five prose comments now cite a stale line number, and two of them make a claim
that is now factually **false**:

| File | Line | Claim | Status after 42-03 |
|---|---|---|---|
| `src/lib/trash/prune.ts` | 14 | "`Dockerfile:24` still ends in a suppressed failure" | ~~FALSE~~ **CLOSED by 42-06** — rewritten to "WHAT DETECTS THAT HAS CHANGED (phase 42)", now points at `/api/health` |
| `src/lib/trash/prune.test.ts` | 132 | "`Dockerfile:24` ends in a suppressed failure" | ~~FALSE~~ **CLOSED by 42-06** — comment removed |
| `src/lib/dedup/scan-cleanup.ts` | 25 | cites `Dockerfile:24` | **CLOSED by 42-12** (A7 repair); remaining mention is historical narrative of the 2026-08-08 incident, correct as written |
| `src/lib/dedup/scan-cleanup.test.ts` | 9 | cites `Dockerfile:24` | **CLOSED by 42-12** (A7 repair); same — historical narrative |
| `instrumentation.ts` | 36 | cites `Dockerfile:24` | **OPEN — assigned to 42-17**, which owns this file. Note its line 40 gate comment is ALSO now unpassable: it names `grep -F '[trash-prune] Starting'`, a string 42-06 retired. |

**Not fixed here, deliberately.** All five files are outside plan 42-03's file ownership
(`docker-compose.yml`, `.env.example`, `package.json`, `package-lock.json`, `Dockerfile`).
`instrumentation.ts` belongs to plan 42-17, and amendment A7 already has other plans in this phase
editing `scan-cleanup.ts`, `scan-cleanup.test.ts` and the startup log lines. Editing them from a
parallel worktree mid-wave would collide.

**Verified harmless for now:** all five are comments, not assertions. `npx vitest run
src/lib/trash/prune.test.ts src/lib/dedup/scan-cleanup.test.ts` → 27 passed / 0 failed after the
Dockerfile change.

**Who should fix:** whichever plan last touches these files in this phase (42-17 for
`instrumentation.ts`; the A7 repair plan for the `scan-cleanup`/`prune` pair), or plan 42-18 as a
closing sweep. The correction is: the build-time guard now catches this class loudly, so the startup
log line is *corroborating* runtime evidence rather than "the only way that class of breakage is
detected."

---

## Reconciliation, 2026-08-23 (orchestrator, after wave 2 batch C)

The table above was written in wave 1 and went stale during wave 2. Verified against merged master
at `f4c27dc`:

- The two entries marked **FALSE** were closed by 42-06, which owned both files. 42-12 later read
  this table rather than the files and reported them as still deferred — that report was wrong;
  the files are fixed.
- `heartbeat.ts:14` also cites `Dockerfile:24`, and is not in the table at all. Like the
  scan-cleanup mentions it is historical narrative of the 2026-08-08 incident, so it is correct as
  written and needs no repair.
- The ONLY genuinely open item is `instrumentation.ts`, owned by 42-17 — and it has TWO problems,
  not the one recorded here: the stale `Dockerfile:24` citation at line 36, and an unpassable
  liveness gate at line 40.
