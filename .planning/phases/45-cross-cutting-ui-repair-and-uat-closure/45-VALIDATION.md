---
phase: 45
slug: cross-cutting-ui-repair-and-uat-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-18
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `45-RESEARCH.md` § Validation Architecture. Where this file and the research
> disagree, the research is the evidence and this file is the contract.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18, two projects: `vitest.config.ts` (`environment: 'node'`) and `vitest.rsc.config.ts` (`react-server` condition) |
| **Config file** | `vitest.config.ts`, `vitest.rsc.config.ts`; `playwright.config.ts` created by Wave 0 |
| **Quick run command** | `./node_modules/.bin/vitest run <path>` |
| **Full suite command** | `npm run test` (= `vitest run && vitest run --config vitest.rsc.config.ts`) |
| **Gates** | `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint`) |
| **E2E framework** | none today — `playwright.config.ts` and `e2e/` are created by this phase |
| **E2E run command** | `./node_modules/.bin/playwright test` (against the Docker app; **no `webServer` block**) |
| **Estimated runtime** | unit ~60s (2086 tests, 96 files); e2e not yet measured |

**There is no DOM test environment in this repo, and this phase must not add one.** Component
decisions with no pure-function home are pinned by *source-scan gates* that read the file through
`src/components/custom-fields/__tests__/source-scan.ts`'s comment-stripping `readStrippedSource()`
and assert on tokens. Every new component-level gate in this phase follows that established pattern.

**CI does not run Playwright.** `.github/workflows/ci.yml` is `npm ci` → `typecheck` → `lint` →
`test`, with no Docker, no database, and no app server. The e2e specs are a local phase gate, not a
merge gate — see V-3 below.

---

## Sampling Rate

- **After every task commit:** `npm run typecheck && npm run lint`, plus the one vitest file the task
  touches via `./node_modules/.bin/vitest run <path>`.
- **After every plan wave:** `npm run test` (both vitest projects).
- **Before any Playwright run:** `docker compose up -d --build`, then wait for the app to answer on
  `http://localhost:3001`. The image is a production standalone build with no volume mount, so source
  changes are invisible to the harness until it is rebuilt. **Waves must batch UI edits accordingly.**
- **Before `/gsd:verify-work`:** `npm run typecheck` + `npm run lint` + `npm run test` all green,
  **and** `./node_modules/.bin/playwright test` green.
- **Max feedback latency:** 90s for the unit path; the e2e path is gated per wave, not per task.

---

## Per-Task Verification Map

Task IDs are assigned by the planner; this map binds each success criterion to its verification
mechanism, and the planner must attach every task to one of these rows.

