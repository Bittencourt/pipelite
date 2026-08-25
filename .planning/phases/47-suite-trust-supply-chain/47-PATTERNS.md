# Phase 47: Suite Trust & Supply Chain - Pattern Map

**Mapped:** 2026-08-25
**Files analyzed:** 18 (8 created, 10 modified)
**Analogs found:** 16 / 18 (2 with no in-repo precedent — see § No Analog Found)

> Sources read in full or in targeted ranges for this map:
> `src/lib/__tests__/node-engines-floor.test.ts` (409), `src/lib/__tests__/migrate-from-zero-fences.test.ts` (205),
> `src/lib/__tests__/deployment-docs-accuracy.test.ts` (:155-209, :495-570, :586-705),
> `src/lib/mutations/__tests__/db-test-isolation.test.ts` (:1-130, :130-230, :280-460, :480-622),
> `src/types/__tests__/no-standing-suppressions.test.ts` (:1-40, :120-160),
> `scripts/migrate-from-zero.mjs` (:100-170, :560-635, :1120-1215), `.github/workflows/ci.yml` (160),
> `package.json` (88), `vitest.config.ts`, `src/lib/execution/toggle.test.ts` (144),
> `src/lib/execution/recursion.test.ts` (:1-100), `src/lib/execution/condition-evaluator.test.ts` (:560-638),
> `src/lib/execution/actions/__tests__/crm.test.ts` (:85-100), `.../http.test.ts` (:525-562),
> `src/lib/observability/sentry.test.ts` (:178-196), `src/app/admin/users/actions.test.ts` (:25-62),
> `src/components/custom-fields/__tests__/client-formula-bounds.test.ts` (:100-138),
> `src/lib/formula-engine.test.ts` (:390-410), `src/app/notes/actions.test.ts` (:1-40),
> plus `46-PATTERNS.md`, `47-CONTEXT.md`, `47-RESEARCH.md`.

---

## Answers to the four questions the orchestrator asked, up front

**1. Is there an AST-based test in this repo? NO. Zero precedent.**
`grep -rn 'from "typescript"' --include=*.ts --include=*.tsx --include=*.mjs . --exclude-dir=node_modules`
returns **nothing**. `typescript` is a devDependency (`package.json:85`, `^5`) used only by
`tsc --noEmit`. No file in `src/`, `scripts/` or `e2e/` calls `createSourceFile`, `forEachChild` or
touches `ts.SyntaxKind`. **The two AST gates this phase creates are the first of their kind here.**
The planner must budget for that: there is no `ts` import convention, no shared AST helper, no
existing file-enumeration-for-parsing helper. What *does* exist and must be copied is everything
*around* the parse — the file walk (`no-standing-suppressions.test.ts:112-127` style), the floors,
the matcher self-test, the `file:line` hit collector, and the failure-message register. RESEARCH
§Code Examples supplies the parse itself verbatim (`/tmp/p47/scan-hooks.mjs`,
`/tmp/p47/scan-timing2.mjs`); treat those as the source, and this document as the frame to put
them in.

**2. The anti-vacuity forms, with file:line.** Five distinct forms exist in this tree, not three.
Phase 46 added two. See § Shared Patterns S1 — in particular **S1(d)**, the WR-11 "floor the token,
not just the count" form, which now has a first-class implementation at
`db-test-isolation.test.ts:579-605`, and **S1(e)**, the self-collision defence at
`no-standing-suppressions.test.ts:19-25`, which is *the* hazard for the SC-1b gate.

**3. Allowlist with a per-entry reason.** Two analogs, and the better one is not the token list.
`deployment-docs-accuracy.test.ts:170-204` (`RUNBOOK_REQUIRED_TOKENS`) carries the measured reason
per entry in a doc-comment. But `deployment-docs-accuracy.test.ts:537-556` + `:692-700`
(`OPERATOR_POSTGRES_DOCS`) is the **exclusion** analog and is stronger: it pairs each exclusion with
its reason *and* asserts the excluded items still exhibit the excluded property, so the carve-out is
a **live control rather than a comment**. That is the exact shape both the advisory allowlist and
the four-`vi.resetModules()` carve-out need. **Date/expiry comparison: no static-gate precedent
exists** — the only in-repo future-date assertion is
`src/app/admin/users/actions.test.ts:59` (`expect(insertValues.expiresAt.getTime()).toBeGreaterThan(Date.now())`).

**4. CI step conventions + what `db-test-isolation.test.ts` now asserts about `ci.yml`.** Fully
enumerated in § `.github/workflows/ci.yml` below, including the four assertions the new step must
not trip and the two it must satisfy by shape.

**5. `vi.mock` hoisting / static-import house style.** The repo's own best example is
`src/app/notes/actions.test.ts:29-40` — static top-level imports beside hoisted `vi.mock` calls, with
a header that states what is mocked and why. `toggle.test.ts` and `recursion.test.ts` are the two
files that do *not* follow it. See § `src/lib/execution/toggle.test.ts`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **NEW** `src/lib/__tests__/suite-timing-hygiene.test.ts` | test (static AST gate ×2) | file-I/O → parse → transform | `node-engines-floor.test.ts` (matcher self-test + floors + permanent NC) + `no-standing-suppressions.test.ts` (src/ walk, raw-read proof, self-collision defence) | **role-match** — the *parse* has no analog (Q1) |
| **NEW** `src/lib/__tests__/audit-policy.test.ts` | test (static gate over a JSON policy + an imported `.mjs`) | file-I/O → JSON parse | `migrate-from-zero-fences.test.ts` (imports the `.mjs`, exercises pure exports) + `node-engines-floor.test.ts:284-349` (permanent NC) | **exact** |
| **NEW** `scripts/audit-policy.mjs` | operational script | request-response (network) → transform → exit code | `scripts/migrate-from-zero.mjs` (`.mjs`, floors, `Fatal`, `import.meta.main` guard, child spawn, verdict-not-exit-code) | **exact** |
| **NEW** `security/audit-policy.json` *(or root — see ⚠ below)* | config (data) | — | `drizzle/meta/_journal.json` is the only in-repo hand-consumed JSON data file; no policy-file analog | **partial** |
| **NEW** `AUDIT-POLICY.md` (repo root) *(⚠ CONTEXT vs RESEARCH conflict)* | doc | — | `CONTRIBUTING.md` / `README.md` (root markdown); `docs/admin/backup-restore.md` (procedure doc gated by a test) | **role-match** |
| **NEW** `scripts/suite-repeatability.sh` | operational script (bash) | batch | `scripts/dedup-db-test-setup.sh` (the ONLY bash script in the repo) | **role-match** |
| **NEW** `scripts/diff-pass-sets.mjs` | operational script | file-I/O → set diff → exit code | `scripts/migrate-from-zero.mjs:1063-1080` (`IDENTICAL (both empty — proves nothing)` at `:1072`) | **exact** |
| **MOD** `src/lib/execution/condition-evaluator.ts` (export `tokenizeFieldPath`) | library | transform | itself — one-line `export` addition | **self** |
| **MOD** `src/lib/execution/condition-evaluator.test.ts:574-638` | test | transform | itself (`:582-588` kept verbatim) + `node-engines-floor.test.ts` NC form | **self** |
| **MOD** `src/lib/execution/toggle.test.ts:54-66` | test | request-response (mocked) | `src/app/notes/actions.test.ts:29-40` (static import + hoisted `vi.mock`, house style) | **exact** |
| **MOD** `src/lib/execution/recursion.test.ts:61-84` | test | request-response (mocked) | same | **exact** |
| **MOD** `src/components/custom-fields/__tests__/client-formula-bounds.test.ts:129` | test | transform | `http.test.ts:528-559` (the deterministic-clock model) | **exact** |
| **MOD** `src/lib/formula-engine.test.ts:403` | test | transform | same | **exact** |
| **NOT MODIFIED, CARVED OUT** `crm.test.ts:96`, `http.test.ts:90`, `notification.test.ts:98`, `email.test.ts:98` | test | — | `deployment-docs-accuracy.test.ts:537-556` + `:692-700` (exclusion list with a live control) | **exact** |
| **MOD** `.github/workflows/ci.yml` | config (CI) | — | itself (`:103-160`) | **exact** |
| **MOD** `package.json:8-24` | config | — | itself (`db:check-migrations` is the precedent) | **exact** |
| **MOD (maybe)** `src/lib/mutations/__tests__/db-test-isolation.test.ts:65-75` | test | file-I/O | itself | **self** |
| **MOD** `.planning/BACKLOG.md` (SMTP `rejectUnauthorized: false`, per RESEARCH §Security) | doc | — | itself | **self** |

⚠ **CONTEXT and RESEARCH disagree on where the policy document lives.** `47-CONTEXT.md:134-135`
locks *"Policy document at repo root (`AUDIT-POLICY.md` or equivalent) — a root `SECURITY.md` is a
different document and must not be conflated with it."* `47-RESEARCH.md:762` recommends
`security/audit-policy.md`. CONTEXT's "or equivalent" arguably covers it, but the planner must make
this an explicit decision rather than inherit it silently. There is **no `security/` directory and
no `SECURITY.md` today** (verified: repo root holds `CONTRIBUTING.md`, `README.md`, `docs/`).
Either way the JSON and the prose should live together, and the vitest gate should name both paths
as `const`s in the `deployment-docs-accuracy.test.ts:68-75` style.

---

## Pattern Assignments

### `src/lib/__tests__/suite-timing-hygiene.test.ts` (test, static AST gate ×2) — GATE T

Two independent sweeps in one file (RESEARCH §Recommended file layout):
**T1** = no `expect()` over a clock-derived delta or ratio (SC-1b);
**T2** = no dynamic `import()` inside a lifecycle hook, with the four-file carve-out.

#### 1. Header — the "why this gate exists / do not weaken it" essay is mandatory house style

Every static infra gate opens with an all-caps title, titled `──` sections, measured numbers, and a
closing instruction. Copy the shape from `node-engines-floor.test.ts:1-61`:

```typescript
/**
 * THE NODE ENGINES-FLOOR GATE.
 *
 * The production image ran `node:20-alpine`. Node 20 reached END OF LIFE on 2026-04-30, so that
 * image shipped an unpatched V8 and an unpatched OpenSSL to every self-hoster who built it. ...
 *
 * ── WHY THIS GATE READS THE LOCKFILE INSTEAD OF COMPARING AGAINST A NUMBER ────────────────────
 * ...
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────
 * ...
 * ── THE PERMANENT NEGATIVE CONTROL ───────────────────────────────────────────────────────────
 *
 * v1.3 shipped six gates that could not fail. The countermeasure here is NC-3, below ...
 *
 * If you are raising a dependency and this went red, RAISE THE PIN ... Never lower the assertion.
 */
```

