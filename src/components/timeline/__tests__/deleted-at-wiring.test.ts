/**
 * The wiring gate for the timeline's soft-delete row (45-06, S-6).
 *
 * WHAT THIS DEFENDS. `deletedAt` is audited but has no entry in `AUDIT_FIELD_LABELS`, so
 * `describeField` fell through to `humaniseColumn` and the record timeline printed the database
 * column name "Deleted at" beside an unformatted ISO instant — a raw identifier, shown to a user,
 * sitting immediately beside a delete entry that already reads as a proper sentence. The fix is a
 * direction branch in `audit-entry.tsx`, because a `deleted_at` transition has TWO directions and
 * `AUDIT_FIELD_LABELS` maps one column to exactly one message key.
 *
 * WHY A SOURCE GATE. This repo renders NO client components in tests — no jsdom, no happy-dom, no
 * testing library — and adding one is a dependency decision belonging to a phase willing to own it.
 * The half of this change that CAN live in a pure function does: `deletedAt`'s value typing is unit
 * tested directly in `src/lib/audit/present.test.ts`, against the real `buildAuditFieldChanges`.
 * What is left is a render decision inside a `"use client"` module, and its only honest proof at
 * this layer is that it is still written down. The rendered sentence is confirmed by 45-11's
 * browser walk.
 *
 * COMMENT-BLINDNESS, AND THE ONE DELIBERATE EXCEPTION. Both sources are read through the shared
 * `readStrippedSource` helper, which removes line and block comments in a string-aware pass before
 * any assertion runs — phases 37-38 lost fifteen gate runs to a doc comment satisfying, or
 * breaking, a gate that searched raw file text. The exception is the UNREACHABLE assertion below:
 * that string only ever existed IN a comment, so asserting its absence in stripped source would be
 * vacuously true forever. That one assertion reads the raw file, and says so at the call site.
 *
 * FOUR ANTI-VACUITY REQUIREMENTS, all met below:
 *
 *   1. Prove the files were read. A helper that silently returned "" satisfies every negative
 *      assertion in this file perfectly. Hence the non-empty assertions FIRST.
 *   2. Prove they are the RIGHT files, via known positive markers — `AuditFieldRow` in the entry,
 *      `AUDIT_FIELD_LABELS` in the presenter — before any negative runs.
 *   3. Prove the extracted REGIONS are non-empty. Every scoped negative here is asserted against a
 *      brace-matched slice of the file, and an extraction that missed would make them all pass.
 *   4. Prove the forbidden tokens still exist in the file at large. "No ArrowRight in this branch"
 *      must not pass because the arrow was renamed or deleted everywhere.
 *
 * WHY THE NEGATIVES ARE SCOPED TO A REGION AND NOT TO THE FILE. `ArrowRight` and `AuditValueText`
 * are how EVERY other field row draws its before/after pair; a file-wide absence assertion would be
 * asserting that the timeline stopped showing field changes, which is the opposite of the contract.
 * The mechanism chosen is brace matching from the branch's `if` — the same string-aware technique
 * `callArguments` in `source-scan.ts` uses on parentheses — rather than a proximity window, because
 * a character-count window silently stops covering the branch the moment a comment or a prop is
 * added inside it, and it would do so without failing.
 */
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import enUS from "@/messages/en-US.json"

const ENTRY_PATH = "src/components/timeline/audit-entry.tsx"
const PRESENT_PATH = "src/lib/audit/present.ts"

const ENTRY = readStrippedSource(ENTRY_PATH)
const PRESENT = readStrippedSource(PRESENT_PATH)

/** The one raw read in this file. See the header: the claim under test lived only in a comment. */
const PRESENT_RAW = readFileSync(PRESENT_PATH, "utf8")

/**
 * The brace-matched body that follows `marker`, quote-aware so a `{` inside a string or a JSX
 * attribute cannot open a level that never closes.
 *
 * Returns "" when the marker is absent, which is why every caller asserts the slice is non-empty
 * before asserting anything about its contents (anti-vacuity 3).
 */
