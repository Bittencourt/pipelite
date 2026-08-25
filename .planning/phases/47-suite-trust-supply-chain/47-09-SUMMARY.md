---
phase: 47-suite-trust-supply-chain
plan: 09
subsystem: supply-chain
tags: [npm-audit, audit-policy, allowlist, expiry, anti-vacuity, negative-controls, zero-dependencies, SEC-05]

# Dependency graph
requires:
  - phase: 47-suite-trust-supply-chain
    plan: 07
    provides: "the residual crit+high set (next, nodemailer, postcss, sharp), their GHSA id lists, evidenced reach, and the --omit=dev reconciliation proving ZERO dev-only acceptances are available"
  - phase: 47-suite-trust-supply-chain
    plan: 08
    provides: "the measured verdict that next@16.3.2 clears next/postcss/sharp and joins nothing, and the exact in-repo blocker (@img/sharp-win32-ia32's capped engines.node read platform-blind) — the fact every next/postcss/sharp reason cites"
  - phase: 46-migration-chain-toolchain-floor
    plan: 06
    provides: "the in-repo operational-script pattern copied here: a dependency-free .mjs with measured floors, a Fatal class, an import.meta.main guard, an npm script, and a vitest gate importing its pure surface"
provides:
  - "AUDIT-POLICY.md at the repo root — the stated policy in prose, 27.5k chars, including the three-trees limitation verbatim and the honest statement that the gate does NOT evaluate the production image"
  - "audit-policy.json — failOn [critical,high] plus 39 allowlist entries, EXACTLY 1:1 against a fresh npm audit's critical/high advisory set (0 gated-but-unlisted, 0 listed-but-ungated)"
  - "scripts/audit-policy.mjs — a zero-dependency evaluator that never branches on npm audit's exit code, floors the document it parses, reconciles npm's own histogram against its own vulnerabilities map, and detects stale allowlist entries"
  - "npm run security:audit, GREEN on the fixed tree at exit 0 — the precondition that makes 47-12's red control meaningful"
  - "src/lib/__tests__/audit-policy.test.ts — 52 offline tests carrying the three PERMANENT negative controls (dev-only reason, back-dated expiry, emptied failOn), each paired with its complement"
  - "D-47-01-A CLOSED: overrides.vite is now defended by a semver.subset assertion, observed red three ways"
  - "SEC-47-A recorded in BACKLOG.md — src/lib/email/client.ts:20's unconditional tls.rejectUnauthorized:false"
