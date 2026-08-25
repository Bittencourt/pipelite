#!/usr/bin/env node
/**
 * Apply this repository's stated advisory policy to the advisories `npm audit` reports for
 * `package-lock.json`, and exit 0 or 1 on the POLICY's verdict rather than on npm's.
 *
 * Run it with `npm run security:audit`. Plain ESM, bare `node`, ZERO dependencies — the only
 * imports are `node:child_process`, `node:fs` and `node:path`. That is a deliberate constraint,
 * not an accident of scope; see WHY THERE IS NO OFF-THE-SHELF TOOL below.
 *
 * WHY THIS EXISTS
 *   SEC-05. `npm audit` on this tree reports 14 vulnerable packages carrying 47 distinct
 *   advisories. An unfiltered `--audit-level=high` gate on a tree like that is either
 *   permanently red (and therefore turned off within a week) or permanently disabled (and
 *   therefore vacuous). What makes an advisory gate usable is a POLICY: a per-advisory recorded
 *   disposition — upgraded, replaced, or accepted with a stated reason and an EXPIRY — so the
 *   gate fires on the advisories nobody has looked at and stays quiet about the ones somebody
 *   has. The policy lives at AUDIT-POLICY.md (prose, for humans) with audit-policy.json beside
 *   it (the machine-readable allowlist). This script is the thing that enforces them.
 *
 * WHAT IT EVALUATES — AND WHAT IT DOES NOT
 *   `npm audit` here resolves the tree from `package-lock.json`: tree #1 of the three that
 *   exist in this repository. Tree #2 is the Docker builder stage, produced by
 *   `npm install --legacy-peer-deps` at Dockerfile:24, which is NOT lockfile-exact by contract.
 *   Tree #3 is the runtime image, narrowed again by Next's standalone trace. So this gate is a
 *   CONSERVATIVE OVER-APPROXIMATION of the production image's advisory surface for the packages
 *   the two trees share: it can report an advisory in a package the image does not ship, and it
 *   cannot by itself prove which version the image resolved. AUDIT-POLICY.md § "What tree this
 *   policy evaluates" states this at length. Do not read a green run here as a statement about
 *   the production image.
 *
 * WHY THE CHILD'S EXIT CODE IS NOT THE VERDICT
 *   `npm audit` exits 1 whenever ANY advisory exists at ANY severity. On this tree that is
 *   permanently true — there are three `low` advisories with no fix in range — so the child's
 *   exit code cannot distinguish "14 advisories, every critical/high one disposed" from "one
 *   unallowlisted critical". It is therefore CAPTURED, PRINTED, and never branched on; the
 *   verdict comes from the parsed document alone, and the failure text says so out loud. This is
 *   the same shape as scripts/migrate-from-zero.mjs:573-624 / :1144-1149, where `drizzle-kit
 *   migrate` prints the identical success line for 0 applied migrations and for 20.
 *   stderr is echoed through VERBATIM: on a network failure, npm's stderr is the only diagnosis.
 *
 * WHY THE STALE-ENTRY CHECK LIVES HERE AND NOT IN THE VITEST GATE
 *   An allowlist entry whose advisory has since been FIXED is a silent no-op that still reads as
 *   a live exception, and finding one requires comparing the allowlist against a LIVE audit —
 *   i.e. the network. src/lib/__tests__/audit-policy.test.ts holds every assertion that can be
 *   made offline (entry shape, reason quality, expiry in the future, failOn exact, the prose
 *   cross-reference) because vitest.config.ts's base project must stay offline-clean and runs on
 *   every commit. The one assertion that needs the registry lives HERE, in the script CI invokes.
 *   Neither half is sufficient alone, and the split is stated in both file headers.
 *
 * WHY THERE IS NO OFF-THE-SHELF TOOL
 *   `audit-ci` was last published 2024-07-03 and declares `event-stream@4.0.1` — the package at
 *   the centre of the canonical npm supply-chain compromise — as a direct dependency;
 *   `better-npm-audit` is 23 months stale on the deprecated `lodash.get`; `osv-scanner` is a Go
 *   binary and is not on npm. Answering a supply-chain requirement by installing 30 packages,
 *   one of them that one, from a tool nobody has published in two years is self-defeating.
 *   `npm audit --json` already emits everything a policy needs. Hence: in repo, zero deps.
 *
 * HOW TO BREAK IT ON PURPOSE
 *   The three controls that must be observed red before this file is trusted are kept
 *   PERMANENTLY in src/lib/__tests__/audit-policy.test.ts (a `dev-only` reason, a back-dated
 *   `expires`, an emptied `failOn`), modelled on node-engines-floor.test.ts's NC-3, so they
 *   cannot rot out of the repository. Two more that need this file specifically:
 *     NC-DOC-EMPTY: feed `assertAuditDocument` a document whose `vulnerabilities` is `{}` while
 *       `metadata` still claims 14. Expect a Fatal naming the reconciliation mismatch — NOT a
 *       clean pass. This is the single most likely way this gate ships vacuous, because a network
 *       error, a proxy interception or a schema change all produce zero offenders and exit 0.
 *     NC-DOC-TINY: feed it `{"vulnerabilities":{},"metadata":{"vulnerabilities":{...all zero},
 *       "dependencies":{"total":3}}}`. Expect a Fatal on MIN_PACKAGES_AUDITED — a self-consistent
 *       but empty document is still not evidence of a clean tree.
 *   Both are exercised inline in 47-09-SUMMARY.md with their verbatim output.
 */

