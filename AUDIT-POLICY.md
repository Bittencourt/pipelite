# Dependency advisory policy

**Status:** in force. **Decision date of every disposition below:** 2026-08-25.
**Enforced by:** `npm run security:audit` on the required `ci` job, plus the offline assertions in
`src/lib/__tests__/audit-policy.test.ts` on every commit.
**Machine-readable half:** [`audit-policy.json`](./audit-policy.json), beside this file.

> This is not a vulnerability *disclosure* policy. A root `SECURITY.md` tells the outside world
> how to report a vulnerability in this project; this document states what this project does
> about vulnerabilities reported in the packages it depends on. They are different documents and
> must not be conflated.

---

## Why a policy exists at all instead of just `npm audit`

`npm audit` on this repository's committed lockfile reports **14 vulnerable packages carrying 47
distinct advisories** (measured 2026-08-25, npm 11.10.0: 0 critical / 4 high / 7 moderate / 3 low
packages, over 1285 audited dependencies). A bare `npm audit --audit-level=high` gate against a
tree like that has exactly two stable states: permanently red — in which case somebody deletes the
step within a week — or permanently disabled, in which case it was never a gate.

What makes an advisory gate usable is a **recorded decision per advisory**. Then the gate fires on
the advisories nobody has looked at, and stays quiet about the ones somebody has, on the record,
with a date attached.

