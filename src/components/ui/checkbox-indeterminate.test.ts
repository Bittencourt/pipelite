/**
 * BULK-01 — the indeterminate branch of the vendored `checkbox.tsx`, and its blast radius.
 *
 * WHY THIS FILE EXISTS. Radix renders `CheckboxPrimitive.Indicator` for `checked === "indeterminate"`
 * exactly as it does for `checked === true`. Before this phase the Indicator held a single
 * `<CheckIcon />`, so a partially selected header checkbox drew a CHECK MARK: "3 of 50 selected" and
 * "50 of 50 selected" looked identical, while the accessibility tree already announced `mixed`. A user
 * could confirm a destructive dialog believing every row was selected. The fix is a second, mutually
 * exclusive icon branch, and this gate is what stops a later edit from quietly collapsing it back to
 * one icon.
 *
 * THIS REPO DOES NOT RENDER CLIENT COMPONENTS IN TESTS. No jsdom, no happy-dom, no testing library is
 * installed and this phase does not add one — that is a dependency decision belonging to a phase
 * willing to own it. So the branch is pinned here as SOURCE, and its pixels are confirmed by the
 * browser pass in plan 38-20. A source gate is weaker than a render, and saying so is what keeps the
 * claim honest.
 *
 * EVERY assertion below runs against COMMENT-STRIPPED source, obtained through the shared
 * string-aware `readStrippedSource`. Nothing here opens a file verbatim, deliberately. Phase 37
 * recorded a raw-text gate colliding with an explanatory comment NINE times in a single phase: prose
 * that merely names a gated token satisfies — or breaks — a text gate that never learned to tell code
 * from commentary. This gate is comment-blind by construction, and the correct response to a
 * collision is to REWORD THE COMMENT, never to weaken the gate. The stripper is shared rather than
 * re-implemented so it cannot drift away from the three other gates that depend on it.
 *
 * THREE ANTI-VACUITY REQUIREMENTS, per `src/lib/audit/no-mutation-coupling.test.ts`:
 *   1. Prove the file was found and read. A silently empty read passes every negative assertion in
 *      here perfectly, so length and two POSITIVE Radix markers are asserted first, in file order.
 *   2. Prove it is the RIGHT file, via a positive marker on the checked-state styling that IS this
 *      phase's selection indicator. If that moves, this gate must go red and be reconsidered rather
 *      than keep passing over a file that no longer styles the checked state.
 *   3. A gate for the gate: two vocabulary tables — the class strings the detector recognises, and
 *      the pre-existing ones it must leave alone — each asserted entry by entry, so the next idiom
 *      cannot sail through.
 */
import { describe, expect, it } from "vitest"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const CHECKBOX_PATH = "src/components/ui/checkbox.tsx"
const CHECKBOX = readStrippedSource(CHECKBOX_PATH)

/** The two Radix elements the patch had to leave structurally intact. */
const RADIX_MARKERS = ["CheckboxPrimitive.Root", "CheckboxPrimitive.Indicator"] as const

/**
 * Vocabulary table 1 — the indeterminate idiom this gate recognises.
 *
 * Both entries are required: one hides the check when the Root is in the mixed state, the other
 * reveals the dash. Either alone leaves the two icons overlapping or the dash invisible.
 */
const RECOGNISED_INDETERMINATE_CLASSES = [
  "group-data-[state=indeterminate]/checkbox:hidden",
  "group-data-[state=indeterminate]/checkbox:block",
] as const

/**
 * Vocabulary table 2 — pre-existing classes the patch must leave alone.
 *
 * The first two ARE this phase's selection indicator: a selected row's checkbox is recognisable only
 * because a checked Root takes the primary fill and foreground. The third is the entire visual
 * signal that the header checkbox is disabled on an empty table. A patch that reflowed the className
 * and dropped one of these would still satisfy every assertion about the new branch, which is why
 * they are pinned rather than assumed.
 */
const PRESERVED_CLASSES = [
  "data-[state=checked]:bg-primary",
  "data-[state=checked]:text-primary-foreground",
  "disabled:opacity-50",
] as const

/** The Tailwind group marker the two branches key off. Without it both selectors are inert. */
const GROUP_MARKER = "group/checkbox"