import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// ---------------------------------------------------------------------------
// Anti-vacuity floors. An empty advisory document has zero offenders and satisfies every
// negative assertion below it perfectly — that is the exact shape of the six gates v1.3
// shipped that could not fail. Both numbers were measured on 2026-08-25 against this tree
// with `npm audit --json` on npm 11.10.0, and both floors sit BELOW the measurement so
// ordinary movement does not trip them while a parse that yielded nothing does.
// ---------------------------------------------------------------------------
/**
 * Distinct GHSA ids parsed out of the whole document, all severities.
 *
 * Measured 2026-08-25: 47 (next 28, nodemailer 6, postcss 4, sharp 1, and 8 across the
 * moderate/low packages).
 *
 * THIS FLOOR IS DELIBERATELY LOW, and the reason matters. Unlike a schema's table count, the
 * advisory count is SUPPOSED to fall to nearly nothing — that is what this whole phase is for.
 * Full remediation of every `failOn` advisory would leave 8 (the moderate and low ones with no
 * fix in range), so any floor above 8 would fatal on success and be "fixed" by the next person
 * lowering it, which is the failure mode the floor mechanism exists to prevent arriving through
 * the floor mechanism.
 *
 * DO NOT LOWER IT BELOW 3, and note what an earlier version of this comment got wrong (WR-02).
 * MIN_PACKAGES_AUDITED and the histogram reconciliation catch a TRUNCATED or DOCTORED document —
 * `{"vulnerabilities":{}}` with a non-zero `metadata` fails the reconciliation, and a tiny tree
 * fails the package floor. They do NOT catch the case that matters most here: a fully RESOLVED
 * tree for which the registry, an intercepting proxy, or a mirror with no advisory database
 * returned zero advisories. That document reconciles (0 === 0) and clears MIN_PACKAGES_AUDITED
 * (1285 >= 500), and THIS floor is the only control that fires on it. Verified:
 *
 *     vulnerabilities {}, histogram all-zero, dependencies.total 1285
 *       -> fatal: "only 0 distinct advisory id(s) were parsed ... the floor is 3"
 *
 * `staleAllowlistProblems` currently backstops it by reporting all 39 entries as stale — but only
 * while the allowlist is non-empty, which is explicitly the state this project is working toward.
 * If this floor is ever lowered, replace that guard in the same commit.
 */
const MIN_ADVISORIES_PARSED = 3

/**
 * `metadata.dependencies.total` — how many packages npm says it audited.
 *
 * Measured 2026-08-25: 1285 (prod 528 / dev 580 / optional 214 / peer 36).
 *
 * This is the floor that actually catches the empty-document case, because it does NOT fall
 * when advisories are remediated. A `{}` document, a document whose `metadata` was truncated,
 * and a document produced against an unresolved tree all land far below it.
 */
const MIN_PACKAGES_AUDITED = 500

/** Appended to every floor failure. The floors are tripwires for a parse that yielded nothing,
 *  not assertions about how many advisories a tree ought to have, and the difference decides
 *  whether the next reader fixes the parse or lowers the bar. */
const FLOOR_ADVICE =
  " This is a tripwire for an audit document that yielded nothing — a network failure, a proxy " +
  "interception or an `npm audit --json` schema change all produce zero offenders and exit 0. " +
  "It is NOT an assertion about how many advisories this tree should have. If the number " +
  "legitimately moved, change the floor AND record the new measurement in the comment beside it."

/** The severity keys `npm audit --json` uses, in ascending order. */
export const SEVERITIES = Object.freeze(["info", "low", "moderate", "high", "critical"])

/**
 * The `failOn` set this repository's policy is required to carry, asserted as a SET EQUALITY and
 * not as a `contains` — because an emptied `failOn` satisfies "no unallowlisted critical or high
 * advisory" perfectly, which is the classic v1.3 vacuous shape and is threat T-47-09-02.
 *
 * Order is not semantic here (`["high","critical"]` is the same policy), so the comparison is on
 * the set. Tightening the policy to include `moderate` therefore means editing THIS line — which
 * is the point: widening what the gate catches should be a deliberate, reviewable act, and so
 * should narrowing it. src/lib/__tests__/audit-policy.test.ts additionally asserts the shipped
 * audit-policy.json carries exactly `["critical","high"]` in exactly that order.
 */
export const REQUIRED_FAIL_ON = Object.freeze(["critical", "high"])

/** The closed set of reach values. 47-CONTEXT: *"Distinguish runtime from build/dev-only
 *  dependencies explicitly. A transitive advisory reachable only from a build tool is a
 *  genuinely different risk from one in the server's request path, and the disposition should
 *  say which it is."* A free-text reach cannot be reconciled against anything. */
export const VALID_REACH = Object.freeze(["runtime", "build", "dev"])

/**
 * Reasons that are not reasons. 47-CONTEXT: *"a bare 'dev-only' is not a reason unless it is
 * true and shown to be true."* Compared case-insensitively against the trimmed reason, so
 * `"Dev-Only"` and `"  n/a  "` are caught too.
 *
 * Note what this list is NOT: it is not a filter that makes a reason good. It rules out four
 * measured ways of writing nothing. MIN_REASON_LENGTH rules out a fifth. The remaining quality
 * bar — name the call site with a `file:line`, name the measurement that supports the claim,
 * name the alternative that was rejected and why — is enforced by review, and AUDIT-POLICY.md
 * § "What a reason has to do" states it so a reviewer has something to hold an entry against.
 */
export const FORBIDDEN_REASONS = Object.freeze(["dev-only", "n/a", "wontfix", "see above"])

/**
 * Shortest acceptable `reason`, in characters after trimming.
 *
 * 80 is roughly one full line of prose. It cannot make a reason true, but it does exclude the
 * whole family of one-word dismissals that FORBIDDEN_REASONS enumerates only four of — and the
 * shortest reason currently shipped in audit-policy.json is well above it, so this is a floor
 * on writing nothing rather than a constraint on writing tersely.
 */
