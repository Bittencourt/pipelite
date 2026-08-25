# Phase 46: Migration Chain & Toolchain Floor - Pattern Map

**Mapped:** 2026-08-24
**Files analyzed:** 13 (4 created, 9 modified)
**Analogs found:** 12 / 13 (1 partial — no in-repo Node operational script exists)

> Sources read for this map: `src/lib/__tests__/compose-uploads-persistence.test.ts` (345 lines),
> `src/lib/__tests__/deployment-docs-accuracy.test.ts` (460), `src/lib/mutations/__tests__/db-test-isolation.test.ts` (246),
> `src/types/__tests__/no-standing-suppressions.test.ts` (1-200), `scripts/dedup-db-test-setup.sh` (158),
> `e2e/seed-admin.ts` (1-100), `src/components/custom-fields/__tests__/source-scan.ts`,
> `vitest.config.ts`, `vitest.db.config.ts`, `docker-compose.yml`, `Dockerfile`, `.env.example`,
> `.github/workflows/ci.yml`, `package.json`, `drizzle.config.ts`, `src/db/index.ts`,
> `drizzle/0006_import-sessions-user-id.sql`, `drizzle/0013_parched_redwing.sql`, `drizzle/meta/_journal.json`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **NEW** `src/lib/__tests__/migration-chain-integrity.test.ts` | test (static infra gate) | file-I/O → transform | `src/lib/__tests__/deployment-docs-accuracy.test.ts` (matcher self-test + enumeration floor) | **exact** |
| **NEW** `src/lib/__tests__/node-engines-floor.test.ts` | test (static infra gate) | file-I/O → transform | `src/lib/__tests__/compose-uploads-persistence.test.ts` (Dockerfile line-scan + `${VAR}` floor) + `db-test-isolation.test.ts:69-74` (JSON.parse of package.json) | **exact** |
| **NEW** `scripts/migrate-from-zero.mjs` | operational script | batch / DDL + catalog read | `scripts/dedup-db-test-setup.sh` (structure, fences, report-and-fail) + `e2e/seed-admin.ts` (postgres driver, guard, `finally` cleanup) | **role-match** (language differs — see § No Analog Found) |
| **NEW** (none — the DDL lands in an existing file) `drizzle/` SQL edit | migration | DDL | `drizzle/0013_parched_redwing.sql:1-12` (drizzle-kit 0.31 emitted formatting) | **exact** |
| **MOD** `drizzle/0006_import-sessions-user-id.sql` | migration | DDL | same as above | **exact** |
| **MOD** `Dockerfile` (3 × `FROM node:`) | config | — | itself (`:2`, `:10`, `:74`) | **exact** |
| **MOD** `.env.example` | config | — | `.env.example:4-9` (its own host/container comment) + `docker-compose.yml:18-35` (comment style) | **exact** |
| **MOD** `docker-compose.yml` | config | — | `docker-compose.yml:25-36` (`UPLOAD_DIR` hardcode-with-rationale block) | **exact** |
| **MOD** `package.json` (`engines`, `db:check-migrations`, `semver` devDep) | config | — | `package.json:5-19` scripts block; `test:db` is the `bash scripts/… && …` precedent | **exact** |
| **MOD** `src/lib/__tests__/compose-uploads-persistence.test.ts:207-212` | test | file-I/O | itself | **self** |
| **MOD** `src/lib/mutations/__tests__/db-test-isolation.test.ts:117-143` | test | file-I/O | itself + `:76-115` (the script-scan style it should adopt) | **self** |
| **MOD** `src/lib/__tests__/deployment-docs-accuracy.test.ts` | test | file-I/O | itself (`:191-204` token list, `:239-261` scanners) | **self** |
| **MOD** `.github/workflows/ci.yml` | config (CI) | — | itself (`:39-75` step style, SHA pins, `if: ${{ !cancelled() }}`) | **exact** |
| **MOD** `scripts/dedup-db-test-setup.sh:21-30` (comment only) | script (doc) | — | itself | **self** |

---

## Pattern Assignments

### `src/lib/__tests__/migration-chain-integrity.test.ts` (test, static infra gate) — GATE A

**Primary analog:** `src/lib/__tests__/deployment-docs-accuracy.test.ts`
**Secondary analog:** `src/lib/__tests__/compose-uploads-persistence.test.ts`

#### 1. File header — the "why this gate exists / do not weaken it" essay is MANDATORY house style

Every static infra gate in this repo opens with a block comment naming the defect it prevents, the
measured evidence, and an explicit instruction to fix the subject rather than the assertion. Copy the
shape from `deployment-docs-accuracy.test.ts:1-59`:

```typescript
/**
 * THE DEPLOYMENT-DOCS ACCURACY GATE.
 *
 * ...
 * ── WHY THE MATCHER UNIT-TESTS ITSELF, FIRST ──────────────────────────────────────────────────
 *
 * Phase 42 shipped roughly ten acceptance-criteria gates that COULD NOT FAIL. The most expensive
 * was a grep whose bracket expression was malformed: it matched nothing, therefore satisfied every
 * negative assertion built on it, therefore "passed" on an empty diff. Six executors diagnosed
 * downstream symptoms before one root-caused the regex. A matcher that matches nothing is not a
 * weak gate, it is an ANTI-gate — it reports success as a direct consequence of being broken.
 *
 * The countermeasure is the `describe` block below, which runs BEFORE the scan and proves the
 * matcher against three known-positive and three known-negative fixtures. ...
 *
 * If you are adding a document and this went red, fix the document.
 */
```

#### 2. Imports + repo-root file location (`deployment-docs-accuracy.test.ts:61-76`)

`process.cwd()` + `path.join`, with every subject path hoisted to a named `const`. Never a relative
`../../..` walk.

```typescript
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()

const DOCS_DIR = "docs"
const RUNBOOK_PATH = "docs/admin/backup-restore.md"
```

Identical convention at `compose-uploads-persistence.test.ts:41-57`:

```typescript
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"
import { parse } from "yaml"

const REPO_ROOT = process.cwd()

const COMPOSE_PATH = "docker-compose.yml"
const DOCKERFILE_PATH = "Dockerfile"
const ENV_EXAMPLE_PATH = ".env.example"
```

**For this file:** `const DRIZZLE_DIR = "drizzle"`, `const JOURNAL_PATH = "drizzle/meta/_journal.json"`.
The reader helper is verbatim `compose-uploads-persistence.test.ts:77-79`:

```typescript
function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}
```

#### 3. ANTI-VACUITY — this is the pattern the planner must not let the executor skip

Three distinct in-repo forms exist. **Use all three in this file.**

**(a) A named floor constant with the reason written into it** — `compose-uploads-persistence.test.ts:59-64`:

