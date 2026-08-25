/**
 * THE MIGRATION-CHAIN INTEGRITY GATE (DEPLOY-01).
 *
 * A self-hoster who clones this repository gets exactly one schema artifact: `drizzle/`. If the
 * chain cannot build a database from zero, the clone is not deployable — no matter how healthy the
 * running deployment looks. This gate asserts, statically and without a database, that the chain
 * is internally consistent.
 *
 * ── THE DEFECT THIS GATE EXISTS TO PREVENT ────────────────────────────────────────────────────
 *
 * `drizzle/0006_import-sessions-user-id.sql` is the one hand-written, hand-named file in an
 * otherwise drizzle-generated chain (every other tag is a random two-word name). It lost TWO
 * `CREATE TABLE` statements while its own snapshot kept them: `drizzle/meta/0006_snapshot.json`
 * jumps from 18 tables to 20 while the SQL held only two `ALTER TABLE` lines. Both tables were
 * introduced into the live database with `db:push`, so nothing on the running deployment ever
 * noticed.
 *
 * The two losses fail in two completely different ways, and that is the whole design brief here:
 *
 *   1. LOUD — `import_sessions`. Migration 0006 does `ALTER TABLE "import_sessions" ADD COLUMN`
 *      against a table no earlier migration creates, so a from-zero `drizzle-kit migrate` aborts
 *      with `42P01 relation "import_sessions" does not exist`. The whole run is one transaction,
 *      so it rolls back to ZERO public tables.
 *
 *   2. SILENT — `webhook_deliveries`. No migration creates it and, unlike `import_sessions`, no
 *      migration references it either. `drizzle-kit migrate` therefore exits **0** and reports
 *      success while producing 35 tables where the snapshot declares 36. The failure surfaces much
 *      later, at runtime: `src/lib/api/webhooks/deliver.ts` does `db.insert(webhookDeliveries)`
 *      and every webhook delivery raises `42P01` behind a green migrate.
 *
 * The silent class is why this gate must NOT be a wrapper around an exit code, and why the
 * snapshot-set assertion below is the primary one. An exit code is exactly what the silent class
 * already satisfies.
 *
 * ── WHY THE MATCHERS UNIT-TEST THEMSELVES, FIRST ──────────────────────────────────────────────
 *
 * Phase 42 shipped roughly ten acceptance-criteria gates that COULD NOT FAIL, and v1.3 shipped six
 * more. The most expensive was a grep whose bracket expression was malformed: it matched nothing,
 * therefore satisfied every assertion built on it, therefore "passed" on an empty diff. A matcher
 * that matches nothing is not a weak gate, it is an ANTI-gate — it reports success as a direct
 * consequence of being broken. Here that shape is especially cheap to hit: a broken `CREATE TABLE`
 * regex yields an empty created-set, and a broken snapshot read yields an empty expected-set, and
 * an empty-minus-empty difference is `[]`, which is exactly what this file asserts.
 *
 * Three independent countermeasures, all of which run BEFORE the two scans:
 *
 *   (a) The matchers are proved against KNOWN_POSITIVE / KNOWN_NEGATIVE fixtures drawn from the
 *       real chain text — including the two lines that ARE the defect. If any fixture assertion is
 *       red, treat every "pass" further down as unproven.
 *   (b) Three named `MIN_*` floors, each asserted in its own `it`, each carrying the number it was
 *       measured against.
 *   (c) `REQUIRED_JOURNAL_TAGS` names two migrations by tag, so a wrong `drizzle/` path constant
 *       is red rather than merely empty.
 *
 * ── WHY SQL COMMENTS ARE STRIPPED LOCALLY (S4: choose deliberately, then prove the choice) ─────
 *
 * The house comment-stripping helper (`src/components/custom-fields/__tests__/source-scan.ts`)
 * understands `//` and block comments, NOT SQL `--`, and this chain genuinely contains `--` prose:
 * `drizzle/0009_trigger_array_migration.sql` and `drizzle/0013_parched_redwing.sql` both carry
 * explanatory comment blocks. So this file strips SQL comments itself.
 *
 * The choice is deliberate in BOTH directions and both are wrong to get wrong. A chain-order scan
 * that counts a commented-out `ALTER TABLE` reports a violation that cannot happen; one that counts
 * a commented-out `CREATE TABLE` believes a table exists that will never be created — which is the
 * silent class all over again, this time manufactured by the gate. The stripper is therefore
 * fixture-proved in both directions below, and it is proved to preserve line COUNT, because every
 * failure this gate reports is a `file:line`.
 *
 * Stripping and the `^\s*` anchors on the DDL matchers are COMPLEMENTARY, not redundant, and the
 * fixtures are chosen to show exactly where each one carries the weight. The anchors alone already
 * defeat `-- CREATE TABLE …`, because `--` is not whitespace. They do NOT defeat a `/* … *\/` block,
 * whose inner lines carry no prefix at all and reach the matcher looking precisely like DDL. And
 * they do nothing for `referencedTables`, which is unanchored by necessity — a foreign key sits in
 * the middle of its `ALTER TABLE` line — so a `--` sentence merely describing an FK would be
 * reported as a chain-order violation. The chain does carry `--` prose (0009 and 0013), so the
 * fixtures below use the block-comment form for the two anchored matchers and the `--` form for the
 * unanchored one.
 *
 * Note that `--> statement-breakpoint` is itself an SQL comment. Stripping it is correct and
 * harmless: it is a drizzle-kit statement separator, never DDL.
 *
 * ── IF THIS WENT RED ──────────────────────────────────────────────────────────────────────────
 *
 * Fix the migration chain, never the assertion. A table in the final snapshot that no migration
 * creates is a database a clone cannot build. If a new table is legitimately being added, the
 * migration that adds it is the fix.
 */
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()

