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
