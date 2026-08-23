/**
 * WFOPS-02 — the wiring gate for the editor's test-run affordance: the new `dry-run-dialog.tsx` and
 * the three R-3 container fixes in `toolbar.tsx`.
 *
 * WHAT THIS TEST IS NOT, AND THIS MATTERS MORE THAN USUAL (the disclaimer is
 * `src/components/views/__tests__/responsive-classes.test.ts:4-14`, reproduced here because this is
 * the same kind of test and the same misreading is available):
 *
 *   - IT MEASURES NOTHING. It never opens a browser, never sets a viewport, never mounts a
 *     component and never reads a computed style. Every pixel figure in the comments below came
 *     from a measurement someone else took; nothing here reproduces one.
 *   - It is a STATIC read of source STRINGS. A rule expressed in Tailwind tokens or in a prop name
 *     is the only thing it can see, so a layout broken by something other than a class token — or a
 *     poll broken by something other than a missing `clearInterval` — is invisible to it.
 *   - It asserts WIRING, not behaviour. That the poll has two independent stops is visible here;
 *     that the interval actually stops is not. `npm run lint` is the authoritative check for the one
 *     rule that IS a behaviour (`react-hooks/set-state-in-effect`, severity 2 in this repo).
 *
 * WHY A SOURCE SCAN AT ALL — 41-RESEARCH C-1. `vitest.config.ts` runs `environment: 'node'` and this
 * repo has no jsdom and no `@testing-library/react`, by construction rather than by omission. A
 * client component's wiring facts are therefore asserted by reading its source or not at all, and
 * C-1's ruling is that this phase does not add a DOM environment to gate them.
 *
 * EXTRACTION. Every structural extraction goes through `source-scan.ts`
 * (`openingTagAt`, `tagIndexes`, `enclosingConditional`, `callArguments`, `readStrippedSource`).
 * This file defines NO brace matcher of its own: `source-scan.ts:14-27` records that as its reason
 * for existing, and the promotion allowance it grants ("if a third gate needs these, promote all
 * four in ONE commit") is already spent. `openingTags` below is a loop over `openingTagAt` and finds
 * no structure itself, which is the same standing `responsive-classes.test.ts:56-80` gives it.
 *
 * ONE DELIBERATE DEPARTURE FROM 41-14-PLAN's TASK-1 BEHAVIOUR BLOCK, recorded here so the verifier
 * does not read it as an omission: the plan's toolbar assertion list asks `toolbar.tsx` to contain
 * `dryRun.dirtyHint` and `aria-describedby`, while the same plan's task 2 places the trigger, its
 * `title` and its `aria-describedby` INSIDE `DryRunDialog`. Both cannot hold. The dialog owns the
 * trigger, so both assertions are made against the dialog source below, and the toolbar is asserted
 * to pass `dirty` through to it — which is the wiring that actually makes the disabled-while-dirty
 * state reachable. The rendered pixels are identical either way: `DryRunDialog`'s trigger renders
 * inside the toolbar row.
 */
import { describe, expect, it } from "vitest"

import {
  callArguments,
  enclosingConditional,
  openingTagAt,
  readStrippedSource,
  tagIndexes,
} from "@/components/custom-fields/__tests__/source-scan"

const DIALOG = "src/app/workflows/[id]/edit/components/dry-run-dialog.tsx"
const TOOLBAR = "src/app/workflows/[id]/edit/components/toolbar.tsx"

/**
 * The dialog does not exist until task 2 creates it, and a bare `readFileSync` would turn this
 * whole file's RED run into one `ENOENT` at collection time instead of a legible list of the facts
 * that are still missing. An empty string fails every assertion below with its own message.
 */
function readOrEmpty(path: string): string {
  try {
    return readStrippedSource(path)
  } catch {
    return ""
  }
}

const dialog = readOrEmpty(DIALOG)
const toolbar = readStrippedSource(TOOLBAR)

