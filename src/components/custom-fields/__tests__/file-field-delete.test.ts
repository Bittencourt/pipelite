/**
 * =============================================================================
 * file-field-delete.test.ts — CR-03: a failed storage DELETE must not drop the descriptor
 * =============================================================================
 *
 * ## The defect
 *
 * `handleDelete` did `await fetch(file.publicUrl, { method: 'DELETE' })` and threw the response
 * away — no `res.ok`, no `catch` that aborts — then removed the descriptor from local state and
 * called `onSave`, which `POST`s `/api/custom-fields/save` and rewrites the record's `customFields`
 * without it. `saveFieldValues` accepts that write (no owner term), so the bytes stay at
 * `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}` and THE ONLY RECORD THAT NAMED THEM NO
 * LONGER DOES.
 *
 * That blob is then unreachable by every path in the product, permanently:
 *
 *   - the file route cannot serve it — `recordReferencesStoredName` no longer matches;
 *   - the `DELETE` verb cannot remove it — same match, same refusal;
 *   - `collectFileFieldRefs` cannot see it at purge time, so it survives the record's own permanent
 *     deletion with `deleted === expected` and NO mismatch log.
 *
 * Which is precisely the "the blob outlives both its row and its definition and nothing ever names
 * it again" failure `collect-file-field-refs.ts:20-29` says the phase exists to close — re-created
 * by the phase's own owner-scoped guard plus an un-updated client.
 *
 * The 404 is reachable today by an ordinary user: the four detail pages carry NO owner term
 * (`deals/[id]/page.tsx:57` and its three siblings), so any authenticated caller renders the file
 * field for any record, while `findOwnedRecordById` refuses a record they do not own. The uploader
 * hits it too, after a BULK-03 owner reassign.
 *
 * ## WHY THIS IS A SOURCE-READ GATE
 *
 * `file-field.tsx` is a `'use client'` React component and this repo runs vitest with
 * `environment: 'node'` and NO jsdom — rendering it would mean installing jsdom plus a testing
 * library to test a four-line guard. The established precedent is the sibling
 * `custom-fields-section.test.ts`, whose header states the same constraint for the same component
 * family, and `client-formula-bounds.test.ts` / `entity-attributes-parity.test.ts` beside it.
 *
 * COMMENTS ARE STRIPPED, via the shared `./source-scan`. That is the whole reason a source gate can
 * be trusted here at all: fifteen gates in this project have gone green by matching their own
 * explanatory prose, and the paragraph above would satisfy a naive `toContain('res.ok')`. The
 * describe below carries its own decoy proving the stripping is live.
 *
 * AND THE LOAD-BEARING ASSERTION IS AN ORDERING, NOT A PRESENCE. `expect(body).toContain('res.ok')`
 * would be satisfied by a guard that logs and falls through — which is the defect with a log line
 * added. What has to be true is that the refusal path LEAVES `handleDelete` before the two
 * statements that drop the reference, so the assertions compare POSITIONS of `return`, `setFiles(`
 * and `onSave(` inside the extracted function body.
 * =============================================================================
 */
import { describe, it, expect } from "vitest"

import { readStrippedSource, stripComments } from "./source-scan"

const FIELD = "src/components/custom-fields/file-field.tsx"

/** Comment-stripped source of the component under test. */
function fieldSource(): string {
  return readStrippedSource(FIELD)
}

/**
 * The body text of `handleDelete`, extracted by brace matching from its declaration.
 *
 * Anchored on the declaration rather than on "the first `fetch` with method DELETE", so a future
 * second delete path elsewhere in the file cannot make this gate read the wrong function — and so
 * a `handleDelete` that was RENAMED fails loudly here instead of silently scanning nothing.
 */
function handleDeleteBody(): string {
  const source = fieldSource()
  const at = source.search(/const\s+handleDelete\s*=/)

  expect(
    at,
    `no \`const handleDelete =\` in ${FIELD} — did it get renamed? This gate cannot scope itself ` +
      "to a function it cannot find, and a gate scanning the whole file would be satisfied by any " +
      "`res.ok` anywhere in it, including `handleUpload`'s.",
  ).toBeGreaterThan(-1)

  const open = source.indexOf("{", source.indexOf("=>", at))
  expect(open, "no opening brace for handleDelete's body").toBeGreaterThan(-1)

  let depth = 1
  let i = open + 1
  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === "{") depth += 1
    else if (ch === "}") depth -= 1
    i += 1
  }
  expect(depth, "unterminated handleDelete body").toBe(0)

  return source.slice(open + 1, i - 1)
}

