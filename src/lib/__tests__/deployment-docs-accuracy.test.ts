/**
 * THE DEPLOYMENT-DOCS ACCURACY GATE.
 *
 * Criterion 3 of POLISH-02 says an operator FOLLOWS DOCUMENTED STEPS to back up and restore a
 * self-hosted deployment. The steps that were documented did not work: `docker-compose.yml` defines
 * `app`, `postgres` and `mailhog`, and the deployment guide ran `pg_dump`, `psql` and `logs` against
 * a service named `db` that has never existed in this repo — and, worse, told operators to point
 * `DATABASE_URL` at `db` as a HOSTNAME, which is setup-blocking: a self-hoster following the guide
 * verbatim cannot start the app at all.
 *
 * So this gate asserts two different classes of thing:
 *
 *   1. NEGATIVE — no file under `docs/` names a compose service or hostname that does not exist.
 *      A correct runbook stranded next to a guide that still says the wrong hostname does not
 *      satisfy criterion 3, and a reader who finds the phantom service elsewhere will not trust the
 *      new page either.
 *   2. POSITIVE — `docs/admin/backup-restore.md` exists and contains the specific flags that make
 *      a restore trustworthy, contains none of the four measured anti-patterns, and is reachable
 *      from both index files and from both deployment guides.
 *
 * ── WHY THE MATCHER UNIT-TESTS ITSELF, FIRST ──────────────────────────────────────────────────
 *
 * Phase 42 shipped roughly ten acceptance-criteria gates that COULD NOT FAIL. The most expensive
 * was a grep whose bracket expression was malformed: it matched nothing, therefore satisfied every
 * negative assertion built on it, therefore "passed" on an empty diff. Six executors diagnosed
 * downstream symptoms before one root-caused the regex. A matcher that matches nothing is not a
 * weak gate, it is an ANTI-gate — it reports success as a direct consequence of being broken.
 *
 * The countermeasure is the `describe` block below, which runs BEFORE the scan and proves the
 * matcher against three known-positive and three known-negative fixtures. If those six assertions
 * do not hold, every negative assertion further down is worthless and this file says so first.
 *
 * One fixture is deliberately `docker compose exec -T db psql …`: the `-T` sits BETWEEN `exec` and
 * `db`, so a naive `/exec\s+db/` matcher misses it — and that exact line was one of the two real
 * defects in `docker.md`. Another is the literal `  db: {` from `docs/development/testing.md:70`,
 * a vitest mock factory that has nothing to do with compose; matching it would make this gate
 * unfixable without damaging an unrelated document. That negative fixture is why the matcher is
 * scoped to actual compose INVOCATIONS rather than to the token `db`.
 *
 * ── WHY THE MATCHER SCOPE IS WHAT IT IS (READ BEFORE "SIMPLIFYING" IT) ────────────────────────
 *
 * This gate scans `docs/**` as raw text, and the runbook it requires legitimately has to talk
 * about the phantom service in order to warn operators off it. Two executors in wave 1 of this
 * phase independently tripped their own raw-text scans because a COMMENT they wrote contained the
 * literal string the scan searched for. The resolution there, and the rule here, is: reword the
 * prose, NEVER weaken the assertion.
 *
 * Both choices were made deliberately and up front, rather than discovered:
 *   - The phantom-SERVICE matcher requires a real compose invocation on the line. Prose may
 *     therefore say "the service is `postgres`, not `db`" freely, because that is not a command an
 *     operator can paste. The assertion loses nothing: the defect being prevented is a copyable
 *     broken command, not the appearance of two letters.
 *   - The phantom-HOSTNAME assertion is a fixed string with no such escape hatch, so the runbook
 *     describes that defect in prose and never reproduces the literal. Note that
 *     `docs/admin/configuration.md` legitimately contains `@db.xxx.supabase.co:5432` and
 *     `@db.example.com:5432`; the fixed string asserted here is the colon form, which does not
 *     match those.
 *
 * If you are adding a document and this went red, fix the document.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()

const DOCS_DIR = "docs"
const RUNBOOK_PATH = "docs/admin/backup-restore.md"
const DOCKER_GUIDE_PATH = "docs/admin/deployment/docker.md"
const BARE_METAL_GUIDE_PATH = "docs/admin/deployment/bare-metal.md"
const TROUBLESHOOTING_PATH = "docs/admin/troubleshooting.md"
const CONFIGURATION_PATH = "docs/admin/configuration.md"
const ROOT_INDEX_PATH = "docs/index.md"
const ADMIN_INDEX_PATH = "docs/admin/index.md"

/**
 * The six files whose presence in the enumeration is asserted by name. A glob that silently
 * resolved to the wrong directory would still enumerate SOMETHING; naming the files the
 * assertions are actually about is what makes the enumeration verifiable.
 */