/** The opening tag of the FIRST `<${name}` in `source`, or `""` when there is none. */
function firstTag(source: string, name: string): string {
  const [at] = tagIndexes(source, name)
  if (at === undefined) return ""
  try {
    return openingTagAt(source, at, `<${name}>`, DIALOG)
  } catch {
    return ""
  }
}

/** Every opening tag in a source, delimited by `openingTagAt` — no structure is found here. */
function openingTags(source: string): string[] {
  const tags: string[] = []

  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "<") continue
    if (!/[A-Za-z]/.test(source[i + 1] ?? "")) continue

    let text: string
    try {
      text = openingTagAt(source, i, "element")
    } catch {
      continue
    }

    tags.push(text)
    i += text.length - 1
  }

  return tags
}

const occurrences = (source: string, needle: string) => source.split(needle).length - 1

/** `/-(red|green|…)-[0-9]/` — the palette utilities this phase's theme contract forbids outright. */
const PALETTE = /-(red|green|emerald|blue|amber|violet|rose)-[0-9]/

/* ================================================================= anti-vacuity, both files ==== */

describe("the scan reads real source (anti-vacuity)", () => {
  it("the dialog exists and names its component", () => {
    expect(
      dialog.length,
      `${DIALOG} is missing or empty. Task 2 of 41-14-PLAN creates it; every negative assertion ` +
        `below would pass vacuously against an empty string, so nothing else in this file means ` +
        `anything until this one is green.`
    ).toBeGreaterThan(0)

    expect(dialog).toContain("export function DryRunDialog")
  })

  it("the toolbar exists and still names its component", () => {
    expect(toolbar.length).toBeGreaterThan(0)
    expect(toolbar).toContain("export function Toolbar")
  })

  it("the tag walker sees every className in the toolbar", () => {
    const declared = occurrences(toolbar, "className=")
    const extracted = openingTags(toolbar).reduce(
      (total, tag) => total + occurrences(tag, "className="),
      0
    )

    expect(
      extracted,
      `${TOOLBAR}: the file declares className= ${declared} time(s) but only ${extracted} were ` +
        `found inside opening tags the walker could parse. A tag it cannot parse hides every ` +
        `violation on it, which is how a class gate like this silently goes vacuous ` +
        `(responsive-classes.test.ts:150-163).`
    ).toBe(declared)
  })
})

/* ============================================================================ the Textarea ===== */

describe("the JSON editor's Textarea", () => {
  it("is labelled — the id and the htmlFor agree", () => {
    expect(dialog).toContain('id="dry-run-trigger-data"')
    expect(dialog).toContain('htmlFor="dry-run-trigger-data"')
  })

  it("carries the declared dimensions and the editor attributes", () => {
    const tag = firstTag(dialog, "Textarea")

    expect(tag.length, `${DIALOG}: no <Textarea> found.`).toBeGreaterThan(0)

    for (const token of [
      "font-mono",
      "min-h-[160px]",
      "max-h-[320px]",
      "overflow-y-auto",
      "spellCheck",
      "autoComplete",
    ]) {
      expect(
        tag,
        `${DIALOG}: the Textarea's opening tag must carry ${token}. max-h-[320px] with ` +
          `overflow-y-auto is what keeps a 200-line envelope from pushing the footer off a ` +
          `translate-y-[-50%] dialog (R-5, T-41-86).`
      ).toContain(token)
    }
  })

  it("sets NO font size of its own", () => {
    const tag = firstTag(dialog, "Textarea")

    for (const token of ["text-xs", "text-sm", "text-base"]) {
      expect(
        tag,
        `${DIALOG}: the Textarea's own opening tag must not set ${token}. textarea.tsx:12 is ` +
          `"text-base md:text-sm" ON PURPOSE — 16px below the md breakpoint so iOS does not zoom ` +
          `the whole editor when the field takes focus. The hints below the field legitimately ` +
          `use text-sm, which is why this assertion is scoped to the tag and not to the file.`
      ).not.toContain(token)
    }
  })

  it("never sets wrap='off' (R-5)", () => {
    const tag = firstTag(dialog, "Textarea")

    expect(
      tag,
      `${DIALOG}: the Textarea must not set wrap. A <textarea wrap="off"> is a horizontal scroll ` +
        `container, and R-5 forbids one here — the field is already w-full and soft-wraps, so long ` +
        `JSON lines cannot widen the dialog.`
    ).not.toContain("wrap")
  })

  it("goes readOnly while the run is in flight, never disabled", () => {
    const tag = firstTag(dialog, "Textarea")

    expect(tag).toContain("readOnly")
    expect(
      tag,
      `${DIALOG}: the Textarea must not be disabled while the test run is in flight. ` +
        `textarea.tsx:12 carries "disabled:opacity-50", so disabling it drops the field to half ` +
        `opacity and the operator loses sight of the trigger data they just submitted — which is ` +
        `the one thing they need to read while they wait. readOnly keeps it legible.`
    ).not.toContain("disabled")
  })
})