export const MIN_REASON_LENGTH = 80

/** GHSA ids are `GHSA-` plus three lowercase base32-ish quads. A CVE id, a bare number or an
 *  advisory URL must NOT satisfy this: the allowlist is keyed on the id `npm audit` reports, and
 *  an entry keyed on anything else silently covers nothing while reading as an exception. */
export const GHSA_PATTERN = /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/

/** `expires` must be a bare calendar date. A full timestamp, `"never"`, or `"2026-13-40"` would
 *  each parse or fail in a different way, and an expiry the reader cannot compare at a glance is
 *  an expiry nobody revisits.
 *
 *  This pattern is NOT a calendar check and must not be read as one: it admits `2026-02-31`, which
 *  `Date.parse` then rolls over to 2026-03-03. `evaluatePolicy` round-trips the parse for exactly
 *  that reason (WR-12). */
export const EXPIRES_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * The longest an acceptance may run, in days from today.
 *
 * `AUDIT-POLICY.md` § "The expiry rule" states two horizons — 30 days where a non-breaking fix is
 * measured available, 90 days where the only fix is a breaking major with reach evidence. 90 is the
 * outer bound, and it is ENFORCED here rather than left to prose.
 *
 * Why it has to be enforced: an unbounded `expires` satisfies every other control in this file.
 * `expires: "9999-12-31"` was verified to return `[]` from `evaluatePolicy` with every other axis
 * clean, so the single cheapest way to silence a critical advisory forever was a one-field data
 * edit that required no code change, broke no test, and turned no gate red — while still reading,
 * to any human, as a reasoned 30-day acceptance. That converts acceptance back into the permanent
 * silence this whole field exists to prevent, and it is the same shape as the threat
 * REQUIRED_FAIL_ON is pinned against.
 *
 * Measured from TODAY rather than from a decision date, because the JSON records no decision date;
 * that makes the bound strictly conservative (an entry only ever gets further inside it as time
 * passes) and it needs no second field that could itself be edited. Both live horizons in
 * `audit-policy.json` clear it: 2026-09-24 is 29 days out and 2026-11-23 is 89.
 *
 * The 30-day horizon is deliberately NOT enforced here. Which of the two applies depends on whether
 * a non-breaking fix is measured available, which is a judgement in the entry's `reason`, not a
 * machine-readable field — and a gate that guessed would either be wrong or would need a fourth
 * field nobody maintains. 90 is the bound that is true of every entry regardless.
 */
export const MAX_EXPIRY_DAYS = 90

/** `MAX_EXPIRY_DAYS` in milliseconds. Named so the message and the comparison cannot drift. */
export const MAX_EXPIRY_MS = MAX_EXPIRY_DAYS * 86_400_000

/** Where the machine-readable policy lives, relative to the repository root. Root, beside its
 *  prose, per 47-CONTEXT — and note that a root SECURITY.md is a *disclosure* policy and is a
 *  different document that must not be conflated with either of these. */
const POLICY_FILE = "audit-policy.json"
const POLICY_DOC = "AUDIT-POLICY.md"

/** Resolved from THIS FILE's location, not from `process.cwd()`, so `node scripts/audit-policy.mjs`
 *  works from anywhere in the tree. */
const REPO_ROOT = path.resolve(import.meta.dirname, "..")

export class Fatal extends Error {}

/**
 * Abort with a diagnosis. ALWAYS throws — the annotation is what makes that fact visible to
 * tooling and to the reader, so nobody guards a return value that cannot happen.
 *
 * @param {string} message
 * @returns {never}
 */
function fatal(message) {
  throw new Fatal(message)
}

function progress(line) {
  console.log(`-> ${line}`)
}

// ---------------------------------------------------------------------------
// Parsing `npm audit --json`
// ---------------------------------------------------------------------------

/**
 * The GHSA id at the end of an advisory URL, or `null` if there is no last segment to take.
 *
 * The id is the LAST PATH SEGMENT of `via[].url`
 * (`https://github.com/advisories/GHSA-xvch-5gv4-984h`). Empty segments are dropped so a
 * trailing slash does not yield `""`, and a query string or fragment is cut first so
 * `?foo=bar` does not become the id.
 *
 * It deliberately does NOT validate the shape. A `via` entry whose url is a CVE page, or is
 * missing entirely, must be REPORTED as an advisory with no usable id rather than silently
 * dropped from the offender list — dropping it is how a schema change turns this gate green.
 *
 * @param {unknown} url
 * @returns {string | null}
 */
