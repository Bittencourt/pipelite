/**
 * OBS-01 / Phase 43 D-6 — the SHAPE of every log scope in non-test source.
 *
 * A scope is an index key. An operator greps a log stream by it, so 279 scopes that are single
 * tokens and one that is `Pipedrive API` is not a cosmetic inconsistency: it is one key that does
 * not work the way the other 278 do. This file makes the shape mechanical so it cannot drift back.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS GATE DOES **NOT** ASSERT, AND WHY.
 *
 * It is NOT a lowercase-kebab rule. Scopes legitimately contain `/`, `[`, `]` and digits, because
 * most of them are route or module paths harvested from the file they live in —
 * `api/v1/trash/[type]/[id]`, `workflows/[id]/runs/[runId]`, `components/timeline/record-timeline`.
 * A kebab-only rule would go red on roughly forty valid scopes on day one, and a gate that is red
 * on day one gets deleted rather than fixed. So the rule here is narrower and defensible:
 *
 *   1. NO scope contains whitespace. This is D-6's actual criterion and the property that actually
 *      hurts — a space is what stops a scope being grepped as one token.
 *   2. OUTSIDE a `[dynamicSegment]`, a scope uses only `a-z`, `0-9`, `/` and `-`.
 *   3. Exactly one scope is exempt from (2), pinned by name AND by file below.
 *
 * The `[...]` carve-out in (2) is not a loophole bolted on to make the numbers work. Next.js
 * dynamic segments are camelCase *as directory names on disk* — `[entityType]`, `[fieldName]`,
 * `[noteId]`, `[runId]` — so a scope harvested from such a route path carries their capitals by
 * construction. Eight distinct segments appear today; forcing them to lowercase would make the
 * scope stop matching the route it names, which is the opposite of useful. The carve-out is
 * BOUNDED rather than blanket: every bracket segment must itself be a bare identifier
 * (`/^\[[A-Za-z][A-Za-z0-9]*\]$/`), so `[Foo Bar]` or `[A-B]` cannot ride through it, and the
 * carve-out is asserted to apply to a non-zero number of scopes so it cannot quietly become dead
 * code that nobody deletes.
 *
 * ---------------------------------------------------------------------------------------------
 * THE PINNED EXCLUSION. `importFromPipedrive`, in
 * `src/lib/import/pipedrive-api-import-actions.ts`, is a genuine camelCase scope harvested from a
 * function name. It is NOT what D-6 names and normalizing it is a separate decision, so it is
 * handled the way this repo has handled pinned debt since Phase 38: named as a single explicit
 * exclusion and ASSERTED, not silently absorbed and not silently widened away. The assertion is
 * an equality on the offender set, so **normalizing that scope turns this gate red and forces the
 * exclusion to be deleted in the same commit**. That is the whole point of pinning it rather than
 * writing `[A-Za-z]` into the charset and pretending the debt does not exist.
 *
 * ---------------------------------------------------------------------------------------------
 * ANTI-VACUITY. Phase 42 shipped roughly ten acceptance gates that could not fail; the worst was
 * a grep with a malformed bracket expression that matched nothing and therefore "passed" on an
 * empty diff. Every negative assertion below is built on one extraction, so if that extraction
 * finds nothing, every negative assertion passes for free. Four defences, in order:
 *
 *   1. THE STRIPPING IS PROVEN, not assumed. Two files carry `log.<level>(` inside PROSE:
 *      `src/lib/views/write-guards.ts` (the doc comment "The obvious `log.error(error)` would
 *      put…") and `src/lib/log.ts` (its own usage example, `log.error("trash-prune", …)`). The
 *      second is the dangerous one — un-stripped it yields a perfectly plausible scope out of a
 *      comment. Both are asserted present in the RAW text and absent from the STRIPPED text.
 *   2. TWO FLOORS with the real numbers recorded: >= 250 scopes across >= 80 distinct files.
 *   3. CALL-SITE EQUALITY. The count of `log.<level>(` occurrences in the stripped corpus must
 *      EQUAL the number of extracted scopes. A matcher that silently skips call sites is caught
 *      rather than trusted. This assertion is deliberately an equality; if a genuinely dynamic
 *      scope ever appears, pin it by file and line here — do not relax this to `<=`.
 *   4. LINE ALIGNMENT. `stripComments` collapses multi-line block comments, so a line number
 *      counted in the stripped text drifts (the D-6 offender sits at stripped line 39 and raw
 *      line 42). Reported lines are therefore resolved back into the RAW file, and that
 *      resolution is asserted rather than trusted — a failure message naming the wrong line is a
 *      failure message that sends the next reader to the wrong place.
 *
 * `readStrippedSource` is deliberately not used: defence 1 and defence 4 both need the RAW text
 * alongside the stripped text, so this file reads once and strips explicitly.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { stripComments } from "@/components/custom-fields/__tests__/source-scan"

const REPO_ROOT = process.cwd()
const SRC_DIR = path.join(REPO_ROOT, "src")

/**
 * Every `log.<level>(` occurrence, with no literal required. Used only for the call-site-equality
 * count, so it must recognise exactly the same four verbs as the extractor below.
 */
