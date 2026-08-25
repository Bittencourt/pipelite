/**
 * THE NODE ENGINES-FLOOR GATE.
 *
 * The production image ran `node:20-alpine`. Node 20 reached END OF LIFE on 2026-04-30, so that
 * image shipped an unpatched V8 and an unpatched OpenSSL to every self-hoster who built it. This is
 * not a hygiene item that can wait for a convenient phase — it is a live runtime with no upstream
 * security backports, pinned in three places, and nothing in the repository noticed.
 *
 * ── WHY THIS GATE READS THE LOCKFILE INSTEAD OF COMPARING AGAINST A NUMBER ────────────────────
 *
 * The obvious gate is `expect(tag).toBe("24-alpine")`. That gate is worthless, and the measured
 * history says so. On 2026-08-14 the binding `engines.node` constraint in this tree was vite 7's
 * `^20.19.0 || >=22.12.0`, reached transitively through vitest. Ten days later, on 2026-08-24, it
 * was `@napi-rs/lzma-linux-x64-gnu`'s `^22.20 || ^24.12 || >=25`, which arrives via `rollup` as an
 * optional dependency carrying NO `libc` field — so npm does not filter it out on alpine/musl and it
 * lands in the install tree regardless. The constraint moved by a whole major in ten days, without
 * a single line of this repository changing.
 *
 * A gate holding a literal would have stayed green through that move and would still be green the
 * next time it happens. So this file asserts a RELATION instead: every `engines.node` range
 * `package-lock.json` declares must be satisfied by the version `package.json` declares as its
 * floor, and the image tag and the CI pin must both agree with that declaration. When a dependency
 * raises its floor past what the image provides, this goes red on the dependency bump — which is
 * the only moment at which the information is cheap.
 *
 * ── WHY A MAJOR-ONLY PIN IS NOT SUFFICIENT PROOF ON ITS OWN ───────────────────────────────────
 *
 * `^24.12` is NOT satisfied by `24.0.0`. Measured against this lockfile: `24.0.0` produces one
 * violation and `24.12.0` produces zero. So "the tag says 24" is a necessary condition and not a
 * sufficient one. That is why `package.json` declares `>=24.12.0` — a patch-level floor — and why
 * the binding assertion below runs `semver.minVersion()` on that declaration and checks the
 * resulting concrete version against all ~832 declared ranges. The tag major is then checked
 * against the declaration, not against the lockfile directly.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────
 *
 * It does not shell out to `docker run --rm node:$TAG node -v`. Two reasons, both deliberate:
 * a conditionally-skipped assertion has no precedent in this repository and is one careless edit
 * away from becoming a permanent pass, and a registry pull inside a unit test makes the required CI
 * check depend on Docker Hub rate limits. So THIS FILE IS STRUCTURAL AND UNCONDITIONAL. The running
 * container's actual resolved version is proved BEHAVIOURALLY, by `docker compose exec app node -v`
 * against a real `docker compose up -d --build`. Do not add a skippable probe here; add the
 * behavioural check there.
 *
 * That split matters more than usual because `Dockerfile:7` runs `npm install --legacy-peer-deps`
 * rather than `npm ci`, so the in-image tree is not lockfile-exact. This gate therefore asserts the
 * DECLARED floor. Converting that install is a recorded, deferred item.
 *
 * ── THE PERMANENT NEGATIVE CONTROL ───────────────────────────────────────────────────────────
 *
 * v1.3 shipped six gates that could not fail. The countermeasure here is NC-3, below: the checker is
 * invoked against `20.20.2` — what `node:20-alpine` resolved to — and is required to report EXACTLY
 * ONE violation, naming `@napi-rs/lzma-linux-x64-gnu`. It stays in this file forever. It costs
 * nothing, it is standing proof that the checker can produce a red rather than merely never
 * disagreeing with anything, and it pins the current binding constraint where the next reader will
 * find it.
 *
 * If you are raising a dependency and this went red, RAISE THE PIN — all three `FROM node:` tags,
 * the `package.json` `engines.node` floor and the `ci.yml` `node-version` together. Never lower the
 * assertion.
 */
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"
import semver from "semver"
import { parse } from "yaml"

