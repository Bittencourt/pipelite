/**
 * THE GATE THAT KEEPS THE DATABASE TEST OUT OF THE REQUIRED CI CHECK (39-VALIDATION V-5).
 *
 * `src/lib/mutations/dedup.db.test.ts` needs a real PostgreSQL. CI
 * (.github/workflows/ci.yml) runs `npm ci`, typecheck, lint and `npm test` on GitHub
 * hardware with NO Docker and NO database, and `ci` is the required check on the master
 * ruleset. GitHub treats a required check that never passes as PERMANENTLY PENDING, which
 * makes every pull request unmergeable — the same failure mode ci.yml's own "deliberately
 * no path filter" comment exists to avoid, and the one Phase 32 recorded. A database test
 * reachable from `npm test` therefore does not break a feature, it breaks the repository.
 *
 * This file is a PLAIN unit test in the BASE vitest project, so it runs in CI, and it
 * asserts the separation by reading the five files that implement it. Three independent
 * controls, plus anti-vacuity anchors so an emptied or renamed file cannot satisfy the
 * negatives by accident:
 *
 *   1. the base project EXCLUDES the *.db.test.* glob        (vitest.config.ts)
 *   2. `npm test` does not invoke the db project             (package.json)
 *   3. NO STEP of the required check invokes it              (ci.yml)
 *
 * ── WHY CONTROL 3 CHANGED IN PHASE 46 ────────────────────────────────────────────────
 *
 * Control 3 used to read "the workflow never mentions it at all", and it was enforced by
 * a pair of whole-file negatives: `ci.yml` contained neither `services:` nor `postgres`.
 * That was a BLUNT PROXY. The invariant is not "CI has no database"; the invariant is
 * "the database-backed vitest project is not reachable from the required check". The
 * proxy was chosen because, at the time, the two were the same thing.
 *
 * Phase 46 made them different things. DEPLOY-01 requires that a self-hoster can build a
 * working database from `drizzle/` alone, and `npm run db:check-migrations` proves it by
 * migrating a throwaway database from zero and comparing its catalog. That check needs a
 * real PostgreSQL, and it was wired onto THIS job — the required one — deliberately: a
 * separate workflow publishes a new check-run name that is not in the master ruleset, so
 * it could go red without blocking a merge. A non-blocking gate is a gate that does not
 * gate, so the proxy was RE-ANCHORED rather than relaxed. The block below asserts the
 * real invariant directly, step by step, and names the offending step when it fails —
 * which the whole-file negative it replaced could not do.
 *
 * The failure mode being guarded is unchanged and is still the reason any of this
 * exists: GitHub treats a required check that never passes as PERMANENTLY PENDING, so a
 * suite that needs a database and is reachable from `ci` does not break a feature, it
 * makes every pull request in the repository unmergeable.
 *
 * ── WHY THERE IS ALSO A SEC-05 SECTION IN HERE (PHASE 47) ────────────────────────────
 *
 * Phase 47 put two supply-chain gates on the same required job — the `security:audit` npm script
 * and `npm audit signatures` — and asserts their presence and their `if:` condition at the bottom
 * of this file. Those assertions are NOT about database isolation, and the section says so in its own
 * words. They are here because `MIN_CI_STEPS` is here: that floor is the anti-vacuity guard for
 * every per-step assertion about this workflow, and a per-step assertion in one file whose floor
 * lives in another is a floor that will be raised without the assertions it protects, or the
 * reverse. The two must move in one commit, so they live in one file.
 *
 * It deliberately does NOT import anything from the db project, does not read
 * E2E_DATABASE_URL, and opens no connection. Its whole subject is file content.
 */
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"
import { parse } from "yaml"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const CI_WORKFLOW = ".github/workflows/ci.yml"
const COMPOSE_FILE = "docker-compose.yml"
const BASE_CONFIG = "vitest.config.ts"
const DB_CONFIG = "vitest.db.config.ts"
/**
 * The FOURTH vitest project (plan 50-03), gated here for the reason the header's last paragraph
 * gives about SEC-05: this file already owns the parsed config and script readers, and the
 * invariant is the SAME invariant — a project that talks to a real database must not be reachable
 * from `npm test` or from CI. A second file would duplicate `configArrayEntries`,
 * `packageScripts` and `readStrippedSource` to assert the same thing about a different config.
 *
 * Its name deliberately contains neither `test:db` nor `db.config`, so it cannot collide with the
 * raw whole-file negatives above that scan ci.yml and every npm script for those two substrings.
 */
const LIVE_CONFIG = "vitest.live.config.ts"
const PACKAGE_JSON = "package.json"
const SETUP_SCRIPT = "scripts/dedup-db-test-setup.sh"
const MIGRATION_CHECK_SCRIPT = "scripts/migrate-from-zero.mjs"

/** The command the required check must run for the Postgres service to be load-bearing. */
const MIGRATION_CHECK_COMMAND = "npm run db:check-migrations"

/**
 * The npm script the audit policy gate is exposed under (SEC-05).
 *
 * The NAME, not the command. `npmRunCommand` below joins it, so the string
 * `npm run <this>` is never typed out in this file — see the reasoning there (S5).
 */
const AUDIT_SCRIPT_NAME = "security:audit"

/**
 * Registry signature and attestation verification — npm's own subcommand, so there is no npm
 * script to read this one out of and it is written here as a literal, which is what makes the
 * `npmRunCommand` indirection above worth explaining rather than leaving as a curiosity.
 */
const SIGNATURE_CHECK_COMMAND = "npm audit signatures"

