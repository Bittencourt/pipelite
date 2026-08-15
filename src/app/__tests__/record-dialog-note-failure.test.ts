/**
 * CR-03 — the create dialogs must survive a failed first note with the draft intact.
 *
 * History, because this is the second attempt. The first fix made the note-failure branch
 * `return` instead of calling `handleClose()`, on the premise that the dialog would
 * therefore stay open. It did not: the branch also called the dialog's success callback,
 * and every create-capable call site closed the dialog inside it. `open` went false, the
 * reset-on-open effect fired on the next open, and the user's paste was destroyed exactly
 * as before — while a toast promised "the text is still in the box".
 *
 * The contract that replaced it, and that this file gates:
 *
 *   1. `onRecordSaved` means REFRESH, never CLOSE. Closing is the dialog's own decision,
 *      taken through `onOpenChange(false)`. No call site may close from that callback.
 *   2. The note-failure branch keeps the dialog open: it remembers the record it already
 *      created, reports the failure, refreshes, and returns — without `handleClose()`.
 *   3. The remembered id turns the retry into an UPDATE, so a second submit cannot create
 *      a second record.
 *   4. The remembered id lives in a ref, not state, and the reset-on-open effect bails out
 *      while it is set. A state value would be an effect dependency, so setting it would
 *      re-run the effect and `reset()` away the draft. The same guard also absorbs the
 *      parent re-render that the refresh in (2) triggers — `activity-dialog` in particular
 *      depends on an `activityTypes` array prop whose identity changes on every refresh.
 *   5. Reset semantics, now that the id is finally live: it is cleared on close, on `open`
 *      going false by any other route, and whenever the dialog is pointed at an edit
 *      target, so a create can never silently become an update of an unrelated record.
 *
 * These are source-shape assertions rather than rendered-behaviour ones because this repo
 * has no DOM test environment (both vitest projects run `environment: 'node'`, and there
 * is no @testing-library/react or jsdom to add without a new dependency). The behavioural
 * pass was done in a browser against a sabotaged `addNote`; this file is what stops the
 * contract regressing silently between those passes. It is the same gate-the-shape
 * approach the notes-collection suite uses for the route bodies.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"

const root = process.cwd()
const read = (relative: string) => readFileSync(join(root, relative), "utf-8")

/**
 * Return the `{ ... }` block that starts at the first `{` at or after `from`, brace
 * balanced. Naive about braces inside strings, which is fine: none of the extracted
 * blocks contain a brace in a string literal, and a change that introduced one would
 * fail loudly here rather than pass quietly.
 */
