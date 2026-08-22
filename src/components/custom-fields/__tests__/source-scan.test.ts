/**
 * Focused tests for `elementRegion`'s tag-depth walker, written for the self-closing-tag bug that
 * plan 40-12 hit and reported rather than patched mid-wave.
 *
 * THE BUG: the walker counted `<div` as an open and only `</div` as a close, so a SELF-CLOSING
 * `<div />` incremented depth with nothing to decrement it. Depth never returned to zero and the
 * whole region threw `unterminated <div> region`. `src/app/deals/kanban-board.tsx` contains exactly
 * that shape — the `<div />` that stands in for the pipeline cluster when `pipelines.length <= 1` —
 * so plan 40-12's gate 8 could not scope its region at all and fell back to offset counting.
 *
 * A PRE-EXISTING CONVENTION THESE TESTS PIN RATHER THAN CHANGE: the returned region ends at the
 * closing tag's NAME, excluding its final `>` — the walker advances by `"</div".length`, which is
 * five characters, not six. Four 40-* gates and several older ones already read regions on that
 * basis, so widening it by one character is a separate change with its own blast radius. It is
 * asserted below so it is a decision on the record instead of an accident.
 *
 * WHAT THESE TESTS ARE NOT: they do not test the JSX semantics of any component, and they measure
 * nothing. They test one walker against synthetic strings small enough to verify by eye, plus the
 * one real file that exposed the defect.
 */
import { describe, expect, it } from "vitest"

import { elementRegion, readStrippedSource } from "./source-scan"

/** The region convention: everything up to and including the closing tag's name, minus its `>`. */
const withoutFinalAngle = (whole: string) => whole.slice(0, -1)

describe("elementRegion — self-closing tags", () => {
  it("does not open a region for a self-closing child of the same name", () => {
    // `<div />` is a complete element. Counting it as an open leaves depth stuck at 1 forever.
    const source = `<div className="row"><div /><span>x</span></div>`

    expect(elementRegion(source, "div")).toBe(withoutFinalAngle(source))
  })

  it("does not open a region for a self-closing child carrying attributes", () => {
    const source = `<div className="row"><div className="spacer" /><b>y</b></div>`

    expect(elementRegion(source, "div")).toBe(withoutFinalAngle(source))
  })

  it("handles a self-closing child written without the space before `/>`", () => {
    const source = `<div className="row"><div className="spacer"/></div>`

    expect(elementRegion(source, "div")).toBe(withoutFinalAngle(source))
  })

  it("returns the tag itself when the ROOT element is self-closing", () => {
    // New behaviour: this used to throw. A self-closing root IS the whole region.
    const source = `<div className="only" />`

    expect(elementRegion(source, "div")).toBe(`<div className="only" />`)
  })

  it("still counts genuinely nested elements of the same name", () => {
    // The regression guard: the fix must not make a real nested `<div>` stop opening a region.
    const source = `<div a><div b>inner</div></div><div c>after</div>`

    expect(elementRegion(source, "div")).toBe(`<div a><div b>inner</div></div`)
  })

  it("counts a mix of nested and self-closing children correctly", () => {
    const source = `<div a><div /><div b>in</div><div /></div><div c>after</div>`

    expect(elementRegion(source, "div")).toBe(`<div a><div /><div b>in</div><div /></div`)
  })

  it("does not treat a `/` inside an attribute STRING as a self-close", () => {
    // `href="a/"` ends in a slash but the tag is still an opening tag; a walker that decided
    // self-closing by a naive "contains /" would under-count and close the region early.
    const source = `<div a><div href="a/" >in</div></div><div c>after</div>`

    expect(elementRegion(source, "div")).toBe(`<div a><div href="a/" >in</div></div`)
  })

  it("does not let a `>` inside a brace expression end a self-closing tag early", () => {
    // The self-close check has to read the END of the real tag, not the first `>` in the source.
    const source = `<div a><div className={n > 2 ? "x" : "y"} /></div><div c>after</div>`

    expect(elementRegion(source, "div")).toBe(`<div a><div className={n > 2 ? "x" : "y"} /></div`)
  })

  it("scopes a region in kanban-board.tsx, the real file that exposed the bug", () => {
    // Before the fix this threw `src/app/deals/kanban-board.tsx: unterminated <div> region`.
    const file = "src/app/deals/kanban-board.tsx"
    const source = readStrippedSource(file)

    const region = elementRegion(source, "div", file)

    expect(region.startsWith("<div")).toBe(true)
    expect(region.endsWith("</div")).toBe(true)
    // The file really does contain the self-closing shape this test exists for.
    expect(/<div\s*\/>/.test(source)).toBe(true)
  })

  it("still throws a self-locating error when a region is genuinely unterminated", () => {
    expect(() => elementRegion(`<div a><span>x</span>`, "div", "some/file.tsx")).toThrow(
      "some/file.tsx: unterminated <div> region"
    )
  })
})
