/**
 * CFUI-01 — the second half of the mechanism, on the receiving side of the boundary.
 *
 * `field-dialog-boundary.rsc.test.tsx` proves React Flight DEFERS an element child once the
 * sibling data prop outgrows a Flight row. This file proves what that costs: Radix's
 * `SlotClone` (behind `asChild`) sees a value that is not a valid React element and returns
 * `null` - silently, no throw, no console warning. That is why the missing "Add Field"
 * button on /admin/fields/deal produced no error anywhere and took a browser E2E pass to find.
 *
 * This file deliberately is NOT named `*.rsc.test.tsx`: it needs `react-dom/server`, which
 * cannot load under the `react-server` export condition the rsc project enables. It runs in
 * the base vitest project.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'

/**
 * What the Flight *client* materialises for a deferred `"$L<id>"` prop: a lazy chunk
 * wrapper. Note `isValidElement()` on this is `false` - that single fact is the whole bug.
 * Pre-resolved here so `renderToStaticMarkup` can render it synchronously.
 */
function flightLazy(node: React.ReactElement): React.ReactNode {
  const chunk = { status: 'fulfilled', value: node, then() {} }
  return {
    $$typeof: Symbol.for('react.lazy'),
    _payload: chunk,
    _init: (p: typeof chunk) => p.value,
  } as unknown as React.ReactNode
}

const trigger = <button type="button">Add Field</button>

const renderTrigger = (child: React.ReactNode) =>
  renderToStaticMarkup(
    <Dialog>
      <DialogTrigger asChild>{child}</DialogTrigger>
    </Dialog>
  )

describe('CFUI-01: Radix asChild silently drops an RSC-deferred child', () => {
  it('renders the trigger when the child is a real element', () => {
    expect(renderTrigger(trigger)).toContain('Add Field')
  })

  it('renders NOTHING AT ALL when the child arrived Flight-deferred', () => {
    // Documenting the failure mode, not endorsing it. `SlotClone` runs
    //   if (isValidElement(children)) { ...clone... }
    //   return Children.count(children) > 1 ? Children.only(null) : null
    // A lazy chunk is not a valid element and counts as 1, so it falls through to `null`.
    // This is why a React element must NEVER cross the RSC boundary into an `asChild`
    // slot: the failure is total, and it is completely silent.
    expect(renderTrigger(flightLazy(trigger))).toBe('')
  })

  it('renders the same deferred value fine as an ordinary child - the fault is asChild', () => {
    // Control. React itself resolves the lazy without complaint; only `SlotClone`'s
    // isValidElement gate discards it. Without this assertion the test above could be
    // explained away as "lazies do not render in this environment".
    expect(renderToStaticMarkup(<div>{flightLazy(trigger)}</div>)).toContain('Add Field')
  })
})

/* ------------------------------------------------------------------------- *
 * Structural gates (source reads, not renders).
 *
 * The two describe blocks below assert the SHAPE of the tree rather than its
 * runtime behaviour, because the bug is a shape: an element in a server
 * component's props. There is no render that can observe it inside a unit
 * test - only the real Flight serializer can (see
 * `field-dialog-boundary.rsc.test.tsx`), and it cannot tell you WHICH file
 * did it. These gates can.
 * ------------------------------------------------------------------------- */

const REPO_ROOT = process.cwd()
const SRC_ROOT = path.join(REPO_ROOT, 'src')
const FIELDS_DIR = path.join(SRC_ROOT, 'app', 'admin', 'fields', '[entityType]')
const PAGE = path.join(FIELDS_DIR, 'page.tsx')
const WRAPPER = path.join(FIELDS_DIR, 'add-field-button.tsx')

