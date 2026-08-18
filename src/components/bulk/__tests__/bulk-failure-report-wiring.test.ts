/**
 * The wiring gate for the per-record failure report.
 *
 * EVERY ASSERTION HERE IS COMMENT-BLIND BY CONSTRUCTION. All three sources are read through the
 * shared `readStrippedSource` helper, which removes line and block comments in a string-aware pass
 * before a single assertion runs. That is not tidiness. Most of what follows is a NEGATIVE assertion,
 * and a negative source assertion is trivially satisfied — or trivially broken — by prose: a doc
 * comment that merely names the token it forbids invalidates its own gate. Phase 37 lost nine gate
 * runs to exactly that collision, and phases 37-38 have now hit it eleven times in total.
 *
 * THE CORRECT RESPONSE TO A COLLISION IS TO REWORD THE COMMENT, NEVER TO WEAKEN THE GATE. Loosening
 * a pattern, adding an exception, or deleting an assertion converts a real constraint into
 * decoration, which is the bug both of this repo's earlier source-gate analogs shipped.
 *
 * This repo renders NO client components in tests — no jsdom, no happy-dom, no testing library, and
 * adding one is a dependency decision belonging to a phase willing to own it. So the decisions in
 * `bulk-failure-report.tsx` that have no pure-function home — the uncapped scrolling list, the
 * absence of any self-dismissal, the closed-set reason lookup, the local weight fix instead of a
 * patch to the shared primitive — are pinned here at the source level, and the rendered result is
 * verified by this phase's browser UAT.
 *
 * THREE ANTI-VACUITY REQUIREMENTS, all met below, because a gate without them is a string that
 * happens to be absent:
 *
 *   1. Prove the files were found and read. A helper that silently returned "" would satisfy every
 *      negative assertion in this file perfectly. Hence the non-empty assertions FIRST.
 *   2. Prove it is the RIGHT file, by asserting known POSITIVE markers before any negative. If the
 *      report stops being an alert region with a description, this gate must go RED and be
 *      reconsidered rather than keep passing over a file that no longer reports anything.
 *   3. A gate for the gate: two vocabulary tables, one pinning what must be PRESENT and one pinning
 *      what must be LEFT ALONE, each iterated, so a newly introduced idiom cannot sail through
 *      unasserted.
 *
 * The most valuable assertion in the file is the REASON COVERAGE one. Every other rule here protects
 * a layout decision; that one protects a runtime failure mode with no other detector — a fifth
 * member added to the reason union without a copy key renders as a raw key path in the browser, and
 * neither the compiler nor the locale-parity gate would notice, because the parity gate compares the
 * three locale files to each other rather than to the union.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import enUS from "@/messages/en-US.json"

const REPORT = readStrippedSource("src/components/bulk/bulk-failure-report.tsx")
const ALERT_PRIMITIVE = readStrippedSource("src/components/ui/alert.tsx")
const BULK_TYPES = readStrippedSource("src/lib/bulk/types.ts")

/** Every colour the UI contract forbids on these surfaces, plus any raw hex literal. */
const FORBIDDEN_COLOURS = [
  "text-red-",
  "text-green-",
  "bg-red-",
  "bg-green-",
  "bg-white",
  "text-black",
]
const HEX_LITERAL = /#[0-9a-fA-F]{3,6}/

/** A button that does not name its object, per the copy contract. */
const BARE_LABELS = [">Save<", ">Cancel<", ">Confirm<", ">OK<", ">Yes<", ">Apply<"]

/** Reaching for a shared generic label is how a bare "Confirm" button gets shipped. */
const SHARED_LABEL_KEYS = /tCommon|common\.(cancel|delete|confirm|save)/

/** The first non-comment token of a client module. */
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/

