/**
 * THE SCRATCH-DATABASE NAME FENCE, EXERCISED DIRECTLY.
 *
 * `scripts/migrate-from-zero.mjs` runs `CREATE DATABASE` and `DROP DATABASE ... WITH
 * (FORCE)` against the same cluster that holds the operator's real records. A database
 * identifier cannot be a bound parameter, so the name is interpolated into SQL, and
 * `assertScratchName` is the check standing between that interpolation and the live
 * `pipelite` database.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────
 *
 * The phase-46 review found that the script's header advertised "IT IS FENCED THREE WAYS"
 * while two of the three checks were unreachable. `assertScratchName` was only ever called
 * with a name built from a constant template — `pipelite_migchk_${pid}_${Date.now()}` —
 * whose components are always digits. So the pattern check always passed, and given that
 * it passed, `name === referenceName` could only fire if the operator's reference database
 * were itself named `pipelite_migchk_…`, and `FORBIDDEN_SCRATCH_NAMES.includes(name)` could
 * never fire at all: none of `pipelite`, `postgres`, `template0`, `template1` matches the
 * pattern that already passed.
 *
 * Code that READS as defence-in-depth around `DROP DATABASE` but is not is worse than one
 * honest control, because the next person to make the scratch name configurable will trust
 * the header. The header now states which check is load-bearing and which are subsumed;
 * this file is the other half — it converts branches no caller could reach into branches a
 * test does reach, and it fails loudly if any of them is ever weakened or deleted.
 *
 * ── WHY THE IMPORT IS SAFE ────────────────────────────────────────────────────────────
 *
 * The script guards its own entry point on `import.meta.main`, which node sets to `true`
 * when it is invoked and vitest's module runner sets to `false` (both measured). Importing
 * it here therefore provisions nothing, connects to nothing, and reads no `.env`. If that
 * guard is ever removed, this file will hang or fail rather than quietly stop proving
 * anything — which is the correct direction for the failure to point.
 */
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  FORBIDDEN_SCRATCH_NAMES,
  SCRATCH_PATTERN,
  assertScratchName,
  databaseUrlFromEnvLine,
} from "../../../scripts/migrate-from-zero.mjs"

/** The reference database on this machine, and the name the live records live in. */
const REFERENCE_DB = "pipelite"

/** The shape the script actually generates: `pipelite_migchk_<pid>_<millis>`. */
const GENERATED_NAME = "pipelite_migchk_4040115_1787634638242"

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
      "pipelite",
      "postgres",
      "template0",
      "template1",
    ])
  })
})

