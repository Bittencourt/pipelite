/**
 * BULK-01 — the select column's DEFINITION contract.
 *
 * THE CONSTRAINT. This repo has no DOM-emulating vitest environment and no React
 * render-testing library, and none may be added (Phase 44 precedent). vitest runs with
 * `environment: 'node'`, so nothing here may mount, render or hydrate an element, and no
 * renderer is imported. That is not a gap: a column definition is pure data plus two
 * render functions, and both are fully assertable by calling them and reading the element
 * objects they return.
 *
 * THE DIVISION OF LABOUR. This file pins the definition — the id, the size, the
 * sorting/hiding flags, the tri-state header `checked`, the empty-table disabled state,
 * the record-derived accessible name, and the boolean coercion on toggle. The RENDERED
 * behaviour of the checkbox (the dash glyph, the 32px pointer target, focus order) is
 * verified in the browser by plan 38-20. Whether the three tables actually prepend this
 * column, and set `getRowId`, is gated by
 * `src/components/bulk/__tests__/select-wiring.test.ts` (plan 38-19).
 *
 * Only the pure factory is imported. The translated hook alongside it calls a React hook
 * and therefore cannot run outside a render; it is out of scope here by construction.
 */
import { describe, it, expect, vi } from "vitest"
import type { CellContext, ColumnDef, HeaderContext } from "@tanstack/react-table"

import { buildSelectColumn, type SelectColumnLabels } from "./select-column"

type TestRow = { id: string; name: string }

const ACME: TestRow = { id: "o1", name: "Acme Ltda" }

const stubLabels: SelectColumnLabels = {
  selectRow: (name) => "row:" + name,
  selectAllLoaded: (count) => "all:" + count,
}

function column(labels: SelectColumnLabels = stubLabels, getLabel = (r: TestRow) => r.name) {
  return buildSelectColumn<TestRow>(labels, getLabel)
}

/**
 * The header/cell templates are typed `string | ((props) => unknown)`, so every call site
 * has to narrow first. Doing it once keeps each test to its actual assertion.
 */
function headerTemplate(def: ColumnDef<TestRow, unknown>) {
  const { header } = def
  if (typeof header !== "function") throw new Error("header must be a render function")
  return header
}

function cellTemplate(def: ColumnDef<TestRow, unknown>) {
  const { cell } = def
  if (typeof cell !== "function") throw new Error("cell must be a render function")
  return cell
}

/**
 * Every `as unknown as` cast in this suite is confined to this file. The two templates
 * touch exactly the handful of table/row methods stubbed below, so a hand-built context is
 * an honest stand-in — and a real table instance could not be built here anyway, since
 * `useReactTable` is a hook.
 */
function headerContext(options: {
  allSelected?: boolean
  someSelected?: boolean
  rowCount?: number
  onToggle?: (value: boolean) => void
}): HeaderContext<TestRow, unknown> {
  const rows = Array.from({ length: options.rowCount ?? 0 }, () => ({}))
  return {
    table: {
      getIsAllPageRowsSelected: () => options.allSelected ?? false,
      getIsSomePageRowsSelected: () => options.someSelected ?? false,
      toggleAllPageRowsSelected: options.onToggle ?? (() => {}),
      getRowModel: () => ({ rows }),
    },
  } as unknown as HeaderContext<TestRow, unknown>
}

function cellContext(options: {
  selected?: boolean
  canSelect?: boolean
  onToggle?: (value: boolean) => void
  original?: TestRow
}): CellContext<TestRow, unknown> {
  return {
    row: {
      getIsSelected: () => options.selected ?? false,
      toggleSelected: options.onToggle ?? (() => {}),
      getCanSelect: () => options.canSelect ?? true,
      original: options.original ?? ACME,
    },
  } as unknown as CellContext<TestRow, unknown>
}

/** Props of the wrapper element a template returns. Reading only — never rendered. */
function wrapperProps(element: unknown): Record<string, unknown> {
  const el = element as { props?: Record<string, unknown> }
  if (!el?.props) throw new Error("expected an element object with props")
  return el.props
}

/** Props of the single checkbox the wrapper holds. */
function checkboxProps(element: unknown): Record<string, unknown> {
  const child = wrapperProps(element).children as
    | { props?: Record<string, unknown> }
    | undefined
  if (!child?.props) throw new Error("expected the wrapper to hold one child element")
  return child.props
}

describe("buildSelectColumn — definition contract", () => {
  it('uses the id "select"', () => {
    expect(column().id).toBe("select")
  })

  it("declares size 44 so the Activities table can honour getSize()", () => {
    expect(column().size).toBe(44)
  })

  it("opts out of sorting", () => {
    expect(column().enableSorting).toBe(false)
  })

  it("opts out of hiding, so the column cannot be toggled away", () => {
    expect(column().enableHiding).toBe(false)
  })

  it("supplies both header and cell as render functions", () => {
    const def = column()
    expect(typeof def.header).toBe("function")
    expect(typeof def.cell).toBe("function")
  })

  it("returns an element from each template", () => {
    const def = column()
    expect(headerTemplate(def)(headerContext({ rowCount: 2 }))).toBeTruthy()
    expect(cellTemplate(def)(cellContext({}))).toBeTruthy()
  })
})

