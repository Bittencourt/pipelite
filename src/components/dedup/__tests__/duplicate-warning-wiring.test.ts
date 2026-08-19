/**
 * THE CREATE-TIME WARNING'S WIRING CONTRACT — 39-UI-SPEC Surface 1, W-1/W-2/W-4/W-6.
 *
 * A SOURCE SCAN AND NOT A DOM TEST, because there is no jsdom in this repo (Phase 45 K-6): every
 * rule below is written so a comment-blind read of the file can check it. `readStrippedSource`
 * removes comments first, so prose describing a rule can never satisfy it — without that, the W-6
 * assertion "`dedup.merge.` appears zero times" would be broken by the sentence explaining why.
 *
 * EVERY NEGATIVE ASSERTION HERE IS PAIRED WITH AN ANTI-VACUITY ONE, and that pairing is the point
 * of the file. "The duplicates branch does not close the dialog" is satisfied by a dialog with no
 * close function at all; "`dedup.merge.` appears zero times" is satisfied by an empty file. So each
 * negative is accompanied by a positive that fails if the subject it constrains disappears.
 *
 * WHY THE FLAG ASSERTION IS SCOPED TO A CALL AND NOT TO THE FILE. `confirmDuplicate: true` present
 * *somewhere* in a dialog proves nothing — on the wrong call it would confirm an UPDATE, or sit in
 * dead code while the create still re-runs the check and the user is trapped behind a warning they
 * can never dismiss. `callArguments` extracts the create action's own argument text, and a second
 * assertion pins that EVERY mention of the flag in the file is inside one of those arguments.
 */

import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  callArguments,
  readStrippedSource,
} from "@/components/custom-fields/__tests__/source-scan"

const WARNING_COMPONENT = "src/components/dedup/duplicate-warning.tsx"

interface DialogUnderTest {
  label: string
  path: string
  /** The create server action whose call must carry the confirm flag. */
  action: string
  /** The dialog's own close function — the thing W-2 forbids the duplicates branch from calling. */
  close: string
}

const DIALOGS: DialogUnderTest[] = [
  {
    label: "organization",
    path: "src/app/organizations/organization-dialog.tsx",
    action: "createOrganization",
    close: "handleClose",
  },
  {
    label: "person",
    path: "src/app/people/person-dialog.tsx",
    action: "createPerson",
    close: "handleClose",
  },
]

/** How many times `needle` occurs in `haystack`. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/**
 * The body of the first braced block that follows `marker`, by string-aware brace matching.
 *
 * String-awareness matters for the same reason it does in `stripComments`: a `}` inside a string
 * literal would otherwise close the block early and hand back a truncated body, which would make
 * every assertion against that body pass for the wrong reason.
 */
function blockAfter(source: string, marker: string): string {
  const markerAt = source.indexOf(marker)
  if (markerAt === -1) throw new Error(`marker not found in source: ${marker}`)

  const open = source.indexOf("{", markerAt)
  if (open === -1) throw new Error(`no block opens after marker: ${marker}`)

  let depth = 1
  let quote: string | null = null
  let i = open + 1

  while (i < source.length && depth > 0) {
    const ch = source[i]

    if (quote) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "{") depth += 1
    else if (ch === "}") depth -= 1

    i += 1
  }

  if (depth !== 0) throw new Error(`unterminated block after marker: ${marker}`)

  return source.slice(open + 1, i - 1)
}