const CALL_SITE_RE = /\blog\.(?:debug|info|warn|error)\(/g

/**
 * The scope extractor.
 *
 * `\s*` after the paren is load-bearing: at least ten call sites put the literal on the NEXT line
 * (`src/app/api/v1/people/route.ts`, `src/lib/api/rate-limit.ts`, …), and a matcher demanding the
 * quote immediately after the paren would silently drop all of them — which would break the
 * call-site-equality assertion above, which is exactly what that assertion is for.
 *
 * Accepting `'` as well as `"` is equally load-bearing: ten scopes are single-quoted.
 */
const SCOPE_RE = /\blog\.(?:debug|info|warn|error)\(\s*(['"])([^'"]*)\1/g

/** Outside a `[dynamicSegment]`, this is the whole legal alphabet for a scope. */
const SCOPE_CHARSET = /^[a-z0-9/-]*$/

/** A `[dynamicSegment]` must be a bare identifier — the carve-out is bounded, not blanket. */
const DYNAMIC_SEGMENT = /^\[[A-Za-z][A-Za-z0-9]*\]$/

/**
 * PINNED DEBT, out of D-6's scope.
 *
 * `importFromPipedrive` is a camelCase scope harvested from a function name. D-6 names only the
 * whitespace-carrying `Pipedrive API`, and normalizing this one is a separate decision with its
 * own call sites to think about. It is excluded here BY NAME AND BY FILE, and the exclusion is
 * asserted as an equality on the offender set.
 *
 * IF YOU NORMALIZE IT: this gate goes red, and the fix is to DELETE this constant and the
 * assertion that names it, in the SAME commit. Do not add a second entry to make a new offender
 * pass — that turns a pin into a blanket pass, which is how the debt stops being visible.
 */
const PINNED_CASE_EXCLUSION = {
  scope: "importFromPipedrive",
  file: "src/lib/import/pipedrive-api-import-actions.ts",
} as const

/**
 * Two files whose PROSE contains a `log.<level>(` that must never reach the extractor.
 *
 * `log.ts` is the sharp one: its example is `log.error("trash-prune", "Tick error", …)`, a
 * syntactically perfect call with a perfectly plausible scope. If stripping ever breaks, that
 * comment donates a phantom scope and `write-guards.ts` donates a phantom call site with no
 * literal at all — so the call-site-equality assertion would fail for a reason that has nothing
 * to do with logging. Better to say so directly.
 */
const PROSE_ONLY_CALLS = [
  { file: "src/lib/views/write-guards.ts", text: "log.error(error)" },
  { file: "src/lib/log.ts", text: 'log.error("trash-prune"' },
] as const

const MIN_SCOPES = 250
const MIN_FILES = 80

interface Extracted {
  file: string
  line: number
  scope: string
}

/** Non-test `.ts`/`.tsx` under `src/`. Test files are excluded by basename AND by `__tests__/`. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue
      sourceFiles(full, acc)
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    if (/\.(test|spec)\./.test(entry.name)) continue
    acc.push(full)
  }
  return acc
}

/** 1-based line of the `occurrence`-th appearance of `text` in `raw`, or -1. */
function rawLineOf(raw: string, text: string, occurrence: number): number {
  let from = 0
  for (let n = 0; ; n += 1) {
    const at = raw.indexOf(text, from)
    if (at === -1) return -1
    if (n === occurrence) return raw.slice(0, at).split("\n").length
    from = at + 1
  }
}

/** Everything the assertions below read, computed once. */
function scan(): {
  scopes: Extracted[]
  callSites: number
  filesScanned: number
  filesWithScopes: number
  misalignedLines: string[]
} {
  const files = sourceFiles(SRC_DIR)
  const scopes: Extracted[] = []
  const filesWithScopes = new Set<string>()
  const misalignedLines: string[] = []
  let callSites = 0

  for (const file of files) {
    const raw = readFileSync(file, "utf8")
    const stripped = stripComments(raw)
    const rel = path.relative(REPO_ROOT, file)

    callSites += (stripped.match(CALL_SITE_RE) ?? []).length

    // How many times each exact match text has been seen in THIS file, so the n-th stripped
    // match resolves to the n-th raw occurrence of the same text.
    const seen = new Map<string, number>()
    const rawLines = raw.split("\n")

    SCOPE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = SCOPE_RE.exec(stripped)) !== null) {
      const text = match[0]
      const occurrence = seen.get(text) ?? 0
      seen.set(text, occurrence + 1)

      const line = rawLineOf(raw, text, occurrence)
      const scope = match[2] as string

      // Defence 4: the reported line must really carry this call. A multi-line call site puts the
      // literal one or two lines below the `log.<level>(`, hence the small window.
      const window = line === -1 ? "" : rawLines.slice(line - 1, line + 2).join("\n")
      if (line === -1 || !window.includes(scope)) {
        misalignedLines.push(`${rel}:${line} did not resolve back to ${JSON.stringify(scope)}`)
      }

      scopes.push({ file: rel, line, scope })
      filesWithScopes.add(rel)
    }
  }

  return {
    scopes,
    callSites,
    filesScanned: files.length,
    filesWithScopes: filesWithScopes.size,
    misalignedLines,
  }
}

const SCAN = scan()

/** `api/v1/notes/[noteId]` → `api/v1/notes/`. What rule 2's charset is applied to. */
function withoutDynamicSegments(scope: string): string {
  return scope.replace(/\[[^\]]*\]/g, "")
}

function at(entry: Extracted): string {
  return `${entry.file}:${entry.line} ${JSON.stringify(entry.scope)}`
}

describe("log scope shape (OBS-01 / D-6)", () => {
  describe("the scan is real", () => {
    it("strips comments, so prose cannot donate a call site or a scope", () => {
      for (const { file, text } of PROSE_ONLY_CALLS) {
        const raw = readFileSync(path.join(REPO_ROOT, file), "utf8")
        expect(raw, `${file} should contain the prose ${text}`).toContain(text)
        expect(
          stripComments(raw),
          `${file}: ${text} survived stripComments — the corpus is contaminated with prose, and ` +
            `every negative assertion below is now reasoning about comments`
        ).not.toContain(text)
      }
    })

    it("found the tree: at least 250 scopes across at least 80 files", () => {
      // Recorded so a future reader can see the corpus shrink rather than infer it:
      // 523 files scanned, 279 scopes, 97 files with scopes, as of Phase 43.
      expect(
        SCAN.scopes.length,
        `only ${SCAN.scopes.length} scopes extracted from ${SCAN.filesScanned} files — the ` +
          `matcher or the walk found nothing, which makes every rule below vacuous`
      ).toBeGreaterThanOrEqual(MIN_SCOPES)
      expect(SCAN.filesWithScopes).toBeGreaterThanOrEqual(MIN_FILES)
    })

    it("resolves every reported line back into the raw file", () => {
      expect(SCAN.misalignedLines, SCAN.misalignedLines.join("\n")).toEqual([])
    })

    it("extracts a literal from every call site", () => {
      // An inequality here would hide a dynamically-computed scope. If this ever fails, pin the
      // offending call sites by file and line above — do NOT relax the comparison.
      expect(
        SCAN.scopes.length,
        `${SCAN.callSites} log.<level>( call sites but ${SCAN.scopes.length} scope literals — ` +
          `some call site computes its scope, or the extractor is blind to an idiom`
      ).toBe(SCAN.callSites)
    })
  })

  describe("the rules", () => {
    it("no scope contains whitespace (D-6)", () => {
      const offenders = SCAN.scopes.filter((entry) => /\s/.test(entry.scope))
      expect(
        offenders.map(at),
        `a scope with whitespace cannot be grepped as one token:\n${offenders.map(at).join("\n")}`
      ).toEqual([])
    })

    it("every scope is non-empty and equal to its own trim()", () => {
      // Cheap, and it catches the plausible "fix" of padding a space out to the edges.
      const offenders = SCAN.scopes.filter(
        (entry) => entry.scope.length === 0 || entry.scope !== entry.scope.trim()
      )
      expect(offenders.map(at)).toEqual([])
    })

    it("logs the Pipedrive rate-limit warning under pipedrive-api", () => {
      // The positive half. Without it, the whitespace rule above is satisfied by DELETING the
      // call — and that warning is the only observability on Pipedrive throttling there is.
      expect(
        SCAN.scopes.map((entry) => entry.scope),
        "no call site logs under `pipedrive-api` — the D-6 scope was renamed to something else " +
          "or the rate-limit warning was removed rather than normalized"
      ).toContain("pipedrive-api")
    })

    it("uses only [a-z0-9/-] outside dynamic segments, with one pinned exclusion", () => {
      const offenders = SCAN.scopes.filter(
        (entry) => !SCOPE_CHARSET.test(withoutDynamicSegments(entry.scope))
      )
      const distinct = [...new Set(offenders.map((entry) => entry.scope))]

      expect(
        distinct,
        `unexpected characters outside a [dynamicSegment]:\n${offenders.map(at).join("\n")}\n` +
          `If one of these is the pinned exclusion being normalized, DELETE the pin above; do ` +
          `not add a second entry.`
      ).toEqual([PINNED_CASE_EXCLUSION.scope])

      for (const offender of offenders) {
        expect(offender.file).toBe(PINNED_CASE_EXCLUSION.file)
      }
    })

    it("bounds the dynamic-segment carve-out to bare identifiers", () => {
      const segments = new Set<string>()
      for (const { scope } of SCAN.scopes) {
        for (const segment of scope.match(/\[[^\]]*\]/g) ?? []) segments.add(segment)
      }

      // Non-vacuity for the carve-out itself: if it ever applies to nothing, it is dead code and
      // rule 2 should simply become `[a-z0-9/-]` with no exception.
      expect(
        segments.size,
        "no scope contains a [dynamicSegment] any more — delete the carve-out rather than leaving " +
          "an untested exception in the charset rule"
      ).toBeGreaterThan(0)

      const malformed = [...segments].filter((segment) => !DYNAMIC_SEGMENT.test(segment))
      expect(
        malformed,
        `a [dynamicSegment] must be a bare identifier; these are not: ${malformed.join(", ")}`
      ).toEqual([])
    })
  })
})
