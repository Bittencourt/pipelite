/**
 * G-3 / G-4 — the cross-cutting container-and-colour sweep over the nine files phase 41 touched.
 *
 * WHAT THIS TEST IS NOT, AND THIS MATTERS MORE THAN USUAL:
 *
 *   - IT MEASURES NOTHING. It never opens a browser, never sets a viewport and never reads a
 *     computed style. Every number in the comments below came from a measurement someone else took;
 *     nothing here reproduces one.
 *   - It is a STATIC read of class STRINGS. A rule expressed in Tailwind tokens is the only thing it
 *     can see, so a layout broken by something other than a class token is invisible to it.
 *   - It does not duplicate the per-plan gates. 41-10's `runs-list-wiring.test.ts` already asserts
 *     R-4's exact string, 41-13's `replay-visibility.test.ts` asserts R-1 and R-2, and 41-14's
 *     `dry-run-dialog-wiring.test.ts` asserts R-3. This file asserts what none of them can see
 *     individually, because it is a property OF THE SET: every flex row across all nine files, and
 *     no palette utility anywhere in them.
 *
 * WHY A SOURCE SCAN IS THE GATE HERE AND NOT A PLAYWRIGHT ROW. `e2e/viewport-320.spec.ts` measures
 * seven routes (`viewport-320.spec.ts:81-89`) and **none of them is under `/workflows`**. So the
 * measured gate does not protect a single surface this phase changed, which is exactly why the R-1..R-4
 * container changes are required rather than advisory: the defect class Phase 45 found BY MEASUREMENT
 * (non-wrapping toolbars, rows with no scroll container) is live in this tree and this phase added a
 * control to three of the offending rows. UI-SPEC settled that R-1..R-5 are asserted by source scan on
 * the class strings rather than by a new Playwright row, because the workflow editor is a ReactFlow
 * canvas and is not a 320px surface in any meaningful sense — adding it to the measured matrix would
 * demand a canvas redesign this phase has no mandate for.
 *
 * THE BUDGET behind every failure message below: **241px** of content on a `container` page (305px
 * client width less the 64px of `padding-inline: 2rem` from `globals.css:119-121`), and **240px**
 * inside a `DialogContent`.
 *
 * EXTRACTION, AND WHY THIS IS NOT A GREP. Every className is read out of an opening tag delimited by
 * the shared `openingTagAt`, over a source put through the shared `stripComments`. That is not
 * fastidiousness: `replay-run-button.tsx`'s header PROSE names `AlertTriangle`, `bg-destructive/10`,
 * `variant="destructive"`, `AlertDialog`, `closeLabel` and `focus:ring-*` while explaining why the
 * file omits every one of them, and `dry-run-badge.tsx`'s header names `violet` and
 * `bg-emerald-100 … dark:bg-emerald-950` while explaining why it uses neither. A raw `grep` for any of
 * those reports a violation in a file that is correct. Stripping comments and reading only opening tags
 * is what makes an assertion here a statement about CODE. `stripper-is-load-bearing` below proves it
 * on the real file rather than asserting it in a comment.
 */
import { describe, expect, it } from "vitest"

import { readFileSync } from "node:fs"

import {
  openingTagAt,
  readStrippedSource,
  tagIndexes,
} from "@/components/custom-fields/__tests__/source-scan"

/* --------------------------------------------------------------- the scanned set */

const RUN_DETAIL = "src/app/workflows/[id]/runs/[runId]/page.tsx"
const REPLAY_BUTTON = "src/app/workflows/[id]/runs/[runId]/components/replay-run-button.tsx"
const TOOLBAR = "src/app/workflows/[id]/edit/components/toolbar.tsx"
const DRY_RUN_DIALOG = "src/app/workflows/[id]/edit/components/dry-run-dialog.tsx"
const RUNS_PAGE = "src/app/workflows/[id]/runs/page.tsx"
const STATUS_FILTER = "src/app/workflows/[id]/runs/components/status-filter.tsx"
const RUNS_TABLE = "src/app/workflows/[id]/runs/components/runs-table.tsx"
const DRY_RUN_BADGE = "src/app/workflows/[id]/runs/components/dry-run-badge.tsx"
const NOTIFICATION_FORM = "src/app/settings/notifications/notification-form.tsx"