/* =========================================================================== the validation ==== */

describe("submit-time validation", () => {
  it("keeps the two failures distinct", () => {
    for (const key of ["dryRun.invalidJson", "dryRun.notAnObject"]) {
      expect(
        dialog,
        `${DIALOG}: must render ${key}. startDryRun returns "invalidJson" and "notAnObject" as two ` +
          `separate refusals (actions.ts), and collapsing them into one generic message is the ` +
          `easy loss here: "must be valid JSON" tells someone who typed a valid array nothing at all.`
      ).toContain(key)
    }
  })

  it("announces the error and marks the field invalid", () => {
    expect(dialog).toContain('role="alert"')
    expect(dialog).toContain("aria-invalid")
    expect(dialog).toContain("aria-describedby")
  })

  it("expresses the error as text, with no fill and no border change", () => {
    expect(dialog).toContain("text-destructive")

    expect(
      tagIndexes(dialog, "Alert"),
      `${DIALOG}: no <Alert> here. The error is TEXT ONLY — text-destructive, no fill, no border ` +
        `colour — matching how the run detail tree already expresses a step error. An Alert block ` +
        `for a mistyped comma reads as a failure of the workflow rather than of the JSON.`
    ).toEqual([])
    expect(dialog).not.toContain("@/components/ui/alert")
    expect(dialog).not.toContain("border-destructive")
  })
})

/* ================================================================================ the hints ==== */

describe("exactly one prefill hint, never both", () => {
  it("renders both strings", () => {
    for (const key of ["dryRun.prefilledHint", "dryRun.emptyHint"]) {
      expect(dialog, `${DIALOG}: must render ${key}.`).toContain(key)
    }
  })

  it("puts them in different conditionals", () => {
    let prefilled: { test: string; body: string }
    let empty: { test: string; body: string }

    try {
      prefilled = enclosingConditional(dialog, "dryRun.prefilledHint", DIALOG)
      empty = enclosingConditional(dialog, "dryRun.emptyHint", DIALOG)
    } catch (error) {
      throw new Error(
        `${DIALOG}: each hint must sit inside its own {… && ( … )} conditional so exactly one of ` +
          `the two can ever render. Both in one body, or either one unconditional, and the dialog ` +
          `claims the field was prefilled from a previous run AND that there was none. ` +
          `(${(error as Error).message})`
      )
    }

    expect(
      empty.test.trim(),
      `${DIALOG}: the two hints share the conditional test "${prefilled.test.trim()}", so they ` +
        `render together. UI-SPEC: exactly one of the two, never both.`
    ).not.toBe(prefilled.test.trim())

    expect(prefilled.body).not.toContain("dryRun.emptyHint")
    expect(empty.body).not.toContain("dryRun.prefilledHint")
  })
})

