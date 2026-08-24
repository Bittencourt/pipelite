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
| `instrumentation.ts` | 36 | cites `Dockerfile:24` | **CLOSED by 42-17.** Both problems fixed: the citation is now `Dockerfile:35-38` in past tense (line 35 = `RUN test -f`, line 38 = `exit 1`), and the line-40 gate — which named the `[trash-prune] Starting` string 42-06 retired — was replaced by `/api/health`, since `EXPECTED_WORKERS` includes `trash-prune`. 42-17 also recorded that a boot-line grep is vacuous whatever its string. |

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

---

## Opened by 42-18, 2026-08-23 — carry to phase 43

Verified against merged master at `a4d315f`. Three items, none blocking; every one was found by
running the container rather than by reading a file.

### 1. Normalize the `[Pipedrive API]` log scope

`src/lib/import/pipedrive-api-client.ts:42` — `log.warn("Pipedrive API", "Rate limited, retrying", …)`.
**Recommendation: rename the scope to `pipedrive-api`.**

The premise in STATE.md ("every other scope is lowercase-kebab") is not quite right: a full census of
`log.*` scope literals shows two families — harvested bracket prefixes (lowercase-kebab) and ~200
path-derived scopes carrying slashes, brackets and camelCase (`api/v1/notes/[noteId]`,
`workflows/[id]/runs/[runId]`). Capitals are not unique to this scope. **The space is.** It is the
only scope in the codebase containing one, and every documented liveness gate in phase 42 has the
form `grep -F '"scope":"<name>"'`, where a space is the one character that forces different quoting.

Blast radius is one line — `grep -rn '"Pipedrive API"' src/` returns exactly 1 hit, no test asserts
it, no comment gate names it.

42-18 deferred rather than took it: the change is cosmetic, no criterion requires it, and doing it
would have left the freshly-witnessed container no longer matching HEAD — invalidating that plan's
central evidence — for zero functional gain.

### 2. Pin `log.error`'s two-required-argument typing with a test

`src/lib/log.ts:146-153` declares `error: (scope: string, msg: string, ctx?: …)`. Both required
parameters are the ONLY thing stopping `.catch(log.error)` from compiling as a silent bug at three
expression-position sites. 42-18 re-proved this empirically by temporarily replacing
`api-keys.ts:89`'s arrow with a bare reference:

```
error TS2345: … Target signature provides too few arguments. Expected 2 or more, but got 1.
```

**`42-PATTERNS.md` §5(e)'s claim that TypeScript will not stop you is definitively wrong** — correct
it if that document is ever reused.

Nothing enforces this against a future edit making `msg` optional. `api-keys.ts:78-88` records the
hazard in prose; a comment is not a gate. **Recommendation: add a type-level assertion or an
`@ts-expect-error` test in `src/lib/log.test.ts`.** Out of 42-18's file ownership (`eslint.config.mjs`).

### 3. Next.js emits non-JSON error output into the structured log stream

Not a defect of phase 42 and not fixable from it, but it invalidates a strict reading of the phase's
own criterion. Every line `src/lib/log.ts` emits is single-line JSON with a `scope` (verified 21/21
by parsing). But when an unhandled server error occurs, **Next prints its own plain-text output to
the same stream** — `⨯ Error: …` followed by indented `at …` frames. 42-18 measured 115 such lines
after deliberately triggering 14 unhandled errors; a clean boot produced none.

Each duplicates information the structured `"scope":"request"` line already carries better.
**Relevant to anyone configuring a strict JSON log shipper against this container** — it will need to
tolerate non-JSON lines, or Next's error output needs suppressing, which is a separate decision.

### Note: `.planning` holds 29 untracked files that eslint lints

`git ls-files .planning/phases/38-bulk-operations/38-20-uat-evidence/` returns **0** against 29 files
on disk. 42-18 exempted `.planning/**` from `no-console` for this reason. The directory still
contributes 2 non-`no-console` warnings, and **this is the pinned cause of the previously-unexplained
124-vs-122 lint warning split**: a worktree contains only tracked files, so those two warnings are
absent there. 124 − 2 = 122. Four executors each proved it was not their doing; this is why.

### Update, 2026-08-23 (after phase verification)

**This table now has ZERO open entries.** The `instrumentation.ts` row above was the last one; it
was written mid-wave and went stale when 42-17 closed it. The phase verifier caught the
discrepancy — the code fix was in place and `STATE.md` said closed while this table still read
"OPEN". Corrected above.

That makes this table stale-then-corrected **three** times in one phase (42-12 and 42-13 were both
misled by it into reporting already-fixed items as open, and the row above outlived its own fix).
The lesson for future phases is structural, not clerical: **a deferred-items table maintained by hand
across parallel waves will go stale, because the plan that closes an item is rarely the plan that
recorded it.** Verify against the file, not the table.
