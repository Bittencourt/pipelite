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