/**
 * The nine files this phase touches that render anything. Named explicitly rather than derived from a
 * `git diff`, so the set this gate covers is a decision in the tree rather than a property of whatever
 * happens to be uncommitted.
 *
 * DELIBERATELY EXCLUDED, each for a recorded reason, so a later reader does not read an absence as an
 * oversight:
 *
 *   - `runs/components/run-status-badge.tsx` — the documented C-41-1 exemption. It already ships three
 *     `bg-emerald-100 … dark:bg-emerald-950`-style palette pairs at lines 13, 21 and 25, and Phase 45
 *     declared the repo-wide token sweep out of scope. Adding it here would not "fix" those pairs; it
 *     would only make the palette rule below unsatisfiable and get it deleted. The rule is enforceable
 *     precisely because it is narrow: THE NEW CODE ADDS NONE.
 *   - `runs/[runId]/components/run-changed-records.tsx`, `step-detail.tsx`, `json-viewer.tsx` and
 *     `run-step-list.tsx` — read-only in this phase. Nothing was added to them, so a violation found
 *     in one would be a pre-existing finding this phase has no mandate to fix.
 *   - `components/recent-runs-mini.tsx` — D-A7's query-only edit. It gained a `where` condition and
 *     renders nothing new; `runs-list-wiring.test.ts` already asserts its `className=` count is
 *     unchanged at five, which is the evidence for that claim.
 *   - `edit/components/side-panel.tsx` — explicitly out of scope. Its `w-[400px]` at line 100 is a
 *     PRE-EXISTING 320px overflow and is the reason the dry-run editor is a Dialog rather than a panel.
 *     Fixing the side panel is not this phase.
 */
const TOUCHED_FILES = [
  RUN_DETAIL,
  REPLAY_BUTTON,
  TOOLBAR,
  DRY_RUN_DIALOG,
  RUNS_PAGE,
  STATUS_FILTER,
  RUNS_TABLE,
  DRY_RUN_BADGE,
  NOTIFICATION_FORM,
] as const

/* --------------------------------------------------------------- extraction */

/**
 * `openingTags` and `classNamesOn` are COPIED VERBATIM from
 * `src/components/views/__tests__/responsive-classes.test.ts:62-125`, where they are module-private.
 *
 * NEITHER IS A NEW STRUCTURAL MATCHER, which is the thing `source-scan.ts:14-27` exists to prevent:
 *
 *   - `openingTags` is a for-loop over the SHARED `openingTagAt`. It finds no structure of its own; it
 *     asks the promoted tag walker where each tag ends.
 *   - `classNamesOn` reads a VALUE out of a tag `openingTagAt` has ALREADY delimited. Its brace scan is
 *     bounded by that tag and cannot run past it, so it does not find structure either.
 *
 * The four structural helpers (`stripComments`, `openingTagAt`, `tagIndexes`, `elementRegion`) are
 * imported, never reimplemented — 40-08's promotion condition is already spent and this file honours it.
 * These two are on their SECOND consumer. PROMOTION CONDITION, in the same shape 40-08 used: if a THIRD
 * gate needs `openingTags`/`classNamesOn`, promote both into `source-scan.ts` in ONE commit and delete
 * both copies. Do not let a third copy exist.
 */
interface Tag {
  /** Offset of the `<`. */
  at: number
  /** The element name, e.g. `div` or `DialogContent`. */
  name: string
  /** The full opening tag text. */
  text: string
}

/**
 * Every opening tag in a source, delimited by `openingTagAt` so a `>` inside `className={a > b}` or
 * inside a string cannot end a tag early.
 *
 * TS generics (`Map<string, string>`) also start with `<` + a letter and are picked up here. They carry
 * no `className=`, so they contribute nothing; the completeness check below is what proves this loose
 * scan still sees every className in the file.
 */
function openingTags(source: string, file: string): Tag[] {
  const tags: Tag[] = []

  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "<") continue
    if (!/[A-Za-z]/.test(source[i + 1] ?? "")) continue

    let text: string
    try {
      text = openingTagAt(source, i, "element", file)
    } catch {
      continue
    }

    tags.push({ at: i, name: text.slice(1).match(/^[A-Za-z0-9_.]+/)?.[0] ?? "", text })
    i += text.length - 1
  }

  return tags
}

/**
 * The class strings on one opening tag.
 *
 * Handles `className="…"` and `className={…}`, collecting every string literal inside the braces so a
 * `cn("a", flag && "b")` contributes both. The brace scan is bounded by the tag `openingTagAt` already
 * delimited — it reads a VALUE, it does not find structure, so it is not another structural matcher.
 */