export function ghsaFromViaUrl(url) {
  if (typeof url !== "string") return null
  const withoutQuery = url.split(/[?#]/)[0]
  const segments = withoutQuery.split("/").filter((segment) => segment.length > 0)
  if (segments.length === 0) return null
  return segments[segments.length - 1]
}

/**
 * Flatten an `npm audit --json` document into one row per (package, advisory).
 *
 * TWO THINGS TO KNOW ABOUT THE SEVERITY THIS RETURNS.
 *
 * 1. `severity` is the PACKAGE's aggregate severity — `vulnerabilities[pkg].severity` — which is
 *    also what `npm audit --audit-level=high` gates on. `advisorySeverity` carries the
 *    per-advisory value from `via[]` and is reported for context only. The policy is applied at
 *    package granularity ON PURPOSE: `nodemailer` is `high` as a package but only ONE of its six
 *    advisories is individually `high`, and 47-CONTEXT requires a recorded disposition for every
 *    advisory of every critical/high package, not only for the one that set the aggregate. The
 *    per-advisory reading would leave five of nodemailer's six, and sixteen of next's
 *    twenty-eight, with no disposition at all while the gate stayed green.
 * 2. `ghsa` may be `null`. See `ghsaFromViaUrl`; `evaluatePolicy` reports those rather than
 *    dropping them.
 *
 * `via` entries that are plain strings are the "vulnerable because its dependency is" links, not
 * advisories, and carry no id of their own — they are skipped, and the advisory they point at is
 * enumerated under the package that actually declares it.
 *
 * @param {unknown} auditJson
 * @returns {Array<{package: string, severity: string, advisorySeverity: string, ghsa: string | null, title: string, url: string}>}
 */
export function collectAdvisories(auditJson) {
  /** @type {Array<{package: string, severity: string, advisorySeverity: string, ghsa: string | null, title: string, url: string}>} */
  const rows = []
  const vulnerabilities =
    auditJson && typeof auditJson === "object" ? auditJson.vulnerabilities : undefined
  if (!vulnerabilities || typeof vulnerabilities !== "object" || Array.isArray(vulnerabilities)) {
    return rows
  }
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    const via = Array.isArray(entry?.via) ? entry.via : []
    const seen = new Set()
    for (const item of via) {
      if (!item || typeof item !== "object") continue
      const ghsa = ghsaFromViaUrl(item.url)
      const key = ghsa ?? ` no-url:${String(item.title ?? rows.length)}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        package: name,
        severity: String(entry?.severity ?? "unknown"),
        advisorySeverity: String(item.severity ?? "unknown"),
        ghsa,
        title: String(item.title ?? ""),
        url: String(item.url ?? ""),
      })
    }
  }
  return rows
}

/**
 * Refuse to evaluate a document that is empty, truncated or self-inconsistent.
 *
 * THIS IS THE MOST IMPORTANT FUNCTION IN THIS FILE and it is separate from `evaluatePolicy` on
 * purpose: an unusable audit document is not a policy problem to be listed alongside others, it
 * is a reason the run proves nothing at all, and it must stop the run rather than contribute a
 * line to a report that ends in a verdict. Phase 46 shipped a check that printed
 * `IDENTICAL (both empty — proves nothing)` for this class; 47-01 hit the two concrete shapes
 * below — an emptied `vulnerabilities` object, and a deleted `metadata.vulnerabilities.total` —
 * and each needed explicit detection.
 *
 * Four independent gates, in order of what they catch:
 *   SHAPE          `vulnerabilities` and `metadata` are the objects the documented schema says.
 *   HISTOGRAM      every severity key is present and numeric, including `total`.
 *   RECONCILIATION the per-severity package counts in `vulnerabilities` EQUAL the counts in
 *                  `metadata.vulnerabilities`. This is what catches the doctored / truncated
 *                  document that the floors alone cannot: `{"vulnerabilities":{}}` with an intact
 *                  metadata histogram passes both floors' *intent* and fails here.
 *   FLOORS         MIN_ADVISORIES_PARSED and MIN_PACKAGES_AUDITED.
 *
 * Pure, and exported, so the vitest gate and a one-line `node -e` can both break it on purpose
 * without touching the network.
 *
 * @param {unknown} auditJson
 * @returns {{advisoryIds: Set<string>, vulnerablePackages: number, dependenciesAudited: number}}
 */
export function assertAuditDocument(auditJson) {
  if (!auditJson || typeof auditJson !== "object" || Array.isArray(auditJson)) {
    fatal("the audit document is not a JSON object, so nothing can be evaluated from it.")
  }
  const vulnerabilities = auditJson.vulnerabilities
  if (!vulnerabilities || typeof vulnerabilities !== "object" || Array.isArray(vulnerabilities)) {
    fatal(
      "the audit document has no `vulnerabilities` object. `npm audit --json` always emits one, " +
        "even on a clean tree, so its absence means the output is an error document or a " +
        "different schema — not a clean tree." +
        FLOOR_ADVICE
    )
  }
  const metadata = auditJson.metadata
  if (!metadata || typeof metadata !== "object") {
    fatal(`the audit document has no \`metadata\` object.${FLOOR_ADVICE}`)
  }
  const histogram = metadata.vulnerabilities
  if (!histogram || typeof histogram !== "object") {
    fatal(`the audit document has no \`metadata.vulnerabilities\` histogram.${FLOOR_ADVICE}`)
  }
  for (const key of [...SEVERITIES, "total"]) {
    // `Object.hasOwn` first, for the same reason the reconciliation below uses it: `histogram` came
    // out of JSON.parse and therefore inherits Object.prototype, so a document that omitted a
    // severity key entirely would be read through the prototype chain. `Number.isFinite` happens to
    // reject the inherited function values, so this loop was safe today — but only by accident, and
    // "safe by accident" is what WR-01 was.
    if (!Object.hasOwn(histogram, key) || !Number.isFinite(histogram[key])) {
      fatal(
        `\`metadata.vulnerabilities.${key}\` is ${JSON.stringify(histogram[key])}, not a number. ` +
          `A missing histogram key reads as zero in JavaScript, which is indistinguishable from a ` +
          `clean tree.${FLOOR_ADVICE}`
      )
    }
  }
  const dependencies = metadata.dependencies
  if (!dependencies || typeof dependencies !== "object" || !Number.isFinite(dependencies.total)) {
    fatal(
      `\`metadata.dependencies.total\` is missing or not a number, so there is no evidence any ` +
        `package was audited at all.${FLOOR_ADVICE}`
    )
  }

  // RECONCILIATION. Count the packages in `vulnerabilities` by severity and require the counts to
  // equal the histogram npm reported beside them. Two independently-derived views of the same
  // fact; a document where either half was emptied, truncated or hand-edited disagrees.
  //
  // NULL-PROTOTYPE, and `Object.hasOwn` rather than `in`. WR-01: `severity in counted` was true for
  // every `Object.prototype` member name, so a package reporting severity "toString",
  // "constructor", "__proto__", "valueOf" or "hasOwnProperty" slipped past the "the schema changed"
  // fatal below — verified PASSED for all five while "catastrophic" correctly fatalled — and was
  // then excluded from both the per-severity reconciliation and `totalCounted`, leaving the document
  // reconciling cleanly. `counted["__proto__"] += 1` is additionally a silent no-op. Such a
  // package's advisories never met `failOnSet` either, so they got no disposition requirement at
  // all. This IS the schema-drift detector; it must detect drift into that name space too.
  /** @type {Record<string, number>} */
  const counted = Object.assign(
    Object.create(null),
    Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]))
  )
  for (const entry of Object.values(vulnerabilities)) {
    const severity = String(entry?.severity ?? "unknown")
    if (!Object.hasOwn(counted, severity)) {
      fatal(
        `a package in \`vulnerabilities\` reports severity ${JSON.stringify(severity)}, which is ` +
          `not one of ${SEVERITIES.join("/")}. The schema changed; this gate's severity ` +
          `comparisons cannot be trusted until it is re-read.`
      )
    }
    counted[severity] += 1
  }
  for (const severity of SEVERITIES) {
    if (counted[severity] !== histogram[severity]) {
      fatal(
        `the audit document does not reconcile: \`vulnerabilities\` contains ${counted[severity]} ` +
          `package(s) at ${severity} while \`metadata.vulnerabilities.${severity}\` says ` +
          `${histogram[severity]}. One of the two halves is empty, truncated or edited, so this ` +
          `run proves nothing.${FLOOR_ADVICE}`
      )
    }
  }
  const totalCounted = SEVERITIES.reduce((sum, severity) => sum + counted[severity], 0)
  if (totalCounted !== histogram.total) {
    fatal(
      `the audit document does not reconcile: ${totalCounted} vulnerable package(s) parsed but ` +
        `\`metadata.vulnerabilities.total\` says ${histogram.total}.${FLOOR_ADVICE}`
    )
  }

  const advisoryIds = new Set()
  for (const row of collectAdvisories(auditJson)) {
    if (row.ghsa !== null) advisoryIds.add(row.ghsa)
  }
  if (advisoryIds.size < MIN_ADVISORIES_PARSED) {
    fatal(
      `only ${advisoryIds.size} distinct advisory id(s) were parsed out of the audit document; ` +
        `the floor is ${MIN_ADVISORIES_PARSED} (measured 47 on 2026-08-25).${FLOOR_ADVICE}`
    )
  }
  if (dependencies.total < MIN_PACKAGES_AUDITED) {
    fatal(
      `npm reports auditing only ${dependencies.total} package(s); the floor is ` +
        `${MIN_PACKAGES_AUDITED} (measured 1285 on 2026-08-25). Either the tree did not resolve ` +
        `or the document is not this project's.${FLOOR_ADVICE}`
    )
  }

  return {
    advisoryIds,
    vulnerablePackages: totalCounted,
    dependenciesAudited: dependencies.total,
  }
}

