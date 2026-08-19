/**
 * The wiring gate for the timeline's merged entry (39-12, 39-UI-SPEC A-2/A-3/A-5/A-6/A-7).
 *
 * WHAT THIS DEFENDS. Success criterion 5 is that a merge is VISIBLE in the surviving record's
 * change history: the losing record named in the predicate, the number of linked records that
 * moved stated in words, and the per-field diff listed. Three of the four edits that produce it
 * are one-line render decisions inside a `"use client"` module, and each one has a specific way
 * of silently going wrong:
 *
 *   A-2 — the predicate is computed by ONE `t(...)` call for all fourteen keys. `merged` is the
 *         only action whose message carries a placeholder, so the call must pass a values object.
 *         Passing it at a DIFFERENT call site would look right in a file-wide grep and leave the
 *         predicate rendering "merged {name} into this organization" verbatim.
 *   A-5 — `entry.action === "deleted" ? null : …` must stay scoped to `deleted`. Widening it to
 *         cover `merged` is a one-word edit that deletes the field detail SC-5 is made of, and
 *         nothing else in the suite would notice: the entry would still render, just emptier.
 *   A-6 — the empty-changes fallback must branch. `noVisibleChanges` reads as a bug report; for a
 *         merge where the survivor won every field, emptiness is the correct outcome. Replacing
 *         the key rather than branching would tell every `updated` reader the wrong thing.
 *   A-7 — the child-count line sits BEFORE the field list, not inside it, or it takes a row in
 *         the <dl> and a place in `hiddenFieldCount`.
 *
 * WHY A SOURCE GATE. The 45-06 precedent, unchanged: this repo renders no client components in
 * tests — no jsdom, no happy-dom, no testing library — and adding one is a dependency decision
 * belonging to a phase willing to own it (V-7). The halves that CAN be pure functions are:
 * `src/lib/audit/present.test.ts` proves the marker keys never become field rows, and
 * `src/lib/timeline/sources.test.ts` proves the two entry fields hydrate and degrade. What is
 * left is a render decision, and its only honest proof at this layer is that it is still written
 * down. The rendered sentence is confirmed by the phase's browser walk.
 *
 * WHY THE NEGATIVES ARE BRACE-SCOPED AND NOT FILE-WIDE (A-10). `merged` and `noVisibleChanges`
 * are how OTHER rows in this same file work, so a file-wide assertion about either is answered by
 * unrelated code. The regions below are extracted by quote-aware brace and paren matching — the
 * technique `callArguments` in `source-scan.ts` already uses — rather than by a character window,
 * because a window silently stops covering its branch the moment a prop or a comment is added
 * inside it, and it does so without failing.
 *
 * COMMENT-BLINDNESS. Every read goes through `readStrippedSource`. There is NO raw read in this
 * file: unlike 45-06's gate, no claim asserted here is about a string that exists only in a
 * comment. The collision that cost phases 37-38 fifteen gate runs — a doc comment satisfying, or
 * breaking, a gate that searched raw text — is closed by construction.
 */
import { describe, expect, it } from "vitest"

import { callArguments, readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import enUS from "@/messages/en-US.json"

const ENTRY_PATH = "src/components/timeline/audit-entry.tsx"
const ENTRY = readStrippedSource(ENTRY_PATH)

/**
 * The brace-matched block that BEGINS at `marker`, whose first character must itself be the
 * opening brace.
 *
 * This differs from 45-06's `blockAfter`, which searches for the first `{` following its marker.
 * The region wanted here is a JSX expression CONTAINER — `{entry.action === "deleted" ? … }` —
 * whose brace is attached to the front of the marker, not somewhere after it. Anchoring on the
 * brace itself is what makes the extraction exact rather than approximate.
 *
 * Quote-aware, so a `{` inside a string literal or a className cannot open a level that never
 * closes. Returns "" when the marker is absent, which is why every caller asserts the slice is
 * non-empty before asserting anything about its contents.
 */
function braceBlockAt(source: string, marker: string): string {
  const start = source.indexOf(marker)
  if (start === -1 || source[start] !== "{") return ""

  let i = start
  let depth = 0
  let quote: string | null = null

  while (i < source.length) {
    const ch = source[i]

    if (quote !== null) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch
    } else if (ch === "{") {
      depth += 1
    } else if (ch === "}") {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }

    i += 1
  }

  return ""
}