function classNamesOn(tag: string): string[] {
  const found: string[] = []
  const marker = "className="

  for (let at = tag.indexOf(marker); at !== -1; at = tag.indexOf(marker, at + marker.length)) {
    let i = at + marker.length

    if (tag[i] === '"' || tag[i] === "'") {
      const quote = tag[i]
      const end = tag.indexOf(quote, i + 1)
      if (end !== -1) found.push(tag.slice(i + 1, end))
      continue
    }

    if (tag[i] !== "{") continue

    let depth = 0
    const start = i
    while (i < tag.length) {
      if (tag[i] === "{") depth += 1
      else if (tag[i] === "}") {
        depth -= 1
        if (depth === 0) break
      }
      i += 1
    }

    const expression = tag.slice(start, i + 1)
    for (const literal of expression.match(/"[^"]*"|'[^']*'|`[^`$]*`/g) ?? []) {
      found.push(literal.slice(1, -1))
    }
  }

  return found
}

interface ClassUse {
  file: string
  element: string
  className: string
}

/** Every className on every opening tag of the nine files. */
const ALL_USES: ClassUse[] = TOUCHED_FILES.flatMap((file) => {
  const source = readStrippedSource(file)
  return openingTags(source, file).flatMap((tag) =>
    classNamesOn(tag.text).map((className) => ({ file, element: tag.name, className }))
  )
})

const tokensOf = (className: string) => className.split(/\s+/).filter(Boolean)

const usesIn = (file: string) => ALL_USES.filter((u) => u.file === file)

/**
 * Whitespace-normalised form, so a stray double space or a trailing space in the source cannot make an
 * exact-string assertion fail for a reason that has nothing to do with the rule.
 */
const normalised = (className: string) => tokensOf(className).join(" ")

const show = (uses: ClassUse[]) =>
  uses.map((u) => `    ${u.file}  <${u.element}>  "${u.className}"`).join("\n")

/* ------------------------------------------------------- 0. the gate is not vacuous */

describe("the gate reads what it claims to read", () => {
  it("scans exactly the nine touched files", () => {
    expect(
      TOUCHED_FILES.length,
      `TOUCHED_FILES has ${TOUCHED_FILES.length} entries, expected 9. This gate is the ONLY ` +
        `protection R-1..R-4 and C-41-1 have — e2e/viewport-320.spec.ts covers none of these routes ` +
        `— so a file quietly dropped from the list is a rule quietly switched off.`
    ).toBe(9)
  })

  it.each(TOUCHED_FILES)("%s has a non-empty stripped source", (file) => {
    const source = readStrippedSource(file)

    // A path typo would otherwise make every "does not contain" assertion about that file pass at
    // zero, and every "contains" assertion fail for the wrong reason. readFileSync throws on a
    // missing path, which reads as a failure; an EMPTY file would pass silently.
    expect(source.length, `${file}: stripped source is empty`).toBeGreaterThan(0)
  })

  it("extracted at least one className from every file", () => {
    const empty = TOUCHED_FILES.filter((file) => usesIn(file).length === 0)

    expect(
      empty,
      `these files contributed no className at all:\n    ${empty.join("\n    ")}\n\n` +
        `Every one of the nine renders markup, so zero extracted classNames means the extractor ` +
        `failed on that file rather than that the file is clean.`
    ).toEqual([])
  })

  /**
   * THE PROSE PROBLEM, PROVEN ON THE REAL FILE RATHER THAN ASSERTED IN A COMMENT.
   *
   * `replay-run-button.tsx`'s header explains, at length, why the file deliberately omits the delete
   * dialog's `bg-destructive/10` tile, its `AlertTriangle`, `variant="destructive"`, `AlertDialog`, a
   * `closeLabel` and any `focus:ring-*`. Every one of those tokens is therefore PRESENT in the raw file
   * and ABSENT from its code. A gate built on `grep` reports five or six violations here and every one
   * is a false positive — the Phase 39 defect class running in reverse.
   *
   * If this test ever fails because a marker is no longer in the raw source, DELETE THAT MARKER FROM
   * THE LIST. Do not delete the test: it is what licenses every negative assertion below.
   */
  it("stripper-is-load-bearing: header prose is invisible to the scan", () => {
    const PROSE_ONLY = [
      "AlertTriangle",
      "bg-destructive/10",
      'variant="destructive"',
      "AlertDialog",
      "closeLabel",
      "focus:ring",
    ]

    const raw = readFileSync(REPLAY_BUTTON, "utf8")
    const stripped = readStrippedSource(REPLAY_BUTTON)

    for (const marker of PROSE_ONLY) {
      expect(
        raw.includes(marker),
        `${REPLAY_BUTTON}: "${marker}" is no longer in the raw source, so this test no longer ` +
          `demonstrates anything. Remove it from PROSE_ONLY rather than removing the test.`
      ).toBe(true)

      expect(
        stripped.includes(marker),
        `${REPLAY_BUTTON}: "${marker}" survived stripComments. It appears ONLY in the file's header ` +
          `prose, which explains why the file omits it. If prose reaches the scan, every negative ` +
          `assertion in this file becomes a false positive and the gate gets deleted as noise.`
      ).toBe(false)
    }
  })

  /**
   * The general form of the same property: after stripping, no comment delimiter survives anywhere in
   * any scanned file.
   *
   * This is the one that catches an UNBALANCED QUOTE. `stripComments` is string-aware, so a lone `'`
   * in JSX text (an apostrophe in `didn't`, say) would open a string it never closes and every comment
   * after it would survive untouched — silently, and without changing any className count.
   */
  it.each(TOUCHED_FILES)("%s: stripComments left no comment delimiter behind", (file) => {
    const stripped = readStrippedSource(file)

    expect(
      [stripped.includes("/*"), stripped.includes("*/")],
      `${file}: a comment delimiter survived stripComments, which means a string literal was left ` +
        `open and the rest of the file's prose is now visible to every assertion in this gate. The ` +
        `usual cause is an unescaped apostrophe in JSX text — use &apos; or &rsquo;.`
    ).toEqual([false, false])
  })
})