/* ============================================================================== the wait ======= */

describe("the poll is bounded and stops for every reason it can stop", () => {
  it("calls the two actions plan 41-11 built", () => {
    expect(dialog).toContain("startDryRun")
    expect(dialog).toContain("getWorkflowRunStatus")
  })

  it("has at least TWO clearInterval stops", () => {
    expect(dialog).toContain("setInterval")
    expect(
      occurrences(dialog, "clearInterval"),
      `${DIALOG}: clearInterval must appear at least twice. scan-panel.tsx records why there are ` +
        `two independent stops: one inside the poll callback (a refusal will be refused again a ` +
        `second later) and one in the effect cleanup, reached because the polled id is DERIVED ` +
        `during render and turns null on a terminal status. Its own analog, progress-step.tsx:48-53, ` +
        `has a second effect whose body is a comment — that importer polls a finished job for as ` +
        `long as the tab stays open.`
    ).toBeGreaterThanOrEqual(2)
  })

  it("stops on an ABSENT run, not just on a terminal status", () => {
    expect(
      dialog,
      `${DIALOG}: getWorkflowRunStatus answers a row that does not exist with ` +
        `{ success: true, status: null, dryRun: null } — a SUCCESS, because a run may legitimately ` +
        `have been pruned. A poller that only stops on a terminal status therefore polls forever ` +
        `against a run that does not exist, at one request per second, from every open editor tab ` +
        `(T-41-67). Terminate on status === null too.`
    ).toContain("status === null")
  })

  it("bounds the wait with module-level named constants, not inline literals", () => {
    const names = [...dialog.matchAll(/^const\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1])
    const cadence = names.filter((name) => /MS$|INTERVAL|TIMEOUT|BUDGET/.test(name))

    expect(
      cadence,
      `${DIALOG}: the poll interval and the wall-clock budget must be module-level named ` +
        `constants with doc comments, in scan-panel.tsx's style. Inline literals in the effect are ` +
        `how a cadence gets tuned by someone who cannot see what it costs. Found: ` +
        `[${names.join(", ")}].`
    ).toHaveLength(2)

    expect(dialog, `${DIALOG}: the poll cadence is 1000 ms.`).toMatch(/=\s*1000\b/)
    expect(dialog, `${DIALOG}: the wall-clock budget is 30 000 ms.`).toMatch(/=\s*30_?000\b/)
  })

  it("keeps the timeout and the creation failure as separate outcomes", () => {
    for (const key of ["dryRun.timeout", "dryRun.error"]) {
      expect(
        dialog,
        `${DIALOG}: must render ${key}. The 30 s deadline is reachable in NORMAL operation — the ` +
          `execution processor polls every 5 s and serial enforcement queues a dry run behind any ` +
          `running or waiting run of the same workflow — so "still going, open it from the run ` +
          `history" is a different statement from "it did not start, so nothing ran".`
      ).toContain(key)
    }
  })

  // -----------------------------------------------------------------------------------------------
  // WR-04 — a REJECTED server action must neither wedge the dialog nor outlive the deadline.
  //
  // A Next.js server action rejects rather than returning `{ success: false }` on a transport-level
  // failure (container restart, DB outage inside the 30 s window, proxy hiccup, deploy), and a
  // hanging request never resolves at all. Both are invisible to a `{ success }` check.
  // -----------------------------------------------------------------------------------------------

  it("evaluates the deadline BEFORE awaiting the status, not after it", () => {
    const effects = callArguments(dialog, "useEffect")
    expect(effects, `${DIALOG}: expected exactly one useEffect — the poll.`).toHaveLength(1)

    const body = effects[0]
    const deadlineAt = body.indexOf("pollDeadline")
    const awaitAt = body.indexOf("await getWorkflowRunStatus")

    // ANTI-VACUITY: both markers must exist, or `-1 < n` would pass for a poll that reads no
    // deadline at all.
    expect(deadlineAt, `${DIALOG}: the poll must read pollDeadline.`).toBeGreaterThan(-1)
    expect(awaitAt, `${DIALOG}: the poll must await getWorkflowRunStatus.`).toBeGreaterThan(-1)

    expect(
      deadlineAt,
      `${DIALOG}: the wall-clock deadline must be checked BEFORE the request. After it, a request ` +
        `that rejects or never resolves never reaches the check: clearInterval is never called, ` +
        `the budget is never evaluated, and the dialog issues one request per second forever from ` +
        `every open editor tab, with an unhandled rejection each time.`
    ).toBeLessThan(awaitAt)
  })

  it("catches a rejected status request instead of letting it escape the interval callback", () => {
    const effects = callArguments(dialog, "useEffect")
    const body = effects[0]
    const awaitAt = body.indexOf("await getWorkflowRunStatus")
    const tryAt = body.lastIndexOf("try {", awaitAt)

    expect(
      tryAt,
      `${DIALOG}: the status request must sit inside a try/catch. A rejection escaping the async ` +
        `callback setInterval invoked skips every clearInterval below it.`
    ).toBeGreaterThan(-1)

    const after = body.slice(awaitAt)
    expect(
      after.indexOf("} catch"),
      `${DIALOG}: no catch follows the status request.`
    ).toBeGreaterThan(-1)
  })

  it("catches a rejected startDryRun rather than freezing the dialog at phase 'starting'", () => {
    const startAt = dialog.indexOf("await startDryRun")
    expect(startAt, `${DIALOG}: the dialog must call startDryRun.`).toBeGreaterThan(-1)

    const tryAt = dialog.lastIndexOf("try {", startAt)
    expect(
      tryAt,
      `${DIALOG}: an unhandled rejection here leaves wait at { phase: "starting" } FOREVER, so ` +
        `running stays true: Confirm and Cancel both disabled, the Textarea readOnly, the spinner ` +
        `never stopping, and no way out but a page reload — with the operator's typed trigger data ` +
        `trapped behind a disabled control.`
    ).toBeGreaterThan(-1)

    // The recovery must re-enable the dialog. `{ phase: "idle" }` is what `running` reads.
    const recovery = dialog.slice(dialog.indexOf("} catch", startAt), startAt + 600)
    expect(
      recovery,
      `${DIALOG}: the catch must set the wait back to idle, or the dialog stays wedged for a ` +
        `different reason.`
    ).toContain('phase: "idle"')
  })

  it("sets no state in the effect body outside the poll callback", () => {
    const effects = callArguments(dialog, "useEffect")

    expect(
      effects.length,
      `${DIALOG}: expected exactly one useEffect — the poll. Found ${effects.length}.`
    ).toBe(1)

    /*
     * BOUNDING THE INNER CALLBACK WITHOUT A FOURTH BRACE MATCHER. `elementRegion` is JSX-only and
     * `callArguments` bounds an argument list, so neither can bound `const poll = async () => {…}`
     * (41-WAVE2-HANDOFF § source-scan helper limits). Two structural markers do it instead: the
     * poll callback opens at `const poll = async` and the outer body resumes at
     * `const interval = setInterval(`, which scan-panel.tsx's shape puts immediately after it. Both
     * markers are asserted present, and both regions are asserted non-empty, so an unrecognised
     * shape fails loudly rather than scoping the negative to nothing.
     */
    const body = effects[0]
    const callbackAt = body.indexOf("const poll = async")
    const resumesAt = body.indexOf("const interval = setInterval(")

    expect(
      callbackAt,
      `${DIALOG}: the effect must declare its poller as "const poll = async () => {". This gate ` +
        `bounds the inner callback by that marker and by "const interval = setInterval(", and a ` +
        `different shape makes the setState-position check below unscoped.`
    ).toBeGreaterThan(-1)
    expect(
      resumesAt,
      `${DIALOG}: the interval must be created as "const interval = setInterval(" AFTER the poll ` +
        `callback is declared — scan-panel.tsx's ordering, and load-bearing: the callback clears ` +
        `the interval itself, so if the very first answer is already terminal the clear has to have ` +
        `something to clear.`
    ).toBeGreaterThan(callbackAt)

    const outer = body.slice(0, callbackAt) + body.slice(resumesAt)
    expect(outer.length).toBeGreaterThan(0)

    const setters = [...outer.matchAll(/\bset[A-Z]\w*\(/g)]
      .map((m) => m[0])
      .filter((call) => !["setInterval(", "setTimeout("].includes(call))

    expect(
      setters,
      `${DIALOG}: ${setters.length} setState call(s) in the effect BODY, outside the async poll ` +
        `callback: [${setters.join(", ")}]. react-hooks/set-state-in-effect is severity 2 (ERROR) ` +
        `in this repo and three Phase 38 plans hit it independently. Every setter belongs inside ` +
        `the callback setInterval invokes. npm run lint is the authoritative check; this is the ` +
        `cheap one.`
    ).toEqual([])
  })
})

/* =========================================================================== dialog chrome ===== */

describe("the dialog chrome", () => {
  it("overrides the title's leading", () => {
    const tag = firstTag(dialog, "DialogTitle")

    expect(
      tag,
      `${DIALOG}: DialogTitle needs className="leading-tight". dialog.tsx:149 ships ` +
        `"text-lg leading-none font-semibold", and both the pt-BR and es-ES titles wrap to two ` +
        `lines in the 240px a DialogContent leaves — leading-none collides the first line's ` +
        `descenders with the second line's ascenders.`
    ).toContain("leading-tight")
  })

  it("is not dressed as a destructive confirmation", () => {
    for (const forbidden of [
      "closeLabel",
      "AlertTriangle",
      "bg-destructive/10",
      'variant="destructive"',
      "AlertDialog",
    ]) {
      expect(
        dialog,
        `${DIALOG}: must not contain ${forbidden}. The delete dialog's AlertTriangle in its ` +
          `bg-destructive/10 tile is what marks THAT dialog as destructive; a test run is the ` +
          `safest thing this editor can do. And DialogContent already binds its own close label ` +
          `from common.close (dialog.tsx:68), so closeLabel here would be a second English word ` +
          `for the same control.`
      ).not.toContain(forbidden)
    }
  })

  it("weights its two footer buttons", () => {
    expect(dialog).toContain('variant="default"')
    expect(dialog).toContain('variant="outline"')
    expect(dialog).toContain("common")
  })
})

/* ================================================================================== F-41-1 ===== */

describe("F-41-1 — nothing here asserts the run mutated nothing", () => {
  it("contains none of the forbidden reassurances", () => {
    const lower = dialog.toLowerCase()
    const found = [
      "nothing changed",
      "no records were changed",
      "nothing happened",
      "nothing was modified",
      "no changes",
    ].filter((phrase) => lower.includes(phrase))

    expect(
      found,
      `${DIALOG}: forbidden non-mutation copy: [${found.join(", ")}]. 41-CONTEXT, verbatim: "An ` +
        `empty list that is normally populated is evidence; a reassuring sentence is not." The ` +
        `proof is run-changed-records.tsx rendering its EXISTING audit.run.empty state on the run ` +
        `detail page — the same state a real run that changed nothing would produce. That ` +
        `equivalence is the point.`
    ).toEqual([])
  })

  it("routes every rendered string through the catalog", () => {
    expect(dialog).toContain("useTranslations")

    /*
     * A multi-word quoted literal in this file is either a Tailwind class list or untranslated
     * English, and the two are separable: every Tailwind token here carries a `-`, a `:` or a `[`,
     * or is one of the bare utilities below. An English word carries none of them. This is a
     * heuristic and is documented as one — it cannot see a single-word English literal — which is
     * why the per-key assertions above carry the real weight.
     */
    const BARE_UTILITIES = new Set([
      "flex",
      "grid",
      "block",
      "hidden",
      "relative",
      "absolute",
      "truncate",
      "italic",
      "underline",
    ])

    /*
     * ONE LITERAL AT A TIME, ALTERNATING. A bare /"([^"]*\s[^"]*)"/ matches the GAP between two
     * adjacent literals — given `["completed", "failed"]` it happily reports `, ` as a string — and
     * on this file it reported 35 offenders of which every single one was a gap, an import
     * punctuation run, or the `"use client"` directive. Consuming single-quoted and template
     * literals in the same alternation is what stops their contents being re-read as gaps.
     */
    const STRING_LITERAL = /"((?:[^"\\\n]|\\.)*)"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g

    const suspect = [...dialog.matchAll(STRING_LITERAL)]
      .map((m) => m[1])
      .filter((literal): literal is string => literal !== undefined)
      // A module directive, not copy.
      .filter((literal) => literal !== "use client")
      // Single-word literals are prop values and catalog keys; the heuristic only reads sentences.
      .filter((literal) => /\s/.test(literal))
      .filter((literal) =>
        literal
          .split(/\s+/)
          .filter(Boolean)
          .some((token) => !/[-:[]/.test(token) && !BARE_UTILITIES.has(token))
      )

    expect(
      suspect,
      `${DIALOG}: ${suspect.length} multi-word literal(s) that do not read as a Tailwind class ` +
        `list: [${suspect.join(" | ")}]. Every user-visible string on this surface comes from the ` +
        `catalog through next-intl — plan 41-03 wrote all fifteen dryRun keys in all three ` +
        `locales, so an English literal here renders as English to a pt-BR or es-ES operator while ` +
        `every sibling string is translated.`
    ).toEqual([])
  })

  it("adds no palette utility", () => {
    expect(dialog).not.toMatch(PALETTE)
  })
})

