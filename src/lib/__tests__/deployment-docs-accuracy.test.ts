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