/* ------------------------------------------------------------------------- *
 * 1 + 2. The positive markers, asserted BEFORE any negative assertion.
 * ------------------------------------------------------------------------- */

describe("checkbox.tsx was found, read, and is the right file", () => {
  it("reads a non-empty source", () => {
    expect(
      CHECKBOX.length,
      `${CHECKBOX_PATH} stripped to nothing — every negative assertion in this file would then pass vacuously, so the empty read is the failure, not a curiosity`
    ).toBeGreaterThan(0)
  })

  it("still builds on the two Radix checkbox primitives", () => {
    for (const marker of RADIX_MARKERS) {
      expect(
        CHECKBOX,
        `${CHECKBOX_PATH} must still render ${marker}: the tri-state and aria-checked="mixed" come from the Radix primitive, and a rewrite onto a plain input would silently drop both while leaving the class strings below untouched`
      ).toContain(marker)
    }
  })

  it("still styles the checked state, which is this phase's selection indicator", () => {
    expect(
      CHECKBOX,
      `${CHECKBOX_PATH} must still carry data-[state=checked]:bg-primary — it is how a selected row announces itself; if that styling moved elsewhere this gate is watching the wrong file and must be reconsidered rather than kept green`
    ).toContain("data-[state=checked]:bg-primary")
  })
})

/* ------------------------------------------------------------------------- *
 * 3. The gate for the gate, plus the substantive branch assertions.
 * ------------------------------------------------------------------------- */

describe("the indeterminate branch", () => {
  it("imports and renders the dash icon", () => {
    expect(
      CHECKBOX,
      `${CHECKBOX_PATH} must reference MinusIcon: without a second icon the Indicator draws a check for the mixed state, which is the defect BULK-01 exists to prevent`
    ).toContain("MinusIcon")
  })

  it("marks the Root as the Tailwind group the branches key off", () => {
    expect(
      CHECKBOX,
      `the Root className must include ${GROUP_MARKER}: the two group-data selectors below resolve against it, and without the marker both are inert and the dash never appears`
    ).toContain(GROUP_MARKER)
  })

  it("recognises every entry in the indeterminate vocabulary table", () => {
    for (const cls of RECOGNISED_INDETERMINATE_CLASSES) {
      expect(
        CHECKBOX,
        `${CHECKBOX_PATH} is missing the indeterminate class "${cls}" — the mixed state would render a check mark, indistinguishable from all-selected`
      ).toContain(cls)
    }
  })

  it("leaves every entry in the preserved vocabulary table alone", () => {
    for (const cls of PRESERVED_CLASSES) {
      expect(
        CHECKBOX,
        `${CHECKBOX_PATH} lost the pre-existing class "${cls}" — the indeterminate patch was required to be additive, and this class predates it`
      ).toContain(cls)
    }
  })

  it("keeps the two icons mutually exclusive", () => {
    // Anchor discipline: indexOf returning -1 would make slice() widen to the whole file and the
    // sub-assertions below would then read the OTHER icon's classes and pass. Assert the anchor.
    for (const [icon, required] of [
      ["<CheckIcon", ["group-data-[state=indeterminate]/checkbox:hidden"]],
      ["<MinusIcon", ["hidden", "group-data-[state=indeterminate]/checkbox:block"]],
    ] as const) {
      const at = CHECKBOX.indexOf(icon)
      expect(at, `${CHECKBOX_PATH} must render ${icon}: the anchor is missing, so nothing below could be checked`).toBeGreaterThan(-1)

      const end = CHECKBOX.indexOf("/>", at)
      expect(end, `the ${icon} element in ${CHECKBOX_PATH} is never closed, so its class list cannot be read`).toBeGreaterThan(at)

      const element = CHECKBOX.slice(at, end)
      for (const cls of required) {
        expect(
          element,
          `the ${icon} element must carry "${cls}" — otherwise both icons render together in one state and the control shows a check and a dash at once`
        ).toContain(cls)
      }
    }
  })

  it("adds no prop, so the public surface is unchanged", () => {
    expect(
      CHECKBOX,
      `${CHECKBOX_PATH} must still take exactly React.ComponentProps<typeof CheckboxPrimitive.Root>: a new or renamed prop would make this patch a breaking change for consumers instead of the additive one the consumer-safety test below relies on`
    ).toContain("React.ComponentProps<typeof CheckboxPrimitive.Root>")
  })
})

