/**
 * SC-5 — audit capture required no edit to any mutation function.
 *
 * The claim this file makes mechanical: nothing under `src/lib/mutations/` imports,
 * references, or calls into the audit layer. Capture happens entirely on the far side of
 * `crmBus`, so the mutation modules emit an event and know nothing about who listens.
 *
 * ---------------------------------------------------------------------------------------
 * SCOPE, stated honestly, because a scope left vague is how "SC-5 holds" becomes untrue
 * without anyone noticing:
 *
 *   IN scope  — every non-test `.ts` file under `src/lib/mutations/`.
 *
 *   OUT of scope, deliberately, and not leaks:
 *     - `src/app/import/actions.ts` and `src/lib/import/pipedrive-api-import-actions.ts`.
 *       The two importers write ONE summary row per import session directly, which is a
 *       locked decision (36-12): per-record events would have meant 25,206 trigger
 *       evaluations and webhook deliveries for a single import. They are outside the SC-5
 *       claim rather than exceptions to it, and saying so here is what keeps the claim
 *       truthful.
 *     - `src/lib/custom-fields.ts`. It emits a `crmBus` event (36-06) and imports nothing
 *       from the audit layer — the same posture as the mutation modules, but a different
 *       file group with its own gate.
 * ---------------------------------------------------------------------------------------
 *
 * THREE ANTI-VACUITY REQUIREMENTS. A gate without all three is a string that happens to be
 * absent, and both of this repo's source-gate analogs shipped exactly that bug:
 *
 *   1. Prove the files were found and read. A glob that silently matches zero files passes
 *      a "no file imports X" test perfectly. Hence the explicit count assertions below.
 *   2. Prove they are the RIGHT files, by asserting a known POSITIVE marker (`crmBus.emit`)
 *      before asserting the negative. If emission moves elsewhere, this gate must go red
 *      and be reconsidered, not keep passing over files that no longer emit anything.
 *   3. A gate for the gate: two vocabulary tables pinning what the detector recognises and
 *      what it must leave alone. Without one, the next idiom sails straight through — which
 *      is precisely how WR-14 happened in `record-dialog-note-failure.test.ts`, where three
 *      of seven call sites had grown a named handler the detector was blind to.
 *
 * Comment stripping is mandatory, not cosmetic. Every assertion that matters here is a
 * NEGATIVE one, and a negative source assertion is trivially invalidated by a comment that
 * merely mentions the code it forbids. This is not hypothetical in these particular files:
 * four of them carry a tombstone comment that says the word "audit" out loud. That is
 * asserted below, so the stripping is proven to run rather than assumed to.
 *
 * WR-13 (`indexOf(x, -1)` silently behaving as `indexOf(x, 0)`, so a helper handed a
 * missing anchor widens to the enclosing block and stops detecting without saying so) does
 * not apply here: no helper in this file takes an `indexOf` result as an anchor. Any future
 * helper that does must assert `> -1` on the ANCHOR with a named message before using it —
 * checking the brace cannot catch it, because the brace it finds does exist.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import path from "node:path"

const REPO_ROOT = process.cwd()
const MUTATIONS_DIR = path.join(REPO_ROOT, "src", "lib", "mutations")

/**
 * Strip `/* *\/` blocks and `//` line comments.
 *
 * Mandatory, not cosmetic — see the file header. The `[^:]` guard keeps `https://` out of
 * the line-comment match.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

/** Read a source file verbatim. Missing file = loud failure, by design. */
function readRaw(file: string): string {
  return readFileSync(file, "utf8")
}

/**
 * Test files are out of scope: they are not part of the runtime module graph, and they quote
 * the very patterns being searched for as literals — including this file, which would
 * otherwise register as its own worst offender.
 */
const isTestFile = (file: string) =>
  /(^|[/\\])__tests__[/\\]/.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)

/**
 * Every non-test `.ts` file directly under `dir`, sorted.
 *
 * A missing directory returns an empty list rather than throwing, on purpose: the emptiness
 * is then caught by the count assertions, which is the failure mode worth rehearsing. A
 * silent zero-file scan is the single most likely way this gate stops meaning anything.
 */