// ---------------------------------------------------------------------------
// The policy evaluation. PURE — no I/O, injectable clock.
// ---------------------------------------------------------------------------

/**
 * Every way the allowlist and the reported advisories can disagree with the policy, as a list of
 * problem strings. `[]` means the tree satisfies the policy.
 *
 * No I/O, and `now` is a parameter rather than a `new Date()` inside — which is the only way a
 * test can assert the expiry semantics deterministically, without faking timers and without
 * writing a back-dated entry into the shipped audit-policy.json to prove the mechanism works.
 *
 * WHAT IT REPORTS, and why each one is here rather than being left to review:
 *
 *   failOn weakened      — an emptied or narrowed `failOn` satisfies every other check perfectly.
 *                          This is the anti-vacuity anchor (T-47-09-02).
 *   unallowlisted        — the advisory nobody has looked at. The gate's actual job.
 *   unresolvable id      — a `failOn` advisory whose `via[].url` yielded no GHSA id. Reported
 *                          rather than skipped: a schema change that removes `url` would
 *                          otherwise empty the offender list and turn this gate green.
 *   EXPIRED              — an acceptance that was never revisited. This is the mechanism that
 *                          makes "accepted with reason" a decision rather than permanent silence.
 *   duplicate ghsa       — two entries for one advisory. 47-CONTEXT requires EXACTLY ONE recorded
 *                          disposition per advisory; two is ambiguous, and the second can quietly
 *                          extend the first's expiry.
 *   malformed ghsa       — an entry keyed on a CVE id or a URL covers nothing while reading as a
 *                          live exception.
 *   bad reach            — reach outside {runtime, build, dev}. See VALID_REACH.
 *   thin / forbidden     — see MIN_REASON_LENGTH and FORBIDDEN_REASONS.
 *   malformed expires    — see EXPIRES_PATTERN.
 *
 * NOT reported here, because it needs the network: an allowlist entry whose advisory is no longer
 * reported at all (a STALE entry). `staleAllowlistProblems` does that, and `main` calls it with
 * the live audit.
 *
 * An entry's hygiene is checked whether or not its advisory is currently reported, so a broken
 * entry cannot hide behind a remediated advisory.
 *
 * @param {unknown} auditJson  a parsed `npm audit --json` document
 * @param {unknown} policy     a parsed audit-policy.json
 * @param {Date | string | number} [now] the clock, injectable
 * @returns {string[]}
 */
