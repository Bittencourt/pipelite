# Phase 42 — Wave 1 handoff to waves 2-4

**Written by the orchestrator after wave 1 merged.** This run's context window (200K) does not
auto-load prior SUMMARY.md files into executor prompts, so everything wave 1 learned that later waves
need is here.

Merged state at handoff: **4455 passed / 32 skipped + RSC 8/8 · typecheck 0 · lint 0 errors / 124
warnings.** That is your baseline now, not 4406.

---

## Blockers wave 1 raised, now CLEARED by the orchestrator

**`@sentry/nextjs` 10.70.0 is INSTALLED and resolvable.** 42-03 correctly declared it in `package.json`
without running `npm install` (`node_modules` is a shared symlink and installing mid-wave would have
corrupted two sibling executors), and reported the blocker instead of resolving it unsafely. The
orchestrator then ran `npm install --legacy-peer-deps` on the main checkout and committed
`package-lock.json`.

`--legacy-peer-deps` was mandatory: the repo carries a pre-existing `@auth/core` 0.41.0-vs-0.41.1 peer
conflict that fails a plain install. **If you ever need to re-install, use that flag.** Verified:
`require.resolve('@sentry/nextjs')` succeeds, and `npm test`/`typecheck`/`lint` are all green with it.

**`42-PATTERNS.md` is now tracked in git.** It had been written to disk but never force-added, so it
was invisible inside worktrees (which receive only tracked files) while plans referenced it in
`<context>` and `<read_first>`. Both wave-1 executors that hit this worked around it; you will not have
to. If a plan references a `.planning/` file you cannot see, that is the cause — say so rather than
inventing a substitute silently.

---

## The one that will bite the migration plans (from 42-01)

**`ctx` keys land FLAT at the top level of the log line.** So a `ctx` key named `level`, `scope`, `msg`
or `ts` **silently overwrites a base field**. 42-01 scoped a guard out deliberately — it is not a defect
in the logger — but ~200 sites are about to gain structured `ctx`.

**Every migration plan: do not use `level`, `scope`, `msg` or `ts` as a ctx key.** Plan 42-18 should add
a collision check as a gate.

**Redaction is not enforceable from inside `log.ts`.** The only control is the migration contract's rule:
*never add a value to a log line that was not already in the string you are replacing.* That rule lives
at the call sites, which means it lives with you. A migrated line must not start carrying an email, a
request body, or a token that the original `console.*` did not.

---

## Contracts from wave 1's modules

**`src/lib/log.ts`** — 155 lines, zero imports. Levels delegate to the matching `console` method (NOT
`process.stdout.write`; that choice is what keeps test fallout at ~3 assertions instead of 89
`vi.spyOn(console, …)` sites, and there is a comment saying so — do not "simplify" it). `Error` values
in `ctx` are serialised explicitly with `name`/`message`/`stack` and a walked `cause` chain, because
`JSON.stringify(new Error())` is `{}`.

Newline escaping — the log-injection defence — is an **inherent property of `JSON.stringify`**, proven by
the naive-implementation RED still passing that case. It is structural, not a guard someone can remove.

**`src/lib/observability/heartbeat.ts`** — 234 lines, zero imports. Key is `__pipeliteHeartbeats` on
`globalThis`. **The map is NOT exported** and there are zero `keys()/entries()/values()` calls anywhere;
consume `EXPECTED_WORKERS` and `snapshot()`. Staleness is per-worker with the interval supplied by the
worker's own constant — the daily pruners stay alive across 24h, and `execution-processor` dies after
~70s. Subscriber `alive` derives from **registration**, never `lastTickAt`, because an event-driven
worker may legitimately never fire.

**The `globalThis` test is a PROXY, and is labelled as one in three places.** Vitest has a single module
registry and structurally cannot reproduce the four-instance Turbopack split. Until 42-18's container
check runs, **OBS-03 is unproven in production regardless of any number of passing unit tests** — which
is exactly what happened to `actor-context.ts`'s identical hazard: that defect shipped green.

---

## Stale comments wave 1 created and deliberately did not fix

42-03 moved the Dockerfile copy block, which invalidated **five comments citing `Dockerfile:24`**. Two
now state something false — `src/lib/trash/prune.ts:14` and `src/lib/trash/prune.test.ts:132` both say
it "still ends in a suppressed failure." It does not any more.

All five live in files owned by other plans, so editing them from a parallel worktree would have
collided. They are comments, not assertions, and those two test files still pass 27/0. **If you own one
of those files, fix its comment as part of your plan** and say so in your SUMMARY. Full list is in
`.planning/phases/42-observability/deferred-items.md`.

---

## Operational traps confirmed in wave 1

- **The stale-worktree base is now 15 for 15**, every one from `df3395c` or similar. Run the
  base-correction check as your first action, without exception. Sanity-check it by looking for
  something wave 1 built: if `src/lib/log.ts` or `src/lib/observability/heartbeat.ts` is missing, your
  base is wrong.
- **`docker compose config` renders resolved `.env` values** and will echo `INTERNAL_SECRET` and
  `SMTP_PASSWORD` into your transcript. Filter it through a narrow `grep` or send it to `/dev/null`.
  Never print it whole.
- **`npm install` / `npm ci` / `slopcheck install` are forbidden** — `node_modules` is a shared symlink
  and the dependency you need is already installed.
- **Vitest does not typecheck.** 42-01 had 24/24 green while `tsc` reported TS2737 on a `BigInt` literal
  suffix. Run `npx tsc --noEmit` separately; a green suite is not a green build.
