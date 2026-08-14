# Phase 34 — Deferred / Out-of-Scope Items

Discovered during execution but NOT fixed (outside the current plan's scope).

## D34-01: Stale `.claude/worktrees/` copy pollutes `npx eslint`

**Found during:** 34-01 Task 2 gate run
**Status:** Not fixed — out of scope, and deleting another agent's worktree is destructive

An untracked directory `.claude/worktrees/agent-a4008ec941e553aad/` contains a full
duplicate checkout of the repo. A bare `npx eslint` walks into it, so the run reports
**256 warnings across 78 files — every one of them inside that worktree copy**. The real
source tree contributes zero warnings and zero errors.

Consequences:
- `npx eslint` still exits 0 (warnings only), so the gate is not broken today.
- But the output is ~48 KB of noise, and a future `--max-warnings 0` tightening would
  fail on files that are not part of the project.
- The directory is untracked and NOT gitignored, so it shows as `?? .claude/` and could
  be swept into a commit by a careless `git add -A` (another reason this repo's
  "individual paths only" rule matters).

Suggested resolution (needs a human decision, since it may be a live worktree owned by
another agent session): either add `.claude/` to `.gitignore` **and** to
`eslint.config.mjs`'s ignore list, or remove the stale worktree with
`git worktree remove` / `git worktree prune` once confirmed abandoned.