/** Truncating the list in either of the two spellings a cap normally takes. */
const CAP_IDIOM = /\.slice\(|andMore|and \d+ (?:more|others)/

/** Anything that would make the report disappear without the user asking. */
const SELF_DISMISSAL = /setTimeout|setInterval/

/**
 * The declaration of the reason union in the types module, and its members.
 *
 * Extracted at module scope so the arity tripwire and the copy-key coverage assertion are SEPARATE
 * tests over the same list. That separation is deliberate: were the two folded into one test, adding
 * a fifth member would trip the arity assertion first and the failure message would report only a
 * count, never naming the key that has no copy — which is the one piece of information the person
 * who widened the union needs.
 */
const REASON_DECLARATION = /export type BulkFailureReason\s*=\s*([^\n;]+)/.exec(BULK_TYPES)
const REASON_MEMBERS =
  (REASON_DECLARATION?.[1] ?? "").match(/"([^"]+)"/g)?.map((m) => m.slice(1, -1)) ?? []

/**
 * The six copy keys the report is required to render.
 *
 * Three of the six are the mutually exclusive hint branches, and they are listed here rather than
 * only in the branch describe below so that a branch deleted outright — not merely mis-conditioned —
 * still trips the coverage loop.
 */
const FAILURE_KEYS = [
  "failures.deleteTitle",
  "failures.reassignTitle",
  "failures.retryHint",
  "failures.retryHintPartial",
  "failures.prunedHint",
  "failures.dismiss",
]

/**
 * The three hint sentences, exactly one of which may render for a given outcome.
 *
 * Kept as its own list because the property under test is not "these strings appear somewhere" —
 * it is that each one is reachable only under its own condition, which the branch assertions below
 * pin by requiring both comparison boundaries to be written out.
 */
const HINT_BRANCH_KEYS = [
  "failures.retryHint",
  "failures.retryHintPartial",
  "failures.prunedHint",
]

/**
 * VOCABULARY TABLE 1 — RECOGNISED. What must be PRESENT in the report. Every entry is a decision
 * with no pure-function home, so its only proof is that it is still written down.
 */
const RECOGNISED = [
  'variant="destructive"',
  "AlertTitle",
  "AlertDescription",
  'useTranslations("bulk")',
  "failures.length === 0",
  "max-h-48",
  "overflow-y-auto",
  "font-semibold",
  "reason.${",
  "text-muted-foreground",
  "onDismiss",
]

/**
 * VOCABULARY TABLE 2 — LEFT ALONE. What must be ABSENT. Each entry would break something silently
 * rather than loudly: a truncation is indistinguishable from a swallowed failure, a timer takes the
 * list away before it can be written down, a hand-rolled announcement region double-announces
 * against the one the primitive already provides, a background fill turns an admissible destructive
 * region into a shouting one, and a server-only import breaks the build at the boundary.
 */
const LEFT_ALONE = [
  ".slice(",
  "setTimeout",
  "setInterval",
  "aria-live",
  "bg-destructive",
  "@/lib/bulk/dispatch",
  "@/lib/trash/dispatch",
]

const SOURCES: [string, string][] = [
  ["bulk-failure-report.tsx", REPORT],
  ["alert.tsx", ALERT_PRIMITIVE],
  ["types.ts", BULK_TYPES],
]

// ANTI-VACUITY 1 AND 2. These run before every negative assertion in this file, deliberately.
describe("the gate reads the right sources", () => {
  it("read all three sources", () => {
    for (const [name, source] of SOURCES) {
      expect(
        source.length,
        `${name} must have been read: a helper returning an empty string would satisfy every negative assertion in this file perfectly`
      ).toBeGreaterThan(0)
    }
  })

  it("found the report inside the alert primitive, as an unfilled destructive region", () => {
    expect(
      REPORT,
      'bulk-failure-report.tsx must render Alert with variant="destructive". If the report moves to another primitive this gate must go red and be reconsidered, not keep passing over a file that no longer reports anything'
    ).toContain('variant="destructive"')

    expect(
      REPORT,
      "the failure list must live inside AlertDescription — the primitive indents everything after its icon, and a list outside the description loses that indent and the description's own text sizing"
    ).toContain("AlertDescription")
  })
})