```typescript
/**
 * The compose file interpolates at least this many `${VAR}` references today. The floor exists so
 * a broken `${VAR}` regex cannot produce an empty set and make the `.env.example` subset check
 * trivially true.
 */
const MIN_COMPOSE_VARS = 12
```

…asserted in its own `it`, in its own `describe`, BEFORE the assertion it protects
(`compose-uploads-persistence.test.ts:319-336`):

```typescript
describe("uploads persistence: .env.example is level with what compose requires", () => {
  it("references enough ${VAR}s for the subset check below to mean something (anti-vacuity)", () => {
    // Without this floor, a broken regex yields an empty set and the subset assertion passes
    // vacuously — the exact shape of the phase-42 gate that could not fail.
    expect(composeRequiredVars().size).toBeGreaterThanOrEqual(MIN_COMPOSE_VARS)
  })

  it("declares every ${VAR} docker-compose.yml interpolates", () => {
    const required = composeRequiredVars()
    const documented = envExampleKeys()
    const missing = [...required].filter((name) => !documented.has(name)).sort()
    expect(
      missing,
      `docker-compose.yml requires variables absent from .env.example: ${missing.join(", ")}. ` +
        `An operator who copies .env.example cannot bring the stack up at all, ...`
    ).toEqual([])
  })
})
```

**RESEARCH §Pattern 2 pins the three floors this file needs:** journal entries ≥ 20, `CREATE TABLE`
matches ≥ 34 (exactly 34 today, 36 after the fix), snapshot tables ≥ 36. Encode each as a named
constant with the measured number in its doc-comment, exactly as `MIN_COMPOSE_VARS` does.

**(b) The matcher unit-tests itself against fixtures FIRST** — `deployment-docs-accuracy.test.ts:267-304`.
This is the strongest form and it is directly applicable: the `CREATE TABLE` / `ALTER TABLE` /
`REFERENCES` matchers are regexes over SQL.

```typescript
describe("the phantom-service matcher, unit-tested against fixtures FIRST", () => {
  /**
   * These six assertions gate everything below them. A regex that matches nothing satisfies every
   * negative assertion in this file, which is exactly how phase 42 shipped ten gates that could
   * not fail. If any of these six is red, treat every "pass" further down as unproven.
   */
  const KNOWN_POSITIVE = [
    "docker compose exec db pg_dump -U pipelite pipelite > backup_$(date +%Y%m%d).sql",
    "docker compose logs db",
    // The real defect that was at docker.md:279. The `-T` between `exec` and the service is the
    // whole reason this matcher tolerates flags in that position — `/exec\s+db/` misses this line.
    "docker compose exec -T db psql -U pipelite pipelite",
  ] as const

  const KNOWN_NEGATIVE = [
    "docker compose exec -T postgres pg_dump -U pipelite -Fc pipelite",
    "  db: {",
    "docker compose logs postgres",
  ] as const

  it.each(KNOWN_POSITIVE)("MUST match a broken invocation: %s", (fixture) => {
    expect(PHANTOM_SERVICE_RE.test(fixture)).toBe(true)
  })

  it.each(KNOWN_NEGATIVE)("MUST NOT match: %s", (fixture) => {
    expect(PHANTOM_SERVICE_RE.test(fixture)).toBe(false)
  })
})
```

**Fixtures this file's `CREATE TABLE` matcher should be proved against** (drawn from real chain text):
positive — `CREATE TABLE "notes" (` (`drizzle/0013_parched_redwing.sql:1`); negative —
`CREATE INDEX "webhook_deliveries_status_next_attempt_idx" ON "webhook_deliveries" …` and
`ALTER TABLE "import_sessions" ADD COLUMN "user_id" text;` (`drizzle/0006_…sql:1`), neither of which
may be counted as a create.

**(c) A "the enumeration reached real files" describe block** — `deployment-docs-accuracy.test.ts:310-332`:

```typescript
describe("the docs enumeration is not vacuous", () => {
  const files = enumerateMarkdown(DOCS_DIR)

  it(`enumerates at least ${MIN_MARKDOWN_FILES} markdown files under docs/`, () => {
    // Recorded deliberately: a count is the cheapest possible evidence that the walk ran.
    expect(files.length).toBeGreaterThanOrEqual(MIN_MARKDOWN_FILES)
  })

  it("enumerates no empty file", () => {
    const empty = files.filter((f) => read(f).trim().length === 0)
    expect(empty).toEqual([])
  })

  it.each(REQUIRED_IN_ENUMERATION)("enumerates %s by name", (required) => {
    expect(files).toContain(required)
  })
})
```

…backed by a named-file list, `deployment-docs-accuracy.test.ts:77-96`:

```typescript
/**
 * The six files whose presence in the enumeration is asserted by name. A glob that silently
 * resolved to the wrong directory would still enumerate SOMETHING; naming the files the
 * assertions are actually about is what makes the enumeration verifiable.
 */
const REQUIRED_IN_ENUMERATION = [ /* ... */ ] as const

/**
 * Floor on the enumerated markdown count. 40 files exist today; 20 is a deliberately loose floor
 * that still fails hard if the walk breaks, resolves to an empty directory, or stops recursing
 * into subdirectories. A scanner that visits nothing passes every negative assertion below.
 */
const MIN_MARKDOWN_FILES = 20
```

**For this file:** name `0006_import-sessions-user-id` and `0019_concerned_runaways` in the
journal-tag equivalent of `REQUIRED_IN_ENUMERATION`, so a wrong `drizzle/` path constant is red.

#### 4. Parsing pattern — JSON via `JSON.parse`, never regex

`db-test-isolation.test.ts:69-74` is the in-repo JSON-parse-a-repo-file analog (applies to
`_journal.json` and `*_snapshot.json`):

```typescript
function packageScripts(): Record<string, string> {
  const parsed = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
    scripts?: Record<string, string>
  }
  return parsed.scripts ?? {}
}
```

`compose-uploads-persistence.test.ts:66-75` shows the interface-declaration style for a parsed
structure (mirror this for the journal and snapshot shapes):

```typescript
interface ComposeService {
  environment?: unknown
  volumes?: unknown
  healthcheck?: unknown
}

interface ComposeDocument {
  services?: Record<string, ComposeService | undefined>
  volumes?: Record<string, unknown>
}
```

#### 5. Failure-message pattern — a throw that names what it saw

`compose-uploads-persistence.test.ts:86-95` (structural accessor that fails loudly rather than
returning `undefined`):

```typescript
function service(name: string): ComposeService {
  const found = compose.services?.[name]
  if (!found || typeof found !== "object") {
    throw new Error(
      `${COMPOSE_PATH}: services.${name} is missing or is not a mapping. ` +
        `Parsed service names: ${Object.keys(compose.services ?? {}).join(", ") || "(none)"}`
    )
  }
  return found
}
```