/* ================================================================= the toolbar — R-3a/b/c ====== */

describe("R-3 — the editor toolbar row survives 320px", () => {
  it("R-3a: the outer row wraps", () => {
    expect(
      toolbar,
      `${TOOLBAR}: the outer row must be ` +
        `className="flex flex-wrap items-center gap-4 border-b px-4 py-2". At 305px of client ` +
        `width a non-wrapping row holding the name Input, the Switch cluster and a five-control ` +
        `right cluster overflows with certainty.`
    ).toContain('className="flex flex-wrap items-center gap-4 border-b px-4 py-2"')

    expect(
      toolbar,
      `${TOOLBAR}: the pre-R-3a class string is still there. It must be REPLACED, not joined by a ` +
        `second row.`
    ).not.toContain('className="flex items-center gap-4 border-b px-4 py-2"')
  })

  it("R-3b: the name Input can shrink", () => {
    const tag = firstTag(toolbar, "Input")

    expect(tag.length, `${TOOLBAR}: no <Input> found.`).toBeGreaterThan(0)

    for (const token of ["min-w-0", "max-w-[300px]"]) {
      expect(
        tag,
        `${TOOLBAR}: the name Input's own opening tag must carry ${token}. min-w-0 is a SEPARATE ` +
          `fix from flex-wrap and not a duplicate of it: max-w-[300px] caps the maximum and sets ` +
          `no minimum, so the Input refuses to shrink below its intrinsic width and forces the row ` +
          `wide before the wrap can help. Asserted in the SAME tag, because both tokens merely ` +
          `existing somewhere in the file proves nothing.`
      ).toContain(token)
    }
  })

  it("R-3c: the right cluster wraps too", () => {
    expect(
      toolbar,
      `${TOOLBAR}: the right cluster must be className="ml-auto flex flex-wrap items-center gap-2". ` +
        `Five size="sm" buttons cannot share the 241px of content a container page leaves at 320px.`
    ).toContain('className="ml-auto flex flex-wrap items-center gap-2"')

    expect(toolbar).not.toContain('className="ml-auto flex items-center gap-2"')
  })

  it("adds no palette utility", () => {
    expect(toolbar).not.toMatch(PALETTE)
  })
})

