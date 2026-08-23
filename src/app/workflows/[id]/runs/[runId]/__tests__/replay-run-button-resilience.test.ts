/**
 * WR-04 — THE REPLAY BUTTON SURVIVES A *REJECTED* SERVER ACTION, not just a refused one.
 *
 * `replayWorkflowRun` returns `{ success: false, error }` for a refusal it can see. It REJECTS for
 * everything else: a container restart, a DB outage, a proxy hiccup, a deploy. A `{ success }` check
 * cannot see that case at all, and without a `catch` the operator watched a dialog do visibly
 * nothing — the transition ended and re-enabled the buttons, so nothing was wedged, but nothing was
 * said either, and they had no way to tell whether a run had started.
 *
 * WHY A SOURCE SCAN. Same reason as its sibling `replay-visibility.test.ts`: this repo has no jsdom,
 * no `@testing-library/react` and no `@vitejs/plugin-react`, by construction (41-RESEARCH C-1), so a
 * client component's wiring is asserted by reading its source or not at all. This test therefore
 * MOUNTS NOTHING and PROVES NO BEHAVIOUR — it asserts that the recovery path is present and that it
 * tells the operator something.
 *
 * `readStrippedSource`, never `readFileSync`: this file's own subject has a header that names
 * `AlertTriangle`, `variant="destructive"`, `AlertDialog` and `closeLabel` while explaining why it
 * omits each one, so a raw read lets PROSE satisfy a gate about CODE.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const BUTTON = "src/app/workflows/[id]/runs/[runId]/components/replay-run-button.tsx"

const source = readStrippedSource(BUTTON)

describe("replay-run-button.tsx — a rejected replay is reported, not swallowed", () => {
  it("the source is this component, read and stripped (anti-vacuity)", () => {
    expect(source.length, `${BUTTON}: read empty.`).toBeGreaterThan(0)
    expect(source, `${BUTTON}: not the replay button.`).toContain("export function ReplayRunButton")
    expect(
      source,
      `${BUTTON}: the stripper is load-bearing here — the header prose names AlertTriangle and ` +
        `variant="destructive" while explaining why the file omits them. If either survived the ` +
        `strip, every assertion in this file could be satisfied by a comment.`
    ).not.toContain("AlertTriangle")
  })

  it("wraps the action call in a try/catch", () => {
    const callAt = source.indexOf("await replayWorkflowRun")
    expect(callAt, `${BUTTON}: must call replayWorkflowRun.`).toBeGreaterThan(-1)

    const tryAt = source.lastIndexOf("try {", callAt)
    expect(
      tryAt,
      `${BUTTON}: a server action REJECTS on a transport-level failure rather than returning ` +
        `{ success: false }, and a "if (!result.success)" check cannot see that. Without a catch ` +
        `the operator is left staring at a dialog that did nothing, with no way to tell whether a ` +
        `run started.`
    ).toBeGreaterThan(-1)

    expect(
      source.indexOf("} catch", callAt),
      `${BUTTON}: no catch follows the action call.`
    ).toBeGreaterThan(-1)
  })

  it("tells the operator, reusing the same failure copy as a returned refusal", () => {
    const catchAt = source.indexOf("} catch", source.indexOf("await replayWorkflowRun"))
    // Bounded by the marker that resumes the normal path, so the success branch's own
    // `setOpen(false)` cannot be mistaken for one in the recovery path. Both markers are asserted,
    // so an unrecognised shape fails loudly instead of scoping the negative to nothing.
    const resumesAt = source.indexOf("if (!result.success)", catchAt)
    expect(catchAt, `${BUTTON}: no catch after the action call.`).toBeGreaterThan(-1)
    expect(
      resumesAt,
      `${BUTTON}: the returned-refusal branch must still follow the catch — a rejection and a ` +
        `refusal are different failures and both must be handled.`
    ).toBeGreaterThan(catchAt)

    const recovery = source.slice(catchAt, resumesAt)
    expect(recovery.length).toBeGreaterThan(0)

    expect(
      recovery,
      `${BUTTON}: the catch must surface replay.error. Their next action is identical whether the ` +
        `action refused or never arrived, so a second string would be a distinction without a ` +
        `difference — and the locale contract is TOTAL, so inventing one is not free.`
    ).toContain("replay.error")

    expect(
      recovery,
      `${BUTTON}: the dialog must STAY OPEN on failure — no setOpen(false) in the recovery path. ` +
        `Closing it discards the operator's context for a retry and the consequence copy they just ` +
        `read.`
    ).not.toContain("setOpen(false)")
  })
})