/**
 * Strip `/* *\/` blocks and `//` line comments.
 *
 * Mandatory, not cosmetic. Every assertion below that matters is a NEGATIVE one
 * ("page.tsx must not contain `<FieldDialog`"), and a negative source assertion
 * is trivially invalidated by a comment that merely mentions the old code - the
 * exact class of self-invalidating gate that lets a regression back in. The
 * `[^:]` guard keeps `https://` out of the line-comment match.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Read a source file with comments removed. Missing file = loud failure, by design. */
function readSource(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

/** True when the first non-comment token of a file is the `'use client'` directive. */
function isClientModule(stripped: string): boolean {
  return /^\s*(['"])use client\1/.test(stripped)
}

describe('CFUI-01 structural repair — no element crosses the RSC boundary', () => {
  it('page.tsx renders no <FieldDialog anywhere — not just in the header', () => {
    // The header trigger AND the archived-field restore trigger. Both are the same
    // defect: `serializedSize` accumulates across the whole Flight row, so by the
    // time the serializer reaches the archived section the budget is long gone. The
    // restore triggers are unobservable today only because `deal` happens to have no
    // archived definitions. A header-only assertion would have shipped that bug.
    expect(readSource(PAGE)).not.toContain('<FieldDialog')
  })

  it('page.tsx renders both client trigger wrappers instead', () => {
    const page = readSource(PAGE)

    expect(page).toContain('<AddFieldButton')
    expect(page).toContain('<RestoreFieldButton')
    expect(page).toContain("from './add-field-button'")
  })

  it("add-field-button.tsx is a client module and creates the triggers itself", () => {
    const wrapper = readSource(WRAPPER)

    expect(isClientModule(wrapper)).toBe(true)
    expect(wrapper).toMatch(/export function AddFieldButton\b/)
    expect(wrapper).toMatch(/export function RestoreFieldButton\b/)
    // Sanity: the dialog really did move here, so the gate above is not vacuous.
    expect(wrapper).toContain('<FieldDialog')
  })

  it('keeps the admin authorization gate in the server component (T-44-19)', () => {
    const page = readSource(PAGE)

    expect(page).toContain('await auth()')
    expect(page).toContain("session.user.role !== 'admin'")
    expect(page).toContain('notFound()')
  })

  it('moved no authorization decision into the client wrapper (T-44-19)', () => {
    const wrapper = readSource(WRAPPER)

    // Both directions are asserted on purpose: the gate must still exist on the
    // server AND must not have been duplicated (or relocated) into the browser,
    // where it would be advisory only.
    expect(wrapper).not.toContain('auth(')
    expect(wrapper).not.toContain('session')
    expect(wrapper).not.toMatch(/\brole\b/)
  })
})

/* ------------------------------------------------------------------------- *
 * D-44-02 single-projection gate.
 *
 * `available-fields-payload.rsc.test.tsx` proves the projected row SHAPE is
 * cheaper (45028 B -> 22353 B at n=155). It cannot prove `page.tsx` actually
 * uses that shape, nor that it builds the array once. Both matter, and the
 * second one is the subtle half: a future edit could write
 *
 *   availableFields={activeFields.map(f => ({ id: f.id, name: f.name, type: f.type }))}
 *
 * which satisfies the narrowed type perfectly while re-serializing 155 fresh
 * objects Flight can no longer back-reference - measured at +13653 B, i.e. the
 * "optimisation" made the page heavier. Types cannot catch that; only the
 * source can.
 * ------------------------------------------------------------------------- */

const FIELD_DIALOG = path.join(FIELDS_DIR, 'field-dialog.tsx')

/** The keys of `AdminFieldRow` - every key this route's client code reads, and no other. */
const ADMIN_ROW_KEYS = ['id', 'name', 'type', 'config', 'required', 'showInList'] as const

/** Columns no client code on this route reads. They must not survive the projection. */
const UNREAD_COLUMNS = ['createdAt', 'updatedAt', 'deletedAt', 'position'] as const

/**
 * Argument text of every `.map(` call in already-stripped source, using paren-depth
 * matching that respects string and template literals so a `)` inside a string cannot
 * close the argument list early.
 */
function mapCallArguments(stripped: string): string[] {
  const args: string[] = []
  const marker = '.map('
  let from = 0

  for (;;) {
    const at = stripped.indexOf(marker, from)
    if (at === -1) break

    let i = at + marker.length
    const start = i
    let depth = 1
    let quote: string | null = null

    while (i < stripped.length && depth > 0) {
      const ch = stripped[i]

      if (quote) {
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === quote) quote = null
        i += 1
        continue
      }

      if (ch === '"' || ch === "'" || ch === '`') quote = ch
      else if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1

      i += 1
    }

    if (depth !== 0) throw new Error('unterminated .map( call in source')

    args.push(stripped.slice(start, i - 1))
    from = i
  }

  return args
}

/** The identifier passed as `prop={x}` to `<Component`, or null if it is not a bare identifier. */
function propIdentifier(stripped: string, component: string, prop: string): string | null {
  // `[^<>]` spans newlines, which is what multi-line JSX attribute lists need. The `\b`
  // before the prop name is what keeps `fields=` from matching inside `availableFields=`.
  const m = new RegExp(`<${component}\\b[^<>]*?\\b${prop}=\\{([A-Za-z_$][\\w$]*)\\}`).exec(stripped)
  return m ? m[1] : null
}

describe('D-44-02 payload projection — page.tsx projects once and shares one array', () => {
  it('declares availableFields as the slim {id,name,type} contract', () => {
    const dialog = readSource(FIELD_DIALOG)

    // Truth: the prop FieldDialog reads exactly three keys from cannot silently grow
    // back into a full CustomFieldDefinition[].
    expect(dialog).toMatch(
      /export type AvailableField = Pick<\s*CustomFieldDefinition,\s*'id' \| 'name' \| 'type'\s*>/
    )
    expect(dialog).toMatch(/availableFields\??: AvailableField\[\]/)
  })

  it('builds the projected rows in exactly one .map( projection', () => {
    const page = readSource(PAGE)
    const projections = mapCallArguments(page).filter(arg => arg.includes('showInList'))

    // Exactly one. Two would mean two separately-derived arrays, and Flight can only
    // back-reference the array it has already written - see the file header.
    expect(projections).toHaveLength(1)

    // Non-vacuous: the one match really is the admin row projection, so a rename of
    // `showInList` makes this gate fail loudly rather than pass over an empty set.
    for (const key of ADMIN_ROW_KEYS) {
      expect(projections[0]).toContain(key)
    }

    // T-44-27, gated at the source rather than only in the fixtures: no unread column
    // may reappear in the projected object. `deletedAt` still exists in page.tsx as the
    // archived predicate, which is exactly why this is scoped to the projection body.
    for (const column of UNREAD_COLUMNS) {
      expect(projections[0]).not.toContain(column)
    }
  })

  it('passes the SAME identifier to FieldsList and to AddFieldButton', () => {
    const page = readSource(PAGE)

    const listed = propIdentifier(page, 'FieldsList', 'fields')
    const available = propIdentifier(page, 'AddFieldButton', 'availableFields')

    // A bare identifier, not an expression: `availableFields={activeFields.map(...)}` does
    // not match, and fails here as null.
    expect(listed).not.toBeNull()
    expect(available).not.toBeNull()
    expect(available).toBe(listed)

    // And it is a local binding, so the two props cannot be the same *name* resolved from
    // two different scopes.
    expect(page).toMatch(new RegExp(`const ${listed}\\b`))
  })

  it('derives restore-vs-edit mode from the explicit archived prop, and passes it', () => {
    const dialog = readSource(FIELD_DIALOG)
    const wrapper = readSource(WRAPPER)

    // `AdminFieldRow` drops `deletedAt`, so the dialog can no longer infer its mode from
    // the row. Nothing in the TYPE system guards the replacement: `archived` is optional,
    // so dropping it from RestoreFieldButton compiles cleanly and silently turns the
    // restore prompt into an edit form on a field that is not editable. Same class of
    // silent failure as the dropped trigger this phase exists to fix, so it is gated.
    expect(dialog).not.toMatch(/field\??\.deletedAt/)
    expect(dialog).toMatch(/const isRestore = !!field && !!archived/)
    expect(dialog).toMatch(/const isEdit = !!field && !archived/)

    // The one caller that must set it. `<FieldDialog ... archived>` is the JSX shorthand.
    expect(wrapper).toMatch(/<FieldDialog[^<>]*\barchived\b/)
  })

  it('dropped the CustomFieldDefinition casts rather than widening them', () => {
    const page = readSource(PAGE)

    // The casts existed to force whole table rows through a prop that never wanted them.
    // With the row type narrowed there is nothing left to assert away.
    expect(page).not.toContain('as CustomFieldDefinition')
    expect(page).toContain('AdminFieldRow')
  })
})

/* ------------------------------------------------------------------------- *
 * Class-wide gate.
 *
 * The rule RESEARCH derived is broader than this one call site: a SERVER
 * component must never pass JSX children into a component that forwards them
 * into an `asChild` slot, because Radix's `SlotClone` discards anything that is
 * not a valid element - and Flight will hand it a lazy reference the moment the
 * sibling props outgrow a row. Guarding only `page.tsx` would leave the next
 * occurrence, in a file nobody thought to look at, just as silent.
 * ------------------------------------------------------------------------- */

/** The forwarding pattern itself: `<DialogTrigger asChild>{children}</DialogTrigger>`. */
const FORWARDS_CHILDREN = 'asChild>{children}'

const SKIP_DIRS = new Set(['node_modules', '.next', '.claude', '.git'])

/**
 * Test files are out of scope for BOTH halves of the scan. They are not part of
 * the RSC component graph (nothing renders them on a server), and they quote the
 * very patterns being searched for as literals - including this file, which would
 * otherwise register as both a "definer" and an offending non-client "usage".
 */
const isTestFile = (file: string) =>
  /(^|[/\\])__tests__[/\\]/.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walkTsx(path.join(dir, entry.name), out)
    } else if (entry.name.endsWith('.tsx')) {
      const file = path.join(dir, entry.name)
      if (!isTestFile(file)) out.push(file)
    }
  }
  return out
}