/**
 * The text of one JSX element, from its opening tag to the first matching close tag.
 *
 * A naive "slice to the next `</div>`" is only correct while the element contains no nested
 * `<div`, so the caller asserts exactly that — the assumption is checked rather than trusted.
 */
function elementSlice(source: string, openTag: string, closeTag: string): string {
  const start = source.indexOf(openTag)
  if (start === -1) return ""

  const end = source.indexOf(closeTag, start)
  if (end === -1) return ""

  return source.slice(start, end + closeTag.length)
}

/**
 * A-5 / A-6's region: the WHOLE field-list conditional, from the `deleted` guard through the
 * disclosure button. Both the guard being widened and the fallback key being replaced happen
 * inside this one expression.
 */
const FIELD_LIST_REGION = braceBlockAt(ENTRY, '{entry.action === "deleted"')

/**
 * A-3's region: the predicate ROW — actor, sentence, timestamp, kind badge. The loser's name
 * renders inside this row, and the claim under test is that it renders as text.
 */
const PREDICATE_ROW = elementSlice(
  ENTRY,
  '<div className="flex flex-wrap items-center gap-2">',
  "</div>"
)

/** Every `t(...)` argument list in the file, for the A-2 call-scoped assertion. */
const T_CALLS = callArguments(ENTRY, "t")

/** The predicate call, identified by the key template rather than by a line number. */
const PREDICATE_CALLS = T_CALLS.filter((args) => args.includes("entry.${entry.action}"))

function occurrences(haystack: string, needle: string): number {
  let count = 0
  let from = 0

  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return count
    count += 1
    from = at + needle.length
  }
}

describe("the gate reads the right source and the right regions", () => {
  it("read the entry", () => {
    expect(
      ENTRY.length,
      `${ENTRY_PATH} must have been read: a helper returning an empty string would satisfy every negative assertion in this file perfectly`
    ).toBeGreaterThan(0)
  })

  it("found the field row and the accent-link idiom still in the file", () => {
    // ANTI-VACUITY 2 and 3. The positive markers that prove this is the right file, and that the
    // two things the negatives below are NOT about are still alive.
    expect(
      ENTRY,
      "audit-entry.tsx must still declare AuditFieldRow. A-4 says the merged entry renders its diff through the EXISTING field row, unchanged; if the field row leaves this file this gate must go RED and be rewritten rather than keep passing over a file that no longer renders a field"
    ).toContain("AuditFieldRow")

    expect(
      ENTRY,
      'audit-entry.tsx must still contain the accent-link idiom `text-primary hover:underline`. It is how the workflow-run actor links to its run, and the A-3 negative below asserts only that the PREDICATE ROW draws no link — deleting links from this file app-wide would otherwise turn that assertion green while removing a working affordance'
    ).toContain("text-primary hover:underline")
  })

  it("extracted both regions its negatives are scoped to", () => {
    // ANTI-VACUITY 4. Every scoped assertion below runs against one of these slices, so a failed
    // extraction would make all of them pass over nothing.
    expect(
      FIELD_LIST_REGION.length,
      'the field-list conditional must be extractable by brace matching from `{entry.action === "deleted"`. A-5 and A-6 are both asserted inside this slice'
    ).toBeGreaterThan(0)

    expect(
      PREDICATE_ROW.length,
      "the predicate row must be extractable from its opening `flex flex-wrap items-center gap-2` div. A-3's no-link claim is asserted inside this slice"
    ).toBeGreaterThan(0)

    expect(
      occurrences(PREDICATE_ROW, "<div"),
      "the predicate row must contain no nested <div. This slice is closed at the FIRST </div>, so a nested one would silently truncate the region and make A-3's negative a claim about a fragment"
    ).toBe(1)
  })

  it("found more than one t() call, and exactly one predicate call", () => {
    expect(
      T_CALLS.length,
      "callArguments must find several t() calls in this file. If it found none, the A-2 assertion below would be a claim about an empty list"
    ).toBeGreaterThan(1)

    expect(
      PREDICATE_CALLS.length,
      'exactly ONE t() call may build the predicate from `entry.${entry.action}`. A-2 exists to keep the merge a fourth action in the existing mechanism rather than a special case, and two such calls means the special case was written'
    ).toBe(1)
  })
})