**Sections this file's header must carry**, per CONTEXT/RESEARCH: why an AST and not a grep
(RESEARCH §2's measured false positive at `sentry.test.ts:185`); why a *taint* pass and not inline
matching (RESEARCH §4 — v1 missed `condition-evaluator.test.ts:636`, the assertion QG-01 names);
why the four `vi.resetModules()` files are carved out; and the boundary statement RESEARCH §4:609-611
prescribes verbatim — *a test may rely on vitest's ambient or an explicit `{ timeout: N }` as a
liveness backstop against a hang, but must not **assert** an elapsed-time threshold.*

#### 2. Imports + the src/ walk (`no-standing-suppressions.test.ts:33-40`, `:112-127`)

Node builtins first, blank line, `vitest` + third-party, `REPO_ROOT = process.cwd()`, every subject
path a named `const`:

```typescript
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()
```

`typescript` becomes a fourth import (`import ts from "typescript"`), and it is the first time this
repo does that (Q1). It is already a direct devDependency, so no install is needed.

Reader helper, verbatim from `node-engines-floor.test.ts:100-102`:

```typescript
function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}
```

#### 3. ANTI-VACUITY — all five forms apply here; **S1(e) is the one that will be missed**

**(a) Named floor constants with the measured number in the doc-comment** —
`node-engines-floor.test.ts:76-86`:

```typescript
/**
 * Floor on the number of `engines.node` ranges walked out of the lockfile. Measured on the tree
 * this gate was written against: 832 declared ranges across 106 distinct range expressions ...
 * 800 is a deliberately loose floor that still fails hard if the lockfile path constant is wrong ...
 *
 * Without this floor a broken walk yields an empty array, therefore zero violations, therefore a
 * permanently green gate — the exact shape of the v1.3 gates that could not fail.
 */
const MIN_DECLARED_RANGES = 800
```

**Floors this file needs** (RESEARCH-measured): `expect()` call expressions parsed **≥ 7000**
(measured 8060), lifecycle-hook call expressions parsed **≥ 140** (measured 151), test files parsed
**≥ 150** (measured 175). Set each *below* the measurement and say so — `migrate-from-zero.mjs:116-121`
records exactly why a floor set AT the measurement is itself a defect:

```javascript
// A floor set AT the measurement breaks the rule two lines up: legitimate SHRINKAGE ...
// then fatals with a message that misdiagnoses it as a parse failure, and the next person under
// time pressure "fixes" it by lowering the number without understanding what it was for.
const MIN_JOURNAL_ENTRIES = 15 // measured: 20 (0000..0019)
const MIN_SNAPSHOT_TABLES = 30 // measured: 36
```

**(b) The matcher unit-tests itself against fixtures FIRST** — `node-engines-floor.test.ts:203-241`
is the current best in-repo instance (it supersedes `deployment-docs-accuracy.test.ts:267-304` in
one respect: its `KNOWN_POSITIVE` fixtures assert the *extracted value*, not just a boolean):

```typescript
describe("the `FROM node:` matcher, unit-tested against fixtures FIRST", () => {
  /**
   * These assertions gate everything below them. A regex that matches nothing yields an empty tag
   * list, an empty list has a Set size of 0 and a length of 0, and every relational assertion built
   * on it becomes unfalsifiable. If any fixture here is red, treat every pass further down as
   * unproven.
   */
  const KNOWN_POSITIVE = [
    ["FROM node:24-alpine AS runner", "24-alpine"],
    ["FROM node:20-alpine AS deps", "20-alpine"],
    ["  FROM node:24.12.0-bookworm-slim AS builder", "24.12.0-bookworm-slim"],
  ] as const

  const KNOWN_NEGATIVE = [
    // A different image entirely. docker-compose.yml pins this one; it must never be counted.
    "FROM postgres:16-alpine",
    // Commented out. A pin that is prose is not a pin ...
    "# FROM node:20-alpine AS deps",
    // A cross-stage copy source, not a stage base. `--from=` is not `FROM `.
    "COPY --from=node:24-alpine /x /y",
  ] as const

  it.each(KNOWN_POSITIVE)("MUST extract the tag from: %s", (fixture, expected) => {
    expect(nodeBaseTags(fixture)).toEqual([expected])
  })

  it.each(KNOWN_NEGATIVE)("MUST NOT match: %s", (fixture) => {
    expect(nodeBaseTags(fixture)).toEqual([])
  })
})
```

**Applied:** both scanners must accept a *source string* (not only a path), exactly as
`nodeBaseTags(dockerfileText = dockerfileRaw)` does, so the fixtures are parsed through the same
`ts.createSourceFile` path the sweep uses. RESEARCH §Pattern 2 pins the API shape:
`scanSource("known-positive.ts", KNOWN_POSITIVE)`.

**Fixtures each sweep must be proved against** (drawn from real tree text — every one of these was
verified in this session):

*T1 KNOWN_POSITIVE (must be flagged):*
- `condition-evaluator.test.ts:633-636`'s exact shape — the bound-variable ratio the v1 scanner
  missed:
  ```typescript
  const small = Math.max(time(8000), 0.05)
  const large = time(128000)
  expect(large / small).toBeLessThan(80)
  ```
- `client-formula-bounds.test.ts:129` — `expect(Date.now() - start).toBeLessThan(15000)`
- `formula-engine.test.ts:403` — `expect(Date.now() - start).toBeLessThan(5000)`

*T1 KNOWN_NEGATIVE (must NOT be flagged) — all four are real code that must stay green:*
- `http.test.ts:559` — `expect(Date.now() - before).toBe(0)` under
  `vi.useFakeTimers({ shouldAdvanceTime: false })` (`http.test.ts:531`). **This is a delta and it is
  legitimate**, so the boundary is either "frozen clock" or "not a `toBeLessThan`/`toBeGreaterThan`
  threshold". Decide and write it into the header; do not discover it at run time.
- `src/app/admin/users/actions.test.ts:37` — `expect(expiresAt.getTime() - now).toBe(expectedMs)`
  (algebraically exact on one captured value)
- `src/app/admin/users/actions.test.ts:59` — `expect(insertValues.expiresAt.getTime()).toBeGreaterThan(Date.now())`
  (a **future timestamp**, i.e. a clock call as an *addition* operand — RESEARCH §4:587-590 states
  the discriminating rule)
- `src/lib/audit/prune.test.ts:319` / `src/lib/trash/prune.test.ts:447` — a future timestamp passed
  *into* a pure function, assertion on a boolean

*T2 KNOWN_NEGATIVE (the measured false positive a regex produces):*
`src/lib/observability/sentry.test.ts:185` — its `beforeEach` contains only `vi.doMock`; the
`await import` lives in the test bodies:
```typescript
  beforeEach(() => {
    // NOVEL IDIOM — see the file header. Zero precedent in this repo; do not look for one.
    vi.doMock("@sentry/nextjs", () => {
      throw new Error("@sentry/nextjs must not be imported when SENTRY_DSN is unset")
    })
  })
```

**(c) "The enumeration reached real files"** — `no-standing-suppressions.test.ts:131-138`:

```typescript
describe("the walk reaches the tree it claims to scan", () => {
  it("enumerates at least 400 non-test and at least 100 test modules under src/", () => {
    // Anti-vacuity. A wrong path constant or a broken recursion is the failure mode that made the
    // phase-42 gates pass on an empty diff; these floors are the tripwire for it. Measured on the
    // tree this gate was written against: 523 non-test, 169 test.
    expect(NON_TEST_FILES.length).toBeGreaterThanOrEqual(400)
    expect(TEST_FILES.length).toBeGreaterThanOrEqual(100)
  })
```

…plus the named-file half (`no-standing-suppressions.test.ts:139-146`), which for this file means
naming `src/lib/execution/toggle.test.ts`, `src/lib/execution/recursion.test.ts` and
`src/lib/execution/condition-evaluator.test.ts` in the enumeration by path, so a wrong root constant
is red:

```typescript
  it("enumerates all three of the modules POLISH-01 retypes", () => {
    // Fails if a rename moves a target file out from under this gate, which would otherwise let the
    // criterion below pass by simply not looking at the files that carry the suppressions.
    for (const columnsPath of COLUMNS_PATHS) {
      expect(NON_TEST_FILES).toContain(columnsPath)
    }
  })
```

**(d) FLOOR THE TOKEN, NOT JUST THE COUNT (WR-11)** — see § S1(d). For T1 that is: the sweep must
assert it still finds `Date.now` / `performance.now` **call expressions** somewhere in the corpus
(they exist — `performance.now()` at `condition-evaluator.test.ts:620,622`, `Date.now()` at 13+
sites), otherwise "zero delta assertions" is satisfied by a clock-call detector that stopped
detecting clock calls. For T2 that is: the sweep must assert it still finds `await import(` inside
a hook **in the four carved-out files**, or a broken hook-detector reports a clean sweep.

**(e) ⚠ SELF-COLLISION — the highest-probability defect in this whole phase.**
`no-standing-suppressions.test.ts:19-25` is the only in-repo file that has faced this, and it names
it exactly:

```typescript
 * (b) THE NEEDLE IS NEVER WRITTEN LITERALLY IN THIS FILE. It is assembled by `join` at runtime,
 *     and the last test asserts this file's own raw source does not contain it. Without that, the
 *     repo-wide count asserted below would be self-inflated by however many times the gate named
 *     what it was counting — the exact shape of the phase-42 gate that counted prose its own plan
 *     had ordered written. If you need to mention the directive in this file, mention it by its
 *     error code, not its spelling.
```

**Why it bites here:** `suite-timing-hygiene.test.ts` is itself a `*.test.ts` under `src/`, so its
own T1 sweep will enumerate it — and its `KNOWN_POSITIVE` fixtures *are* elapsed-delta assertions.
Two mitigations, and the plan should pick one explicitly:
1. hold every fixture as a **source string** parsed via `ts.createSourceFile("known-positive.ts", …)`
   rather than as live code — a string literal is not a `CallExpression`, so the sweep cannot see it.
   This is what RESEARCH §Pattern 2 does and it is the recommended route; **but** the T1 taint pass
   works on identifiers, so also confirm the fixture strings do not appear in a way the *hit
   collector* reports.
2. exclude this file by path from the sweep — and then assert the exclusion is exactly one path and
   that the file is otherwise enumerated, in the `OPERATOR_POSTGRES_DOCS` live-control style (S1(f)).

Do **not** do both silently. A gate that excludes itself *and* stringifies its fixtures has two
independent reasons to be green and no way to tell which one is load-bearing.

#### 4. The four-file carve-out — copy `OPERATOR_POSTGRES_DOCS`, not a comment

`deployment-docs-accuracy.test.ts:537-556` — an `as const` exclusion list whose doc-comment carries
the per-entry reason, and whose header says why the list exists:

```typescript
/**
 * DELIBERATELY EXCLUDED, and this list exists so the next reader finds the reasoning instead of
 * re-deriving it — or, worse, "fixing" these two to 5433 and breaking them.
 *
 *   - `docs/admin/configuration.md`           — its `localhost:5432` example is the "Local
 *                                               PostgreSQL" case: a Postgres the operator
 *                                               installed themselves ...
 *   - `docs/admin/deployment/bare-metal.md`   — the whole document is an operator installing
 *                                               Postgres directly on the machine ...
 *
 * Both are asserted below to STILL print `localhost:5432`, so the exclusion is a live control
 * rather than a comment: a future sweep that "fixes all the ports" turns this red.
 */
const OPERATOR_POSTGRES_DOCS = [
  "docs/admin/configuration.md",
  "docs/admin/deployment/bare-metal.md",
] as const
```

…and the live control, `deployment-docs-accuracy.test.ts:692-700`:

```typescript
  it.each(OPERATOR_POSTGRES_DOCS)("%s deliberately still prints 5432", (file) => {
    // A live control on the exclusion list above, not a comment. These describe a Postgres the
    // operator installed themselves on its own default port; rewriting them to 5433 would be a
    // regression dressed as consistency.
    const hits = scanLines([file], DATABASE_URL_ASSIGNMENT_RE).filter((hit) =>
      hit.includes(WRONG_HOST_PORT),
    )
    expect(hits.length, `${file} no longer documents a local operator-run Postgres`).toBeGreaterThan(0)
  })
```

…and the disjointness check, `deployment-docs-accuracy.test.ts:593-600`:

```typescript
  it("keeps the two doc sets disjoint", () => {
    // A file in both lists would be asserted to print 5433 and 5432 at once — unsatisfiable, and
    // the kind of contradiction that gets "resolved" by deleting an assertion.
    const overlap = HOST_PERSPECTIVE_DOCS.filter((f) =>
      (OPERATOR_POSTGRES_DOCS as readonly string[]).includes(f),
    )
    expect(overlap).toEqual([])
  })
```

**Applied verbatim to the carve-out.** `RESET_MODULES_CARVE_OUT` names the four files
(`crm.test.ts`, `http.test.ts`, `notification.test.ts`, `email.test.ts` under
`src/lib/execution/actions/__tests__/`), each with the reason from RESEARCH §2:477-495 written
beside it (cost paid per test rather than once; 535/106/83/44 ms first-test cost), plus:

- a **live control**: each carved-out file must STILL contain `vi.resetModules()` inside the same
  hook as the dynamic import — otherwise the exemption is covering a file that no longer needs it.
  The real subject text, `crm.test.ts:88-97`:
  ```typescript
  describe("CRM action handler", () => {
    beforeEach(async () => {
      vi.clearAllMocks()
      mockFrom.mockReturnValue({ where: mockWhere })
      mockWhere.mockReturnValue({ limit: mockLimit })
      vi.resetModules()
      const mod = await import("../index")
      executeAction = mod.executeAction
    })
  ```
- the two skipped `*-live` files (`src/lib/audit/export-events-live.test.ts:48-53`,
  `src/lib/export/formatters-live.test.ts:94-95`) are a **second, separate** exclusion with its own
  reason (entirely skipped, opt-in, 60 s `beforeAll` timeouts) — keep the two lists distinct and
  assert them disjoint, per `:593-600` above.

#### 5. `file:line` hit collector and the array-form assertion

`deployment-docs-accuracy.test.ts:239-261`:

```typescript
/** Every `file:line` in the enumerated set whose line matches `re`. */
function scanLines(files: string[], re: RegExp): string[] {
  const hits: string[] = []
  for (const file of files) {
    const lines = read(file).split("\n")
    lines.forEach((line, i) => {
      if (re.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`)
    })
  }
  return hits
}
```

For an AST sweep the line comes from
`src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1` (RESEARCH §Code Examples), but the
**output shape and the assertion form are identical**: build `${file}:${line}: ${text}` strings and
assert `expect(hits).toEqual([])`, never `expect(hits.length).toBe(0)` — the array form prints the
offenders. The house failure-message register (second `expect` argument, naming the fix) is at
`deployment-docs-accuracy.test.ts:614-620`:

```typescript
    expect(
      offenders,
      `${file} assigns DATABASE_URL without the host port ${HOST_PORT}. ` +
        `docker-compose.yml publishes Postgres at 5433:5432, and drizzle-kit run from the host ` +
        `reads .env — so a reader who pastes this cannot connect. Offending lines: ` +
        `${offenders.join(" | ")}`,
    ).toEqual([])