function blockAfter(source: string, marker: string): string {
  const at = source.indexOf(marker)
  if (at === -1) return ""

  let i = source.indexOf("{", at + marker.length)
  if (i === -1) return ""

  const start = i
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

/** The row-level branch: everything the soft-delete row is allowed to render. */
const ROW_BRANCH = blockAfter(ENTRY, "change.field === DELETED_AT_COLUMN")

/** The direction decision: which of the two sentences a given from/to pair asks for. */
const DIRECTION_FN = blockAfter(ENTRY, "function deletedAtDirectionKey")

/**
 * The two message keys 45-01 checked into all three locale files for this row.
 *
 * Asserted against the imported catalog rather than against a hand-copied string, so a key that
 * exists in the component and nowhere else fails here instead of rendering as a raw dotted path in
 * the browser. `locale-parity.test.ts` compares the three locales to EACH OTHER and would not
 * notice a key that no component ever asks for; this is the other half of that contract.
 */
const DIRECTION_KEYS = ["movedToTrash", "restoredFromTrash"]

/**
 * What the arrow-less row must NOT contain, scoped to `ROW_BRANCH`.
 *
 * Each of these is legitimate — and required — in the general field row directly below it, which
 * is exactly why the assertion is regional. `AuditValueText` would print the stored instant a
 * second time (the entry header already carries when), `ArrowRight` would draw a direction the
 * sentence already states in words, and a `<dd>` would reintroduce the value cell the row exists
 * to remove.
 */
const FORBIDDEN_IN_ROW = ["ArrowRight", "AuditValueText", "<dd", "format.dateTime", "value.changedTo"]

describe("the gate reads the right sources", () => {
  it("read both sources", () => {
    for (const [path, source] of [
      [ENTRY_PATH, ENTRY],
      [PRESENT_PATH, PRESENT],
      [`${PRESENT_PATH} (raw)`, PRESENT_RAW],
    ] as [string, string][]) {
      expect(
        source.length,
        `${path} must have been read: a helper returning an empty string would satisfy every negative assertion in this file perfectly`
      ).toBeGreaterThan(0)
    }
  })

  it("found the field row in the entry and the label map in the presenter", () => {
    expect(
      ENTRY,
      "audit-entry.tsx must still declare AuditFieldRow. If the field row moves to another module this gate must go RED and be rewritten, not keep passing over a file that no longer renders a field"
    ).toContain("AuditFieldRow")

    expect(
      PRESENT,
      "present.ts must still declare AUDIT_FIELD_LABELS. Every claim below about where the direction decision does NOT live is a claim about that map"
    ).toContain("AUDIT_FIELD_LABELS")
  })

  it("extracted both regions it scopes its negatives to", () => {
    expect(
      ROW_BRANCH.length,
      'the deletedAt row branch must be extractable by brace matching from `change.field === DELETED_AT_COLUMN`. Every negative assertion about the row is scoped to this slice, so a failed extraction would make all of them pass over nothing'
    ).toBeGreaterThan(0)

    expect(
      DIRECTION_FN.length,
      "the deletedAtDirectionKey function body must be extractable by brace matching. The two message keys are asserted inside it, so a failed extraction would leave the direction decision unasserted"
    ).toBeGreaterThan(0)
  })

  it("finds every token it forbids in the row still alive elsewhere in the file", () => {
    // ANTI-VACUITY 4. "Absent from the branch" is only a fact about the branch if the token is
    // present in the file — otherwise deleting the arrow app-wide would turn this gate green.
    for (const token of FORBIDDEN_IN_ROW) {
      expect(
        ENTRY,
        `audit-entry.tsx must still contain "${token}" somewhere: it is how the ORDINARY field row draws its before/after pair, and the assertions below claim only that the soft-delete row does not reach for it. If it has left the file, the arrow-less claim is vacuous and the general row has regressed`
      ).toContain(token)
    }
  })
})

describe("the soft-delete row says which direction the change went", () => {
  it("branches on the column before it reaches the general label path", () => {
    expect(
      ENTRY,
      'audit-entry.tsx must branch on `change.field === DELETED_AT_COLUMN`. Without it the row falls through to `humaniseColumn`, which sentence-cases the column name — that is the literal defect S-6 exists to remove'
    ).toContain("change.field === DELETED_AT_COLUMN")

    expect(
      ENTRY,
      'the branch must key off the real column name: `const DELETED_AT_COLUMN = "deletedAt"`. A renamed constant pointing at a different string would leave the fallback path live while this gate went green'
    ).toContain('const DELETED_AT_COLUMN = "deletedAt"')
  })

  it("chooses between the two sentences from the from/to pair", () => {
    for (const key of DIRECTION_KEYS) {
      expect.soft(
        DIRECTION_FN,
        `deletedAtDirectionKey must return audit.field.${key}. Both directions are needed and 45-01 checked both into all three locale files for exactly that reason: a value APPEARING in deleted_at is a soft delete and a value being CLEARED is a restore, and collapsing them to one sentence tells half the readers the opposite of what happened`
      ).toContain(`audit.field.${key}`)
    }
  })

  it("reads the pair's emptiness rather than guessing from one side", () => {
    expect(
      DIRECTION_FN,
      'the direction must be decided from both sides\' `type !== "empty"`. `change.to` is never null (only `change.from` is, and only on a create), so testing `=== null` on the `to` side would be dead code and every restore would be labelled a deletion'
    ).toContain('type !== "empty"')

    expect(
      DIRECTION_FN,
      "the function must return null for a pair that states no direction. A create records deleted_at against a row that did not exist, so both sides are empty and neither sentence is true of it"
    ).toContain("return null")
  })

  it("renders one line at the Label typography role", () => {
    expect(
      ROW_BRANCH,
      "the row must render a <dt> — the sentence occupies the term position, the same slot the field label occupies in every other row, which is what keeps the shared timeline skeleton intact"
    ).toContain("<dt")

    expect(
      ROW_BRANCH,
      'the sentence must carry `text-muted-foreground text-xs`, the Label typography role every other field label in this list uses. A sentence at value typography would read as data rather than as a statement about the record'
    ).toContain("text-muted-foreground text-xs")
  })

  it("resolves the key by the file's own namespace-slicing convention", () => {
    expect(
      ROW_BRANCH,
      'the branch must slice MESSAGE_NAMESPACE_PREFIX off the stored key before calling t(), exactly as the general label path does. `t` is useTranslations("audit"), so passing the full "audit.field.movedToTrash" would look up "audit.audit.field.movedToTrash" and print a raw dotted path'
    ).toContain("MESSAGE_NAMESPACE_PREFIX.length")
  })

  it("shows no arrow, no stored value and no second timestamp", () => {
    for (const token of FORBIDDEN_IN_ROW) {
      expect.soft(
        ROW_BRANCH.includes(token),
        `the soft-delete row must not contain "${token}". This is asserted against the BRACE-MATCHED branch, never against the whole file: the arrow and the value cell are how every other field row works and a file-wide absence assertion would be demanding that the timeline stop showing field changes at all. The row states a completed fact in one sentence; the entry header already carries who and when, and the stored deleted_at value IS that same instant`
      ).toBe(false)
    }
  })

  it("drops a directionless row from the entry's own field list, not just from the row", () => {
    expect(
      ENTRY,
      "AuditEntry must filter changes whose deletedAtDirectionKey is null before it counts them. The row itself returning null is not enough: `hiddenFieldCount` is derived from the array length, so an invisible row would promise 'show 1 more' and then produce nothing — and the defensive empty-list branch would never fire for an entry whose only change is one of these"
    ).toContain("deletedAtDirectionKey(change) !== null")
  })
})

describe("the redundant row is suppressed where the entry already says it", () => {
  it("draws no field list at all for a delete", () => {
    expect(
      ENTRY,
      'AuditEntry must render no field list when `entry.action === "deleted"`. That is what makes the UI-SPEC\'s suppression rule structural: beside "deleted this deal" a soft-delete row is pure redundancy, and the branch already existed — this plan must not weaken it into a per-field decision'
    ).toContain('entry.action === "deleted" ? null')

    expect(
      PRESENT,
      'buildAuditFieldChanges must still return [] for the deleted action. The suppression is enforced in the pure layer as well as in the renderer, so no consumer of this presenter can reintroduce the row'
    ).toContain('if (action === "deleted") return []')
  })
})

describe("the presenter classifies the column but claims no direction", () => {
  it("adds deletedAt to the date columns", () => {
    expect(
      PRESENT,
      'present.ts must contain `deletedAt: true` in DATE_COLUMNS. Defence in depth: nativeKind returns "date" for anything in that set, so any future path that DOES render the value formats it in the viewer\'s locale instead of printing the stored ISO instant. `true` and not `false` — the moment of a deletion without its time of day is not a useful fact'
    ).toContain("deletedAt: true")
  })

  it("gives deletedAt no entry in the label map", () => {
    expect(
      PRESENT.includes('deletedAt: "audit.field.'),
      "deletedAt must NOT be added to AUDIT_FIELD_LABELS. One column maps to one key there and describeField never sees the from/to pair, so an entry could only ever state one of the two directions — and it would take a rank in NATIVE_ORDER, whose insertion order is the display order of native fields in every record timeline"
    ).toBe(false)
  })

  it("no longer documents the fallback as unreachable", () => {
    // RAW, deliberately. This string only ever lived inside a doc comment, so asserting its
    // absence in comment-stripped source would be vacuously true for all time — the one case in
    // this file where the stripped read is the wrong instrument.
    expect(
      PRESENT_RAW.includes("THIS PATH SHOULD BE UNREACHABLE"),
      "present.ts must not claim the unmapped-column fallback is unreachable. deletedAt reaches it, and the claim is why a raw database identifier shipped to users for three phases. The rule in this repo is to REWORD a stale justification, never to delete it: the corrected comment must still explain what the fallback is for"
    ).toBe(false)

    expect(
      PRESENT_RAW,
      "the corrected comment must point at audit-entry.tsx, where the soft-delete sentence is actually chosen. Without the pointer the next reader repeats the search that produced the false claim"
    ).toContain("audit-entry.tsx")
  })
})

describe("neither file can produce the column name or a raw instant", () => {
  it("contains the humanised column name nowhere", () => {
    for (const [path, source] of [
      [ENTRY_PATH, ENTRY],
      [PRESENT_PATH, PRESENT],
    ] as [string, string][]) {
      expect(
        source.includes("Deleted at"),
        `${path} must not contain the string "Deleted at". It is a database identifier, it is in one language, and its presence anywhere in these two files would mean a path still exists that shows it to a user`
      ).toBe(false)
    }
  })

  it("keeps both sentences in the catalog rather than in the component", () => {
    const fieldCopy = enUS.audit.field as Record<string, string | undefined>

    for (const key of DIRECTION_KEYS) {
      expect.soft(
        fieldCopy[key],
        `audit.field.${key} must resolve to a non-empty string in src/messages/en-US.json. A key the component asks for and the catalog does not have renders as the raw dotted path in the browser, and nothing else catches it: the compiler cannot, and locale-parity.test.ts compares the three locale files to EACH OTHER rather than to the component's call sites`
      ).toBeTruthy()
    }
  })

  it("hardcodes neither sentence in the component", () => {
    for (const sentence of ["Moved to Trash", "Restored from Trash"]) {
      expect(
        ENTRY.includes(sentence),
        `audit-entry.tsx must not contain the literal "${sentence}". Every user-visible string on this surface comes from the catalog through next-intl; an English literal here reads as English to the pt-BR and es-ES readers this phase exists to serve`
      ).toBe(false)
    }
  })
})