And the second-argument message form on `expect` (`compose-uploads-persistence.test.ts:236-240`):

```typescript
expect(
  matching.map((entry) => entry.raw),
  `expected exactly one services.app volume mounted at ${uploadDir}; ` +
    `saw: ${appVolumeEntries().map((entry) => entry.raw).join(", ") || "(no volumes block)"}`
).toHaveLength(1)
```

#### 6. `file:line` hit-collector for a chain-order violation report

`deployment-docs-accuracy.test.ts:239-261` — copy both scanners verbatim in shape; report the
offender rather than a bare boolean:

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

…asserted as `expect(hits).toEqual([])` (`:344`), not `expect(hits.length).toBe(0)` — the array form
prints the offending lines on failure.

---

### `src/lib/__tests__/node-engines-floor.test.ts` (test, static infra gate) — GATE C

**Primary analog:** `src/lib/__tests__/compose-uploads-persistence.test.ts` (Dockerfile line scanning)
**Secondary analog:** `src/lib/mutations/__tests__/db-test-isolation.test.ts` (package.json JSON parse)

#### 1. Dockerfile scanning — line-array + `findIndex`, and slice by stage when stage matters

`compose-uploads-persistence.test.ts:146-176` is the only in-repo Dockerfile parser. Note that it
slices to the runner stage *because ordering matters there*; GATE C wants the opposite (all three
stages), so copy the `dockerfileRaw.split("\n")` + regex-over-lines mechanics, not the slice:

```typescript
/**
 * The runner stage: everything from the LAST `FROM ... AS runner` line to the end of the file.
 * Slicing at the runner stage is what stops a builder-stage chown from satisfying the ordering
 * assertions — the builder image is discarded and its ownership never reaches the volume.
 */
function runnerStage(): { offset: number; lines: string[] } {
  const lines = dockerfileRaw.split("\n")
  let start = -1
  lines.forEach((line, index) => {
    if (/^\s*FROM\s/.test(line) && /\bAS\s+runner\b/i.test(line)) start = index
  })
  if (start === -1) {
    throw new Error(`${DOCKERFILE_PATH}: no \`FROM ... AS runner\` line found`)
  }
  return { offset: start, lines: lines.slice(start) }
}
```

The `matchAll` + dedup-into-a-Set idiom for "every occurrence of X in a raw file" is at
`compose-uploads-persistence.test.ts:178-185` — this is the exact shape RESEARCH §Code Examples 6
prescribes for `FROM node:<tag>`:

```typescript
/** Every `${VAR}` docker-compose.yml interpolates, deduplicated. */
function composeRequiredVars(): Set<string> {
  const found = new Set<string>()
  for (const match of composeRaw.matchAll(/\$\{([A-Z0-9_]+)/g)) {
    found.add(match[1])
  }
  return found
}
```

**Subject today** (`Dockerfile:2`, `:10`, `:74` — read in this session):

```dockerfile
FROM node:20-alpine AS deps      # :2
FROM node:20-alpine AS builder   # :10
FROM node:20-alpine AS runner    # :74
```

Anti-vacuity per RESEARCH: `expect(tags).toHaveLength(3)` **and** `expect(new Set(tags).size).toBe(1)`.

#### 2. package.json reading — same `JSON.parse` helper as `db-test-isolation.test.ts:69-74`

Extend it for `engines`:

```typescript
function packageScripts(): Record<string, string> {
  const parsed = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
    scripts?: Record<string, string>
  }
  return parsed.scripts ?? {}
}
```

`package.json` has **no `engines` field today** (verified this session, `package.json:1-19` is
`name`/`version`/`private`/`scripts`). The new field goes between `private` and `scripts`.

#### 3. The permanent in-file negative control (NC-3)

There is one in-repo precedent for "assert the checker can produce a red" — the KNOWN_POSITIVE
fixtures at `deployment-docs-accuracy.test.ts:293-295`. NC-3 is the same idea applied to a function
rather than a regex:

```typescript
it.each(KNOWN_POSITIVE)("MUST match a broken invocation: %s", (fixture) => {
  expect(PHANTOM_SERVICE_RE.test(fixture)).toBe(true)
})
```

**Applied:** `expect(nodeFloorViolations("20.20.2").map(v => v.pkg)).toEqual(["@napi-rs/lzma-linux-x64-gnu"])`
plus the `>= 800` range-count floor from RESEARCH §Code Examples 5. Write the measured numbers into
the doc-comment the way `MIN_MARKDOWN_FILES` does.

#### 4. Never silently pass when Docker is absent

No in-repo analog exists for a conditionally-skipped gate. The closest in-spirit precedent is
`deployment-docs-accuracy.test.ts:413-419`, a conditional assertion that is *narrower* rather than
skipped:

```typescript
it("never uses --clean without --if-exists", () => {
  if (body().includes("--clean")) {
    expect(body()).toContain("--if-exists")
  }
})
```

Per RESEARCH §Pattern 5, the structural half (three tags equal, `engines.node` major equals the tag
major) must run unconditionally; only the `docker run node:$TAG node -v` half may degrade, and it
must degrade with an explicit message, never a bare pass.

---

### `scripts/migrate-from-zero.mjs` (operational script, batch/DDL) — GATE B

**Primary analog:** `scripts/dedup-db-test-setup.sh` — same job (provision a throwaway database,
assert it landed, refuse to touch `pipelite`), different language.
**Secondary analog:** `e2e/seed-admin.ts` — the postgres-driver connection, the loopback guard, and
the only `finally`-cleanup precedent in the repo.

> `scripts/` today holds `dedup-db-test-setup.sh` (bash) and four `.sql` files. There is **no `.mjs`
> or `.js`** anywhere outside `eslint.config.mjs` / `postcss.config.mjs`. RESEARCH selects Node
> because the host has no `psql`/`pg_dump`. Everything below is therefore *translation*, not copying.

#### 1. Header block — the WHY sections are the copied artifact (`dedup-db-test-setup.sh:1-47`)

Five titled sections, all-caps headers, measured claims. Reproduce this shape in a `.mjs` JSDoc block:

```bash
#!/usr/bin/env bash
#
# Provision the DEDICATED, ISOLATED database that `npm run test:db` runs against.
#
# WHY THIS EXISTS
#   ...
#
# WHY A SCHEMA DUMP RATHER THAN `drizzle-kit migrate`
#   Measured, not assumed: the migration chain does NOT replay onto an empty
#   database. ...
#
# IT IS IDEMPOTENT AND IT ALWAYS REFRESHES
#   ... That is the only DROP in this file and it is fenced
#   three ways: the target name is a constant, it is checked against a literal
#   pattern here, and the DROP itself is guarded by a `current_database()`
#   assertion inside the same psql invocation — so it cannot execute against any
#   database but the intended one even if this script were edited carelessly.
#
# HOW IT REACHES THE SERVER
#   `docker exec` into the already-running Postgres container, discovered by name
#   rather than through `docker compose`: this script is also run from git
#   worktrees, where `docker compose` would infer a DIFFERENT project name from
#   the directory and could start a second stack. psql and pg_dump then talk to
#   the server over the container's local socket, so NO CREDENTIAL is passed on a
#   command line, read from the environment, or written into this file.
set -euo pipefail
```

> ⚠ **`scripts/dedup-db-test-setup.sh:21-30` is one of this phase's modified files.** The
> "WHY A SCHEMA DUMP RATHER THAN `drizzle-kit migrate`" block above becomes false on landing
> (Pitfall 9). Reconcile it in the same commit. Note `db-test-isolation.test.ts:221-229` reads this
> file for `--schema-only`, `SOURCE_DB="pipelite"`, `TEST_DB="pipelite_dedup_test"`,
> `current_database() <> 'pipelite_dedup_test'` and `ON_ERROR_STOP=1` — **the comment rewrite must
> not disturb any of those five literals.**

#### 2. The three-fence design (`dedup-db-test-setup.sh:50-61`, `:95-118`) — RESEARCH says mirror it

Fences 1 and 2, before anything connects:

```bash
SOURCE_DB="pipelite"
TEST_DB="pipelite_dedup_test"