describe("A-2: the predicate call itself carries the loser's name", () => {
  it("passes the values object at the same call that builds the key", () => {
    const [predicateCall] = PREDICATE_CALLS

    expect(
      predicateCall,
      'the predicate call must build its key from `entry.${entry.action}.${entry.entityType}`. Fourteen separate keys rather than one sentence with an {entity} placeholder: Spanish and Portuguese inflect the demonstrative with the noun gender, so a placeholder would produce broken grammar in two of the three shipped locales'
    ).toContain("${entry.action}.${entry.entityType}")

    expect(
      predicateCall,
      'THE SAME call must carry a `name:` property. This is asserted against the extracted ARGUMENT LIST, not against the file: `audit.entry.merged.*` is the only predicate with a placeholder, and a values object passed to some other t() call in this file would satisfy a file-wide grep perfectly while the merged predicate rendered "merged {name} into this organization" verbatim to the user'
    ).toContain("name:")

    expect(
      predicateCall,
      "the name must come from `entry.mergedLoserName`, the field the audit source hydrates out of the __mergedFromName marker. Any other source — a live lookup, the survivor's own name — would either 404 against a soft-deleted row or state the merge backwards"
    ).toContain("entry.mergedLoserName")
  })

  it("resolves against a real catalog entry with that placeholder", () => {
    const merged = enUS.audit.entry.merged as Record<string, string | undefined>

    for (const entityType of ["organization", "person"]) {
      expect.soft(
        merged[entityType],
        `audit.entry.merged.${entityType} must resolve to a non-empty string in src/messages/en-US.json. A key the component asks for and the catalog does not have renders as the raw dotted path in the browser, and nothing else catches it: the compiler cannot, and locale-parity.test.ts compares the three locale files to EACH OTHER rather than to the component's call sites`
      ).toBeTruthy()

      expect.soft(
        merged[entityType],
        `audit.entry.merged.${entityType} must carry the {name} placeholder the call site fills. A message without it would make the values object dead code and drop the losing record's name from the sentence — which is the whole of what SC-5 asks the survivor's history to say`
      ).toContain("{name}")
    }
  })
})

describe("A-3: the loser's name is text, never a link", () => {
  it("draws no link inside the predicate row", () => {
    for (const token of ["<Link", "href="]) {
      expect.soft(
        PREDICATE_ROW.includes(token),
        `the predicate row must not contain "${token}". The losing record is soft-deleted: its detail route answers 404 while it is in Trash, and /trash already owns the affordance for finding it — a dead link out of an audit entry is worse than a name. Asserted against the BRACE-EXTRACTED row rather than the file, because the workflow-run actor above it links to its run legitimately and a file-wide negative would be demanding that link be deleted`
      ).toBe(false)
    }
  })

  it("still renders the predicate as a plain text child in that row", () => {
    expect(
      PREDICATE_ROW,
      "the predicate must still render as `{predicate}` inside the row. The loser's name arrives as an interpolated ICU value, so it is a React text child and React escapes it — the same posture the field list takes toward user-authored values (T-36-21). If the sentence stops rendering here, the A-3 negative above is a claim about a row with no sentence in it"
    ).toContain("{predicate}")
  })
})

describe("A-5: the field list is suppressed for deleted and ONLY for deleted", () => {
  it("keeps the guard exactly as narrow as 45-06 left it", () => {
    expect(
      FIELD_LIST_REGION,
      'the guard must remain exactly `entry.action === "deleted" ? null`. A merged entry RENDERS its field list: the survivor\'s before/after for every field the merge changed is the entire content of the merge receipt, and suppressing it would leave the entry saying a merge happened while showing nothing about what it did'
    ).toContain('entry.action === "deleted" ? null')
  })

  it("contains neither shape of widening", () => {
    for (const widening of ['entry.action !== "deleted"', '["deleted", "merged"]']) {
      expect.soft(
        FIELD_LIST_REGION.includes(widening),
        `the field-list conditional must not contain \`${widening}\`. Both are one-edit ways to widen the suppression to cover merged, and both would silently delete the field detail SC-5 is made of — the entry would still render, just emptier, and no other assertion in the suite would notice`
      ).toBe(false)
    }
  })

  it("still renders the field row inside that conditional", () => {
    expect(
      FIELD_LIST_REGION,
      "the conditional must still render an AuditFieldRow. Anti-vacuity for the two negatives above: a conditional that stopped rendering the field list at all would satisfy both of them while destroying exactly what A-5 protects"
    ).toContain("AuditFieldRow")
  })
})