/** Anything shaped like a React state setter: `setFoo(`. */
const SETTER_CALL = /\bset[A-Z][A-Za-z0-9_$]*\s*\(/g

/** The marker that opens the duplicates branch. Identical in both dialogs, deliberately. */
const DUPLICATES_BRANCH = 'if ("duplicates" in result)'

describe.each(DIALOGS)("$label create dialog — the warning wiring contract", (dialog) => {
  const source = readStrippedSource(dialog.path)

  it("W-6 — offers no merge affordance, and is not empty (anti-vacuity)", () => {
    // No "Merge now". An unsaved draft has no losing record to move to Trash and no field history
    // to reconcile, so a merge here would name an operation that cannot exist.
    expect(occurrences(source, "dedup.merge.")).toBe(0)

    // ANTI-VACUITY: an emptied file, or one that dropped the warning entirely, would satisfy the
    // assertion above. This is what makes the zero meaningful.
    expect(occurrences(source, "dedup.warning.")).toBeGreaterThan(0)
  })

  it("W-1 — renders the DuplicateWarning component", () => {
    expect(source).toContain("<DuplicateWarning")
  })

  it("W-4 — the confirm flag rides on the create action's OWN call", () => {
    const calls = callArguments(source, dialog.action)

    // The create action is called exactly once in the dialog.
    expect(calls).toHaveLength(1)
    expect(calls.some((args) => args.includes("confirmDuplicate: true"))).toBe(true)

    // And nowhere else: every mention of the flag in the whole file is inside that call's argument
    // list. Moving it onto the update call, or leaving a stray copy behind, fails here.
    const inCalls = calls.reduce((total, args) => total + occurrences(args, "confirmDuplicate"), 0)
    expect(occurrences(source, "confirmDuplicate")).toBe(inCalls)
  })

  it("W-4 — the submit button is relabelled from the catalog", () => {
    expect(source).toContain("dedup.warning.createAnyway")
  })

  it("no effect body calls a state setter, and there IS an effect body (anti-vacuity)", () => {
    // `react-hooks/set-state-in-effect` is an ERROR in this repo, and three Phase 38 plans hit it
    // independently on code their own spec had specified verbatim. The clearing of the warning is
    // therefore done in a change handler and by React's adjust-state-on-prop-change pattern.
    const effects = callArguments(source, "useEffect")

    // ANTI-VACUITY, stated as the plan requires rather than assumed: a file with zero effects would
    // pass the per-body loop below without any body having been inspected.
    expect(effects.length).toBeGreaterThan(0)

    for (const body of effects) {
      expect(body.match(SETTER_CALL) ?? []).toEqual([])
    }
  })

  it("W-2 — the duplicates branch neither closes the dialog, resets the form, nor arms the create guard", () => {
    const branch = blockAfter(source, DUPLICATES_BRANCH)

    // The branch is real: it stores the matches. Without this the three negatives below would be
    // satisfied by an empty block.
    expect(branch).toContain("setDuplicates(result.duplicates)")

    expect(branch).not.toContain(`${dialog.close}(`)
    expect(branch).not.toContain("reset(")
    // Nothing was created, so there is no record id to arm the next-submit guard with.
    expect(branch).not.toContain("createdRecordIdRef")

    // ANTI-VACUITY: the close function IS called elsewhere in the file, so the negative above
    // cannot be satisfied by a dialog that simply never closes.
    const outsideBranch = source.replace(branch, "")
    expect(occurrences(outsideBranch, `${dialog.close}(`)).toBeGreaterThan(0)
    expect(occurrences(outsideBranch, "reset(")).toBeGreaterThan(0)
  })
})

describe("the DuplicateWarning component", () => {
  const source = readStrippedSource(WARNING_COMPONENT)

  it("renders no buttons of its own (W-4 / W-5 keep the dialog's controls)", () => {
    expect(occurrences(source, "<Button")).toBe(0)

    // ANTI-VACUITY: the component does render, and it renders the Alert the contract names.
    expect(source).toContain("<Alert")
  })

  it("C-1 — is never the destructive variant", () => {
    expect(occurrences(source, 'variant="destructive"')).toBe(0)
    expect(source).toContain('variant="default"')
  })

  it("W-3 — the blank target and its rel pair travel together, once each", () => {
    // Read from the RAW file, not the stripped one: the gate the plan states is a plain grep over
    // the file, and it is only equivalent if neither attribute is spelled in a comment either.
    const raw = readFileSync(WARNING_COMPONENT, "utf8")

    expect(occurrences(raw, 'target="_blank"')).toBe(1)
    expect(occurrences(raw, 'rel="noopener noreferrer"')).toBe(1)
  })

  it("W-7 — nothing is clipped, and all four reason keys are reachable", () => {
    expect(source.match(/truncate|line-clamp/g) ?? []).toEqual([])

    // A matched record is never shown without its reason, so the reason map has to be TOTAL over
    // `DedupReason`. Spelled out here so the gate reads the key set rather than trusting a lookup.
    for (const reason of ["email", "nameIdentity", "similarName", "similarNamePhone"]) {
      expect(source).toContain(`${reason}: "${reason}"`)
    }
  })
})