const REPO_ROOT = process.cwd()

const PACKAGE_JSON = "package.json"
const PACKAGE_LOCK = "package-lock.json"
const DOCKERFILE_PATH = "Dockerfile"
const CI_WORKFLOW = ".github/workflows/ci.yml"

/**
 * Floor on the number of `engines.node` ranges walked out of the lockfile. Measured on the tree
 * this gate was written against: 832 declared ranges across 106 distinct range expressions (834
 * before `semver` and `@types/semver` were installed — npm deduplicated two nested copies). 800 is
 * a deliberately loose floor that still fails hard if the lockfile path constant is wrong, if the
 * `packages` key is renamed by a future lockfile version, or if the walk stops finding anything.
 *
 * Without this floor a broken walk yields an empty array, therefore zero violations, therefore a
 * permanently green gate — the exact shape of the v1.3 gates that could not fail.
 */
const MIN_DECLARED_RANGES = 800

/** The number of `FROM node:` stages the Dockerfile has. deps, builder, runner. */
const EXPECTED_NODE_STAGES = 3

interface WorkflowStep {
  uses?: string
  with?: Record<string, unknown>
}

interface WorkflowDocument {
  jobs?: Record<string, { steps?: WorkflowStep[] } | undefined>
}

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

const dockerfileRaw = readRepoFile(DOCKERFILE_PATH)
const packageRaw = readRepoFile(PACKAGE_JSON)
const lockRaw = readRepoFile(PACKAGE_LOCK)
const ciWorkflow = parse(readRepoFile(CI_WORKFLOW)) as WorkflowDocument

interface DeclaredRange {
  pkg: string
  range: string
}

/**
 * Every `engines.node` range the lockfile declares, with the package that declares it.
 *
 * No union of the 106 distinct range expressions is computed, and none is needed: unioning
 * arbitrary semver ranges is genuinely hard and is not the question being asked. The question is
 * whether ONE concrete version satisfies all of them, which is one `satisfies` call per range.
 */