describe("A-6: the empty-changes fallback branches on the action", () => {
  it("branches inside the field-list conditional", () => {
    expect(
      FIELD_LIST_REGION,
      'the empty-changes fallback must test `entry.action === "merged"`. For a merge, an empty diff means the survivor won every field — a correct, expected outcome — and the generic wording reports it as a defect'
    ).toContain('entry.action === "merged"')
  })

  it("keeps BOTH arms, so a replacement fails where a branch passes", () => {
    for (const key of ["mergedNoFieldChanges", "noVisibleChanges"]) {
      expect.soft(
        FIELD_LIST_REGION,
        `the fallback must still reference "${key}". Asserting both arms is what distinguishes a BRANCH from a REPLACEMENT: swapping noVisibleChanges for mergedNoFieldChanges unconditionally would satisfy any single-key assertion while telling every created and updated reader that a record "kept all of its own field values", which is a sentence about a merge that did not happen`
      ).toContain(key)
    }
  })

  it("resolves both keys against the catalog", () => {
    const entry = enUS.audit.entry as Record<string, unknown>

    for (const key of ["mergedNoFieldChanges", "noVisibleChanges"]) {
      expect.soft(
        entry[key],
        `audit.entry.${key} must resolve to a non-empty string in src/messages/en-US.json, or the branch renders a raw dotted path`
      ).toBeTruthy()
    }
  })
})

describe("A-7: the child-count line sits before the field list, not inside it", () => {
  it("appears exactly once in the file", () => {
    expect(
      occurrences(ENTRY, "mergedChildren"),
      'audit.entry.mergedChildren must be referenced exactly once. Twice would mean the line is rendered from two places — the count would appear twice on one entry, which is the "nothing was orphaned" reassurance turning into a reason to doubt it'
    ).toBe(1)
  })

  it("is not inside the field-list conditional", () => {
    expect(
      FIELD_LIST_REGION.includes("mergedChildren"),
      "the child-count line must sit OUTSIDE the field-list conditional. Inside it the count becomes a row in the <dl> and a member of the array `hiddenFieldCount` is derived from — 45-06 recorded that a change which renders in that list must be a change, or the 'show N more' count stops telling the truth. It is a fact about the merge, not a field whose value moved"
    ).toBe(false)
  })

  it("is gated on the merged action and reads the hydrated count", () => {
    // The count line's own JSX expression container, extracted so the assertions below are about
    // that line rather than about anything else in the component.
    const countLine = braceBlockAt(ENTRY, '{entry.action === "merged" ? (')

    expect(
      countLine.length,
      'the child-count line must be extractable by brace matching from `{entry.action === "merged" ? (`. The two assertions below are scoped to it'
    ).toBeGreaterThan(0)

    expect(
      countLine,
      'the line must read `entry.mergedChildCount`, the field the audit source hydrates from the __mergedChildren marker. The marker is written on both sides of a merge and means the same thing on both'
    ).toContain("entry.mergedChildCount")

    expect(
      countLine,
      "the line must carry `text-muted-foreground` and `text-xs` — the Label typography role every field label in this list uses. At value typography the count would read as data about the record rather than as a statement about what the merge did"
    ).toContain("text-muted-foreground")

    expect(countLine, "the line must carry text-xs, the Label typography size").toContain("text-xs")
  })

  it("states the count through an ICU plural rather than a bare number", () => {
    const { mergedChildren } = enUS.audit.entry

    expect(
      mergedChildren,
      "audit.entry.mergedChildren must resolve to a non-empty string in src/messages/en-US.json"
    ).toBeTruthy()

    expect(
      mergedChildren,
      'audit.entry.mergedChildren must be an ICU plural on {count}. "1 linked records moved" is the kind of sentence a reader stops trusting the rest of the timeline over, and English is the least-inflected of the three shipped locales — pt-BR and es-ES need the selector more, not less'
    ).toContain("plural")
  })
})

describe("A-8: nothing here reaches for a new native field label", () => {
  it("adds no audit.field.* key to the component", () => {
    // 45-06 recorded that NATIVE_ORDER is derived from AUDIT_FIELD_LABELS' insertion order and
    // that the index is the display order of native columns in EVERY record timeline in the app.
    // Nothing in the merge needs a new native column label: the merge's diff is ordinary columns
    // and its own facts are markers, which are filtered out upstream (AUDIT_MARKER_PREFIX).
    for (const forbidden of ["audit.field.merged", "audit.field.mergedFrom"]) {
      expect.soft(
        ENTRY.includes(forbidden),
        `audit-entry.tsx must not reference "${forbidden}". A merge-specific field label would need an entry in AUDIT_FIELD_LABELS, and adding a key there reorders the native field list of every record timeline in the app`
      ).toBe(false)
    }
  })
})