/* ------------------------------------------------- 1. the extractor is honest, per file */

describe("the extractor sees every className", () => {
  it.each(TOUCHED_FILES)("%s", (file) => {
    const source = readStrippedSource(file)
    const declared = (source.match(/className=/g) ?? []).length

    expect(
      usesIn(file).length,
      `${file}: the file declares className= ${declared} time(s) but only ${usesIn(file).length} were ` +
        `extracted from opening tags. A tag the walker could not parse would hide every violation on it, ` +
        `which is how a gate like this silently goes vacuous.`
    ).toBe(declared)
  })
})

/* --------------------------------------------------- 2. R-1..R-4, exact strings both ways */

/**
 * Each rule is a REQUIRED string and the OLD string it replaced, and both halves are asserted every
 * time.
 *
 * The negative is not redundant. A positive alone passes if someone wrapped an extra `flex-wrap` div
 * AROUND the unchanged row and left the non-wrapping row inside it — which reads as a fix, gates as a
 * fix, and overflows exactly as before. The old string's absence is what rules that out.
 *
 * Matched as a WHOLE className, whitespace-normalised, never as a substring of the file. Two reasons.
 * A substring `toContain` on `"flex flex-wrap items-center gap"` matches several rows in these files
 * and so proves nothing about any of them; and `"mb-4"` is a substring of the required
 * `"mb-4 flex flex-wrap items-center gap-2"`, so R-4's negative can only be expressed as an exact
 * className.
 */
interface ContainerRule {
  id: string
  file: string
  required: string
  old: string
  why: string
}

