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
import { describe, expect, it } from "vitest"

import {
  FORBIDDEN_SCRATCH_NAMES,
  SCRATCH_PATTERN,
  assertScratchName,
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