```

#### 6. Permanent in-file negative control (NC-C) — `node-engines-floor.test.ts:284-349`

The strongest form in the repo, and the reason its relaxation reasoning is worth copying in full:

```typescript
/**
 * Upper bound on the number of ranges an EOL Node may violate before the control itself is
 * suspect. Measured 2026-08-25: exactly 1 violation at 20.20.2, out of 834 declared ranges. ...
 */
const MAX_EXPECTED_VIOLATIONS = 5

describe("NC-3: the checker can produce a red", () => {
  /**
   * ... This assertion is the standing proof that `nodeFloorViolations` reports violations at all,
   * rather than being a function that has simply never disagreed with anything. ...
   *
   * WHY IT IS NOT AN EXACT-ARRAY EQUALITY ANY MORE. It was, and that made it a control that would
   * go red for a reason that says nothing about the pin. ... A control that misdirects the person
   * it wakes up is worse than a looser one.
   */
  it("reports the binding violation for 20.20.2, and not the whole lockfile", () => {
    const pkgs = nodeFloorViolations("20.20.2").map((violation) => violation.pkg)
    expect(pkgs, "20.20.2 must still violate the constraint that forced the pin off node:20-alpine")
      .toContain("@napi-rs/lzma-linux-x64-gnu")
    expect(pkgs.length, `if this grew, a NEW dependency raised the floor — update this control, ` +
      `NOT the pin ... Violations: ${pkgs.join(", ")}`).toBeLessThanOrEqual(MAX_EXPECTED_VIOLATIONS)
  })

  it("reports none for 24.12.0, so the control distinguishes the two cases", () => {
    // The complement. Without it, a checker that returned a constant one-element array would pass
    // the assertion above.
    expect(nodeFloorViolations("24.12.0")).toEqual([])
  })
})
```

**Note the complement pattern** (`:332-336`) — a checker that returns a constant non-empty array
passes the positive control. Every negative control in this phase needs its complement asserted in
the same `describe`. That applies to NC-A/B (the counting facade) and NC-D (the policy gate) too.

---

### `src/lib/execution/condition-evaluator.test.ts:574-638` (MODIFY) + `condition-evaluator.ts` (export)

**Analog:** itself, plus `node-engines-floor.test.ts`'s NC form.

**Keep verbatim** (`:574-588`) — this is the behavioural half CONTEXT and RESEARCH both say to
retain, and it is also the anti-vacuity anchor proving the pathological inputs are still exercised:

```typescript
describe("resolveFieldPath — parsing is linear, not backtracking (T-34-20)", () => {
  const pathologicalPaths = (n: number) => [
    "trigger.data" + '["a"]'.repeat(n),
    'trigger.data.customFields["' + "a".repeat(n * 10), // unterminated
    "trigger." + "a.".repeat(n) + "b",
    'trigger.data["' + '"'.repeat(n) + '"]',
  ]

  it("does not throw and resolves undefined on pathological paths", () => {
    const ctx = realCtx()
    for (const path of pathologicalPaths(20000)) {
      expect(() => resolveFieldPath(ctx, path)).not.toThrow()
      expect(resolveFieldPath(ctx, path)).toBeUndefined()
    }
  })
```

**Delete `:590-637`** — the 24-line rationale block AND the assertion. The comment must go with the
assertion: leaving prose that argues for a ratio next to a counted-ops gate is the Pitfall-9 /
`scripts/dedup-db-test-setup.sh:21-30` failure shape Phase 46 hit. Its replacement essay states
what CONTEXT decided: a ratio of elapsed times is rejected outright, not tuned.

The block being removed, for the planner's diff reference (`:613-636`):

```typescript
  it("scales linearly, not quadratically, with path length", () => {
    const ctx = realCtx()
    const time = (n: number) => {
      const paths = pathologicalPaths(n)
      // Best-of-5 to damp scheduler noise and JIT warm-up.
      let best = Infinity
      for (let run = 0; run < 5; run++) {
        const start = performance.now()
        for (const path of paths) resolveFieldPath(ctx, path)
        best = Math.min(best, performance.now() - start)
      }
      return best
    }

    time(2000) // warm-up, discarded
    const small = Math.max(time(8000), 0.05)
    const large = time(128000) // 16x the input

    expect(large / small).toBeLessThan(80)
  })
```

⚠ **This removal also removes the repo's only two `performance.now()` call sites**
(`:620`, `:622` — verified, RESEARCH §4:594-595). If T1's clock-call floor (S1(d)) counts
`performance.now`, it will have **zero** instances after this edit and the floor will fail. Floor on
`Date.now` (13+ sites remain) or floor on the union and record the count *after* the edit. This is a
real ordering hazard between two files this phase touches.

**Export seam** (`condition-evaluator.ts`): `tokenizeFieldPath` is module-private today
(`:40-81`); `resolveFieldPath` (`:96-111`) guards `typeof path !== "string"` at `:100`, which the
boxed-String proxy fails **correctly** — RESEARCH §1:324-328 is explicit that this guard must not be
weakened, and that exporting the parser creates an anti-vacuity obligation (the AST half proves
`resolveFieldPath` still routes through `tokenizeFieldPath`). The `export` on a previously-private
helper has a direct precedent in this same phase's neighbourhood:
`node-engines-floor.test.ts:121`, `:136`, `:149`, `:166` all `export` functions from a *test* file
purely so they are testable and re-usable; `scripts/migrate-from-zero.mjs:134-135`, `:194`, `:303`
does the same for the fences.

**Preserve** the `FORBIDDEN_SEGMENTS` prototype-pollution coverage at
`condition-evaluator.test.ts:545-572` (`PROTO_PATHS` + the inherited-property case) — RESEARCH
§Security Domain flags it as a property the replacement must not disturb.

---

### `src/lib/execution/toggle.test.ts` (MODIFY) — static-import hoist

**Analog:** `src/app/notes/actions.test.ts:1-40` — the house style for "mock the module graph, import
the subject statically". Note the header convention (WHAT IS MOCKED AND WHY / WHAT IS DELIBERATELY
NOT MOCKED) and the `import type` rule:

```typescript
/**
 * The browser-facing note server actions: authentication, attribution, authorization,
 * cache invalidation and paging.
 * ...
 * WHAT IS MOCKED AND WHY
 *   - `@/auth`                    — the session under test.
 *   - `@/db`                      — throws at import time without DATABASE_URL, and this
 *                                   suite must not touch Postgres.
 *   - `next/cache`                — `revalidatePath` is an assertion target.
 * ...
 * Type-only imports stay `import type` throughout: erased at runtime, so they cannot
 * resurrect a mocked module.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import type { EntityType, Note } from "@/db/schema"

vi.mock("@/db", () => ({
  db: { query: { users: { findFirst: vi.fn() } } },
}))

vi.mock("@/auth", () => ({ auth: vi.fn() }))
```

**The subject today, `toggle.test.ts:54-66`** — note that the two comments at `:54-55` and `:77`
(in `recursion.test.ts`) assert a *false* belief and must be deleted with the code:

```typescript
// We need to use dynamic import since toggleWorkflow is a server action
// that depends on the mocked modules
let toggleWorkflow: (id: string, active: boolean) => Promise<
  { success: true; cancelledRuns: number } | { success: false; error: string }
>

describe("toggleWorkflow", () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    const mod = await import("@/app/workflows/actions")
    toggleWorkflow = mod.toggleWorkflow
  })
```

**The replacement, proven in RESEARCH §2:443-471** (1258 ms → 3.0 ms, all five tests still pass):

```typescript
import { toggleWorkflow } from "@/app/workflows/actions"

describe("toggleWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
```

**Everything above `:54` stays untouched** — `vi.hoisted` at `:4-37` and the four `vi.mock` calls at
`:39-52` are already correct house style and are what makes the static import safe. The hoisting
guarantee is the load-bearing fact: `vi.mock` is hoisted above imports by vitest's transform.

⚠ **Pitfall 4 (RESEARCH:1228-1234): do NOT move it to `beforeAll`.** `beforeAll` is still a hook
under the same 10 000 ms `hookTimeout`. `export-events-live.test.ts:47` and
`formatters-live.test.ts:93` already carry `beforeAll(..., 60000)` — the in-repo proof that the
`beforeAll` workaround is the road to a 60-second number.

---

### `src/lib/execution/recursion.test.ts:61-84` (MODIFY) — same defect, same fix

**Analog:** the fixed `toggle.test.ts`, and `notes/actions.test.ts` for the import shape.

**The subject, `recursion.test.ts:61-84`** — note this file already statically imports its *first*
subject at `:2-6` (`getCurrentExecutionDepth`, `runWithExecutionDepth`, `MAX_RECURSION_DEPTH` from
`./recursion`), so the file itself demonstrates both styles side by side:

```typescript
describe("createWorkflowRun with depth enforcement", () => {
  // Use vi.hoisted so mocks are available when vi.mock factory runs
  const { mockReturning, mockValues, mockInsert } = vi.hoisted(() => { /* ... */ })

  vi.mock("@/db", () => ({
    db: {
      insert: (table: unknown) => mockInsert(table),
    },
  }))

  // Need to import after mock setup
  let createWorkflowRun: typeof import("@/lib/triggers/create-run").createWorkflowRun

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import("@/lib/triggers/create-run")
    createWorkflowRun = mod.createWorkflowRun
  })
