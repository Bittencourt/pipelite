/**
 * D-44-02 — the payload measurement behind the slim projection.
 *
 * This file is NOT a CFUI-01 gate. CFUI-01 is fixed structurally in plan 44-06 (no React
 * element crosses the RSC boundary into an `asChild` slot) and stays fixed whether or not
 * the projection this file measures ever ships. What is measured here is only how many
 * bytes `/admin/fields/[entityType]` pushes to the browser.
 *
 * Why it must run against the REAL serializer: the decision under test is React Flight's,
 * not ours. Flight keeps a map of already-written objects and emits a BACK-REFERENCE for
 * an object it has serialized before. That single behaviour is what makes the honest
 * optimisation "project once and share the array" rather than "build a second, slimmer
 * array for `availableFields`" — the latter would add ~155 newly-serialized objects on top
 * of the full rows `FieldsList` still needs, i.e. a net payload INCREASE. Assertion 1
 * measures that claim instead of trusting it.
 *
 * Do NOT import `react-dom/server` here (or from anything reachable): the `react-server`
 * condition applies to the whole rsc project and react-dom/server cannot load under it.
 *
 * All assertions are RELATIVE (smaller than, appears once, key absent). Absolute byte
 * counts drift with any React or Next upgrade and would make this a flaky gate instead of
 * a useful one; the measured figures are printed, not asserted.
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

/** Payload size in bytes, not UTF-16 code units. */
const bytes = (payload: string) => Buffer.byteLength(payload, 'utf8')

const occurrences = (payload: string, needle: string) => payload.split(needle).length - 1

/**
 * The live `deal` definition count. Every fixture below uses it so the printed figures are
 * comparable to the real route rather than to each other only.
 */
const N = 155

/**
 * Shaped like `CustomFieldDefinition`, declared locally on purpose: importing `@/db/schema`
 * would drag drizzle into the react-server project for no benefit.
 *
 * Unlike 44-01's fixture the timestamps here are real `Date`s, because measuring the saving
 * from dropping `createdAt`/`updatedAt` against `null` placeholders would understate it.
 * Flight writes a Date as `"$D2026-08-15T12:00:00.000Z"`.
 */
interface FullRow {
  id: string
  entityType: string
  name: string
  type: string
  config: { options: string[] } | null
  required: boolean
  position: string
  showInList: boolean
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/** What `page.tsx` gets from `getAllFieldDefinitions` today: whole table rows. */
const fullRows = (n: number): FullRow[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `0e2b1c9a-1111-4000-8000-${String(i).padStart(12, '0')}`,
    entityType: 'deal',
    name: `Campo de teste ${i}`,
    type: i % 10 === 0 ? 'single_select' : 'text',
    config: i % 10 === 0 ? { options: ['Sim', 'Não', 'Talvez'] } : null,
    required: false,
    position: `${i}.0000000000`,
    showInList: false,
    createdAt: new Date('2026-08-15T12:00:00.000Z'),
    updatedAt: new Date('2026-08-15T12:00:00.000Z'),
    deletedAt: null,
  }))

/**
 * `AdminFieldRow` — every key the browser actually reads on this route, and no other.
 *
 * `config` stays: the edit dialog reads it for select options and formula expressions, so
 * it reaches the browser either way. `entityType` goes because the page passes it as its
 * own prop; `createdAt`/`updatedAt`/`deletedAt`/`position` go because no client code in
 * this route reads them (the server has already split active from archived, and reordering
 * posts ids only).
 */
const projectedRows = (rows: FullRow[]) =>
  rows.map(({ id, name, type, config, required, showInList }) => ({
    id,
    name,
    type,
    config,
    required,
    showInList,
  }))

/** The `{id,name,type}` slice `FieldDialog` reads — the "separate slim array" idea. */
const slimRows = (rows: FullRow[]) => rows.map(({ id, name, type }) => ({ id, name, type }))

/**
 * The page shape after 44-06: data props only, no element child anywhere. `availableFields`
 * is what `page.tsx` hands the `AddFieldButton` wrapper, `fields` what it hands `FieldsList`.
 *
 * Deliberately ONE element carrying both props rather than two sibling elements. A sibling
 * fixture was measured first and does emit `"$L"` — but for the SIBLING SPAN, not for a
 * child of an `asChild` slot, and a lazy in an ordinary `children` position is resolved by
 * React without complaint (rsc-boundary.test.tsx assertion 3 isolates exactly that). Such a
 * fixture would make assertion 4 below assert something false about a harmless behaviour
 * while measuring the same bytes. One element measures the array cost with no such noise.
 */
