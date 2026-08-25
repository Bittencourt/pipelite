/**
 * THE ADVISORY POLICY, ASSERTED OFFLINE.
 *
 * `audit-policy.json` is a mechanism for SUPPRESSING SECURITY SIGNAL. Every entry in it silences a
 * real, published advisory against a package this repository installs. So every property that
 * makes the file trustworthy — a reason that is a reason, a reach from a closed set, an expiry
 * that has not passed, exactly one entry per advisory, and a `failOn` that has not been quietly
 * narrowed — has to be an ASSERTION rather than a convention. This file is those assertions.
 *
 * ── THE SPLIT, AND WHY IT IS WHERE IT IS ──────────────────────────────────────────────────────
 *
 * Everything checkable without a network lives HERE and runs on every commit, because
 * `vitest.config.ts`'s base project must stay offline-clean. The one check that cannot be made
 * offline — "is every allowlisted advisory still actually REPORTED, or has it been fixed and the
 * exception left behind covering nothing?" — lives in `scripts/audit-policy.mjs`, which CI invokes
 * as `npm run security:audit` and which needs the registry. An offline fixture has no way to
 * distinguish "fixed" from "not in this fixture". Neither half is sufficient alone, and the same
 * split is stated in the script's header.
 *
 * ── WHY THE IMPORT IS SAFE ────────────────────────────────────────────────────────────────────
 *
 * `scripts/audit-policy.mjs` guards its entry point on `import.meta.main`, which node sets to
 * `true` when it is invoked and vitest's module runner sets to `false` (both measured). Importing
 * it here therefore spawns no `npm audit`, opens no socket and reads no policy file. If that guard
 * is ever removed, this file will put the network inside the base vitest project and start failing
 * or hanging rather than quietly proving less — which is the correct direction for the failure to
 * point.
 *
 * ── THE THREE PERMANENT NEGATIVE CONTROLS ─────────────────────────────────────────────────────
 *
 * NC-1 (a `dev-only` reason), NC-2 (a back-dated `expires`) and NC-3 (an emptied `failOn`) are
 * kept in this file PERMANENTLY, modelled on `node-engines-floor.test.ts`'s NC-3, which is kept
 * permanently in-file for the same reason: a control that lives only in a plan's SUMMARY is a
 * control that stops running the moment the plan is finished. Each is paired with the
 * complementary case in which the evaluator reports NOTHING, because a function that always
 * returned a problem would satisfy every `toContain` below on its own.
 *
 * NC-2 is the one that needs the injectable clock. `evaluatePolicy`'s third parameter exists
 * precisely so the expiry semantics can be asserted deterministically without faking timers and
 * without writing a back-dated entry into the shipped file to prove the mechanism works.
 *
 * `NC-D` below is those three collected into the single payload table 47-VALIDATION's
 * negative-control row D asks for, plus the fourth axis they were missing (a malformed `ghsa`). It
 * does not replace NC-1..NC-3 — they are organised by axis and carry more cases than row D names —
 * it is the one place a reviewer asking "can this checker produce a red at all?" will look.
 *
 * ── THE TWO ANCHORS, AND WHY THEY ARE ANCHORED THE WAY THEY ARE ────────────────────────────────
 *
 * `failOn` is asserted with an ARRAY EQUALITY, never with a containment matcher. An emptied
 * `failOn` satisfies every other assertion in this file perfectly — the evaluator's offender loop
 * skips every advisory whose severity is not listed — so containment would let the gate's own
 * configuration become the escape hatch. `FORBIDDEN_REASONS` is asserted BY VALUE, never by
 * length, so quietly dropping `"dev-only"` from the forbidden set is exactly as loud as deleting
 * the check that reads it. Both anchors are themselves asserted from this file's own source below,
 * so weakening either one is a red-going act rather than a diff nobody reads.
 *
 * ── THE SC-1b PAIRING: THE TWO GATES THIS PHASE ADDED DO NOT FIGHT ─────────────────────────────
 *
 * The per-entry expiry assertion below is written as
 * `expect(new Date(entry.expires).getTime()).toBeGreaterThan(Date.now())`, which is structurally
 * identical to `src/app/admin/users/actions.test.ts:59` — and that expression is KNOWN_NEGATIVE
 * fixture (c) of `suite-timing-hygiene.test.ts`'s SC-1b taint rule, which 47-05 shipped naming this
 * file explicitly. That rule flags an `expect()` over a clock call which is the LEFT operand of a
 * subtraction, or a division of two tainted values, and deliberately NOT a comparison against a
 * bare clock call. If it is ever widened, THIS file becomes its first false positive, and the
 * correct response is to fix the rule and add a fixture — never to exclude this path, and never to
 * reword the assertion into something that asserts less. `suite-timing-hygiene.test.ts:1158-1169`
 * asserts its own exclusion list is empty for exactly that reason. The pairing was verified from
 * both sides when this gate landed: that gate holds the expression as a fixture, and its sweep was
 * re-run over this file with an empty hit list.
 *
 * ── IF AN EXPIRY ASSERTION GOES RED ────────────────────────────────────────────────────────────
 *
 * RE-DECIDE the acceptance, or take the fix. Do NOT extend the date to make the suite green: the
 * expiry is the only thing in this repository that brings a suppression decision back for review,
 * and a date edited to restore a green run is a decision that was never revisited. 33 of the 39
 * shipped entries expire on one day, and the `it.each` form below is what makes that day report
 * thirty-three named failures instead of the first one a `for` loop happened to reach.
 */
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"
import semver from "semver"

import {
  EXPIRES_PATTERN,
  FORBIDDEN_REASONS,
  GHSA_PATTERN,
  MIN_REASON_LENGTH,
  REQUIRED_FAIL_ON,
  VALID_REACH,
  assertAuditDocument,
  collectAdvisories,
  evaluatePolicy,
  ghsaFromViaUrl,
} from "../../../scripts/audit-policy.mjs"

const REPO_ROOT = process.cwd()

const POLICY_JSON = "audit-policy.json"
const POLICY_DOC = "AUDIT-POLICY.md"
const PACKAGE_JSON = "package.json"
const AUDIT_SCRIPT = "scripts/audit-policy.mjs"
const LOCKFILE = "package-lock.json"
const SELF_PATH = "src/lib/__tests__/audit-policy.test.ts"

/**
 * Minimum size of the prose policy. A pointer-shaped stub cannot carry the three dispositions,
 * the reach rule, the expiry rule, the tooling rationale, the three-trees limitation and a
 * disposition table. Measured 2026-08-25: 27,542 characters. Same mechanism and same reasoning as
 * `deployment-docs-accuracy.test.ts`'s `MIN_RUNBOOK_CHARS = 3000`.
 */
const MIN_POLICY_DOC_CHARS = 3000

/**
 * Minimum number of allowlist entries.
 *
 * NOT an assertion that this project should carry exceptions — the goal is zero. It is the
 * anti-vacuity floor for every `for (const entry of allowlist)` assertion below: an EMPTY
 * allowlist satisfies all of them perfectly, so a commit that deleted the file's contents rather
 * than fixing the advisories would report a clean pass. Measured 2026-08-25: 39 entries covering
 * `next` (28), `nodemailer` (6), `postcss` (4) and `sharp` (1).
 *
 * If the allowlist legitimately empties because every advisory was fixed, this floor is the line
 * to change — and changing it should come with deleting the entries in the same commit, which is
 * exactly the review moment the floor exists to create.
 */
const MIN_ALLOWLIST_ENTRIES = 1