`npm audit` also **exits 1 whenever any advisory exists at any severity**, which on this tree is
permanently true. So its exit code is not the verdict and cannot be: it cannot distinguish "14
advisories, every critical/high one disposed" from "one unallowlisted critical". `npm run
security:audit` captures npm's stdout, echoes its stderr through verbatim, prints the child's exit
code, and then decides on the parsed document alone.

---

## The three dispositions

Every critical and high advisory gets **exactly one** of these. Not zero, and not two.

| Disposition | What it means | Where it is recorded |
|---|---|---|
| **upgraded** | A version that fixes the advisory was installed, and the advisory left the audit document. | The commit that raised the version, and § "Upgraded" below. |
| **replaced** | The dependency was removed or swapped for something else, and the advisory left with it. | The commit that removed it, and § "Replaced" below. |
| **accepted with a reason** | The advisory stays, with a written reason, a stated reach, and an **expiry date**. | An entry in `audit-policy.json`, cross-referenced in § "Accepted" below. |

There is deliberately no fourth option. "Known, will look at it later" is `accepted` with a short
expiry; "not applicable" is `accepted` with a reason that says why.

## What a reason has to do

`audit-policy.json` is a mechanism for **suppressing security signal**. Every property that makes
it trustworthy is an assertion in `scripts/audit-policy.mjs`, not a convention:

- **non-empty, at least `MIN_REASON_LENGTH` (80) characters**, and not one of `FORBIDDEN_REASONS`
  (`dev-only`, `n/a`, `wontfix`, `see above`). A bare "dev-only" is not a reason.
- **a `reach`** from the closed set `runtime` / `build` / `dev`.
- **a `ghsa`** matching `/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/`. An entry keyed on a CVE id
  or a URL covers nothing while reading as a live exception.
- **an `expires`** as a bare `YYYY-MM-DD`, still in the future.
- **exactly one entry per advisory.** A duplicate is a failure, because the second entry can
  quietly extend the first one's expiry.
- **the advisory must still be reported.** A *stale* entry — one whose advisory has since been
  fixed — is a failure, not a harmless no-op, because a museum of dead exceptions is
  indistinguishable from a list of live ones.
- **the GHSA id must also appear in this document.** The prose and the data cannot drift apart.

Beyond what a machine can check, the standard a reviewer should hold an entry to is: **name the
call site or parent path with a `file:line`, name the measurement that supports the claim, and
name the alternative that was rejected and why.** A reason that would be true of any project is
not a reason.

## The expiry rule

Every accepted entry carries an expiry, and **an expired entry fails the gate**. That is the whole
mechanism: it converts acceptance from a permanent silence into a decision that comes back.

Two horizons, both measured from the decision date:

- **30 days** where a non-breaking fix is *measured available* and blocked only by something inside
  this repository. The acceptance is a scheduling decision, not a risk judgement, so it should be
  revisited on the timescale of the work that unblocks it.
- **90 days** where the only fix is a breaking major upgrade and the acceptance rests on evidence
  that the advisory's input surface is never supplied by this codebase. That evidence can go stale
  — a new call site is one commit away — so it gets re-read quarterly.

Extending a date **without re-reading the evidence** is the failure this field exists to prevent.
When an entry expires, the correct actions are: take the fix, or re-state the reason against
today's code and set a new date.

**Both ends of that rule are enforced, not stated.** An expiry that has passed fails the gate, and
so does an expiry more than 90 days away — `MAX_EXPIRY_DAYS` in `scripts/audit-policy.mjs`, applied
by `evaluatePolicy` and asserted per entry, offline, in `src/lib/__tests__/audit-policy.test.ts`.
Until that bound existed, `expires: "9999-12-31"` returned no problem at all: the single cheapest
way to silence a critical advisory forever was a one-field data edit that required no code change,
broke no test and turned no gate red, while still reading to a human as a reasoned 30-day
acceptance. A claim in a policy document is a liability unless something checks it, and an
unbounded expiry is a permanent silence wearing a decision's clothes.

The 30-day horizon is deliberately **not** machine-enforced: which of the two applies depends on
whether a non-breaking fix is measured available, which is a judgement stated in the entry's
`reason` rather than a machine-readable field. 90 is the bound that holds for every entry, so 90 is
what the gate enforces; the 30-day case is enforced by review against the `reason`.

## Runtime vs build vs dev — a judgement per advisory, not a flag

A transitive advisory reachable only from a build tool is a genuinely different risk from one in
the server's request path, so every accepted entry states which it is.

**`npm audit --omit=dev` is not this policy, and must not be substituted for it.** Two measured
reasons:

1. It hides real risk. `vitest`'s `GHSA-5xrq-8626-4rwp` was **critical, CVSS 9.8** — arbitrary file
   read and execution while the Vitest UI server listens — and `--omit=dev` would have silenced it
   entirely. It was fixed by upgrade in 47-01 instead.
2. It keeps things it should not. `postcss@8.4.31` is nested under `next`, a production dependency,
   so it appears under `--omit=dev` and *ships in the image* — while executing only at build time.
   The flag gets that exactly backwards; only a per-advisory judgement gets it right.

Reach is **reconciled, never asserted**: 47-07 checked every classification against
`npm audit --omit=dev --json` and that reconciliation **falsified two of its own plan's
classifications** (`nanoid` called BUILD and `fast-uri` called DEV were both RUNTIME). Applied to a
package that had stayed, that mistake would have produced a false "dev-only" acceptance.

**There are currently ZERO dev-reach acceptances, and none is available.** 47-07's `--omit=dev`
reconciliation on the fixed tree reports the same four packages with and without dev dependencies
(`next`, `nodemailer`, `postcss`, `sharp`) — every remaining critical/high advisory is in the
production install tree. `dev` remains a legal `reach` value with no current instances.

## `failOn` is `critical` + `high`

`audit-policy.json` declares `"failOn": ["critical", "high"]`, and both
`scripts/audit-policy.mjs` and `src/lib/__tests__/audit-policy.test.ts` assert that set for
**equality**, not containment.

The reason is that an emptied `failOn` satisfies "no unallowlisted critical or high advisory"
perfectly. It is the single cheapest way to make this gate vacuous, so it is the one value in the
whole arrangement that cannot be changed quietly: widening or narrowing the policy means editing
`REQUIRED_FAIL_ON` in `scripts/audit-policy.mjs` in the same commit, which is a reviewable act.

Moderate and low advisories are **recorded but not gated** — see § "Below the floor".

## `npm audit fix` is forbidden as the remediation instrument

Not discouraged — forbidden, and for a measured reason. Run against this tree it adds `rolldown`,
`tsx` and `esbuild` and moves `vite` from 7 to 8, pulling in 32 lockfile keys (the `rolldown`
platform bindings, `@oxc-project/types`, `@rolldown/pluginutils`, a nested `lightningcss` set) —
i.e. it answers an advisory by performing the transitive major refresh that is explicitly out of
scope, and it does so as a side effect nobody reviewed.

Remediate **per advisory, deliberately**, with the narrowest instrument that moves the subtree in
question: `npm update <pkg>` where the fix is already inside a parent's declared range, and an
explicit `npm install <pkg>@<version>` only where a manifest range has to move. 47-07 closed 20 of
24 critical/high packages that way and added exactly three lockfile keys, all of them `axios`'s own
proxy dependencies.

Two npm behaviours worth knowing before doing this: `npm update` with many package arguments does
**not** reliably move every matching node (`brace-expansion` needed a second single-argument pass),
and `overrides` are **not** persisted into `package-lock.json`, so an override is only as durable
as the assertion defending it.

## No new tooling — the evaluator is in-repo, with zero dependencies

`scripts/audit-policy.mjs` imports `node:child_process`, `node:fs` and `node:path` and nothing
else. That is a decision, not an oversight, and the alternatives were checked rather than assumed:

- **`audit-ci`** — last published **2024-07-03**, and it declares **`event-stream@4.0.1`** as a
  direct dependency: the package at the centre of the canonical npm supply-chain compromise.
  Answering a supply-chain requirement by installing 30 packages, one of them that one, from a tool
  nobody has published in two years is self-defeating.
- **`better-npm-audit`** — 23 months stale, on the deprecated `lodash.get`.
- **`osv-scanner`** — a Go binary, not on npm, not installed here.

`npm audit --json` already emits everything a policy needs. The trade is that the allowlist format
is ours rather than an ecosystem standard; the `.nsprc` convention those tools accept predates GHSA
ids and originates with the retired Node Security Platform, so there is less standard to adopt than
it first appears.

## Where the gate runs, and why there

The step runs on the **required `ci` job** in `.github/workflows/ci.yml`, alongside `typecheck`,
`lint`, `test` and the migration chain check, with `if: ${{ !cancelled() }}` so a security finding
never hides a type error and vice versa. A new workflow file would publish a check-run name that
the branch ruleset does not require, and a non-blocking gate is a vacuous gate.

**It needs network, and there is no offline mode.** The advisory data lives at
`registry.npmjs.org/-/npm/v1/security/advisories/bulk`. `npm audit --package-lock-only` — which
this script supports as a flag — changes the **tree source** (it resolves from `package-lock.json`
without needing `node_modules`), not the **advisory source**. Anyone who claims this gate runs
offline is mistaken.

That is also why the split between the two halves is where it is: everything checkable without a
network lives in `src/lib/__tests__/audit-policy.test.ts` and runs on every commit, because the
base vitest project must stay offline-clean. The one check that needs a live audit — "is every
allowlisted advisory still actually reported?" — lives in the script.

## What tree this policy evaluates — the honest limitation

This policy is evaluated against `package-lock.json`, which is the tree `npm ci` installs — CI's
tree and every contributor's. It is **not** evaluated against the production image. `Dockerfile:24`
uses `npm install --legacy-peer-deps`, which is not lockfile-exact by contract; measured on
2026-08-25 it produced a strict subset of the lockfile tree (41 packages fewer, no version
differences, none of them carrying a critical or high advisory), and the runtime image narrows that
further to Next's standalone trace. So the policy is a **conservative over-approximation** of the
image's advisory surface for the packages it shares — it can report an advisory in a package the
image does not ship, and it cannot by itself prove which version the image resolved. Converting
`Dockerfile:24` to `npm ci --legacy-peer-deps` would collapse the two trees into one and make that
caveat unnecessary; it is deferred (recorded in `.planning/BACKLOG.md`, deferred from Phase 46) and
is **not** in this phase's scope.

Three distinct trees exist, and this gate reads exactly one of them:

| # | Tree | Produced by | Audited here? |
|---|---|---|---|
| 1 | `package-lock.json` | `npm ci` — CI's tree and every contributor's | **yes** |
| 2 | Docker builder stage | `npm install --legacy-peer-deps` (`Dockerfile:24`) | no — a 41-package subset of #1 at identical versions, measured 2026-08-25 |
| 3 | Runtime image | Next standalone trace (`Dockerfile:39-60`) | no — a smaller subset again |

Do not read a green run as a statement about production. The way to know what the image ships is to
ask the running container, as 47-08 did.

---

# The dispositions

## Upgraded

Every one of these left the audit document because a fixed version was installed. Each was
verified by reading the resolved version out of `package-lock.json` and asserting it with `semver`,
never by eyeballing a manifest range, and the critical/high set was re-measured after **each**
cluster rather than after the batch.

| Package | Moved to | Note |
|---|---|---|
| `vitest` | 4.1.11 | cleared `GHSA-5xrq-8626-4rwp` — **critical, CVSS 9.8** |
| `vite` (via `overrides`) | 7.3.6 | five vite advisories cleared as a side effect of the `^7.0.0` constraint |
| `drizzle-orm` | 0.45.2 | SQL identifier injection, in the server's own query-construction path — installed first, before anything else moved |
| `@auth/core` | 0.41.3 | **all three criticals** in the tree; also deduped from two copies to one |
| `@auth/drizzle-adapter` | 1.11.3 | |
| `next-auth` | 5.0.0-beta.32 | |
| `axios` | 1.19.0 | |
| `form-data` | 4.0.6 | |
| `lodash`, `lodash-es` | 4.18.1 | |
| `nanoid` | 3.3.18 | classified BUILD by the plan; reconciliation proved it RUNTIME |
| `fast-uri` | 3.1.6 | classified DEV by the plan; reconciliation proved it RUNTIME |
| `follow-redirects` | 1.16.0 | |
| `@aws-sdk/xml-builder` | 3.972.40 | in range of the installed tree; the alternative (`@aws-sdk/client-s3` to 3.1117.0) would have refreshed the whole AWS SDK |
| `postcss` (top level) | 8.5.26 | the nested copy under `next` is a separate, still-open case — see below |
| `brace-expansion` | 1.1.18 | needed a second, single-argument `npm update` pass |
| `@hono/node-server`, `express-rate-limit`, `flatted`, `hono`, `ip-address`, `js-yaml`, `minimatch`, `path-to-regexp` | current | the dev-reach cluster; all nine confirmed dev-only against `--omit=dev` before and after |

## Replaced

| Package | What happened |
|---|---|
| `fast-xml-parser` | **removed from the lockfile entirely** as a consequence of the `@aws-sdk/xml-builder` update, along with its `strnum` dependency. Confirmed absent from the running container, not merely from the lockfile. |

## Accepted

Four packages, **39 advisories**, every one of them with an entry in `audit-policy.json`. None is
dev-reach; see § "Runtime vs build vs dev".

### `next` 16.1.6 — high — reach `runtime` — 28 advisories — expires **2026-09-24**

`next` is the web framework: `next.config.ts:7` declares `output: "standalone"` and
`docker-entrypoint.sh:8` runs `exec node server.js`, so this package *is* the server process.

The fix is **`next` 16.1.6 → 16.3.2**, which npm reports as `fixAvailable` and **not**
`isSemVerMajor`. 47-08 installed it, then measured its effect by resolving a candidate lockfile in a
scratch directory with `npm install --package-lock-only` and auditing that: it **clears `next`,
`postcss` and `sharp`, and joins nothing at any severity** — 4 high down to 1, and the 1 is
`nodemailer`. It is type-clean, lint-clean and RSC-clean, with 4843 of 4845 base tests passing.

**It is blocked inside this repository, not upstream.** `next@16.3.2` declares
`optionalDependencies.sharp: ^0.35.3`; every `sharp` 0.35.x caps `@img/sharp-win32-ia32`'s
`engines.node` at `^20.9.0` (correctly — Node stopped shipping 32-bit Windows builds after Node
20); and `nodeFloorViolations` in `src/lib/__tests__/node-engines-floor.test.ts` walks every
`engines.node` range in the lockfile **platform-blind**, so a Windows-only optional binary that can
never be installed here fails the `>=24.12.0` floor declared at `package.json:6`. Two assertions go
red, at `:335` and `:379`, from one root cause. Fixing that gate is a scoped follow-up, specified
and de-risked by 47-08 (which also proved the gate's own NC-3 control survives a platform filter).

**The workaround was considered and rejected:** `overrides: { "sharp": "0.34.5" }` would land
`next@16.3.2` today with no gate change, but it contradicts `next`'s own declared range and
deliberately re-opens `GHSA-f88m-g3jw-g9cj` — trading a fixed advisory for an open one to solve a
*reporting* problem.

Twelve of the 28 are individually `high`; the remaining sixteen are moderate or low but are gated
anyway, because npm's package-level severity is `high` and every advisory of a gated package needs a
disposition. Grouped by what each actually requires:

| Precondition, measured | Verdict | Advisories |
|---|---|---|
| Middleware / proxy path — `src/middleware.ts:3-5` is the NextAuth `auth` middleware, this app's only page-level authentication gate, matcher at `:8` | **REACHABLE — authentication-bypass class** | `GHSA-26hh-7cqf-hhc6` `GHSA-267c-6grr-h53f` `GHSA-492v-c6pp-mqqv` `GHSA-3g8h-86w9-wvmq` |
| Server Components / RSC — every page renders through RSC, no `pages/` directory exists | **REACHABLE** | `GHSA-q4gf-8mx6-v5v3` `GHSA-8h8q-6873-q5fj` `GHSA-vfv6-92ff-j949` `GHSA-wfc6-r584-vfw7` |
| Server Actions — 23 files carry a top-level `"use server"` | **REACHABLE** | `GHSA-mq59-m269-xvcx` `GHSA-m99w-x7hq-7vfj` `GHSA-955p-x3mx-jcvp` |
| Requests with bodies — uploads at `src/app/api/upload`, CSV import under `src/app/import` | **REACHABLE** | `GHSA-68g3-v927-f742` `GHSA-4633-3j49-mh5q` |
| `next/image` — **0** of 702 `src/` files import it, **0** use `<Image`, no `images` block in `next.config.ts` | narrow, not zero: `/_next/image` still exists on the standalone server | `GHSA-3x4c-7xq6-9pq8` `GHSA-h64f-5h5j-jqjh` `GHSA-q8wf-6r8g-63ch` |
| `rewrites` — `next.config.ts` declares none | precondition absent | `GHSA-ggv3-7p47-pfv8` `GHSA-p9j2-gv94-2wf4` |
| Pages Router with i18n — no `pages/` directory anywhere; no `i18n` key; localisation is App-Router `next-intl` via cookie (`src/i18n/request.ts:9-17`) | precondition absent | `GHSA-36qx-fr4f-26g5` |
| Turbopack **and a single locale** — `src/i18n/config.ts:1` declares three locales | locale half absent (the Turbopack half does hold) | `GHSA-6gpp-xcg3-4w24` |
| CSP nonces — no `headers` in `next.config.ts`; the only two `/nonce/i` matches in `src/` are QuickJS sandbox tests | precondition absent | `GHSA-ffhc-5mcf-pf4q` |
| `next/script` `beforeInteractive` — **0** imports of `next/script`, **0** occurrences of `beforeInteractive` | precondition absent | `GHSA-gx5p-jg67-6x7h` |
| Cache Components — no `cacheComponents`, no `experimental` block, **0** `"use cache"` / `unstable_cache` | precondition absent | `GHSA-mg66-mrh9-m8jx` |
| Partial Prerendering — **0** `experimental_ppr` | precondition absent | `GHSA-h27x-g6w4-24gq` |
| Custom server — no `server.ts` / `server.js` / `server.mjs` at the root; `docker-entrypoint.sh:8` runs Next's own standalone server | precondition absent | `GHSA-89xv-2m56-2m9x` |
| WebSocket upgrades — **0** `src/` files match `WebSocket` / `Sec-WebSocket` | precondition absent | `GHSA-c4j6-fc7j-m34r` |
| Edge runtime — **0** files declare `runtime = "edge"`; `next.config.ts:8` lists native packages in `serverExternalPackages` | precondition absent | `GHSA-4c39-4ccg-62r3` |
| Dev HMR websocket — `next dev` is not the supported workflow; the image runs the built standalone server | dev-server only | `GHSA-jcc7-9wpm-mj36` |

The reachable ones are **not** argued away. Their disposition is a scheduling decision, and the
30-day horizon exists because of them — `GHSA-26hh-7cqf-hhc6` and `GHSA-492v-c6pp-mqqv` in
particular are middleware bypasses in an application whose only page-level authentication gate *is*
middleware.

### `postcss` 8.4.31 (nested under `next`) — high — reach `build` — 4 advisories — expires **2026-09-24**

`GHSA-qx2v-qp2m-jg93` `GHSA-6g55-p6wh-862q` `GHSA-fxqj-rqcc-2cmp` `GHSA-r28c-9q8g-f849`

`node_modules/next/node_modules/postcss@8.4.31` is the **only** vulnerable copy; the top-level
`node_modules/postcss` is already 8.5.26, above the `<=8.5.22` vulnerable range. `next@16.1.6` pins
its nested copy **exactly**, so no in-range instrument can move it — npm reports `fixAvailable` as
`{"name":"next","version":"16.3.2"}`. It therefore moves only when `next` moves, and its blocker is
`next`'s, not its own.

Reach is `build` with a caveat worth stating: the lockfile entry carries no `dev` flag (because
`next` is a production dependency), so the package **ships inside the image** — but `next` invokes
postcss only in the CSS pipeline during `next build`, and nothing in `src/` passes request data to
it. All four advisories require processing attacker-authored CSS (three of them an
attacker-controlled `sourceMappingURL`); the only stylesheets in this tree are `src/app/globals.css`
and Tailwind's generated output, both authored in-repo.

### `sharp` 0.34.5 — high — reach `runtime` — 1 advisory — expires **2026-09-24**

`GHSA-f88m-g3jw-g9cj` — inherited libvips CVE-2026-33327, CVE-2026-33328, CVE-2026-35590,
CVE-2026-35591.

An optional dependency of `next@16.1.6`, which declares `^0.34.4`, so the fixed 0.35.x is out of
range and moves only with `next`. Reach is **narrow but not zero**: `next/image` is imported in
**0** of 702 `src/` files, `<Image` appears **0** times, and `next.config.ts` declares no `images`
block, so no `remotePatterns` are configured and the optimizer rejects external URLs — but the
`/_next/image` endpoint still exists on the standalone server. "Narrow" is not a reason to un-fix
something, which is why the `overrides: { "sharp": "0.34.5" }` shortcut was rejected: it would
re-open this very advisory.

### `nodemailer` 7.0.13 — high — reach `runtime` — 6 advisories — expires **2026-11-23**

`GHSA-c7w3-x93f-qmm8` `GHSA-vvjj-xcjg-gr5g` `GHSA-268h-hp4c-crq3` `GHSA-wqvq-jvpq-h66f`
`GHSA-r7g4-qg5f-qqm2` `GHSA-p6gq-j5cr-w38f`

**The package is reachable; the advisories' input surface is not.** `src/lib/email/client.ts:1`
imports `createTransport`, so this is genuinely in the server's runtime path. But:

- There is exactly **one** `sendMail` call site in the repository — `src/lib/email/send.ts:29-35` —
  and it passes exactly `{ from, to, subject, html, text }`.
- Every caller reaches it through the seven typed helpers in the same file, none of which accepts a
  message-option argument, so `raw` cannot be reached even indirectly.
- The transport config literal at `src/lib/email/client.ts:9-21` supplies only `host`, `port`,
  `secure`, `auth` and `tls`, all from environment variables, and is passed to `createTransport` at
  `src/lib/email/client.ts:36` — the only such call in the repository.
- Measured 2026-08-25: exactly **three** files under `src/` reference
  `nodemailer` / `sendMail` / `Transporter` / `createTransport`, and **zero** of them supply `raw`,
  `envelope`, `list`, `jsonTransport`, a transport `name`, `disableFileAccess` or
  `disableUrlAccess` — which is, between them, the entire input surface of all six advisories.
- **Zero** occurrences of `OAuth2` anywhere in `src/`, and Auth.js is configured with the
  Credentials provider **only** at `src/auth.ts:38-39`, so no email provider exists to trigger the
  OAuth2 token fetch either.

The only fix is `nodemailer` **7 → 9** — npm reports `fixAvailable` as
`{"name":"nodemailer","version":"9.0.5","isSemVerMajor":true}`, a two-major breaking bump. Taking it
would trade a documented risk for an undocumented one inside a debt-paydown milestone, and it has a
second, freshly measured cost: `@auth/core@0.41.3` and `next-auth@5.0.0-beta.32` both declare
`peerOptional nodemailer: "^7.0.7 || ^8.0.5"`, which 9.x does not satisfy, so it would **re-open**
the ERESOLVE peer conflict that 47-07 eliminated. Hence the 90-day horizon and a written reason
rather than the bump.

**One thing this acceptance does not cover, stated because it cuts the other way:**
`src/lib/email/client.ts:20` sets `tls: { rejectUnauthorized: false }`, disabling SMTP certificate
verification unconditionally. That is a larger exposure than any of the six advisories above, it is
recorded in `.planning/BACKLOG.md` with its `file:line`, and it is **not** fixed by this policy —
this document's scope is the advisory position, not the SMTP client.

---

## Below the floor — recorded, not gated

`failOn` is `["critical", "high"]`, so these are not gate failures. They are written down so that
"not gated" does not become "not known" (measured 2026-08-25):

- **moderate (7 packages):** `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `drizzle-kit`,
  `esbuild`, `next-intl`, `qs`, `yaml`