# Fence 1: the target is a literal, and it must look like one.
if [[ "$TEST_DB" != "pipelite_dedup_test" ]]; then
  echo "FATAL: this script only ever provisions pipelite_dedup_test (got '$TEST_DB')." >&2
  exit 1
fi
if [[ "$TEST_DB" == "$SOURCE_DB" ]]; then
  echo "FATAL: the test database may never be the development database." >&2
  exit 1
fi
```

Fence 3, in-session, so the destructive statement cannot execute against another database even if the
script is edited carelessly (`:97-116`):

```sql
DO $$
DECLARE
  target text;
BEGIN
  IF current_database() <> 'pipelite_dedup_test' THEN
    RAISE EXCEPTION
      'refusing to reset %: this script resets pipelite_dedup_test and nothing else',
      current_database();
  END IF;
  ...
END
$$;
```

**Translation for `migrate-from-zero.mjs`:** the scratch name is generated
(`pipelite_migchk_${process.pid}`), so Fence 1 becomes a **pattern** assertion
(`/^pipelite_migchk_[a-z0-9_]+$/`) plus `name !== "pipelite"` — this is exactly what RESEARCH
§Security Domain (V5) and §Pattern 3 prescribe. Fence 3 has no `DO $$` equivalent for
`DROP DATABASE` (it cannot run inside a transaction), so the guard is: connect to the `postgres`
maintenance database on its own connection, re-check the pattern immediately before the DROP.

#### 3. Container discovery — `docker ps --filter`, NEVER `docker compose` (`dedup-db-test-setup.sh:63-68`)

Load-bearing precedent (worktrees are enabled in `.planning/config.json`):

```bash
CONTAINER="$(docker ps --filter 'name=pipelite-postgres' --format '{{.Names}}' | head -1)"
if [[ -z "$CONTAINER" ]]; then
  echo "FATAL: no running pipelite-postgres container found. Start the stack first:" >&2
  echo "  docker compose up -d      # from the repository root" >&2
  exit 1
fi
```

RESEARCH prefers skipping `docker exec` entirely and connecting over `localhost:5433` with the
`postgres` driver — but the *diagnostic-on-absence* shape above (FATAL + the literal command that
fixes it, on stderr, exit 1) must carry over either way.

#### 4. Connection + guaranteed cleanup — the ONLY in-repo precedent is `e2e/seed-admin.ts`

There is **no `trap` in any shell script in this repo** (verified: `grep -rn trap scripts/` matches
only prose in `dedup-checks.sql`). The cleanup guarantee therefore comes from
`e2e/seed-admin.ts:58-96`:

```typescript
const client = postgres(connectionString)
const db = drizzle(client)

try {
  // ... work ...
} finally {
  await client.end()
}
```

…with its pre-flight guard block (`e2e/seed-admin.ts:29-56`) as the model for refusing to run against
the wrong target — note the error strings explain the host/container split, which is the same
distinction DEPLOY-02 is about:

```typescript
const connectionString = process.env.E2E_DATABASE_URL
if (!connectionString) {
  throw new Error(
    "E2E_DATABASE_URL environment variable is not set. It must point at the " +
      "HOST-mapped dev Postgres (localhost:5433); the app-facing DATABASE_URL " +
      "resolves postgres:5432 inside the Docker network and is unreachable here."
  )
}
...
// DEV-DATABASE GUARD. This seed writes a privileged, password-bearing user row,
// so it must be impossible to point it at a shared or production database ...
const hostname = new URL(connectionString).hostname
if (hostname !== "localhost" && hostname !== "127.0.0.1") {
  throw new Error(
    `E2E_DATABASE_URL host "${hostname}" is not a local development database. ` +
      "The e2e admin seed refuses to run anywhere but localhost / 127.0.0.1."
  )
}
```

**Derive-by-URL-surgery** rather than string-concatenating a new connection string —
`vitest.db.config.ts:75-79`:

```typescript
function isolatedConnection(source: string): string {
  const url = new URL(source)
  url.pathname = `/${TEST_DATABASE}`
  return url.toString()
}
```

**The scratch-DB `finally` must contain the DROP**, not just `client.end()`. That combination has no
analog — it is new code composed from these two.

#### 5. Report-then-fail-loudly with measured floors (`dedup-db-test-setup.sh:127-158`)

This is the behavioural-assertion style GATE B extends to ten catalog dimensions. Note the
one-line summary printed first, then hard floors each with its own diagnosis:

```bash
# Report what landed, and fail loudly if the facts the suite depends on most did
# not come across. A silently partial schema would otherwise surface as a
# confusing assertion failure deep inside the test file instead of here.
TABLES="$(docker exec -i "$CONTAINER" psql -U pipelite -d "$TEST_DB" -tAc \
  "select count(*) from information_schema.tables where table_schema = 'public'")"
...
echo "-> tables: $TABLES / generated: $GENERATED / notes_migration_uniq: $UNIQ / organizations: $ROWS"

if [[ "$TABLES" -lt 30 ]]; then
  echo "FATAL: only $TABLES tables came across; the dump did not complete." >&2
  exit 1
fi
if [[ "$GENERATED" -lt 4 ]]; then
  echo "FATAL: expected the 4 GENERATED ALWAYS columns from migration 0017, got $GENERATED." >&2
  exit 1