describe("assertScratchName refuses every name the script does not own", () => {
  it.each(FORBIDDEN_SCRATCH_NAMES)("refuses the reserved database %s", (name) => {
    // `pipelite` is the live database on a developer machine; `postgres` is the
    // maintenance database this script opens its admin connection to; `template0` and
    // `template1` are the cluster's templates. Dropping any of them is unrecoverable.
    expect(() => assertScratchName(name, REFERENCE_DB)).toThrow(/refusing to touch/)
  })

  it("refuses the reference database even when it is not one of the reserved names", () => {
    // The reference is opened READ ONLY and only ever receives SELECT. An operator whose
    // DATABASE_URL names something else — `pipelite_prod`, `crm` — gets the same refusal.
    expect(() => assertScratchName("pipelite_prod", "pipelite_prod")).toThrow(
      /refusing to touch/,
    )
  })

  it("refuses a reference database that DOES look like a scratch name", () => {
    // This is the one case where the reference check is not subsumed by the pattern: a
    // name that satisfies /^pipelite_migchk_[a-z0-9_]+$/ AND is the reference. It is
    // reachable in practice through `sweepLeakedScratchDatabases`, which feeds names read
    // from pg_database — not built from the script's template — through this function.
    const name = "pipelite_migchk_leftover_1787000000000"
    expect(SCRATCH_PATTERN.test(name)).toBe(true)
    expect(() => assertScratchName(name, name)).toThrow(/it is the reference database/)
  })

  it.each([
    ["an empty name", ""],
    ["a bare wrong name", "crm_production"],
    ["the right prefix with an uppercase tail", "pipelite_migchk_ABC"],
    ["the right prefix with a hyphen", "pipelite_migchk_a-b"],
    ["a prefix that only starts the same way", "pipelite_migchk"],
    ["a name that merely CONTAINS the prefix", "x_pipelite_migchk_1"],
    ['a quote-injection payload', 'pipelite_migchk_1"; DROP DATABASE "pipelite'],
    ["a statement-terminator payload", "pipelite_migchk_1; select 1"],
    ["a newline payload", "pipelite_migchk_1\npipelite"],
  ])("refuses %s", (_label, name) => {
    // The payloads matter because the name is INTERPOLATED into SQL — an identifier
    // cannot be bound. `"` is the identifier quote, so a name carrying one could close
    // the quoted identifier and start a second statement.
    expect(() => assertScratchName(name, REFERENCE_DB)).toThrow(/refusing to touch/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
// THE `.env` READER, PINNED AGAINST THE PARSER THE DOCUMENTED COMMAND ACTUALLY USES.
//
// `scripts/migrate-from-zero.mjs`'s header claims that "this script and the command the
// docs print resolve the same server by the same rule". The rule on the other side is
// dotenv 16.5.0, bundled inside `drizzle-kit/bin.cjs`, which `npm run db:migrate` invokes.
// The first version of the reader diverged from it in two ways that occur in real files:
// it rejected the `export ` prefix, and it did not strip an inline `#` comment.
//
// Neither divergence produced an error message naming the cause. `export DATABASE_URL=…`
// made the script say "no DATABASE_URL" and tell the operator to create a file they
// already had; a trailing `# dev` produced a URL whose database name parsed as
// `pipelite%20`, so the reference lookup found nothing and the run printed
// `SKIPPED: reference equivalence` — a misconfiguration wearing the costume of an absence,
// which is the exact failure `resolveReference`'s seven-branch ladder exists to prevent.
//
// These fixtures are the standing proof that the two parsers still agree. If a form here
// goes red, check what dotenv does with it BEFORE changing the expectation.
// ─────────────────────────────────────────────────────────────────────────────────────────

const HOST_URL = "postgresql://pipelite:change-me@localhost:5433/pipelite"

describe("databaseUrlFromEnvLine matches dotenv's rules, not a simplified guess", () => {
  it.each([
    ["the plain form", `DATABASE_URL=${HOST_URL}`, HOST_URL],
    ["the double-quoted form", `DATABASE_URL="${HOST_URL}"`, HOST_URL],
    ["the single-quoted form", `DATABASE_URL='${HOST_URL}'`, HOST_URL],
    ["a leading-indent form", `   DATABASE_URL=${HOST_URL}`, HOST_URL],
    ["spaces around the equals", `DATABASE_URL = ${HOST_URL}`, HOST_URL],
    // dotenv's LINE regex is `(?:export\s+)?`. A `.env` that is also `source`-able is an
    // ordinary thing to have, and deployment-docs-accuracy.test.ts:552 already anticipates
    // the form — so the two readers in this repository must not disagree about it.
    ["a shell-export prefix", `export DATABASE_URL="${HOST_URL}"`, HOST_URL],
    // dotenv's unquoted value group is `[^#\r\n]+`, so it strips this.
    ["an inline comment after an unquoted value", `DATABASE_URL=${HOST_URL} # dev`, HOST_URL],
    ["an inline comment after a quoted value", `DATABASE_URL="${HOST_URL}" # dev`, HOST_URL],
    ["a trailing carriage return (CRLF file)", `DATABASE_URL=${HOST_URL}\r`, HOST_URL],
    // A `#` INSIDE quotes is part of the value — a password may legitimately contain one.
    [
      "a hash inside a quoted password",
      'DATABASE_URL="postgresql://u:pa#ss@localhost:5433/pipelite"',
      "postgresql://u:pa#ss@localhost:5433/pipelite",
    ],
  ])("reads %s", (_label, line, expected) => {
    expect(databaseUrlFromEnvLine(line)).toBe(expected)
  })

  it.each([
    // THE ONE THE ANCHOR EXISTS FOR. `E2E_DATABASE_URL=` contains `DATABASE_URL=` as a
    // substring, and this repository's `.env` carries both keys — an unanchored search
    // returns whichever comes first, which may be the Playwright one.
    ["E2E_DATABASE_URL", `E2E_DATABASE_URL=${HOST_URL}`],
    ["a commented-out assignment", `# DATABASE_URL=${HOST_URL}`],
    ["an indented commented-out assignment", `   #   DATABASE_URL="${HOST_URL}"`],
    ["a different variable", `POSTGRES_DB=pipelite`],
    ["prose that merely names the variable", `Set DATABASE_URL to your connection string`],
    ["an empty assignment", `DATABASE_URL=`],
    ["an assignment of only whitespace", `DATABASE_URL=   `],
    ["an assignment of only a comment", `DATABASE_URL= # not set yet`],
    ["a blank line", ``],
  ])("does not read %s", (_label, line) => {
    expect(databaseUrlFromEnvLine(line)).toBeNull()
  })

  it("throws rather than guessing at an unterminated quote", () => {
    // dotenv's multi-line quoted form. Returning the raw text would hand a stray `"` to
    // `new URL()`; returning null would report the variable as ABSENT, and an absence is
    // the one thing this script refuses to let a misconfiguration disguise itself as.
    expect(() => databaseUrlFromEnvLine(`DATABASE_URL="${HOST_URL}`)).toThrow(
      /cannot parse/,
    )
    expect(() => databaseUrlFromEnvLine(`DATABASE_URL='${HOST_URL}`)).toThrow(
      /cannot parse/,
    )
  })

  it("agrees with .env.example, the file a self-hoster actually copies", () => {
    // A cross-file control rather than another fixture: if the shipped example is ever
    // rewritten into a form this reader cannot read, `npm run db:check-migrations` breaks
    // for every new self-hoster on their first run, and no fixture above would notice.
    const assignments = readFileSync(".env.example", "utf8")
      .split("\n")
      .filter((line) => /^\s*(?:export\s+)?DATABASE_URL\s*=/.test(line))
    expect(assignments, ".env.example no longer assigns DATABASE_URL").toHaveLength(1)
    const parsed = databaseUrlFromEnvLine(assignments[0])
    expect(parsed).not.toBeNull()
    expect(new URL(parsed!).port).toBe("5433")
  })
})