/**
 * The workflow declares at least this many steps today. Measured: 9 — checkout, setup-node,
 * install, typecheck, lint, test, migration check, security audit policy, registry signature
 * verification. The floor sits one below the measurement, so removing a step is loud while
 * adding one is free.
 *
 * Anti-vacuity for the per-step enumeration below. A `forEach` over an empty array
 * satisfies every negative inside it, which is precisely the shape of a gate that passes
 * BECAUSE it is broken; this floor is the tripwire for a parser that stopped finding
 * steps at all.
 *
 * The measurement was 7 and the floor 6 until phase 47 added the two supply-chain steps
 * (SEC-05). Both numbers move in the SAME commit as the workflow edit, deliberately: a floor
 * whose prose enumerates a step list the workflow no longer has is the exact half-state phase 46
 * was burned by, and it is worse than no comment at all because the next reader trusts it.
 */
const MIN_CI_STEPS = 8

/**
 * The entries of a `[...]` array literal assigned to `test.<key>` in a vitest config.
 *
 * COMMENT-BLIND ON PURPOSE, via `readStrippedSource`. Both configs explain the exclusion in
 * prose that necessarily spells the glob out — vitest.config.ts's own comment says
 * "*.db.test.* is excluded for the same mechanical reason" — so a bare `toContain("db.test")`
 * on the raw file would pass with the exclusion itself deleted. Parsing the array is the
 * only form of this assertion that measures the configuration rather than the essay about it.
 */
function configArrayEntries(configPath: string, key: string): string[] {
  const source = readStrippedSource(configPath)
  const marker = new RegExp(`\\b${key}\\s*:\\s*\\[`)
  const start = marker.exec(source)
  if (start === null) throw new Error(`${configPath} declares no test.${key} array`)

  let i = start.index + start[0].length
  let depth = 1
  let body = ""
  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === "[") depth += 1
    if (ch === "]") {
      depth -= 1
      if (depth === 0) break
    }
    body += ch
    i += 1
  }
  if (depth !== 0) throw new Error(`${configPath}'s test.${key} array is unterminated`)

  return [...body.matchAll(/['"`]([^'"`]*)['"`]/g)].map((match) => match[1])
}

function packageScripts(): Record<string, string> {
  const parsed = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
    scripts?: Record<string, string>
  }
  return parsed.scripts ?? {}
}

interface WorkflowStep {
  name?: string
  uses?: string
  run?: string
  if?: string
}

interface WorkflowJob {
  services?: Record<string, { image?: string } | undefined>
  steps?: WorkflowStep[]
}

interface WorkflowDocument {
  jobs?: Record<string, WorkflowJob | undefined>
}

interface ComposeDocument {
  services?: Record<string, { image?: string } | undefined>
}

/**
 * The `ci` job, PARSED — never regexed.
 *
 * S3, and the same rule `compose-uploads-persistence.test.ts:26-31` states in prose:
 * indentation is exactly what decides whether a `services:` key belongs to the `ci` job
 * or to the document, and a regex over YAML happily "passes" on a malformed file. It
 * throws with the job names it actually parsed, in the
 * `compose-uploads-persistence.test.ts:86-95` style, rather than returning `undefined`
 * into an assertion that would then compare two undefineds and pass.
 */
function ciJob(): WorkflowJob {
  const parsed = parse(readFileSync(CI_WORKFLOW, "utf8")) as WorkflowDocument
  const job = parsed.jobs?.ci
  if (!job || typeof job !== "object") {
    throw new Error(
      `${CI_WORKFLOW}: jobs.ci is missing or is not a mapping. Parsed job names: ` +
        `${Object.keys(parsed.jobs ?? {}).join(", ") || "(none)"}. ` +
        `\`ci\` is the check-run name the master ruleset requires; if the workflow was ` +
        `restructured, re-anchor this reader rather than deleting the assertions it feeds.`
    )
  }
  return job
}

/** Every step of the `ci` job, or a throw naming what was parsed instead. */
function ciSteps(): WorkflowStep[] {
  const steps = ciJob().steps
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`${CI_WORKFLOW}: jobs.ci declares no steps array — the per-step gate has no input.`)
  }
  return steps
}

/** A short, stable label for a step in a failure message: its name, its action, or its index. */
function stepLabel(step: WorkflowStep, index: number): string {
  return step.name ?? step.uses ?? `step #${index}`
}

/**
 * `npm run <scriptName>`, with the script's PRESENCE in package.json asserted on the way through.
 *
 * S5, and the same relational rule `composePostgresImage` above follows for the Postgres tag. The
 * joined literal is deliberately not written anywhere in this file: a workflow step and the npm
 * script it invokes are two halves of one fact, and typing the joined string here would let
 * package.json drop or rename the script while this gate stayed green against a step that then
 * fails on the runner — which is the one place a red is expensive.
 *
 * It THROWS, naming every script it did parse, rather than returning a command nothing declares:
 * "no step of the workflow invokes the audit script" and "package.json no longer declares that
 * script at all" are different repairs, and a reader should not have to guess which one they are
 * looking at.
 *
 * The joined string appears NOWHERE in this file, prose included, so a search for it lands on the
 * workflow and on package.json — the two places that own it — and on nothing else.
 */
function npmRunCommand(scriptName: string): string {
  const scripts = packageScripts()
  if (typeof scripts[scriptName] !== "string") {
    throw new Error(
      `${PACKAGE_JSON} declares no "${scriptName}" script, so no step of the required check could ` +
        `run it. Scripts parsed: ${Object.keys(scripts).join(", ") || "(none)"}`
    )
  }
  return `npm run ${scriptName}`
}