fi
...
echo "OK: $TEST_DB is ready and empty."
```

Also copy the progress-echo convention `-> …` (`:70-72`, `:81`, `:119`) and the terminal `OK: …`.
Exit code discipline: `exit 1` on every FATAL — GATE B's npm script and the CI job both read it.

**Note the `table_schema = 'public'` qualifier at `:131`** — RESEARCH Pitfall 3 says this exact
qualifier is what stops the failed-run assertion counting `drizzle.__drizzle_migrations`. The analog
already gets it right; do not drop it.

---

### `drizzle/0006_import-sessions-user-id.sql` (migration, DDL)

**Analog:** `drizzle/0013_parched_redwing.sql:1-12` — drizzle-kit 0.31's own emitted formatting:
tab indent, `CREATE TABLE "x" (` with **no** `IF NOT EXISTS`, `);` then a `--> statement-breakpoint`
line.

```sql
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"content" text NOT NULL,
	"author_id" text,
	"source" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
```

**Current subject** (`drizzle/0006_import-sessions-user-id.sql`, 2 lines, both `ALTER` — the two
`CREATE TABLE`s are prepended above them, per RESEARCH §Code Examples 2):

```sql
ALTER TABLE "import_sessions" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
```

Note the file-internal convention: the breakpoint marker is appended to the **same line** as the
statement it follows (`;--> statement-breakpoint`) for `ALTER`s, and on its **own line** after a
multi-line `CREATE TABLE`. Both forms appear in `RESEARCH §Code Examples 2`'s verified repaired file.

---

### `Dockerfile` (config) — three `FROM node:` pins

**Analog:** itself. Verified this session:

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps          # :2
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps    # :7  — NOT `npm ci`; deferred, see CONTEXT

# Stage 2: Builder
FROM node:20-alpine AS builder       # :10
...
# Stage 3: Runner
FROM node:20-alpine AS runner        # :74
```

All three move to `node:24-alpine` together. `compose-uploads-persistence.test.ts:151-160` already
parses this file for `FROM … AS runner`, so a stage rename would break that gate too — **change the
tag only, never the `AS <name>` labels.**

---

### `.env.example` (config)

**Analog:** its own existing block, `.env.example:1-12`. The file already carries the host/container
distinction in prose — the DEPLOY-02 edit extends the convention rather than inventing one:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/pipelite"

# Postgres (required by docker-compose.yml)
# All three are interpolated by docker-compose.yml and the stack will not start without
# them — copying this file with these left blank is enough to fail step 1 of
# docs/admin/backup-restore.md on a clean host. DATABASE_URL above must AGREE with them,
# and inside Docker its host is `postgres` (the compose service name), not localhost:
#   DATABASE_URL="postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>"
POSTGRES_USER="pipelite"
POSTGRES_PASSWORD="change-me"
POSTGRES_DB="pipelite"
```

`:2` is the wrong-port line; `:4-9`'s comment is the one RESEARCH says must be rewritten (it currently
tells the reader the *opposite* of the new invariant). Replacement text is given verbatim in
RESEARCH §Pattern 4.

**Cross-gate coupling:** `compose-uploads-persistence.test.ts:187-195` parses this file's `KEY=` lines
with `/^([A-Z0-9_]+)=/` and asserts every compose `${VAR}` is present. Keep every key at column 0
and unquoted-on-the-left, or that gate goes red:

```typescript
/** Every `KEY=` declared in .env.example, deduplicated. */
function envExampleKeys(): Set<string> {
  const found = new Set<string>()
  for (const line of envExampleRaw.split("\n")) {
    const match = /^([A-Z0-9_]+)=/.exec(line)
    if (match) found.add(match[1])
  }
  return found
}
```

---

### `docker-compose.yml` (config)

**Analog:** its own `UPLOAD_DIR` block, `docker-compose.yml:25-36` — the established pattern for
"hardcoded rather than interpolated, with the reason and the re-break warning written inline":

```yaml
      # MANDATORY alongside the volume below — load-bearing, not tidiness. UPLOAD_DIR
      # defaults to /tmp/uploads (src/app/api/upload/route.ts:12) and, per the comment
      # above, this file has no `env_file:`. So WITHOUT this line the app writes to /tmp
      # and the uploads_data volume below stays empty forever: a persistence fix that
      # ships, reviews clean, and does nothing, with nothing erroring anywhere.
      # Hardcoded rather than ${UPLOAD_DIR} so it can never disagree with the mount
      # target on the next line — an operator who set UPLOAD_DIR=/srv/files in .env would
      # otherwise move the write path out from under the mount and silently lose
      # persistence again. Changing the path means editing both lines, which is honest
      # and which src/lib/__tests__/compose-uploads-persistence.test.ts enforces by
      # asserting the two are equal.
      - UPLOAD_DIR=/app/uploads
```

The line being replaced is `docker-compose.yml:7`:

```yaml
      - DATABASE_URL=${DATABASE_URL}
```

Replacement (RESEARCH §Pattern 4) is a constructed URL naming `@postgres:5432`, with a comment in
exactly the above register. Note `:18-22` already models "these MUST be listed here: this file has
no `env_file:`".

**Interpolation-inventory coupling:** removing `${DATABASE_URL}` while adding `${POSTGRES_USER}`,
`${POSTGRES_PASSWORD}`, `${POSTGRES_DB}` keeps `composeRequiredVars().size` above
`MIN_COMPOSE_VARS = 12` — all three are already declared in `.env.example:10-12`, so the subset check
at `compose-uploads-persistence.test.ts:326-336` stays green.

---

### `package.json` (config)

**Analog:** its own `scripts` block, `package.json:5-19`:

```json
  "scripts": {
    "test": "vitest run && vitest run --config vitest.rsc.config.ts",
    "test:db": "bash scripts/dedup-db-test-setup.sh && vitest run --config vitest.db.config.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:seed-activities": "tsx drizzle/seed-activity-types.ts"
  },
```

Three conventions to copy: the `db:` namespace, the `bash scripts/<file>.sh &&` invocation form
(`test:db`), and no `pre*`/`post*` hooks anywhere. `db:check-migrations` becomes
`"node scripts/migrate-from-zero.mjs"`.

⚠ **`db-test-isolation.test.ts:104-114` iterates EVERY script** and asserts none but `test:db`
contains `test:db` or `db.config`. A new `db:check-migrations` script is fine; a new *aggregate*
script that chains it into `test` is not.

`engines` is added fresh (there is none today). `semver` goes in `devDependencies`, alphabetically
between `@types/react-dom` and `eslint` — the block is alphabetically sorted today.

---

### `src/lib/__tests__/compose-uploads-persistence.test.ts` (MODIFY — Pitfall 6)

**The exact block to re-anchor, `:207-212`:**

```typescript
  it("read the app service, not an empty list", () => {
    // If the UPLOAD_DIR assertions below were being made against the wrong service or against a
    // list the parser returned empty, these two known-present entries would be missing too.
    expect(appEnvironment()).toContain("DATABASE_URL=${DATABASE_URL}")
    expect(appEnvironment()).toContain("SENTRY_DSN=${SENTRY_DSN}")
  })
