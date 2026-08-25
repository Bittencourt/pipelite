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

---

## From 47-07

### D-47-01-A: STILL OPEN — carried forward unchanged

Re-verified 2026-08-25 during 47-07: `package.json` still carries `overrides: { "vite": "^7.0.0" }`,
`package-lock.json` still has **no** `overrides` key, `vite` still resolves 7.3.6. 47-07 edited three
dependency ranges in `package.json` and did **not** disturb the override block. Nothing in the repo
fails if those three lines are deleted.
**Owner:** 47-09 or 47-10. One-liner in the offline policy test: assert `pkg.overrides.vite` exists
and `semver.subset(pkg.overrides.vite, "<8")` — `semver` is already a devDependency, zero new deps.
Per the standing v1.4 rule, delete the override and observe the assertion **red** before trusting it.

### D-47-01-B: partially resolved by 47-07

`@aws-sdk/xml-builder` and `yaml` left the moderate set (9 → 7) as side effects of 47-07's clusters
1c and 2a. `esbuild`'s surviving moderate is unfixable in range: its parents
`@esbuild-kit/core-utils` and `@esbuild-kit/esm-loader` are **deprecated, unmaintained** packages
whose only parent is `drizzle-kit@^0.31.9`. Still below the `failOn` floor.
**Owner:** 47-09 may note it in the policy document as a known below-floor item.

### D-47-01-C: RESOLVED by 47-07 — do not chase it

47-07 cluster 1b bumped `next-auth` to `5.0.0-beta.32`, which resolves `@auth/core@0.41.3` and
**removes** the nested `next-auth/node_modules/@auth/core@0.41.0` that declared
`peerOptional nodemailer@"^6.8.0"`. Both `@auth/core@0.41.3` and `next-auth@5.0.0-beta.32` now declare
`peerOptional nodemailer@"^7.0.7 || ^8.0.5"`, which `nodemailer@7.0.13` satisfies. Clusters 1b/1c/1d/2a
and `npm ci` all emitted **zero** peer warnings.
**Consequence for 47-09:** bumping `nodemailer` to 9.x would **re-open** the mismatch, since
`^7.0.7 || ^8.0.5` excludes 9.x. That is a freshly measured argument *for* accept-with-reason.
**Note:** this weakens the case for `Dockerfile:24`'s `--legacy-peer-deps`, but converting it to
`npm ci` remains explicitly deferred out of Phase 47 by 47-CONTEXT § Deferred Ideas.

---

### D-47-07-A: `src/auth.ts:33-35` comment and `as any` cast are now stale

**Found during:** Task 1 cluster (b)
**What:** `src/auth.ts` carries:
```
// Cast needed: @auth/drizzle-adapter and next-auth bundle separate @auth/core copies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
adapter: DrizzleAdapter(db) as any,
```
After 47-07's trio bump, `npm ls @auth/core` shows **one** copy — `@auth/drizzle-adapter@1.11.3` and
`next-auth@5.0.0-beta.32` both resolve `@auth/core@0.41.3` (deduped). The stated reason for the cast
no longer holds. `tsc --noEmit` is exit 0 *with* the cast, so this is not a defect; it is a stale
comment plus a possibly-unnecessary `any` escape hatch on the auth adapter — a type-safety hole on a
security-relevant boundary.
**Not fixed here because:** 47-07's `files_modified` is `package.json` + `package-lock.json` only.
**Owner:** 47-08 (it already touches `next` and must re-typecheck the auth surface) or a v1.4
follow-up. Removing the cast must be verified by `tsc --noEmit` exit 0, not assumed.

### D-47-07-B: the running container does NOT contain 47-07's runtime fixes

**Found during:** Task 1, runtime-tree partition
**What:** 47-07 moved **15 runtime-reachable packages**, added 3 to and removed 3 from the runtime
tree — including `drizzle-orm@0.45.2` (SQL identifier injection) and `@auth/core@0.41.3` (all three
criticals). `pipelite-app-1` is running an image built from the pre-plan tree, so **none of those
fixes is in the container.**
**Not fixed here because:** 47-07's `<environment_hazards>` explicitly forbids a rebuild — 47-08 pays
one rebuild covering this plan's runtime bumps and the `next` bump together.
**Owner:** 47-08. Status change: that rebuild is now **load-bearing, not a convenience**. If 47-08's
`next` bump is reverted, the rebuild must still happen. Also note `Dockerfile:24` uses
`npm install --legacy-peer-deps`, not `npm ci`, so the image tree is **not lockfile-exact** — the
rebuild does not *provably* carry these versions until that deferred conversion lands.

### D-47-07-C: `npm update` with many arguments does not reliably move every matching node

**Found during:** Task 2 cluster (a)
**What:** `npm update <12 package names>` left `node_modules/brace-expansion` at **1.1.12** although
**1.1.18** is published and satisfies its parent `minimatch@3.1.5`'s declared `^1.1.7`. The nested
copies moved; the hoisted top-level one did not. `npm update brace-expansion` **alone** moved it
immediately. npm 11.10.0.
**Why it matters as a recorded hazard:** had verification been batched instead of per-cluster, a high
advisory *with an available in-range fix* would have been handed to 47-09 as "accepted" on a false
premise. **Re-measure the audit set after each cluster, and after a batched `npm update` re-run each
package individually for any that did not leave the set.**
**Owner:** none — a process finding for 47-09 through 47-13 and any future dependency work.
