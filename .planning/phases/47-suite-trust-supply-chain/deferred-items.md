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

---

## From 47-08

### D-47-08-A: `next` 16.3.2 is blocked by a platform-blind `engines.node` gate — SPLIT RECOMMENDED

**Found during:** Task 1
**What:** `next@16.1.6 -> 16.3.2` installs cleanly, passes `tsc` (exit 0), passes `eslint`
(0 errors / 124 warnings) and passes the RSC project (8/8), but turns **2 assertions** in
`src/lib/__tests__/node-engines-floor.test.ts` red — `:335` (NC-3's complement) and `:379` (the
binding-chain assertion). One root cause:

```
next@16.3.2 declares optionalDependencies.sharp = ^0.35.3   (16.1.6 declared ^0.34.4)
=> sharp moves 0.34.5 -> 0.35.3
=> @img/sharp-win32-ia32@0.35.3 declares engines.node "^20.9.0"   (0.34.5 declared "^18.17.0 || ^20.3.0 || >=21.0.0")
=> ^20.9.0 means >=20.9.0 <21.0.0, so Node 24.12.0 FAILS it
=> the gate, which walks every engines.node range in the lockfile REGARDLESS of os/cpu, reports a violation
```

The entry is `os: ["win32"]`, `cpu: ["ia32"]`, `optional: true` — a Windows 32-bit binary that npm
will never install on this project's linux/x64 (glibc or musl) targets. sharp's cap is **correct**:
Node stopped shipping 32-bit Windows builds after Node 20. **The gate's scope is what is wrong.**

**Structural, not incidental:** every `sharp` 0.35.x (`0.35.0`, `0.35.1`, `0.35.2`, `0.35.3`) caps
`@img/sharp-win32-ia32` at `^20.9.0`, and `sharp >= 0.35.0` is required to clear the advisory
(vulnerable range `<0.35.0`). No sharp version both fixes the advisory and keeps an uncapped range.

**What it costs to leave open (measured, not projected):** the bump clears
`[next, postcss, sharp]` from the crit+high set with **nothing joining at any severity** —
`{"low":3,"moderate":7,"high":4,"critical":0,"total":14}` becomes
`{"low":3,"moderate":7,"high":1,"critical":0,"total":11}`, leaving only `nodemailer` (47-09's
accept-with-reason). That includes **28 GHSAs on `next`**, among them GHSA-c4j6-fc7j-m34r
(CVSS 8.6, SSRF via WebSocket upgrades) and GHSA-492v-c6pp-mqqv (CVSS 8.1, middleware bypass via
dynamic route parameter injection), plus `next`'s exact-pinned `postcss@8.4.31` (-> 8.5.23) and
`sharp` (-> 0.35.3).

**Scope of the fix:** make `nodeFloorViolations` skip lockfile entries whose `os`/`cpu` exclude every
platform this project builds for. Measured on both trees:

```
REVERTED (next 16.1.6): 834 ranges walked, 0 violations platform-blind, 0 platform-aware
BUMPED   (next 16.3.2): 836 ranges walked, 1 violation platform-blind, 0 platform-aware
    node_modules/@img/sharp-win32-ia32  requires ^20.9.0  os=["win32"] cpu=["ia32"] optional=true
```

**And it is proved NOT to create a new vacuity** — the thing this phase exists to prevent. NC-3's
binding control survives the filter:

```
@napi-rs/lzma-linux-x64-gnu  engines.node = ^22.20 || ^24.12 || >=25
  os = ["linux"]  cpu = ["x64"]
  survives a linux/x64 applicability filter ? true
  still violated at 20.20.2 ? true
```

The follow-up should still add its own two-direction control: an `os:["win32"]` fixture with an
impossible range asserted **skipped**, and an `os:["linux"]` fixture with the same range asserted
**reported**. Without both, the filter itself is unfalsified.

**An option to consider and probably reject:** `overrides: { "sharp": "0.34.5" }` would land
`next@16.3.2` today with no gate change. It contradicts `next`'s own declared `^0.35.3` range and
deliberately re-opens `GHSA-f88m-g3jw-g9cj` to close a *reporting* problem — trading a fixed advisory
for an open one, which 47-CONTEXT prohibits. 47-07 measured sharp's reach as narrow (`next/image`
imported in **0** files, **0** occurrences of `<Image`, no `images` block in `next.config.ts`), but
"narrow" is not a reason to un-fix something already fixed.

**Not fixed in 47-08 because:** the plan's `files_modified` is `package.json` + `package-lock.json`
only, and its STOP CONDITION forbids weakening an assertion to accommodate the bump. 47-CONTEXT
reserved exactly this path: *"`next@16.1.6 -> 16.3.2` is its own task with its own gate, splittable
to a follow-up if it needs code changes."* It needs a code change.