```

This is an **anti-vacuity anchor**, not a DATABASE_URL assertion. `SENTRY_DSN=${SENTRY_DSN}`
(`:211`) survives the DEPLOY-02 change untouched and is a valid replacement anchor; so is
`UPLOAD_DIR=/app/uploads` (`docker-compose.yml:36`). Per RESEARCH, add a *positive* assertion that
the new constructed URL is present and names `@postgres:5432`.

**The standing house rule that governs this edit is written into this same file, `:299-305`:**

```typescript
    // This scan is RAW TEXT over the runner stage, comments INCLUDED, and deliberately so:
    // ... Per the standing house rule
    // (src/components/bulk/__tests__/select-wiring.test.ts, note (a)): on a collision REWORD
    // THE PROSE, never weaken the gate.
```

And the file header's closing line, `:38-39`:

```typescript
 * If you are editing one of these three files and this went red, the fix is to bring the other two
 * back into agreement — not to relax the assertion.
```

---

### `src/lib/mutations/__tests__/db-test-isolation.test.ts` (MODIFY — Pitfall 7, Route A)

**The exact block to replace, `:137-142`:**

```typescript
  it("declares no PostgreSQL service, so the exclusion is load-bearing rather than belt-and-braces", () => {
    // If a service container were ever added the reasoning in this file would change, and
    // it should change deliberately rather than by silently making these gates pointless.
    expect(workflow).not.toContain("services:")
    expect(workflow).not.toContain("postgres")
  })
```

**The invariant it actually protects** is stated in the file header, `:1-23` — that is the text the
replacement assertions must express directly:

```typescript
/**
 * THE GATE THAT KEEPS THE DATABASE TEST OUT OF THE REQUIRED CI CHECK (39-VALIDATION V-5).
 *
 * `src/lib/mutations/dedup.db.test.ts` needs a real PostgreSQL. CI
 * (.github/workflows/ci.yml) runs `npm ci`, typecheck, lint and `npm test` on GitHub
 * hardware with NO Docker and NO database, and `ci` is the required check on the master
 * ruleset. GitHub treats a required check that never passes as PERMANENTLY PENDING, which
 * makes every pull request unmergeable ...
 *
 *   1. the base project EXCLUDES the *.db.test.* glob        (vitest.config.ts)
 *   2. `npm test` does not invoke the db project             (package.json)
 *   3. the workflow never mentions it at all                 (ci.yml)
 */
```

**Anti-vacuity anchors already in this file that must be preserved (`:123-135`)** — the amended
assertions attach to the same anchors:

```typescript
  it("contains zero occurrences of `test:db` and zero of `db.config`", () => {
    expect(workflow).not.toContain("test:db")
    expect(workflow).not.toContain("db.config")
  })

  it("still runs `npm test` — the anti-vacuity anchor for the two negatives above", () => {
    // An emptied, renamed or path-filtered ci.yml would satisfy both negatives perfectly.
    // These three assertions are what make the absence meaningful: the workflow exists, it
    // is the `ci` check the master ruleset requires, and it still runs the test suite.
    expect(workflow).toContain("npm test")
    expect(workflow).toContain("name: ci")
    expect(workflow).toContain("npm run typecheck")
  })
```

**The style the replacement should adopt** is this file's own script-scan block at `:104-114` —
enumerate and assert per-item with a naming message, rather than a whole-file `not.toContain`:

```typescript
    const scripts = packageScripts()
    for (const [name, body] of Object.entries(scripts)) {
      if (name === "test:db") continue
      expect(body, `script "${name}" reaches the db vitest project`).not.toContain("test:db")
      expect(body, `script "${name}" reaches the db vitest project`).not.toContain("db.config")
    }