const DRIZZLE_DIR = "drizzle"
const JOURNAL_PATH = "drizzle/meta/_journal.json"

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ANTI-VACUITY FLOORS. Measured on the tree this gate was written against, 2026-08-25.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The journal declares at least this many migrations. Measured: exactly 20 (`0000`–`0019`). The
 * floor exists so a wrong `JOURNAL_PATH`, a schema change to the journal format, or a `.entries`
 * that parsed to `undefined` cannot yield an empty walk. Without this floor, a broken read yields
 * an empty set and the subset assertion passes vacuously — the exact shape of the phase-42 gate
 * that could not fail.
 */
const MIN_JOURNAL_ENTRIES = 20

/**
 * The chain emits at least this many `CREATE TABLE` statements. Measured: exactly 34 today, and
 * exactly 36 once the two statements lost from `0006` are restored. The floor is deliberately set
 * at the PRE-repair number so it stays honest through the repair rather than being retro-fitted to
 * whatever the tree happens to contain. Without this floor, a broken `CREATE TABLE` regex yields
 * an empty created-set and the difference below is trivially `[]`.
 */
const MIN_CREATE_TABLE_STATEMENTS = 34

/**
 * The final snapshot declares at least this many tables. Measured: exactly 36 in
 * `drizzle/meta/0019_snapshot.json`. Without this floor, a snapshot that parsed to an empty
 * `tables` map makes the difference below `[]` no matter how broken the chain is.
 */
const MIN_SNAPSHOT_TABLES = 36

/**
 * Two journal tags asserted BY NAME. A wrong `DRIZZLE_DIR` or a truncated journal would still
 * enumerate SOMETHING; naming the two migrations the assertions are actually about is what makes
 * the enumeration verifiable. `0006_import-sessions-user-id` is the defective file itself — the one
 * hand-named tag in the chain — and `0019_concerned_runaways` is the tail whose snapshot supplies
 * the expected table set.
 */
const REQUIRED_JOURNAL_TAGS = [
  "0006_import-sessions-user-id",
  "0019_concerned_runaways",
] as const

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SUBJECTS. Read at module scope so a wrong path fails COLLECTION loudly, not one `it` quietly.
// ─────────────────────────────────────────────────────────────────────────────────────────────

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

interface Journal {
  entries?: JournalEntry[]
}

interface SnapshotTable {
  name?: string
  schema?: string
}

interface Snapshot {
  tables?: Record<string, SnapshotTable | undefined>
}

