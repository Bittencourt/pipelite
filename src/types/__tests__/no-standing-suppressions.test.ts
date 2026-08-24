/**
 * THE STANDING-SUPPRESSION GATE (POLISH-01, criteria 1 and 2).
 *
 * (a) THIS GATE READS RAW SOURCE, DELIBERATELY, AND THAT IS THE ONE THING NOT TO "MODERNISE".
 *     The house convention for source scanning is the shared stripped-source helper in
 *     `src/components/custom-fields/__tests__/source-scan.ts`, which is comment-BLIND by
 *     construction because Phase 37 and 38 lost fourteen gate runs to raw greps colliding with
 *     explanatory prose. That convention is right everywhere except here: the thing this gate
 *     counts IS a comment. That helper calls the comment stripper internally (:88-90), so a
 *     stripped read returns ZERO occurrences from every file in the repo — this gate would have
 *     passed on the untouched tree, before any work, and forever. It therefore uses `readFileSync`
 *     directly, and it PROVES the read was raw with an assertion (see "reads raw source" below)
 *     that goes red the moment anyone routes it through a comment-stripping reader.
 *
 *     That helper's NAME is also absent from this file on purpose, and asserted absent below, so
 *     that the plan's `grep -c` check for it stays honest and so that a well-meaning refactor
 *     toward the house convention turns this gate red instead of silent.
 *
 * (b) THE NEEDLE IS NEVER WRITTEN LITERALLY IN THIS FILE. It is assembled by `join` at runtime,
 *     and the last test asserts this file's own raw source does not contain it. Without that, the
 *     repo-wide count asserted below would be self-inflated by however many times the gate named
 *     what it was counting — the exact shape of the phase-42 gate that counted prose its own plan
 *     had ordered written. If you need to mention the directive in this file, mention it by its
 *     error code, not its spelling.
 *
 * (c) THE TWO TEST-FILE OCCURRENCES ARE PROTECTED, NOT TARGETED (43-CONTEXT.md D-1). Criterion 1's
 *     literal wording is "zero", but two suppressions in the repo are deliberate negative tests
 *     whose own comments say the suppression IS the assertion. A repo-wide zero would delete what
 *     each of those tests exists to prove. So the non-test count is asserted at 0 and the test
 *     count at exactly 2, BY PATH, and the repo-wide total is asserted separately so neither half
 *     can pass by the other's arithmetic.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()

/** Assembled, never written — see the header, note (b). */
const NEEDLE = ["@ts", "expect-error"].join("-")

/**
 * The comment-stripping reader this gate must never use, assembled for the same reason as NEEDLE:
 * the last describe block asserts this file's own raw source does not contain it.
 */
const STRIPPED_HELPER = ["read", "Stripped", "Source"].join("")

const SRC_ROOT = "src"
const GATE_PATH = "src/types/__tests__/no-standing-suppressions.test.ts"
const AUGMENTATION_PATH = "src/types/tanstack-table.d.ts"

/**
 * The raw-read proof file: one of the two D-1 test files. Its raw text contains the needle inside a
 * comment, so a comment-stripping reader cannot see it.
 */
const RAW_READ_PROOF_PATH = "src/lib/views/__tests__/actions.test.ts"

/** The two deliberate suppressions, sorted. Neither is a POLISH-01 target. */
const DELIBERATE = [
  "src/lib/audit/export-events-live.test.ts",
  "src/lib/views/__tests__/actions.test.ts",
]

/** The three modules POLISH-01 retypes. All fourteen targets live here, in two clusters each. */
const COLUMNS_PATHS = [
  "src/app/admin/pipelines/columns.tsx",
  "src/app/organizations/columns.tsx",
  "src/app/people/columns.tsx",
]

/**
 * Every member of the augmented `TableMeta`, each of which must be declared OPTIONAL.
 * The `?:` half is not decoration: `src/app/admin/users/data-table.tsx:41` passes only
 * `meta: { refresh }`, so a required member breaks a table this phase never opens, with TS2741.
 */
const META_MEMBERS = [
  "onEdit",
  "onDelete",
  "onSetDefault",
  "settingDefaultId",
  "refresh",
  "renderActions",
]