/**
 * The single step of job `ci` whose `run` contains `command`, or a failure naming every step label
 * the reader parsed.
 *
 * Extracted from the migration-check assertion's shape rather than generalising it away: the
 * failure MESSAGE is the load-bearing part. "No step runs X" is indistinguishable from "the reader
 * parsed nothing at all" unless the message lists what it DID parse, and that distinction is the
 * entire reason this file reads parsed YAML instead of grepping the workflow. `ciSteps()` throws on
 * an empty steps array before this is ever reached, and `MIN_CI_STEPS` floors the count below, so
 * there are two independent guards against the vacuous case.
 */
function soleStepRunning(command: string): WorkflowStep {
  const steps = ciSteps()
  const matches = steps.filter((step) => (step.run ?? "").includes(command))
  expect(
    matches.map((step, index) => stepLabel(step, index)),
    `job \`ci\` must run \`${command}\` in exactly one step. Steps parsed: ` +
      `${steps.map((step, index) => stepLabel(step, index)).join(", ")}`
  ).toHaveLength(1)
  return matches[0]
}

/**
 * The Postgres image `docker-compose.yml` pins.
 *
 * Read from the file rather than written here as a literal (S6): the workflow's service
 * image and the compose pin are asserted RELATIONALLY, so a tag typed into one file and
 * not the other is a failure rather than a silent divergence between what a contributor
 * runs locally and what the required check runs.
 */
function composePostgresImage(): string {
  const compose = parse(readFileSync(COMPOSE_FILE, "utf8")) as ComposeDocument
  const image = compose.services?.postgres?.image
  if (typeof image !== "string" || image.length === 0) {
    throw new Error(
      `${COMPOSE_FILE}: services.postgres.image is missing. Parsed service names: ` +
        `${Object.keys(compose.services ?? {}).join(", ") || "(none)"}`
    )
  }
  return image
}

// ─────────────────────────────────────────────────────────────────────────────────────
// THE DESTRUCTIVE-STATEMENT SCAN, over every operational script that issues DDL against
// a cluster which also hosts the operator's real records.
// ─────────────────────────────────────────────────────────────────────────────────────

/** Which comment syntax a scanned file uses. The scan cannot be comment-blind without it. */
type CommentSyntax = "hash" | "cstyle"

interface DestructiveScanSubject {
  /** Repo-relative path of the script. */
  path: string
  /** Its comment syntax — load-bearing, see `codeLines`. */
  comments: CommentSyntax
  /** How that file names the database it must only ever READ. */
  protectedToken: RegExp
  /** That token, for the failure message and the test title. */
  label: string
}

/**
 * The scanned scripts. This was a single `SETUP_SCRIPT` constant until phase 46 added a
 * second script that creates and drops databases on the same cluster
 * (`scripts/migrate-from-zero.mjs`, the behavioural half of DEPLOY-01).
 *
 * The per-file comment syntax is not bookkeeping. `readStrippedSource` strips `//` and
 * `/* *\/` but NOT `#`, and the original scan stripped `^\s*#.*$` and nothing else, so a
 * single stripper serves neither file correctly — run the shell stripper over the `.mjs`
 * and its 70-line header stays in the scan; run the JS stripper over the `.sh` and every
 * `#` comment stays in it. Either way prose starts being measured as code.
 */
