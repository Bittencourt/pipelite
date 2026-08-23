# Phase 42 — Deferred Items

## From plan 42-03

### Stale `Dockerfile:24` references in source comments

Plan 42-03 moved the instrumentation copy from `Dockerfile:24` to `Dockerfile:35-38` and removed the
`|| true` suppression. Five prose comments now cite a stale line number, and two of them make a claim
that is now factually **false**:

| File | Line | Claim | Status after 42-03 |
|---|---|---|---|
| `src/lib/trash/prune.ts` | 14 | "`Dockerfile:24` still ends in a suppressed failure" | **FALSE** — it now asserts the postcondition and exits 1 |
| `src/lib/trash/prune.test.ts` | 132 | "`Dockerfile:24` ends in a suppressed failure" | **FALSE** — same |
| `src/lib/dedup/scan-cleanup.ts` | 25 | cites `Dockerfile:24` | stale line number only |
| `src/lib/dedup/scan-cleanup.test.ts` | 9 | cites `Dockerfile:24` | stale line number only |
| `instrumentation.ts` | 36 | cites `Dockerfile:24` | stale line number only |

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