describe('CFUI-01 class-wide — no server component may hand children to an asChild slot', () => {
  it('every user of a children-forwarding component is itself a client module', () => {
    expect(existsSync(SRC_ROOT)).toBe(true)

    const files = walkTsx(SRC_ROOT)
    const sources = new Map(files.map(f => [f, readSource(f)]))

    // 1. Files that forward their `children` into an `asChild` slot.
    const definers = files.filter(f => sources.get(f)!.includes(FORWARDS_CHILDREN))

    // Non-empty, so a refactor that renames or reformats the pattern makes this
    // gate FAIL loudly rather than pass vacuously over an empty set.
    expect(definers.length).toBeGreaterThan(0)

    // 2. Their exported component names.
    const componentOf = new Map<string, string>()
    for (const file of definers) {
      for (const m of sources.get(file)!.matchAll(/export function ([A-Z]\w*)/g)) {
        componentOf.set(m[1], file)
      }
    }
    expect(componentOf.size).toBeGreaterThan(0)

    // 3 + 4. Every file that renders one of them must be a client module (or be
    // the defining file itself, which renders nothing of its own).
    const offenders: string[] = []
    for (const [file, src] of sources) {
      for (const [name, definedIn] of componentOf) {
        if (file === definedIn) continue
        if (!new RegExp(`<${name}[\\s/>]`).test(src)) continue
        if (isClientModule(src)) continue
        offenders.push(`${path.relative(REPO_ROOT, file)} renders <${name}>`)
      }
    }

    expect(offenders).toEqual([])
  })
})