/* ------------------------------------------------------------------------- *
 * Consumer safety — the whole reason a shared primitive may be patched at all.
 * ------------------------------------------------------------------------- */

const REPO_ROOT = process.cwd()
const SRC_ROOT = path.join(REPO_ROOT, "src")

/** Machinery directories, never source. */
const SKIP_DIRS = new Set(["node_modules", ".next", ".claude", ".git"])

/**
 * The one PROJECT directory the walk skips, matched by full relative path rather than by folder name
 * so an unrelated `bulk/` elsewhere is still scanned.
 *
 * `src/components/bulk` is excluded ON PURPOSE: those modules arrive in plans 38-07 onward, they DO
 * pass a mixed value legitimately, and plan 38-19's cross-surface gate owns them. Counting them as
 * "existing consumers" would turn the count assertion below into a rolling target that says nothing.
 */
const EXCLUDED_SUBTREE = path.join("src", "components", "bulk")

/**
 * Test files are out of scope: they are not part of the runtime component graph, and they quote the
 * very tokens being searched for as literals — including this file, which would otherwise register as
 * both a consumer and its own worst offender.
 */
const isTestFile = (file: string) =>
  /(^|[/\\])__tests__[/\\]/.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)

function walkSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      if (path.relative(REPO_ROOT, full) === EXCLUDED_SUBTREE) continue
      walkSources(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !isTestFile(full)) {
      out.push(full)
    }
  }
  return out
}

/**
 * An import of the `Checkbox` binding from this exact module.
 *
 * The trailing quote class is not decoration: a bare substring match would also count a future
 * `@/components/ui/checkbox-group`. Both quote styles are accepted because this codebase genuinely
 * uses both — which is precisely how the design spec's consumer count came in low (see below).
 */