```

⚠ **Structural difference from `toggle.test.ts`:** here the `vi.mock` sits *inside* a `describe`
(`:71-75`), not at module scope. It is still hoisted to the top of the file by the transform, but the
static import must go to module scope at `:1-6`, joining the existing `./recursion` import — not
inside the `describe`. That is a real edit-shape difference the plan should state.

⚠ **`recursion.test.ts:27`** contains `await new Promise((r) => setTimeout(r, 1))` — one of the 13
event-loop-yield `setTimeout` sites RESEARCH §4:596-598 classifies as deterministic flush idioms, not
races. The T1 gate must not flag it; it is not an `expect()` over a clock delta, so the specified
taint rule already excludes it — but it belongs in the KNOWN_NEGATIVE set as insurance.

---

### `client-formula-bounds.test.ts:129` and `formula-engine.test.ts:403` (MODIFY) — drop, keep the `{timeout}`

**Analog:** `src/lib/execution/actions/__tests__/http.test.ts:528-559` — the model RESEARCH §4 names
("NOT A HAZARD — and the model to copy"): make the clock deterministic, or assert the *property*, not
the elapsed time.

```typescript
    it("makes no request and no backoff sleep, asserted with retryCount 3", async () => {
      // Frozen fake timers: if the handler awaited sleep(), this await would never
      // resolve and the test would time out. So resolving is itself the proof that
      // no backoff was awaited — and nothing actually waits.
      vi.useFakeTimers({ shouldAdvanceTime: false })
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
      const before = Date.now()
      ...
      expect(vi.getTimerCount()).toBe(0)
      expect(Date.now() - before).toBe(0)
```

**Subject 1, `client-formula-bounds.test.ts:105-131`.** The `{ timeout: 30000 }` at `:106` and the
two assertions at `:114-115` and `:128` already carry the whole property; `:129` is strictly
redundant *and* tighter than the timeout, so it is the thing that fires first:

```typescript
  it(
    "interrupts a non-terminating expression under FORMULA_EVAL_OPTIONS",
    { timeout: 30000 },
    async () => {
      // PRECONDITION, and not a formality: if FORMULA_EVAL_OPTIONS is missing or carries no
      // timeout, the evaluation below does not fail — it wedges the vitest worker permanently ...
      expect(FORMULA_EVAL_OPTIONS?.timeoutMs).toBeGreaterThan(0)
      expect(Number.isFinite(FORMULA_EVAL_OPTIONS?.timeoutMs)).toBe(true)
      ...
      // Resolving at all is the assertion; without the bound this never returns.
      expect(result).toBeDefined()
      expect(Date.now() - start).toBeLessThan(15000)   // :129  <-- DELETE
    }
  )
```

Delete `:129` **and** the now-unused `const start = Date.now()` at `:118`. The comment at `:127`
("Resolving at all is the assertion") is already the correct rationale — keep it and extend it to say
why the elapsed assertion was removed rather than retuned.

**Subject 2, `formula-engine.test.ts:395-404`:**

```typescript
  it('interrupts a non-terminating expression instead of hanging', { timeout: 10000 }, async () => {
    const start = Date.now()
    const result = await evaluateFormula(
      'LOGIC.if(true, (function(){ while(true){} })(), 0)',
      {}, undefined, { timeoutMs: 50 }
    )
    expect(Date.now() - start).toBeLessThan(5000)   // :403  <-- DELETE
    expect(result.error).not.toBeNull()             // :404  <-- the real assertion
  })
```

Same edit; delete `:396`'s `const start` too. Note this file uses **single quotes** while the rest of
the suite uses double — match the local file, not the repo mode.

---

### `scripts/audit-policy.mjs` (operational script, network → transform → exit code)

**Analog:** `scripts/migrate-from-zero.mjs` — same language, same runtime, same "shell out to a tool
whose exit code is not the verdict, parse its output, apply a policy, exit 0/1" shape. It is the only
`.mjs` in `scripts/` and it landed in Phase 46, so it is current house style by construction.

#### 1. Imports and floors block (`migrate-from-zero.mjs:104-133`)

```javascript
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import postgres from "postgres"

// ---------------------------------------------------------------------------
// Anti-vacuity floors. Two empty sets compare equal, which is the exact shape of the six
// gates v1.3 shipped that could not fail. Each number below was measured on 2026-08-25
// against this tree; each floor sits BELOW the measurement so ordinary growth does not
// trip it, but a parse that silently yields nothing does.
// ---------------------------------------------------------------------------
const MIN_JOURNAL_ENTRIES = 15 // measured: 20 (0000..0019)
const MIN_SNAPSHOT_TABLES = 30 // measured: 36

/** Appended to every floor failure. The floors are tripwires, not schema-size assertions,
 *  and the difference decides whether the next reader fixes the parse or lowers the bar. */
const FLOOR_ADVICE =
  " This is a tripwire for a parse that yielded nothing, not an assertion about how big " +
  "the schema should be. If the schema legitimately shrank, lower the floor AND record " +
  "the new measurement in the comment beside it."
```

**Applied:** `MIN_ADVISORIES_PARSED` (measured 38 total / 26 critical+high on 2026-08-25) and
`MIN_PACKAGES_AUDITED` (measured 1289) — because `npm audit --json` returning `{}` on a network
error, a proxy interception or a schema change yields **zero offenders and exit 0**. That is the
single most likely way this gate ships vacuous. **Zero new dependencies**, per CONTEXT — the only
imports are `node:child_process`, `node:fs`, `node:path`.

#### 2. `Fatal` + `progress` (`migrate-from-zero.mjs:137-154`)

```javascript
export class Fatal extends Error {}

/**
 * Abort with a diagnosis. ALWAYS throws — the annotation is what makes that fact visible to
 * tooling and to the reader, so nobody adds a `if (!x) …` guard for a return value that
 * cannot happen. ...
 * @param {string} message
 * @returns {never}
 */
function fatal(message) {
  throw new Fatal(message)
}

function progress(line) {
  console.log(`-> ${line}`)
}
```

The `-> …` progress convention and the terminal `OK: …` line come from
`scripts/dedup-db-test-setup.sh` and are carried through by `migrate-from-zero.mjs`. JSDoc `@param`
/ `@returns` on exported `.mjs` functions is the house style (this repo typechecks `.mjs` only
loosely, so the annotations are the contract).

#### 3. **Never branch on the child's exit code** — the single most transferable pattern here

`migrate-from-zero.mjs:573-624` spawns `drizzle-kit` and deliberately ignores its exit code, because
it prints the same success line for 0 applied migrations as for 20:

```javascript
function runDrizzleMigrate(scratchUrl) {
  const bin = path.resolve(process.cwd(), "node_modules", ".bin", "drizzle-kit")
  if (!existsSync(bin)) {
    fatal(`${bin} does not exist. Install dependencies first:\n  npm install`)
  }
  ...
  return new Promise((resolve, reject) => {
    // DATABASE_URL travels in the child's ENVIRONMENT, never on its argv: a connection
    // string on a command line is visible in `ps`, in shell history and in CI logs.
    const child = spawn(bin, ["migrate"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: scratchUrl },
      stdio: ["ignore", "pipe", "pipe"],
    })
    // stdout AND stderr are echoed through verbatim. On the failing path `42P01` IS the
    // diagnosis; swallowing stderr destroys the only useful output the failure produces.
    ...
    child.on("close", (code, signal) => { resolve({ code: code ?? -1, signal }) })
  })
}
```

**Applied verbatim in spirit:** `npm audit` **exits 1 whenever any advisory exists at all**
(RESEARCH §Code Examples:1332). So `audit-policy.mjs` must capture stdout and branch on the *parsed
content*, never on the exit code — and must echo stderr through, because a network failure's stderr
is the only diagnosis. RESEARCH names this "Phase 46's lesson about drizzle-kit, same shape".
Note the verdict text at `migrate-from-zero.mjs:1144-1149` says so out loud, and the audit script's
verdict should too:

```javascript
    console.error(
      `FATAL: the migration chain does NOT build the schema this repository declares ` +
        `(${problems.length} problem(s) above). Note that the child migrate's exit code is ` +
        "reported above and is deliberately NOT what this verdict is based on — a chain " +
        "missing a table nothing else references exits 0 and still ships a broken install."
    )
```

#### 4. Report-then-fail (`migrate-from-zero.mjs:789-795`, `:1138-1155`)

A module-level `problems` array with a `record()` helper, then one terminal block that prints every
problem and sets `process.exitCode`:

```javascript
const problems = []

function record(problem) { /* ... */ }
```

```javascript
  if (problems.length) {
    console.error("")
    for (const problem of problems) {
      console.error(`FATAL: ${problem}`)
    }
    console.error("")
    console.error(`FATAL: ... (${problems.length} problem(s) above). ...`)
    process.exitCode = 1
    return
  }

  console.log("OK: the migration chain builds a complete schema from zero")
```

Note `process.exitCode = 1; return` — **not** `process.exit(1)` — so buffered stdout flushes. That
matters here because CI reads the output.

#### 5. The invocation guard — this is what makes the vitest gate possible (`:1186-1215`)

```javascript
// ---------------------------------------------------------------------------
// Invocation guard.
//
// `import.meta.main` is TRUE only when node was pointed at this file, and vitest's module
// runner sets it FALSE (measured, both). That is what lets the fence unit test import
// `assertScratchName` without provisioning a database. Node has defined it since 24.2 and
// package.json's engines floor is >= 24.12, so `undefined` means a runtime this script has
// never been tested under — and a check that silently does nothing is strictly worse than
// a check that fails, so that case is FATAL rather than a quiet return.
// ---------------------------------------------------------------------------
if (import.meta.main === true) {
  registerSignalHandlers()
  try {
    await main()
  } catch (error) {
    if (error instanceof Fatal) {
      console.error(`FATAL: ${error.message}`)
    } else {
      console.error(`FATAL: ${error?.stack ?? error}`)
    }
    process.exitCode = interrupted ? 130 : 1
  }
} else if (import.meta.main !== false) {
  console.error(
    "FATAL: this runtime does not define import.meta.main, so migrate-from-zero.mjs cannot " +
      "tell whether it was invoked or imported and refuses to guess. package.json requires " +
      `node >= 24.12.0; this is ${process.version}.`
  )
  process.exitCode = 1
}
```

**Copy this block whole.** Without it, `audit-policy.test.ts` cannot import `evaluatePolicy` from the
script — it would shell out to `npm audit` at collection time, putting the network inside the base
vitest project, which RESEARCH §6:799 explicitly forbids.

#### 6. Exported pure surface

`migrate-from-zero.mjs` exports exactly the pure, testable things: `SCRATCH_PATTERN` (`:134`),
`FORBIDDEN_SCRATCH_NAMES` (`:135`), `Fatal` (`:137`), `databaseUrlFromEnvLine` (`:194`),
`assertScratchName` (`:303`). Everything with I/O stays private.

**Applied:** export `evaluatePolicy(auditJson, policy, now)` — pure, no I/O, injectable clock — plus
`FORBIDDEN_REASONS`, `MIN_REASON_LENGTH`, `GHSA_PATTERN` and `ghsaFromViaUrl`. The **injectable
`now`** is the only way `audit-policy.test.ts` can assert the expiry semantics deterministically
without either faking timers or writing a back-dated entry into the shipped file.

---

### `src/lib/__tests__/audit-policy.test.ts` (test, static gate + imported evaluator)

**Primary analog:** `src/lib/__tests__/migrate-from-zero-fences.test.ts` — a vitest gate that
**imports named exports from a `scripts/*.mjs`** and exercises the pure branches. This is an exact
structural match and the planner should treat it as the template.

#### 1. The header states why importing the script is safe (`:27-34`)

```typescript
/**
 * ── WHY THE IMPORT IS SAFE ────────────────────────────────────────────────────────────
 *
 * The script guards its own entry point on `import.meta.main`, which node sets to `true`
 * when it is invoked and vitest's module runner sets to `false` (both measured). Importing
 * it here therefore provisions nothing, connects to nothing, and reads no `.env`. If that
 * guard is ever removed, this file will hang or fail rather than quietly stop proving
 * anything — which is the correct direction for the failure to point.
 */
```

**Applied:** "…connects to nothing, and runs no `npm audit`." That sentence is load-bearing: the base
vitest project must stay offline-clean.

#### 2. The relative import of a `.mjs` from a test (`:35-44`)

```typescript
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  FORBIDDEN_SCRATCH_NAMES,
  SCRATCH_PATTERN,
  assertScratchName,
  databaseUrlFromEnvLine,
} from "../../../scripts/migrate-from-zero.mjs"
```

Note: a **relative** `../../../scripts/…` path with the `.mjs` extension, not the `@/` alias (the
alias resolves to `./src` only — `vitest.config.ts:31-33`). `src/lib/__tests__/` → `../../../scripts/`
is the same depth, so this import line is reusable verbatim with the filename swapped.

#### 3. Anti-vacuity for a *checker* (`:52-71`) — the exact shape the allowlist gate needs

```typescript
describe("the scratch-name fence has inputs at all (anti-vacuity)", () => {
  it("exports a pattern that accepts the name the script generates", () => {
    // Without this, every `toThrow` below could be satisfied by a check that rejects
    // EVERYTHING — including the script's own scratch name, which would make the script
    // unable to run while this file reported a clean pass.
    expect(SCRATCH_PATTERN.test(GENERATED_NAME)).toBe(true)
    expect(() => assertScratchName(GENERATED_NAME, REFERENCE_DB)).not.toThrow()
  })

  it("still names every reserved database the check was written for", () => {
    // A silent shrink of this list is a silent removal of the check. Asserted by value
    // rather than by length so a rename is as loud as a deletion.
    expect([...FORBIDDEN_SCRATCH_NAMES].sort()).toEqual([
      "pipelite", "postgres", "template0", "template1",
    ])
  })
})
```

**Applied directly to Pitfall 8 and Pitfall 9:**

- `expect([...FORBIDDEN_REASONS].sort()).toEqual([...])` — asserted **by value**, so removing
  `"dev-only"` from the forbidden set is as loud as deleting the check. This is the answer to
  CONTEXT's *"a bare 'dev-only' is not a reason"*.
- `expect(policy.failOn).toEqual(["critical", "high"])` — **`toEqual`, not `toContain`**
  (RESEARCH Pitfall 9, §Security V14). This is the anti-vacuity anchor for the entire policy file:
  an emptied `failOn` satisfies "no unallowlisted critical/high" perfectly.
- an "accepts a well-formed entry" positive, so a validator that rejects everything cannot pass by
  rejecting the real allowlist too.

#### 4. `it.each` over the real data, with the payload table (`:99-115`)

```typescript
  it.each([
    ["an empty name", ""],
    ["a bare wrong name", "crm_production"],
    ["the right prefix with an uppercase tail", "pipelite_migchk_ABC"],
    ['a quote-injection payload', 'pipelite_migchk_1"; DROP DATABASE "pipelite'],
    ["a newline payload", "pipelite_migchk_1\npipelite"],
  ])("refuses %s", (_label, name) => {
    // The payloads matter because the name is INTERPOLATED into SQL ...
    expect(() => assertScratchName(name, REFERENCE_DB)).toThrow(/refusing to touch/)
  })
