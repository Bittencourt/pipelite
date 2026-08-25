# Phase 47 — Deferred / Handoff Items

Out-of-scope discoveries logged during execution. Not fixed in the plan that found them.

---

## From 47-01

### D-47-01-A: `overrides.vite` has no in-repo gate defending it

**Found during:** Task 1
**What:** 47-01 added `overrides: { "vite": "^7.0.0" }` to `package.json`. That single line is the only
thing holding `vite` on the 7.x line. `vitest@4.1.x` declares `vite: "^6.0.0 || ^7.0.0 || ^8.0.0"`, so
the moment the override is deleted, any `npm install` that re-resolves the vitest subtree pulls
`vite@8.x` and with it 32 new lockfile keys (`rolldown` + 16 platform bindings, `@oxc-project/types`,
`@rolldown/pluginutils`, a nested `lightningcss` set) — the transitive-major refresh CONTEXT places out
of scope.

**Why it is fragile:** npm does **not** persist the `overrides` block into `package-lock.json`
(verified: `grep '"overrides"' package-lock.json` → 0 matches, lockfileVersion 3). The lockfile
therefore does not self-document the constraint. `npm ci` still reproduces `vite@7.3.6` because it
installs the pinned tree, but nothing in the repo fails if a future edit drops the override.

**Suggested owner:** 47-09 (audit policy / allowlist gate) or 47-07 (in-range bumps). A one-line
assertion in the offline policy test — `pkg.overrides.vite` exists and `semver.subset(range, '<8')` —
would close it with zero new dependencies.

**Not fixed here because:** 47-01's `files_modified` is `package.json` + `package-lock.json` only;
adding a test file is another plan's surface.

---

### D-47-01-B: `esbuild` moderate advisory survives the vite bump

**Found during:** Task 2
**What:** `esbuild` is still reported moderate after `vite` 7.3.1 → 7.3.6 bumped
`node_modules/vite/node_modules/esbuild` 0.27.3 → 0.28.2. The surviving report is the
`drizzle-kit > @esbuild-kit/*` copy, not vite's.
**Owner:** 47-07 (in-range) — moderate is below this phase's `failOn` floor
(`["critical","high"]`), so it is context, not a gate failure.

---

### D-47-01-C: pre-existing `@auth/core` ↔ `nodemailer` peer mismatch surfaces on every install

**Found during:** Task 1
**What:** `npm install` emits `npm warn ERESOLVE overriding peer dependency` —
`next-auth@5.0.0-beta.30 > @auth/core@0.41.0` declares `peerOptional nodemailer@"^6.8.0"` while the
project installs `nodemailer@^7.0.13`. npm resolves it by overriding the peer; the install exits 0.
This is the mismatch 47-RESEARCH names as the plausible reason `Dockerfile:24` carries
`--legacy-peer-deps`. It is **pre-existing and unrelated to vitest** — it fires identically on a bare
`npm ci` of the unmodified lockfile.
**Owner:** already tracked — `nodemailer` 7→9 is 47-09's accept-with-reason item, and the
`Dockerfile:24` `npm install --legacy-peer-deps` → `npm ci` conversion is explicitly deferred out of
Phase 47 by 47-CONTEXT § Deferred Ideas.
