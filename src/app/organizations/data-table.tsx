"use client"

import { useMemo, useState, useRef } from "react"
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
import { Organization } from "./columns"
import { Plus, Search } from "lucide-react"
import { OrganizationDialog } from "./organization-dialog"
import { DeleteDialog } from "./delete-dialog"
import { deleteOrganization } from "./actions"
import { toast } from "sonner"
import { useDataTableKeyboard } from "@/components/keyboard"
import { useSelectColumn } from "@/components/bulk/select-column"

/**
 * The accessible name of a row's checkbox: "Select Acme Ltda", never "Select row".
 *
 * Declared at module scope on purpose. `useSelectColumn` memoises the column definition on this
 * function's identity, so an inline arrow would hand it a new identity on every render and rebuild
 * the table's whole column model on every paint.
 */
const getOrganizationLabel = (org: Organization) => org.name

interface DataTableProps {
  columns: ColumnDef<Organization, unknown>[]
  data: Organization[]
  hasMore?: boolean
  search?: string
  currentPage?: number
  refresh?: () => void
  /**
   * The configured trash retention window, or `null` when nothing is purged automatically.
   *
   * Required, and NEVER defaulted at any point on the way down: `null` is what selects the bulk
   * delete dialog's no-retention copy, so a coalesced number here would have the dialog promise a
   * window the pruner is not enforcing (T-38-10).
   */
  retentionDays: number | null
  /**
   * Reassignment targets — active users only, `deleted_at IS NULL` AND `status = 'approved'`.
   *
   * Named `bulkOwners` rather than `owners` so it cannot be conflated with a future owner FILTER
   * list on this surface. The predicate is the server page's responsibility and the bulk reassign
   * action re-validates the chosen target once before its write loop.
   */
  bulkOwners: { id: string; name: string }[]
}