affects: [47-10, 47-11, 47-12, 47-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "an in-repo policy evaluator instead of a supply-chain tool: audit-ci declares event-stream@4.0.1 and was last published 2024-07-03, so installing 30 packages to satisfy a supply-chain requirement is self-defeating"
    - "reconcile npm's own metadata histogram against its own vulnerabilities map — two independently-derived views of one fact, which catches the doctored/truncated document that neither floor can"
    - "floor the thing that does NOT shrink on success: advisory counts are supposed to fall to nearly zero, so MIN_PACKAGES_AUDITED (deps total) is the load-bearing empty-document detector and MIN_ADVISORIES_PARSED must sit below the fully-remediated residual"
    - "apply the policy at PACKAGE severity, not per-advisory severity: nodemailer is `high` with 1 of 6 advisories individually high, next `high` with 12 of 28 — the per-advisory reading would leave 21 advisories with no disposition while the gate stayed green"
    - "an injectable clock as the third parameter of the pure evaluator, so expiry semantics are asserted deterministically without faking timers and without writing a back-dated entry into the shipped file"
    - "two expiry horizons with the rule written down: 30 days when a non-breaking fix is measured-available and blocked only in-repo (a scheduling decision), 90 days when the only fix is a breaking major and the acceptance rests on surface evidence (a risk judgement)"

key-files:
  created:
    - scripts/audit-policy.mjs
    - audit-policy.json
    - AUDIT-POLICY.md
    - src/lib/__tests__/audit-policy.test.ts
  modified:
    - package.json
    - CONTRIBUTING.md
    - .planning/BACKLOG.md

key-decisions:
  - "Applied the policy at PACKAGE severity rather than per-advisory severity, which is what makes the allowlist 39 entries instead of 16. npm's own --audit-level gates on the package aggregate, and 47-CONTEXT requires a disposition for every critical/high advisory rather than only the one that set the aggregate. The per-advisory reading would have left 5 of nodemailer's 6 and 16 of next's 28 undisposed behind a green gate"
  - "Set MIN_ADVISORIES_PARSED to 3 against a measurement of 47, deliberately low, because full remediation of every failOn advisory would leave 8 — any floor above 8 would fatal on SUCCESS and be 'fixed' by lowering it, which is the floor mechanism's own failure mode arriving through the floor mechanism. The empty-document detection is carried by MIN_PACKAGES_AUDITED and the histogram reconciliation instead, and the doc-comment says so"
  - "Made evaluatePolicy report a WIDENED failOn as a problem too, not only a narrowed one, because the claim about what the gate catches lives in AUDIT-POLICY.md and REQUIRED_FAIL_ON in the script is the single line that must move with it"
  - "Created src/lib/__tests__/audit-policy.test.ts, which is OUTSIDE this plan's files_modified, because the phase hard rules require three PERMANENT in-file negative controls and D-47-01-A's closure needs an offline assertion. Recorded as a deviation; 47-10 extends this file rather than creating it"
  - "Wrote GHSA-r7g4-qg5f-qqm2's reason so that it argues AGAINST its own comfort: the OAuth2 TLS path is unreachable, but src/lib/email/client.ts:20 disables SMTP certificate verification unconditionally on the transport that IS used, which is a larger exposure. Stating that inside the acceptance is the only version of that entry a reviewer can trust"
  - "Did NOT attempt the next@16.3.2 bump again. 47-08 measured it, reverted it, and specified the follow-up; re-attempting it would have meant editing node-engines-floor.test.ts, and the overrides{sharp:0.34.5} workaround re-opens a fixed advisory"

patterns-established:
  - "Every negative control is paired with its complement, so neither an always-report nor a never-report implementation passes the pair — a control that only proves a function CAN return something is not a control"
  - "A document-shape check that reconciles two halves of the same document, rather than only flooring each half, catches the case where one half was emptied and the other left intact"

requirements-completed: []
requirements-advanced: [SEC-05]
requirements-note: "SEC-05 is deliberately NOT marked complete, for the same reason 47-07 reverted it. Its FIRST half is now fully discharged: all 39 remaining critical/high advisories carry exactly one evidenced disposition with a reach and an expiry, AUDIT-POLICY.md states the policy in prose at the repo root, and `npm run security:audit` enforces it at exit 0 with zero new dependencies. Its SECOND half is not: `.github/workflows/ci.yml` still contains no audit step, so nothing on the required `ci` check fails on an advisory and the required check has never been observed going red for one — which 47-CONTEXT § 'CI audit policy (SC-4)' names explicitly as the difference between a policy and a stated intention. `requirements mark-complete SEC-05` set the checkbox to `[x]` and left the traceability row at `In Progress`; the checkbox was reverted to `[ ]` and the reason written inline in REQUIREMENTS.md. Owners of the remaining half: 47-11 (the ci.yml step) and 47-12 (the observed red on the real GitHub check)."

# Metrics
duration: 26min
completed: 2026-08-25
---

# Phase 47 Plan 09: The Stated, Enforceable Audit Policy — Summary

**This repository now owns a written advisory position and a gate that enforces it: 39 critical/high advisories — every single one npm reports — carry exactly one evidenced disposition with a reach and an expiry, `npm run security:audit` is GREEN at exit 0 with zero new dependencies, and eleven separate falsifications were observed red, including the three that stay in the repository forever.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-08-25T14:31:23Z
- **Completed:** 2026-08-25T14:57:20Z
- **Tasks:** 3
- **Files created:** 4 · **modified:** 3

## Task Commits

| # | Task | Commit | Artefact |
|---|---|---|---|
| 1 | The dependency-free evaluator + the `security:audit` script | `461069c` | `scripts/audit-policy.mjs` (812 lines), `package.json` |
| 2 | The allowlist, the prose policy, the backlog record | `c578a70` | `audit-policy.json` (39 entries), `AUDIT-POLICY.md` (27,542 chars), `CONTRIBUTING.md`, `.planning/BACKLOG.md` |
| 3 | The gate observed green, and every control observed red | `e10ee2a` | `src/lib/__tests__/audit-policy.test.ts` (52 tests) |

---

## Re-measurement first: today's real advisory set

The plan's `<interfaces>` carried `4 critical / 22 high / 38 total / 26 crit+high` and `1289`
dependencies. That is the **pre-47-01** figure. Measured fresh against the committed lockfile at
`9683b84`, with `node -e` over `npm audit --json` (npm 11.10.0):

```
metadata.vulnerabilities: {"info":0,"low":3,"moderate":7,"high":4,"critical":0,"total":14}
metadata.dependencies   : {"prod":528,"dev":580,"optional":214,"peer":36,"peerOptional":0,"total":1285}
crit+high packages: 4   next nodemailer postcss sharp
distinct GHSA ids across ALL severities: 47
distinct GHSA ids at critical/high package severity: 39   (next 28, nodemailer 6, postcss 4, sharp 1)
```

Identical package set to 47-07's closing figures and to 47-08's post-revert figures. `total` moved
`1286 → 1285` and `dev` `581 → 580` between 47-07 and now, which is the `npm ci` 47-08 ran; no
advisory moved.

**The set did not move, so the four owners 47-07 assigned all land here.** 47-08's `next` bump was
reverted, so `next`, `postcss` and `sharp` were still open, and `nodemailer` was already mine.

### The granularity decision, because it changes the deliverable's size

`npm audit` reports a **package-level** severity and a **per-advisory** severity, and they differ:

| Package | package severity | per-advisory breakdown |
|---|---|---|
| `next` | high | 12 high, 13 moderate, 3 low |
| `nodemailer` | high | **1 high**, 4 moderate, 1 low |
| `postcss` | high | 2 high, 2 moderate |
| `sharp` | high | 1 high |

Filtering on the **per-advisory** severity would mean 16 dispositions. The policy uses the
**package** severity — which is also what `npm audit --audit-level=high` gates on — so it needs
**39**. The plan itself decided this by naming all six `nodemailer` advisories, and 47-07's residual
table listed all 28 `next` ids. The alternative would have left 5 of nodemailer's 6 and 16 of next's
28 with **no recorded disposition at all** while the gate stayed green, which is the exact failure
this phase exists to delete. The reasoning is in `collectAdvisories`' doc-comment and has its own
test.

---

## SEC-05's deliverable: the disposition table

### Upgraded (47-01, 47-07) — 22 packages, all confirmed absent from today's audit

`vitest` 4.1.11 (cleared `GHSA-5xrq-8626-4rwp`, **critical CVSS 9.8**) · `vite` 7.3.6 via
`overrides` (five advisories) · `drizzle-orm` 0.45.2 · `@auth/core` 0.41.3 (**all three
criticals**) · `@auth/drizzle-adapter` 1.11.3 · `next-auth` 5.0.0-beta.32 · `axios` 1.19.0 ·
`form-data` 4.0.6 · `lodash` + `lodash-es` 4.18.1 · `nanoid` 3.3.18 · `fast-uri` 3.1.6 ·
`follow-redirects` 1.16.0 · `@aws-sdk/xml-builder` 3.972.40 · `postcss` (top level) 8.5.26 ·
`brace-expansion` 1.1.18 · `@hono/node-server` · `express-rate-limit` · `flatted` · `hono` ·
`ip-address` · `js-yaml` · `minimatch` · `path-to-regexp`

### Replaced — 1

`fast-xml-parser` (with `strnum`) removed from the lockfile entirely, and confirmed absent from the
running container in 47-08.

### Accepted with a reason and an expiry — 39 advisories across 4 packages

Every row below has an entry in `audit-policy.json` and appears in `AUDIT-POLICY.md`; the
cross-reference is asserted in both directions.

| GHSA | Package | Advisory severity | Disposition | Reach |
|---|---|---|---|---|
| `GHSA-ggv3-7p47-pfv8` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-3x4c-7xq6-9pq8` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-h27x-g6w4-24gq` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-mq59-m269-xvcx` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-jcc7-9wpm-mj36` | `next` | low | accepted until 2026-09-24 | runtime |
| `GHSA-q4gf-8mx6-v5v3` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-8h8q-6873-q5fj` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-26hh-7cqf-hhc6` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-3g8h-86w9-wvmq` | `next` | low | accepted until 2026-09-24 | runtime |
| `GHSA-ffhc-5mcf-pf4q` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-vfv6-92ff-j949` | `next` | low | accepted until 2026-09-24 | runtime |
| `GHSA-gx5p-jg67-6x7h` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-mg66-mrh9-m8jx` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-h64f-5h5j-jqjh` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-c4j6-fc7j-m34r` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-492v-c6pp-mqqv` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-wfc6-r584-vfw7` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-267c-6grr-h53f` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-36qx-fr4f-26g5` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-6gpp-xcg3-4w24` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-m99w-x7hq-7vfj` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-89xv-2m56-2m9x` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-68g3-v927-f742` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-4633-3j49-mh5q` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-4c39-4ccg-62r3` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-p9j2-gv94-2wf4` | `next` | high | accepted until 2026-09-24 | runtime |
| `GHSA-q8wf-6r8g-63ch` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-955p-x3mx-jcvp` | `next` | moderate | accepted until 2026-09-24 | runtime |
| `GHSA-qx2v-qp2m-jg93` | `postcss` | moderate | accepted until 2026-09-24 | **build** |
| `GHSA-6g55-p6wh-862q` | `postcss` | high | accepted until 2026-09-24 | **build** |
| `GHSA-fxqj-rqcc-2cmp` | `postcss` | moderate | accepted until 2026-09-24 | **build** |
| `GHSA-r28c-9q8g-f849` | `postcss` | high | accepted until 2026-09-24 | **build** |
| `GHSA-f88m-g3jw-g9cj` | `sharp` | high | accepted until 2026-09-24 | runtime |
| `GHSA-c7w3-x93f-qmm8` | `nodemailer` | low | accepted until 2026-11-23 | runtime |
| `GHSA-vvjj-xcjg-gr5g` | `nodemailer` | moderate | accepted until 2026-11-23 | runtime |
| `GHSA-268h-hp4c-crq3` | `nodemailer` | moderate | accepted until 2026-11-23 | runtime |
| `GHSA-wqvq-jvpq-h66f` | `nodemailer` | moderate | accepted until 2026-11-23 | runtime |
| `GHSA-r7g4-qg5f-qqm2` | `nodemailer` | moderate | accepted until 2026-11-23 | runtime |
| `GHSA-p6gq-j5cr-w38f` | `nodemailer` | high | accepted until 2026-11-23 | runtime |

**Coverage is exactly 1:1**, computed as a two-way set difference rather than by counting:

```
gated advisories: 39   listed: 39
gated but NOT listed: []
listed but NOT gated: []
reason length min/max: 654 / 1377 characters
by reach:    {"runtime":35,"build":4}
by expires:  {"2026-09-24":33,"2026-11-23":6}
```

**Zero `dev`-reach acceptances, and none was available.** 47-07's `--omit=dev` reconciliation puts
all four residual packages in the production install tree, so the "dev-only" escape hatch this gate
rejects by name was also not on offer. `dev` remains a legal `reach` value with no instances.

### The two expiry horizons, and the rule

Written down in `AUDIT-POLICY.md` § "The expiry rule", both measured from the decision date
2026-08-25:

- **30 days → 2026-09-24** where a non-breaking fix is *measured available* and blocked only by
  something inside this repository. All 33 `next` / `postcss` / `sharp` advisories: 47-08 measured
  `next@16.3.2` clearing all three packages and joining nothing at any severity, blocked by
  `nodeFloorViolations` in `src/lib/__tests__/node-engines-floor.test.ts:335`/`:379` reading
  `@img/sharp-win32-ia32`'s `engines.node ^20.9.0` platform-blind against `package.json:6`. That
  acceptance is a *scheduling* decision, so it comes back on the follow-up's timescale.
- **90 days → 2026-11-23** where the only fix is a breaking major and the acceptance rests on
  evidence that the advisory's input surface is never supplied. The six `nodemailer` advisories.
  That evidence can go stale — a new call site is one commit away — so it is re-read quarterly.

---

## The `nodemailer` reasons, verbatim as written

These are the entries the plan singled out. The measurement behind all six, re-taken today rather
than cited from 47-07: exactly **three** files under `src/` reference
`nodemailer` / `sendMail` / `Transporter` / `createTransport` (`src/lib/email/client.ts`,
`src/lib/email/send.ts`, `src/lib/email/send.test.ts`), and **zero** of them supply `raw`,
`envelope`, `list`, `jsonTransport`, `disableFileAccess` or `disableUrlAccess`. The first
(unscoped) sweep matched 41 files and was **discarded as over-broad** — `\braw\s*:` and
`\blist\s*:` match unrelated object literals all over the codebase — and re-run scoped to files
that reference nodemailer at all. A count from the unscoped regex would have been a number that
proved nothing.

#### `GHSA-c7w3-x93f-qmm8` (reach runtime, expires 2026-11-23, 1083 chars)

> SMTP command injection via an unsanitized `envelope.size` parameter. The `envelope` option is never supplied. There is exactly ONE sendMail call site in the repository, src/lib/email/send.ts:29-35, and it passes exactly { from, to, subject, html, text }; the transport is built once at src/lib/email/client.ts:36 from the config literal at src/lib/email/client.ts:9-21, which supplies only host, port, secure, auth and tls, all from environment variables. Measured 2026-08-25: exactly three files in src/ reference nodemailer/sendMail/Transporter/createTransport (client.ts, send.ts, send.test.ts) and ZERO of them supply raw, envelope, list, jsonTransport, disableFileAccess or disableUrlAccess. The only fix is nodemailer 7 -> 9 (npm: fixAvailable {"name":"nodemailer","version":"9.0.5","isSemVerMajor":true}), a two-major breaking bump that 47-CONTEXT excludes in a debt-paydown milestone; @auth/core@0.41.3 and next-auth@5.0.0-beta.32 both declare peerOptional nodemailer "^7.0.7 || ^8.0.5", which 9.x does not satisfy, so it would re-open the ERESOLVE conflict 47-07 eliminated.

#### `GHSA-vvjj-xcjg-gr5g` (reach runtime, expires 2026-11-23, 1040 chars)

> SMTP command injection via CRLF in the transport `name` option (EHLO/HELO), CVSS 4.9. No transport `name` is supplied: the transport config literal at src/lib/email/client.ts:9-21 contains exactly host, port, secure, auth and tls, and it is passed to createTransport at src/lib/email/client.ts:36 — the only createTransport call in the repository. The single message-sending call site, src/lib/email/send.ts:29-35, passes only { from, to, subject, html, text } and no transport options at all. Measured 2026-08-25: three files in src/ reference nodemailer at all (client.ts, send.ts, send.test.ts) and ZERO supply raw, envelope, list, jsonTransport, disableFileAccess or disableUrlAccess. The only fix is nodemailer 7 -> 9 (fixAvailable {"name":"nodemailer","version":"9.0.5","isSemVerMajor":true}), a two-major breaking bump excluded by 47-CONTEXT's rule against trading a documented risk for an undocumented one; @auth/core@0.41.3 and next-auth@5.0.0-beta.32 declare peerOptional nodemailer "^7.0.7 || ^8.0.5", which 9.x does not satisfy.

#### `GHSA-268h-hp4c-crq3` (reach runtime, expires 2026-11-23, 1054 chars)

> CRLF injection in List-* header comments allowing arbitrary message header injection, CVSS 5.4. The `list` option is never supplied: the single sendMail call site, src/lib/email/send.ts:29-35, passes exactly { from, to, subject, html, text }, and every caller reaches it through the seven typed helpers in the same file (sendVerificationEmail, sendApprovalEmail, sendPasswordResetEmail, sendInviteEmail, sendDealAssignedEmail, sendActivityReminderEmail, sendWeeklyDigestEmail), none of which accepts a header argument. The transport itself is built once from the literal at src/lib/email/client.ts:9-21, which carries no message defaults that could inject a List-* header either. Measured 2026-08-25: three files in src/ reference nodemailer and ZERO supply raw, envelope, list, jsonTransport, disableFileAccess or disableUrlAccess. The only fix is nodemailer 7 -> 9 (fixAvailable, isSemVerMajor true), excluded by 47-CONTEXT; and @auth/core@0.41.3 / next-auth@5.0.0-beta.32 declare peerOptional nodemailer "^7.0.7 || ^8.0.5", which 9.x does not satisfy.

#### `GHSA-wqvq-jvpq-h66f` (reach runtime, expires 2026-11-23, 1031 chars)

> jsonTransport bypasses disableFileAccess and disableUrlAccess during message normalization, CVSS 5.4. jsonTransport is never selected: the transport config literal at src/lib/email/client.ts:9-21 supplies host, port, secure, auth and tls only, which makes it an SMTP transport, and it is the single createTransport call in the repository (src/lib/email/client.ts:36). The one message-sending call site, src/lib/email/send.ts:29-35, passes only { from, to, subject, html, text }, so no per-message normalization option is supplied either. Measured 2026-08-25: three files in src/ reference nodemailer (client.ts, send.ts, send.test.ts) and ZERO contain the string jsonTransport, disableFileAccess or disableUrlAccess. The only fix is nodemailer 7 -> 9 (fixAvailable {"name":"nodemailer","version":"9.0.5","isSemVerMajor":true}), a two-major breaking bump excluded by 47-CONTEXT in a debt-paydown milestone; @auth/core@0.41.3 and next-auth@5.0.0-beta.32 declare peerOptional nodemailer "^7.0.7 || ^8.0.5", which 9.x does not satisfy.

#### `GHSA-r7g4-qg5f-qqm2` (reach runtime, expires 2026-11-23, 1175 chars) — the one that argues against itself

> Improper TLS certificate validation in the OAuth2 token fetch, enabling credential interception, CVSS 6.5. The OAuth2 token fetch is never reached: src/lib/email/client.ts:13-19 sets `auth` to { user, pass } from SMTP_USER/SMTP_PASSWORD or to undefined, never to an OAuth2 object, and there are ZERO occurrences of OAuth2/oauth2 anywhere in src/ (measured 2026-08-25); Auth.js is configured with the Credentials provider ONLY at src/auth.ts:38-39, so no Nodemailer email provider exists to trigger it either; the only send path is src/lib/email/send.ts:29-35, which is plain SMTP delivery. STATED HONESTLY, because it cuts the other way: src/lib/email/client.ts:20 sets tls: { rejectUnauthorized: false }, disabling SMTP certificate verification unconditionally for the transport that IS used. That is a LARGER exposure than this advisory and it is recorded in .planning/BACKLOG.md with its file:line; it is not fixed here because this phase's scope is the advisory position, not the SMTP client. The only fix for this advisory is nodemailer 7 -> 9 (fixAvailable, isSemVerMajor true), excluded by 47-CONTEXT and blocked by @auth/core@0.41.3's peerOptional "^7.0.7 || ^8.0.5".

#### `GHSA-p6gq-j5cr-w38f` (reach runtime, expires 2026-11-23, 1377 chars) — CVSS 7.1, the worst

> The message-level `raw` option bypasses disableFileAccess/disableUrlAccess, enabling arbitrary file read and full-response SSRF in the delivered message — CVSS 7.1, the worst of nodemailer's six and the one that sets the package's `high` aggregate. It requires the caller to pass `raw`. There is exactly ONE sendMail call site in the repository, src/lib/email/send.ts:29-35, and it passes exactly { from, to, subject, html, text }; the seven exported helpers around it build subject/html/text from src/lib/email/templates and accept no message-option argument, so no caller can reach `raw` even indirectly. The transport it sends through is built once at src/lib/email/client.ts:36 from the literal at src/lib/email/client.ts:9-21, which sets neither disableFileAccess nor disableUrlAccess and therefore has no such protection for `raw` to bypass in the first place. Measured 2026-08-25: three files in src/ reference nodemailer at all and ZERO contain a `raw:` option in a nodemailer context. The only fix is nodemailer 7 -> 9 (npm: fixAvailable {"name":"nodemailer","version":"9.0.5","isSemVerMajor":true}) — a two-major breaking bump that 47-CONTEXT excludes in a debt-paydown milestone, and one that would re-open the ERESOLVE conflict 47-07 cluster 1b eliminated, since @auth/core@0.41.3 and next-auth@5.0.0-beta.32 both declare peerOptional nodemailer "^7.0.7 || ^8.0.5".

### The measurements the `next` reasons rest on, taken here rather than cited

Over **702** `.ts`/`.tsx`/`.mjs`/`.js`/`.jsx` files under `src/`:

```
next/image import        0            <Image                   0
next/script              0            beforeInteractive        0
runtime = "edge"         0            cacheComponents          0
"use cache"/unstable_cache 0          experimental_ppr         0
WebSocket / Sec-WebSocket  0
"use server" (top-level) 23           sendMail call sites      1  (src/lib/email/send.ts)
CSP nonce in a header path 0          (2 /nonce/i matches, both QuickJS sandbox tests)
OAuth2 anywhere          0

next.config.ts keys: rewrites=NO  redirects=NO  images=NO  headers=NO  i18n=NO  experimental=NO
                     output="standalone"  serverExternalPackages=[argon2, pipedrive, quickjs-emscripten]
pages/ directory: ABSENT (neither ./pages nor ./src/pages)
root custom server (server.ts|js|mjs): ABSENT — docker-entrypoint.sh:8 is `exec node server.js`
locales: 3 — src/i18n/config.ts:1 ['en-US','pt-BR','es-ES'], cookie-driven at src/i18n/request.ts:9-17
```

**Ten of the 28 `next` advisories are REACHABLE and are not argued away.** Four of them are
middleware/proxy bypasses in an application whose only page-level authentication gate *is*
middleware (`src/middleware.ts:3-5`, matcher at `:8`). Their reasons say so in those words, and the
30-day horizon exists because of them. An acceptance that pretended they were unreachable would
have been the seventh vacuous gate.

---

## `npm run security:audit` — GREEN, verbatim

The plan's `<verify><automated>`, run verbatim. **Exit 0.**

```
$ npm run security:audit

> node scripts/audit-policy.mjs
-> npm audit --json (tree from package-lock.json; advisory data from the npm registry — this step needs network)
-> npm audit exited 1 — RECORDED, and deliberately NOT the verdict: npm audit exits 1 whenever any advisory exists at any severity
-> parsed 47 distinct advisories across 14 vulnerable package(s); npm audited 1285 dependencies
-> applying audit-policy.json: failOn ["critical","high"], 39 allowlist entries
OK: 47 advisories evaluated across 14 vulnerable packages (39 at critical/high), 39 of 39 allowlist entries applied, 1285 dependencies audited. Every critical/high advisory is either fixed or carries an unexpired, reasoned disposition in audit-policy.json.
NPM_RUN_EXIT=0
```

Run directly as well (`npm run` reorders a child's streams, so the binary was invoked directly too —
identical output, `DIRECT_EXIT=0`), and in the lockfile-only mode 47-12 will build its control with:

```
$ node scripts/audit-policy.mjs --package-lock-only
-> npm audit --json --package-lock-only (tree from package-lock.json, node_modules not consulted; advisory data from the npm registry — this step needs network)
-> npm audit exited 1 — RECORDED, and deliberately NOT the verdict: npm audit exits 1 whenever any advisory exists at any severity
-> parsed 47 distinct advisories across 14 vulnerable package(s); npm audited 1285 dependencies
-> applying audit-policy.json: failOn ["critical","high"], 39 allowlist entries
OK: 47 advisories evaluated across 14 vulnerable packages (39 at critical/high), 39 of 39 allowlist entries applied, 1285 dependencies audited. Every critical/high advisory is either fixed or carries an unexpired, reasoned disposition in audit-policy.json.
LOCKONLY_EXIT=0
```

**`npm audit`'s own exit code was 1 in every one of those runs, and it is printed on line 2 of each.**
That is the whole point: the child exits 1 because three `low` advisories exist with no fix in range,
which is a permanent state of this tree, so the exit code cannot distinguish a fully-disposed tree
from an unallowlisted critical.

**This green is step (3) of the sequence 47-RESEARCH prescribes** — apply the dispositions, write the
allowlist, **observe green**, then add `minimist@1.2.5` and observe red, then revert. 47-12's red is
now meaningful; without this line it would only prove the gate was already red.

**No `failOn` entry was removed, no expiry was extended, and no thin reason was added to reach
green.** The first full run was green; there was no red to negotiate away from.

---

## The floor controls: the evaluator refuses an empty or wrong-shaped document

`assertAuditDocument` fed seven doctored documents. **Every one fatals; the real one passes.**
Verbatim, `FLOOR_ADVICE` included because it is part of the message an operator sees:

```
### NC-DOC-1  the wholly empty document {}
    FATAL: the audit document has no `vulnerabilities` object. `npm audit --json` always emits one, even on a clean tree, so its absence means the output is an error document or a different schema — not a clean tree. This is a tripwire for an audit document that yielded nothing — a network failure, a proxy interception or an `npm audit --json` schema change all produce zero offenders and exit 0. It is NOT an assertion about how many advisories this tree should have. If the number legitimately moved, change the floor AND record the new measurement in the comment beside it.

### NC-DOC-2  vulnerabilities EMPTIED, metadata left intact (the 47-01 shape)
    FATAL: the audit document does not reconcile: `vulnerabilities` contains 0 package(s) at low while `metadata.vulnerabilities.low` says 3. One of the two halves is empty, truncated or edited, so this run proves nothing. [+ FLOOR_ADVICE]

### NC-DOC-3  metadata.vulnerabilities.total DELETED (the other 47-01 shape)
    FATAL: `metadata.vulnerabilities.total` is undefined, not a number. A missing histogram key reads as zero in JavaScript, which is indistinguishable from a clean tree. [+ FLOOR_ADVICE]

### NC-DOC-4  self-consistent but tiny: 0 advisories, 3 dependencies
    FATAL: only 0 distinct advisory id(s) were parsed out of the audit document; the floor is 3 (measured 47 on 2026-08-25). [+ FLOOR_ADVICE]

### NC-DOC-5  self-consistent, 1285 deps, but only ONE advisory
    FATAL: only 1 distinct advisory id(s) were parsed out of the audit document; the floor is 3 (measured 47 on 2026-08-25). [+ FLOOR_ADVICE]

### NC-DOC-6  histogram claims 4 high while vulnerabilities has 0 (a doctored half)
    FATAL: the audit document does not reconcile: `vulnerabilities` contains 0 package(s) at high while `metadata.vulnerabilities.high` says 4. One of the two halves is empty, truncated or edited, so this run proves nothing. [+ FLOOR_ADVICE]

### NC-DOC-7  the REAL 47 advisories, but metadata.dependencies.total = 3
    (isolates MIN_PACKAGES_AUDITED: NC-DOC-4 short-circuited on the advisories floor
     and therefore never reached this branch)
    FATAL: npm reports auditing only 3 package(s); the floor is 500 (measured 1285 on 2026-08-25). Either the tree did not resolve or the document is not this project's. [+ FLOOR_ADVICE]

### POSITIVE  the real document, unmodified
    PASSED (advisories=47, packages=14, deps=1285)
```

**NC-DOC-7 exists because NC-DOC-4 short-circuits.** A negative control that only proves the *first*
floor can fire is not a control for the second — the same reasoning 47-07's NC-4 recorded.

**Why `MIN_ADVISORIES_PARSED` is only 3 against a measurement of 47**, stated because it looks wrong
at first glance: unlike a schema's table count, the advisory count is *supposed* to fall to nearly
nothing. Full remediation of every `failOn` advisory would leave **8** (the moderate and low
packages with no fix in range), so any floor above 8 would fatal on **success** and be "fixed" by
the next person lowering it — the floor mechanism's own failure mode arriving through the floor
mechanism. The load-bearing empty-document detectors here are `MIN_PACKAGES_AUDITED` (which does not
shrink on success) and the histogram reconciliation (NC-DOC-2 and NC-DOC-6, which no floor could
catch). The doc-comment on the constant says exactly this.

---

## The seven `evaluatePolicy` cases, verbatim (task 1)

Run with `node --input-type=module -e`, against a synthetic audit/policy pair with an injected clock
of `2026-08-25T12:00:00Z`. Problem text truncated to 200 chars for width; nothing else altered.

```
### CASE 1  well-formed pair (expect 0) -> 0 problem(s)

### CASE 2  unallowlisted critical -> 1 problem(s)
    widget critical GHSA-zzzz-yyyy-xxxx has NO recorded disposition — "Widget does a bad thing" (advisory severity critical). Either take the fix, or add an entry to audit-policy.json with a reason, a rea

### CASE 3  expired entry, via the injected clock -> 1 problem(s)
    audit-policy.json allowlist[0] (GHSA-aaaa-bbbb-cccc) EXPIRED on 2026-08-01. Acceptance is a decision that gets revisited, not a permanent silence: either take the fix now, or re-state the reason again

### CASE 4  reason is dev-only -> 1 problem(s)
    audit-policy.json allowlist[0] (GHSA-aaaa-bbbb-cccc) gives "dev-only" as its reason, which is on FORBIDDEN_REASONS. A reason must say why the advisory does not apply to THIS project's usage — name the

### CASE 5  a CVE id where a GHSA id belongs -> 2 problem(s)
    audit-policy.json allowlist[0] has `ghsa` "CVE-2026-1234", which is not a GHSA id matching /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/. The allowlist is keyed on the id `npm audit` reports; an entry
    widget critical GHSA-aaaa-bbbb-cccc has NO recorded disposition — "Widget does a bad thing" (advisory severity critical). Either take the fix, or add an entry to audit-policy.json with a reason, a rea

### CASE 6  reach outside {runtime,build,dev} -> 1 problem(s)
    audit-policy.json allowlist[0] (GHSA-aaaa-bbbb-cccc) has `reach` "probably-fine"; it must be one of runtime, build, dev. An advisory reachable only from a build tool is a genuinely different risk from

### CASE 7  failOn emptied -> 1 problem(s)
    audit-policy.json `failOn` is [] but this repository's policy requires exactly ["critical","high"]; missing critical, high. An emptied or narrowed `failOn` satisfies every other assertion in this file

### bonus: duplicate ghsa, malformed expires, advisory with no url

### CASE 8  duplicate entry for one advisory -> 1 problem(s)
    audit-policy.json allowlist[1] (GHSA-aaaa-bbbb-cccc) is a DUPLICATE — GHSA-aaaa-bbbb-cccc already has an entry. Exactly one recorded disposition per advisory; two is ambiguous, and the later one can q

### CASE 9  expires is not YYYY-MM-DD -> 1 problem(s)
    audit-policy.json allowlist[0] (GHSA-aaaa-bbbb-cccc) has `expires` "never"; it must be a bare YYYY-MM-DD date. An expiry the reader cannot compare at a glance is an expiry nobody revisits.

### CASE 10 a failOn advisory whose via[].url is gone -> 1 problem(s)
    widget (critical) reports an advisory with no resolvable GHSA id (title "no url here", url ""). It cannot be allowlisted and it is not being ignored: `npm audit --json`'s shape changed, and this gate'

constants: MIN_REASON_LENGTH=80 FORBIDDEN_REASONS=["dev-only","n/a","wontfix","see above"] GHSA_PATTERN=/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/
ghsaFromViaUrl(trailing slash) = GHSA-aaaa-bbbb-cccc
```

**CASE 1 is the load-bearing one.** Cases 2-10 all show the evaluator returning a problem; without a
case where it returns `[]`, an implementation that always reported something would satisfy every one
of them. CASE 5 returns **two** problems because a malformed id is not registered in the allowlist
map, so the advisory it was meant to cover becomes undisposed as well — the desired behaviour, since
a typo'd id must not silently cover anything.

---

## Every gate, broken on purpose against the SHIPPED files

Seven falsifications against the real `audit-policy.json` / `AUDIT-POLICY.md` / `package.json`,
each restored from a byte-for-byte backup immediately afterwards. `git status --porcelain` was empty
apart from the new test file at the end, and the gate green again.

### RED-1 — the shipped `failOn` emptied

```
 FAIL  src/lib/__tests__/audit-policy.test.ts > the policy files exist and have contents (anti-vacuity) > the shipped policy satisfies its own evaluator against an empty advisory set
AssertionError: expected [ Array(1) ] to deeply equal []
+   "audit-policy.json `failOn` is [] but this repository's policy requires exactly [\"critical\",\"high\"]; missing critical, high. An emptied or narrowed `failOn` satisfies every other assertion in this file, which is why it is compared for equality and not for containment. To change the policy, edit REQUIRED_FAIL_ON in scripts/audit-policy.mjs in the same commit.",
 FAIL  src/lib/__tests__/audit-policy.test.ts > the shipped audit-policy.json > declares failOn exactly ["critical","high"], in that order
AssertionError: expected [] to deeply equal [ 'critical', 'high' ]
 Test Files  1 failed (1)
      Tests  2 failed | 50 passed (52)
```

### RED-2 — a shipped reason replaced by `dev-only` (`GHSA-p6gq-j5cr-w38f`)

```
 FAIL  ... > the shipped policy satisfies its own evaluator against an empty advisory set
AssertionError: expected [ Array(1) ] to deeply equal []
+   "audit-policy.json allowlist[38] (GHSA-p6gq-j5cr-w38f) gives \"dev-only\" as its reason, which is on FORBIDDEN_REASONS. A reason must say why the advisory does not apply to THIS project's usage — name the call site, the measurement, and the alternative that was rejected.",
 FAIL  ... > the shipped audit-policy.json > gives every entry a substantive, non-forbidden reason
AssertionError: GHSA-p6gq-j5cr-w38f reason too short: expected 8 to be greater than or equal to 80
 Test Files  1 failed (1)
      Tests  2 failed | 50 passed (52)
```

and the same mutation through the real gate:

```
-> applying audit-policy.json: failOn ["critical","high"], 39 allowlist entries

FATAL: audit-policy.json allowlist[38] (GHSA-p6gq-j5cr-w38f) gives "dev-only" as its reason, which is on FORBIDDEN_REASONS. A reason must say why the advisory does not apply to THIS project's usage — name the call site, the measurement, and the alternative that was rejected.

FATAL: the advisories in package-lock.json do not satisfy audit-policy.json (1 problem(s) above). Note that npm audit's own exit code was 1, which is reported above and is deliberately NOT what this verdict is based on — it is 1 whenever any advisory exists at any severity, so it cannot distinguish a fully-disposed tree from an unallowlisted critical. Do NOT reach green by narrowing failOn, extending an expiry, or adding an entry whose reason would be true of any project; see AUDIT-POLICY.md.
GATE_EXIT=1
```

### RED-3 — a shipped `expires` back-dated (`GHSA-26hh-7cqf-hhc6`, the middleware bypass)

```
 FAIL  ... > the shipped policy satisfies its own evaluator against an empty advisory set
+   "audit-policy.json allowlist[7] (GHSA-26hh-7cqf-hhc6) EXPIRED on 2026-08-01. Acceptance is a decision that gets revisited, not a permanent silence: either take the fix now, or re-state the reason against today's evidence and set a new date. Extending the date without re-reading the evidence is the failure this field exists to prevent.",
 FAIL  ... > the shipped audit-policy.json > gives every entry an expiry that is a bare date and has not passed
AssertionError: GHSA-26hh-7cqf-hhc6 (next) expired on 2026-08-01. Take the fix, or re-state the reason against today's code and set a new date — see AUDIT-POLICY.md.: expected 1785542400000 to be greater than 1787669641257
 Test Files  1 failed (1)
      Tests  2 failed | 50 passed (52)

# and through the real gate:
FATAL: audit-policy.json allowlist[7] (GHSA-26hh-7cqf-hhc6) EXPIRED on 2026-08-01. ...
GATE_EXIT=1
```

### RED-4 — `overrides.vite` deleted from `package.json` (D-47-01-A)

```
     × package.json still declares an overrides.vite range at all 7ms
 FAIL  ... > the overrides.vite constraint is defended (D-47-01-A) > package.json still declares an overrides.vite range at all
AssertionError: package.json must keep `overrides.vite`; it is the only thing holding vite below 8, and npm does not persist overrides into package-lock.json, so nothing else records it.: expected undefined to be defined
 FAIL  ... > that range admits no vite 8.x or later
AssertionError: overrides.vite is "", which admits vite >= 8. vite 8 brings rolldown and ~32 lockfile keys — the transitive major refresh v1.4 excludes. Widen this deliberately or not at all.: expected false to be true
 Test Files  1 failed (1)
      Tests  2 failed | 50 passed (52)
```

### RED-4b — `overrides.vite` **widened** to `^8.0.0` (the likelier real-world drift)

```
 FAIL  ... > the overrides.vite constraint is defended (D-47-01-A) > that range admits no vite 8.x or later
AssertionError: overrides.vite is "^8.0.0", which admits vite >= 8. vite 8 brings rolldown and ~32 lockfile keys — the transitive major refresh v1.4 excludes. Widen this deliberately or not at all.: expected false to be true
 Test Files  1 failed (1)
      Tests  1 failed | 51 passed (52)
```

### RED-5 — one GHSA id removed from the prose (`GHSA-f88m-g3jw-g9cj`)

```
 FAIL  ... > the prose policy and the machine-readable policy cannot drift apart > every allowlisted GHSA id also appears in AUDIT-POLICY.md
AssertionError: GHSA-f88m-g3jw-g9cj is allowlisted but is not mentioned in AUDIT-POLICY.md. The prose is the half a human reads; an exception that exists only in the JSON is an undocumented one.: expected false to be true
 Test Files  1 failed (1)
      Tests  1 failed | 51 passed (52)
```

### RED-6 — one allowlist entry deleted, through the real gate

```
-> applying audit-policy.json: failOn ["critical","high"], 38 allowlist entries

FATAL: next high GHSA-26hh-7cqf-hhc6 has NO recorded disposition — "Next.js has a Middleware / Proxy bypass in App Router applications via segment-prefetch routes - Incomplete Fix Follow-Up" (advisory severity high). Either take the fix, or add an entry to audit-policy.json with a reason, a reach and an expiry, and record it in AUDIT-POLICY.md.

FATAL: the advisories in package-lock.json do not satisfy audit-policy.json (1 problem(s) above). ...
GATE_EXIT=1
```

### RED-7 — a STALE entry, the check that needs the network

An entry for `GHSA-xvch-5gv4-984h` (`minimist`), a package that is not in this tree at all:

```
-> applying audit-policy.json: failOn ["critical","high"], 40 allowlist entries

FATAL: audit-policy.json allowlists GHSA-xvch-5gv4-984h (minimist) but the live audit no longer reports it. The advisory was fixed, so the exception now covers nothing while still reading as a live acceptance — delete the entry and record the fix in AUDIT-POLICY.md.

FATAL: the advisories in package-lock.json do not satisfy audit-policy.json (1 problem(s) above). ...
GATE_EXIT=1
```

This is also a small bonus finding for 47-12: `GHSA-xvch-5gv4-984h` is exactly the advisory
`minimist@1.2.5` carries, so the stale-entry check has now been exercised on the same id 47-12's
negative control will introduce.

### POSITIVE — everything restored

```
$ git status --porcelain
?? src/lib/__tests__/audit-policy.test.ts     (the new test file, not yet committed at that point)

$ node scripts/audit-policy.mjs
... OK: 47 advisories evaluated ... 39 of 39 allowlist entries applied ...
GATE_EXIT=0
```

---

## The three PERMANENT negative controls

Per the phase hard rules, three controls are kept **in-file forever**, in
`src/lib/__tests__/audit-policy.test.ts`, modelled on `node-engines-floor.test.ts`'s NC-3, which is
kept permanently in-file for the same reason: **a control that lives only in a plan's SUMMARY stops
running the moment the plan is finished.** They become 47-10's control D.

| Control | Broken input | Paired complement (the part that stops it being vacuous) |
|---|---|---|
| **NC-1** | a reason on `FORBIDDEN_REASONS` (all four, via `it.each`), a merely-short reason, a whitespace-only reason | the same fixture with a substantive reason returns `[]` |
| **NC-2** | a back-dated `expires`; an `expires` of *today* | the same entry expiring tomorrow returns `[]`, and the same entry is clean under one injected clock and expired under another |
| **NC-3** | `failOn: []`; `["high"]`; `["critical"]`; and a **widened** `["critical","high","moderate"]` | `["critical","high"]` returns `[]`, and `["high","critical"]` also returns `[]` because order is not semantic |

Each broken case asserts `toHaveLength(1)` or a specific message fragment, not merely "something was
reported" — so a change that started reporting a *different* problem for the same input would also
go red rather than silently pass.

Alongside them the file also permanently carries: the seven document-shape controls above, the
cross-reference between JSON and prose, the required-token register with a **known-negative floor**
(a token deliberately absent from the doc must be reported absent — Phase 46 WR-11, so a renamed
token cannot turn the scan green because it broke), the wiring assertions, and D-47-01-A.

---

## D-47-01-A: CLOSED

The item, open since 47-01 and carried forward unchanged by 47-07 and 47-08:
`overrides: { "vite": "^7.0.0" }` is the only thing holding `vite` on the 7.x line, npm does not
persist `overrides` into `package-lock.json`, and **nothing in the repository failed if those three
lines were deleted.**

Closed with the one-liner 47-07 suggested, in the offline policy test, with zero new dependencies
(`semver` is already a devDependency):

```typescript
expect(manifest().overrides?.vite).toBeDefined()
expect(semver.subset(range, "<8.0.0")).toBe(true)
```

Observed red **three** ways before it was trusted: with the `overrides` block deleted (RED-4), with
the range widened to `^8.0.0` (RED-4b), and — the anti-vacuity half — with `semver.subset` itself
unit-tested against `^8.0.0`, the `^6 || ^7 || ^8` union that `vitest@4.1.x` declares, and `*`, all
three of which must return `false`. Without that last test, a `semver.subset` that returned `true`
for everything would have made the assertion useless while reporting a clean pass.

**D-47-01-B** is noted in `AUDIT-POLICY.md` § "Below the floor" as the plan permitted: `esbuild`'s
surviving moderate has no in-range fix because `@esbuild-kit/core-utils` and
`@esbuild-kit/esm-loader` are deprecated and unmaintained with `drizzle-kit@^0.31.9` as their only
parent. It stays below the `failOn` floor.

---

## The three gates

| Gate | Baseline (`9683b84`, from 47-08) | AFTER this plan | Verdict |
|---|---|---|---|
| base test files | `171 passed \| 2 skipped (173)` | `172 passed \| 2 skipped (174)` | **+1** (the new gate file) |
| base tests | `4845 passed \| 32 skipped (4877)` | `4897 passed \| 32 skipped (4929)` | **+52**, exactly the new file's count |
| rsc project | `2 files / 8 passed (8)` | `2 files / 8 passed (8)` | identical |
| `tsc --noEmit` | exit 0 | exit 0 | identical |
| `eslint` | exit 0 — `124 problems (0 errors, 124 warnings)` | exit 0 — `124 problems (0 errors, 124 warnings)` | identical |

Lint is gated on **errors (0)**; the 124-warning total is context only, per the standing rule that a
warning total differs between master and a worktree. The baseline was re-measured on the pre-change
tree in task 1 (4845/32, RSC 8/8, tsc 0, 0 lint errors) rather than assumed from 47-08's SUMMARY.

### The existing gates the new script and script name had to clear

- **`db-test-isolation.test.ts:341-351`** iterates every `package.json` script asserting none but
  `test:db` contains `test:db` or `db.config`. Asserted directly with `node -e` over every script
  name AND body: `security:audit` / `node scripts/audit-policy.mjs` contains neither token.
- **`db-test-isolation.test.ts:314-327`** asserts `scripts.test` still contains `vitest run` and
  `vitest.rsc.config.ts` and none of the db tokens. `scripts.test` is **byte-unchanged**:
  `"vitest run && vitest run --config vitest.rsc.config.ts"`. The audit was **not** chained into
  `test` — the new test file asserts that too, because the base vitest project must stay
  offline-clean and `npm test` must not reach the registry.
- **`node-engines-floor.test.ts`** — untouched; no dependency moved this plan.
- The new file is `*.test.ts` (not `*.db.test.ts` / `*.rsc.test.ts`), so it is in the base project
  and actually runs in CI.

---

## Deviations from Plan

### 1. [Rule 2 — missing critical functionality] Created `src/lib/__tests__/audit-policy.test.ts`, outside `files_modified`

The plan's `files_modified` is `scripts/audit-policy.mjs`, `audit-policy.json`, `AUDIT-POLICY.md`,
`package.json`, `.planning/BACKLOG.md`, and its task 1 says of the seven `evaluatePolicy` cases
*"47-10 makes them permanent."* The phase hard rules handed to this executor override that:
*"Three permanent in-file negative controls are required (they become plan 47-10's control D)"*, and
*"D-47-01-A — close it if you can"*, whose only suggested closure is an assertion in the offline
policy test.

Both require a test file, so one was created — at the **canonical name 47-RESEARCH §"Recommended
file layout" and 47-PATTERNS both give it** (`src/lib/__tests__/audit-policy.test.ts`), so that
**47-10 extends this file rather than creating a second one covering the same ground.** 47-10 should
expect it to exist. Its 52 tests are a superset of the five assertions 47-RESEARCH §6 lists as
47-10's job, minus the one that needs network (which lives in the script, by design).

Recorded rather than done silently, because "the plan said a later plan would do it" is exactly how
a permanent control becomes a temporary one.

### 2. [Rule 3 — the plan's own numbers had moved] Re-measured everything, and one floor had to be set differently from the plan's instruction

The plan says to set `MIN_ADVISORIES_PARSED` from a measurement of *"38 total / 26 critical+high"*.
Today's measurement is **47 distinct GHSA ids / 14 vulnerable packages / 39 at critical+high**, and
the plan's numbers were pre-47-01. More importantly, the plan's framing — *"set it low enough that
legitimate remediation does not trip it, but non-zero"* — has a hard ceiling that the plan does not
state: the fully-remediated residual is **8**, so any floor above 8 fatals on success. It is set to
**3**, with the reasoning and the ceiling written into the constant's doc-comment, and the
empty-document detection moved onto `MIN_PACKAGES_AUDITED` plus a **histogram reconciliation** that
the plan did not ask for and that is strictly stronger than either floor (NC-DOC-2 and NC-DOC-6 are
caught by nothing else).

### 3. [Adapted] `failOn` is compared for **equality** in the evaluator, not containment

The plan's task-1 action text says to report *"`failOn` not containing both `critical` and `high`"*;
the plan's own threat register (T-47-09-02) says *"`failOn` is asserted to EQUAL
`["critical","high"]` exactly — not `toContain` — in both the evaluator and the vitest gate."*
Followed the register, because containment permits `failOn: ["critical","high","moderate"]` to
change what the gate claims while `AUDIT-POLICY.md` still says otherwise. `REQUIRED_FAIL_ON` in the
script is the single line that must move with the document, which makes any policy change a
reviewable act. Order is not treated as semantic in the evaluator (set equality); the vitest gate
additionally pins the shipped file's array order.

### 4. [Adapted] `CONTRIBUTING.md` was touched, which the plan permitted at one line

*"Link it from `CONTRIBUTING.md` if that costs one line"* — it did. One entry added to
§ "More Information", noting explicitly that the policy is **not** a disclosure policy. Checked
first that `deployment-docs-accuracy.test.ts` only asserts `CONTRIBUTING.md`'s `DATABASE_URL` port
before editing it.

### 5. [Recorded, not fixed] The first `nodemailer` option sweep was over-broad and its number was discarded

An unscoped regex for `raw:` / `envelope:` / `list:` / `jsonTransport` / `disableFileAccess` /
`disableUrlAccess` across `src/` matched **41 files** — because `\braw\s*:` and `\blist\s*:` occur in
unrelated object literals throughout the codebase. Re-run **scoped** to the three files that
reference nodemailer at all: **0**. Recorded because "41" would have looked like a finding and "0"
from a broken matcher would have looked like evidence; neither is, and the scoped result is what the
allowlist reasons cite.

### Not deviations — decisions honoured as written

- **Zero new dependencies.** `scripts/audit-policy.mjs` imports `node:child_process`, `node:fs`,
  `node:path` and nothing else, asserted with `node -e` over the file text and again in the vitest
  gate. `audit-ci`, `better-npm-audit` and `osv-scanner` were not installed, and the reasoning is
  written into `AUDIT-POLICY.md` so a reviewer finds it rather than asking.
- **`npm audit fix` was never run.** No `npm install` of any kind was run; `package-lock.json` is
  untouched by this plan.
- **`nodemailer` took the accept-with-reason-and-expiry path**, not the 7→9 major.
- **The policy document is at the repo root**, not under `security/`, and says in its second
  paragraph that a root `SECURITY.md` would be a different document.
- **The Dockerfile was not converted** to `npm ci`, and the policy does not claim to cover the
  production image.
- **No `next` bump was re-attempted**, and `src/lib/__tests__/node-engines-floor.test.ts` was not
  edited.
- **`slopcheck` was not run** — no package was added, removed or version-changed by this plan, so
  there was nothing for a legitimacy scan to scan. `slopcheck install` was not used.
- **D-47-06-A was left alone.** No test file with a dynamic import in its body was touched.
- **The compose stack is UP and unmodified.**

## Deferred Issues

- **SEC-47-A**, new: `src/lib/email/client.ts:20` sets `tls: { rejectUnauthorized: false }`
  unconditionally. Recorded in `.planning/BACKLOG.md` with its `file:line`, an index row, and the
  note that it is a larger exposure than any `nodemailer` advisory allowlisted here — including
  `GHSA-r7g4-qg5f-qqm2`, whose own acceptance text says so. Not fixed: it is a runtime behaviour
  change needing its own verification (local Mailhog presents a self-signed certificate, so a naive
  flip breaks the documented local workflow).
- **D-47-01-B** unchanged and below the floor, now written into `AUDIT-POLICY.md`.
- **D-47-08-A** (the platform-blind `engines.node` walk) unchanged, and now cited by name in 33 of
  the 39 allowlist reasons — it is the single blocker holding the largest advisory reduction
  available to this phase.
- The `Dockerfile:24` → `npm ci --legacy-peer-deps` conversion remains deferred, and the policy
  states what that costs rather than hiding it.

## Known Stubs

None. Nothing in this plan renders UI or wires data; the evaluator's every branch is exercised by
either the vitest gate or a recorded `node -e` control.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change. The one new network
call is `npm audit` in a CI script, which the `ci` job already makes for `npm ci`.

### Threat register dispositions

| Threat ID | Disposition | Outcome |
|---|---|---|
| T-47-09-01 | mitigate | **Mitigated.** Every entry carries a mandatory `expires` the evaluator treats as a FAILURE once passed (RED-3, and NC-2 permanently in-file), a reason ≥ 80 chars not on `FORBIDDEN_REASONS` (RED-2, NC-1), a `reach` from a closed set, and a cross-reference into the prose (RED-5). Duplicate entries are also a failure — the plan did not ask for that, and without it a second entry could quietly extend the first's expiry |
| T-47-09-02 | mitigate | **Mitigated.** `failOn` compared for set EQUALITY in the evaluator and for exact array equality in the vitest gate. Observed red for `[]`, `["high"]`, `["critical"]` and the widened `["critical","high","moderate"]` |
| T-47-09-03 | mitigate | **Mitigated, and strengthened beyond the plan.** Both floors plus a histogram reconciliation. Seven doctored documents observed FATAL, verbatim above, including one that isolates `MIN_PACKAGES_AUDITED` after the advisories floor short-circuits, and the two shapes 47-01 measured |
| T-47-09-04 | mitigate | **Mitigated.** The script captures stdout, echoes stderr verbatim, prints npm's exit code on line 2 of every run, and its failure verdict says out loud that the exit code was deliberately not the basis. `npm audit` exited 1 on every green run recorded here, which is the proof the branch is not taken |
| T-47-09-05 | mitigate | **Mitigated.** `staleAllowlistProblems` runs in the script (network) and was observed red against a synthetic `minimist` entry — the same GHSA id 47-12's control will introduce. The split is stated in both file headers |
| T-47-09-06 | mitigate | **Mitigated.** Zero new dependencies, asserted from source in two places. `package-lock.json` is byte-unchanged by this plan |
| T-47-09-07 | transfer (out of scope) | **Transferred as planned, and recorded twice** — in `.planning/BACKLOG.md` as SEC-47-A with an index row, and inside `GHSA-r7g4-qg5f-qqm2`'s own acceptance reason, which is where a reviewer of that acceptance will actually see it |
| T-47-09-08 | mitigate | **Mitigated.** `AUDIT-POLICY.md` § "What tree this policy evaluates" carries the three-trees wording verbatim, names `npm install --legacy-peer-deps` at `Dockerfile:24`, states *"It is **not** evaluated against the production image"*, and the vitest gate asserts all three phrases plus a known-negative (`"this policy covers the production image"` must be absent) |
| T-47-09-SC | mitigate | **Mitigated.** This plan installed nothing — no `npm install`, no `npm audit fix`, no `slopcheck install`. `package-lock.json` untouched |

## Requirements

**SEC-05 is NOT marked complete, and that is deliberate.** The requirement reads *"The committed
lockfile's advisories are triaged, **and CI has a stated audit policy**."*

- **First half: DISCHARGED.** All 39 remaining critical/high advisories carry exactly one recorded,
  evidenced disposition with a reach and an expiry; 22 packages were upgraded and 1 replaced across
  47-01/47-07; the policy is stated in prose at the repo root; and the evaluator that enforces it is
  green at exit 0 with zero new dependencies.
- **Second half: NOT discharged.** `.github/workflows/ci.yml` has no `Security audit policy` step.
  Nothing on the required `ci` check fails on an advisory, and the required check has never been
  observed going red for one. 47-CONTEXT § "CI audit policy (SC-4)" names that gap precisely: *"A
  policy whose gate has never been observed failing is a stated intention, not a policy."*

`requirements mark-complete SEC-05` was run per the executor protocol; it set the checkbox to `[x]`
and left the traceability row at `In Progress`. **The checkbox was reverted to `[ ]`** and the reason
written inline in `REQUIREMENTS.md`, because a green SEC-05 with no CI gate is exactly the vacuous
claim this phase exists to delete — the same correction 47-07 recorded.

### State-handler artefacts, corrected rather than left

Three, all of the class 47-07 already recorded:

1. **`state update-progress` left the frontmatter `percent:` at `11`** while writing
   `[████████░░] 75%` into the body. Corrected to 75.
2. **The footer read `Plan: 9 of 13 complete (01, 02, 03, 04, 05, 06, 07, 08)`** — a count of 9
   against a list of 8, and 13 plans when the phase now has **14** (plan 14 was added at `9683b84`
   to close D-47-06-A). Corrected to `9 of 14 complete (…, 09) — next unexecuted is 10`, `Status:
   Executing`, and the body heading to `Plans 01-09 of 14 executed`. `roadmap
   update-plan-progress 47` independently agrees: `{"plan_count":14,"summary_count":9,"status":"In
   Progress"}`.
3. **`state add-decision` wrote `- [Phase ?]:`** for all four of this plan's decisions (and for
   47-06's two). Corrected to `[Phase 47]` for the six `47-*` entries. **42 further `[Phase ?]`
   entries from earlier phases were left alone** — pre-existing, not introduced here, and rewriting
   42 unrelated lines is not this plan's business. The handler cannot infer the phase from this
   STATE.md's shape; that is worth fixing at the tooling level rather than per plan.

`state record-session` returned `{"recorded":false,"reason":"No session fields found in STATE.md"}` —
the same pre-existing shape mismatch (this file has a `## Session Log` bullet list, not the
`Last session` / `Stopped At` fields the handler expects). A dated bullet was added to
`## Current Position` by hand instead.

## Success Criteria

| Criterion | Status |
|---|---|
| A dependency-free in-repo evaluator applies a repo-owned policy, never branches on the child's exit code, floors what it parses, detects stale entries | **MET** — 812 lines, `node:`-only, exit code printed and unused, two floors + reconciliation, stale check observed red |
| Every remaining critical/high advisory has exactly one recorded disposition with an evidenced reason, a reach, and an expiry | **MET** — 39 of 39, two-way set difference empty, duplicates asserted impossible |
| `AUDIT-POLICY.md` at the repo root states the policy in prose including the honest limitation | **MET** — 27,542 chars, three-trees wording verbatim, thirteen required tokens asserted |
| `npm run security:audit` green on the fixed tree with its floors proven able to fail | **MET** — exit 0 recorded verbatim; seven document controls FATAL |
| Three permanent in-file negative controls, observed red, verbatim in the SUMMARY | **MET** — NC-1/NC-2/NC-3 in `audit-policy.test.ts`, each paired with its complement; RED-1/2/3 verbatim above |
| D-47-01-A closed or explained | **MET — CLOSED**, observed red three ways |
| `npm test`, `npm run typecheck`, `npm run lint` (0 errors) | **MET** — 4897/32, RSC 8/8, tsc 0, 0 lint errors / 124 warnings |
| SEC-05 complete | **NOT MET, correctly** — the decision half is discharged, the CI half belongs to 47-11/47-12. See § Requirements |

## Handoff

**To 47-10:** `src/lib/__tests__/audit-policy.test.ts` **already exists** with 52 tests. Extend it;
do not recreate it. It already covers 47-RESEARCH §6's five assertions except the network one
(assertion 5, which lives in the script by design and is observed red in RED-7 above), and it
already carries control D.

**To 47-11 / 47-12:** the CI step is **not** wired yet — `.github/workflows/ci.yml` has no
`Security audit policy` step, because this plan's `files_modified` does not include it.
47-RESEARCH §7 supplies the exact YAML, and its comment block must avoid the strings `test:db` and
`db.config` (`db-test-isolation.test.ts:358-363` asserts the raw workflow text contains zero
occurrences of either). The gate is **green on the fixed tree as of this commit**, which is the
precondition 47-12's `minimist@1.2.5` red depends on — and RED-7 has already exercised the same
GHSA id from the other direction.

**To whoever owns the `next` follow-up:** 33 of the 39 acceptances expire **2026-09-24** and name
`src/lib/__tests__/node-engines-floor.test.ts:335`/`:379` as their blocker. When those expire, the
suite goes red and names each one. That is intended.

## Self-Check: PASSED

```
FOUND: scripts/audit-policy.mjs                      (812 lines)
FOUND: audit-policy.json                             (39 allowlist entries, failOn exact)
FOUND: AUDIT-POLICY.md                               (27,542 chars)
FOUND: src/lib/__tests__/audit-policy.test.ts        (52 tests, all passing)
FOUND: package.json                                  (scripts."security:audit" present, scripts.test byte-unchanged)
FOUND: CONTRIBUTING.md                               (policy link)
FOUND: .planning/BACKLOG.md                          (SEC-47-A + index row)
FOUND commit: 461069c   FOUND commit: c578a70   FOUND commit: e10ee2a

PASS: must_haves artifact — scripts/audit-policy.mjs >= 140 lines (812)
PASS: must_haves artifact — audit-policy.json contains "failOn"
PASS: must_haves artifact — AUDIT-POLICY.md >= 80 lines
PASS: must_haves artifact — package.json contains "security:audit"
PASS: must_haves key_link — package.json scripts."security:audit" matches /node scripts\/audit-policy\.mjs/
PASS: must_haves key_link — scripts/audit-policy.mjs references audit-policy.json
PASS: exports — evaluatePolicy, FORBIDDEN_REASONS, MIN_REASON_LENGTH, GHSA_PATTERN, ghsaFromViaUrl
PASS: importing the module ran no npm audit and opened no socket
PASS: no script but test:db mentions test:db or db.config
PASS: git diff --diff-filter=D HEAD~1 HEAD — empty, no file deleted by any commit
PASS: overrides.vite intact ("^7.0.0") and now gated
PASS: package-lock.json untouched by this plan
PASS: compose stack UP — pipelite-app-1, pipelite-postgres-1 (healthy), pipelite-mailhog-1
```