describe("the report sits on the client side of the RSC boundary", () => {
  it("opens with the 'use client' directive", () => {
    expect(
      CLIENT_DIRECTIVE.test(REPORT),
      "bulk-failure-report.tsx must open with the 'use client' directive: it calls useTranslations and owns a click handler, neither of which exists on the server side"
    ).toBe(true)
  })

  it("reads its copy from the bulk namespace", () => {
    expect(
      REPORT,
      'the report must call useTranslations("bulk"): every string on this surface is in the bulk namespace, added to all three locale files by this phase'
    ).toContain('useTranslations("bulk")')
  })
})

describe("no failure is swallowed", () => {
  it("bounds height with a scrolling box instead of truncating the list", () => {
    expect(
      REPORT,
      "the list must carry max-h-48: without a height bound, forty failures grow the page and push the fixed action bar out of reach"
    ).toContain("max-h-48")

    expect(
      REPORT,
      "the list must carry overflow-y-auto, which is what makes the height bound a SCROLL rather than a clip — every row stays in the DOM and in the accessibility tree"
    ).toContain("overflow-y-auto")
  })

  it("truncates the failure list nowhere", () => {
    expect(
      CAP_IDIOM.test(REPORT),
      "the report must not truncate its list. SC-3 says every per-record failure is NAMED, and a trailing count of the records it left out is exactly the swallowing SC-3 forbids — from the user's side it is indistinguishable from a failure that was never reported. Height is bounded by the scroll box instead"
    ).toBe(false)
  })

  it("returns null for an empty failure array rather than an empty box", () => {
    expect(
      REPORT,
      "the report must early-return on `failures.length === 0` so every caller can mount it unconditionally: with nothing to report this surface is ABSENT, not present-and-blank"
    ).toContain("failures.length === 0")
  })
})

describe("the report never takes itself away", () => {
  it("contains no timer of any kind", () => {
    expect(
      SELF_DISMISSAL.test(REPORT),
      "no timer may appear in this file. A list of records that failed is the one thing on this surface a user may need to write down before acting, so it goes away only when the user presses Dismiss, when the next bulk result replaces it, or when the caller clears the selection"
    ).toBe(false)
  })

  it("offers an explicit dismiss control wired to the caller", () => {
    expect(
      REPORT,
      "the dismiss button must call the onDismiss prop: the report's visibility is caller state, because the same state is cleared by the next bulk action and by clearing the selection"
    ).toContain("onDismiss")
  })

  it("adds no announcement region of its own", () => {
    expect(
      REPORT.includes("aria-live"),
      'the report must not declare its own live region: Alert already hardcodes role="alert", and a second region announces the same text twice'
    ).toBe(false)
  })
})

describe("the destructive region stays unfilled", () => {
  it("adds no background fill", () => {
    expect(
      REPORT.includes("bg-destructive"),
      "the destructive variant deliberately supplies a border and a foreground colour and NO fill, which is what makes a destructive REGION admissible here rather than only a destructive control. A fill turns a report into a shout"
    ).toBe(false)
  })

  it("states the outcome in words as well as colour", () => {
    expect(
      REPORT,
      "each row's reason must render in the muted foreground token as real text. Colour is never the sole carrier of meaning: a user who cannot tell the two themes apart still reads different words and a different count"
    ).toContain("text-muted-foreground")
  })
})

describe("the title's weight is fixed locally, not in the primitive", () => {
  it("adds the heavier weight in the consumer's className", () => {
    expect(
      REPORT,
      "AlertTitle ships at weight 500 while the Label role asks for 600, and the sanctioned resolution is the extra weight class here"
    ).toContain("font-semibold")
  })

  it("leaves the shared alert primitive untouched", () => {
    expect(
      ALERT_PRIMITIVE,
      "alert.tsx's AlertTitle must still carry `font-medium leading-none`. This assertion exists so that a future 'fix' which patches the shared primitive instead of this consumer fails HERE: six other callers depend on that weight, and none of them asked for 600"
    ).toContain("font-medium leading-none")
  })
})