const pageShape = (fields: unknown, availableFields: unknown) => (
  <span data-entity="deal" data-fields={fields} data-available-fields={availableFields} />
)

/** A structurally equal but reference-distinct copy, so Flight cannot back-reference it. */
const detach = <T,>(rows: T[]): T[] => rows.map(row => ({ ...row }))

const LAZY_REFERENCE = /"\$L/

describe('D-44-02: the admin fields payload shrinks by projecting once, not by adding an array', () => {
  it('emits a shared row array ONCE — a second, separately-built array is a net increase', async () => {
    const rows = fullRows(N)

    const shared = await flight(pageShape(rows, rows))
    const duplicated = await flight(pageShape(rows, detach(rows)))
    const withSeparateSlim = await flight(pageShape(rows, slimRows(rows)))

    // The premise of the whole optimisation: Flight's written-objects map means the same
    // reference costs bytes once. If this ever stops holding, "project once and share"
    // stops being the right shape and this plan needs re-deciding, not re-tuning.
    expect(occurrences(shared, 'Campo de teste 154')).toBe(1)
    expect(occurrences(duplicated, 'Campo de teste 154')).toBe(2)
    expect(bytes(shared)).toBeLessThan(bytes(duplicated))

    // 44-CONTEXT's original D-44-02 sketch — a SEPARATE slim `availableFields` array
    // alongside the full rows `FieldsList` still needs. Measured, it is bigger than
    // sharing one array, which is why this plan does not build one.
    expect(bytes(withSeparateSlim)).toBeGreaterThan(bytes(shared))

    console.log(
      `[D-44-02] n=${N} shared=${bytes(shared)}B  duplicated=${bytes(duplicated)}B  ` +
        `separate-slim-array=${bytes(withSeparateSlim)}B`
    )
  })

  it('serializes the projected row shape into strictly fewer bytes than the full rows', async () => {
    const rows = fullRows(N)
    const projected = projectedRows(rows)

    const before = await flight(pageShape(rows, rows))
    const after = await flight(pageShape(projected, projected))

    // The entire justification for D-44-02 is payload size. If this assertion ever fails,
    // the projection must NOT ship - report the measurement instead.
    expect(bytes(after)).toBeLessThan(bytes(before))

    // Non-vacuity: the projected payload still carries all 155 rows.
    expect(after).toContain('Campo de teste 154')
    expect(occurrences(after, 'Campo de teste 154')).toBe(1)

    const saved = bytes(before) - bytes(after)
    console.log(
      `[D-44-02] n=${N} full-rows=${bytes(before)}B  projected=${bytes(after)}B  ` +
        `saved=${saved}B (${((saved / bytes(before)) * 100).toFixed(1)}%)`
    )
  })

  it('ships no createdAt, updatedAt, deletedAt or position to the browser', async () => {
    const rows = fullRows(N)
    const unread = ['createdAt', 'updatedAt', 'deletedAt', 'position'] as const

    const before = await flight(pageShape(rows, rows))
    const after = await flight(pageShape(projectedRows(rows), projectedRows(rows)))

    for (const key of unread) {
      // Asserted in both directions: the keys must really be there before the projection,
      // or their absence afterwards would prove nothing about the projection (T-44-27).
      expect(before).toContain(key)
      expect(after).not.toContain(key)
    }

    // `config` deliberately survives - the edit dialog reads select options and formula
    // expressions from it. Admin-only data on an admin-only route.
    expect(after).toContain('config')
    expect(after).toContain('Talvez')
  })

  it('defers no element in either shape — after 44-06 there is no element child here', async () => {
    const rows = fullRows(N)

    const before = await flight(pageShape(rows, rows))
    const after = await flight(pageShape(projectedRows(rows), projectedRows(rows)))

    // Not a CFUI-01 gate (that is field-dialog-boundary.rsc.test.tsx assertion 4); this is
    // the guarantee that the optimisation did not reintroduce the structural defect. Both
    // shapes are data-only, so neither may contain a lazy reference at ANY row count.
    expect(LAZY_REFERENCE.test(before)).toBe(false)
    expect(LAZY_REFERENCE.test(after)).toBe(false)
  })
})