function listMutationSources(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => name.endsWith(".ts"))
    .map(name => path.join(dir, name))
    .filter(file => !isTestFile(file))
    .sort()
}

/**
 * The four CRM entity mutation modules — the ones whose writes must produce audit rows, and
 * therefore the ones where a coupling to the audit layer would actually be tempting. The
 * directory also holds `index.ts`, `notes.ts`, `workflows.ts`, `http-templates.ts` and
 * `workflow-templates.ts`; those are covered by the wider scan below, but they are not the
 * files this positive marker is about.
 */
const CRM_MUTATION_MODULES = ["activities.ts", "deals.ts", "organizations.ts", "people.ts"] as const

/** The positive marker: how a mutation module hands a change to anyone who cares. */
const EMITS = "crmBus.emit"

/**
 * Any reference into the audit layer, in every shape this codebase could plausibly write one.
 *
 * The alternation is deliberately broader than "the import line", because an import is only
 * the most visible coupling. A bare `auditLog` table reference, an `await import()`, a
 * `require()`, a relative specifier, or a type-only import of `AuditChangeMap` all couple the
 * mutation layer to the audit layer just as firmly — and the type-only form is the one most
 * likely to be argued as harmless. It is not: it means the mutation module had to know the
 * audit layer's shape.
 *
 * `\bauditLog\w*` catches `auditLog`, `auditLogRow`, `auditLogs`. `\bAudit[A-Z]\w*` catches
 * the exported type names. Neither matches a variable called `auditedFields`, which is pinned
 * in the should-not table below so that stays true.
 */
const COUPLES_TO_AUDIT = new RegExp(
  [
    String.raw`@/lib/audit\b`,
    String.raw`\.\./audit/`,
    String.raw`@/db/schema/audit-log\b`,
    String.raw`\bauditLog\w*`,
    String.raw`\bAudit[A-Z]\w*`,
    String.raw`\b(?:getCurrentActor|runWithActor|buildChanges|normaliseEventData|startAuditPruner|readRetentionDays)\s*\(`,
  ].join("|")
)

/**
 * The detector as it is actually applied: strip first, then match.
 *
 * The composition is the unit under test, not the regex alone. Stripping is what makes the
 * negative assertions mean something, so the vocabulary tables exercise this function rather
 * than `COUPLES_TO_AUDIT` directly — otherwise nothing would prove the stripping ever runs.
 */
function couplesToAudit(source: string): boolean {
  return COUPLES_TO_AUDIT.test(stripComments(source))
}

const files = listMutationSources(MUTATIONS_DIR)
const rawSources = new Map(files.map(file => [file, readRaw(file)] as const))
const strippedSources = new Map(files.map(file => [file, stripComments(rawSources.get(file)!)] as const))
const crmFiles = files.filter(file => CRM_MUTATION_MODULES.includes(path.basename(file) as never))
const relative = (file: string) => path.relative(REPO_ROOT, file)

describe("SC-5 anti-vacuity — the scan really found and read the mutation modules", () => {
  it("found the four CRM entity mutation modules and read them", () => {
    // Requirement 1. Without this, a renamed or moved directory turns every negative
    // assertion below into a loop over nothing, and the gate passes perfectly while
    // detecting absolutely nothing.
    expect(existsSync(MUTATIONS_DIR), `${relative(MUTATIONS_DIR)} does not exist`).toBe(true)
    expect(crmFiles.map(f => path.basename(f))).toHaveLength(4)
    expect(crmFiles.map(f => path.basename(f))).toEqual([...CRM_MUTATION_MODULES])

    for (const file of crmFiles) {
      expect(rawSources.get(file)!.length, `${relative(file)} is empty`).toBeGreaterThan(0)
    }
  })

  it("scans the whole mutations directory, not only those four", () => {
    // The negative assertion applies to every non-test module in the directory. Non-empty,
    // so a refactor that moves or renames the directory makes this gate FAIL loudly rather
    // than pass vacuously over an empty set.
    expect(files.length).toBeGreaterThan(0)
    expect(files.length).toBeGreaterThanOrEqual(crmFiles.length)
  })

  it("confirms the four are the right files: every one of them emits on the bus", () => {
    // Requirement 2. A positive marker asserted BEFORE the negative. If emission moves out
    // of these modules, this goes red and the whole gate gets reconsidered, instead of
    // quietly certifying files that no longer do the thing SC-5 is about.
    for (const file of crmFiles) {
      expect(strippedSources.get(file)!, `${relative(file)} no longer contains ${EMITS}`).toContain(EMITS)
    }
  })

  it("and that they are the ONLY modules in the directory that emit", () => {
    // Pins the set both ways. A fifth emitter appearing means a new entity gained CRM
    // events, and it must be added to CRM_MUTATION_MODULES deliberately rather than
    // slipping past the positive marker unnoticed.
    const emitters = files.filter(file => strippedSources.get(file)!.includes(EMITS))
    expect(emitters.map(f => path.basename(f))).toEqual([...CRM_MUTATION_MODULES])
  })
})