describe("every reason is a code with a copy key, never a server sentence", () => {
  it("looks the reason up dynamically over the closed union", () => {
    expect(
      REPORT,
      "the reason must be rendered through a `reason.` lookup keyed on the failure's own code, with no fallback branch. BulkFailure carries no message field by design (T-38-07): a mutation's refusal string never passes through next-intl and is written for a server log, where naming a table or a constraint is fine and in a browser is not"
    ).toContain("reason.${")
  })

  // expect.soft, so a run names EVERY missing key rather than aborting on the earliest one. Phase 38
  // lost a criterion to exactly this: a looped copy-key check stopped at the first gap, and the one
  // piece of information the reader needed — which keys have no call site — was never printed.
  it("renders all six required copy keys", () => {
    for (const key of FAILURE_KEYS) {
      expect.soft(
        REPORT,
        `the report must render ${key}. All copy on this surface comes from the keys already checked into the three locale files; inventing a string here breaks the locale contract instead of failing a lookup`
      ).toContain(key)
    }
  })

  it("still declares the reason union where this gate reads it", () => {
    expect(
      REASON_DECLARATION,
      "BulkFailureReason must still be declared as a single-line union in src/lib/bulk/types.ts. If its shape changes, this gate must go red and be rewritten rather than silently stop covering anything"
    ).not.toBeNull()

    expect(
      REASON_MEMBERS,
      "the reason union must have exactly four members. The count is pinned separately from the coverage check below so that WIDENING the union trips a tripwire of its own: a fifth reason is a copy decision and a server-action decision, not just a type edit"
    ).toHaveLength(4)
  })

  it("gives every member of the reason union a copy key", () => {
    expect(
      REASON_MEMBERS.length,
      "the member list must be non-empty, or this test would pass by iterating nothing"
    ).toBeGreaterThan(0)

    const reasonCopy = enUS.bulk.reason as Record<string, string | undefined>

    for (const member of REASON_MEMBERS) {
      expect(
        reasonCopy[member],
        `bulk.reason.${member} must exist in src/messages/en-US.json. A reason code with no copy key renders as a raw key path in the browser, and nothing else catches it: the compiler cannot, and the locale-parity gate compares the three locale files to EACH OTHER rather than to this union`
      ).toBeTruthy()
    }
  })
})

/**
 * THE HINT MUST NOT ASSERT A SELECTION STATE THAT IS NOT TRUE.
 *
 * The caller keeps every failed id in `rowSelection`, but its EFFECTIVE selection is that map
 * intersected with the ids still rendered. For the `no longer exists` reason code the failed rows
 * have left the table, so the effective selection is empty: nothing is checked, the bulk bar has
 * unmounted, and a single unconditional "these records are still selected, fix the problem and try
 * again" was still being printed underneath. That is not an artefact of a forced test — it is
 * exactly what happens when another user deletes the records concurrently.
 *
 * The fix is conditional COPY, never a retained selection. Re-selecting the vanished ids to make the
 * old sentence true would reintroduce ids the table cannot render, which is precisely what the prune
 * exists to prevent; it would trade a false sentence for a broken selection. So the report is handed
 * a number and states only what that number supports.
 */