describe("buildSelectColumn — the row checkbox", () => {
  it("derives its accessible name from getLabel(row.original), not a row index", () => {
    const getLabel = vi.fn((r: TestRow) => r.name)
    const rendered = cellTemplate(column(stubLabels, getLabel))(
      cellContext({ original: ACME }),
    )

    expect(getLabel).toHaveBeenCalledWith(ACME)
    expect(checkboxProps(rendered)["aria-label"]).toBe("row:Acme Ltda")
  })

  it("names the record it actually belongs to when rows differ only by name", () => {
    const def = column()
    const other: TestRow = { id: "o2", name: "Globex SA" }

    expect(checkboxProps(cellTemplate(def)(cellContext({ original: ACME })))["aria-label"]).toBe(
      "row:Acme Ltda",
    )
    expect(checkboxProps(cellTemplate(def)(cellContext({ original: other })))["aria-label"]).toBe(
      "row:Globex SA",
    )
  })

  it("reflects the row's own selected state", () => {
    const def = column()
    expect(checkboxProps(cellTemplate(def)(cellContext({ selected: true }))).checked).toBe(true)
    expect(checkboxProps(cellTemplate(def)(cellContext({ selected: false }))).checked).toBe(false)
  })

  it("is disabled exactly when the row cannot be selected", () => {
    const def = column()
    expect(checkboxProps(cellTemplate(def)(cellContext({ canSelect: false }))).disabled).toBe(true)
    expect(checkboxProps(cellTemplate(def)(cellContext({ canSelect: true }))).disabled).toBe(false)
  })

  it("coerces the checked state to a boolean before toggling the row", () => {
    const onToggle = vi.fn()
    const rendered = cellTemplate(column())(cellContext({ onToggle }))
    const onCheckedChange = checkboxProps(rendered).onCheckedChange as (v: unknown) => void

    onCheckedChange("indeterminate")
    onCheckedChange(false)

    expect(onToggle).toHaveBeenNthCalledWith(1, true)
    expect(onToggle).toHaveBeenNthCalledWith(2, false)
  })

  it("stops click propagation on its wrapper so a toggle has exactly one effect", () => {
    const rendered = cellTemplate(column())(cellContext({}))
    const onClick = wrapperProps(rendered).onClick as (e: {
      stopPropagation: () => void
    }) => void
    const stopPropagation = vi.fn()

    expect(typeof onClick).toBe("function")
    onClick({ stopPropagation })
    expect(stopPropagation).toHaveBeenCalledTimes(1)
  })
})

describe("buildSelectColumn — the header checkbox", () => {
  it('passes the literal "indeterminate" when some but not all rows are selected', () => {
    const rendered = headerTemplate(column())(
      headerContext({ allSelected: false, someSelected: true, rowCount: 5 }),
    )

    expect(checkboxProps(rendered).checked).toBe("indeterminate")
  })

  it("passes true when every loaded row is selected and false when none is", () => {
    const def = column()

    expect(
      checkboxProps(
        headerTemplate(def)(headerContext({ allSelected: true, someSelected: false, rowCount: 5 })),
      ).checked,
    ).toBe(true)
    expect(
      checkboxProps(
        headerTemplate(def)(headerContext({ allSelected: false, someSelected: false, rowCount: 5 })),
      ).checked,
    ).toBe(false)
  })

  it("names the loaded row count, taken from the final row model", () => {
    const selectAllLoaded = vi.fn((count: number) => "all:" + count)
    const rendered = headerTemplate(column({ ...stubLabels, selectAllLoaded }))(
      headerContext({ rowCount: 3 }),
    )

    expect(selectAllLoaded).toHaveBeenCalledWith(3)
    expect(checkboxProps(rendered)["aria-label"]).toBe("all:3")
  })

  it("is disabled on an empty result and enabled once rows exist — never hidden", () => {
    const def = column()

    const empty = headerTemplate(def)(headerContext({ rowCount: 0 }))
    expect(empty).toBeTruthy()
    expect(checkboxProps(empty).disabled).toBe(true)

    expect(checkboxProps(headerTemplate(def)(headerContext({ rowCount: 1 }))).disabled).toBe(false)
  })

  it("coerces the checked state to a boolean before toggling the loaded rows", () => {
    const onToggle = vi.fn()
    const rendered = headerTemplate(column())(headerContext({ rowCount: 4, onToggle }))
    const onCheckedChange = checkboxProps(rendered).onCheckedChange as (v: unknown) => void

    onCheckedChange("indeterminate")
    onCheckedChange(false)

    expect(onToggle).toHaveBeenNthCalledWith(1, true)
    expect(onToggle).toHaveBeenNthCalledWith(2, false)
  })
})