export function evaluatePolicy(auditJson, policy, now = new Date()) {
  /** @type {string[]} */
  const problems = []
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(nowMs)) {
    return [`the clock passed to evaluatePolicy is not a date: ${JSON.stringify(now)}`]
  }

  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return [`${POLICY_FILE} did not parse to an object, so no policy could be applied.`]
  }

  // ── failOn: the anti-vacuity anchor, asserted as a set equality ───────────────────────────
  const failOn = policy.failOn
  if (!Array.isArray(failOn) || failOn.some((severity) => typeof severity !== "string")) {
    problems.push(
      `${POLICY_FILE} \`failOn\` must be an array of severity strings; it is ` +
        `${JSON.stringify(failOn)}.`
    )
  } else {
    const declared = new Set(failOn)
    const required = new Set(REQUIRED_FAIL_ON)
    const missing = [...required].filter((severity) => !declared.has(severity))
    const extra = [...declared].filter((severity) => !required.has(severity))
    if (missing.length > 0 || extra.length > 0) {
      problems.push(
        `${POLICY_FILE} \`failOn\` is ${JSON.stringify(failOn)} but this repository's policy ` +
          `requires exactly ${JSON.stringify([...REQUIRED_FAIL_ON])}` +
          (missing.length ? `; missing ${missing.join(", ")}` : "") +
          (extra.length ? `; unexpected ${extra.join(", ")}` : "") +
          `. An emptied or narrowed \`failOn\` satisfies every other assertion in this file, ` +
          `which is why it is compared for equality and not for containment. To change the ` +
          `policy, edit REQUIRED_FAIL_ON in scripts/audit-policy.mjs in the same commit.`
      )
    }
  }
  const failOnSet = new Set(Array.isArray(failOn) ? failOn : [])

  // ── allowlist entry hygiene ──────────────────────────────────────────────────────────────
  const allowlist = policy.allowlist
  if (!Array.isArray(allowlist)) {
    problems.push(
      `${POLICY_FILE} \`allowlist\` must be an array; it is ${JSON.stringify(allowlist)}.`
    )
    return problems
  }

  /** @type {Map<string, object>} */
  const allowed = new Map()
  allowlist.forEach((entry, index) => {
    const label = `${POLICY_FILE} allowlist[${index}]`
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${label} is not an object: ${JSON.stringify(entry)}.`)
      return
    }
    const ghsa = entry.ghsa
    const where = typeof ghsa === "string" && ghsa.length > 0 ? `${label} (${ghsa})` : label

    if (typeof ghsa !== "string" || !GHSA_PATTERN.test(ghsa)) {
      problems.push(
        `${label} has \`ghsa\` ${JSON.stringify(ghsa)}, which is not a GHSA id matching ` +
          `${GHSA_PATTERN}. The allowlist is keyed on the id \`npm audit\` reports; an entry ` +
          `keyed on anything else covers nothing while reading as a live exception.`
      )
    } else if (allowed.has(ghsa)) {
      problems.push(
        `${where} is a DUPLICATE — ${ghsa} already has an entry. Exactly one recorded ` +
          `disposition per advisory; two is ambiguous, and the later one can quietly extend the ` +
          `earlier one's expiry.`
      )
    } else {
      allowed.set(ghsa, entry)
    }

    if (typeof entry.package !== "string" || entry.package.trim().length === 0) {
      problems.push(`${where} has no \`package\` name.`)
    }

    if (typeof entry.reach !== "string" || !VALID_REACH.includes(entry.reach)) {
      problems.push(
        `${where} has \`reach\` ${JSON.stringify(entry.reach)}; it must be one of ` +
          `${VALID_REACH.join(", ")}. An advisory reachable only from a build tool is a ` +
          `genuinely different risk from one in the server's request path, and the entry has to ` +
          `say which it is.`
      )
    }

    const reason = typeof entry.reason === "string" ? entry.reason.trim() : ""
    if (reason.length === 0) {
      problems.push(`${where} has no \`reason\`.`)
    } else if (FORBIDDEN_REASONS.includes(reason.toLowerCase())) {
      problems.push(
        `${where} gives ${JSON.stringify(reason)} as its reason, which is on FORBIDDEN_REASONS. ` +
          `A reason must say why the advisory does not apply to THIS project's usage — name the ` +
          `call site, the measurement, and the alternative that was rejected.`
      )
    } else if (reason.length < MIN_REASON_LENGTH) {
      problems.push(
        `${where} has a ${reason.length}-character reason; the floor is ${MIN_REASON_LENGTH}. ` +
          `A reason that would be true of any project is not a reason.`
      )
    }

    const expires = entry.expires
    if (typeof expires !== "string" || !EXPIRES_PATTERN.test(expires)) {
      problems.push(
        `${where} has \`expires\` ${JSON.stringify(expires)}; it must be a bare YYYY-MM-DD date. ` +
          `An expiry the reader cannot compare at a glance is an expiry nobody revisits.`
      )
    } else {
      const expiresMs = Date.parse(`${expires}T00:00:00Z`)
      // ROUND-TRIPPED, not trusted (WR-12). `EXPIRES_PATTERN` accepts any `\d{4}-\d{2}-\d{2}`, and
      // `Date.parse` rejects month 00 and 13 but silently ROLLS OVER an out-of-range day:
      // "2026-02-31" parses as 2026-03-03 and "2026-11-31" as 2026-12-01. So an impossible date was
      // accepted as an expiry three days later than any reader believes it says, while the failure
      // message quoted the impossible date back verbatim. Low impact on its own; it matters because
      // `expires` is the field the whole acceptance mechanism rests on, and a policy field a reader
      // cannot trust at a glance is the failure `expires` exists to prevent.
      if (
        !Number.isFinite(expiresMs) ||
        new Date(expiresMs).toISOString().slice(0, 10) !== expires
      ) {
        problems.push(
          `${where} has an impossible or unparseable \`expires\`: ${JSON.stringify(expires)}. ` +
            `Date.parse ROLLS OVER an out-of-range day — "2026-02-31" becomes 2026-03-03 — so the ` +
            `parse is round-tripped rather than trusted, and a date that does not survive the ` +
            `round trip is not a date.`
        )
      } else if (expiresMs <= nowMs) {
        problems.push(
          `${where} EXPIRED on ${expires}. Acceptance is a decision that gets revisited, not a ` +
            `permanent silence: either take the fix now, or re-state the reason against today's ` +
            `evidence and set a new date. Extending the date without re-reading the evidence is ` +
            `the failure this field exists to prevent.`
        )
      } else if (expiresMs - nowMs > MAX_EXPIRY_MS) {
        // The OTHER end of the same rule, and the one nothing checked. An expiry that has passed
        // is a failure; an expiry that never arrives was not.
        const days = Math.round((expiresMs - nowMs) / 86_400_000)
        problems.push(
          `${where} expires on ${expires}, which is ${days} days away — more than ` +
            `${MAX_EXPIRY_DAYS}. ${POLICY_DOC} § "The expiry rule" caps an acceptance at 30 days ` +
            `(a non-breaking fix is measured available) or ${MAX_EXPIRY_DAYS} days (the only fix ` +
            `is a breaking major and the reason rests on reach evidence). A distant expiry is a ` +
            `permanent silence wearing a decision's clothes: it satisfies every other control ` +
            `here while never bringing the decision back.`
        )
      }
    }
  })

  // ── the advisories themselves ────────────────────────────────────────────────────────────
  for (const row of collectAdvisories(auditJson)) {
    if (!failOnSet.has(row.severity)) continue
    if (row.ghsa === null) {
      problems.push(
        `${row.package} (${row.severity}) reports an advisory with no resolvable GHSA id ` +
          `(title ${JSON.stringify(row.title)}, url ${JSON.stringify(row.url)}). It cannot be ` +
          `allowlisted and it is not being ignored: \`npm audit --json\`'s shape changed, and ` +
          `this gate's offender list is no longer trustworthy until it is re-read.`
      )
      continue
    }
    if (!GHSA_PATTERN.test(row.ghsa)) {
      problems.push(
        `${row.package} (${row.severity}) reports advisory id ${JSON.stringify(row.ghsa)}, which ` +
          `does not match ${GHSA_PATTERN}, so it cannot be matched against the allowlist.`
      )
      continue
    }
    if (!allowed.has(row.ghsa)) {
      problems.push(
        `${row.package} ${row.severity} ${row.ghsa} has NO recorded disposition — ` +
          `${JSON.stringify(row.title)} (advisory severity ${row.advisorySeverity}). Either take ` +
          `the fix, or add an entry to ${POLICY_FILE} with a reason, a reach and an expiry, and ` +
          `record it in ${POLICY_DOC}.`
      )
    }
  }

  return problems
}

