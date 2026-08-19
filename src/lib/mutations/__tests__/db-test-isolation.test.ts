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
 * asserts the separation by reading the four files that implement it. Three independent
 * controls, all four assertions negative, plus two anti-vacuity anchors so an emptied or
 * renamed file cannot satisfy them by accident:
 *
 *   1. the base project EXCLUDES the *.db.test.* glob        (vitest.config.ts)
 *   2. `npm test` does not invoke the db project             (package.json)
 *   3. the workflow never mentions it at all                 (ci.yml)
 *
 * It deliberately does NOT import anything from the db project, does not read
 * E2E_DATABASE_URL, and opens no connection. Its whole subject is file content.
 */
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const CI_WORKFLOW = ".github/workflows/ci.yml"
const BASE_CONFIG = "vitest.config.ts"
const DB_CONFIG = "vitest.db.config.ts"
const PACKAGE_JSON = "package.json"

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
    expect(scripts["test:db"]).toBe("vitest run --config vitest.db.config.ts")
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

  it("declares no PostgreSQL service, so the exclusion is load-bearing rather than belt-and-braces", () => {
    // If a service container were ever added the reasoning in this file would change, and
    // it should change deliberately rather than by silently making these gates pointless.
    expect(workflow).not.toContain("services:")
    expect(workflow).not.toContain("postgres")
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