/** Strip SQL comments, PRESERVING line structure so `file:line` reporting stays accurate. */
function stripSqlComments(sql: string): string {
  const blockless = sql.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, " ")
  )
  return blockless.replace(/--[^\n]*/g, (match) => " ".repeat(match.length))
}

const journal = JSON.parse(readRepoFile(JOURNAL_PATH)) as Journal

/** Journal entries in `idx` order — the chain's execution order, which is what ordering means. */
const chainEntries: JournalEntry[] = [...(journal.entries ?? [])].sort(
  (a, b) => a.idx - b.idx
)

if (chainEntries.length === 0) {
  throw new Error(
    `${JOURNAL_PATH}: parsed zero entries. Top-level keys seen: ` +
      `${Object.keys(journal as Record<string, unknown>).join(", ") || "(none)"}`
  )
}

/** Repo-relative path of a migration, from its journal tag. */
function migrationPath(tag: string): string {
  return `${DRIZZLE_DIR}/${tag}.sql`
}

const chainFiles: string[] = chainEntries.map((entry) => migrationPath(entry.tag))

/** Every migration's SQL, comment-stripped, keyed by repo-relative path, in chain order. */
const chainSource = new Map<string, string>(
  chainFiles.map((file) => [file, stripSqlComments(readRepoFile(file))])
)

const lastEntry = chainEntries[chainEntries.length - 1]
const SNAPSHOT_PATH = `${DRIZZLE_DIR}/meta/${String(lastEntry.idx).padStart(4, "0")}_snapshot.json`
const snapshot = JSON.parse(readRepoFile(SNAPSHOT_PATH)) as Snapshot

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE MATCHERS. Regexes over SQL, wrapped in named functions so the fixtures below prove them.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const CREATE_TABLE_RE =
  /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"\s*\.\s*)?"([A-Za-z0-9_]+)"/i

const ALTER_TABLE_RE =
  /^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"public"\s*\.\s*)?"([A-Za-z0-9_]+)"/i

const CREATE_INDEX_ON_RE =
  /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"[^"]+"\s+ON\s+(?:"public"\s*\.\s*)?"([A-Za-z0-9_]+)"/i

const REFERENCES_RE = /\bREFERENCES\s+(?:"public"\s*\.\s*)?"([A-Za-z0-9_]+)"/i

/** The table a line CREATES, or `null`. An index is not a table; an `ALTER` is not a create. */
function createdTable(line: string): string | null {
  return CREATE_TABLE_RE.exec(line)?.[1] ?? null
}

/** The table a line ALTERS, or `null`. */
function alteredTable(line: string): string | null {
  return ALTER_TABLE_RE.exec(line)?.[1] ?? null
}

/** The table a line builds an INDEX ON, or `null`. */
function indexedTable(line: string): string | null {
  return CREATE_INDEX_ON_RE.exec(line)?.[1] ?? null
}

/**
 * Every table a line REFERENCES. A single `ALTER TABLE ... ADD CONSTRAINT` line carries at most one
 * `REFERENCES`, but this returns all of them so an inline table-body FK is covered too. Built with
 * a fresh global regex per call — a module-level `/g` regex carries `lastIndex` between calls and
 * would silently skip every other hit.
 */