describe("the hint states only what is true about the selection", () => {
  it("is told the surviving count rather than working it out", () => {
    expect(
      REPORT,
      "the report must declare `stillSelected: number` in its props. The caller owns `data`, so the caller owns the intersection of the failed ids with the rows still on screen; handing this component the row array instead would make it recompute a truth it is in the wrong scope to know"
    ).toContain("stillSelected: number")
  })

  it("branches on both boundaries of the surviving count", () => {
    expect(
      REPORT,
      "the report must test `stillSelected === failures.length`: the all-survived case is the ONLY one allowed to keep the original retry sentence, because it is the only one in which every named record can still be acted on"
    ).toContain("stillSelected === failures.length")

    expect(
      REPORT,
      "the report must test `stillSelected === 0`: when nothing survived the prune, 'fix the problem and try again' is advice about records that are no longer there, so the zero case needs a sentence of its own rather than a shared default"
    ).toContain("stillSelected === 0")
  })

  it("passes the surviving count into the partial sentence as an ICU argument", () => {
    expect(
      REPORT,
      "bulk.failures.retryHintPartial is an ICU plural keyed on `count`, so it must be called with `{ count: stillSelected }`. Called without the argument, next-intl prints the raw ICU source at the user"
    ).toContain("{ count: stillSelected }")
  })

  it("keeps all three hint branches present", () => {
    for (const key of HINT_BRANCH_KEYS) {
      expect.soft(
        REPORT,
        `the report must still render ${key}. The three branches are mutually exclusive and jointly exhaustive over the surviving count; deleting one leaves a range of counts with no sentence at all`
      ).toContain(key)
    }
  })

  it("keeps the hint in the muted extra-small paragraph it has always used", () => {
    expect(
      REPORT,
      'the hint must stay inside <p className="text-muted-foreground mt-2 text-xs">. Only the SENTENCE is conditional in this change; the typography role of the line is fixed and is not a branch of it'
    ).toContain('<p className="text-muted-foreground mt-2 text-xs">')
  })
})

describe("the report reaches for no generic label and no off-token colour", () => {
  it("gives its control a label that names what it does", () => {
    for (const label of BARE_LABELS) {
      expect(
        REPORT.includes(label),
        `a bare ${label.slice(1, -1)} button is forbidden here: every control in this phase names its object`
      ).toBe(false)
    }
  })

  it("uses none of the shared generic label keys", () => {
    expect(
      SHARED_LABEL_KEYS.test(REPORT),
      "the report must not reuse common.cancel / common.delete / common.confirm / common.save. Reaching for the shared namespace is exactly how a bare Confirm button gets shipped"
    ).toBe(false)
  })

  it("expresses colour through the design tokens only", () => {
    for (const token of FORBIDDEN_COLOURS) {
      expect(
        REPORT.includes(token),
        `the report must express colour through the design tokens; "${token}" bypasses them and breaks dark mode. The overdue banner in activity-list.tsx is pre-existing token debt and is not the analog to copy`
      ).toBe(false)
    }

    expect(
      HEX_LITERAL.test(REPORT),
      "the report must contain no raw hex colour: every colour on this surface is a CSS variable so both themes are covered"
    ).toBe(false)
  })
})

describe("the report pulls no server-only module across the boundary", () => {
  it("imports neither dispatch module", () => {
    expect(
      REPORT.includes("@/lib/bulk/dispatch") || REPORT.includes("@/lib/trash/dispatch"),
      "the report must import no dispatch module: both are server-only, and importing one from a client module breaks the build at the boundary. It receives its failures as a plain serializable prop"
    ).toBe(false)
  })
})

// ANTI-VACUITY 3. Both vocabulary tables, iterated, so a new idiom cannot sail through unasserted.
describe("the gate's own vocabulary", () => {
  it("finds every RECOGNISED token in the report", () => {
    for (const token of RECOGNISED) {
      expect(
        REPORT,
        `bulk-failure-report.tsx must still contain "${token}". This table is the list of decisions with no pure-function home; a missing entry means the decision was edited out silently`
      ).toContain(token)
    }
  })

  it("finds no LEFT-ALONE token in the report", () => {
    for (const token of LEFT_ALONE) {
      expect(
        REPORT.includes(token),
        `bulk-failure-report.tsx must not contain "${token}". Every entry in this table would break something silently rather than loudly, which is why it is asserted by iteration rather than one test per token`
      ).toBe(false)
    }
  })
})