function blockAt(source: string, from: number): string {
  const start = source.indexOf("{", from)
  expect(start).toBeGreaterThan(-1)
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++
    else if (source[i] === "}") {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error("unbalanced block")
}

/** The body of the handler wired to `onRecordSaved={...}`, inline arrow or named const. */
function recordSavedHandlerBodies(source: string): string[] {
  const bodies: string[] = []
  const prop = /onRecordSaved=\{([^}\n]*)/g
  let match: RegExpExecArray | null
  while ((match = prop.exec(source)) !== null) {
    const expression = match[1].trim()
    if (expression.startsWith("(")) {
      // Inline arrow: `onRecordSaved={() => { ... }}`
      bodies.push(blockAt(source, match.index + "onRecordSaved={".length))
      continue
    }
    // Named handler: find its declaration and take its body.
    const declaration = source.indexOf(`const ${expression} = `)
    expect(declaration, `no declaration for ${expression}`).toBeGreaterThan(-1)
    bodies.push(blockAt(source, declaration))
  }
  return bodies
}

/**
 * Anything that would close the dialog or drop the record it is pointed at. Deliberately
 * broad: `setDeleteDialogOpen(false)` belongs to a *different* dialog and is filtered out
 * by name, everything else that flips an "open" state to false is a violation.
 */
const CLOSES_THE_DIALOG =
  /\bset(?!Delete)\w*(?:Dialog)?Open\s*\(\s*false\s*\)|\bsetEditing\w*\s*\(\s*null\s*\)|\bsetSelectedDeal\s*\(\s*null\s*\)/

const DIALOGS = [
  { entity: "deal", file: "src/app/deals/deal-dialog.tsx", target: "deal" },
  { entity: "organization", file: "src/app/organizations/organization-dialog.tsx", target: "organization" },
  { entity: "person", file: "src/app/people/person-dialog.tsx", target: "person" },
  { entity: "activity", file: "src/app/activities/activity-dialog.tsx", target: "activity" },
] as const

// Every file that renders one of the four dialogs. A new call site that closes from the
// refresh callback has to be added here to pass review, and fails here if it does.
const CALL_SITES = [
  "src/app/deals/kanban-board.tsx",
  "src/app/deals/deal-card.tsx",
  "src/app/organizations/data-table.tsx",
  "src/app/organizations/[id]/organization-detail-client.tsx",
  "src/app/people/data-table.tsx",
  "src/app/people/[id]/person-detail-client.tsx",
  "src/app/activities/activities-client.tsx",
] as const

describe("CR-03: a failed first note keeps the dialog open and the draft alive", () => {
  describe.each(DIALOGS)("$entity dialog", ({ file, target }) => {
    const source = read(file)

    it("keeps the dialog open on the note-failure branch: no handleClose, refresh, return", () => {
      const branch = blockAt(source, source.indexOf("if (!noteSaved)"))

      // The whole point: the dialog is not closed and the form is not reset, so the
      // typed note is still in the textarea when the user retries.
      expect(branch).not.toMatch(/handleClose|reset\(/)
      // The record did land, so the list behind the dialog must not go stale.
      expect(branch).toMatch(/onRecordSaved(?:\?\.)?\(\)/)
      // And nothing after the branch may run — no success toast, no close.
      expect(branch).toContain("return")
    })

    it("remembers the created record so a retry updates instead of creating a second one", () => {
      const branch = blockAt(source, source.indexOf("if (!noteSaved)"))
      expect(branch).toContain("createdRecordIdRef.current = recordId")

      // The create branch seeds its id from the ref, and an existing id takes the
      // update path. Without this a second submit creates a duplicate record.
      const submit = source.slice(source.indexOf("const onSubmit"))
      expect(submit).toContain("let recordId = createdRecordIdRef.current")
      expect(submit).toMatch(
        new RegExp(`if \\(recordId\\) \\{\\s*const result = await update`, "s"),
      )
    })

    it("holds the id in a ref, so setting it cannot re-run the effect that resets the form", () => {
      expect(source).toContain("const createdRecordIdRef = useRef<string | null>(null)")
      // A state hook here would have to be an effect dependency (or become a stale
      // closure), and the effect resets the form. That is the trap; keep it shut.
      expect(source).not.toMatch(/useState<string \| null>\(null\)/)
    })

    it("bails out of the reset-on-open effect while a create is pending", () => {
      const effect = blockAt(source, source.indexOf("useEffect(() =>"))
      expect(effect).toContain("if (createdRecordIdRef.current) return")

      // The guard has to come before the create-mode reset, or it guards nothing.
      const guard = effect.indexOf("if (createdRecordIdRef.current) return")
      const lastReset = effect.lastIndexOf("reset({")
      expect(guard).toBeGreaterThan(-1)
      expect(guard).toBeLessThan(lastReset)
    })

    it("clears the id on close, on open going false, and on an edit target", () => {
      const effect = blockAt(source, source.indexOf("useEffect(() =>"))

      // `open` going false by any route — including a parent flipping it directly
      // rather than going through handleClose.
      const closedBranch = blockAt(effect, effect.indexOf("if (!open)"))
      expect(closedBranch).toContain("createdRecordIdRef.current = null")

      // Pointed at an edit target: a create's half-finished id must not carry over.
      const editBranch = blockAt(effect, effect.indexOf(`if (${target})`))
      expect(editBranch).toContain("createdRecordIdRef.current = null")

      // And the dialog's own close path.
      const close = blockAt(source, source.indexOf("const handleClose"))
      expect(close).toContain("createdRecordIdRef.current = null")
      expect(close).toContain("onOpenChange(false)")
    })

    it("only consults the remembered id on the create path", () => {
      // `isEditMode` short-circuits above it, so an edit can never be redirected at a
      // record the create path happened to leave behind.
      const submit = source.slice(source.indexOf("const onSubmit"))
      const editGuard = submit.indexOf("if (isEditMode)")
      const refRead = submit.indexOf("createdRecordIdRef.current")
      expect(editGuard).toBeGreaterThan(-1)
      expect(refRead).toBeGreaterThan(editGuard)
    })
  })

  describe.each(CALL_SITES)("%s", (file) => {
    const source = read(file)

    it("never closes the dialog from the refresh callback", () => {
      const bodies = recordSavedHandlerBodies(source)
      expect(bodies.length).toBeGreaterThan(0)
      for (const body of bodies) {
        expect(body).not.toMatch(CLOSES_THE_DIALOG)
      }
    })

    it("has no lingering success-named callback wired to one of the four dialogs", () => {
      // The rename is the enforcement: a call site still passing the old prop is a type
      // error. This catches the JSX being copied back in without the type catching it.
      expect(source).not.toMatch(/<(?:Deal|Organization|Person|Activity)Dialog\b[^>]*\bonSuccess=/)
    })
  })
})