function referencedTables(line: string): string[] {
  const global = new RegExp(REFERENCES_RE.source, "gi")
  return [...line.matchAll(global)].map((match) => match[1])
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DERIVED SETS AND THE CHAIN-ORDER WALK.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Every table name the chain CREATES, walked in journal order. */
function createdTables(): Set<string> {
  const created = new Set<string>()
  for (const file of chainFiles) {
    for (const line of (chainSource.get(file) ?? "").split("\n")) {
      const name = createdTable(line)
      if (name) created.add(name)
    }
  }
  return created
}

/** Total `CREATE TABLE` statements across the chain — the floor's subject, not the deduped set. */
function createTableStatementCount(): number {
  let count = 0
  for (const file of chainFiles) {
    for (const line of (chainSource.get(file) ?? "").split("\n")) {
      if (createdTable(line)) count += 1
    }
  }
  return count
}

/**
 * Every table the FINAL snapshot declares. Uses each entry's `.name` rather than the map key,
 * because the keys are schema-qualified (`public.users`) while the SQL names are bare. Any table in
 * a non-default schema would break that equivalence, so it throws rather than comparing wrongly.
 */
function snapshotTables(): string[] {
  const entries = Object.entries(snapshot.tables ?? {})
  const names: string[] = []
  for (const [key, table] of entries) {
    if (!table || typeof table.name !== "string" || table.name.length === 0) {
      throw new Error(
        `${SNAPSHOT_PATH}: tables.${key} has no usable \`name\`. ` +
          `Parsed keys: ${entries.map(([k]) => k).join(", ") || "(none)"}`
      )
    }
    if (table.schema !== undefined && table.schema !== "" && table.schema !== "public") {
      throw new Error(
        `${SNAPSHOT_PATH}: tables.${key} declares schema "${table.schema}". This gate compares ` +
          `bare table names and only holds while every table lives in the default schema.`
      )
    }
    names.push(table.name)
  }
  return names.sort()
}

/**
 * Every `file:line: text` where the chain touches a table BEFORE any migration creates it.
 * The running created-set is what makes this an ordering check rather than a presence check: a
 * `CREATE TABLE` later in the chain does not retroactively make an earlier `ALTER` legal, because
 * `drizzle-kit migrate` runs the files in journal order inside one transaction.
 */
function chainOrderViolations(): string[] {
  const created = new Set<string>()
  const hits: string[] = []

  for (const file of chainFiles) {
    const lines = (chainSource.get(file) ?? "").split("\n")
    lines.forEach((line, index) => {
      const creating = createdTable(line)
      if (creating) {
        created.add(creating)
        return
      }

      const offenders = new Set<string>()
      const altered = alteredTable(line)
      if (altered && !created.has(altered)) offenders.add(altered)
      const indexed = indexedTable(line)
      if (indexed && !created.has(indexed)) offenders.add(indexed)
      for (const referenced of referencedTables(line)) {
        if (!created.has(referenced)) offenders.add(referenced)
      }
      if (offenders.size === 0) return

      hits.push(
        `${file}:${index + 1}: [${[...offenders].sort().join(", ")}] ${line.trim()}`
      )
    })
  }

  return hits
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE MATCHERS PROVE THEMSELVES BEFORE THEY ARE TRUSTED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the SQL matchers, unit-tested against fixtures FIRST", () => {
  /**
   * Every fixture below is real chain text. These assertions gate everything after them: a regex
   * that matches nothing satisfies every difference assertion in this file, which is precisely how
   * phase 42 shipped ten gates that could not fail. If any of these is red, treat every "pass"
   * further down as unproven.
   */
  const KNOWN_POSITIVE_CREATE = [
    // drizzle/0013_parched_redwing.sql:1 — the canonical drizzle-kit 0.31 emitted form.
    ['CREATE TABLE "notes" (', "notes"],
    // The form this plan restores to 0006.
    ['CREATE TABLE "webhook_deliveries" (', "webhook_deliveries"],
    // Tolerated variants that drizzle-kit has emitted across versions. Neither occurs in the chain
    // today; both are matched so a future `generate` cannot silently fall out of the scan.
    ['CREATE TABLE IF NOT EXISTS "ghosts" (', "ghosts"],
    ['CREATE TABLE "public"."qualified" (', "qualified"],
  ] as const

  const KNOWN_NEGATIVE_CREATE = [
    // An index is not a table. Counting this would make `webhook_deliveries` look created.
    'CREATE INDEX "webhook_deliveries_status_next_attempt_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");',
    // drizzle/0006_import-sessions-user-id.sql:1 — the defect itself. An ALTER is not a create.
    'ALTER TABLE "import_sessions" ADD COLUMN "user_id" text;',
    // A create that is not at the start of the line is part of a larger statement, not a DDL head.
    'INSERT INTO "audit_log" VALUES (\'CREATE TABLE "phantom" (\');',
  ] as const

  it.each(KNOWN_POSITIVE_CREATE)("createdTable MUST match %s -> %s", (fixture, expected) => {
    expect(createdTable(fixture)).toBe(expected)
  })

  it.each(KNOWN_NEGATIVE_CREATE)("createdTable MUST NOT match: %s", (fixture) => {
    expect(createdTable(fixture)).toBeNull()
  })

  it("alterTable matches the real 0006 defect line", () => {
    expect(alteredTable('ALTER TABLE "import_sessions" ADD COLUMN "user_id" text;')).toBe(
      "import_sessions"
    )
  })

  it("alterTable MUST NOT match a CREATE TABLE", () => {
    expect(alteredTable('CREATE TABLE "notes" (')).toBeNull()
  })

  it("indexedTable names the table an index is built ON, not the index", () => {
    expect(
      indexedTable(
        'CREATE INDEX "webhook_deliveries_status_next_attempt_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");'
      )
    ).toBe("webhook_deliveries")
    expect(
      indexedTable(
        'CREATE UNIQUE INDEX "notes_migration_uniq" ON "notes" USING btree ("entity_type","entity_id");'
      )
    ).toBe("notes")
  })

  it("indexedTable MUST NOT match a CREATE TABLE", () => {
    expect(indexedTable('CREATE TABLE "notes" (')).toBeNull()
  })

  it("referencedTables finds the schema-qualified FK target, which is the chain's only form", () => {
    // drizzle/0014_sloppy_slapstick.sql:22 — the second half of the loud defect.
    expect(
      referencedTables(
        'ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_import_session_id_import_sessions_id_fk" FOREIGN KEY ("import_session_id") REFERENCES "public"."import_sessions"("id") ON DELETE no action ON UPDATE no action;'
      )
    ).toEqual(["import_sessions"])
  })

  it("referencedTables finds nothing in a line with no FK", () => {
    expect(referencedTables('CREATE TABLE "notes" (')).toEqual([])
  })
})