**Owner:** a new follow-up phase (or 47-13 if the phase is extended). **Not 47-09** — 47-09's
allowlist should NOT accept `next`'s 28 advisories on a permanent basis; it should reference this item
with a short expiry, because the fix is small and specified.

### D-47-08-B: the human authenticated render against image `sha256:8f07a18e` is still owed

**Found during:** Task 3
**What:** the rebuild landed 47-07's Auth.js trio (`@auth/core` 0.41.1 -> 0.41.3, `next-auth`
beta.30 -> beta.32, `@auth/drizzle-adapter` 1.11.1 -> 1.11.3) and `drizzle-orm` 0.45.1 -> 0.45.2 into
the running container **for the first time**. Because 47-08's `next` bump reverted, the render no
longer gates assumption A3 — it gates 47-07's runtime bumps, in the sign-in and query paths.
**Owed checks:** sign-in; `/deals` rendering real data (~25,195 deals; *Base Fria - Lead* ~3,466,
*Base Fria - Parceiro* ~288); a drag-and-persist round trip (the only write path through the bumped
`drizzle-orm`); `/organizations`; `/admin/audit` (confirms the Auth.js bump did not change the
*authorization* result); a clean application console.
**What was observed and is explicitly PARTIAL, not the sign-off:** `/deals` -> HTTP 307 ->
`/login` -> HTTP 200, login page 67,525 bytes with a `<form>` and a password input, title
`Authentication`. This proves middleware runs and the login page server-renders. It does not prove a
page renders data, and it touches neither authorization nor any write path.
**Owner:** the orchestrator (drives a real browser). A failure here implicates **47-07's** bumps, not
`next`, so the action would be to identify the package and hand it back to 47-07's disposition.

## D-47-08-B — RESOLVED IN PART (orchestrator, 2026-08-25, Claude-in-Chrome)

The owed authenticated render against the rebuilt image was performed. **Verified:**

| Surface | Result |
|---|---|
| Authenticated session | live — the Auth.js trio (`@auth/core` 0.41.3, `next-auth`) is serving real sessions from the rebuilt container |
| `/deals` | renders 3,466 (*Base Fria - Lead*, $1,165,182) + 288 (*Base Fria - Parceiro*); pipeline selector populated `BDR - Base Fria` |
| `/organizations` | renders against the ~46k-org table |
| `/admin/audit` | 214 entries, oldest Aug 16 2026, retention UI intact — the Auth.js bump did NOT change the authorization result |
| Browser console | **zero application errors** (only MetaMask extension `MaxListenersExceededWarning` noise) |

**STILL OWED — the stage-change write path was NOT exercised through a real gesture.**
`left_click_drag` did not start the drag: `deals.position` stayed 5000 and `updated_at` stayed
`2026-08-08 19:48:13.615` for `Robin Food` (`64f321e4-9812-45ce-814d-5ee05ed24bde`). That is
`@dnd-kit`'s PointerSensor activation constraint correctly refusing a synthetic move-and-release
(plan 47-08 predicted exactly this). The card chevron did not open a stage menu either — after
clicking it, `Move` / `Stage` / `Edit` / `Delete` were all absent from the extracted DOM.

So `drizzle-orm@0.45.2`'s write path is covered by the 4,845-test suite but **not** by a real
pointer gesture. Anyone with a mouse can close this in ten seconds: drag a card between columns on
`/deals`, reload, confirm it stayed.

**Side-effect check performed before touching anything:** 0 active workflows; the single outbound
webhook (`https://pipelite.pedrobittencourt.net/admin/webhooks`) subscribes only to `deal.deleted`
and `person.created`, so a stage move could not fire anything external.

**Two of my own earlier claims, corrected:**
- I reported a "frozen renderer" on `/deals` and `/admin/audit`. **False.** `get_page_text` returned
  full content from a page whose `Page.captureScreenshot` had just timed out three times — the pages
  were alive and the screenshot transport is what is intermittently failing. Not a product defect.
- I called that a live PERF-01 symptom. **Premature** — one flaky screenshot is not a reproduction.

## Observation for Phase 51 (PERF-01) — measurement, not a conclusion

`get_page_text` on `/deals` returned **51,936 bytes / 2,523 lines containing 832 card price markers**,
against roughly **8 cards visible** in the viewport. Consistent with the board materialising far more
of the column than it displays. The server is not the bottleneck: `/api/health` answered **200 in
5.5 ms** while the client was struggling, and the pipeline holds **3,754 deals**
(stage `ad4d9fb5-92c7-4170-8e93-2163153a99d9`). Phase 51 owns the real measurement.