const REQUIRED_IN_ENUMERATION = [
  DOCKER_GUIDE_PATH,
  BARE_METAL_GUIDE_PATH,
  TROUBLESHOOTING_PATH,
  CONFIGURATION_PATH,
  ROOT_INDEX_PATH,
  ADMIN_INDEX_PATH,
] as const

/**
 * Floor on the enumerated markdown count. 40 files exist today; 20 is a deliberately loose floor
 * that still fails hard if the walk breaks, resolves to an empty directory, or stops recursing
 * into subdirectories. A scanner that visits nothing passes every negative assertion below.
 */
const MIN_MARKDOWN_FILES = 20

/** Minimum runbook size. A pointer-shaped stub cannot carry ten sections of procedure. */
const MIN_RUNBOOK_CHARS = 3000

/**
 * The compose services that actually exist, read as documentation for the reader of this file.
 * `docker-compose.yml` defines exactly these three. `db` is not among them and never was.
 */
const REAL_COMPOSE_SERVICES = ["app", "postgres", "mailhog"] as const

/**
 * Compose subcommands that take a SERVICE as a positional argument. Restricting to this list is
 * what keeps the matcher from firing on prose: a line has to look like something an operator would
 * paste into a shell before it is treated as a broken command.
 */
const COMPOSE_SUBCOMMANDS = [
  "exec",
  "logs",
  "restart",
  "up",
  "down",
  "stop",
  "start",
  "run",
  "ps",
  "kill",
  "build",
  "pull",
  "push",
  "top",
  "port",
  "pause",
  "unpause",
  "rm",
  "create",
  "cp",
  "images",
  "config",
  "events",
  "wait",
] as const

/**
 * THE MATCHER. A compose invocation (`docker compose` or `docker-compose`), optional global flags,
 * one of the service-taking subcommands, optional subcommand flags, then `db` as a whole token.
 *
 * The `(?:\s+-{1,2}[^\s]+)*` group between the subcommand and the service is the load-bearing
 * part: without it, `docker compose exec -T db psql …` slips through, and that was a real defect
 * at `docker.md:279`. `\b` after `db` prevents matching `dbname`, `db.example.com` or `db_backup`.
 */
const PHANTOM_SERVICE_RE = new RegExp(
  String.raw`docker[- ]compose\b` +
    String.raw`(?:\s+-{1,2}[^\s]+)*` +
    String.raw`\s+(?:${COMPOSE_SUBCOMMANDS.join("|")})\b` +
    String.raw`(?:\s+-{1,2}[^\s]+)*` +
    String.raw`\s+db\b`,
)

/**
 * The phantom service used as a HOSTNAME. This is the setup-blocking one: the host part of
 * `DATABASE_URL` inside the compose network must be the compose service name, and `.env` correctly
 * uses `@postgres:5432`. Asserted as a fixed string rather than a pattern so it cannot drift.
 */
const PHANTOM_HOSTNAME = "@db:5432"

/**
 * A phantom service KEY inside a YAML snippet, e.g. a `services:` block that declares `  db:`.
 * Anchored to end-of-line so `docs/development/testing.md`'s `  db: {` (a vitest mock factory
 * object, not YAML) can never match, and scoped to the docker guide for the same reason — that is
 * the only document that publishes copyable compose snippets.
 */
const PHANTOM_SERVICE_KEY_RE = /^\s{2,}db:\s*$/

