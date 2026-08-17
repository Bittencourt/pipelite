"use client"

import { useState, useRef, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Person } from "./columns"
import { Plus, Search } from "lucide-react"
import { PersonDialog } from "./person-dialog"
import { DeleteDialog } from "./delete-dialog"
import {
  deletePerson,
  bulkDeletePeople,
  bulkReassignPersonOwner,
  exportSelectedPeople,
} from "./actions"
import { toast } from "sonner"
import { useDataTableKeyboard } from "@/components/keyboard"
import { useSelectColumn } from "@/components/bulk/select-column"
import { BulkActionBar } from "@/components/bulk/bulk-action-bar"
import { BulkFailureReport } from "@/components/bulk/bulk-failure-report"
import type { BulkOutcome } from "@/lib/bulk/types"

interface DataTableProps {
  columns: ColumnDef<Person, unknown>[]
  data: Person[]
  hasMore?: boolean
  search?: string
  currentPage?: number
  refresh?: () => void
  /** null means nothing is purged automatically. Never defaulted, here or upstream. */
  retentionDays: number | null
  /** The bulk reassign pool: approved, non-deleted users only. Named for the picker it feeds. */
  bulkOwners: { id: string; name: string }[]
}

export function DataTable({ columns, data, hasMore = false, search = "", currentPage = 1, refresh, retentionDays, bulkOwners }: DataTableProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null)

  /**
   * CLEAR THE SELECTION WHEN THE SEARCH CHANGES — and keyed on the SEARCH STRING, never on the
   * rows array.
   *
   * `handleRecordSaved` below records the measurement this depends on: an action that calls
   * `revalidatePath` at all re-renders the CURRENT client tree a few milliseconds after the
   * action resolves, whichever path it names, and every bulk action calls it. A `[data]`-keyed
   * clear would therefore fire in the middle of a bulk write and wipe the failed-record
   * selection that the retry-in-one-click behaviour needs to survive (T-38-33).
   *
   * Written as React's adjust-state-during-render pattern rather than an effect on purpose: this
   * repo treats a synchronous state update inside an effect as a build error, and an effect would
   * also render one frame with the stale selection still live. The comparison state is the only
   * dependency, which is why it is not an array — the "dependency" is the `search !== prevSearch`
   * test itself, and `data` cannot get into it.
   */
  const [prevSearch, setPrevSearch] = useState(search)
  if (search !== prevSearch) {
    setPrevSearch(search)
    setRowSelection({})
  }

  const handleAddNew = () => {
    setEditingPerson(null)
    setDialogOpen(true)
  }

  const handleEdit = (person: Person) => {
    setEditingPerson(person)
    setDialogOpen(true)
  }

  const handleDeleteClick = (person: Person) => {
    setPersonToDelete(person)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!personToDelete) return

    setIsDeleting(true)
    try {
      const result = await deletePerson(personToDelete.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Person deleted")
      setDeleteDialogOpen(false)
      setPersonToDelete(null)
      refresh?.()
      router.refresh()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsDeleting(false)
    }
  }

  // Closing is the dialog's decision, taken through onOpenChange. A create whose record
  // landed but whose note did not stays open on purpose so the typed note survives
  // (T-35-31), and closing it from the refresh callback below is exactly what defeated
  // that.
  const handleDialogOpenChange = (next: boolean) => {
    setDialogOpen(next)
    if (!next) setEditingPerson(null)
  }

  // Refresh only — never close. It is deliberately near-empty, and that is not an
  // oversight or a stale list. `refresh` is an optional prop and no parent passes one on
  // this surface, so the body runs nothing; what keeps the table current is the server
  // action itself. Measured for WR-12 against Next 16.1.6: an action that calls
  // `revalidatePath` at all re-renders the CURRENT client tree a few milliseconds after
  // the action resolves, whichever path it names, and createPerson / updatePerson both
  // call it. A `router.refresh()` here would buy a second fetch of a tree the action has
  // already sent. The optional hook is kept for a parent that wants to react to a save.
  const handleRecordSaved = () => {
    refresh?.()
  }

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (value) {
        router.push(`/people?search=${encodeURIComponent(value)}&page=1`)
      } else {
        router.push("/people")
      }
    }, 300)
  }

  /**
   * A person's display name, composed exactly as `columns.tsx` composes it for the Name cell and
   * as the single-record delete dialog composes it below — `firstName` and `lastName` are separate
   * columns on the `people` table, so there is no single field to read. The failure report and the
   * checkbox's accessible name must name a record the way the table names it, so all four
   * compositions have to agree.
   *
   * `useCallback` because the shared select-column hook memoises on this identity: a fresh
   * function every render would rebuild the column definition, and with it the table's column
   * model, on every paint.
   */
  const getPersonLabel = useCallback(
    (person: Person) => `${person.firstName} ${person.lastName}`,
    [],
  )

  // PREPENDED, never appended: the checkbox is the row's first cell on every surface.
  const selectColumn = useSelectColumn<Person>(getPersonLabel)
  const columnsWithSelect = useMemo(
    () => [selectColumn, ...columns],
    [selectColumn, columns],
  )

  /**
   * The ids the bar may act on, derived DEFENSIVELY rather than read off the table.
   *
   * TanStack does not prune `rowSelection` when a row leaves `data`, so after a bulk delete the
   * keys of the deleted rows linger. Left in, they inflate the count the bar shows and are
   * resubmitted by the next action — an operation aimed at records that are already gone.
   * Intersecting with the ids actually loaded is what drops them (T-38-37).
   */
  const loadedIds = useMemo(() => new Set(data.map((r) => r.id)), [data])
  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id] && loadedIds.has(id)),
    [rowSelection, loadedIds],
  )

  /**
   * The bar's label resolver, by id rather than by row, because the bar holds ids.
   *
   * Falling back to the raw id still NAMES the record, which is what the per-record failure
   * requirement asks for; a generic stand-in would not. The bar calls this at SUBMIT time and keeps
   * the result, so a record that fails because it is already gone still has a name afterwards.
   */
  const getLabelById = useCallback(
    (id: string) => {
      const person = data.find((candidate) => candidate.id === id)
      return person ? getPersonLabel(person) : id
    },
    [data, getPersonLabel],
  )

  /**
   * What a settled bulk delete or reassign does to this surface.
   *
   * The deselection is EXPLICIT and lives here rather than in an effect: succeeded ids are deleted
   * from the map and everything else — the failed ids above all — is carried over untouched. Failed
   * records staying selected is what makes the retry a single click, and an effect watching the
   * rows array would wipe exactly that, because the revalidation each bulk action triggers lands a
   * few milliseconds after it resolves (T-38-33).
   *
   * A fully successful action clears any previous report; a partial one replaces it.
   */
  const handleOutcome = (next: BulkOutcome) => {
    setRowSelection((prev) => {
      const remaining = { ...prev }
      for (const id of next.succeeded) delete remaining[id]
      return remaining
    })
    setOutcome(next.failed.length > 0 ? next : null)
    refresh?.()
  }

  const { containerProps, rowProps } = useDataTableKeyboard({
    data,
    onEdit: handleEdit,
    onDelete: handleDeleteClick,
    onOpen: (person) => router.push(`/people/${person.id}`),
    onCreate: handleAddNew,
    getId: (person) => person.id,
  })

  const table = useReactTable({
    data,
    columns: columnsWithSelect,
    /**
     * MANDATORY, and the single most safety-relevant line in this file. TanStack's default row id
     * is the row INDEX, and `data` here is CUMULATIVE across Load More — page two re-renders the
     * same array with fifty more entries. Keyed by index, any reorder or removal silently
     * retargets the selection onto different records, and the next action is a bulk delete of
     * records the user never picked (T-38-36).
     */
    getRowId: (row) => row.id,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      refresh: refresh || (() => {}),
      onEdit: handleEdit,
      onDelete: handleDeleteClick,
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search people..."
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Person
        </Button>
      </div>
      {/*
        ABOVE THE TABLE and below the search row, never inside the fixed bar: this is a report to
        read rather than a control to press, it can run to many lines, and the bar has to stay one
        compact cluster at every viewport. It is the only place a per-record failure is named
        individually — the toast carries the counts.
      */}
      {outcome !== null && outcome.failed.length > 0 ? (
        <BulkFailureReport
          kind={outcome.kind}
          failures={outcome.failed}
          labelById={outcome.labelById}
          onDismiss={() => setOutcome(null)}
        />
      ) : null}

      <div className="rounded-md border" {...containerProps}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => {
                const rp = rowProps(index)
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    data-selected={rp["data-selected"]}
                    className={rp.className}
                    onClick={rp.onClick}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                {/*
                  Read from the TABLE, not from the `columns` prop: the prop no longer matches the
                  rendered column count now that the checkbox column is prepended here, so the
                  empty-state row would come up one cell short and misalign.
                */}
                <TableCell
                  colSpan={table.getAllLeafColumns().length}
                  className="h-24 text-center"
                >
                  No people found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() =>
              router.push(
                `/people?search=${encodeURIComponent(search)}&page=${currentPage + 1}`
              )
            }
          >
            Load More
          </Button>
        </div>
      )}

      <PersonDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        person={editingPerson}
        onRecordSaved={handleRecordSaved}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        personName={personToDelete ? `${personToDelete.firstName} ${personToDelete.lastName}` : ""}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />

      {/*
        THE LAST ELEMENT OF THE STACK, after the Load More block. The bar is `fixed`, so it would
        cover the last row and the Load More button; it renders its own `h-20` sibling spacer to buy
        that space back, and mounting it anywhere higher would inject those 80px into the middle of
        the page instead of below everything (T-38-38). With nothing selected both it and its spacer
        are absent from the DOM.

        The three server actions are passed straight through rather than wrapped, so an argument
        mismatch is a type error here rather than a runtime surprise. `entityType` is the SINGULAR
        schema literal: the bar maps it to a Trash tab, and the plural would not resolve.
      */}
      <BulkActionBar
        entityType="person"
        selectedIds={selectedIds}
        getLabel={getLabelById}
        retentionDays={retentionDays}
        owners={bulkOwners}
        onDelete={bulkDeletePeople}
        onReassign={bulkReassignPersonOwner}
        onExport={exportSelectedPeople}
        onOutcome={handleOutcome}
        onClear={() => {
          setRowSelection({})
          setOutcome(null)
        }}
      />
    </div>
  )
}
