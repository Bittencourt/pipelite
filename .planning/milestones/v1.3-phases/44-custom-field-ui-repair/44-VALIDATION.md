---
phase: 44
slug: custom-field-ui-repair
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-15
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Materialized from `44-RESEARCH.md` § Validation Architecture, whose numbers were measured
> this session rather than assumed.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest **4.0.18** |
| **Config file** | `vitest.config.ts` — `environment: node`, `include: ['src/**/*.{test,spec}.?(c\|m)[jt]s?(x)']`, `exclude: [...configDefaults.exclude, '**/.next/**']`, alias `@ → ./src` |
| **New: RSC project config** | A second project with `resolve.conditions: ['react-server']` for the Flight round-trip gate. Suggested include `src/**/*.rsc.test.?(c\|m)[jt]s?(x)`. The base config's `include` already matches `*.test.tsx`, so `*.rsc.test.tsx` **must be excluded from the base project** or it runs twice and fails there |
| **Quick run command** | `rtk proxy npx vitest run src/app/admin/fields src/components/custom-fields src/lib/custom-fields.test.ts` |
| **Full suite command** | `rtk proxy npx vitest run` |
| **Baseline (measured 2026-08-15)** | **50 files / 777 passed / 4 skipped, exit 0, 26.9 s** — supersedes 34-VALIDATION.md's stale 461 |
| **Estimated runtime** | ~27 s full suite; < 2 s per touched file |
| **Other gates** | `npx tsc --noEmit` exit 0; `npx eslint` 0 errors |
| **DB-free** | Yes. `.tsx` transform works out of the box (esbuild + `tsconfig.jsx: react-jsx`) — **no `@vitejs/plugin-react`, no jsdom, no @testing-library** `[VERIFIED this session]` |

**No new packages.** Component rendering uses `react-dom/server`'s `renderToStaticMarkup` under the
existing `node` environment (measured 757 ms), and the Flight gate uses the serializer Next already
ships. Phase 34's no-new-packages constraint holds.

---

## Sampling Rate

- **After every task commit:** the single test file touched (< 2 s each)
- **After every plan wave:** `rtk proxy npx vitest run && npx tsc --noEmit && npx eslint` (~60 s)
- **Before `/gsd:verify-work`:** full suite ≥ **777** passing, plus the Docker browser checkpoint signed off
- **Max feedback latency:** ~2 s per task; ~60 s per wave

---

## Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| CFUI-01 | A real element child renders through `DialogTrigger asChild`; a Flight-deferred child renders **empty** (the trap itself, documented as a test) | unit | `npx vitest run src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` | ❌ Wave 0 |
| CFUI-01 | The header trigger's props do **not** cause element deferral — asserted through the **real Flight serializer**, including the measured n=20 / n=21 boundary | unit (RSC project) | `npx vitest run --config vitest.rsc.config.ts` | ❌ Wave 0 |
| CFUI-01 | `page.tsx` renders the trigger from a `'use client'` component rather than passing JSX children into `FieldDialog` | structural | same file, source-read assertion | ❌ Wave 0 |
| CFUI-01 | `/admin/fields/deal` server HTML contains the Add Field button on the live 155-row dataset | **manual / scripted** | forged-cookie `curl`, see Manual-Only | ❌ |
| CFUI-02 | `saveFieldValues` returns `values` equal to `recalculateFormulas`' `customFields`, and still returns `{success:true}` | unit | `npx vitest run src/lib/custom-fields.test.ts` | ✅ extend |
| CFUI-02 | On the **D-05 recalc-throws** path, `values` falls back to `next` and `success` stays `true` — a formula error never blocks the user's edit | unit | same | ✅ extend |
| CFUI-02 | `CustomFieldsSection` replaces `localValues` with the API's `values`, so `FormulaField` receives the freshly computed wrapper | unit (render) | `npx vitest run src/components/custom-fields/__tests__/custom-fields-section.test.tsx` | ❌ Wave 0 |
| CFUI-03 | The client field-value map contains a `null` entry for **every** active definition name, and stored values take precedence over the seed | unit | same file (or the extracted pure helper — see below) | ❌ Wave 0 |
| CFUI-03 | `evaluateFormula` over a seeded map returns `{value:null, error:null}` — **not** `Unknown field` — for an unset source | unit | `npx vitest run src/lib/formula-engine.test.ts` (extend) | ✅ extend |
| CFUI-03 | Stored `{formula:true,…}` wrappers are unwrapped before entering the client value map | unit | custom-fields-section test | ❌ Wave 0 |
| CFUI-04 | `activities/[id]/page.tsx` passes `entityAttributes`, so a formula on an activity resolves native activity fields | unit | activities detail page / section test | ❌ Wave 0 |
| CFUI-05 | The client evaluator passes the same QuickJS resource bounds as the server call site; a runaway expression terminates | unit | `npx vitest run src/components/custom-fields/__tests__/` | ❌ Wave 0 |
| **Security** | `stripFormulaKeys` still runs before the write — the client now holds wrappers and will POST them back; they must be stripped server-side (T-34-04 must not regress) | unit | `npx vitest run src/lib/custom-fields.test.ts` | ✅ extend |
| **Security** | The admin authorization gate stays in the **server** component — moving the trigger client-side must not move any authz decision | structural | rsc-boundary test | ❌ Wave 0 |
| **Regression** | Phase 34's suite stays green | regression | `rtk proxy npx vitest run` ≥ 777 passing | ✅ must not regress |