| Criterion | Wave | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-----------|------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| SC-1 | later | No horizontal overflow, 6 routes × 3 locales @320px | — | N/A | e2e (layout) | `./node_modules/.bin/playwright test e2e/viewport-320.spec.ts` | ❌ W0 | ⬜ pending |
| SC-2 | later | Provider mounted with the four locked props; `<html suppressHydrationWarning>` | — | N/A | source gate | `./node_modules/.bin/vitest run src/app/__tests__/theme-wiring.test.ts` | ❌ W0 | ⬜ pending |
| SC-2 | later | Toggle present, three values, no `mounted` gate | — | N/A | source gate | same file or a `user-menu` sibling | ❌ W0 | ⬜ pending |
| SC-2 | later | Theme choice survives a reload | — | N/A | e2e | `./node_modules/.bin/playwright test e2e/theme.spec.ts` | ❌ W0 | ⬜ pending |
| SC-3 | later | All new keys present, non-blank, translated, in all three locales | — | N/A | unit | `./node_modules/.bin/vitest run src/messages/locale-parity.test.ts` | ✅ **exists — extend** | ⬜ pending |
| SC-3 | later | No English literal remains in `admin-sidebar.tsx`, `nav-header.tsx`, `ui/dialog.tsx`, `ui/sheet.tsx` | — | N/A | source gate | new `*-wiring.test.ts` following `bulk-failure-report-wiring` | ❌ W0 | ⬜ pending |
| SC-3 | later | `AlertDialogCancel` still ships no hardcoded label (S-3 is an assertion, not an edit) | — | N/A | source gate | same file | ❌ W0 | ⬜ pending |
| SC-4 | later | Three copy branches, correct keys, surviving-count prop is a number | T-38-07 | Reason stays a closed-union code → `t("reason.<code>")`, never server prose | source gate | `./node_modules/.bin/vitest run src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts` | ✅ **exists — extend `FAILURE_KEYS`** | ⬜ pending |
| SC-4 | later | Each of the four callers passes the surviving count | — | N/A | source gate | new or extended caller wiring gate | ❌ W0 | ⬜ pending |
| SC-5 | later | Drag with an unrelated card checked moves the card and leaves the selection intact | — | Only `isTrusted: true` input counts as evidence | e2e | `./node_modules/.bin/playwright test e2e/deals-drag.spec.ts` | ❌ W0 | ⬜ pending |
| SC-5 | later | G1: one Escape closes the dialog only, and does not clear the selection | — | Same — synthetic `KeyboardEvent` dispatch is refused as evidence | e2e | same spec | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install -D @playwright/test` — the only new dependency. Verified on the registry:
      37M weekly downloads, `microsoft/playwright`, **no postinstall script**.
- [ ] `playwright.config.ts` at the repo root. **Must** carry
      `launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] }` and must **not** define a
      `webServer` block. See V-1.
- [ ] `e2e/auth.setup.ts` + `e2e/.auth/` — the authenticated `storageState`, produced by logging in
      once through the real form as the seeded `pipelite-e2e@local` admin. See V-2.
- [ ] A seed path for the `pipelite-e2e@local` admin — idempotent, argon2id via the existing
      `src/lib/password.ts`, password read from an environment variable, guarded so it can never run
      against a non-dev database.
- [ ] `e2e/viewport-320.spec.ts` — SC-1, with locale-dependent anti-vacuity anchors.
- [ ] `e2e/deals-drag.spec.ts` — SC-5 drag + the G1 Escape regression.
- [ ] `e2e/theme.spec.ts` — SC-2 reload persistence (may be folded into another spec).
- [ ] `.gitignore` += `/e2e/.auth/`, `/playwright-report/`, `/test-results/` — **required before the
      first `auth.setup.ts` run**, not after. See V-2.
- [ ] `.dockerignore` += `e2e`, `playwright.config.ts`, `playwright-report`, `test-results`.
- [ ] Extend `src/messages/locale-parity.test.ts`: `REQUIRED_BULK_KEYS` (+2), `REQUIRED_AUDIT_KEYS`
      (+2), a new `REQUIRED_SHELL_KEYS` for `admin.nav.*` and `theme.*`, and populate
      `IDENTICAL_TRANSLATION_ALLOWED` with the three product nouns. See V-4.
- [ ] Extend `src/components/bulk/__tests__/bulk-failure-report-wiring.test.ts`'s `FAILURE_KEYS`
      with the two new branch keys.
- [ ] New source gates for the theme wiring and for shell-literal removal.

---

## Manual-Only Verifications

| Behavior | Criterion | Why Manual | Test Instructions |
|----------|-----------|------------|-------------------|
| Visual correctness of the dark palette on each repaired surface | SC-2 | A source gate proves the provider is mounted and the toggle exists; it cannot prove the result looks right. No screenshot baseline exists in this repo and this phase does not add one. | With the app rebuilt, toggle to dark and walk `/organizations`, `/deals`, `/admin/audit` and one open dialog. Confirm no unreadable text and no light-mode island. |
| Sheet drawer feel on a real touch device | SC-1 | Playwright emulates a 320px viewport, not a finger. Swipe-to-dismiss and momentum are not measurable here. | Open `/admin/audit` on a phone, open the drawer, dismiss it by overlay tap and by swipe. |

*Everything else in this phase has automated verification. The single item Phase 45 inherited as
"human-only" — the deals-kanban drag — is explicitly converted to an automated e2e check by SC-5,
and is therefore NOT listed here.*

---

## Validation Rules (phase-specific, binding)

- **V-1 — Headless hides scrollbars, and that would make SC-1 vacuous.** Measured live: default
  headless Chromium reports `clientWidth 320` at a 320px viewport, while
  `ignoreDefaultArgs: ["--hide-scrollbars"]` restores `clientWidth 305` — exactly reproducing the
  recorded UAT baseline. Without that one config line the harness green-lights layouts that still
  overflow on a real phone. The config line is not optional and must not be "simplified away".
- **V-2 — The session state is a live credential.** `storageState` persists a real JWT session cookie
  with a 7-day `maxAge`. `/e2e/.auth/` must be in `.gitignore` **before** the setup project first
  runs, and must never be committed or uploaded as a CI artifact. The seeded account's password comes
  from an environment variable — never a literal in a spec, a config, or a plan document.
- **V-3 — Playwright must not enter the CI pipeline.** CI has no Docker, no database and no app
  server; adding the e2e run there produces a permanently red required check. The e2e suite is a
  local phase gate. If a task proposes wiring it into `.github/workflows/ci.yml`, that is a defect.
- **V-4 — The locale gate is an exact-set contract, not a lint.** Adding the new keys without
  updating the `REQUIRED_*` lists fails CI. Note the research correction: `placeholderDrift()`'s
  regex does not match ICU plural syntax, so the `{count, plural, …}` wrapper is **not** in fact
  gated — do not claim coverage the gate does not provide.
- **V-5 — Anti-vacuity is mandatory on every e2e assertion.** A blank page, an error page, and a
  redirect to `/login` all satisfy `scrollWidth <= clientWidth`. Every viewport assertion must be
  anchored to locale-dependent content proving the real authenticated page rendered. A spec that can
  pass against a 200-with-no-body is not evidence.
- **V-6 — Only trusted input counts.** Playwright's `page.mouse.*` emits `isTrusted: true` pointer
  events with interpolated `pointermove`s via `{steps: n}`, which satisfies dnd-kit's
  `PointerSensor` activation constraint. Synthetic `dispatchEvent` is refused as evidence for both
  SC-5 and G1 — regression G1 proved synthetic dispatch hides a real defect on this exact component.
- **V-7 — Rebuild before measuring.** Any task whose verification is a Playwright run must state
  `docker compose up -d --build` as a precondition. A green e2e run against a stale image is a
  false pass.
- **V-8 — `slopcheck install` is not a read-only check.** It runs `npm install` and writes to
  `dependencies`. It mutated `package.json` and `package-lock.json` during research (both reverted).
  No plan task may invoke it as a verification step.

---

## Assumption Carried Into Planning

**A4 (medium risk, from 45-RESEARCH.md):** `activities-client.tsx` is assumed to expose a
`loadedIds`-equivalent set at the point where it renders `BulkFailureReport`. The import is
confirmed; the variable was not read. **The SC-4 wave must read this file first** — if the set is
absent, that caller needs it derived before the surviving-count prop can be passed.

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or an explicit Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers every ❌ reference in the verification map
- [ ] No watch-mode flags anywhere
- [ ] Feedback latency < 90s on the unit path
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