const CONTAINER_RULES: ContainerRule[] = [
  {
    id: "R-1",
    file: RUN_DETAIL,
    required: "flex flex-wrap items-center justify-between gap-3",
    old: "flex items-center gap-3",
    why:
      "this row went from two items to four (h1, RunStatusBadge, DryRunBadge, Replay). Four items " +
      "in a non-wrapping 241px row overflow WITH CERTAINTY, and the item pushed off the right edge " +
      "is the status badge the operator came to the page to read.",
  },
  {
    id: "R-2",
    file: RUN_DETAIL,
    required: "flex flex-wrap items-center gap-4 text-sm text-muted-foreground",
    old: "flex items-center gap-4 text-sm text-muted-foreground",
    why:
      "this row gains a third item (the lineage line) and its two existing ones already measure " +
      'close to 241px in es-ES. This is the exact defect fixed in commit c082430, "wrap the ' +
      'activities stats row — three stats overflow 320px".',
  },
  {
    id: "R-3a",
    file: TOOLBAR,
    required: "flex flex-wrap items-center gap-4 border-b px-4 py-2",
    old: "flex items-center gap-4 border-b px-4 py-2",
    why:
      "the toolbar row holds the name Input, a Switch+Label cluster and a right cluster that now " +
      "carries five controls. Without a wrap the row is one line at any width.",
  },
  {
    id: "R-3c",
    file: TOOLBAR,
    required: "ml-auto flex flex-wrap items-center gap-2",
    old: "ml-auto flex items-center gap-2",
    why:
      "five size=\"sm\" buttons cannot share 241px (Export, Import, Test run, Save, Delete). " +
      "ml-auto right-aligns the cluster; it does nothing about the cluster being too wide.",
  },
  {
    id: "R-4",
    file: RUNS_PAGE,
    required: "mb-4 flex flex-wrap items-center gap-2",
    old: "mb-4",
    why:
      "the row was a bare margin wrapper holding one child and now holds the w-[180px] Select plus " +
      "the new checkbox+label, which must wrap to a second line at 320px.",
  },
]

describe("R-1..R-4 — the required container class is present, verbatim", () => {
  it.each(CONTAINER_RULES)("$id: $file declares $required", (rule) => {
    const present = usesIn(rule.file).filter((u) => normalised(u.className) === rule.required)

    expect(
      present.length,
      `${rule.id} — ${rule.file} declares no element whose className is exactly\n` +
        `    "${rule.required}"\n\n` +
        `The classNames this file does declare are:\n${show(usesIn(rule.file))}\n\n` +
        `Budget is 241px of content on a container page (305px client width less 64px of ` +
        `padding-inline: 2rem, globals.css:119-121). ${rule.why}\n\n` +
        `Asserted as one exact string rather than as separate token checks: flex without flex-wrap ` +
        `is the overflow this rule exists to prevent, and a gate that accepts each token ` +
        `independently accepts a row that has them on different elements.`
    ).toBeGreaterThan(0)
  })
})

describe("R-1..R-4 — the old non-wrapping class is gone, not merely wrapped", () => {
  it.each(CONTAINER_RULES)("$id: $file no longer declares $old", (rule) => {
    const stale = usesIn(rule.file).filter((u) => normalised(u.className) === rule.old)

    expect(
      stale,
      `${rule.id} — ${rule.file} still declares an element whose className is exactly\n` +
        `    "${rule.old}"\n${show(stale)}\n\n` +
        `That is the "added a wrapper and left the old row in place" defect: a new flex-wrap ` +
        `container around an unchanged non-wrapping row reads as a fix and overflows exactly as ` +
        `before. ${rule.why}`
    ).toEqual([])
  })
})

/* --------------------------------------- 3. R-3b — a separate rule, on the SAME element */

/**
 * R-3b is not a variant of R-3a and `min-w-0` is not a synonym for `flex-wrap`.
 *
 * Asserted on the extracted opening tag rather than on the file, because both tokens merely APPEARING
 * in `toolbar.tsx` says nothing about whether they are on the element that needs them.
 */
describe("R-3b — the workflow name Input can shrink", () => {
  it("carries min-w-0 and max-w-[300px] on the same element", () => {
    const source = readStrippedSource(TOOLBAR)

    // `tagIndexes`, never `indexOf("<Input")`: it matches WHOLE tag names, so the lowercase
    // `<input type="file">` further down this file cannot stand in for the React `<Input>`, and a
    // hypothetical `<InputGroup>` could not either.
    const [inputAt] = tagIndexes(source, "Input")
    expect(inputAt, `${TOOLBAR}: no <Input> element found`).toBeDefined()

    const tag = openingTagAt(source, inputAt as number, "workflow name Input", TOOLBAR)
    const classes = classNamesOn(tag).join(" ")
    const tokens = tokensOf(classes)

    for (const token of ["min-w-0", "max-w-[300px]"]) {
      expect(
        tokens,
        `${TOOLBAR}: the workflow name Input declares "${classes}" and is missing ${token}.\n\n` +
          `max-w-[300px] caps the MAXIMUM but sets no minimum. A flex item defaults to ` +
          `min-width: auto, so without min-w-0 the Input refuses to shrink below its intrinsic ` +
          `size and forces the toolbar row wide before the wrap can help — the flex-wrap looks ` +
          `applied and does nothing. min-w-0 is a DIFFERENT fix from flex-wrap, not a synonym ` +
          `for it, which is why both tokens are required and why they are required HERE, on this ` +
          `element, rather than somewhere in this file.`
      ).toContain(token)
    }
  })
})