describe("the Test run trigger's place in the toolbar", () => {
  it("renders DryRunDialog to the LEFT of Save (V-41-1)", () => {
    const triggerAt = tagIndexes(toolbar, "DryRunDialog").at(-1) ?? -1
    const saveAt = toolbar.lastIndexOf("onClick={handleSave}")

    // BOTH OFFSETS ARE ASSERTED PRESENT FIRST. Written as a bare toBeLessThan this passes
    // VACUOUSLY while the trigger is missing, because indexOf returns -1 and -1 is less than every
    // real offset — the trap views-page-wiring.test.ts:161-174 measured on a real RED run.
    expect(triggerAt, `${TOOLBAR}: no <DryRunDialog> rendered.`).toBeGreaterThan(-1)
    expect(saveAt, `${TOOLBAR}: the Save button's onClick={handleSave} is gone.`).toBeGreaterThan(-1)

    expect(
      triggerAt,
      `${TOOLBAR}: the Test run trigger must render before the Save button. Save stays the ` +
        `visually dominant commit and the last control in the row (V-41-1); when the row wraps, ` +
        `source order IS reading order.`
    ).toBeLessThan(saveAt)
  })

  it("passes dirty through, so the trigger can refuse an unsaved definition", () => {
    const tag = firstTag(toolbar, "DryRunDialog")

    expect(
      tag,
      `${TOOLBAR}: DryRunDialog must receive dirty. A dry run executes the PERSISTED workflow — ` +
        `the engine loads it by workflowId — so with unsaved edits on screen the test would ` +
        `silently exercise the old definition and report on something the operator is not looking ` +
        `at: a false green on a workflow they think they just fixed (T-41-83).`
    ).toContain("dirty")

    expect(tag).toContain("workflowId")
    expect(tag).toContain("latestTriggerData")
  })

  it("keeps the existing Unsaved changes marker", () => {
    expect(
      toolbar,
      `${TOOLBAR}: the {dirty && ( "Unsaved changes" marker must survive verbatim. It is the ` +
        `reason the disabled trigger is not a surprise, and this plan adds no second dirty ` +
        `indicator.`
    ).toContain("{dirty && (")
    expect(toolbar).toContain("Unsaved changes")
  })
})