```

…and the line-oriented scan at `:232-244`, which is the pattern for "a sentence in a comment must not
be able to mask, or be mistaken for, a real statement":

```typescript
  it("the provisioning script never aims a destructive statement at $SOURCE_DB", () => {
    // Line-oriented rather than whole-file, so a sentence in the header that merely
    // mentions the development database cannot mask a real statement, and a real statement
    // cannot hide behind one.
    const destructive = /\b(drop|truncate|delete)\b/i
    for (const line of setup.split("\n")) {
      const code = line.replace(/^\s*#.*$/, "")
      if (!destructive.test(code)) continue
      expect(code, `destructive statement reaches the source database: ${line.trim()}`).not.toMatch(
        /\$\{?SOURCE_DB/
      )
    }
  })
```

> **RESEARCH §Security Domain explicitly asks that `scripts/migrate-from-zero.mjs` be added to this
> destructive-statement scan** (`SETUP_SCRIPT` at `:34` becomes a list). That is a modification to
> this file beyond the Route-A amendment.

---

### `src/lib/__tests__/deployment-docs-accuracy.test.ts` (MODIFY — new DEPLOY-02 doc assertions)

**The required-token pattern, `:191-204`** — a `const … as const` array where **each entry's reason
is written in the doc-comment above it**, then a single `it.each`:

```typescript
/**
 * Tokens the runbook must contain. Each is asserted individually so a failure names the missing
 * one instead of reporting "the runbook is wrong".
 *
 * `--no-owner` / `--no-privileges`: MANDATORY. Measured — restoring into a cluster whose superuser
 * is not `pipelite` without them yields 45 `ALTER … OWNER TO` errors and EXIT 1 while restoring all
 * the data correctly. ...
 */
const RUNBOOK_REQUIRED_TOKENS = [
  "--no-owner",
  "--no-privileges",
  "pg_dump",
  ...
] as const
```

```typescript
  it.each(RUNBOOK_REQUIRED_TOKENS)("contains %s", (token) => {
    expect(exists(RUNBOOK_PATH) ? read(RUNBOOK_PATH) : "").toContain(token)
  })
```

**The anti-pattern (negative) block, `:385-420`** — line-filtered, each with the measured reason:

```typescript
describe("the runbook contains no measured anti-pattern", () => {
  const body = () => (exists(RUNBOOK_PATH) ? read(RUNBOOK_PATH) : "")
  const lines = () => body().split("\n")

  it("never narrows the dump to one schema", () => {
    const bad = lines().filter((l) => l.includes("pg_dump") && l.includes("--schema"))
    expect(bad).toEqual([])
  })
```

**The per-file token assertion, `:426-448`** — the model for "every host-perspective doc prints the
host port":

```typescript
describe("the runbook is discoverable", () => {
  const POINTERS = [
    DOCKER_GUIDE_PATH,
    BARE_METAL_GUIDE_PATH,
    ROOT_INDEX_PATH,
    ADMIN_INDEX_PATH,
  ] as const

  it.each(POINTERS)("%s links to backup-restore.md", (file) => {
    expect(read(file)).toContain("backup-restore.md")
  })
})
```

**Applied to DEPLOY-02:** two `as const` lists — `HOST_PERSPECTIVE_DOCS` (must print the host port /
must not print `@postgres:5432`) and `CONTAINER_PERSPECTIVE_DOCS` (the inverse) — each driven by
`it.each`, plus the `scanFixed` collector (`:251-261`) so a failure names `file:line`. Sites are
enumerated in RESEARCH §Pattern 4's "Doc sites to reconcile" table.

⚠ **`:450-460` is the precedent for asserting on a non-doc repo file from this gate** (it reads
`.gitignore`). RESEARCH §Security Domain asks that `.gitignore:34-35` still ignore `.env` /
`.env.local` after the DEPLOY-02 edits — that assertion belongs here, in exactly this shape:

```typescript
describe("a dump cannot be committed by accident", () => {
  it("gitignores *.dump", () => {
    const entries = read(".gitignore")
      .split("\n")
      .map((l) => l.trim())
    expect(entries).toContain("*.dump")
  })
})
```

---

### `.github/workflows/ci.yml` (config, CI) — Route A wiring

**Analog:** itself, `:39-75`. Three conventions are load-bearing:

```yaml
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          # This job only reads code; it never pushes. Without this, checkout leaves the
          # GITHUB_TOKEN in .git/config while `npm ci` below runs third-party postinstall
          # scripts in the same job.
          persist-credentials: false

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          # Active LTS (EOL 2028-04-30). The binding floor is vite 7's
          # engines ^20.19.0 || >=22.12.0, reached transitively via vitest —
          # not next's >=20.9.0.
          node-version: 24
          cache: npm

      - name: Lint
        # Report all three gates in one run. Without this, a job aborts at the
        # first failing step and a contributor discovers the lint failure only
        # after fixing the type error. This condition is the modern replacement
        # for always(), which also burns minutes on cancelled runs.
        if: ${{ !cancelled() }}
        run: npm run lint
```

1. **Every action pinned to a full commit SHA with a `# vX.Y.Z` trailing comment** (`:4-8` explains
   why). A `services:` block uses an image, not an action, so no new pin — but the postgres image
   tag should follow `docker-compose.yml:57`'s `postgres:16-alpine`.
2. **`if: ${{ !cancelled() }}` on every step after the first gate**, so all gates report in one run.
   The new `db:check-migrations` step takes it too.
3. **The `ci` job name at `:32-35` is the required-check name — do not rename it.**

⚠ The comment at `:49-51` names vite as the binding floor. RESEARCH C3 says that is now stale
(`@napi-rs/lzma-linux-x64-gnu`). Reconcile it in the same commit as the DEPLOY-03 change, or GATE C
ships next to prose contradicting it — the Pitfall-9 failure shape.

---

## Shared Patterns

### S1 — Static-gate skeleton (applies to BOTH new test files, and to all three amended ones)

**Source:** `src/lib/__tests__/compose-uploads-persistence.test.ts:41-79`,
`src/lib/__tests__/deployment-docs-accuracy.test.ts:61-76`

```typescript
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()

const SUBJECT_PATH = "relative/path/from/repo/root"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}
```

- Node builtins first, blank line, then `vitest` + third-party. No `@/` alias in infra gates (they
  read files, not modules) — the one exception is `db-test-isolation.test.ts:28`, which imports
  `readStrippedSource` from `@/components/custom-fields/__tests__/source-scan`.
- Subjects are read **at module scope** into `const`s (`compose-uploads-persistence.test.ts:81-84`),
  so a missing file fails collection loudly rather than inside one `it`.
- These files live in the **base** vitest project (`vitest.config.ts` include
  `src/**/*.{test,spec}.?(c|m)[jt]s?(x)`), which is what makes them run in CI. Do **not** name them
  `*.db.test.ts` or `*.rsc.test.ts` — both globs are excluded (`vitest.config.ts:23-29`).

### S2 — Anti-vacuity, three forms (applies to every gate this phase touches)

**Source:** `compose-uploads-persistence.test.ts:59-64` + `:319-324`;
`deployment-docs-accuracy.test.ts:77-96` + `:267-304` + `:310-332`;
`no-standing-suppressions.test.ts:129-153`; `db-test-isolation.test.ts:80-89`

| Form | Where to see it | Apply to |
|---|---|---|
| Named `MIN_*` floor constant, asserted in its own `it` before the check it protects | `MIN_COMPOSE_VARS = 12`, `MIN_MARKDOWN_FILES = 20`, `MIN_RUNBOOK_CHARS = 3000` | journal ≥ 20, `CREATE TABLE` ≥ 34, snapshot tables ≥ 36, lockfile ranges ≥ 800 |
| Matcher self-test with KNOWN_POSITIVE / KNOWN_NEGATIVE `as const` fixtures + `it.each` | `deployment-docs-accuracy.test.ts:267-299` | every SQL regex in GATE A; the `FROM node:` regex in GATE C |
| Known-present positive anchor beside a negative assertion | `db-test-isolation.test.ts:80-89`, `:128-135`; `compose-uploads-persistence.test.ts:203-212` | GATE C's "all three tags equal"; the amended `db-test-isolation` CI assertions |

The rationale sentence is a house convention and should be written into each new floor:

```typescript
// Without this floor, a broken regex yields an empty set and the subset assertion passes
// vacuously — the exact shape of the phase-42 gate that could not fail.
```

Measured-value convention (`no-standing-suppressions.test.ts:133-138`) — record the number the gate
was written against, then set the floor loosely below it:

```typescript
  it("enumerates at least 400 non-test and at least 100 test modules under src/", () => {
    // Anti-vacuity. A wrong path constant or a broken recursion is the failure mode that made the
    // phase-42 gates pass on an empty diff; these floors are the tripwire for it. Measured on the
    // tree this gate was written against: 523 non-test, 169 test.
    expect(NON_TEST_FILES.length).toBeGreaterThanOrEqual(400)
    expect(TEST_FILES.length).toBeGreaterThanOrEqual(100)
  })
```

### S3 — Parse, never regex, when a parser exists

**Source:** `compose-uploads-persistence.test.ts:26-31` (the rule, in prose) and `:45`, `:82` (the use)

```typescript
 * `docker-compose.yml` is PARSED with `yaml` (already a direct dependency), never regexed. A
 * regex over YAML passes on a malformed file, and indentation is precisely what decides whether
 * `volumes:` belongs to the `app` service or to the document. The two raw-text scans that remain
 * (the Dockerfile, and the `${VAR}` inventory) each carry an anti-vacuity floor ...
```

```typescript
import { parse } from "yaml"
const compose = parse(composeRaw) as ComposeDocument
```

**Apply to:** `_journal.json` / `*_snapshot.json` / `package-lock.json` / `package.json` →
`JSON.parse`. `docker-compose.yml` → `yaml.parse`. `Dockerfile` and `drizzle/*.sql` have no parser,
so they are raw scans **and therefore each need a floor** (S2).

### S4 — Comment-blind vs raw reads: choose deliberately and prove the choice

**Source:** `src/components/custom-fields/__tests__/source-scan.ts:87-90`,
`db-test-isolation.test.ts:36-44`, `no-standing-suppressions.test.ts:1-19`

```typescript
/** Read a repo-relative source file with comments stripped. */
export function readStrippedSource(path: string): string {
  return stripComments(readFileSync(path, "utf8"))
}
```

The default is comment-blind (`readStrippedSource`) because a doc-comment that spells out the token
being asserted makes the gate self-satisfying. But `db-test-isolation.test.ts:117-121` reads `ci.yml`
**raw**, on purpose, and says so:

```typescript
  // Read RAW, comments included, deliberately: the assertion is ZERO OCCURRENCES ANYWHERE
  // in the workflow. A commented-out `run: npm run test:db` is a line one edit away from
  // being live, and this gate should fail while it is still a comment.
  const workflow = readFileSync(CI_WORKFLOW, "utf8")
```

**Applies to GATE A directly.** The migration SQL files may contain `--` comments; a chain-order scan
that counts a commented-out `CREATE TABLE` is wrong, and one that counts a commented-out
`ALTER TABLE` is also wrong. `stripComments` handles `//` and `/* */`, **not** SQL `--`. Decide and
document: strip SQL line comments locally in GATE A, and prove the stripping with a fixture, in the
S2(b) style.

### S5 — Fenced destructive operations against a named database

**Source:** `scripts/dedup-db-test-setup.sh:32-39` (the prose rule), `:50-61` (fences 1–2),
`:95-118` (fence 3), gated by `db-test-isolation.test.ts:221-244`

Three independent fences, stated in the header and implemented separately:
1. the target name is a constant / matches a literal pattern;
2. the target is asserted `!==` the development database;
3. the destructive statement itself is guarded from **inside the session**
   (`current_database() <> '<target>'` + `ON_ERROR_STOP=1`).

Plus: no credential on a command line (`:41-47`), and container discovery by `docker ps --filter`,
never `docker compose` (`:63`, worktree hazard).

**Apply to:** `scripts/migrate-from-zero.mjs` in full.

### S6 — Cross-file changes ship in ONE commit, with the gate that binds them

**Source:** `compose-uploads-persistence.test.ts:1-40` (the whole header)

```typescript
 * This gate exists because making uploads survive a rebuild is an agreement between THREE files
 * — `docker-compose.yml`, `Dockerfile` and `.env.example` — and each one's diff looks complete on
 * its own. Two of the three partial states do not error ... and why all three changes belong in
 * one commit.
 ...
 * So the assertions below are deliberately RELATIONAL rather than per-file.
```

DEPLOY-02 has exactly this shape (`.env.example` + `docker-compose.yml` + docs + the two amended
gates) and DEPLOY-03 does too (three `Dockerfile` pins + `package.json` `engines` + `ci.yml` +
GATE C). **Prefer relational assertions** — "the `engines.node` major EQUALS the tag major", "the
compose URL names the compose service name that `docker-compose.yml` actually declares" — over
per-file literals.

### S7 — On a raw-text-scan collision, reword the prose; never weaken the assertion

**Source:** `compose-uploads-persistence.test.ts:299-306`, restated in RESEARCH §Project Constraints

```typescript
    // It collided once, with this plan's own Dockerfile prose,
    // which is why that comment spells the mode "0777" instead. Per the standing house rule
    // (src/components/bulk/__tests__/select-wiring.test.ts, note (a)): on a collision REWORD
    // THE PROSE, never weaken the gate.
    expect(stage.lines.join("\n")).not.toContain("chmod 777")
```

**High collision risk this phase:** the reconciled `scripts/dedup-db-test-setup.sh:21-30` comment,
the new `.env.example` / `docker-compose.yml` comments, and every gate header — all of which
necessarily *name* `postgres`, `5432`, `5433`, `DATABASE_URL`, `test:db` and `services:`, which are
the literals the amended `db-test-isolation.test.ts` and `deployment-docs-accuracy.test.ts` scan for.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `scripts/migrate-from-zero.mjs` (language & runtime only) | operational script | batch / DDL | `scripts/` contains **no** Node script — only `dedup-db-test-setup.sh` (bash) and four `.sql`. `e2e/seed-admin.ts` is the only Node-side `postgres` driver + `finally` precedent, but it is TypeScript, is transpiled by Playwright, and is not npm-invocable (its own header at `:4-9` records that `tsx` is not installed, which is why `db:seed-activities` is currently unrunnable — **do not copy the `tsx` invocation form**). A plain `.mjs` run by bare `node` avoids that trap and has no analog to copy. |
| `DROP DATABASE` in a `finally` / `trap` | operational script | DDL cleanup | `grep -rn trap scripts/` finds **zero** traps in any shell script. The nearest guarantee is `e2e/seed-admin.ts:61,94-96`'s `try { … } finally { await client.end() }`. The DROP-in-finally combination is new code; compose it from S5's fences + that `finally`. |
| Conditional/skippable gate behaviour when Docker is absent | test | — | No vitest gate in this repo skips on environment. RESEARCH §Pattern 5 forbids a silent pass; `deployment-docs-accuracy.test.ts:413-419` is the nearest shape (narrow the assertion, never skip it). |
| `semver` usage | test dependency | — | Not currently imported anywhere (`node_modules/semver` is a hoisted 6.3.1 transitive). RESEARCH §Code Examples 5 supplies the algorithm verbatim; there is no in-repo call site to copy. |

---

## Metadata

**Analog search scope:** `src/lib/__tests__/`, `src/lib/mutations/__tests__/`, `src/types/__tests__/`,
`src/components/custom-fields/__tests__/`, `scripts/`, `e2e/`, `drizzle/`, repo root config files
(`vitest*.config.ts`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `package.json`,
`drizzle.config.ts`, `.github/workflows/ci.yml`)
**Files scanned:** ~40 enumerated, 16 read in full or in targeted ranges
**Pattern extraction date:** 2026-08-24