function read(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

type AllowlistEntry = {
  ghsa: string
  package: string
  reason: string
  reach: string
  expires: string
}

type Policy = { failOn: string[]; allowlist: AllowlistEntry[] }

/** `JSON.parse(readFileSync(...))` with an inline structural cast, never a regex — the convention
 *  `db-test-isolation.test.ts:110-115` and `node-engines-floor.test.ts:121-133` already use. */
function policy(): Policy {
  return JSON.parse(read(POLICY_JSON)) as Policy
}

function packageScripts(): Record<string, string> {
  const parsed = JSON.parse(read(PACKAGE_JSON)) as { scripts?: Record<string, string> }
  return parsed.scripts ?? {}
}

/**
 * Every GHSA id the prose policy names, in the order it names them.
 *
 * `GHSA_PATTERN` is anchored (`^…$`) because it validates a whole field, so it cannot be used to
 * SCAN prose. This is the same shape unanchored and global, and the two are pinned to each other
 * in the matcher self-test below — a scanner that drifted from the validator would report a clean
 * cross-reference over a set it built with different rules.
 */
const GHSA_TOKEN = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/g

function docGhsaIds(): string[] {
  return [...new Set(read(POLICY_DOC).match(GHSA_TOKEN) ?? [])]
}

/**
 * Floor on the number of distinct GHSA ids the prose scan finds. Measured 2026-08-25: **40** (the
 * 39 allowlisted plus one remediated id the document cites as evidence).
 *
 * This is the WR-11 half — Phase 46's seventh anti-gate was a scan that floored its verb but not
 * its search token, so renaming the token turned it green BECAUSE it broke. Every cross-reference
 * below is a set difference, and a set difference against an empty set is empty. Floored well
 * below the measurement so legitimate remediation does not trip it; if the number ever falls to
 * zero, `GHSA_TOKEN` stopped matching its own format and this floor is what says so.
 */
const MIN_DOC_GHSA_IDS = 4

/**
 * GHSA ids the prose names but the allowlist deliberately does NOT carry, with the reason.
 *
 * An exclusion list is a LIVE CONTROL, not a comment (`deployment-docs-accuracy.test.ts:537-556`):
 * each entry below is asserted to still be present in the document, still absent from the
 * allowlist, and still marked as remediated on the line that names it. So an id that quietly
 * migrated from "we fixed this" to "we accepted this" cannot hide in this register — it goes red
 * here instead of silently leaving the reverse cross-reference.
 */
const REMEDIATED_IN_DOC = [
  {
    ghsa: "GHSA-5xrq-8626-4rwp",
    package: "vitest",
    marker: "cleared",
    why: "fixed by the 47-01 upgrade to vitest 4.1.11; cited in the prose as the evidence that a suppression-by-default policy hides real risk (critical, CVSS 9.8), not as an acceptance",
  },
] as const

/** Packages whose absence from the lockfile is the point: 47-09 chose an in-repo evaluator over
 *  every off-the-shelf one, and `audit-ci` reaches `event-stream@4.0.1`, the 2018 backdoor. A
 *  decision nothing asserts is a preference. */
const REJECTED_TOOLING = ["audit-ci", "better-npm-audit", "event-stream"] as const

/** Floor on the lockfile parse. Measured 2026-08-25: 1286 `packages` keys. */
const MIN_LOCKFILE_PACKAGES = 500

function lockfilePackageNames(): Set<string> {
  const parsed = JSON.parse(read(LOCKFILE)) as { packages?: Record<string, unknown> }
  return new Set(
    Object.keys(parsed.packages ?? {})
      .map((key) => key.replace(/^.*node_modules\//, ""))
      .filter((name) => name.length > 0)
  )
}

/**
 * The two tokens the self-source scan searches for, assembled at runtime.
 *
 * S1(e), the gate-must-not-collide-with-itself form: this file scans its own text for a line that
 * mentions the policy's severity list together with a containment matcher, and it IS a file full
 * of both. Split literals are how `no-standing-suppressions.test.ts:19-25` solved the identical
 * problem. Do not inline them — the scan would then find its own assertion and report a defect
 * that is only the scan reading itself.
 */
const FAIL_ON_TOKEN = ["fail", "On"].join("")
const CONTAINMENT_MATCHER = ["to", "Contain"].join("")
const READ_CALL_TOKEN = ["readFile", "Sync("].join("")

/**
 * The complete set of module specifiers this file is allowed to import, BY VALUE.
 *
 * This is the structural form of "the gate is offline", and it is stronger than a text scan for
 * `child_process` or `npm audit`: those strings occur in the prose above (they have to — the
 * header explains why they are absent from the code), so a raw scan would either fail on its own
 * documentation or be reworded into uselessness. An import set asserted by value cannot be talked
 * around: adding `node:child_process`, `node:net`, `undici` or anything else goes red here.
 */
const ALLOWED_SELF_IMPORTS = [
  "../../../scripts/audit-policy.mjs",
  "node:fs",
  "node:path",
  "semver",
  "vitest",
] as const

/**
 * Every module specifier a source file imports.
 *
 * Deliberately NOT the single-line form the script-side assertion uses: a named-import block
 * spanning several lines is exactly what this file has, and a matcher anchored to one line would
 * silently skip it — reporting a clean, complete import set that omitted the one import that
 * matters. `[\s\S]*?` reaches the nearest `from` clause, which is the statement's own.
 */
/**
 * The lines of a source file that are not wholly comment.
 *
 * S4, chosen deliberately: this file's own header HAS to name `child_process`, `npm audit` and the
 * read call in order to explain why the code does not use them, so a raw scan of it would report
 * its own documentation as a defect. A line-level filter is sufficient here because every
 * occurrence being excluded is a whole-line doc-comment, and it is PROVED sufficient below rather
 * than assumed — a stripper that blanked everything would satisfy every negative it feeds.
 */
function codeLines(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim()
      return !(trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*"))
    })
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)import\s[\s\S]*?from\s+["']([^"']+)["']/g)]
    .map((match) => match[1])
    .sort()
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 0. Anti-vacuity. The file exists, has entries, and the evaluator agrees with itself about the
//    shipped policy. Without this block, every negative assertion below is satisfied by an empty
//    or deleted file.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the policy files exist and have contents (anti-vacuity)", () => {
  it(`${POLICY_JSON} parses and carries at least ${MIN_ALLOWLIST_ENTRIES} allowlist entr(ies)`, () => {
    const parsed = policy()
    expect(Array.isArray(parsed.allowlist)).toBe(true)
    expect(
      parsed.allowlist.length,
      `an empty allowlist satisfies every per-entry assertion in this file. If the allowlist ` +
        `legitimately emptied because every advisory was fixed, lower MIN_ALLOWLIST_ENTRIES in ` +
        `the same commit that deletes the entries.`
    ).toBeGreaterThanOrEqual(MIN_ALLOWLIST_ENTRIES)
  })

  it(`${POLICY_DOC} is prose, not a stub`, () => {
    expect(read(POLICY_DOC).length).toBeGreaterThanOrEqual(MIN_POLICY_DOC_CHARS)
  })

  it("the shipped policy satisfies its own evaluator against an empty advisory set", () => {
    // The complement of NC-1..NC-3: with no advisories reported, the ONLY problems `evaluatePolicy`
    // can return are entry-hygiene ones. `[]` here therefore says every shipped entry is
    // well-formed AND unexpired today, and it is what makes the three controls below meaningful —
    // they show the same call producing a problem when one field is broken.
    expect(evaluatePolicy({ vulnerabilities: {} }, policy(), new Date())).toEqual([])
  })

  it("the evaluator's own matchers behave on known-positive and known-negative inputs", () => {
    // The `deployment-docs-accuracy.test.ts:267-304` pattern: unit-test the matcher before
    // trusting anything it says about the real file.
    expect(GHSA_PATTERN.test("GHSA-xvch-5gv4-984h")).toBe(true)
    expect(GHSA_PATTERN.test("CVE-2026-1234")).toBe(false)
    expect(GHSA_PATTERN.test("https://github.com/advisories/GHSA-xvch-5gv4-984h")).toBe(false)
    expect(EXPIRES_PATTERN.test("2026-11-23")).toBe(true)
    expect(EXPIRES_PATTERN.test("never")).toBe(false)
    expect(ghsaFromViaUrl("https://github.com/advisories/GHSA-xvch-5gv4-984h")).toBe(
      "GHSA-xvch-5gv4-984h"
    )
    expect(ghsaFromViaUrl(undefined)).toBeNull()
  })

  it("names every forbidden reason the check was written for, BY VALUE", () => {
    // Asserted by value rather than by length, so a RENAME is as loud as a DELETION. Dropping
    // `"dev-only"` from this set would turn 47-CONTEXT's central prohibition — "a bare 'dev-only'
    // is not a reason unless it is true and shown to be true" — into a no-op, while NC-1's
    // `it.each` over the same set kept reporting a clean pass over one fewer case. That is a check
    // deleting itself and taking its own control with it. Same shape as
    // `migrate-from-zero-fences.test.ts:63-70`'s reserved-database list.
    expect([...FORBIDDEN_REASONS].sort()).toEqual(["dev-only", "n/a", "see above", "wontfix"])
  })

  it("the GHSA validator accepts a REAL id from the shipped allowlist", () => {
    // The `migrate-from-zero-fences.test.ts:52-62` shape: the pattern must accept what the data
    // actually contains. Without this, every per-entry assertion below is satisfied by a matcher
    // that rejects EVERYTHING — including the real allowlist, which would make the gate incapable
    // of passing while reporting a clean run. Anchored on the shipped file rather than a literal,
    // so it is the real data that is proven acceptable and not a copy of it.
    const shipped = policy().allowlist[0]?.ghsa
    expect(shipped, "the shipped allowlist has no first entry to anchor the validator on").toBeDefined()
    expect(GHSA_PATTERN.test(shipped as string)).toBe(true)
    expect(GHSA_PATTERN.test("CVE-2024-1234")).toBe(false)
  })

  it("the prose SCANNER and the field VALIDATOR agree on what a GHSA id is", () => {
    // `GHSA_PATTERN` is anchored and validates a field; `GHSA_TOKEN` is unanchored and scans prose.
    // Two matchers for one format drift, and the cross-reference below is only as good as the
    // weaker of them. Pinned to each other here: every id the scanner extracts must validate, and
    // the scanner must not extract something the validator rejects.
    const extracted = "a note about GHSA-aaaa-bbbb-cccc in prose".match(GHSA_TOKEN) ?? []
    expect(extracted).toEqual(["GHSA-aaaa-bbbb-cccc"])
    expect(GHSA_PATTERN.test(extracted[0] ?? "")).toBe(true)
    expect("CVE-2024-1234".match(GHSA_TOKEN)).toBeNull()
    for (const id of docGhsaIds()) {
      expect(id, `${POLICY_DOC} yielded ${id}, which the field validator would reject`).toMatch(
        GHSA_PATTERN
      )
    }
  })

  it("neither side of the prose/JSON cross-reference is empty (IDENTICAL — both empty proves nothing)", () => {
    // Every cross-reference below is a SET DIFFERENCE, and the difference of two empty sets is
    // empty. So the floor is stated once, here, before any of them: both sides have contents, and
    // the comparisons are therefore real. This is the case the register calls "IDENTICAL (both
    // empty — proves nothing)", and it is the difference between a gate and a gate-shaped no-op.
    //
    // If the allowlist legitimately empties because every advisory was fixed, THIS is the test
    // that goes red and says so — in the same commit that deletes the entries.
    const jsonIds = policy().allowlist.map((entry) => entry.ghsa)
    expect(
      jsonIds.length,
      `the allowlist is empty, so every per-entry assertion in this file passes over zero rows. ` +
        `That is a vacuous pass, not a clean one.`
    ).toBeGreaterThan(0)
    expect(
      docGhsaIds().length,
      `${POLICY_DOC} names no GHSA id at all, so the prose/JSON cross-reference compares the ` +
        `allowlist against an empty set and passes for the wrong reason. Either the document was ` +
        `gutted, or GHSA_TOKEN stopped matching its own format — Phase 46's WR-11 shape.`
    ).toBeGreaterThanOrEqual(MIN_DOC_GHSA_IDS)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE THREE PERMANENT NEGATIVE CONTROLS.
//
//    Each pairs a broken policy with the same policy unbroken, so neither an evaluator that
//    always reports nor one that never reports can satisfy the pair.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** One reported critical advisory, allowlisted by the fixtures below. */
const SYNTHETIC_AUDIT = {
  vulnerabilities: {
    widget: {
      name: "widget",
      severity: "critical",
      via: [
        {
          source: 1,
          name: "widget",
          title: "Widget accepts an unsanitised path",
          url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
          severity: "critical",
        },
      ],
    },
  },
}

/** A reason that clears MIN_REASON_LENGTH and names a call site, a measurement and a rejected
 *  alternative — i.e. the shape the policy document asks for, so NC-1 changes only the reason. */
const SUBSTANTIVE_REASON =
  "Requires the `unsafePath` option, which src/lib/widget/client.ts:12 never supplies; measured " +
  "2026-08-25 across 0 of 702 source files. The 4.x major was rejected because it drops Node 24."

const NOW = new Date("2026-08-25T12:00:00Z")

function fixtureEntry(overrides: Partial<AllowlistEntry> = {}): AllowlistEntry {
  return {
    ghsa: "GHSA-aaaa-bbbb-cccc",
    package: "widget",
    reason: SUBSTANTIVE_REASON,
    reach: "runtime",
    expires: "2026-12-31",
    ...overrides,
  }
}

function fixturePolicy(overrides: Partial<Policy> = {}): Policy {
  return { failOn: ["critical", "high"], allowlist: [fixtureEntry()], ...overrides }
}

describe("NC-1: a reason that is not a reason is a failure", () => {
  it("reports nothing for the same fixture with a substantive reason", () => {
    expect(evaluatePolicy(SYNTHETIC_AUDIT, fixturePolicy(), NOW)).toEqual([])
  })

  it.each(FORBIDDEN_REASONS as string[])("rejects the reason %s", (forbidden) => {
    const problems = evaluatePolicy(
      SYNTHETIC_AUDIT,
      fixturePolicy({ allowlist: [fixtureEntry({ reason: forbidden })] }),
      NOW
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("FORBIDDEN_REASONS")
    expect(problems[0]).toContain("GHSA-aaaa-bbbb-cccc")
  })

  it("rejects a reason that is merely short, not on the list", () => {
    // The list enumerates four measured ways of writing nothing; the length floor covers the rest.
    const short = "not applicable here"
    expect(short.length).toBeLessThan(MIN_REASON_LENGTH)
    expect(FORBIDDEN_REASONS as string[]).not.toContain(short)
    const problems = evaluatePolicy(
      SYNTHETIC_AUDIT,
      fixturePolicy({ allowlist: [fixtureEntry({ reason: short })] }),
      NOW
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(`the floor is ${MIN_REASON_LENGTH}`)
  })

  it("rejects a reason of whitespace, which has length but says nothing", () => {
    const problems = evaluatePolicy(
      SYNTHETIC_AUDIT,
      fixturePolicy({ allowlist: [fixtureEntry({ reason: " ".repeat(200) })] }),
      NOW
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("has no `reason`")
  })
})

describe("NC-2: an expiry that has passed is a failure", () => {
  it("reports nothing while the entry is still in date", () => {
    // Same entry, same clock, expiry one day away — so the control below isolates the date alone.
    expect(
      evaluatePolicy(SYNTHETIC_AUDIT, fixturePolicy({ allowlist: [fixtureEntry({ expires: "2026-08-26" })] }), NOW)
    ).toEqual([])
  })

  it("reports a problem for a back-dated expiry", () => {
    const problems = evaluatePolicy(
      SYNTHETIC_AUDIT,
      fixturePolicy({ allowlist: [fixtureEntry({ expires: "2026-08-01" })] }),
      NOW
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("EXPIRED on 2026-08-01")
  })

  it("treats an entry expiring TODAY as already expired", () => {
    // Deliberate: `expires` is a date, not an instant, and an entry is dead for the whole of its
    // expiry day. Erring toward revisiting early is the safe direction for a suppression list.
    const problems = evaluatePolicy(
      SYNTHETIC_AUDIT,
      fixturePolicy({ allowlist: [fixtureEntry({ expires: "2026-08-25" })] }),
      NOW
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("EXPIRED on 2026-08-25")
  })

  it("the injected clock is what decides, not the wall clock", () => {
    // The whole point of the third parameter. The same entry is clean under one clock and expired
    // under another, with no timer faking and no back-dated entry in the shipped file.
    const withEntry = fixturePolicy({ allowlist: [fixtureEntry({ expires: "2026-09-24" })] })
    expect(evaluatePolicy(SYNTHETIC_AUDIT, withEntry, new Date("2026-09-01T00:00:00Z"))).toEqual([])
    expect(
      evaluatePolicy(SYNTHETIC_AUDIT, withEntry, new Date("2026-10-01T00:00:00Z"))[0]
    ).toContain("EXPIRED on 2026-09-24")
  })
})

describe("NC-3: an emptied or narrowed failOn is a failure", () => {
  it("reports nothing for the required failOn", () => {
    expect(evaluatePolicy(SYNTHETIC_AUDIT, fixturePolicy({ failOn: ["critical", "high"] }), NOW)).toEqual([])
  })

  it("reports a problem for an EMPTY failOn", () => {
    // This is the control that matters most. `failOn: []` makes the offender loop skip every
    // advisory, so "no unallowlisted critical or high advisory" becomes trivially true and every
    // other assertion in this file still passes. It is the classic v1.3 vacuous shape.
    const problems = evaluatePolicy(SYNTHETIC_AUDIT, fixturePolicy({ failOn: [] }), NOW)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("missing critical, high")
  })

  it.each([
    ["critical dropped", ["high"]],
    ["high dropped", ["critical"]],
  ])("reports a problem when %s", (_label, failOn) => {
    const problems = evaluatePolicy(SYNTHETIC_AUDIT, fixturePolicy({ failOn }), NOW)
    expect(problems.length).toBeGreaterThanOrEqual(1)
    expect(problems[0]).toContain("requires exactly")
  })

  it("order is not semantic — the comparison is on the set", () => {
    expect(evaluatePolicy(SYNTHETIC_AUDIT, fixturePolicy({ failOn: ["high", "critical"] }), NOW)).toEqual([])
  })

  it("reports a problem for a WIDENED failOn too, so the policy cannot drift either way", () => {
    // Tightening is not automatically fine: it changes what the gate claims, and the claim lives
    // in AUDIT-POLICY.md. `REQUIRED_FAIL_ON` in scripts/audit-policy.mjs is the one line to edit,
    // in the same commit, which is the reviewable act this equality exists to force.
    const problems = evaluatePolicy(
      SYNTHETIC_AUDIT,
      fixturePolicy({ failOn: ["critical", "high", "moderate"] }),
      NOW
    )
    expect(problems.length).toBeGreaterThanOrEqual(1)
    expect(problems[0]).toContain("unexpected moderate")
  })
})

/**
 * NC-D — THE ONE TABLE THAT ANSWERS "CAN THIS CHECKER PRODUCE A RED AT ALL?"
 *
 * 47-VALIDATION's negative-control row D names three breakages — a `reason` of `"dev-only"`, a
 * back-dated `expires`, an emptied `failOn` — and requires all three to be kept PERMANENTLY
 * in-file, in the register `node-engines-floor.test.ts`'s NC-3 established, because a control that
 * lives only in a plan's SUMMARY stops running the moment the plan is finished.
 *
 * NC-1, NC-2 and NC-3 above already carry all three, and more besides. This block does NOT
 * re-implement them. It exists because those live in three separate `describe`s organised by AXIS,
 * and the phase's central claim — that this gate is capable of failing — deserves one table that
 * states it. It also adds the fourth axis the three were missing: a malformed `ghsa`. Until now
 * only the PATTERN was unit-tested, never what `evaluatePolicy` does when it meets an entry keyed
 * on a CVE id — an entry that covers nothing while reading as a live, reasoned exception.
 *
 * Every case goes through the SAME `evaluatePolicy` the script calls, with the INJECTED clock, so
 * these controls exercise production logic rather than a re-implementation of it in a test, and no
 * case rots into a time bomb. Each asserts an exact problem COUNT and the message fragments, so a
 * change that started reporting a DIFFERENT problem for the same input goes red here instead of
 * passing on a technicality.
 *
 * IF ONE OF THESE GOES RED, THE CHECKER CHANGED. Re-anchor the case onto what the evaluator now
 * reports — never delete it. A control removed because it became inconvenient is indistinguishable,
 * six months later, from a control that was never written.
 */
const NC_D_CASES = [
  {
    label: "(a) a forbidden bare reason — the exact string 47-CONTEXT prohibits",
    broken: fixturePolicy({ allowlist: [fixtureEntry({ reason: "dev-only" })] }),
    expected: 1,
    fragments: ["FORBIDDEN_REASONS", "GHSA-aaaa-bbbb-cccc"],
  },
  {
    label: "(b) a reason of `n/a` — forbidden, and below the length floor as well",
    broken: fixturePolicy({ allowlist: [fixtureEntry({ reason: "n/a" })] }),
    expected: 1,
    fragments: ["FORBIDDEN_REASONS", '"n/a"'],
  },
  {
    label: "(c) a back-dated expiry, decided by the injected clock and not the wall clock",
    broken: fixturePolicy({ allowlist: [fixtureEntry({ expires: "2020-01-01" })] }),
    expected: 1,
    fragments: ["EXPIRED on 2020-01-01"],
  },
  {
    // TWO problems, and the count is asserted exactly rather than `>= 1` on purpose. A malformed
    // id is two distinct failures, not one: the entry is unusable, AND the advisory it was meant
    // to cover now has no disposition at all. If a refactor ever reported only the first, this
    // case goes red — which is the honest outcome, because the second is the one that matters.
    label: "(d) a malformed GHSA id — an entry keyed on a CVE covers nothing",
    broken: fixturePolicy({ allowlist: [fixtureEntry({ ghsa: "CVE-2024-1234" })] }),
    expected: 2,
    fragments: ["CVE-2024-1234", "NO recorded disposition"],
  },
  {
    // Pitfall 9. With `failOn: []` the offender loop skips every advisory, so "no unallowlisted
    // critical or high advisory" becomes trivially true and every other assertion in this file
    // still passes. It is the cheapest possible way to silence this gate completely.
    label: "(e) an emptied failOn — the gate's own configuration as the escape hatch",
    broken: fixturePolicy({ failOn: [] }),
    expected: 1,
    fragments: ["missing critical, high"],
  },
] as const

describe("NC-D: the policy checker can produce a red", () => {
  it.each(NC_D_CASES)("rejects $label", ({ broken, expected, fragments }) => {
    const problems = evaluatePolicy(SYNTHETIC_AUDIT, broken, NOW)
    expect(
      problems,
      `the checker reported ${problems.length} problem(s) for a deliberately broken policy where ` +
        `${expected} was expected. If the evaluator's reporting changed, re-anchor this case; if ` +
        `it stopped reporting, this gate is no longer a gate. Reported: ${problems.join(" | ")}`
    ).toHaveLength(expected)
    for (const fragment of fragments) {
      expect(problems.join(" | "), `no problem mentioned ${fragment}`).toContain(fragment)
    }
  })

  it("still carries all five cases, in order — deleting one is a red-going act", () => {
    // The register's own floor. `it.each` over a table that lost an entry silently registers one
    // fewer test and reports a clean run; nothing above would notice. This is the same reasoning
    // as the `MIN_ALLOWLIST_ENTRIES` floor, applied to the controls themselves.
    expect(NC_D_CASES.map((entry) => entry.label.slice(0, 3))).toEqual([
      "(a)",
      "(b)",
      "(c)",
      "(d)",
      "(e)",
    ])
  })

  it("THE COMPLEMENT: accepts the VALID fixture unchanged", () => {
    // Without this, a validator that rejected EVERYTHING would pass all five cases above and this
    // whole block would certify a checker that could never let a legitimate policy through. It is
    // the `node-engines-floor.test.ts:332-336` lesson, and it is not optional.
    expect(
      evaluatePolicy(SYNTHETIC_AUDIT, fixturePolicy(), NOW),
      "the VALID fixture — the same entry every case above breaks in exactly one field — is being " +
        "rejected. Every rejection above is therefore uninformative."
    ).toEqual([])
  })

  it("THE EXPIRY COMPLEMENT: accepts the same entry expiring one day AFTER the clock", () => {
    // The expiry axis needs its own complement, because "rejects 2020-01-01" is also satisfied by
    // a check that rejects every date. Same entry, same injected clock, one day later.
    expect(
      evaluatePolicy(
        SYNTHETIC_AUDIT,
        fixturePolicy({ allowlist: [fixtureEntry({ expires: "2026-08-26" })] }),
        NOW
      ),
      "the control does not distinguish an expired date from a future one — it rejects both"
    ).toEqual([])
  })

  it("THE CROSS-FILE COMPLEMENT: accepts the SHIPPED policy against a clean audit document", () => {
    // Fixtures prove the rules; this proves the rules admit the real file. Deterministic, because
    // it uses the injected clock rather than the wall clock — the shipped expiries (2026-09-24 and
    // 2026-11-23) are both after NOW, so this case does not rot on the day they run out. The
    // time-dependent version of the same fact is asserted per entry against the real clock, which
    // is where a red is the intended behaviour.
    expect(evaluatePolicy({ vulnerabilities: {} }, policy(), NOW)).toEqual([])
  })
})

describe("an advisory with no recorded disposition is a failure", () => {
  it("reports the unallowlisted advisory, and names it", () => {
    const problems = evaluatePolicy(
      { ...SYNTHETIC_AUDIT },
      fixturePolicy({ allowlist: [fixtureEntry({ ghsa: "GHSA-zzzz-yyyy-xxxx" })] }),
      NOW
    )
    // Two problems: the covered advisory is now uncovered, and the entry that covers nothing is
    // NOT itself reported here — that is `staleAllowlistProblems`' job, and it needs the network.
    expect(problems.some((p) => p.includes("GHSA-aaaa-bbbb-cccc") && p.includes("NO recorded disposition"))).toBe(true)
  })

  it("a duplicate entry for one advisory is a failure", () => {
    const problems = evaluatePolicy(
      SYNTHETIC_AUDIT,
      fixturePolicy({ allowlist: [fixtureEntry(), fixtureEntry()] }),
      NOW
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("DUPLICATE")
  })

  it("an advisory whose via[].url no longer yields an id is reported, not skipped", () => {
    // A schema change that removed `url` would otherwise empty the offender list silently.
    const problems = evaluatePolicy(
      { vulnerabilities: { widget: { severity: "critical", via: [{ title: "no url" }] } } },
      fixturePolicy(),
      NOW
    )
    expect(problems.some((p) => p.includes("no resolvable GHSA id"))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. The floors on the audit document itself. `assertAuditDocument` is what stands between "the
//    tree is clean" and "the request failed and the document is empty".
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the evaluator refuses to certify an empty or wrong-shaped audit document", () => {
  /** A document that is well-shaped and above both floors, so the negatives below isolate one
   *  broken thing each. Built rather than fixtured, because a checked-in `npm audit` document
   *  would rot the day the schema moves. */
  function healthyDocument() {
    const vulnerabilities: Record<string, unknown> = {}
    for (let index = 0; index < 5; index += 1) {
      vulnerabilities[`pkg-${index}`] = {
        name: `pkg-${index}`,
        severity: "high",
        via: [
          {
            title: `advisory ${index}`,
            url: `https://github.com/advisories/GHSA-aaa${index}-bbbb-cccc`,
            severity: "high",
          },
        ],
      }
    }
    return {
      vulnerabilities,
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 5, critical: 0, total: 5 },
        dependencies: { prod: 500, dev: 500, optional: 0, peer: 0, peerOptional: 0, total: 1000 },
      },
    }
  }

  it("accepts a healthy document — the anti-vacuity complement", () => {
    const result = assertAuditDocument(healthyDocument())
    expect(result.advisoryIds.size).toBe(5)
    expect(result.vulnerablePackages).toBe(5)
    expect(result.dependenciesAudited).toBe(1000)
  })

  it("fatals on the wholly empty document", () => {
    expect(() => assertAuditDocument({})).toThrow(/no `vulnerabilities` object/)
  })

  it("fatals when `vulnerabilities` is emptied but the histogram is left intact", () => {
    // The measured 47-01 shape, and the single most dangerous one: zero offenders, exit 0.
    const document = { ...healthyDocument(), vulnerabilities: {} }
    expect(() => assertAuditDocument(document)).toThrow(/does not reconcile/)
  })

  it("fatals when `metadata.vulnerabilities.total` is deleted", () => {
    // The other measured 47-01 shape. A missing key reads as zero in JavaScript.
    const document = healthyDocument()
    delete (document.metadata.vulnerabilities as Record<string, number>).total
    expect(() => assertAuditDocument(document)).toThrow(/`metadata.vulnerabilities.total` is/)
  })

  it("fatals on a self-consistent but empty document", () => {
    expect(() =>
      assertAuditDocument({
        vulnerabilities: {},
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
          dependencies: { total: 1000 },
        },
      })
    ).toThrow(/distinct advisory id/)
  })

  it("fatals when npm reports auditing almost nothing, even with real advisories present", () => {
    // Isolates the packages floor: the advisories floor short-circuits before it in the case
    // above, so without this the branch would never be reached by any test.
    const document = healthyDocument()
    document.metadata.dependencies.total = 3
    expect(() => assertAuditDocument(document)).toThrow(/auditing only 3 package/)
  })

  it("fatals on a severity the schema does not define", () => {
    const document = healthyDocument()
    ;(document.vulnerabilities["pkg-0"] as { severity: string }).severity = "catastrophic"
    expect(() => assertAuditDocument(document)).toThrow(/schema changed/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. The SHIPPED policy file, entry by entry.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the shipped audit-policy.json", () => {
  it(`declares failOn exactly ${JSON.stringify([...REQUIRED_FAIL_ON])}, in that order`, () => {
    // EQUALITY, not containment, and order included for the file (the evaluator compares sets).
    expect(policy().failOn).toEqual(["critical", "high"])
  })

  it("gives no advisory two entries", () => {
    const ids = policy().allowlist.map((entry) => entry.ghsa)
    expect(new Set(ids).size, "an advisory has two entries; exactly one disposition each").toBe(
      ids.length
    )
  })
})

/**
 * The shipped allowlist as an `it.each` payload table.
 *
 * WHY `it.each` AND NOT A `for` LOOP INSIDE ONE `it`. A loop stops at the first offender and
 * reports "the policy is wrong"; `it.each` names the offending GHSA in the TEST NAME and reports
 * EVERY offender. 33 of the 39 shipped entries share one expiry date, so on 2026-09-24 the
 * difference is between one failure and thirty-three named ones — and the whole point of the
 * expiry mechanism is that the suite hands back the complete list of decisions to revisit.
 *
 * Each axis gets its own `it.each` rather than one `it` per entry, so a broken `reach` and an
 * expired `expires` on the same entry are two reports and not one short-circuit.
 *
 * If the allowlist ever empties, every block below registers ZERO tests and vanishes silently.
 * That is what the `MIN_ALLOWLIST_ENTRIES` floor above exists to catch, and why it lives in its
 * own `it` rather than inside these.
 */
const SHIPPED_ENTRIES = policy().allowlist.map((entry) => ({
  ...entry,
  label: `${entry.ghsa} (${entry.package})`,
}))

const SHIPPED_PACKAGES = [...new Set(SHIPPED_ENTRIES.map((entry) => entry.package))]

describe("every shipped allowlist entry, named", () => {
  it.each(SHIPPED_ENTRIES)("$label has a well-formed GHSA id", (entry) => {
    expect(entry.ghsa, `${entry.ghsa} is not a GHSA id matching ${GHSA_PATTERN}`).toMatch(
      GHSA_PATTERN
    )
  })

  it.each(SHIPPED_ENTRIES)("$label declares a reach from the closed set", (entry) => {
    expect(
      VALID_REACH as string[],
      `${entry.label} has reach=${JSON.stringify(entry.reach)}; an advisory reachable only from a ` +
        `build tool is a different risk from one in the request path, and the entry has to say which`
    ).toContain(entry.reach)
  })

  it.each(SHIPPED_ENTRIES)("$label gives a substantive, non-forbidden reason", (entry) => {
    expect(
      entry.reason.trim().length,
      `${entry.label}'s reason is ${entry.reason.trim().length} characters; the floor is ` +
        `${MIN_REASON_LENGTH}. A reason that would be true of any project is not a reason — name ` +
        `the call site, the measurement, and the alternative that was rejected.`
    ).toBeGreaterThanOrEqual(MIN_REASON_LENGTH)
    expect(FORBIDDEN_REASONS as string[], `${entry.label}`).not.toContain(
      entry.reason.trim().toLowerCase()
    )
  })

  it.each(SHIPPED_ENTRIES)("$label has an expiry that is a bare date and has not passed", (entry) => {
    // The one axis in this file that is time-dependent BY DESIGN. It goes red on the day an
    // acceptance runs out, which is the entire mechanism: the suite is what brings the decision
    // back. Do NOT "fix" a red here by editing the date — re-read the evidence first.
    //
    // The second form is deliberately written as `new Date(...).getTime()` compared to a bare
    // `Date.now()`, which is `src/app/admin/users/actions.test.ts:59`'s shape and KNOWN_NEGATIVE
    // fixture (c) of `suite-timing-hygiene.test.ts`'s SC-1b taint rule. Keeping it in exactly that
    // shape is what makes the cross-check between the two gates a real pairing rather than a hope:
    // it is a comparison against a clock call, not a delta or a ratio derived from one.
    expect(entry.expires, `${entry.label} expires=${JSON.stringify(entry.expires)}`).toMatch(
      EXPIRES_PATTERN
    )
    expect(
      Date.parse(`${entry.expires}T00:00:00Z`),
      `${entry.label} expired on ${entry.expires}. Take the fix, or re-state the reason against ` +
        `today's code and set a new date — see ${POLICY_DOC}. Extending the date without ` +
        `re-reading the evidence is the failure this field exists to prevent.`
    ).toBeGreaterThan(Date.now())
    expect(new Date(entry.expires).getTime()).toBeGreaterThan(Date.now())
  })

  it.each(SHIPPED_ENTRIES)("$label names a package", (entry) => {
    expect(entry.package.trim().length, `${entry.label} has no package`).toBeGreaterThan(0)
  })
})

describe("the prose policy and the machine-readable policy cannot drift apart", () => {
  it("every allowlisted GHSA id also appears in AUDIT-POLICY.md", () => {
    const document = read(POLICY_DOC)
    for (const entry of policy().allowlist) {
      expect(
        document.includes(entry.ghsa),
        `${entry.ghsa} is allowlisted but is not mentioned in ${POLICY_DOC}. The prose is the ` +
          `half a human reads; an exception that exists only in the JSON is an undocumented one.`
      ).toBe(true)
    }
  })

  it("every GHSA id the prose names is either allowlisted or on the remediated register", () => {
    // THE OTHER DIRECTION, and the one the forward check cannot see. A document that names an
    // exception the JSON does not carry is a claim with no enforcement behind it — the reader
    // believes the advisory has a disposition and the gate never applies one. So the prose's id
    // set must partition exactly: allowlisted, or explicitly recorded as remediated.
    const allowlisted = new Set(policy().allowlist.map((entry) => entry.ghsa))
    const remediated = new Set<string>(REMEDIATED_IN_DOC.map((entry) => entry.ghsa))
    const unclassified = docGhsaIds().filter(
      (id) => !allowlisted.has(id) && !remediated.has(id)
    )
    expect(
      unclassified,
      `${POLICY_DOC} names ${unclassified.length} GHSA id(s) that are neither in ` +
        `${POLICY_JSON}'s allowlist nor on REMEDIATED_IN_DOC. Either add the entry (with a ` +
        `reason, a reach and an expiry) or record it as remediated with the evidence. An advisory ` +
        `discussed in prose with no disposition anywhere is the shape this gate exists to delete.`
    ).toEqual([])
  })

  it.each(REMEDIATED_IN_DOC)(
    "$ghsa is on the remediated register, and the register is live not decorative",
    ({ ghsa, marker, package: name }) => {
      // S1(f): an exclusion list is a LIVE CONTROL. Each of the three halves below fails on a
      // different kind of rot — the id silently leaving the prose, the id silently becoming an
      // acceptance, and the line that says "fixed" silently ceasing to say it. Without the third,
      // an id could migrate from the "upgraded" table into an acceptance paragraph and keep its
      // exemption from the reverse cross-reference above.
      const document = read(POLICY_DOC)
      expect(
        document.includes(ghsa),
        `${ghsa} is on REMEDIATED_IN_DOC but ${POLICY_DOC} no longer mentions it. Delete the ` +
          `register entry deliberately; do not leave an exemption for an id that is not there.`
      ).toBe(true)
      expect(
        policy().allowlist.map((entry) => entry.ghsa),
        `${ghsa} is recorded as remediated AND allowlisted. Those are contradictory dispositions.`
      ).not.toContain(ghsa)
      const citing = document.split("\n").filter((line) => line.includes(ghsa))
      expect(citing.length, `${ghsa} matched no line — the line split broke`).toBeGreaterThan(0)
      expect(
        citing.some((line) => line.includes(marker)),
        `no line naming ${ghsa} in ${POLICY_DOC} also says "${marker}", so nothing in the prose ` +
          `still presents it as remediated for ${name}. If the advisory came back, it needs an ` +
          `allowlist entry, not a register entry.`
      ).toBe(true)
    }
  )

  it.each(SHIPPED_PACKAGES)(
    "%s's prose section states the same reach and the same expiry as the JSON",
    (name) => {
      // S5, relational rather than literal: the fact is read from BOTH files that own it and
      // compared, instead of being typed into this test twice. The two most gameable fields are
      // `reach` (it decides how alarming the entry reads) and `expires` (it decides whether the
      // entry ever gets revisited), and a prose section that still says `build` / 2026-09-24 while
      // the JSON says `runtime` / 2027 is a policy that lies to its reader while passing its gate.
      const headings = [
        ...read(POLICY_DOC).matchAll(
          /^### `([^`]+)`[^\n]*reach `(runtime|build|dev)`[^\n]*expires \*\*(\d{4}-\d{2}-\d{2})\*\*/gm
        ),
      ].map((match) => ({ package: match[1], reach: match[2], expires: match[3] }))

      // The token floor for this parse (WR-11): a heading format change turns the matcher into one
      // that finds nothing, and a comparison over nothing passes.
      expect(
        headings.length,
        `${POLICY_DOC} yielded no "### \`pkg\` … reach \`x\` … expires **date**" heading at all. ` +
          `The heading format changed and this cross-check now compares empty sets. Re-anchor the ` +
          `pattern; do not delete the check.`
      ).toBeGreaterThanOrEqual(SHIPPED_PACKAGES.length)

      const heading = headings.find((row) => row.package === name)
      expect(heading, `${POLICY_DOC} has no reach/expiry heading for ${name}`).toBeDefined()

      const entries = SHIPPED_ENTRIES.filter((entry) => entry.package === name)
      expect([...new Set(entries.map((entry) => entry.reach))]).toEqual([heading?.reach])
      expect([...new Set(entries.map((entry) => entry.expires))]).toEqual([heading?.expires])
    }
  )

  it("the prose claim that there are ZERO dev-reach acceptances is true of the JSON", () => {
    // A claim in a policy document is a liability unless something checks it. This one is
    // load-bearing: `dev` is the reach a reader discounts fastest, so "there are none" is the
    // sentence that would be quietly falsified first. Asserted in both directions — if a dev-reach
    // acceptance is ever taken, this test names the prose line that has to change with it.
    const document = read(POLICY_DOC)
    expect(
      document.includes("There are currently ZERO dev-reach acceptances"),
      `${POLICY_DOC} no longer states its dev-reach position; this assertion has nothing to check.`
    ).toBe(true)
    expect(
      SHIPPED_ENTRIES.filter((entry) => entry.reach === "dev").map((entry) => entry.label),
      `${POLICY_DOC} says there are ZERO dev-reach acceptances and ${POLICY_JSON} carries some. ` +
        `47-CONTEXT's rule is that "dev-only" must be true and SHOWN to be true; update the prose ` +
        `with the reconciliation that justifies the classification, in the same commit.`
    ).toEqual([])
  })

  it("every package named in the allowlist appears in the prose too", () => {
    const document = read(POLICY_DOC)
    for (const name of new Set(policy().allowlist.map((entry) => entry.package))) {
      expect(document.includes(name), `${POLICY_DOC} never mentions ${name}`).toBe(true)
    }
  })

  it("AUDIT-POLICY.md states the things CONTEXT requires it to state", () => {
    const document = read(POLICY_DOC)
    // Each token is asserted individually so a failure names the missing one instead of reporting
    // "the policy document is wrong" — the `RUNBOOK_REQUIRED_TOKENS` register shape from
    // `deployment-docs-accuracy.test.ts:170-204`.
    const required = [
      "**upgraded**", // the three dispositions
      "**replaced**",
      "**accepted with a reason**",
      "an expired entry fails the gate", // the expiry rule
      "Runtime vs build vs dev — a judgement per advisory, not a flag", // the reach rule, by heading
      "from the closed set `runtime` / `build` / `dev`", // ...and the closed set it draws on
      "Reach is **reconciled, never asserted**", // ...and how a classification earns belief
      "`npm audit --omit=dev` is not this policy", // reach is a judgement, not a flag
      "required `ci` job", // where the gate runs
      "non-blocking gate is a vacuous gate",
      "`npm audit fix` is forbidden", // the prohibition
      "it adds `rolldown`", // ...with its measured reason
      "npm install --legacy-peer-deps", // the three-trees limitation
      "It is **not** evaluated against the production image",
      "conservative over-approximation",
      "event-stream@4.0.1", // why no off-the-shelf tool
    ] as const
    for (const token of required) {
      expect(document.includes(token), `${POLICY_DOC} does not state: ${token}`).toBe(true)
    }
  })

  it("the token list above is a real matcher, not one that matches anything", () => {
    // Phase 46 WR-11, applied: a scan whose tokens no longer occur goes green BECAUSE it broke.
    // The floor is that a token which is deliberately absent must be reported absent.
    const document = read(POLICY_DOC)
    expect(document.includes("this policy covers the production image")).toBe(false)
    expect(document.includes("run `npm audit fix` to remediate")).toBe(false)
  })

  it("does not conflate itself with a disclosure policy", () => {
    // A root SECURITY.md, if one is ever added, is how the outside world reports a vulnerability
    // IN this project. This document is what this project does about vulnerabilities in its
    // dependencies. The distinction has to be written down or the next person merges them.
    expect(read(POLICY_DOC)).toContain("disclosure* policy")
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. The wiring: the script is reachable, and it is reachable the way CI reaches it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the gate is wired the way CI invokes it", () => {
  it("package.json exposes `security:audit` and it runs the in-repo script", () => {
    expect(packageScripts()["security:audit"]).toBe(`node ${AUDIT_SCRIPT}`)
  })

  it("the audit script is not chained into `npm test`", () => {
    // The base project must stay offline-clean; `npm test` must not reach the registry.
    const scripts = packageScripts()
    expect(scripts.test).toBeDefined()
    expect(scripts.test).not.toContain("security:audit")
    expect(scripts.test).not.toContain("audit-policy")
  })

  it("the audit script imports nothing outside node: builtins", () => {
    // ZERO new dependencies is the decision, and a decision nothing asserts is a preference.
    const source = read(AUDIT_SCRIPT)
    const specifiers = [...source.matchAll(/^import\s[^\n]*from\s+["']([^"']+)["']/gm)].map(
      (match) => match[1]
    )
    expect(specifiers.length, "no imports parsed — the matcher broke, not the file").toBeGreaterThan(
      0
    )
    expect(specifiers.filter((specifier) => !specifier.startsWith("node:"))).toEqual([])
  })

  it("the audit script keeps its invocation guard, which is what makes this file safe", () => {
    const source = read(AUDIT_SCRIPT)
    expect(source).toContain("import.meta.main === true")
    expect(source, "the FATAL-on-undefined branch is what stops it guessing").toContain(
      "import.meta.main !== false"
    )
    // `process.exit(1)` truncates buffered stdout, and CI reads the output.
    expect(source).toContain("process.exitCode")
    expect(source).not.toContain("process.exit(")
  })

  it("the audit script still says out loud that npm's exit code is not the verdict", () => {
    // The claim in the header is load-bearing: `npm audit` exits 1 whenever ANY advisory exists,
    // so a future refactor that started branching on it would make this gate permanently red and
    // then permanently deleted.
    expect(read(AUDIT_SCRIPT)).toContain("NOT the verdict")
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4b. THIS GATE ITSELF: offline, and anchored the way it claims to be anchored (T-47-10-05).
//
//     Asserted from this file's own source, so the two properties that make it trustworthy cannot
//     be edited away in a diff nobody reads. Both are structural rather than textual: the header
//     above HAS to contain the words `child_process` and `npm audit` to explain why the code does
//     not, so a raw text scan would either fail on its own documentation or be reworded into
//     uselessness. S4, choosing deliberately and saying so.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("this gate is offline, and its anchors are anchored", () => {
  it("the self-read reached this file's real text — the floor before the negatives", () => {
    // WR-11's half: a scan of an empty string satisfies every "does not contain" below. The two
    // tokens are ones that must be present for the negatives to mean anything at all.
    const source = read(SELF_PATH)
    expect(source.length, `${SELF_PATH} read as ${source.length} characters`).toBeGreaterThan(5000)
    expect(source, `${SELF_PATH} does not contain its own describe titles — wrong file`).toContain(
      "this gate is offline, and its anchors are anchored"
    )
  })

  it("imports exactly the modules it is allowed to import, asserted BY VALUE", () => {
    // The structural form of "runs no `npm audit`, opens no socket, reads no `.env`". A file that
    // imports only `node:fs`, `node:path`, `vitest`, `semver` and the evaluator's pure surface has
    // no way to reach a network or a process, whatever its bodies say. Adding
    // `node:child_process`, `node:net`, `undici` or a fetch polyfill goes red HERE, which is the
    // one place a reviewer of a supply-chain gate will look.
    const specifiers = importSpecifiers(read(SELF_PATH))
    expect(specifiers.length, "no imports parsed — the matcher broke, not the file").toBeGreaterThan(
      0
    )
    expect(specifiers).toEqual([...ALLOWED_SELF_IMPORTS])
  })

  it("imports the evaluator by relative path, not by the `@/` alias", () => {
    // `vitest.config.ts:31-33` resolves `@/` to `./src` only, so an aliased import of a
    // `scripts/*.mjs` does not resolve at all — it would fail at collection rather than silently,
    // but the intent is worth pinning: this gate exercises PRODUCTION logic, not a copy of it.
    expect(importSpecifiers(read(SELF_PATH))).toContain("../../../scripts/audit-policy.mjs")
  })

  it(`reads its inputs through exactly one ${READ_CALL_TOKEN} call site`, () => {
    // A second, unaudited read is how a `.env` or a checked-in fixture arrives later. One helper,
    // named path constants, and this count is what keeps it that way. The searched token is
    // assembled at runtime for the S1(e) reason: this file is the file that makes the call.
    const code = codeLines(read(SELF_PATH))
    const reads = code.filter((line) => line.includes(READ_CALL_TOKEN))
    expect(
      reads.length,
      `${SELF_PATH} has ${reads.length} non-comment ${READ_CALL_TOKEN} call sites. Every file ` +
        `this gate reads goes through the single \`read()\` helper and a named path constant; a ` +
        `second call site is where an unaudited input arrives. Found: ${reads.join(" | ")}`
    ).toBe(1)
  })

  it("the comment filter the scan above depends on does not blank real code", () => {
    // S4's second half, and the WR-11 lesson: a stripper that returned nothing would make the
    // count above zero, and `toBe(1)` would then fail LOUDLY — but a stripper that returned
    // everything would make it 2 and be "fixed" by relaxing the number. So both directions are
    // pinned: the filter keeps the code line it must keep, and drops the comment line it must drop.
    const code = codeLines(read(SELF_PATH))
    expect(
      code.some((line) => line.includes(`${READ_CALL_TOKEN}path.join(`)),
      "the comment filter dropped the read helper itself, so the scan above has no input"
    ).toBe(true)
    expect(
      code.some((line) => line.trim().startsWith("* ")),
      "the comment filter kept a doc-comment line, so the scan above counts prose as code"
    ).toBe(false)
  })

  it(`anchors ${FAIL_ON_TOKEN} with an array equality and never with ${CONTAINMENT_MATCHER}`, () => {
    // THE ANCHOR, asserted on itself. Containment would permit
    // ["critical","high","moderate"] — a policy that claims one thing and gates another — and it
    // is the single cheapest edit that would leave every other assertion in this file green.
    const lines = read(SELF_PATH).split("\n")
    const both = lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(
        (row) => row.line.includes(FAIL_ON_TOKEN) && row.line.includes(CONTAINMENT_MATCHER)
      )
      .map((row) => `${SELF_PATH}:${row.number}`)
    expect(
      both,
      `a line applies a containment matcher to ${FAIL_ON_TOKEN}. Use an array equality: ` +
        `containment lets a WIDENED severity list pass, and the claim about what the gate catches ` +
        `lives in ${POLICY_DOC}.`
    ).toEqual([])

    // The positive half. Without it, renaming the field would satisfy the negative above forever.
    const anchored = lines.filter(
      (line) => line.includes(FAIL_ON_TOKEN) && line.includes("toEqual")
    )
    expect(
      anchored.length,
      `no line asserts ${FAIL_ON_TOKEN} with toEqual, so the negative above matches nothing and ` +
        `passes vacuously. The field was almost certainly renamed: re-anchor FAIL_ON_TOKEN.`
    ).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4c. The allowlist still has something to suppress (S1(f), the offline half).
//
//     The network half — "is every allowlisted advisory still REPORTED?" — is
//     `staleAllowlistProblems` in the script. The offline half is cheaper and catches the coarser
//     case: an entry for a package this project no longer installs covers nothing at all, and
//     reads as a live, reasoned acceptance forever.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("every allowlisted package is still in the tree the policy claims to cover", () => {
  it(`the lockfile parse reached a real tree (>= ${MIN_LOCKFILE_PACKAGES} packages)`, () => {
    expect(
      lockfilePackageNames().size,
      `${LOCKFILE} yielded almost nothing; the per-package assertions below would pass over an ` +
        `empty set. Measured 2026-08-25: 1286 keys.`
    ).toBeGreaterThanOrEqual(MIN_LOCKFILE_PACKAGES)
  })

  it.each(SHIPPED_PACKAGES)("%s is installed, so its entries suppress a real advisory", (name) => {
    expect(
      lockfilePackageNames().has(name),
      `${POLICY_JSON} allowlists advisories against ${name}, which ${LOCKFILE} no longer ` +
        `contains. The entries cover nothing while reading as live acceptances — delete them, and ` +
        `their prose section, in the same commit.`
    ).toBe(true)
  })

  it.each(REJECTED_TOOLING)("%s is NOT installed — the zero-new-dependencies decision", (name) => {
    // The known-negative half of the same matcher: a lockfile reader that answered `true` for
    // everything would satisfy every assertion above. It also pins 47-09's decision — an audit
    // gate that installs 30 packages, one of which reaches `event-stream@4.0.1`, is self-defeating.
    expect(
      lockfilePackageNames().has(name),
      `${name} is in ${LOCKFILE}. 47-09 chose an in-repo evaluator over every off-the-shelf one ` +
        `precisely to avoid this; see ${POLICY_DOC} § on tooling.`
    ).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4d. THE CROSS-FILE CONTROL. Fixtures prove the evaluator's rules; only this proves the
//     evaluator can read the file a real consumer reads.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A synthetic `npm audit --json` document in which every shipped allowlist entry is reported.
 *
 * Built FROM the shipped allowlist rather than checked in, for the reason
 * `migrate-from-zero-fences.test.ts:193-204` gives: a fixture is a copy, and a copy stops tracking
 * the thing it copied. Every advisory here is at a `failOn` severity, so `evaluatePolicy` has to
 * match all 39 against the real file — which means a policy file the evaluator cannot parse, or an
 * id that does not match the way the evaluator matches it, is red in vitest rather than only in CI
 * on the next push.
 */
function auditDocumentCoveringShippedAllowlist() {
  const vulnerabilities: Record<string, unknown> = {}
  for (const entry of policy().allowlist) {
    const bucket = (vulnerabilities[entry.package] ??= {
      name: entry.package,
      severity: "high",
      via: [] as unknown[],
    }) as { via: unknown[] }
    bucket.via.push({
      source: 1,
      name: entry.package,
      title: `synthetic report of ${entry.ghsa}`,
      url: `https://github.com/advisories/${entry.ghsa}`,
      severity: "high",
    })
  }
  return { vulnerabilities }
}

describe("the evaluator applied to the SHIPPED policy file, not to a fixture of it", () => {
  it("reports nothing when every shipped entry's advisory is reported", () => {
    expect(
      evaluatePolicy(auditDocumentCoveringShippedAllowlist(), policy(), new Date()),
      `the shipped ${POLICY_JSON} does not satisfy its own evaluator against a document in which ` +
        `every one of its entries is reported. Either an entry is malformed or expired, or the ` +
        `evaluator and the file disagree about the shape of an entry.`
    ).toEqual([])
  })

  it("reports the uncovered advisory when one shipped entry is removed", () => {
    // The complement, and the half that makes the pass above mean something: a document every
    // possible policy accepts would satisfy it. Removing one real entry must produce exactly one
    // problem, naming exactly that advisory.
    const shipped = policy()
    const [dropped, ...rest] = shipped.allowlist
    const problems = evaluatePolicy(
      auditDocumentCoveringShippedAllowlist(),
      { ...shipped, allowlist: rest },
      new Date()
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(dropped.ghsa)
    expect(problems[0]).toContain("NO recorded disposition")
  })

  it("the synthetic document really carries every shipped id — the floor", () => {
    // Without this, a builder that produced an EMPTY document would make the pass above vacuous:
    // no advisories reported means no offender can be missing.
    const rows = collectAdvisories(auditDocumentCoveringShippedAllowlist())
    expect(rows.map((row) => row.ghsa).sort()).toEqual(
      policy()
        .allowlist.map((entry) => entry.ghsa)
        .sort()
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 5. D-47-01-A. The `overrides.vite` constraint, which npm does not persist into the lockfile and
//    which nothing in this repository defended until now.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the overrides.vite constraint is defended (D-47-01-A)", () => {
  /**
   * WHY THIS LIVES IN THE AUDIT-POLICY FILE. `overrides: { "vite": "^7.0.0" }` was added by 47-01
   * to clear five vite advisories, and it is the only thing holding vite on the 7.x line:
   * `vitest@4.1.x` declares `vite: "^6 || ^7 || ^8"`, so deleting those three lines lets any
   * re-resolution pull `vite@8.x` and 32 new lockfile keys with it (`rolldown` plus sixteen
   * platform bindings, `@oxc-project/types`, `@rolldown/pluginutils`, a nested `lightningcss`
   * set) — the transitive major refresh that is explicitly out of scope, arriving silently.
   *
   * npm does NOT persist `overrides` into `package-lock.json` (verified: zero occurrences,
   * lockfileVersion 3), so the lockfile does not self-document the constraint and nothing failed
   * if the block were removed. That makes it an ADVISORY-REMEDIATION constraint with no gate,
   * which is this file's subject matter.
   *
   * Asserted as a semver SUBSET rather than a string comparison, so `^7.1.0`, `7.x` or `>=7 <8`
   * all pass and only a range that admits 8.x fails. Observed red with the override deleted before
   * it was trusted.
   */
  function manifest(): { overrides?: Record<string, string> } {
    return JSON.parse(read(PACKAGE_JSON)) as { overrides?: Record<string, string> }
  }

  it("package.json still declares an overrides.vite range at all", () => {
    expect(
      manifest().overrides?.vite,
      `package.json must keep \`overrides.vite\`; it is the only thing holding vite below 8, and ` +
        `npm does not persist overrides into package-lock.json, so nothing else records it.`
    ).toBeDefined()
  })

  it("that range admits no vite 8.x or later", () => {
    const range = manifest().overrides?.vite ?? ""
    expect(
      semver.subset(range, "<8.0.0"),
      `overrides.vite is "${range}", which admits vite >= 8. vite 8 brings rolldown and ~32 ` +
        `lockfile keys — the transitive major refresh v1.4 excludes. Widen this deliberately or ` +
        `not at all.`
    ).toBe(true)
  })

  it("the subset assertion is a real one — it rejects the ranges it is supposed to", () => {
    // Anti-vacuity for the assertion above: `semver.subset` returning true for everything would
    // make it useless, and this is the cheapest possible proof that it does not.
    expect(semver.subset("^7.0.0", "<8.0.0")).toBe(true)
    expect(semver.subset("^8.0.0", "<8.0.0")).toBe(false)
    expect(semver.subset("^6.0.0 || ^7.0.0 || ^8.0.0", "<8.0.0")).toBe(false)
    expect(semver.subset("*", "<8.0.0")).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 6. `collectAdvisories`' granularity, which decides how many entries the allowlist needs.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the policy is applied at package severity, deliberately", () => {
  it("reports every advisory of a high package, including its moderate ones", () => {
    // This is the decision that makes 39 entries necessary instead of 16. `nodemailer` is `high`
    // as a package but only ONE of its six advisories is individually `high`; `next` is `high`
    // with 12 of 28. Filtering on the per-advisory severity would leave the other 21 with no
    // recorded disposition at all while the gate stayed green — and 47-CONTEXT requires a
    // disposition for every critical/high advisory, not only for the one that set the aggregate.
    const rows = collectAdvisories({
      vulnerabilities: {
        widget: {
          severity: "high",
          via: [
            { url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "high", title: "a" },
            { url: "https://github.com/advisories/GHSA-dddd-eeee-ffff", severity: "moderate", title: "b" },
            "some-transitive-string-link",
          ],
        },
      },
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.severity)).toEqual(["high", "high"])
    expect(rows.map((row) => row.advisorySeverity)).toEqual(["high", "moderate"])
  })

  it("deduplicates an advisory reported twice for one package", () => {
    const rows = collectAdvisories({
      vulnerabilities: {
        widget: {
          severity: "high",
          via: [
            { url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "high" },
            { url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "high" },
          ],
        },
      },
    })
    expect(rows).toHaveLength(1)
  })
})