- **low (3 packages):** `@babel/core`, `body-parser`, `icu-minify`

`esbuild`'s surviving moderate has **no in-range fix**: its parents `@esbuild-kit/core-utils` and
`@esbuild-kit/esm-loader` are both deprecated and unmaintained, and their only parent is
`drizzle-kit@^0.31.9`. If `failOn` is ever widened to include `moderate`, that chain is the first
thing to look at, and replacing or dropping `drizzle-kit` is the only real instrument.

## How this policy is proved able to fail

A gate nobody has watched go red is a stated intention, not a policy. Both halves have been broken
on purpose, and the verbatim output is recorded in
`.planning/phases/47-suite-trust-supply-chain/47-09-SUMMARY.md`:

- **Three permanent negative controls** live in `src/lib/__tests__/audit-policy.test.ts` and stay
  there forever, so they cannot rot out of the repository: a `dev-only` reason, a back-dated
  `expires`, and an emptied `failOn` each make the evaluator report a problem, and each is asserted
  alongside the complementary case where it does *not*, so a function that always reported
  something would fail too.
- **Three document-shape controls** on the script's own floors. An `npm audit` document whose
  `vulnerabilities` object is empty while `metadata` still claims 14 packages must **fatal on the
  reconciliation**; a tiny document must **fatal on `MIN_PACKAGES_AUDITED`**; and a document that
  is *self-consistent, full-size and empty* — a resolved 1285-package tree for which the registry
  returned no advisories at all — must **fatal on `MIN_ADVISORIES_PARSED`**, because it reconciles
  (0 === 0) and clears the package floor, so that is the only control that fires on it. This is the
  single most likely way this gate ships vacuous — a network error, a proxy interception or a
  schema change all produce zero offenders and exit 0.
- **The end-to-end control**, which belongs to CI rather than to this file: add a knowingly
  vulnerable dependency (`minimist@1.2.5`, one critical advisory, zero dependencies, trivially
  reverted), watch the required `ci` check go red, revert, watch it go green. The order matters —
  the gate must be observed **green on the fixed tree first**, or the red proves only that it was
  already red.

## Contributing

If `npm run security:audit` fails on your branch, the output names every problem. The things **not**
to do, all of which reach green while making the gate meaningless:

- narrowing or emptying `failOn`;
- extending an expiry without re-reading the evidence behind it;
- adding an entry whose reason would be true of any project;
- running `npm audit fix`.

The things to do: take the fix if it is in range; or write a real entry — `ghsa`, `package`,
`reason` (call site, measurement, rejected alternative), `reach`, `expires` — add it to
`audit-policy.json`, and record it in this document, which the gate checks.