function walk(relDir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(path.join(REPO_ROOT, relDir), { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`
    if (entry.isDirectory()) out.push(...walk(rel))
    else if (/\.tsx?$/.test(entry.name)) out.push(rel)
  }
  return out
}

function isTestFile(rel: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(path.basename(rel)) || rel.includes("/__tests__/")
}

/** RAW. No stripping. See the header, note (a). */
function readRaw(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), "utf8")
}

function countIn(text: string): number {
  return text.split(NEEDLE).length - 1
}

function locate(rel: string, text: string): string[] {
  const out: string[] = []
  text.split("\n").forEach((line, index) => {
    if (line.includes(NEEDLE)) out.push(`${rel}:${index + 1}`)
  })
  return out
}

const ALL_FILES = walk(SRC_ROOT).sort()
const TEST_FILES = ALL_FILES.filter(isTestFile)
const NON_TEST_FILES = ALL_FILES.filter((file) => !isTestFile(file))

const RAW = new Map(ALL_FILES.map((file) => [file, readRaw(file)] as const))

function totalIn(files: string[]): number {
  return files.reduce((sum, file) => sum + countIn(RAW.get(file) ?? ""), 0)
}

function locateAll(files: string[]): string[] {
  return files.flatMap((file) => locate(file, RAW.get(file) ?? ""))
}

describe("the walk reaches the tree it claims to scan", () => {
  it("enumerates at least 400 non-test and at least 100 test modules under src/", () => {
    // Anti-vacuity. A wrong path constant or a broken recursion is the failure mode that made the
    // phase-42 gates pass on an empty diff; these floors are the tripwire for it. Measured on the
    // tree this gate was written against: 523 non-test, 169 test.
    expect(NON_TEST_FILES.length).toBeGreaterThanOrEqual(400)
    expect(TEST_FILES.length).toBeGreaterThanOrEqual(100)
  })

  it("enumerates all three of the modules POLISH-01 retypes", () => {
    // Fails if a rename moves a target file out from under this gate, which would otherwise let the
    // criterion below pass by simply not looking at the files that carry the suppressions.
    for (const columnsPath of COLUMNS_PATHS) {
      expect(NON_TEST_FILES).toContain(columnsPath)
    }
  })

  it("reads raw source, not comment-stripped source", () => {
    // THE LOAD-BEARING ASSERTION OF THIS WHOLE FILE. The needle only ever appears inside a comment,
    // so if this read is ever routed through the house comment-stripping reader, every count below
    // collapses to zero and the gate passes vacuously forever. This is what goes red first.
    expect(RAW.get(RAW_READ_PROOF_PATH) ?? "").toContain(NEEDLE)
  })
})

describe("POLISH-01 criterion 1: no standing suppressions in non-test source", () => {
  it("has zero occurrences across every non-test module under src/", () => {
    const found = locateAll(NON_TEST_FILES)
    expect(
      found,
      `Standing suppressions must be replaced by the shared TableMeta declaration in ` +
        `${AUGMENTATION_PATH}, not left in place. Found ${found.length}:\n${found.join("\n")}`,
    ).toEqual([])
    expect(totalIn(NON_TEST_FILES)).toBe(0)
  })

  it("did not reach zero by emptying or deleting a columns module", () => {
    // The cheapest wrong way to satisfy criterion 1 is to delete the host code — the three dead
    // `useColumns` exports carry 7 of the 14 targets and are imported nowhere. Forbidden by the
    // plan's scope boundary, and detected here.
    for (const columnsPath of COLUMNS_PATHS) {
      expect(existsSync(path.join(REPO_ROOT, columnsPath)), columnsPath).toBe(true)
      const source = RAW.get(columnsPath) ?? ""
      expect(source.length, `${columnsPath} is suspiciously small`).toBeGreaterThan(3000)
      expect(source, columnsPath).toContain("ColumnDef")
    }
  })
})

describe("D-1: the two deliberate test suppressions are protected", () => {
  it("keeps exactly two occurrences across test files", () => {
    expect(totalIn(TEST_FILES)).toBe(2)
  })

  it("keeps them in exactly the two files D-1 names", () => {
    // Red if either deliberate suppression is deleted — which is the regression this gate exists to
    // prevent, since each one IS the assertion its test makes — and red if a third appears anywhere.
    const containing = TEST_FILES.filter((file) => countIn(RAW.get(file) ?? "") > 0).sort()
    expect(containing).toEqual(DELIBERATE)
  })
})

describe("the two halves reconcile", () => {
  it("counts exactly two repo-wide under src/", () => {
    // Asserted independently of the non-test-zero and test-exactly-two halves so that neither can
    // pass by the other's arithmetic — a non-test regression cannot be masked by a deleted D-1
    // suppression, and vice versa. This one is EXPECTED RED before the implementation lands (16),
    // which is why it does not live in the D-1 block: every assertion in that block protects the
    // two deliberate suppressions and must therefore be green from the first run onward.
    expect(totalIn(ALL_FILES)).toBe(2)
  })
})

describe("the shape of the shared TableMeta declaration", () => {
  it("exists as a module augmentation of the library's own interface", () => {
    expect(existsSync(path.join(REPO_ROOT, AUGMENTATION_PATH)), AUGMENTATION_PATH).toBe(true)
    const source = readRaw(AUGMENTATION_PATH)
    expect(source).toContain('declare module "@tanstack/react-table"')
    expect(source).toContain("interface TableMeta")
  })

  it("declares every member OPTIONAL", () => {
    const source = readRaw(AUGMENTATION_PATH)
    for (const member of META_MEMBERS) {
      // `member?:` and not merely `member`. A future contributor "tightening" this declaration
      // breaks `src/app/admin/users/data-table.tsx:41` (`meta: { refresh }`) with TS2741; required
      // members belong at the consumer, via `Required<Pick<TableMeta<T>, ...>>`.
      expect(source, `${member} must be declared optional`).toContain(`${member}?:`)
    }
  })

  it("declares renderActions, which is what keeps the trash table compiling", () => {
    // An all-optional non-empty interface is a WEAK TYPE: without this member `TrashTableMeta`
    // shares no property with it and `src/app/trash/trash-table.tsx:355` is rejected with TS2559.
    // Both trash files are deliberately untouched by this phase; this member is why they can be.
    expect(readRaw(AUGMENTATION_PATH)).toContain("renderActions?:")
  })
})

describe("this gate cannot count itself", () => {
  it("never spells the needle in its own source", () => {
    // Rule 2 of the plan's gate-construction rules. If a future edit writes the directive's
    // spelling into a comment or a test name here, the repo-wide total above silently inflates and
    // this assertion is what says so.
    expect(readRaw(GATE_PATH)).not.toContain(NEEDLE)
  })

  it("scans itself as part of the tree", () => {
    // Proves the previous assertion is not scoped to a file the walk never visits.
    expect(TEST_FILES).toContain(GATE_PATH)
  })

  it("never reaches for the comment-stripping reader", () => {
    // Rule 1, enforced rather than merely documented. A stripped read returns zero occurrences from
    // every file, so adopting the house helper here would make every count above vacuous. Red if
    // anyone imports or names it in this file.
    expect(readRaw(GATE_PATH)).not.toContain(STRIPPED_HELPER)
  })
})