describe("stripSqlComments, proved in both directions", () => {
  /** The nth line of a fixture, so a multi-line block comment can be fed to a line matcher. */
  const lineOf = (sql: string, index: number): string => sql.split("\n")[index]

  it("hides a CREATE TABLE inside a block comment — otherwise the gate invents a table", () => {
    // The `^\s*` anchor already makes `-- CREATE TABLE …` unmatchable, but a BLOCK comment does
    // not prefix its inner lines, so those lines reach the matcher looking exactly like DDL. This
    // is the direction that manufactures the silent class inside the gate itself: a table believed
    // created is a table never checked.
    const fixture = '/*\nCREATE TABLE "ghost" (\n*/'
    expect(createdTable(lineOf(fixture, 1))).toBe("ghost")
    expect(createdTable(lineOf(stripSqlComments(fixture), 1))).toBeNull()
  })

  it("hides an ALTER TABLE inside a block comment — otherwise the gate reports an impossible violation", () => {
    const fixture = '/*\nALTER TABLE "phantom" ADD COLUMN "x" text;\n*/'
    expect(alteredTable(lineOf(fixture, 1))).toBe("phantom")
    expect(alteredTable(lineOf(stripSqlComments(fixture), 1))).toBeNull()
  })

  it("hides a REFERENCES inside a `--` line comment", () => {
    // `referencedTables` is the one matcher with NO line anchor — it scans anywhere on the line —
    // so a `--` comment that merely DESCRIBES a foreign key is a false chain-order violation. The
    // chain really does carry explanatory `--` prose (0009 and 0013), so this is not theoretical.
    const fixture = '-- the audit_log FK REFERENCES "public"."ghost"("id") once it exists'
    expect(referencedTables(fixture)).toEqual(["ghost"])
    expect(referencedTables(stripSqlComments(fixture))).toEqual([])
  })

  it("keeps a real statement that carries a trailing comment", () => {
    // `--> statement-breakpoint` is itself an SQL comment; every DDL line in the chain ends with
    // one. Stripping must not take the statement with it.
    expect(
      createdTable(stripSqlComments('CREATE TABLE "notes" ( --> statement-breakpoint'))
    ).toBe("notes")
  })

  it("preserves line count, because every failure this gate reports is a file:line", () => {
    const fixture = 'a\n-- b\n/* c\nd */\ne'
    expect(stripSqlComments(fixture).split("\n")).toHaveLength(fixture.split("\n").length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE ENUMERATION REACHED REAL FILES.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the migration-chain enumeration is not vacuous", () => {
  it(`walks at least ${MIN_JOURNAL_ENTRIES} journal entries`, () => {
    // Recorded deliberately: a count is the cheapest possible evidence that the walk ran.
    expect(chainEntries).toHaveLength(chainFiles.length)
    expect(chainEntries.length).toBeGreaterThanOrEqual(MIN_JOURNAL_ENTRIES)
  })

  it.each(REQUIRED_JOURNAL_TAGS)("walks %s by name", (tag) => {
    expect(chainFiles).toContain(migrationPath(tag))
  })

  it("reads no empty migration", () => {
    const empty = chainFiles.filter((file) => (chainSource.get(file) ?? "").trim().length === 0)
    expect(empty).toEqual([])
  })

  it(`finds at least ${MIN_CREATE_TABLE_STATEMENTS} CREATE TABLE statements in the chain`, () => {
    // Without this floor, a broken regex yields an empty set and the subset assertion passes
    // vacuously — the exact shape of the phase-42 gate that could not fail.
    expect(createTableStatementCount()).toBeGreaterThanOrEqual(MIN_CREATE_TABLE_STATEMENTS)
  })

  it(`parses at least ${MIN_SNAPSHOT_TABLES} tables out of ${SNAPSHOT_PATH}`, () => {
    // The other half of the difference below. An empty expected-set is just as vacuous as an
    // empty created-set, and reads far more innocently.
    expect(snapshotTables().length).toBeGreaterThanOrEqual(MIN_SNAPSHOT_TABLES)
  })

  it("takes its snapshot from the LAST journal entry, not an arbitrary one", () => {
    expect(SNAPSHOT_PATH).toBe(
      `${DRIZZLE_DIR}/meta/${String(chainEntries.length - 1).padStart(4, "0")}_snapshot.json`
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. EVERY TABLE THE FINAL SNAPSHOT DECLARES IS CREATED BY SOME MIGRATION.
//    This is the assertion that catches the SILENT class. It does not read an exit code.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the chain creates every table the final snapshot declares", () => {
  it("leaves no snapshot table uncreated", () => {
    const created = createdTables()
    const missing = snapshotTables().filter((table) => !created.has(table))

    expect(
      missing,
      `the final snapshot (${SNAPSHOT_PATH}) declares tables that NO migration in ` +
        `drizzle/meta/_journal.json creates: ${missing.join(", ")}. ` +
        `Two consequences, and only one of them is visible: a table that some migration also ` +
        `ALTERs or REFERENCEs aborts a from-zero \`drizzle-kit migrate\` with 42P01 and rolls the ` +
        `whole chain back to zero tables; a table nothing else touches lets migrate exit 0 and ` +
        `ships a database that is silently short a table until application code inserts into it. ` +
        `Fix the chain — add the missing CREATE TABLE to the migration that should always have ` +
        `carried it — never this assertion.`
    ).toEqual([])
  })

  it("creates no table the final snapshot does not declare", () => {
    // The mirror direction. A table created by the chain and absent from the tail snapshot means
    // a migration was written by hand against a snapshot that never learned about it — the same
    // hand-editing failure mode as the defect above, pointing the other way.
    const declared = new Set(snapshotTables())
    const extra = [...createdTables()].filter((table) => !declared.has(table)).sort()
    expect(
      extra,
      `migrations create tables absent from ${SNAPSHOT_PATH}: ${extra.join(", ")}`
    ).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. NOTHING TOUCHES A TABLE BEFORE THE CHAIN CREATES IT.
//    This is the assertion that catches the LOUD class, statically, before anyone runs a database.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("no migration touches a table before its CREATE TABLE", () => {
  it("has no ALTER / REFERENCES / CREATE INDEX ON ahead of the table's creation", () => {
    const violations = chainOrderViolations()

    expect(
      violations,
      `migrations touch tables that no EARLIER migration creates. drizzle-kit runs the chain in ` +
        `journal order inside ONE transaction, so each of these aborts a from-zero build with ` +
        `42P01 and rolls every prior migration back:\n${violations.join("\n")}`
    ).toEqual([])
  })
})