const IMPORTS_CHECKBOX = /import\s*\{[^}]*\bCheckbox\b[^}]*\}\s*from\s*['"]@\/components\/ui\/checkbox['"]/

/** The state whose new visual branch this plan added. No existing consumer may reach it. */
const MIXED_STATE_TOKEN = "indeterminate"

/**
 * PHASE-38 BULK SELECTION SURFACES THAT LIVE OUTSIDE `src/components/bulk`, named by exact path.
 *
 * The `EXCLUDED_SUBTREE` above covers this phase's selection modules by DIRECTORY, which works for
 * every surface whose selection lives in a shared component. It does not work for `/deals`: that
 * surface is a kanban with no `useReactTable`, so it is the phase's one declared exception, and its
 * selection controls necessarily live in the kanban's own files rather than in a shared bulk module.
 * Without this list, plan 38-18's two new checkboxes would be counted as PRE-EXISTING consumers and
 * asserted never to reach the mixed state — which inverts the gate's meaning for the one surface that
 * reaches it on purpose.
 *
 * BOTH WERE HAND-CHECKED BEFORE BEING ADDED, which is the obligation the exact count exists to force:
 *   - `kanban-column.tsx` DOES pass the mixed value, deliberately: the per-stage select-all is
 *     tri-state, and this is exactly the case the primitive was patched for.
 *   - `deal-card.tsx` does NOT. Its per-card checkbox is passed a strict boolean (`!!isBulkSelected`),
 *     so it cannot reach the new branch at all; it is listed here only because it is a phase-38
 *     selection consumer rather than a pre-existing one.
 *
 * ADDING A PATH HERE IS NOT A WAY TO SILENCE THE COUNT. Anything not part of this phase's selection
 * work stays in `CHECKBOX_CONSUMERS` and must still prove it never reaches the mixed state, and
 * `EXPECTED_CONSUMER_COUNT` is deliberately left at its pre-phase-38 value so an unrelated eleventh
 * consumer still turns this gate red.
 */
const PHASE_38_SELECTION_CONSUMERS = new Set([
  path.join("src", "app", "deals", "deal-card.tsx"),
  path.join("src", "app", "deals", "kanban-column.tsx"),
])

/**
 * Every non-test, non-bulk module importing `Checkbox`, resolved once, comment-blind.
 *
 * OBSERVED 2026-08-17 on the phase-38 base commit: TEN modules, not the eight recorded in
 * 38-UI-SPEC § Surface 1 and repeated in this plan's interfaces block. The two the spec missed are
 * `src/app/admin/fields/[entityType]/field-dialog.tsx` and `.../fields-list.tsx`, both of which
 * import with SINGLE quotes — a double-quote-only grep does not see them. The spec's substantive
 * claim is unaffected and is re-verified below: the token count for the mixed state across all ten is
 * zero, so the new branch is unreachable for every one of them. The count is asserted exactly rather
 * than loosely so that an eleventh consumer makes this gate red and forces someone to look, which is
 * the whole point of 38-UI-SPEC assumption #5.
 */
const CHECKBOX_CONSUMERS = walkSources(SRC_ROOT)
  .map(file => path.relative(REPO_ROOT, file))
  .filter(rel => !PHASE_38_SELECTION_CONSUMERS.has(rel))
  .filter(rel => IMPORTS_CHECKBOX.test(readStrippedSource(rel)))
  .sort()

/**
 * BUMPED 10 -> 11 BY PLAN 40-08, AFTER THE HAND-CHECK THIS COUNT EXISTS TO FORCE.
 *
 * The eleventh consumer is `src/components/views/save-view-dialog.tsx`, and it CANNOT reach the
 * mixed branch: both of its checkboxes are driven by a `boolean` state seeded from `?? false`, and
 * each `onCheckedChange` collapses Radix's `CheckedState` with `checked === true` before it ever
 * reaches `setState`. So `checked` is a strict boolean at every render, exactly like `deal-card.tsx`,
 * and the "proves none of them ever puts the Root into the mixed state" assertion below covers it
 * for free — that file is deliberately NOT allow-listed, because allow-listing is for phase-38
 * selection surfaces and would buy a free slot in this count rather than prove anything.
 */
const EXPECTED_CONSUMER_COUNT = 11

describe("consumer safety: the new branch is unreachable for existing Checkbox users", () => {
  it("finds the walk itself is not vacuous", () => {
    expect(
      walkSources(SRC_ROOT).length,
      "the recursive walk over src/ returned nothing — a zero-file scan passes every consumer assertion below without reading a line of code"
    ).toBeGreaterThan(100)
  })

  it(`enumerates exactly ${EXPECTED_CONSUMER_COUNT} non-bulk consumers`, () => {
    expect(
      CHECKBOX_CONSUMERS.length,
      `expected ${EXPECTED_CONSUMER_COUNT} modules importing Checkbox outside src/components/bulk, found ${CHECKBOX_CONSUMERS.length}: ${CHECKBOX_CONSUMERS.join(", ")}. A new consumer must be checked by hand for the mixed state before this number is bumped — the count exists so the check cannot be skipped`
    ).toBe(EXPECTED_CONSUMER_COUNT)
  })

  it("proves none of them ever puts the Root into the mixed state", () => {
    const offenders = CHECKBOX_CONSUMERS.filter(rel =>
      readStrippedSource(rel).includes(MIXED_STATE_TOKEN)
    )

    expect(
      offenders,
      `these existing consumers reference the mixed state: ${offenders.join(", ")}. The indeterminate patch was justified as behaviour-neutral precisely because no pre-phase-38 consumer reaches the new branch; each of these must be re-inspected before that claim can be repeated`
    ).toEqual([])
  })

  /**
   * The allow-list above removes files from the count, so it is itself a way to weaken this gate. This
   * assertion is what stops it rotting into one: every path listed must really exist and must really
   * import `Checkbox`. A renamed, deleted or never-a-consumer entry therefore fails HERE, loudly, in
   * the same run rather than silently buying an extra slot in the count for some unrelated module.
   */
  it("keeps the phase-38 selection allow-list honest — every entry is a real Checkbox consumer", () => {
    const stale = Array.from(PHASE_38_SELECTION_CONSUMERS).filter(
      rel => !existsSync(path.join(REPO_ROOT, rel)) || !IMPORTS_CHECKBOX.test(readStrippedSource(rel))
    )

    expect(
      stale,
      `these allow-listed paths are not live Checkbox consumers: ${stale.join(", ")}. An entry that no longer matches a real importing module silently grants a free slot in the exact consumer count, which is the one thing that count exists to prevent`
    ).toEqual([])
  })
})