export function declaredNodeRanges(lockText: string = lockRaw): DeclaredRange[] {
  const lock = JSON.parse(lockText) as {
    packages?: Record<string, { engines?: { node?: string | string[] } } | undefined>
  }
  const out: DeclaredRange[] = []
  for (const [pkgPath, meta] of Object.entries(lock.packages ?? {})) {
    const declared = meta?.engines?.node
    if (!declared) continue
    const range = Array.isArray(declared) ? declared.join(" || ") : declared
    out.push({ pkg: pkgPath.replace(/^node_modules\//, "") || "(root)", range })
  }
  return out
}

/** Violations of `actual` against every declared range. An empty array means satisfied. */
export function nodeFloorViolations(
  actual: string,
  ranges: DeclaredRange[] = declaredNodeRanges()
): DeclaredRange[] {
  return ranges.filter(({ range }) => !semver.satisfies(actual, range, { loose: true }))
}

/**
 * Every `FROM node:<tag>` in a Dockerfile, in file order.
 *
 * Anchored at line start so a commented-out `# FROM node:...` and a `COPY --from=node:...` are both
 * invisible to it — a gate that counts a commented pin is measuring prose, not the image.
 */
export function nodeBaseTags(dockerfileText: string = dockerfileRaw): string[] {
  return [...dockerfileText.matchAll(/^\s*FROM\s+node:(\S+)/gm)].map((match) => match[1])
}

/**
 * The major encoded in a pin: `24-alpine` -> 24, `24.12.0-bookworm-slim` -> 24, `24` -> 24.
 *
 * Shared by the Dockerfile tags and the `node-version` the workflow installs, because the whole
 * point of this file is that those two are the same number expressed two ways.
 */
function pinMajor(pin: string): number {
  const match = /^(\d+)/.exec(pin)
  if (!match) throw new Error(`node pin "${pin}" has no leading major version`)
  return Number(match[1])
}

/** The Node version the required CI check installs, read from the parsed workflow. */
export function ciNodeVersion(): string {
  const steps = ciWorkflow.jobs?.ci?.steps ?? []
  const setupNode = steps.filter((step) => (step.uses ?? "").startsWith("actions/setup-node@"))
  if (setupNode.length !== 1) {
    throw new Error(
      `${CI_WORKFLOW}: expected exactly one actions/setup-node step in job \`ci\`, found ` +
        `${setupNode.length}. The container pin is asserted against this value; if the workflow ` +
        `shape changed, re-anchor this reader rather than deleting the assertion.`
    )
  }
  return String(setupNode[0].with?.["node-version"])
}

/** The `engines.node` range package.json declares, or undefined while it declares none. */
function declaredEnginesNode(): string | undefined {
  const parsed = JSON.parse(packageRaw) as { engines?: { node?: string } }
  return parsed.engines?.node
}

/** Throws with an actionable message rather than returning undefined into a semver call. */
function requireEnginesNode(): string {
  const declared = declaredEnginesNode()
  if (declared === undefined) {
    throw new Error(
      `${PACKAGE_JSON} declares no \`engines.node\`. It is the anchor every other assertion in ` +
        `this file hangs off: the image tag and the CI pin are both checked against it, not ` +
        `against each other. Add it between \`private\` and \`scripts\`, derived from the ` +
        `lockfile — the lowest version for which nodeFloorViolations() returns [].`
    )
  }
  return declared
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE MATCHERS PROVE THEMSELVES BEFORE THEY ARE TRUSTED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the `FROM node:` matcher, unit-tested against fixtures FIRST", () => {
  /**
   * These assertions gate everything below them. A regex that matches nothing yields an empty tag
   * list, an empty list has a Set size of 0 and a length of 0, and every relational assertion built
   * on it becomes unfalsifiable. If any fixture here is red, treat every pass further down as
   * unproven.
   */
  const KNOWN_POSITIVE = [
    ["FROM node:24-alpine AS runner", "24-alpine"],
    ["FROM node:20-alpine AS deps", "20-alpine"],
    ["  FROM node:24.12.0-bookworm-slim AS builder", "24.12.0-bookworm-slim"],
  ] as const

  const KNOWN_NEGATIVE = [
    // A different image entirely. docker-compose.yml pins this one; it must never be counted.
    "FROM postgres:16-alpine",
    // Commented out. A pin that is prose is not a pin, and counting it would let a stale comment
    // satisfy the "all three stages agree" assertion.
    "# FROM node:20-alpine AS deps",
    // A cross-stage copy source, not a stage base. `--from=` is not `FROM `.
    "COPY --from=node:24-alpine /x /y",
    // The real builder-stage line that copies from the deps stage.
    "COPY --from=deps /app/node_modules ./node_modules",
  ] as const

  it.each(KNOWN_POSITIVE)("MUST extract the tag from: %s", (fixture, expected) => {
    expect(nodeBaseTags(fixture)).toEqual([expected])
  })

  it.each(KNOWN_NEGATIVE)("MUST NOT match: %s", (fixture) => {
    expect(nodeBaseTags(fixture)).toEqual([])
  })

  it("reads a major off a pin rather than off a literal", () => {
    expect(pinMajor("24-alpine")).toBe(24)
    expect(pinMajor("20-alpine")).toBe(20)
    expect(pinMajor("24.12.0-bookworm-slim")).toBe(24)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE WALKS REACHED REAL FILES (ANTI-VACUITY).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the lockfile walk and the Dockerfile scan are not vacuous", () => {
  it(`walks at least ${MIN_DECLARED_RANGES} declared engines.node ranges out of the lockfile`, () => {
    // The cheapest possible evidence that the walk ran against a real lockfile. A wrong path
    // constant or a renamed `packages` key yields [], which yields zero violations forever.
    expect(declaredNodeRanges().length).toBeGreaterThanOrEqual(MIN_DECLARED_RANGES)
  })

  it("walked distinct range expressions, not one range repeated by a broken reader", () => {
    // Measured: 106 distinct expressions across 832 declarations. A reader that returned the same
    // string N times would clear the floor above while proving nothing.
    const distinct = new Set(declaredNodeRanges().map((entry) => entry.range))
    expect(distinct.size).toBeGreaterThanOrEqual(50)
  })

  it(`finds all ${EXPECTED_NODE_STAGES} \`FROM node:\` stages in the Dockerfile`, () => {
    expect(nodeBaseTags()).toHaveLength(EXPECTED_NODE_STAGES)
  })

  it("finds the same tag in all three stages — changing one of three is not a fix", () => {
    // The deps stage installs, the builder stage compiles and the runner stage executes. A tag
    // raised in one place and not the others produces an image whose build-time and run-time
    // runtimes disagree, and every partial state builds cleanly.
    const tags = nodeBaseTags()
    expect(new Set(tags).size, `Dockerfile pins divergent node tags: ${tags.join(", ")}`).toBe(1)
  })

  it("reads a node-version out of the required CI check", () => {
    // Anti-vacuity anchor for the CI half: if the workflow were emptied, renamed or restructured,
    // ciNodeVersion() would throw here rather than silently comparing undefined to undefined.
    expect(ciNodeVersion()).toMatch(/^\d+/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. NC-3 — THE PERMANENT NEGATIVE CONTROL. DO NOT DELETE.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Upper bound on the number of ranges an EOL Node may violate before the control itself is
 * suspect. Measured 2026-08-25: exactly 1 violation at 20.20.2, out of 834 declared ranges.
 * Five leaves room for several ordinary dependency bumps while staying three orders of
 * magnitude below "the checker thinks everything is violated".
 */
const MAX_EXPECTED_VIOLATIONS = 5

describe("NC-3: the checker can produce a red", () => {
  /**
   * `node:20-alpine` resolved to v20.20.2 — the runtime this repository shipped until phase 46.
   * Measured against this lockfile, it violates exactly one declared range:
   *
   *   @napi-rs/lzma-linux-x64-gnu :: "^22.20 || ^24.12 || >=25"
   *
   * This assertion is the standing proof that `nodeFloorViolations` reports violations at all,
   * rather than being a function that has simply never disagreed with anything. It also records
   * WHICH constraint was binding when the pin moved, so the next reader can see what changed.
   *
   * WHY IT IS NOT AN EXACT-ARRAY EQUALITY ANY MORE. It was, and that made it a control that would
   * go red for a reason that says nothing about the pin. This file's own reasoning (:11-17) records
   * that the binding constraint changed package AND major in ten days without a line of this
   * repository changing; the next dependency bump adding any package with an `engines.node` floor
   * above 20.20.2 is an ordinary event, and it would have produced
   * "expected [a, b] to equal [@napi-rs/lzma-linux-x64-gnu]" with no hint that the correct action
   * is to edit the control rather than the pin — next to a file that instructs the reader "Never
   * lower the assertion". A control that misdirects the person it wakes up is worse than a looser
   * one.
   *
   * So the exactness is kept exactly where it is load-bearing — the named package MUST still be
   * reported — and relaxed where it is not. The "reported every range as violated" failure mode
   * that motivated the equality is ruled out by the upper bound here AND by the complement below
   * (`nodeFloorViolations("24.12.0")` is `[]`), which no constant-array implementation can satisfy.
   */
  it("reports the binding violation for 20.20.2, and not the whole lockfile", () => {
    const pkgs = nodeFloorViolations("20.20.2").map((violation) => violation.pkg)
    expect(
      pkgs,
      "20.20.2 must still violate the constraint that forced the pin off node:20-alpine"
    ).toContain("@napi-rs/lzma-linux-x64-gnu")
    expect(
      pkgs.length,
      `if this grew, a NEW dependency raised the floor — update this control, NOT the pin, and ` +
        `record what changed. If it is near ${MIN_DECLARED_RANGES}, the checker is reporting ` +
        `every range as violated and is broken. Violations: ${pkgs.join(", ")}`
    ).toBeLessThanOrEqual(MAX_EXPECTED_VIOLATIONS)
  })

  it("reports none for 24.12.0, so the control distinguishes the two cases", () => {
    // The complement. Without it, a checker that returned a constant one-element array would pass
    // the assertion above.
    expect(nodeFloorViolations("24.12.0")).toEqual([])
  })

  it("reports a violation for 24.0.0 — a major-only pin is not sufficient proof", () => {
    // `^24.12` is not satisfied by `24.0.0`. This is why the declared floor is patch-level and why
    // the tag major alone is never the binding assertion. Same relaxation as above, same reason.
    const pkgs = nodeFloorViolations("24.0.0").map((violation) => violation.pkg)
    expect(pkgs, "24.0.0 must still fail lzma's ^24.12 term").toContain(
      "@napi-rs/lzma-linux-x64-gnu"
    )
    expect(pkgs.length, `violations: ${pkgs.join(", ")}`).toBeLessThanOrEqual(
      MAX_EXPECTED_VIOLATIONS
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. THE BINDING CHAIN: lockfile -> package.json engines -> Dockerfile tag -> ci.yml pin.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the declared Node floor binds the lockfile to the image and to CI", () => {
  it("package.json declares an engines.node floor at all", () => {
    expect(
      declaredEnginesNode(),
      `${PACKAGE_JSON} must declare \`engines.node\`; it is the single source of truth the ` +
        `image tag and the CI pin are both measured against.`
    ).toBeDefined()
  })

  it("the declared floor's own minimum satisfies every range the lockfile declares", () => {
    // THE ASSERTION THIS FILE EXISTS FOR, and note that no version literal appears in it. The
    // declared range is reduced to its lowest satisfying version and that concrete version is
    // checked against all ~832 declared ranges. A dependency that raises its floor above the
    // declaration turns this red on the bump commit.
    const declared = requireEnginesNode()
    const minimum = semver.minVersion(declared)
    expect(minimum, `\`${declared}\` is not a range semver can reduce to a minimum`).not.toBeNull()

    const violations = nodeFloorViolations(minimum?.version ?? "0.0.0")
    expect(
      violations.map((violation) => `${violation.pkg} requires ${violation.range}`),
      `package.json engines.node is "${declared}" (minimum ${minimum?.version}), which does not ` +
        `satisfy every engines.node range in ${PACKAGE_LOCK}. Raise the declared floor and all ` +
        `three Dockerfile pins together.`
    ).toEqual([])
  })

  it("every Dockerfile stage pins the major the declared floor requires", () => {
    const declared = requireEnginesNode()
    const minimum = semver.minVersion(declared)
    const requiredMajor = semver.major(minimum ?? "0.0.0")

    for (const tag of nodeBaseTags()) {
      expect(
        pinMajor(tag),
        `Dockerfile pins node:${tag} while package.json declares "${declared}". Move the tag, ` +
          `not the declaration — the declaration is checked against the lockfile above.`
      ).toBe(requiredMajor)
    }
  })

  it("the required CI check installs the same major the image runs", () => {
    // BACKLOG 999.14's actual complaint: two independent pins with no relationship between them,
    // which had already drifted (container 20, CI 24) without anything noticing. Both are now
    // measured against the same declaration, so they can no longer diverge silently.
    const declared = requireEnginesNode()
    const requiredMajor = semver.major(semver.minVersion(declared) ?? "0.0.0")

    expect(
      pinMajor(ciNodeVersion()),
      `.github/workflows/ci.yml installs Node ${ciNodeVersion()} while package.json declares ` +
        `"${declared}". CI must exercise the runtime the image ships.`
    ).toBe(requiredMajor)
  })
})