describe("CR-03 — file-field.tsx's handleDelete must not drop the descriptor on a failed DELETE", () => {
  it("assigns the DELETE response instead of discarding it", () => {
    const body = handleDeleteBody()

    // EVERY `fetch(` in this function must be bound to a name, expressed as: there is exactly one
    // `fetch(` and it is the assigned one. Stated that way rather than as a negative regex over
    // "an `await fetch` not preceded by `=`" — the first form of this cell was exactly that, and
    // it stayed red against the FIXED code because `= await fetch` also has a non-`=` character
    // immediately before `await`. A regex that cannot pass correct code is as useless as one that
    // cannot fail incorrect code.
    const fetches = body.match(/\bfetch\(/g) ?? []
    expect(
      fetches,
      "handleDelete makes no fetch call at all — has the storage delete moved elsewhere?",
    ).toHaveLength(1)

    expect(
      body,
      "the DELETE response is discarded. Nothing downstream can tell a 404 from a 200, so the " +
        "descriptor is removed either way and the bytes become permanently unreferenced.",
    ).toMatch(/(const|let)\s+\w+\s*=\s*await\s+fetch\(\s*file\.publicUrl/)
  })

  it("inspects `.ok` on that response", () => {
    const body = handleDeleteBody()

    // `handleUpload` in the same file already does exactly this (`if (!res.ok) { … throw … }`), so
    // `handleDelete` was the odd one out in its own component.
    expect(body).toMatch(/\.ok\b/)
  })

  /**
   * THE LOAD-BEARING CELL. Presence of a `.ok` check proves nothing: a guard that logs the status
   * and falls through is the original defect with a log line bolted on, and it would satisfy every
   * other cell in this file.
   *
   * WHAT MUST BE TRUE is that the refusal path leaves the function before either statement that
   * drops the reference — so this compares POSITIONS.
   *
   * AND THE FIRST FORM OF THIS CELL WAS UNFALSIFIABLE, which is recorded here rather than quietly
   * repaired. It read "the first `return` in the body comes before the first `setFiles(`", and it
   * was GREEN against the unfixed component: `handleDelete` already opens with
   * `if (!file) return` and `if (!confirm(…)) return`, both of which precede `setFiles` and neither
   * of which has anything to do with a failed storage delete. Three of this file's five cells
   * reddened before the fix; that one did not, and it was the only one asserting the property that
   * actually matters.
   *
   * So the search is ANCHORED ON THE `.ok` GUARD: the `return` must be one that appears AFTER the
   * response is inspected. A `return` belonging to an earlier, unrelated guard can no longer
   * satisfy it.
   */
  it("RETURNS out of handleDelete after inspecting .ok and before setFiles / onSave", () => {
    const body = handleDeleteBody()

    const okAt = body.search(/\.ok\b/)
    const firstSetFiles = body.indexOf("setFiles(")
    const firstOnSave = body.indexOf("onSave(")

    // Anchors. Without them a renamed `setFiles` would make `indexOf` return -1 and every
    // comparison below trivially true.
    expect(firstSetFiles, "no setFiles( call in handleDelete — has it moved?").toBeGreaterThan(-1)
    expect(firstOnSave, "no onSave( call in handleDelete — has it moved?").toBeGreaterThan(-1)
    expect(
      okAt,
      "handleDelete never inspects the DELETE response, so there is nothing for a refusal path to " +
        "branch on.",
    ).toBeGreaterThan(-1)

    // The `.ok` guard has to be READ before the descriptor is dropped, not after it.
    expect(
      okAt,
      "the response is inspected only AFTER the descriptor has already been removed and saved.",
    ).toBeLessThan(firstSetFiles)

    // THE ASSERTION. A `return` between the `.ok` inspection and the drop. `indexOf` from `okAt`
    // is what excludes the two pre-existing guards at the top of the function.
    const returnAfterOk = body.slice(okAt).search(/\breturn\b/)
    expect(
      returnAfterOk,
      "there is no `return` anywhere after the response is inspected, so the refusal path falls " +
        "through and the descriptor is dropped regardless. A failed storage DELETE then leaves " +
        "bytes that no route can serve, no verb can delete and no purge can ever collect.",
    ).toBeGreaterThan(-1)

    expect(
      okAt + returnAfterOk,
      "the `return` after the `.ok` inspection comes too late — the descriptor has already been " +
        "dropped by the time it is reached.",
    ).toBeLessThan(firstSetFiles)
    expect(okAt + returnAfterOk).toBeLessThan(firstOnSave)
  })

  it("logs the refusal through @/lib/log rather than only alerting", () => {
    const body = handleDeleteBody()

    // T-42-51/T-42-52 posture: the component already imports `log` (legal in a "use client" file
    // only because `@/lib/log` has zero imports) and already uses it in `handleUpload`'s catch. A
    // refusal the server never hears about is a support ticket with no evidence behind it.
    expect(body).toMatch(/log\.error\(/)
  })

  it("DECOY: the gate reads code, not prose — a commented-out guard satisfies nothing", () => {
    // If `stripComments` were not applied, this string would satisfy the ordering cell above.
    const pretend = stripComments(`
      const handleDelete = async (fileId: string) => {
        // const res = await fetch(file.publicUrl, { method: 'DELETE' })
        // if (!res.ok) { log.error('x','y'); return }
        setFiles([])
        await onSave(null)
      }
    `)

    expect(pretend).not.toContain("res.ok")
    expect(pretend).not.toContain("log.error")
    expect(pretend).toContain("setFiles([])")
  })
})