describe("SC-5 — no mutation module references the audit layer", () => {
  it("no file under src/lib/mutations couples to the audit layer", () => {
    const offenders = files
      .filter(file => COUPLES_TO_AUDIT.test(strippedSources.get(file)!))
      .map(file => {
        const hit = COUPLES_TO_AUDIT.exec(strippedSources.get(file)!)
        return `${relative(file)} references the audit layer via \`${hit?.[0]}\``
      })

    expect(offenders).toEqual([])
  })

  it("comment stripping is load-bearing here, not a formality", () => {
    // Not hypothetical: the four CRM modules each carry a tombstone comment saying that
    // omitting the previous row "would silently produce an audit row with no detail". A
    // detector run over raw source would have to treat that as noise; this one never sees
    // it. The assertion is what proves stripComments actually runs on real input.
    const mentionsAudit = (source: string) => /\baudit\b/i.test(source)
    const withAuditProse = files.filter(file => mentionsAudit(rawSources.get(file)!))

    expect(withAuditProse.length).toBeGreaterThan(0)

    for (const file of withAuditProse) {
      // If this ever fails because a mutation module legitimately says "audit" in CODE
      // rather than in prose, that is a finding to review here — not a line to delete.
      expect(mentionsAudit(strippedSources.get(file)!), `${relative(file)} names the audit layer outside a comment`).toBe(false)
    }
  })
})

/*
 * A gate for the gate.
 *
 * The detector above is only worth its assertions if it recognises how a coupling would
 * actually be written. Pin the vocabulary, so the next idiom has to be added here
 * deliberately rather than discovered by a reviewer after it has already shipped.
 */
describe("the detector recognises how a mutation module would actually reach the audit layer", () => {
  it.each([
    `import { getCurrentActor } from "@/lib/audit/actor-context"`,
    `import { buildChanges } from '@/lib/audit/diff'`,
    `import type { AuditChangeMap } from "@/lib/audit/diff"`,
    `import { diffRows } from "../audit/diff"`,
    `import { auditLog } from "@/db/schema/audit-log"`,
    `const { startAuditPruner } = require("@/lib/audit/prune")`,
    `const { getCurrentActor } = await import("@/lib/audit/actor-context")`,
    `await db.insert(auditLog).values(row)`,
    `let row: AuditLogRow | null = null`,
    `const changes = buildChanges(payload)`,
    `return runWithActor(actor, () => updateDeal(input))`,
  ])("catches %s", line => {
    expect(couplesToAudit(line)).toBe(true)
  })

  it.each([
    // Stripped away before the detector ever sees it. This is the assertion that proves the
    // stripping is wired into the detector, not merely defined next to it.
    `// import { getCurrentActor } from "@/lib/audit/actor-context"`,
    `/* omitting it would silently produce an audit row with no detail. */`,
    // Named like the schema table but is not it.
    `const auditedFields = ["title", "value"]`,
    `const auditor = session.user.name`,
    // The word inside an unrelated string literal.
    `const message = "audit"`,
    // The `[^:]` guard leaves this line intact, and it still must not trip.
    `const docs = "https://example.com/audit-log"`,
    // The positive marker itself: emitting is the whole point, never a coupling.
    `crmBus.emit("deal.updated", payload)`,
  ])("leaves %s alone", line => {
    expect(couplesToAudit(line)).toBe(false)
  })
})