```

**Applied — the three permanent negative controls (NC-D)** RESEARCH §Validation:1475 asks to be made
*permanent in-file*, exactly as `node-engines-floor.test.ts`'s NC-3 is, rather than run once by hand:

```typescript
it.each([
  ["a forbidden bare reason",    { ...VALID, reason: "dev-only" }],
  ["an expired entry",           { ...VALID, expires: "2020-01-01" }],
  ["a malformed GHSA id",        { ...VALID, ghsa: "CVE-2024-1234" }],
  ["a reason below the floor",   { ...VALID, reason: "n/a" }],
])("rejects %s", (_label, entry) => { /* expect(...).toThrow / toHaveLength(1) */ })
```

…paired with its **complement** (`node-engines-floor.test.ts:332-336`): the same validator returns
`[]` for `VALID`. Without the complement, a validator that rejects everything passes all four.

#### 5. Expiry — **no static-gate precedent; nearest analog and the trap**

The only future-date assertion in the repo is `src/app/admin/users/actions.test.ts:33-38` and `:59`:

```typescript
    it('sets expiry to 7 days from now', () => {
      const now = Date.now()
      const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000)
      const expectedMs = 7 * 24 * 60 * 60 * 1000
      expect(expiresAt.getTime() - now).toBe(expectedMs)
    })
```
```typescript
      expect(insertValues.expiresAt.getTime()).toBeGreaterThan(Date.now())