describe("the trigger explains why it is unavailable", () => {
  it("renders dryRun.dirtyHint next to the disabled control", () => {
    expect(
      dialog,
      `${DIALOG}: must render dryRun.dirtyHint. A disabled button with no reason is a dead ` +
        `control — and this one is disabled in the state the operator is most likely to press it in.`
    ).toContain("dryRun.dirtyHint")
  })

  it("gives the hint to assistive technology, not only to a tooltip", () => {
    const tag = firstTag(dialog, "Button")

    expect(tag.length, `${DIALOG}: no <Button> found.`).toBeGreaterThan(0)
    expect(
      tag,
      `${DIALOG}: the trigger needs BOTH title and aria-describedby. A title alone is invisible ` +
        `to touch — there is no hover on a phone — and several screen readers do not announce it.`
    ).toContain("title=")
    expect(tag).toContain("aria-describedby")
    expect(tag).toContain("disabled")
  })

  it("renders the trigger as a secondary control, not a Play button", () => {
    expect(
      dialog,
      `${DIALOG}: the icon is FlaskConical, not Play. Play reads as "run this for real", which is ` +
        `the one thing this button does not do.`
    ).toContain("FlaskConical")
    expect(dialog).not.toContain("Play")
    expect(dialog).toContain('size="sm"')
  })
})