/**
 * Allowlist entries whose advisory the live audit no longer reports.
 *
 * A stale entry means the advisory was FIXED — by an upgrade here or upstream — and the exception
 * is now silently covering nothing while still reading as a live, reasoned acceptance. Left
 * alone, the allowlist becomes a museum, and the next person to read it cannot tell which
 * entries are load-bearing. It is a problem, not a no-op.
 *
 * Separate from `evaluatePolicy` because it is only meaningful against a LIVE audit document: an
 * offline test has no way to distinguish "fixed" from "not in this fixture".
 *
 * @param {unknown} auditJson
 * @param {unknown} policy
 * @returns {string[]}
 */
export function staleAllowlistProblems(auditJson, policy) {
  /** @type {string[]} */
  const problems = []
  const allowlist = Array.isArray(policy?.allowlist) ? policy.allowlist : []
  const reported = new Set()
  for (const row of collectAdvisories(auditJson)) {
    if (row.ghsa !== null) reported.add(row.ghsa)
  }
  for (const entry of allowlist) {
    const ghsa = entry?.ghsa
    if (typeof ghsa !== "string" || !GHSA_PATTERN.test(ghsa)) continue // already reported above
    if (!reported.has(ghsa)) {
      problems.push(
        `${POLICY_FILE} allowlists ${ghsa} (${entry.package}) but the live audit no longer ` +
          `reports it. The advisory was fixed, so the exception now covers nothing while still ` +
          `reading as a live acceptance — delete the entry and record the fix in ${POLICY_DOC}.`
      )
    }
  }
  return problems
}

// ---------------------------------------------------------------------------
// I/O. Everything below this line is private.
// ---------------------------------------------------------------------------

/**
 * Run `npm audit --json` and hand back its stdout AND its exit code, without acting on either.
 *
 * stderr is echoed through verbatim as it arrives: on a network failure or a registry 5xx it is
 * the only diagnosis, and swallowing it leaves the operator with an unexplained parse error.
 *
 * @param {boolean} packageLockOnly
 * @returns {Promise<{code: number, signal: string | null, stdout: string}>}
 */
function runNpmAudit(packageLockOnly) {
  const args = ["audit", "--json"]
  if (packageLockOnly) args.push("--package-lock-only")
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    })
    /** @type {Buffer[]} */
    const chunks = []
    child.stdout.on("data", (chunk) => chunks.push(chunk))
    child.stderr.on("data", (chunk) => process.stderr.write(chunk))
    child.on("error", reject)
    child.on("close", (code, signal) => {
      resolve({ code: code ?? -1, signal, stdout: Buffer.concat(chunks).toString("utf8") })
    })
  })
}

