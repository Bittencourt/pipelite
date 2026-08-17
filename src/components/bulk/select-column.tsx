"use client"

import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslations } from "next-intl"

import { Checkbox } from "@/components/ui/checkbox"

/**
 * The two accessible names the select column needs, already resolved to strings.
 *
 * Taking resolved functions rather than a translator is what keeps `buildSelectColumn`
 * pure: the factory can then be unit-tested with stub labels and no React runtime, while
 * the hook below is the only thing that touches i18n.
 */
export interface SelectColumnLabels {
  /** bulk.selectRow — "Select {name}" */
  selectRow: (name: string) => string
  /** bulk.selectAllLoaded — ICU plural on count */
  selectAllLoaded: (count: number) => string
}

/**
 * The one checkbox column definition shared by Organizations, People and Activities.
 *
 * Pure — no React hook is called here — so the definition contract is assertable in a
 * node-environment test. Each consumer prepends the returned column to its own array;
 * this module is deliberately not part of either `columns.tsx` file, both of which export
 * a STATIC array that could never resolve a translated accessible name.
 */
export function buildSelectColumn<T>(
  labels: SelectColumnLabels,
  getLabel: (row: T) => string,
): ColumnDef<T, unknown> {
  return {
    id: "select",
    // Honoured by the Activities table, which renders style={{ width: header.getSize() }}.
    // The other two tables auto-size the column to the control plus its wrapper padding.
    size: 44,
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      // The wrapper padding is the pointer target: the primitive itself is a 16px square,
      // and the padding is what grows it to the 32px minimum the spacing contract requires.
      <div className="flex items-center justify-center p-2">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          // Page-scoped only. The variants that ignore the row model would toggle
          // filter-hidden records, so the bar's count could exceed what the user can see —
          // the exact defect page-scoped select-all exists to avoid.
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          // Disabled, not hidden: a header cell that appears and disappears makes the
          // column width jump between an empty and a non-empty result. The primitive's
          // own reduced opacity already communicates the state.
          disabled={table.getRowModel().rows.length === 0}
          aria-label={labels.selectAllLoaded(table.getRowModel().rows.length)}
        />
      </div>
    ),
    cell: ({ row }) => (
      // Stopping propagation here is defence in depth, not a bug fix: the row's own click
      // handler moves the keyboard cursor (opening a record is bound to the enter hotkey,
      // not to a click). Toggling a checkbox must have exactly one effect, and the guard
      // survives any future change to what a row click does.
      <div
        className="flex items-center justify-center p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          disabled={!row.getCanSelect()}
          // The accessible name identifies the RECORD, not the row. Fifty controls all
          // announcing "Select row" is unusable; "Select Acme Ltda" is navigable. No
          // visible label element — text would not fit the column.
          aria-label={labels.selectRow(getLabel(row.original))}
        />
      </div>
    ),
  }
}

/**
 * The client-side wrapper: resolves the two labels from the `bulk` namespace and delegates.
 *
 * Memoised so a consumer's `[selectColumn, ...columns]` array stays referentially stable
 * across renders and does not re-create the table's column model on every paint.
 */
export function useSelectColumn<T>(getLabel: (row: T) => string): ColumnDef<T, unknown> {
  const t = useTranslations("bulk")

  return useMemo(
    () =>
      buildSelectColumn<T>(
        {
          selectRow: (name) => t("selectRow", { name }),
          selectAllLoaded: (count) => t("selectAllLoaded", { count }),
        },
        getLabel,
      ),
    [t, getLabel],
  )
}