export function DataTable({ columns, data, hasMore = false, search = "", currentPage = 1, refresh }: DataTableProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * BULK SELECTION LIVES HERE — in TanStack's own `rowSelection`, per list. No URL parameter, no
   * global store, no context: a selection is a transient, per-surface intent, and putting it in the
   * URL would make it survivable across a share or a reload, which is the wrong lifetime for a set
   * of records about to be deleted.
   */
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  /**
   * CLEAR ON A SEARCH CHANGE — keyed on the search STRING, never on the `data` array.
   *
   * The distinction is the whole point and it is not stylistic. Measured in Phase 35 against
   * Next 16.1.6 and recorded in `handleRecordSaved` below: an action that calls `revalidatePath` at
   * all re-renders the CURRENT client tree a few milliseconds after it resolves, whichever path it
   * names — and every bulk action calls it. A clear keyed on `data` would therefore fire in the
   * middle of a bulk action's own revalidation and wipe the failed-record selection that has to
   * survive for the retry to be one click. Succeeded ids are removed explicitly in `handleOutcome`,
   * never by a reactive clear.
   *
   * Written as React's documented adjust-state-on-a-prop-change pattern rather than as
   * `useEffect(() => setRowSelection({}), [search])` because this repo lints a synchronous state
   * update inside an effect as an ERROR. It is also the better shape: the reset happens during the
   * same render that first sees the new search, so no paint ever shows the old selection against
   * the new result set.
   */
  const [prevSearch, setPrevSearch] = useState(search)
  if (prevSearch !== search) {
    setPrevSearch(search)
    setRowSelection({})
  }

  const selectColumn = useSelectColumn<Organization>(getOrganizationLabel)

  /**
   * The shared checkbox column is PREPENDED — first column, before the existing leading column —
   * and it is composed here rather than in `columns.tsx` because that module exports a STATIC array
   * imported by a server component, so a column defined there could never call `useTranslations`
   * and its accessible name would ship as untranslated English.
   */
  const columnsWithSelect = useMemo(
    () => [selectColumn, ...columns],
    [selectColumn, columns],
  )

  /**
   * The submitted id list, derived DEFENSIVELY: the truthy keys of `rowSelection` intersected with
   * the ids actually loaded.
   *
   * TanStack does not prune `rowSelection` when a row leaves `data`, so after a successful bulk
   * delete the keys of the deleted rows would linger as phantoms inflating the count — and a
   * phantom id in a destructive submit is an action on a record the user never picked (T-38-37).
   * The intersection makes that impossible by construction, on top of the explicit clearing in
   * `handleOutcome`. It is deliberately NOT derived from the table's own selected-row model, whose
   * accessor is asserted absent from this file by a source gate.
   */
  const loadedIds = useMemo(() => new Set(data.map((r) => r.id)), [data])
  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id] && loadedIds.has(id)),
    [rowSelection, loadedIds],
  )

  const handleAddNew = () => {
    setEditingOrg(null)
    setDialogOpen(true)
  }

  const handleEdit = (org: Organization) => {
    setEditingOrg(org)
    setDialogOpen(true)
  }

  const handleDeleteClick = (org: Organization) => {
    setOrgToDelete(org)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!orgToDelete) return

    setIsDeleting(true)
    try {
      const result = await deleteOrganization(orgToDelete.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Organization deleted")
      setDeleteDialogOpen(false)
      setOrgToDelete(null)
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
    if (!next) setEditingOrg(null)
  }

  // Refresh only — never close. It is deliberately near-empty, and that is not an
  // oversight or a stale list. `refresh` is an optional prop and no parent passes one on
  // this surface, so the body runs nothing; what keeps the table current is the server
  // action itself. Measured for WR-12 against Next 16.1.6: an action that calls
  // `revalidatePath` at all re-renders the CURRENT client tree a few milliseconds after
  // the action resolves, whichever path it names, and createOrganization / updateOrganization both
  // call it. A `router.refresh()` here would buy a second fetch of a tree the action has
  // already sent. The optional hook is kept for a parent that wants to react to a save.
  const handleRecordSaved = () => {
    refresh?.()
  }

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (value) {
        router.push(`/organizations?search=${encodeURIComponent(value)}&page=1`)
      } else {
        router.push("/organizations")
      }
    }, 300)
  }

  const { containerProps, rowProps } = useDataTableKeyboard({
    data,
    onEdit: handleEdit,
    onDelete: handleDeleteClick,
    onOpen: (org) => router.push(`/organizations/${org.id}`),
    onCreate: handleAddNew,
    getId: (org) => org.id,
  })

  const table = useReactTable({
    data,
    columns: columnsWithSelect,
    /**
     * MANDATORY, and load-bearing rather than hygiene. TanStack's default row id is the row INDEX,
     * and this list's rows array is CUMULATIVE across Load More (`page.tsx` fetches
     * `PAGE_SIZE * pageNum + 1` and slices back to `PAGE_SIZE * pageNum`). With index keys any
     * reorder or removal silently retargets the selection onto different records, and the next
     * action would be a bulk delete of records the user never picked (T-38-36). Keying on the
     * record id is also exactly what makes the selection survive Load More.
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
            placeholder="Search organizations..."
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Organization
        </Button>
      </div>
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
                <TableCell
                  /*
                    Read from the TABLE, not from the `columns` prop: the prop no longer matches the
                    rendered column count now that the select column is prepended, and the visible
                    symptom of the stale count is an empty state misaligned by one cell on a
                    filtered-to-nothing list.
                  */
                  colSpan={table.getAllLeafColumns().length}
                  className="h-24 text-center"
                >
                  No organizations found.
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
                `/organizations?search=${encodeURIComponent(search)}&page=${currentPage + 1}`
              )
            }
          >
            Load More
          </Button>
        </div>
      )}

      <OrganizationDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        organization={editingOrg}
        onRecordSaved={handleRecordSaved}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        organizationName={orgToDelete?.name || ""}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </div>
  )
}