const DESTRUCTIVE_SCAN_SUBJECTS: DestructiveScanSubject[] = [
  {
    path: SETUP_SCRIPT,
    comments: "hash",
    // `SOURCE_DB="pipelite"` — the development database, read with pg_dump, never written.
    protectedToken: /\$\{?SOURCE_DB/,
    label: "$SOURCE_DB",
  },
  {
    path: MIGRATION_CHECK_SCRIPT,
    comments: "cstyle",
    // The reference database the catalog comparison reads. It is opened READ ONLY and only
    // ever receives SELECT; every DROP in that script names the generated scratch database.
    // `\b` on both ends so `REFERENCE_DATABASE_URL` — a legitimate env var — is not a hit.
    protectedToken: /\bREFERENCE_DB\b/,
    label: "REFERENCE_DB",
  },
]

/** A destructive SQL verb. Same expression the original single-file scan used. */
const DESTRUCTIVE_STATEMENT = /\b(drop|truncate|delete)\b/i

/**
 * `source` split into lines with its comments blanked out, PRESERVING the line count.
 *
 * Line-oriented rather than whole-file, for the reason the original scan states: a
 * sentence in a header that merely mentions a database must not be able to mask a real
 * statement, and a real statement must not be able to hide behind one. Preserving the
 * line count is what lets a failure quote a line NUMBER.
 *
 * The `cstyle` branch tracks block comments across lines and is quote-aware, so a `//`
 * inside a connection-string literal is not mistaken for the start of a comment.
 */
function codeLines(source: string, syntax: CommentSyntax): string[] {
  const lines = source.split("\n")
  if (syntax === "hash") return lines.map((line) => line.replace(/^\s*#.*$/, ""))

  let inBlock = false
  return lines.map((line) => {
    let code = ""
    let quote: string | null = null
    let i = 0
    while (i < line.length) {
      const ch = line[i]
      const next = line[i + 1]

      if (inBlock) {
        if (ch === "*" && next === "/") {
          inBlock = false
          i += 2
          continue
        }
        i += 1
        continue
      }

      if (quote) {
        code += ch
        if (ch === "\\") {
          code += next ?? ""
          i += 2
          continue
        }
        if (ch === quote) quote = null
        i += 1
        continue
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch
        code += ch
        i += 1
        continue
      }
      if (ch === "/" && next === "/") break
      if (ch === "/" && next === "*") {
        inBlock = true
        i += 2
        continue
      }

      code += ch
      i += 1
    }
    return code
  })
}

describe("the db vitest project is unreachable from `npm test`", () => {
  it("the `test` script names neither the db config nor the db script", () => {
    const scripts = packageScripts()

    // Anti-vacuity for this whole describe: the script must exist and must still run the
    // two projects it is supposed to. Without this, deleting `test` satisfies every
    // negative below.
    expect(scripts.test, "package.json has no `test` script").toBeDefined()
    expect(scripts.test).toContain("vitest run")
    expect(scripts.test).toContain("vitest.rsc.config.ts")

    expect(scripts.test).not.toContain("vitest.db.config")
    expect(scripts.test).not.toContain("test:db")
    expect(scripts.test).not.toContain("db.config")
  })

  it("`test:db` exists as its own opt-in script, so the db project is invocable at all", () => {
    // The complement of the negative above, and not merely tidiness: if `test:db` did not
    // exist, the four negatives in this file would describe a project nobody can run, and
    // the database tests would be dead code that no gate notices.
    const scripts = packageScripts()
    expect(scripts["test:db"]).toContain("vitest run --config vitest.db.config.ts")
    // And it provisions the ISOLATED database first. Without this the suite would run
    // against whatever DATABASE_URL happened to hold, which is the one outcome the whole
    // arrangement exists to prevent.
    expect(scripts["test:db"]).toContain("scripts/dedup-db-test-setup.sh")
  })

  it("no other script chains the db project into a broader one", () => {
    // `test:watch`, `test:e2e` and any future aggregate must stay clear of it too: a
    // developer running `npm run test:watch` has no reason to expect a live database, and
    // an aggregate script is the likeliest accidental route back into CI.
    const scripts = packageScripts()
    for (const [name, body] of Object.entries(scripts)) {
      if (name === "test:db") continue
      expect(body, `script "${name}" reaches the db vitest project`).not.toContain("test:db")
      expect(body, `script "${name}" reaches the db vitest project`).not.toContain("db.config")
    }
  })
})

describe("the required CI check never mentions the db project", () => {
  // Read RAW, comments included, deliberately: the assertion is ZERO OCCURRENCES ANYWHERE
  // in the workflow. A commented-out `run: npm run test:db` is a line one edit away from
  // being live, and this gate should fail while it is still a comment.
  const workflow = readFileSync(CI_WORKFLOW, "utf8")

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

  // ───────────────────────────────────────────────────────────────────────────────────
  // THE RE-ANCHORED CONTROL 3. This replaces a pair of whole-file negatives that asserted
  // `ci.yml` contained neither `services:` nor `postgres` — a blunt proxy for the real
  // invariant, which the header above explains and which these four assertions state
  // directly. The proxy is GONE, not commented out, and nothing above was relaxed to make
  // room for it: the raw `test:db` / `db.config` negatives and their anchor are untouched,
  // and the per-step enumeration below is ADDITIVE to them.
  //
  // These read PARSED `run:` values, not raw text, so unlike the two raw scans above a
  // comment in the workflow cannot collide with them — and equally, a commented-out step
  // cannot satisfy them. The raw negatives are what cover the commented-out case; that is
  // why both forms are kept.
  // ───────────────────────────────────────────────────────────────────────────────────

  it("provisions exactly one service, on the image docker-compose.yml pins", () => {
    // The database exists for `npm run db:check-migrations` (DEPLOY-01) and for nothing
    // else. Exactly one service, so a second one cannot be added without this being read
    // again; and its image is compared against docker-compose.yml rather than against a
    // literal typed here, so the tag a contributor runs locally and the tag the required
    // check runs cannot drift apart (S6).
    const services = ciJob().services ?? {}
    const names = Object.keys(services)
    expect(
      names,
      `job \`ci\` must declare exactly one service — the Postgres the from-zero migration ` +
        `check needs. Parsed services: ${names.join(", ") || "(none)"}`
    ).toHaveLength(1)

    const image = services[names[0]]?.image
    const pinned = composePostgresImage()
    expect(
      image,
      `job \`ci\` service "${names[0]}" runs image ${String(image)} while ${COMPOSE_FILE} ` +
        `pins ${pinned}. One pin, read from both files — change both or neither.`
    ).toBe(pinned)
  })

  it("runs the from-zero migration check — the consumer that makes that service load-bearing", () => {
    // ANTI-VACUITY FOR THE ASSERTION ABOVE, and the reason it is in this file at all. A
    // Postgres service with no consumer is strictly worse than no service: it costs every
    // run time, it looks like the invariant changed for a reason, and it proves nothing.
    // Asserting the service without asserting its consumer is the exact shape of a gate
    // that cannot fail.
    const steps = ciSteps()
    const consumers = steps.filter((step) => (step.run ?? "").includes(MIGRATION_CHECK_COMMAND))
    expect(
      consumers.map((step, index) => stepLabel(step, index)),
      `no step of job \`ci\` runs \`${MIGRATION_CHECK_COMMAND}\`. Steps parsed: ` +
        `${steps.map((step, index) => stepLabel(step, index)).join(", ")}`
    ).toHaveLength(1)

    // And it REPORTS rather than aborting the job, matching the convention every gate
    // after the first one in this workflow follows: a contributor should see the lint
    // failure and the migration failure in one run, not one per push.
    expect(
      consumers[0].if,
      `the \`${MIGRATION_CHECK_COMMAND}\` step must carry the same \`!cancelled()\` ` +
        `condition as Lint and Test, so all gates report in a single run`
    ).toBe("${{ !cancelled() }}")
  })

  it("has NO step that reaches the database-backed vitest project — asserted step by step", () => {
    // The direct statement of the invariant, in the same enumerated style as the
    // package.json scan above. Strictly stronger than the whole-file negative it
    // complements: this one NAMES the offending step instead of reporting that the token
    // appears somewhere in an 80-line file.
    const steps = ciSteps()
    expect(
      steps.length,
      `only ${steps.length} steps parsed out of job \`ci\` — below the floor of ` +
        `${MIN_CI_STEPS}. A per-step gate over an empty list passes because it is broken.`
    ).toBeGreaterThanOrEqual(MIN_CI_STEPS)

    steps.forEach((step, index) => {
      const run = step.run ?? ""
      const label = stepLabel(step, index)
      expect(run, `workflow step "${label}" reaches the db vitest project`).not.toContain("test:db")
      expect(run, `workflow step "${label}" reaches the db vitest project`).not.toContain(
        "vitest.db.config"
      )
    })
  })
})

describe("the required CI check carries the supply-chain gates (SEC-05)", () => {
  // ───────────────────────────────────────────────────────────────────────────────────────
  // WHY SEC-05's ASSERTIONS LIVE IN A FILE ABOUT DATABASE ISOLATION.
  //
  // They are not about database isolation, and pretending otherwise would be worse than
  // saying so. They are here because this file already owns the parsed `ci.yml` readers
  // (`ciJob`, `ciSteps`, `stepLabel`) and, more importantly, it owns `MIN_CI_STEPS` — the
  // floor that is the anti-vacuity guard for EVERY per-step assertion about this workflow,
  // including these. Splitting them into a second file would either duplicate the readers or
  // leave the new assertions with no floor beneath them, and a per-step assertion over a step
  // list nobody floored is the shape of a gate that passes because it broke.
  //
  // The other reason is mechanical: the floor and the step list must move in one commit, and a
  // constant cannot be raised in one file to describe steps asserted in another without the two
  // drifting the first time someone edits only one of them.
  //
  // These read PARSED `run:` and `if:` values. A commented-out step cannot satisfy them, and a
  // comment cannot collide with them — which is the complement of the raw-text negatives above,
  // and the reason both forms exist.
  // ───────────────────────────────────────────────────────────────────────────────────────

  it("gates the audit policy on the check that can actually block a merge", () => {
    // SEC-05, and the whole reason this step is HERE rather than in a workflow of its own: `ci`
    // is the check-run name the master ruleset requires. A new workflow file publishes a name the
    // ruleset does not know, so it could go red for weeks without stopping a single merge — Phase
    // 46's Route A reasoning applied a second time, and the argument the `services:` header above
    // makes at length.
    const command = npmRunCommand(AUDIT_SCRIPT_NAME)
    const step = soleStepRunning(command)

    expect(
      step.if,
      `the \`${command}\` step must carry the same \`!cancelled()\` condition as Lint and Test, ` +
        `so a security finding never hides a type error and a type error never hides a security ` +
        `finding — all gates report in one run`
    ).toBe("${{ !cancelled() }}")
  })

  it("verifies registry signatures — the tamper half of SEC-05, and its own step", () => {
    // Advisory data describes KNOWN vulnerabilities in the versions a lockfile names. It says
    // nothing at all about whether the tarball the registry served is the one its publisher
    // signed, and `npm audit signatures` is the only check in this repository that looks at that.
    // Two different questions, so two steps: folding them together would mean one failure mode
    // could mask the other, and would hide which of the two actually went red.
    const step = soleStepRunning(SIGNATURE_CHECK_COMMAND)

    expect(
      step.if,
      `the \`${SIGNATURE_CHECK_COMMAND}\` step must carry the same \`!cancelled()\` condition as ` +
        `Lint and Test, so all gates report in a single run`
    ).toBe("${{ !cancelled() }}")
  })

  it("keeps both supply-chain gates on the SAME job as the incumbent gates", () => {
    // ANTI-VACUITY for the two assertions above. Both of them are satisfied by a step sitting in
    // any job this file's readers happen to resolve as `ci`; neither says the step shares a job
    // with the checks a maintainer already trusts. This does: the audit steps and `npm test` are
    // in one step list, so a future refactor that lifts the security steps into a job of their own
    // — and out of the required check — fails here rather than silently un-gating SEC-05.
    const runs = ciSteps().map((step) => step.run ?? "")

    for (const command of [npmRunCommand(AUDIT_SCRIPT_NAME), SIGNATURE_CHECK_COMMAND, "npm test"]) {
      expect(
        runs.filter((run) => run.includes(command)).length,
        `job \`ci\` must run \`${command}\`. Runs parsed: ${JSON.stringify(runs)}`
      ).toBe(1)
    }
  })
})

describe("the base vitest project excludes the db glob", () => {
  const baseExclude = configArrayEntries(BASE_CONFIG, "exclude")
  const baseInclude = configArrayEntries(BASE_CONFIG, "include")

  it("has a db.test entry in test.exclude", () => {
    expect(baseExclude.some((pattern) => pattern.includes("db.test"))).toBe(true)
  })

  it("still has the rsc.test entry — the anti-vacuity anchor for the exclude array", () => {
    // A rewritten or truncated config whose `exclude` lost every glob would still "contain
    // a db.test entry" under a looser assertion. Pinning the incumbent entry, and the
    // spread of vitest's own defaults, means the array this file measured is the real one.
    expect(baseExclude.some((pattern) => pattern.includes("rsc.test"))).toBe(true)
    expect(readStrippedSource(BASE_CONFIG)).toContain("configDefaults.exclude")
  })

  it("would otherwise match the db files — which is WHY the exclusion is required", () => {
    // The exclusion is not optional hygiene. The base include glob genuinely matches
    // `*.db.test.ts`, so without the exclude entry those files run in this project too,
    // with no DATABASE_URL forwarding and no database, and fail every CI run.
    expect(baseInclude).toContain("src/**/*.{test,spec}.?(c|m)[jt]s?(x)")
  })
})

describe("the db vitest project claims exactly the db glob", () => {
  const dbInclude = configArrayEntries(DB_CONFIG, "include")
  const dbExclude = configArrayEntries(DB_CONFIG, "exclude")

  it("has a db.test entry in test.include", () => {
    expect(dbInclude.some((pattern) => pattern.includes("db.test"))).toBe(true)
  })

  it("includes NOTHING but db.test files", () => {
    // The mirror of the base project's exclusion. If this project's include ever widened,
    // `npm run test:db` would start running the 2500 mocked tests against a live database
    // connection, and the two projects would stop being separable.
    expect(dbInclude).toHaveLength(1)
    for (const pattern of dbInclude) expect(pattern).toContain("db.test")
  })

  it("spreads vitest's default exclude rather than replacing it", () => {
    // Same trap as the base config's own comment warns about: a bare array makes vitest
    // walk node_modules and execute vendored test files.
    expect(readStrippedSource(DB_CONFIG)).toContain("configDefaults.exclude")
    expect(dbExclude.some((pattern) => pattern.includes(".next"))).toBe(true)
  })

  it("runs its files serially — one database, shared fixtures", () => {
    const source = readStrippedSource(DB_CONFIG)
    expect(source).toMatch(/fileParallelism\s*:\s*false/)
  })
})

describe("the db project points at an isolated database, never the development one", () => {
  // THE HIGHEST-CONSEQUENCE ASSERTIONS IN THIS FILE. The development database holds the
  // operator's real records, and the suite this config configures creates and HARD DELETES
  // rows. If the config ever forwards the DEVELOPMENT connection string as DATABASE_URL,
  // that teardown runs there. That is not a test failure, it is data loss — so the wiring
  // is gated here, in the base project, where CI runs it.
  const source = readStrippedSource(DB_CONFIG)
  const setup = readFileSync(SETUP_SCRIPT, "utf8")

  it("names the isolated database and DERIVES the URL rather than reusing E2E_DATABASE_URL", () => {
    expect(source).toContain("pipelite_dedup_test")
    // `DATABASE_URL: process.env.E2E_DATABASE_URL` is precisely the mistake this catches:
    // it would aim the suite at the development database while every other assertion in
    // this file still passed.
    //
    // THE LOOKBEHIND IS LOAD-BEARING. `DATABASE_URL` is a SUFFIX of `E2E_DATABASE_URL`, so
    // an unanchored pattern also matches the legitimate
    // `E2E_DATABASE_URL: process.env.E2E_DATABASE_URL` forwarding line and the gate fails
    // on a correct config. Measured, not theorised — it did.
    expect(source).not.toMatch(/(?<!\w)DATABASE_URL\s*:\s*process\.env\.E2E_DATABASE_URL/)
    expect(source).toMatch(/(?<!\w)DATABASE_URL\s*:\s*isolatedConnection\(/)
  })

  it("the provisioning script rebuilds only the test database and only READS the source", () => {
    expect(setup).toContain('TEST_DB="pipelite_dedup_test"')
    expect(setup).toContain('SOURCE_DB="pipelite"')
    // The source is read with pg_dump and never written to.
    expect(setup).toContain("--schema-only")
    // The in-session fence: the schema reset cannot execute against another database, and
    // ON_ERROR_STOP is what makes the RAISE abort before it.
    expect(setup).toContain("current_database() <> 'pipelite_dedup_test'")
    expect(setup).toContain("ON_ERROR_STOP=1")
  })

})

// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE FOURTH PROJECT (plan 50-03), gated exactly as the third one is.
//
// WHY IT IS IN THIS FILE and not one of its own: see the comment on LIVE_CONFIG above. Same
// invariant, same readers. The three projects are now met in order — base, db, live.
//
// WHAT THE LIVE PROJECT IS. `vitest.live.config.ts` supplies DATABASE_URL so that
// `src/lib/export/formatters-live.test.ts` (24 tests) and
// `src/lib/audit/export-events-live.test.ts` (4) stop self-skipping. Those 28 tests had never
// executed in any project on any machine; they were the base suite's ENTIRE skipped count of 32
// alongside four `it.skip('… requires DB')` stubs. The files were NOT renamed to `*.db.test.ts`,
// deliberately: `pipelite_dedup_test` starts empty, which would make their live-volume assertions
// vacuous rather than passing, and four shipped gates name these two paths exactly.
//
// WHY THE STAKES ARE HIGHER HERE THAN FOR THE DB PROJECT. The db project points at an ISOLATED
// database and this file's highest-consequence assertions are the ones keeping it there. The live
// project points at `pipelite` — the operator's real records — on purpose, because the assertions
// are coupled to live volumes. And one of its two files WRITES: it inserts audit_log rows and
// deletes them again by id. So "unreachable from `npm test`" is not hygiene here, it is the only
// thing standing between a contributor typing `npm test` and a suite mutating real audit records.
//
// DELIBERATELY NOT WRITTEN HERE: any assertion about `ci.yml`. Plan 50-07 owns the workflow half,
// including the MIN_CI_STEPS bump, and the two must move in the SAME commit for the reason
// MIN_CI_STEPS' own comment gives — a floor whose prose enumerates a step list the workflow does
// not have yet is the exact half-state Phase 46 was burned by. A cell here asserting a `test:live`
// step that 50-07 has not added yet would be red for a reason unrelated to the invariant; a cell
// asserting its ABSENCE would have to be deleted by 50-07 the moment it lands. Neither is written.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("the live vitest project is unreachable from `npm test`", () => {
  it("`test:live` exists as its own opt-in script, so the live project is invocable at all", () => {
    // THE ANTI-VACUITY ANCHOR for every negative below. Without this cell, deleting `test:live`
    // outright satisfies all four of them perfectly, and the 28 tests go back to never running
    // while this describe stays green — which is the precise defect the live project exists to
    // remove, reproduced inside its own gate.
    const scripts = packageScripts()
    expect(
      scripts["test:live"],
      "package.json has no `test:live` script, so the 28 live-database tests are unrunnable and " +
        "the negatives below describe a project nobody can reach"
    ).toBeDefined()
    expect(scripts["test:live"]).toContain("vitest run --config vitest.live.config.ts")
  })

  it("the `test` script names neither the live config nor the live script", () => {
    const scripts = packageScripts()

    // Anti-vacuity, in the same shape as the db project's: `test` must exist and must still run
    // the two projects it is supposed to, or an emptied script satisfies the negatives.
    expect(scripts.test, "package.json has no `test` script").toBeDefined()
    expect(scripts.test).toContain("vitest run")
    expect(scripts.test).toContain("vitest.rsc.config.ts")

    expect(
      scripts.test,
      "`npm test` reaches the live vitest project. CI has no Docker and no populated database, so " +
        "the required `ci` check would never pass and every pull request would become unmergeable " +
        "— and locally, every contributor running `npm test` would be writing audit_log rows to " +
        "the operator's real database."
    ).not.toContain("test:live")
    expect(scripts.test).not.toContain("vitest.live.config")
  })

  it("no other script chains the live project into a broader one", () => {
    // The likeliest accidental route back into CI, and the reason the message names the
    // consequence rather than the assertion: a developer running an aggregate script has no
    // reason to expect a suite that WRITES to the operator's audit_log. `test:watch` and any
    // future `test:all` must stay clear of it for exactly that reason.
    const scripts = packageScripts()
    for (const [name, body] of Object.entries(scripts)) {
      if (name === "test:live") continue
      expect(
        body,
        `script "${name}" reaches the live vitest project, which writes to the operator's real ` +
          `audit_log. Nobody running "npm run ${name}" is expecting that.`
      ).not.toContain("test:live")
      expect(
        body,
        `script "${name}" reaches the live vitest project via its config path`
      ).not.toContain("vitest.live.config")
    }
  })

  it("`test:live` does NOT provision the db project's database", () => {
    // scripts/dedup-db-test-setup.sh pg_dumps `pipelite` and DROPS and rebuilds every schema in
    // `pipelite_dedup_test`. The live project has nothing to do with it: chaining it here would
    // make a read-only export probe destroy another project's fixtures, and would do so silently
    // because the live suite would still pass.
    const scripts = packageScripts()
    expect(
      scripts["test:live"],
      "`test:live` runs the db project's provisioning script, which drops and rebuilds " +
        "pipelite_dedup_test. Remove it — the live project needs no provisioning."
    ).not.toContain("dedup-db-test-setup.sh")
  })
})

describe("the live vitest project claims exactly the -live glob", () => {
  const liveInclude = configArrayEntries(LIVE_CONFIG, "include")
  const liveExclude = configArrayEntries(LIVE_CONFIG, "exclude")

  it("includes NOTHING but -live.test files", () => {
    // Measured under sabotage: widening this to `src/**/*.test.?(c|m)[jt]s?(x)` matches 204 files
    // instead of 2, and 13 of them are `*.db.test.ts` whose own module-load fences then abort
    // collection because DATABASE_URL names `pipelite` rather than `pipelite_dedup_test`. The
    // widened form is loud today only because of THOSE fences; this cell is what makes it loud
    // here, in the base project, in CI, where no database exists to refuse anything.
    expect(
      liveInclude,
      `${LIVE_CONFIG}'s include must claim the -live glob and nothing else. Widened, this project ` +
        `runs the whole mocked corpus against the operator's real database.`
    ).toHaveLength(1)
    for (const pattern of liveInclude) expect(pattern).toContain("-live.test")
  })

  it("spreads vitest's default exclude rather than replacing it", () => {
    // Same trap the base config's own comment warns about: a bare array makes vitest walk
    // node_modules and execute vendored test files.
    expect(readStrippedSource(LIVE_CONFIG)).toContain("configDefaults.exclude")
    expect(liveExclude.some((pattern) => pattern.includes(".next"))).toBe(true)
  })

  it("runs its files serially — one real database, and one of the two files writes", () => {
    // Not a performance concession. `export-events-live.test.ts` reads audit_log's count, inserts,
    // then asserts the count came back; a parallel file interleaving its own inserts would make
    // that assertion measure the wrong table state.
    const source = readStrippedSource(LIVE_CONFIG)
    expect(source).toMatch(/fileParallelism\s*:\s*false/)
    expect(source).toMatch(/sequence\s*:\s*\{\s*concurrent\s*:\s*false\s*\}/)
  })

  it("refuses a non-loopback DATABASE_URL at config load", () => {
    // The fence, which has no analogue in the db project because the db project substitutes the
    // database NAME instead. Here the development database is the intended target, so the only
    // thing left to fence is the HOST — and a deleting suite one exported variable away from a
    // remote host is a data-loss shape rather than a test failure. Driven as an ablation in plan
    // 50-03: `DATABASE_URL=postgresql://u:p@db.example.com:5432/x npm run test:live` exits 1 with
    // `LiveProjectRefusedNonLoopbackHost` before a single file is collected.
    const source = readStrippedSource(LIVE_CONFIG)
    expect(
      source,
      `${LIVE_CONFIG} no longer names its refusal. Without a THROW on a non-loopback host, this ` +
        `project writes to whatever it is pointed at.`
    ).toContain("LiveProjectRefusedNonLoopbackHost")
    expect(source).toMatch(/throw new Error/)
    // The permitted set, pinned so it cannot quietly grow a hostname.
    expect(source).toMatch(/LOOPBACK_HOSTS\s*=\s*\[/)
    expect(source).toContain("localhost")
    expect(source).toContain("127.0.0.1")
  })
})

describe("the base vitest project excludes the -live glob", () => {
  const baseExclude = configArrayEntries(BASE_CONFIG, "exclude")

  it("has a -live.test entry in test.exclude", () => {
    // Measured: with this entry the base project reports 5735 passed / 4 skipped over 187 files;
    // without it, 5735 passed / 32 skipped over 189. The `passed` count does not move either way,
    // which is the whole point — those 28 were never passing, they were never running.
    expect(
      baseExclude.some((pattern) => pattern.includes("-live.test")),
      `${BASE_CONFIG}'s test.exclude has no -live.test entry, so the two live files are collected ` +
        `by the base project again. They self-skip today, so nothing goes red — that is exactly ` +
        `why this is asserted here rather than left to the suite's own output.`
    ).toBe(true)
  })

  it("still has its db.test and rsc.test entries — the anti-vacuity anchor for the array", () => {
    // ADDITIVE, never a replacement. A rewritten `exclude` that dropped the incumbent globs would
    // still "contain a -live.test entry" under a looser assertion.
    expect(baseExclude.some((pattern) => pattern.includes("db.test"))).toBe(true)
    expect(baseExclude.some((pattern) => pattern.includes("rsc.test"))).toBe(true)
    expect(readStrippedSource(BASE_CONFIG)).toContain("configDefaults.exclude")
  })
})

describe("no operational script aims a destructive statement at a database it may only read", () => {
  // Both scripts here execute DDL against the cluster that holds the operator's real
  // records. Each has a database it OWNS (a scratch or test database it creates and drops)
  // and a database it may only READ. This scan is the standing proof that no destructive
  // verb ever appears on a line that names the second kind.
  //
  // It was single-file until phase 46. `scripts/migrate-from-zero.mjs` runs `CREATE
  // DATABASE` / `DROP DATABASE` on the same cluster, so it belongs under the same scan —
  // RESEARCH § Security Domain asked for exactly this.

  it.each(DESTRUCTIVE_SCAN_SUBJECTS)(
    "$path really contains destructive statements outside its comments — the scan's floor",
    ({ path, comments }) => {
      // ANTI-VACUITY, and the half the original scan lacked. A negative asserted over a
      // file with no destructive statements at all is satisfied by having nothing to
      // check; so is a negative asserted over the output of a comment stripper that
      // blanked every line. Both are indistinguishable from a passing gate. This floor
      // fails in either case. Both files honestly contain destructive statements today:
      // `DROP SCHEMA` in the shell script, `DROP DATABASE` in the `.mjs`.
      const source = readFileSync(path, "utf8")
      expect(source.length, `${path} is empty — the scan has no input`).toBeGreaterThan(500)

      const hits = codeLines(source, comments).filter((code) => DESTRUCTIVE_STATEMENT.test(code))
      expect(
        hits.length,
        `${path} yielded no destructive statement on any non-comment line. Either the ` +
          `script stopped issuing DDL (in which case delete it from this scan deliberately) ` +
          `or the ${comments} comment stripper is blanking real code.`
      ).toBeGreaterThan(0)
    }
  )

  it.each(DESTRUCTIVE_SCAN_SUBJECTS)(
    "$path really names $label outside its comments — the OTHER half of the floor",
    ({ path, comments, protectedToken, label }) => {
      // THE SECOND HALF, and the one the floor above does not cover. The floor above proves
      // the file contains destructive statements. Nothing proved the file contains the
      // PROTECTED TOKEN, and the negative below is `code.not.toMatch(protectedToken)` — a
      // matcher that matches nothing satisfies it on every line.
      //
      // So renaming `REFERENCE_DB` in scripts/migrate-from-zero.mjs (or refactoring it to
      // `reference.name`, which that script already uses) would turn this whole `describe`
      // permanently green *because* it stopped working — the exact anti-gate shape this
      // milestone exists to eliminate. Measured: with the identifier renamed, the negative
      // below passes 0 → 0 and reports success. Same for `$SOURCE_DB` in the shell script.
      //
      // If this went red, the identifier moved. Re-anchor `protectedToken` onto whatever the
      // script now calls the database it may only read — do NOT delete the subject.
      const tokenHits = codeLines(readFileSync(path, "utf8"), comments).filter((code) =>
        protectedToken.test(code)
      )
      expect(
        tokenHits.length,
        `${path} never names ${label} on a non-comment line, so the negative below matches ` +
          `nothing and passes vacuously. The identifier was almost certainly renamed: ` +
          `re-anchor protectedToken (${protectedToken}) onto its new name.`
      ).toBeGreaterThan(0)
    }
  )

  it.each(DESTRUCTIVE_SCAN_SUBJECTS)(
    "$path never aims a destructive statement at $label",
    ({ path, comments, protectedToken, label }) => {
      // Line-oriented rather than whole-file, so a sentence in the header that merely
      // mentions that database cannot mask a real statement, and a real statement cannot
      // hide behind one.
      codeLines(readFileSync(path, "utf8"), comments).forEach((code, index) => {
        if (!DESTRUCTIVE_STATEMENT.test(code)) return
        expect(
          code,
          `${path}:${index + 1} aims a destructive statement at ${label}: ${code.trim()}`
        ).not.toMatch(protectedToken)
      })
    }
  )
})
