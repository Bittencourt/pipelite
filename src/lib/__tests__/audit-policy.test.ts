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

  it("gives every entry a well-formed GHSA id, and no id twice", () => {
    const ids = policy().allowlist.map((entry) => entry.ghsa)
    for (const id of ids) expect(id, `${id} is not a GHSA id`).toMatch(GHSA_PATTERN)
    expect(new Set(ids).size, "an advisory has two entries; exactly one disposition each").toBe(
      ids.length
    )
  })

  it("gives every entry a reach from the closed set", () => {
    for (const entry of policy().allowlist) {
      expect(VALID_REACH as string[], `${entry.ghsa} reach=${entry.reach}`).toContain(entry.reach)
    }
  })

  it("gives every entry a substantive, non-forbidden reason", () => {
    for (const entry of policy().allowlist) {
      expect(entry.reason.trim().length, `${entry.ghsa} reason too short`).toBeGreaterThanOrEqual(
        MIN_REASON_LENGTH
      )
      expect(FORBIDDEN_REASONS as string[], `${entry.ghsa}`).not.toContain(
        entry.reason.trim().toLowerCase()
      )
    }
  })

  it("gives every entry an expiry that is a bare date and has not passed", () => {
    // The one assertion in this file that is time-dependent BY DESIGN. It goes red on the day an
    // acceptance runs out, which is the entire mechanism: the suite is what brings the decision
    // back. Do not "fix" a red here by editing the date — re-read the evidence first.
    const today = new Date()
    for (const entry of policy().allowlist) {
      expect(entry.expires, `${entry.ghsa} expires`).toMatch(EXPIRES_PATTERN)
      expect(
        Date.parse(`${entry.expires}T00:00:00Z`),
        `${entry.ghsa} (${entry.package}) expired on ${entry.expires}. Take the fix, or re-state ` +
          `the reason against today's code and set a new date — see ${POLICY_DOC}.`
      ).toBeGreaterThan(today.getTime())
    }
  })

  it("names a package for every entry", () => {
    for (const entry of policy().allowlist) {
      expect(entry.package.trim().length, `${entry.ghsa} has no package`).toBeGreaterThan(0)
    }
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