/** @returns {unknown} */
function loadPolicy() {
  const file = path.join(REPO_ROOT, POLICY_FILE)
  if (!existsSync(file)) {
    fatal(
      `${file} does not exist. The policy this gate enforces lives in the repository as data ` +
        `(${POLICY_FILE}) and as prose (${POLICY_DOC}); without the first there is nothing to ` +
        `enforce, and this gate must not fall back to "allow everything".`
    )
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    return fatal(`${POLICY_FILE} is not valid JSON: ${error.message}`)
  }
}

async function main() {
  const packageLockOnly = process.argv.slice(2).includes("--package-lock-only")

  // `--package-lock-only` changes the TREE SOURCE, not the ADVISORY SOURCE. It resolves from
  // package-lock.json without needing node_modules — useful before install, and the shape a
  // negative control is cheapest to build with — but the advisory data still comes from a POST to
  // registry.npmjs.org. There is NO offline mode for this gate, and claiming one would be a lie.
  progress(
    `npm audit --json${packageLockOnly ? " --package-lock-only" : ""} (tree from ` +
      `package-lock.json${packageLockOnly ? ", node_modules not consulted" : ""}; advisory data ` +
      `from the npm registry — this step needs network)`
  )
  const audit = await runNpmAudit(packageLockOnly)
  progress(
    `npm audit exited ${audit.code}${audit.signal ? ` (signal ${audit.signal})` : ""} — ` +
      `RECORDED, and deliberately NOT the verdict: npm audit exits 1 whenever any advisory ` +
      `exists at any severity`
  )

  if (audit.stdout.trim().length === 0) {
    fatal(
      "npm audit produced no stdout at all. Its stderr is above and is the diagnosis; a network " +
        "failure is the usual cause." + FLOOR_ADVICE
    )
  }
  let document
  try {
    document = JSON.parse(audit.stdout)
  } catch (error) {
    fatal(
      `npm audit's stdout is not valid JSON (${error.message}). First 400 bytes:\n` +
        `${audit.stdout.slice(0, 400)}`
    )
  }

  const shape = assertAuditDocument(document)
  progress(
    `parsed ${shape.advisoryIds.size} distinct advisories across ${shape.vulnerablePackages} ` +
      `vulnerable package(s); npm audited ${shape.dependenciesAudited} dependencies`
  )

  const policy = loadPolicy()
  const failOn = Array.isArray(policy?.failOn) ? policy.failOn : []
  const allowlist = Array.isArray(policy?.allowlist) ? policy.allowlist : []
  progress(
    `applying ${POLICY_FILE}: failOn ${JSON.stringify(failOn)}, ${allowlist.length} allowlist ` +
      `entr${allowlist.length === 1 ? "y" : "ies"}`
  )

  const problems = [
    ...evaluatePolicy(document, policy, new Date()),
    ...staleAllowlistProblems(document, policy),
  ]

  const rows = collectAdvisories(document)
  const failOnSet = new Set(failOn)
  const gated = rows.filter((row) => failOnSet.has(row.severity))
  const gatedIds = new Set(gated.map((row) => row.ghsa).filter((ghsa) => ghsa !== null))
  const applied = allowlist.filter(
    (entry) => typeof entry?.ghsa === "string" && gatedIds.has(entry.ghsa)
  ).length

  if (problems.length) {
    console.error("")
    for (const problem of problems) {
      console.error(`FATAL: ${problem}`)
    }
    console.error("")
    console.error(
      `FATAL: the advisories in package-lock.json do not satisfy ${POLICY_FILE} ` +
        `(${problems.length} problem(s) above). Note that npm audit's own exit code was ` +
        `${audit.code}, which is reported above and is deliberately NOT what this verdict is ` +
        `based on — it is 1 whenever any advisory exists at any severity, so it cannot ` +
        `distinguish a fully-disposed tree from an unallowlisted critical. Do NOT reach green by ` +
        `narrowing failOn, extending an expiry, or adding an entry whose reason would be true of ` +
        `any project; see ${POLICY_DOC}.`
    )
    process.exitCode = 1
    return
  }

  console.log(
    `OK: ${shape.advisoryIds.size} advisories evaluated across ${shape.vulnerablePackages} ` +
      `vulnerable packages (${gatedIds.size} at ${failOn.join("/")}), ${applied} of ` +
      `${allowlist.length} allowlist entries applied, ${shape.dependenciesAudited} dependencies ` +
      `audited. Every ${failOn.join("/")} advisory is either fixed or carries an unexpired, ` +
      `reasoned disposition in ${POLICY_FILE}.`
  )
}

// ---------------------------------------------------------------------------
// Invocation guard.
//
// `import.meta.main` is TRUE only when node was pointed at this file, and vitest's module runner
// sets it FALSE (measured, both). That is what lets src/lib/__tests__/audit-policy.test.ts import
// `evaluatePolicy` and `assertAuditDocument` without shelling out to `npm audit` at collection
// time — which would put the network inside the base vitest project, and that project must stay
// offline-clean. Node has defined it since 24.2 and package.json's engines floor is >= 24.12, so
// `undefined` means a runtime this script has never been tested under — and a check that silently
// does nothing is strictly worse than a check that fails, so that case is FATAL rather than a
// quiet return.
// ---------------------------------------------------------------------------
if (import.meta.main === true) {
  try {
    await main()
  } catch (error) {
    if (error instanceof Fatal) {
      console.error(`FATAL: ${error.message}`)
    } else {
      console.error(`FATAL: ${error?.stack ?? error}`)
    }
    process.exitCode = 1
  }
} else if (import.meta.main !== false) {
  console.error(
    "FATAL: this runtime does not define import.meta.main, so audit-policy.mjs cannot tell " +
      "whether it was invoked or imported and refuses to guess. package.json requires " +
      `node >= 24.12.0; this is ${process.version}.`
  )
  process.exitCode = 1
}