/**
 * Tokens the runbook must contain. Each is asserted individually so a failure names the missing
 * one instead of reporting "the runbook is wrong".
 *
 * `--no-owner` / `--no-privileges`: MANDATORY. Measured — restoring into a cluster whose superuser
 * is not `pipelite` without them yields 45 `ALTER … OWNER TO` errors and EXIT 1 while restoring all
 * the data correctly. That is the one outcome an operator cannot act on: an exit code that means
 * neither success nor failure, next to a database that is actually fine. With both flags: exit 0.
 *
 * `-Fc`: 34,299,898 bytes against 121,722,344 for plain SQL, and the only format `pg_restore`'s
 * selective and `--clean` modes work with at all.
 *
 * `pg_available_extensions`: the pre-flight check for managed Postgres, where the extension
 * allow-list is the provider's and not `trusted`'s to decide.
 *
 * `drizzle.__drizzle_migrations`: the migration ledger, which lives in the `drizzle` schema and is
 * the reason the dump must never be narrowed.
 *
 * `uploads_data` / `tar czf` / `tar xzf`: a database-only backup restores rows that point at files
 * which are gone.
 */
const RUNBOOK_REQUIRED_TOKENS = [
  "--no-owner",
  "--no-privileges",
  "pg_dump",
  "pg_restore",
  "-Fc",
  "docker compose exec -T postgres",
  "sudo -u postgres",
  "pg_available_extensions",
  "drizzle.__drizzle_migrations",
  "uploads_data",
  "tar czf",
  "tar xzf",
] as const

/** Walk `docs/` for markdown, recursively. Sorted so failure output is stable across runs. */
function enumerateMarkdown(relDir: string): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    const entries = readdirSync(path.join(REPO_ROOT, rel), {
      withFileTypes: true,
    })
    for (const entry of entries) {
      const childRel = path.posix.join(rel, entry.name)
      if (entry.isDirectory()) {
        walk(childRel)
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        out.push(childRel)
      }
    }
  }
  walk(relDir)
  return out.sort()
}

function read(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), "utf8")
}

function exists(rel: string): boolean {
  try {
    statSync(path.join(REPO_ROOT, rel))
    return true
  } catch {
    return false
  }
}

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

