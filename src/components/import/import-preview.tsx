"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react"
import type { ImportError, ImportEntityType } from "@/lib/import/types"

interface ImportPreviewProps {
  data: Record<string, unknown>[]
  errors: ImportError[]
  entityType: ImportEntityType
  allowPartialImport: boolean
  onAllowPartialChange: (allow: boolean) => void
}

const ROWS_PER_PAGE = 50

export function ImportPreview({
  data,
  errors,
  entityType,
  allowPartialImport,
  onAllowPartialChange,
}: ImportPreviewProps) {
  const [page, setPage] = useState(0)

  // Build set of error row numbers for fast lookup
  const errorRowSet = new Set(errors.map((e) => e.row))
  const errorRowCount = errorRowSet.size
  const validRowCount = data.length - errorRowCount

  // Determine columns to display
  const columns = data.length > 0 ? Object.keys(data[0]) : []

  // Paginate
  const totalPages = Math.ceil(data.length / ROWS_PER_PAGE)
  const pageData = data.slice(
    page * ROWS_PER_PAGE,
    (page + 1) * ROWS_PER_PAGE
  )

  // Get errors for a specific row
  const getRowErrors = (rowIndex: number) =>
    errors.filter((e) => e.row === rowIndex)

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-md border p-3 text-sm">
        <span>
          Total rows: <span className="font-medium">{data.length}</span>
        </span>
        <span className="text-green-600">
          Valid: <span className="font-medium">{validRowCount}</span>
        </span>
        {errorRowCount > 0 && (
          <span className="text-red-600">
            Errors: <span className="font-medium">{errorRowCount}</span>
          </span>
        )}
      </div>

      {/* Partial import checkbox */}
      {errorRowCount > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="partial-import"
            checked={allowPartialImport}
            onCheckedChange={(checked) =>
              onAllowPartialChange(checked === true)
            }
          />
          <label htmlFor="partial-import" className="cursor-pointer text-sm">
            Import valid rows only (skip {errorRowCount} error{errorRowCount > 1 ? "s" : ""})
          </label>
        </div>
      )}

      {/* Data table */}
      <div className="max-h-[500px] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              {columns.map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row, idx) => {
              const rowNum = page * ROWS_PER_PAGE + idx + 1
              const hasError = errorRowSet.has(rowNum)
              const rowErrors = hasError ? getRowErrors(rowNum) : []

              return (
                <TableRow
                  key={rowNum}
                  className={
                    hasError
                      ? "bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50"
                      : ""
                  }
                >
                  <TableCell className="text-muted-foreground text-xs">
                    {rowNum}
                  </TableCell>
                  {columns.map((col) => (
                    <TableCell key={col} className="max-w-40 truncate">
                      {String(row[col] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Error list */}
      {errors.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-medium text-red-600">
            <AlertCircle className="h-4 w-4" />
            Errors ({errors.length})
          </h4>
          <div className="max-h-48 overflow-auto rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
            <ul className="space-y-1 text-sm text-red-600 dark:text-red-400">
              {errors.slice(0, 100).map((err, i) => (
                <li key={i}>
                  Row {err.row}, field &quot;{err.field}&quot;: {err.message}
                </li>
              ))}
              {errors.length > 100 && (
                <li className="italic">
                  ...and {errors.length - 100} more errors
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