**CFUI-01's automated half tests the serialization contract, not the whole page.** The full
click-through remains manual by design — see Manual-Only.

---

## Wave 0 Requirements

- [ ] `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` — CFUI-01 mechanism + structural + authz-placement gate
- [ ] `vitest.rsc.config.ts` (or a `projects:` entry) with `resolve.conditions: ['react-server']`, **plus** an `exclude` in the base config so `*.rsc.test.tsx` does not run in both projects
- [ ] `src/app/admin/fields/[entityType]/__tests__/field-dialog-boundary.rsc.test.tsx` — the real Flight round-trip gate (SC-5)
- [ ] `src/components/custom-fields/__tests__/custom-fields-section.test.tsx` — **the repo has no component test anywhere today**; this is the first
- [ ] Extend `src/lib/custom-fields.test.ts` for the new `values` return key and the D-05 fallback
- [ ] Extend `src/lib/formula-engine.test.ts` for the seeded-map empty case
- [x] No framework install needed — vitest 4.0.18 + `react-dom/server` + the bundled flight serializer cover everything `[VERIFIED]`

**Rendering `CustomFieldsSection` needs two mocks** — it transitively pulls `next-intl`'s
`useFormatter` (via `FormulaField`) and `global.fetch`. Wrap in `NextIntlClientProvider` or
`vi.mock('next-intl')`, plus `vi.stubGlobal('fetch', …)`. Neither needs a new package.

**Preferred alternative for CFUI-03/04:** extract the client value-map seeding into a pure exported
helper (e.g. `buildClientFieldValues(definitions, entityAttributes, values)`) and unit test that.
Cheaper than rendering, and it makes the server/client parity that D-14 demands **explicit and
directly assertable** — which is the whole point of CFUI-03.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Add Field button renders **and creates a field** on `/admin/fields/deal` (155 defs) | CFUI-01 | Needs the live dataset and an interactive click-through-to-create; the automated gates cover the serialization contract, not the whole page | 1. `docker compose up -d --build`. 2. Log in as admin, open `/admin/fields/deal`. 3. Button present → click → create `GSD Temp Text` (type: text). 4. Verify in psql, then archive/delete it. 5. Re-check `/admin/fields/{person,organization,activity}` still show the button. 6. Open a formula field's editor on **all four** and confirm the `{{…}}` chips still insert at the cursor. |
| Formula value updates on screen with no reload | CFUI-02 | Watching a rendered number change requires a browser | 1. Pick a person whose `custom_fields` **already contains** a `{formula:true,…}` wrapper — verify in psql first; this precondition is exactly what selects the broken branch. 2. Load the detail page fresh. 3. Edit the source field and press **Enter** (not Tab — the editor commits on Enter). 4. Displayed value must equal the psql value with no reload. |
| Unset formula renders blank | CFUI-03 | Same | Create a new person, open it before setting anything, confirm the formula shows blank/`Empty` and **not** `#ERROR — Unknown field`. |
| Cleanup | CONTEXT.md | — | Delete all `GSD*` definitions and records; confirm baseline **155 deal / 8 organization / 6 person** and zero `GSD*` rows. |

**A scripted half of CFUI-01 is available and should be preferred where it fits:** the forged-cookie
`curl` in `44-RESEARCH.md` § Code Examples asserts the server-rendered HTML on the live 155-row dataset
without a browser, and is the exact procedure that reproduced the bug. It is read-only. Treat it as a
`checkpoint:human-verify` helper, **not** a committed test — it needs a running container and reads
`AUTH_SECRET`. Never commit a token or put one in a plan file.

---

## Validation Sign-Off

- [x] All tasks have an automated verify command or a Wave 0 dependency, except the justified `checkpoint:human-verify` items above
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags; no `--reporter=basic` (does not exist in vitest 4)
- [x] New tests are DB-free (`vi.mock("@/db")`) — no database mutation
- [x] Feedback latency < 60 s per wave
- [x] SC-5 is asserted against the **real Flight serializer**, not a mock — a mocked boundary cannot detect the deferral that caused this bug
- [x] Phase 34's 777-test baseline is an explicit non-regression gate
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-15 (materialized from `44-RESEARCH.md` § Validation Architecture)
