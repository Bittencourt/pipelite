/**
 * CFUI-01 / SC-5 — the RSC boundary contract for the admin fields header.
 *
 * This file runs in the `rsc` vitest project (vitest.rsc.config.ts) so it can drive the
 * REAL Flight serializer that Next 16.1.6 ships. That is deliberate and non-negotiable:
 * the bug it guards is React deciding, based on accumulated byte size, to emit a child
 * ELEMENT as a lazy reference (`"children":"$L19"`) instead of inline. Radix's `SlotClone`
 * behind `asChild` then sees a non-element, returns `null` silently, and the "Add Field"
 * button disappears from /admin/fields/deal with no error anywhere. A mocked or
 * hand-rolled serializer cannot observe that decision, so it cannot guard it.
 *
 * Do NOT import `react-dom/server` here (or from anything this file reaches): the
 * `react-server` condition applies to the whole project and react-dom/server cannot load
 * under it. The companion mechanism test lives in `rsc-boundary.test.tsx`, in the base
 * project, for exactly that reason.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'

/** Minimal surface of the shipped Flight server we use - avoids `any` at the boundary. */
interface FlightServer {
  renderToReadableStream: (
    model: unknown,
    manifest: Record<string, unknown>
  ) => ReadableStream<Uint8Array>
}

/** Serialize a model through the real Flight serializer and return the raw payload. */
async function flight(node: unknown): Promise<string> {
  const mod = (await import(
    'next/dist/compiled/react-server-dom-webpack/server.edge.js'
  )) as unknown as FlightServer
  const reader = mod.renderToReadableStream(node, {}).getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * `"$L<id>"` in a `children` slot is React's lazy reference for a DEFERRED element.
 * This is the exact string that was found in the live /admin/fields/deal payload.
 */
const DEFERRED_CHILD = /"children":"\$L/

/**
 * Shaped like `CustomFieldDefinition`, but declared locally on purpose: importing
 * `@/db/schema` would pull drizzle into the react-server project for no benefit, and the
 * timestamps are `null` here so the fixture is a pure JSON shape.
 */
interface DefRow {
  id: string
  entityType: string
  name: string
  type: string
  config: null
  required: boolean
  position: string
  showInList: boolean
  createdAt: null
  updatedAt: null
  deletedAt: null
}

/** `n` synthetic definition rows with Portuguese-length names, as the real deal data has. */
const defs = (n: number): DefRow[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `0e2b1c9a-1111-4000-8000-${String(i).padStart(12, '0')}`,
    entityType: 'deal',
    name: `Campo de teste ${i}`,
    type: 'text',
    config: null,
    required: false,
    position: `${i}.0000000000`,
    showInList: false,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
  }))

/** The slim projection 44-CONTEXT.md originally proposed as the CFUI-01 fix. */
const slimDefs = (n: number) =>
  defs(n).map(({ id, name, type }) => ({ id, name, type }))

/**
 * The BROKEN shape: bulk data and a React element in the same props object, element last -
 * which is where JSX always puts `children`. This is `page.tsx` handing
 * `<FieldDialog availableFields={activeFields}><Button/></FieldDialog>` to the boundary.
 */
const withElementChild = (fields: unknown) => (
  <span data-entity="deal" data-fields={fields}>
    <button type="button">Add Field</button>
  </span>
)

/**
 * The REPAIRED shape: the same bulk data, no element crossing the boundary. The trigger is
 * built inside a `'use client'` component instead (see D-44-01).
 */
const dataOnly = (fields: unknown) => <span data-entity="deal" data-fields={fields} />

describe('CFUI-01: the admin fields header must not defer an element across the RSC boundary', () => {
  it('serializes an element child inline while the sibling data prop stays small', async () => {
    const payload = await flight(withElementChild(defs(20)))

    expect(DEFERRED_CHILD.test(payload)).toBe(false)
    // Sanity: the element really is in the payload, so the assertion is not vacuous.
    expect(payload).toContain('Add Field')
  })

  it('DEFERS the element child once the sibling data prop grows past one Flight row', async () => {
    const payload = await flight(withElementChild(defs(21)))

    expect(DEFERRED_CHILD.test(payload)).toBe(true)
  })

  /*
   * On 21: that is the MEASURED boundary for THIS fixture (React's MAX_ROW_SIZE is 3200
   * bytes and these rows are ~155 bytes each), and it is a fixture value only. It must
   * never be treated as a production invariant - real field names differ in length, and
   * MAX_ROW_SIZE is a React internal that can move in any minor. See 44-RESEARCH.md
   * Assumption A1. If a React/Next upgrade moves this number, RE-MEASURE the fixture;
   * do not read it as a regression. What is invariant is the assertion below: the
   * repaired shape must never defer, at any size.
   */

  it('is NOT fixed by the slim {id,name,type} projection - it still defers at 155 rows', async () => {
    const payload = await flight(withElementChild(slimDefs(155)))

    // D-44-01: this measurement is why the projection was rejected as the CFUI-01 repair.
    // It only moves the cliff (inline to ~n=40), it does not remove it. The projection is
    // still worth shipping as a payload optimisation (D-44-02) - but never as the fix.
    expect(DEFERRED_CHILD.test(payload)).toBe(true)
  })

  it('never defers an element when no element crosses the boundary - the repaired shape', async () => {
    // 155 = the live deal definition count, ~78 KB of payload, far past MAX_ROW_SIZE.
    const payload = await flight(dataOnly(defs(155)))

    // This is the contract SC-5 guards. Deferring a DATA prop is harmless; the client
    // reassembles it. Deferring an ELEMENT prop into an `asChild` slot is the bug.
    expect(DEFERRED_CHILD.test(payload)).toBe(false)
    expect(payload).not.toMatch(/"\$L/)
    // Sanity: all 155 rows really did cross, so size is not being avoided by accident.
    expect(payload).toContain('Campo de teste 154')
  })
})