/** Every `file:line` in the enumerated set whose line contains the fixed string `needle`. */
function scanFixed(files: string[], needle: string): string[] {
  const hits: string[] = []
  for (const file of files) {
    const lines = read(file).split("\n")
    lines.forEach((line, i) => {
      if (line.includes(needle)) hits.push(`${file}:${i + 1}: ${line.trim()}`)
    })
  }
  return hits
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE MATCHER PROVES ITSELF BEFORE IT IS TRUSTED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the phantom-service matcher, unit-tested against fixtures FIRST", () => {
  /**
   * These six assertions gate everything below them. A regex that matches nothing satisfies every
   * negative assertion in this file, which is exactly how phase 42 shipped ten gates that could
   * not fail. If any of these six is red, treat every "pass" further down as unproven.
   */
  const KNOWN_POSITIVE = [
    // The real defect that was at docker.md:276.
    "docker compose exec db pg_dump -U pipelite pipelite > backup_$(date +%Y%m%d).sql",
    // The real defect that was at troubleshooting.md:561.
    "docker compose logs db",
    // The real defect that was at docker.md:279. The `-T` between `exec` and the service is the
    // whole reason this matcher tolerates flags in that position — `/exec\s+db/` misses this line.
    "docker compose exec -T db psql -U pipelite pipelite",
  ] as const

  const KNOWN_NEGATIVE = [
    // The correct command, from the verified set. Must never be flagged.
    "docker compose exec -T postgres pg_dump -U pipelite -Fc pipelite",
    // docs/development/testing.md:70 — a vitest mock factory, not YAML, not compose. Matching this
    // would make the gate unfixable without damaging an unrelated document.
    "  db: {",
    // The correct form of the troubleshooting line.
    "docker compose logs postgres",
  ] as const

  it.each(KNOWN_POSITIVE)("MUST match a broken invocation: %s", (fixture) => {
    expect(PHANTOM_SERVICE_RE.test(fixture)).toBe(true)
  })

  it.each(KNOWN_NEGATIVE)("MUST NOT match: %s", (fixture) => {
    expect(PHANTOM_SERVICE_RE.test(fixture)).toBe(false)
  })

  it("does not name `db` among the services that exist", () => {
    expect(REAL_COMPOSE_SERVICES).not.toContain("db")
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE ENUMERATION REACHED REAL FILES.
// ─────────────────────────────────────────────────────────────────────────────────────────────

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

  it("recursed into subdirectories", () => {
    // Every required file above `docs/index.md` lives at depth >= 2; a non-recursive walk would
    // find only `docs/index.md` and would otherwise look healthy.
    expect(files.some((f) => f.split("/").length >= 3)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. NO DOCUMENT NAMES A SERVICE OR HOSTNAME THAT DOES NOT EXIST.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("no phantom compose service anywhere under docs/", () => {
  const files = enumerateMarkdown(DOCS_DIR)

  it("has no compose invocation against a service named `db`", () => {
    // Was red at docker.md:276, docker.md:279 and troubleshooting.md:561 — the three commands
    // POLISH-02 exists to repair. All three fail as written: there is no such service.
    expect(scanLines(files, PHANTOM_SERVICE_RE)).toEqual([])
  })

  it("never points DATABASE_URL at the phantom service as a hostname", () => {
    // Was red at docker.md:118. Setup-blocking: a self-hoster who copies that line cannot start
    // the app at all, because the host part must be the compose service name.
    expect(scanFixed(files, PHANTOM_HOSTNAME)).toEqual([])
  })

  it("publishes no compose snippet declaring a `db` service", () => {
    // Was red at docker.md:214. Scoped to this one file: `docs/development/testing.md` contains
    // `  db: {`, which is a vitest mock and not a service declaration.
    const lines = read(DOCKER_GUIDE_PATH).split("\n")
    const hits = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => PHANTOM_SERVICE_KEY_RE.test(line))
      .map(({ line, n }) => `${DOCKER_GUIDE_PATH}:${n}: ${line.trim()}`)
    expect(hits).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. THE RUNBOOK EXISTS AND SAYS THE THINGS THAT MAKE IT CORRECT.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the backup/restore runbook", () => {
  it("exists", () => {
    expect(exists(RUNBOOK_PATH)).toBe(true)
  })

  it(`is longer than ${MIN_RUNBOOK_CHARS} characters`, () => {
    expect(exists(RUNBOOK_PATH) ? read(RUNBOOK_PATH).length : 0).toBeGreaterThan(
      MIN_RUNBOOK_CHARS,
    )
  })

  it.each(RUNBOOK_REQUIRED_TOKENS)("contains %s", (token) => {
    expect(exists(RUNBOOK_PATH) ? read(RUNBOOK_PATH) : "").toContain(token)
  })
})

describe("the runbook contains no measured anti-pattern", () => {
  const body = () => (exists(RUNBOOK_PATH) ? read(RUNBOOK_PATH) : "")
  const lines = () => body().split("\n")

  it("never suggests parallel restore", () => {
    // Measured: `pg_restore: error: parallel restore from standard input is not supported`,
    // exit 1 — and `-j 4` from a file inside the container was SLOWER (20.1s vs 9.9s) at this
    // database's size. A flag that cannot work in the documented pipeline must not appear in it.
    const bad = lines().filter((l) => l.includes("pg_restore") && l.includes(" -j"))
    expect(bad).toEqual([])
  })

  it("never narrows the dump to one schema", () => {
    // `drizzle.__drizzle_migrations` lives in its own `drizzle` SCHEMA. Narrowing the dump drops
    // the migration ledger, and the container entrypoint's unconditional `drizzle-kit migrate`
    // then re-runs all 20 migrations against restored data. With the whole database dumped it is
    // a verified no-op.
    const bad = lines().filter((l) => l.includes("pg_dump") && l.includes("--schema"))
    expect(bad).toEqual([])
  })

  it("never puts a password on a command line", () => {
    // This repo has leaked a password once already. `docker compose exec` inherits
    // POSTGRES_PASSWORD from the container env; bare metal uses `sudo -u postgres` or ~/.pgpass.
    // Neither needs the variable, and setting it inline lands it in shell history.
    expect(body()).not.toContain("PGPASSWORD")
  })

  it("never uses --clean without --if-exists", () => {
    // Measured: `--clean --if-exists` re-restore is exit 0 with unchanged row counts; without
    // `--if-exists` the same re-restore is exit 1 with 193 errors from DROPs of absent objects.
    if (body().includes("--clean")) {
      expect(body()).toContain("--if-exists")
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 5. THE RUNBOOK IS REACHABLE, AND THE VARIABLE IT DEPENDS ON IS DOCUMENTED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the runbook is discoverable", () => {
  // D-4: replace the broken inline procedure with a pointer rather than maintaining two copies
  // that can drift. The copy being deleted is the one that already drifted.
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

describe("UPLOAD_DIR is documented", () => {
  it("appears in the configuration reference", () => {
    // Without it, the uploads half of the runbook has no variable behind it: the code's default is
    // /tmp/uploads and compose has no `env_file:`, so an operator who never learns the variable
    // exists has a bare-metal install that loses uploads whenever /tmp is cleaned.
    expect(read(CONFIGURATION_PATH)).toContain("UPLOAD_DIR")
  })
})

describe("a dump cannot be committed by accident", () => {
  it("gitignores *.dump", () => {
    // The backup command drops a 34 MB unencrypted copy of every record in the CRM into the
    // operator's working directory BY DESIGN. This is the cheapest available guard against the
    // obvious next mistake, and it blocks rather than discourages.
    const entries = read(".gitignore")
      .split("\n")
      .map((l) => l.trim())
    expect(entries).toContain("*.dump")
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 6. THE HOST-PERSPECTIVE DOCS PRINT THE HOST PORT (DEPLOY-02).
//
// A reader who follows the setup steps runs the migrate command FROM THE HOST. drizzle-kit
// resolves `path.resolve(cwd, ".env")` and nothing else — the string `.env.local` does not occur
// anywhere in `drizzle-kit/bin.cjs` — so the value in `.env` is the one that is used, and
// `docker-compose.yml` publishes Postgres at `5433:5432`. Every document that printed
// `localhost:5432` was therefore printing a port nothing listens on, and the cost was an inline
// `DATABASE_URL=…` override pasted into every phase since 33.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * THE ASSIGNMENT MATCHER. Line-anchored, and the anchoring is LOAD-BEARING.
 *
 * A whole-file `toContain("localhost:5432")` cannot work here, because the documents this gate
 * governs must be free to NAME the container-side form in prose. `.env.example`'s header
 * deliberately spells out `@postgres:5432` in a `#`-prefixed example, precisely so the next
 * reader does not "fix" the host url into the container one; a whole-file scan would read that
 * warning as the defect it warns about. Per the standing house rule
 * (`compose-uploads-persistence.test.ts:299-306` and `select-wiring.test.ts` note (a)), the
 * answer to a raw-text collision is to make the scan PRECISE, never to weaken it.
 *
 * Anchoring at start-of-line after optional whitespace is what makes it precise. It excludes:
 *   - `#   DATABASE_URL="…@postgres:5432/…"`  — a commented example is prose, not a setting
 *   - `- DATABASE_URL=${DATABASE_URL}`        — a YAML sequence entry
 *   - `| \`DATABASE_URL\` | connection string |` — a reference table row
 *   - `Set DATABASE_URL to your connection string` — prose
 * and it still matches the indented `   DATABASE_URL=…` inside a fenced setup block, which is the
 * form all four subject documents actually use.
 */
const DATABASE_URL_ASSIGNMENT_RE = /^\s*(?:export\s+)?DATABASE_URL\s*=/

/** The port `docker-compose.yml` publishes Postgres on, from the host (`5433:5432`). */
const HOST_PORT = "localhost:5433"
/** The port nothing listens on from the host — the defect DEPLOY-02 removes. */
const WRONG_HOST_PORT = "localhost:5432"
/** The in-network form. Correct inside the compose network, unresolvable outside it. */
const CONTAINER_HOSTNAME = "@postgres:5432"

/**
 * The documents that describe THIS repository's own `docker compose` stack, where the reader is
 * standing on the host. `docker-compose.yml` maps `5433:5432`, so from the host the port is 5433.
 *
 *   - `.env.example`               — the ONLY one of the three env files that is tracked
 *                                    (`.gitignore:34-35` ignores `.env` and `.env.local`), so it
 *                                    is the single file a self-hoster who clones this repo sees.
 *   - `CONTRIBUTING.md`            — root-level; step 5 of its Getting Started block. It is a
 *                                    separate FILE from the one below, not a symlink, with its
 *                                    own copy of the same setup snippet.
 *   - `README.md`                  — the "Environment Variables" block under Manual Setup.
 *   - `docs/development/contributing.md` — step 5 of the developer setup.
 *   - `docs/admin/deployment/docker.md`  — ADDED AFTER THE FACT, and the omission was the
 *                                    blocking defect of the phase-46 review. This is the
 *                                    document that walks a self-hoster through `cp .env.example
 *                                    .env`, and its Step 3 block told the reader to write
 *                                    `@postgres:5432` into `.env` — the exact value
 *                                    `.env.example`'s own header warns against, and the one that
 *                                    breaks every host-side `npm run db:migrate`. It is a
 *                                    host-perspective document because the reader is standing on
 *                                    the host when they edit `.env`; the CONTAINER's string is
 *                                    built by `docker-compose.yml` and overridden, when an
 *                                    external database is wanted, by `APP_DATABASE_URL` — a
 *                                    different key, which this matcher deliberately does not
 *                                    match. See the Option B assertion in
 *                                    `compose-uploads-persistence.test.ts`, which pins the
 *                                    override variable's name across compose and this guide.
 */
const HOST_PERSPECTIVE_DOCS = [
  ".env.example",
  "CONTRIBUTING.md",
  "README.md",
  "docs/development/contributing.md",
  DOCKER_GUIDE_PATH,
] as const

/**
 * DELIBERATELY EXCLUDED, and this list exists so the next reader finds the reasoning instead of
 * re-deriving it — or, worse, "fixing" these two to 5433 and breaking them.
 *
 *   - `docs/admin/configuration.md`           — its `localhost:5432` example is the "Local
 *                                               PostgreSQL" case: a Postgres the operator
 *                                               installed themselves, listening on its own
 *                                               package default. The same file also legitimately
 *                                               shows Neon, Supabase and a generic remote host.
 *   - `docs/admin/deployment/bare-metal.md`   — the whole document is an operator installing
 *                                               Postgres directly on the machine. There is no
 *                                               compose port mapping anywhere in that path.
 *
 * Both are asserted below to STILL print `localhost:5432`, so the exclusion is a live control
 * rather than a comment: a future sweep that "fixes all the ports" turns this red.
 */
const OPERATOR_POSTGRES_DOCS = [
  "docs/admin/configuration.md",
  "docs/admin/deployment/bare-metal.md",
] as const

describe("the DATABASE_URL assignment matcher, unit-tested against fixtures FIRST", () => {
  /**
   * Same reasoning as the phantom-service matcher above: a matcher that matches nothing satisfies
   * every negative assertion built on it. The "at least one assignment found" floor per file is
   * the second half of that defence, and these fixtures are the first.
   */
  const KNOWN_POSITIVE = [
    // The fenced-setup-block form used by CONTRIBUTING.md and docs/development/contributing.md.
    "   DATABASE_URL=postgresql://u:p@localhost:5433/pipelite",
    // The quoted form used by .env.example and README.md's env block.
    'DATABASE_URL="postgresql://pipelite:change-me@localhost:5433/pipelite"',
    // A shell-export form, in case a future document reaches for one.
    'export DATABASE_URL="postgresql://u:p@localhost:5433/pipelite"',
  ] as const

  const KNOWN_NEGATIVE = [
    // THE IMPORTANT ONE. `.env.example`'s rewritten header names the container form on purpose,
    // to stop the next reader "fixing" the host url into it. A commented example is prose.
    '#   DATABASE_URL="postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>"',
    // A YAML sequence entry — docker-compose.yml's own line, which is container-perspective.
    "      - DATABASE_URL=${DATABASE_URL}",
    // Prose. docs/admin/troubleshooting.md is full of sentences naming the variable.
    "4. **Wrong host/port**: DATABASE_URL points to wrong server or port",
    // A reference-table row (docs/development/contributing.md:68).
    "| `DATABASE_URL` | PostgreSQL connection string | Yes |",
  ] as const

  it.each(KNOWN_POSITIVE)("MUST match an assignment: %s", (fixture) => {
    expect(DATABASE_URL_ASSIGNMENT_RE.test(fixture)).toBe(true)
  })

  it.each(KNOWN_NEGATIVE)("MUST NOT match: %s", (fixture) => {
    expect(DATABASE_URL_ASSIGNMENT_RE.test(fixture)).toBe(false)
  })

  it("keeps the two doc sets disjoint", () => {
    // A file in both lists would be asserted to print 5433 and 5432 at once — unsatisfiable, and
    // the kind of contradiction that gets "resolved" by deleting an assertion.
    const overlap = HOST_PERSPECTIVE_DOCS.filter((f) =>
      (OPERATOR_POSTGRES_DOCS as readonly string[]).includes(f),
    )
    expect(overlap).toEqual([])
  })
})

describe("host-perspective docs print the host port, not the container port", () => {
  it.each(HOST_PERSPECTIVE_DOCS)("%s assigns DATABASE_URL at least once", (file) => {
    // THE ANTI-VACUITY FLOOR. A file whose assignments the matcher failed to find satisfies every
    // negative assertion below it, and would report a clean pass for the wrong reason.
    expect(scanLines([file], DATABASE_URL_ASSIGNMENT_RE).length).toBeGreaterThan(0)
  })

  it.each(HOST_PERSPECTIVE_DOCS)("%s assigns only the host port 5433", (file) => {
    const offenders = scanLines([file], DATABASE_URL_ASSIGNMENT_RE).filter(
      (hit) => !hit.includes(HOST_PORT),
    )
    expect(
      offenders,
      `${file} assigns DATABASE_URL without the host port ${HOST_PORT}. ` +
        `docker-compose.yml publishes Postgres at 5433:5432, and drizzle-kit run from the host ` +
        `reads .env — so a reader who pastes this cannot connect. Offending lines: ` +
        `${offenders.join(" | ")}`,
    ).toEqual([])
  })

  it.each(HOST_PERSPECTIVE_DOCS)(`%s never assigns ${WRONG_HOST_PORT}`, (file) => {
    const offenders = scanLines([file], DATABASE_URL_ASSIGNMENT_RE).filter((hit) =>
      hit.includes(WRONG_HOST_PORT),
    )
    expect(
      offenders,
      `${file} assigns DATABASE_URL at ${WRONG_HOST_PORT}, where nothing listens on this host: ` +
        `${offenders.join(" | ")}`,
    ).toEqual([])
  })

  it.each(HOST_PERSPECTIVE_DOCS)("%s never assigns the in-network hostname", (file) => {
    // `postgres` resolves only inside the compose network. From the host it is
    // `getaddrinfo EAI_AGAIN postgres` — an error that names a HOSTNAME rather than a port, which
    // is what previously made a reader conclude a port fix "had not taken".
    const offenders = scanLines([file], DATABASE_URL_ASSIGNMENT_RE).filter((hit) =>
      hit.includes(CONTAINER_HOSTNAME),
    )
    expect(
      offenders,
      `${file} assigns DATABASE_URL at ${CONTAINER_HOSTNAME}, which does not resolve outside the ` +
        `compose network: ${offenders.join(" | ")}`,
    ).toEqual([])
  })

  it.each(OPERATOR_POSTGRES_DOCS)("%s deliberately still prints 5432", (file) => {
    // A live control on the exclusion list above, not a comment. These describe a Postgres the
    // operator installed themselves on its own default port; rewriting them to 5433 would be a
    // regression dressed as consistency.
    const hits = scanLines([file], DATABASE_URL_ASSIGNMENT_RE).filter((hit) =>
      hit.includes(WRONG_HOST_PORT),
    )
    expect(hits.length, `${file} no longer documents a local operator-run Postgres`).toBeGreaterThan(0)
  })
})

describe("no document tells a reader to create the one file drizzle-kit never reads", () => {
  it("README.md does not mention .env.local", () => {
    // README.md:63-64 used to say `cp .env.example .env.local` / "Edit .env.local …". drizzle-kit's
    // bundled dotenv resolves `path.resolve(cwd, ".env")` and nothing else, so a reader who
    // followed those two lines produced a file the migrate command never opens — and then hit
    // `getaddrinfo EAI_AGAIN postgres` from the stale `.env` with no way to connect the two facts.
    const hits = scanFixed(["README.md"], ".env.local")
    expect(hits, `README.md still names .env.local: ${hits.join(" | ")}`).toEqual([])
  })

  it("keeps .env and .env.local out of git", () => {
    // A standing control on this plan's own edits. `.env` on a developer machine holds a live
    // AUTH_SECRET and SMTP_PASSWORD; this phase edits it, and the one unrecoverable mistake would
    // be making it committable. This repo has leaked a credential exactly once, by force-adding a
    // directory, which is why the guard is a test and not a convention.
    const entries = read(".gitignore")
      .split("\n")
      .map((l) => l.trim())
    expect(entries).toContain(".env")
    expect(entries).toContain(".env.local")
  })
})