/* ------------------------------------------- 4. the general rule over every extracted row */

/**
 * A flex row is allowed to skip `flex-wrap` only when its items cannot force an overflow.
 *
 * Every entry is an EXACT className, matched whole, with the number of elements expected to carry it.
 * The count is what stops an exemption quietly widening to cover something new: if one of these
 * strings stops appearing, or starts appearing more often, the count fails.
 *
 * AN EXEMPTION WHOSE CLASSNAME CHANGED MUST BE RE-EXAMINED AGAINST R-1..R-4, NOT RE-COUNTED.
 */
const WRAP_EXEMPTIONS: { className: string; count: number; reason: string }[] = [
  {
    className: "flex items-center gap-2",
    count: 2,
    reason:
      "two control-plus-its-label clusters, each NESTED INSIDE A WRAPPING PARENT: toolbar.tsx's " +
      "Switch + \"Active\" sits in the R-3a row, and status-filter.tsx's Checkbox + \"Show test " +
      "runs\" sits in the R-4 row. A non-wrapping row inside a wrapping one is the CORRECT shape, " +
      "not an oversight — it is what makes the cluster wrap AS A UNIT instead of splitting a " +
      "control away from the label that names it. Each holds one ~16px control and one short " +
      "string, and the Label's text wraps as text, so neither cluster can force its parent wide.",
  },
  {
    className: "flex h-[300px] items-center justify-center rounded-lg border border-dashed",
    count: 1,
    reason:
      "runs-table.tsx's empty state. It has exactly ONE child, a `text-center` block holding two " +
      "<p>s, so there is no second item for flex to push off the edge and nothing for flex-wrap to " +
      "reflow. The long sentence inside wraps as ordinary text and the fixed h-[300px] absorbs the " +
      "extra lines. Adding flex-wrap here would change nothing at any width.",
  },
  {
    className: "flex items-start space-x-3",
    count: 4,
    reason:
      "notification-form.tsx's four preference rows — PRE-EXISTING SHAPE, and this phase added a " +
      "fourth row of it rather than an item to an existing row. Each is a 16px Checkbox plus a " +
      "text block (Label + description <p>). `items-start` holds the checkbox against the first " +
      "line while the text block wraps as text, which is the wrapping that matters here: these are " +
      "vertical rows that already stack naturally and never grow past their container.",
  },
]

describe("every flex row either wraps, shrinks, or is a named exemption", () => {
  /** `flex` as a WHOLE token: `flex-col`, `flex-wrap`, `flex-1` and `inline-flex` are all different. */
  const isFlexRow = (className: string) => {
    const tokens = tokensOf(className)
    return tokens.includes("flex") && !tokens.includes("flex-col")
  }

  const SAFE = ["flex-wrap", "shrink-0", "min-w-0"]

  it("has no unexempted flex row without flex-wrap, shrink-0 or min-w-0", () => {
    const exempt = new Set(WRAP_EXEMPTIONS.map((e) => e.className))

    const offenders = ALL_USES.filter(
      (use) =>
        isFlexRow(use.className) &&
        !SAFE.some((token) => tokensOf(use.className).includes(token)) &&
        !exempt.has(normalised(use.className))
    )

    expect(
      offenders,
      `${offenders.length} flex row(s) that can neither wrap nor shrink:\n${show(offenders)}\n\n` +
        `A non-wrapping flex row overflows its 241px budget rather than reflowing, and the item ` +
        `pushed off the right edge is invisible with no scrollbar to reveal it. Add flex-wrap, or ` +
        `add an entry to WRAP_EXEMPTIONS in this file with a reason saying why that row cannot ` +
        `overflow — never by loosening the rule, and never for a row this phase added an item to.`
    ).toEqual([])
  })

  it.each(WRAP_EXEMPTIONS)("the exemption $className is still used exactly $count time(s)", (e) => {
    const hits = ALL_USES.filter((use) => normalised(use.className) === e.className)

    expect(
      hits.length,
      `the wrap exemption "${e.className}" matched ${hits.length} element(s), expected ${e.count}.\n` +
        `  Exempt because: ${e.reason}\n\n` +
        `An exemption whose className changed must be re-examined against R-1..R-4, not re-counted.`
    ).toBe(e.count)
  })
})