```

Two consequences:

1. **`:37` and `:59` are KNOWN_NEGATIVE fixtures for the T1 gate** (RESEARCH §4 hits 5-7 — false
   positives). The two gates this phase builds must not fight each other: `audit-policy.test.ts`'s
   own expiry assertion will be `expect(new Date(entry.expires).getTime()).toBeGreaterThan(Date.now())`,
   which is *structurally identical* to `actions.test.ts:59`. If T1's taint rule is not exactly
   RESEARCH §4:587-590 ("a clock call that is the LEFT operand of a subtraction, or a division of two
   tainted values — and NOT an addition producing a future timestamp"), the new audit gate becomes
   the new gate's own first false positive. **Cross-check this explicitly in the plan.**
2. The date assertion must use the **injected `now`** for the fixture cases and the real clock only
   for the shipped file, or the tests become time-dependent — which is precisely the class of defect
   this phase exists to remove. Say so in the header.

#### 6. Cross-file control (`:193-204`) — assert against the file a real consumer reads

```typescript
  it("agrees with .env.example, the file a self-hoster actually copies", () => {
    // A cross-file control rather than another fixture: if the shipped example is ever
    // rewritten into a form this reader cannot read, `npm run db:check-migrations` breaks
    // for every new self-hoster on their first run, and no fixture above would notice.
```

**Applied:** run `evaluatePolicy` against the **shipped `security/audit-policy.json`** (not only
fixtures) with a *synthetic* audit document, so a policy file that the evaluator cannot parse is red
in vitest rather than only in CI.

#### 7. The one assertion that must NOT be in this file

RESEARCH §6:797-799 — *"every allowlisted GHSA is still present in a live `npm audit`"* — belongs in
`scripts/audit-policy.mjs`, not here. It needs network, and the base vitest project must stay
offline-clean (`vitest.config.ts` sets `environment: 'node'`, no setup file, no network anywhere
today). Stale-entry detection is a real requirement; put it on the script side and state the split
in both headers.

---

### `security/audit-policy.json` (config, data) — the allowlist format

**Analog:** `deployment-docs-accuracy.test.ts:170-204` — the `as const` list whose **doc-comment
carries the measured reason per entry**:

```typescript
/**
 * Tokens the runbook must contain. Each is asserted individually so a failure names the missing
 * one instead of reporting "the runbook is wrong".
 *
 * `--no-owner` / `--no-privileges`: MANDATORY. Measured — restoring into a cluster whose superuser
 * is not `pipelite` without them yields 45 `ALTER … OWNER TO` errors and EXIT 1 while restoring all
 * the data correctly. That is the one outcome an operator cannot act on ... With both flags: exit 0.
 *
 * `-Fc`: 34,299,898 bytes against 121,722,344 for plain SQL, and the only format `pg_restore`'s
 * selective and `--clean` modes work with at all.
 * ...
 */
const RUNBOOK_REQUIRED_TOKENS = [
  "--no-owner",
  "--no-privileges",
  ...
] as const
```

**JSON cannot carry a doc-comment, which is the whole reason the reason moves *into* each entry** —
and why the gate must enforce its quality rather than trusting a convention. RESEARCH §6:769-784
supplies the shape; the register to match is the one above (name the call site with a `file:line`,
name the measurement, name the alternative that was rejected and why):

```json
{
  "failOn": ["critical", "high"],
  "allowlist": [
    {
      "ghsa": "GHSA-p6gq-j5cr-w38f",
      "package": "nodemailer",
      "reason": "Requires the message-level `raw` option. The single call site (src/lib/email/send.ts:29-35) passes only from/to/subject/html/text; the transport config (src/lib/email/client.ts:8-21) sets no envelope, name, list or OAuth2. Only fix is nodemailer 7 -> 9, a two-major bump excluded by the v1.4 scope.",
      "reach": "runtime",
      "expires": "2026-11-25"
    }
  ]
}
```

The `reach` field is CONTEXT's explicit *"Distinguish runtime from build/dev-only dependencies
explicitly"* requirement, and RESEARCH §5's Reach column
(`RUNTIME` / `BUILD` / `DEV`) supplies the per-advisory values for all 26 critical/high.

**JSON-parse convention:** `db-test-isolation.test.ts:110-115` and
`node-engines-floor.test.ts:121-133` — `JSON.parse(readFileSync(...))` with an inline structural
`as { … }` cast, never a regex (S3).

---

### `AUDIT-POLICY.md` (doc) — the stated policy

**Analog:** `docs/admin/backup-restore.md` in *role* (a procedure document whose content is gated by
a test) and `deployment-docs-accuracy.test.ts:369-424` in *enforcement shape*:

```typescript
describe("the runbook contains no measured anti-pattern", () => {
  const body = () => (exists(RUNBOOK_PATH) ? read(RUNBOOK_PATH) : "")
  const lines = () => body().split("\n")

  it("never narrows the dump to one schema", () => {
    const bad = lines().filter((l) => l.includes("pg_dump") && l.includes("--schema"))
    expect(bad).toEqual([])
  })
```

plus the size floor, `deployment-docs-accuracy.test.ts:98-99`:

```typescript
/** Minimum runbook size. A pointer-shaped stub cannot carry ten sections of procedure. */
const MIN_RUNBOOK_CHARS = 3000
```

⚠ `deployment-docs-accuracy.test.ts` enumerates markdown under **`docs/` only**
(`enumerateMarkdown(DOCS_DIR)`, `DOCS_DIR = "docs"` at `:68`), so a repo-root `AUDIT-POLICY.md` is
**not** covered by the existing docs sweep — but the same file already reads root files by explicit
path (`CONTRIBUTING.md`, `README.md` at `:531-532`, `.gitignore` at `:450-460`), so the precedent for
naming a root file as a `const` and asserting on it exists. If the policy doc lands at the root, its
assertions go in `audit-policy.test.ts` with a named `const AUDIT_POLICY_DOC = "AUDIT-POLICY.md"`,
not in the docs gate.

**What CONTEXT requires the doc to state, and the gate to enforce:** the three dispositions
(upgraded / replaced / accepted-with-reason), the runtime-vs-build/dev distinction, the expiry rule,
and that the gate is on the required check. A cross-reference assertion — every `ghsa` in the JSON
appears in the prose, and vice versa — is the `deployment-docs-accuracy.test.ts:426-439`
"is discoverable" pattern applied:

```typescript
describe("the runbook is discoverable", () => {
  const POINTERS = [DOCKER_GUIDE_PATH, BARE_METAL_GUIDE_PATH, ROOT_INDEX_PATH, ADMIN_INDEX_PATH] as const

  it.each(POINTERS)("%s links to backup-restore.md", (file) => {
    expect(read(file)).toContain("backup-restore.md")
  })
})
```

---

### `scripts/suite-repeatability.sh` + `scripts/diff-pass-sets.mjs`

**`suite-repeatability.sh` analog:** `scripts/dedup-db-test-setup.sh` — the only bash script in the
repo. Copy its header shape (five titled all-caps sections, measured claims), `set -euo pipefail`,
the `-> …` progress echo, hard `FATAL:` + `exit 1` on every failure path, and the terminal `OK: …`.
46-PATTERNS.md § `scripts/migrate-from-zero.mjs` §1 and §5 quote it in full; do not re-derive.

⚠ **`npm test` runs two commands** (`package.json:14`:
`vitest run && vitest run --config vitest.rsc.config.ts`), so the harness must iterate both and
produce two JSON reports per run, or the pass set omits the 8 RSC tests.
⚠ **`--reporter=json` alone suppresses console output** (RESEARCH Pitfall 11, measured during
research). Pass `--reporter=json --outputFile=… --reporter=default`.
⚠ **`npm run` reorders a child's stdout/stderr** and **`grep … | wc -l` returns a wrong count in
this environment** (36 reported as 19). Invoke `./node_modules/.bin/vitest` directly; count with
`node -e`. These are recorded project constraints, not preferences.

**`diff-pass-sets.mjs` analog:** `scripts/migrate-from-zero.mjs:1063-1080` — the repo already has the
"both empty proves nothing" reporting form at `:1072`:

```javascript
              ? "IDENTICAL (both empty — proves nothing)"
```

That is the exact string form the diff script's own anti-vacuity floor should print, and RESEARCH
§8:895-899 asks for it: exit 1 if the reference pass set is smaller than the recorded baseline
(4739 passed / 32 skipped base + 8 RSC). Plus the collection-failure case from RESEARCH §Code
Examples:1300-1304 — a file that fails to *collect* has zero `assertionResults` and would otherwise
vanish from the diff entirely.

---

### `.github/workflows/ci.yml` (config, CI)

**Analog:** itself. Six conventions, all load-bearing, and **four assertions in
`db-test-isolation.test.ts` that the new step must not trip**.

#### The step conventions (`ci.yml:103-160`)

```yaml
      - name: Install dependencies
        # Lockfile-exact and fails on a lockfile/manifest mismatch. Verified to
        # exit 0 on a clean checkout with no extra install flags.
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        # Report all three gates in one run. Without this, a job aborts at the
        # first failing step and a contributor discovers the lint failure only
        # after fixing the type error. This condition is the modern replacement
        # for always(), which also burns minutes on cancelled runs.
        if: ${{ !cancelled() }}
        run: npm run lint

      - name: Test
        if: ${{ !cancelled() }}
        run: npm test

      - name: Migration chain check
        # DEPLOY-01. Creates a throwaway database on the service above, migrates it from
        # zero with `drizzle-kit migrate` and asserts its CATALOG against
        # drizzle/meta/<last>_snapshot.json ... It never branches on the child's exit code ...
        #
        # WHAT THIS STEP PROVES, EXACTLY. ...
        #   PROVED HERE     table names (both directions), column names (both directions), ...
        #   NOT PROVED HERE column TYPES and lengths, DEFAULT expressions, foreign keys, ...
        if: ${{ !cancelled() }}
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
        run: npm run db:check-migrations
```

1. **A `name:` in Title case, one to three words** (`Install dependencies`, `Typecheck`, `Lint`,
   `Test`, `Migration chain check`). RESEARCH §7:826 proposes `Security audit policy` — consistent.
2. **`if: ${{ !cancelled() }}` on every step after `Install dependencies`.** The new step takes it,
   for the reason the `Lint` comment gives.
3. **A comment block above `run:` naming the requirement ID, what the step proves, and — crucially —
   what it does NOT prove.** The `Migration chain check` comment's `PROVED HERE / NOT PROVED HERE`
   table is the current high-water mark and directly applicable: the audit step does not audit the
   Docker image's tree (`Dockerfile:24` runs `npm install --legacy-peer-deps`, not `npm ci`, so the
   in-image tree is not lockfile-exact — RESEARCH §9). Say so in the step comment, or the step ships
   next to prose that overstates it.
4. **Every action pinned to a full commit SHA with a trailing `# vX.Y.Z`** (`:81`, `:88`; rationale
   at `:4-8`). The audit step uses no action, so no new pin.
5. **`env:` on the step, never a secret, with a comment explaining the value's origin** (`:155-159`).
   The audit step needs no env at all — say that explicitly (RESEARCH §Runtime State: "No new secret
   or env var").
6. **The job name `ci` at `:32-35` is the required-check name — do not rename it**, and the new step
   goes on **this** job (Phase 46 Route A; the `services:` header at `:39-46` argues it at length).

#### The four `db-test-isolation.test.ts` assertions the new step must satisfy

| Assertion | Location | What it means for the audit step |
|---|---|---|
| Raw `ci.yml` contains **zero** occurrences of `test:db` and `db.config`, comments included | `:354-363` | **The new step's comment block must not contain either string.** RESEARCH Pitfall 10. Naming the script `security:audit` is safe; naming it `test:db-audit` is not |
| `ci.yml` still contains `npm test`, `name: ci`, `npm run typecheck` | `:365-372` | Do not restructure; only add |
| Job `ci` declares **exactly one** service, image equal to `docker-compose.yml`'s `services.postgres.image` | `:388-409` | **Do not add a service.** The audit step needs no database |
| Every parsed step's `run:` contains neither `test:db` nor `vitest.db.config`, with `steps.length >= MIN_CI_STEPS` (`= 6`, measured 7 at `:65-75`) | `:435-455` | Adding steps is free; the floor comment says *"removing a step is loud while adding one is free"*. The new `run:` value must not contain those tokens |

Plus one shape assertion that is worth mirroring rather than tripping —
`db-test-isolation.test.ts:428-432` asserts the migration step's `if` is exactly
`"${{ !cancelled() }}"`:

```typescript
    expect(
      consumers[0].if,
      `the \`${MIGRATION_CHECK_COMMAND}\` step must carry the same \`!cancelled()\` ` +
        `condition as Lint and Test, so all gates report in a single run`
    ).toBe("${{ !cancelled() }}")
```

**Recommended:** the new `audit-policy.test.ts` makes the same assertion about the audit step, using
the same parsed-YAML readers. Copy `ciJob()` / `ciSteps()` / `stepLabel()` from
`db-test-isolation.test.ts:137-193` — parsed, never regexed, and throwing with what it *did* parse:

```typescript
function ciJob(): WorkflowJob {
  const parsed = parse(readFileSync(CI_WORKFLOW, "utf8")) as WorkflowDocument
  const job = parsed.jobs?.ci
  if (!job || typeof job !== "object") {
    throw new Error(
      `${CI_WORKFLOW}: jobs.ci is missing or is not a mapping. Parsed job names: ` +
        `${Object.keys(parsed.jobs ?? {}).join(", ") || "(none)"}. ` +
        `\`ci\` is the check-run name the master ruleset requires; if the workflow was ` +
        `restructured, re-anchor this reader rather than deleting the assertions it feeds.`
    )
  }
  return job
}

/** A short, stable label for a step in a failure message: its name, its action, or its index. */
function stepLabel(step: WorkflowStep, index: number): string {
  return step.name ?? step.uses ?? `step #${index}`
}
```

`node-engines-floor.test.ts:165-177` (`ciNodeVersion()`) is the second instance of the same reader
pattern, including the "expected exactly one … found N; re-anchor rather than delete" throw. Two
independent files already read `ci.yml` as parsed YAML; a third is house style, not duplication.

⚠ **`npm audit signatures` as a second step** (CONTEXT decided: yes, despite ~+102 s). It is a
separate step with its own `name:` and its own `if: ${{ !cancelled() }}`, and its comment should
record the measured 1104/1104 signatures + 169 attestations and the ~95 s → ~200 s job-time cost, in
the register `ci.yml:16-19` uses for the "there is nothing worth optimising away" argument.

---

### `package.json` (config)

**Analog:** its own `scripts` block, `package.json:8-24`, with `db:check-migrations` as the direct
precedent (a Phase 46 addition invoking a `.mjs` with bare `node`):

```json
  "scripts": {
    "test": "vitest run && vitest run --config vitest.rsc.config.ts",
    "test:db": "bash scripts/dedup-db-test-setup.sh && vitest run --config vitest.db.config.ts",
    "db:generate": "drizzle-kit generate",
    "db:check-migrations": "node scripts/migrate-from-zero.mjs",
    "db:seed-activities": "tsx drizzle/seed-activity-types.ts"
  },
```

Three conventions: a `<namespace>:<verb>` name, `node scripts/<file>.mjs` for `.mjs` and
`bash scripts/<file>.sh &&` for bash (`test:db`), and **no `pre*`/`post*` hooks anywhere**.

**New scripts:** `"security:audit": "node scripts/audit-policy.mjs"` and (if scripted)
`"test:repeatability": "bash scripts/suite-repeatability.sh"`.

⚠ `db-test-isolation.test.ts:341-351` iterates **every** script asserting none but `test:db` contains
`test:db` or `db.config`:

```typescript
  it("no other script chains the db project into a broader one", () => {
    // `test:watch`, `test:e2e` and any future aggregate must stay clear of it too ...
    const scripts = packageScripts()
    for (const [name, body] of Object.entries(scripts)) {
      if (name === "test:db") continue
      expect(body, `script "${name}" reaches the db vitest project`).not.toContain("test:db")
      expect(body, `script "${name}" reaches the db vitest project`).not.toContain("db.config")
    }
  })
```

A script *named* `test:repeatability` is fine (the assertion is on the **body**, not the name), but
its body must not name `test:db` or `db.config`. Prefer `suite:repeatability` to remove all doubt.

⚠ `db-test-isolation.test.ts:314-327` asserts the `test` script still contains `vitest run` and
`vitest.rsc.config.ts` and contains none of the three db tokens. **Do not chain the audit or the
repeatability harness into `test`.**

`devDependencies` is alphabetically sorted (`:69-87`) — but this phase adds **zero new packages**
(CONTEXT, RESEARCH §6). The only `package.json` dependency edits are the §5 version bumps, each done
with a targeted `npm install <pkg>@<ver>`, never `npm audit fix`.

---

### `src/lib/mutations/__tests__/db-test-isolation.test.ts` (MODIFY — optional, one constant)

`MIN_CI_STEPS = 6` at `:65-75`, with the measured comment:

```typescript
/**
 * The workflow declares at least this many steps today. Measured: 7 — checkout, setup-node,
 * install, typecheck, lint, test, migration check. The floor sits one below the measurement,
 * so removing a step is loud while adding one is free.
 * ...
 */
const MIN_CI_STEPS = 6
```

After this phase the measurement becomes 8 or 9. The floor need not move (the comment says adding is
free), **but the measured number in the doc-comment goes stale** — which is the Pitfall-9 /
`dedup-db-test-setup.sh:21-30` shape Phase 46 was burned by. Update the comment's enumeration in the
same commit as the `ci.yml` edit, or leave the floor and the prose in disagreement.

**No other change is required here.** `audit-policy.mjs` issues no DDL, so it does **not** join
`DESTRUCTIVE_SCAN_SUBJECTS` (`:225-242`) — that list is scoped to scripts that create and drop
databases.

---

## Shared Patterns

### S1 — Anti-vacuity, **five** forms (Phase 46 added two to the three 46-PATTERNS listed)

| Form | Canonical source | Apply to |
|---|---|---|
| **(a)** Named `MIN_*` floor constant, measured number in the doc-comment, floor set *below* the measurement, asserted in its own `it` before the check it protects | `node-engines-floor.test.ts:76-86` + `:247-278`; `migrate-from-zero.mjs:110-133` | `expect()` calls ≥ 7000, hooks ≥ 140, test files ≥ 150, advisories parsed ≥ 20, packages audited ≥ 1000, pass-set size ≥ 4739 |
| **(b)** Matcher self-tests against KNOWN_POSITIVE / KNOWN_NEGATIVE `as const` fixtures **before** the sweep, via `it.each`, asserting the *extracted value* not just a boolean | `node-engines-floor.test.ts:203-241`; `deployment-docs-accuracy.test.ts:267-304`, `:558-591` | both AST sweeps; the GHSA pattern; the reason validator |
| **(c)** Known-present positive anchor beside every negative assertion | `db-test-isolation.test.ts:314-327`, `:365-372`, `:411-433` | T1/T2 ("the sweep still finds clock calls / hook imports somewhere"); the policy gate ("`failOn` still equals `["critical","high"]`") |
| **(d) ⭐ FLOOR THE TOKEN, NOT JUST THE COUNT (WR-11)** | `db-test-isolation.test.ts:579-605` | every negative built on a named identifier or a matched token |
| **(e) ⭐ THE GATE MUST NOT COLLIDE WITH ITSELF** | `no-standing-suppressions.test.ts:19-25`, `:147-153` | `suite-timing-hygiene.test.ts` — it sweeps `src/**/*.test.ts` and *is* one |
| **(f)** An exclusion list is a **live control**, not a comment: assert the excluded items still exhibit the excluded property, and assert the lists are disjoint | `deployment-docs-accuracy.test.ts:537-556` + `:692-700` + `:593-600` | the four `vi.resetModules()` files; the two `*-live` files; the audit allowlist |

**S1(d) in full — the pattern the orchestrator asked for, and the strongest new thing in the tree.**
`db-test-isolation.test.ts:557-605` is two floors, one per `it.each`, and the second one is the WR-11
lesson made executable:

```typescript
  it.each(DESTRUCTIVE_SCAN_SUBJECTS)(
    "$path really contains destructive statements outside its comments — the scan's floor",
    ({ path, comments }) => {
      // ANTI-VACUITY, and the half the original scan lacked. A negative asserted over a
      // file with no destructive statements at all is satisfied by having nothing to
      // check; so is a negative asserted over the output of a comment stripper that
      // blanked every line. Both are indistinguishable from a passing gate. This floor
      // fails in either case. ...
      const source = readFileSync(path, "utf8")
      expect(source.length, `${path} is empty — the scan has no input`).toBeGreaterThan(500)

      const hits = codeLines(source, comments).filter((code) => DESTRUCTIVE_STATEMENT.test(code))
      expect(
        hits.length,
        `${path} yielded no destructive statement on any non-comment line. Either the ` +
          `script stopped issuing DDL (in which case delete it from this scan deliberately) ` +
          `or the ${comments} comment stripper is blanking real code.`
      ).toBeGreaterThan(0)
    }
  )

  it.each(DESTRUCTIVE_SCAN_SUBJECTS)(
    "$path really names $label outside its comments — the OTHER half of the floor",
    ({ path, comments, protectedToken, label }) => {
      // THE SECOND HALF, and the one the floor above does not cover. The floor above proves
      // the file contains destructive statements. Nothing proved the file contains the
      // PROTECTED TOKEN, and the negative below is `code.not.toMatch(protectedToken)` — a
      // matcher that matches nothing satisfies it on every line.
      //
      // So renaming `REFERENCE_DB` in scripts/migrate-from-zero.mjs (or refactoring it to
      // `reference.name`, which that script already uses) would turn this whole `describe`
      // permanently green *because* it stopped working — the exact anti-gate shape this
      // milestone exists to eliminate. Measured: with the identifier renamed, the negative
      // below passes 0 → 0 and reports success. ...
      //
      // If this went red, the identifier moved. Re-anchor `protectedToken` onto whatever the
      // script now calls the database it may only read — do NOT delete the subject.
      const tokenHits = codeLines(readFileSync(path, "utf8"), comments).filter((code) =>
        protectedToken.test(code)
      )
      expect(
        tokenHits.length,
        `${path} never names ${label} on a non-comment line, so the negative below matches ` +
          `nothing and passes vacuously. The identifier was almost certainly renamed: ` +
          `re-anchor protectedToken (${protectedToken}) onto its new name.`
      ).toBeGreaterThan(0)
    }
  )
```

**How the new AST gates express both halves:**

| Gate | Count floor (a) | Token floor (d) |
|---|---|---|
| T1 (no elapsed delta/ratio) | ≥ 7000 `expect()` `CallExpression`s parsed across ≥ 150 files | the clock-call detector still finds `Date.now` / `performance.now` call expressions in the corpus (≥ N, measured after the condition-evaluator edit — see the ⚠ above) **and** the taint pass still flags the three KNOWN_POSITIVE fixtures |
| T2 (no hook-scoped dynamic import) | ≥ 140 hook `CallExpression`s parsed | the hook detector still finds `import()` inside a hook in the four carved-out files (currently 4 hits — the live control from S1(f)) |
| audit policy | ≥ 20 advisories / ≥ 1000 packages in the parsed `npm audit --json` | `failOn` still `toEqual(["critical","high"])`; `FORBIDDEN_REASONS` asserted **by value** |

The T2 token floor and the S1(f) carve-out control are the **same assertion**, which is the point: an
exclusion that is also a floor cannot rot in either direction.

### S2 — Static-gate skeleton (applies to both new test files)

**Source:** `node-engines-floor.test.ts:62-107`, `deployment-docs-accuracy.test.ts:61-76`

```typescript
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"
import semver from "semver"
import { parse } from "yaml"

const REPO_ROOT = process.cwd()

const PACKAGE_JSON = "package.json"
const PACKAGE_LOCK = "package-lock.json"
const DOCKERFILE_PATH = "Dockerfile"
const CI_WORKFLOW = ".github/workflows/ci.yml"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

const dockerfileRaw = readRepoFile(DOCKERFILE_PATH)
const packageRaw = readRepoFile(PACKAGE_JSON)
```

- Node builtins first, blank line, then `vitest` + third-party. No `@/` alias in infra gates (the one
  exception is `db-test-isolation.test.ts:52`, importing `readStrippedSource`).
- Subjects read at **module scope** into `const`s, so a missing file fails collection loudly.
- Files live in the **base** vitest project (`vitest.config.ts` include
  `src/**/*.{test,spec}.?(c|m)[jt]s?(x)`). Do **not** name them `*.db.test.ts` / `*.rsc.test.ts` —
  both globs are excluded and the file would never run in CI.
- Helpers that a test also drives are `export`ed (`node-engines-floor.test.ts:121`, `:136`, `:149`,
  `:166`) — that is how the fixtures reach the same code path the sweep uses.

### S3 — Parse, never regex, when a parser exists

**Source:** `db-test-isolation.test.ts:137-146` (the rule, applied to YAML);
`compose-uploads-persistence.test.ts:26-31` (the rule, in prose)

```typescript
/**
 * The `ci` job, PARSED — never regexed.
 *
 * S3, and the same rule `compose-uploads-persistence.test.ts:26-31` states in prose:
 * indentation is exactly what decides whether a `services:` key belongs to the `ci` job
 * or to the document, and a regex over YAML happily "passes" on a malformed file. It
 * throws with the job names it actually parsed ... rather than returning `undefined`
 * into an assertion that would then compare two undefineds and pass.
 */
```

**Apply to:** `ci.yml` → `yaml.parse`; `package.json` / `package-lock.json` /
`security/audit-policy.json` / `npm audit --json` → `JSON.parse`; **TypeScript source →
`ts.createSourceFile`** (this phase's first use, and the whole reason the AST gates exist rather than
greps — RESEARCH §Don't Hand-Roll:1172 records the measured false positive a regex produced at
`sentry.test.ts:185`).

### S4 — Comment-blind vs raw reads: choose deliberately, and **prove the choice**

**Source:** `db-test-isolation.test.ts:77-85`, `:355-358`;
`no-standing-suppressions.test.ts:1-13`, `:147-153`

The default is comment-blind (`readStrippedSource` from
`src/components/custom-fields/__tests__/source-scan.ts`), because a doc-comment spelling out the
asserted token makes a gate self-satisfying. Both exceptions in the tree state their reason inline:

```typescript
  // Read RAW, comments included, deliberately: the assertion is ZERO OCCURRENCES ANYWHERE
  // in the workflow. A commented-out `run: npm run test:db` is a line one edit away from
  // being live, and this gate should fail while it is still a comment.
  const workflow = readFileSync(CI_WORKFLOW, "utf8")
```

…and `no-standing-suppressions.test.ts:147-153` goes further — it **asserts the read was raw**:

```typescript
  it("reads raw source, not comment-stripped source", () => {
    // THE LOAD-BEARING ASSERTION OF THIS WHOLE FILE. The needle only ever appears inside a comment,
    // so if this read is ever routed through the house comment-stripping reader, every count below
    // collapses to zero and the gate passes vacuously forever. This is what goes red first.
    expect(RAW.get(RAW_READ_PROOF_PATH) ?? "").toContain(NEEDLE)
  })
```

**Applies to the AST gates in an inverted form.** An AST parse is *inherently* comment-blind for
`CallExpression` matching — a commented-out `await import()` in a hook is invisible to it. That is
the correct behaviour for T1/T2, but it must be **stated**, because the raw-scan gates in this repo
assert the opposite invariant. Say in the header: *this gate parses, so a commented-out violation is
deliberately not a hit; the raw negatives in `db-test-isolation.test.ts` are what cover that case.*
`db-test-isolation.test.ts:374-386` already makes exactly this argument for keeping both forms:

```typescript
  // These read PARSED `run:` values, not raw text, so unlike the two raw scans above a
  // comment in the workflow cannot collide with them — and equally, a commented-out step
  // cannot satisfy them. The raw negatives are what cover the commented-out case; that is
  // why both forms are kept.
```

### S5 — Relational assertions over literals; read the fact from the file that owns it

**Source:** `node-engines-floor.test.ts:364-408`; `db-test-isolation.test.ts:175-193`, `:388-409`

```typescript
/**
 * The Postgres image `docker-compose.yml` pins.
 *
 * Read from the file rather than written here as a literal (S6): the workflow's service
 * image and the compose pin are asserted RELATIONALLY, so a tag typed into one file and
 * not the other is a failure rather than a silent divergence ...
 */
function composePostgresImage(): string { /* ... */ }
```

**Apply to:** the allowlist's GHSA ids (read from `via[].url`, never typed twice); the policy prose
and the policy JSON (assert cross-reference, do not duplicate); the `security:audit` script name
(read from `package.json` and assert the `ci.yml` step runs *that* value, rather than typing the
command in two files).

### S6 — On a raw-text-scan collision, reword the prose; never weaken the assertion

**Source:** `compose-uploads-persistence.test.ts:299-306`, restated in RESEARCH §Project Constraints

**High collision risk this phase:** every new gate header, the audit policy prose, and the new
`ci.yml` step comment necessarily *name* `test:db`, `db.config`, `services:`, `postgres`,
`Date.now`, `await import` and `beforeEach` — which are exactly the literals the amended
`db-test-isolation.test.ts` and the new T1/T2 sweeps scan for. Concretely:

- the `ci.yml` audit-step comment must not contain `test:db` or `db.config`
  (`db-test-isolation.test.ts:360-363`, raw scan);
- `suite-timing-hygiene.test.ts`'s own header explaining the defect will contain the words
  `beforeEach` and `await import` — harmless for an AST parse (S4), fatal for a grep. This is a
  second, independent reason the gate must parse rather than grep.

### S7 — Cross-file changes ship in ONE commit, with the gate that binds them

**Source:** `compose-uploads-persistence.test.ts:1-40`

Two clusters this phase:
1. `condition-evaluator.ts` (export) + `condition-evaluator.test.ts` (replacement) +
   `suite-timing-hygiene.test.ts` (the T1 gate that would flag the old assertion) — each partial
   state is green for the wrong reason.
2. `package.json` (`security:audit`) + `scripts/audit-policy.mjs` + `security/audit-policy.json` +
   the policy doc + `ci.yml` + `audit-policy.test.ts` — a script with no policy file, or a policy
   file with no CI step, is a stated intention rather than a gate.

### S8 — Sequence the negative controls green → red → green

**Source:** RESEARCH §7:863-866, and the in-repo precedent that a control must *distinguish* both
cases (`node-engines-floor.test.ts:332-336`).

Every negative control in this phase (A–E) needs its complement observed and recorded, not just its
red. Pitfall 7 is the specific trap: the audit gate must be **green on the fixed tree** before
`minimist@1.2.5` is added, or the red proves only that it was already red.

---

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|---|---|---|---|
| **The TypeScript AST parse itself** (`ts.createSourceFile`, `ts.forEachChild`, `ts.SyntaxKind`, `getLineAndCharacterOfPosition`) | test | file-I/O → parse | **Zero precedent in this repository.** `typescript` is a devDependency used only by `tsc --noEmit`; no `.ts`, `.tsx` or `.mjs` outside `node_modules` imports it. There is no shared AST helper, no source-file enumerator built for parsing, and no established convention for reporting an AST node's `file:line`. RESEARCH §Code Examples:1307-1325 supplies the visitor verbatim (`/tmp/p47/scan-hooks.mjs`, 175 files / 151 hooks / 13 hits / 0 false positives) and §4:563-574 supplies the taint variant (`/tmp/p47/scan-timing2.mjs`, 8060 `expect()` calls). **Copy those, and wrap them in this document's S1/S2 frame.** The `file:line` output shape has an analog (`deployment-docs-accuracy.test.ts:239-261`); the parse does not. |
| **A date/expiry comparison inside a static gate** | test | — | No gate in the repo compares a date to `now`. The only future-date assertions are `src/app/admin/users/actions.test.ts:37` and `:59`, which are runtime-value assertions in a behavioural test — and both are RESEARCH §4 KNOWN_NEGATIVE fixtures for the very gate this phase builds. Design the expiry check with an **injected clock** (`evaluatePolicy(audit, policy, now)`) so the fixtures are deterministic, and cross-check the shape against T1's taint rule so the two new gates do not fight. |
| **A repo-root policy document** | doc | — | No `SECURITY.md`, no `security/`, no root policy doc of any kind. `CONTRIBUTING.md` and `README.md` are the only root markdown files; both are read by `deployment-docs-accuracy.test.ts` **by explicit path**, not by the `docs/` walk. There is a precedent for gating a root file, none for authoring a policy at the root. Also ⚠ CONTEXT (repo root) vs RESEARCH (`security/`) — decide explicitly. |
| **A multi-run suite harness in bash** | script | batch | `scripts/dedup-db-test-setup.sh` is the only bash script and it provisions a database; it does not loop, does not accumulate artefacts, and does not diff runs. Its header/fence/report shape transfers; its body does not. RESEARCH §8 supplies `/tmp/p47/ten-runs.sh` and `/tmp/p47/diff-passsets.mjs`, both already exercised on this tree. |
| **A `Proxy` over a boxed `String`** (the counting facade) | test helper | transform | No `new Proxy` anywhere in `src/` for this purpose. RESEARCH §Architecture Pattern 1:1106-1135 supplies it in full, measured. The *assertion* shape around it (FLOOR / CEILING / FLATNESS, aggregate-not-per-path) has an analog in `node-engines-floor.test.ts`'s NC-3 pairs; the facade itself does not. |

---

## Metadata

**Analog search scope:** `src/lib/__tests__/`, `src/lib/mutations/__tests__/`, `src/types/__tests__/`,
`src/lib/execution/` + `src/lib/execution/actions/__tests__/`, `src/components/custom-fields/__tests__/`,
`src/app/**/*.test.ts`, `src/lib/observability/`, `scripts/`, repo root config
(`package.json`, `vitest*.config.ts`, `.github/workflows/ci.yml`), plus repo-wide greps for
`typescript` imports, `vi.resetModules()`, `expires`/date comparisons, and `createSourceFile`.
**Files scanned:** ~45 enumerated, 19 read in full or in targeted non-overlapping ranges
**Pattern extraction date:** 2026-08-25
