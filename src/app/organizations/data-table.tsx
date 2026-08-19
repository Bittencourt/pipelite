"use client"

import { useMemo, useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
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
import {
  bulkDeleteOrganizations,
  bulkReassignOrganizationOwner,
  deleteOrganization,
  exportSelectedOrganizations,
} from "./actions"
import { toast } from "sonner"
import { useDataTableKeyboard } from "@/components/keyboard"
import { BulkActionBar } from "@/components/bulk/bulk-action-bar"
import { BulkFailureReport } from "@/components/bulk/bulk-failure-report"
import { useSelectColumn } from "@/components/bulk/select-column"
import type { BulkOutcome } from "@/lib/bulk/types"

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
  /**
   * Whether to RENDER the "Find duplicates" entry point. Cosmetic, never authorization — see the
   * comment at the button itself (T-39-01).
   *
   * Arrives as a prop from the server page rather than being read here: this is a `"use client"`
   * file, so the session helper is unavailable to it. That absence is grep-gated at zero
   * occurrences, which is why the helper is not named.
   */
  isAdmin?: boolean
}

export function DataTable({
  columns,
  data,
  hasMore = false,
  search = "",
  currentPage = 1,
  refresh,
  retentionDays,
  bulkOwners,
  isAdmin = false,
}: DataTableProps) {
  const router = useRouter()
  // Scoped to the `dedup` namespace on purpose: this file's other labels are pre-existing English
  // literals and translating them is not this plan's business.
  const tDedup = useTranslations("dedup")
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
   * The last bulk result that had at least one per-record failure, or `null`.
   *
   * It is held here rather than inside the bar because the report it feeds renders ABOVE the table
   * while the bar is fixed to the bottom of the viewport, and because it must outlive the dialog the
   * action was confirmed in.
   */
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null)

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

  /**
   * What happens after a bulk delete or reassign settles — the one place the selection is reconciled
   * against a result.
   *
   * SUCCEEDED IDS ARE DROPPED AND FAILED IDS ARE KEPT, EXPLICITLY AND HERE. Not in an effect: an
   * effect would have to key on something that changes when the result arrives, and the only such
   * value is the server-supplied rows array, which `revalidatePath` also churns mid-action. Keeping
   * the failed records selected is what makes the retry the same button rather than a re-pick, and
   * it is a locked decision (38-UI-SPEC § Surface 7).
   *
   * The failed ids are re-asserted rather than merely left alone, so the reconciliation is correct
   * even for a record whose key was somehow absent from the previous map.
   */
  const handleOutcome = (next: BulkOutcome) => {
    const succeeded = new Set(next.succeeded)

    setRowSelection((prev) => {
      const remaining: RowSelectionState = {}

      for (const id of Object.keys(prev)) {
        if (prev[id] && !succeeded.has(id)) remaining[id] = true
      }

      for (const failure of next.failed) {
        remaining[failure.id] = true
      }

      return remaining
    })

    // A fully successful action REPLACES any previous report with nothing, so a stale list of
    // failures from an earlier attempt cannot outlive the retry that fixed it.
    setOutcome(next.failed.length > 0 ? next : null)

    // Same convention as `handleRecordSaved` above, and for the same reason: the action's own
    // `revalidatePath` is what re-renders the rows, so this is only the optional parent hook.
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
      {/*
        `flex-wrap` and `gap-2` ARE LOAD-BEARING, not tidying. This row was
        `flex items-center justify-between` with no wrap until a third control landed on it, and a
        non-wrapping row with three controls is exactly the defect Phase 45 spent a rebuild fixing
        on `/deals` and `/activities` — measured at 412px and at 356/425/430px against a 305px
        client width. `gap-2` is what keeps the wrapped rows from touching.

        `min-w-0` on the search cluster below is the other half: a flex item's default
        `min-width: auto` refuses to shrink below its content, and that default is the mechanism
        behind every overflow Phase 45 measured (R-4). Do not remove either class.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
            defaultValue={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="max-w-sm"
          />
        </div>
        {/*
          VISIBILITY ONLY — `isAdmin` decides whether this button is RENDERED and is NEVER the
          authorization. `src/app/duplicates/layout.tsx` is the authority and redirects any
          non-admin who reaches the route by URL (T-39-01). It is hidden rather than disabled
          because a control that always redirects is worse than no control, and the same
          visibility-only pattern is used on `/trash` for the purge action.

          Deliberately NOT a global-nav link: Phase 45 measured the header's 320px budget at 190px
          of 241 usable and every nav link is `hidden md:flex`, so a seventh link is real risk
          against a route used a few times a year (L-10). No icon either — the label alone is the
          narrowest this control can be, and it shares a row with two others.
        */}
        {isAdmin && (
          <Button asChild variant="outline">
            <Link href="/duplicates?type=organizations">{tDedup("findDuplicates")}</Link>
          </Button>
        )}
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Organization
        </Button>
      </div>
      {/*
        ABOVE THE TABLE, below the search row — a report to READ, not a control to press, and it can
        run to as many lines as there were failures. It is deliberately not inside the fixed bar,
        which has to stay one compact control cluster down to 320px.
      */}
      {outcome !== null && outcome.failed.length > 0 && (
        <BulkFailureReport
          kind={outcome.kind}
          failures={outcome.failed}
          labelById={outcome.labelById}
          stillSelected={outcome.failed.filter((f) => loadedIds.has(f.id)).length}
          onDismiss={() => setOutcome(null)}
        />
      )}

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

      {/*
        LAST IN THE STACK, AFTER Load More, AND THAT POSITION IS THE POINT. The bar renders its own
        `h-20` sibling spacer to buy back the space its `fixed` element covers, so mounted any higher
        the spacer would inject 80px into the MIDDLE of the page. Placed here it changes only what
        sits below everything, and no row the user is aiming at moves (T-38-38).

        The three server actions are passed as the imported functions themselves, never wrapped in a
        local closure that reshapes the arguments, so the bar's `(ids)` and `(ids, ownerId)` call
        shapes ARE the actions' own signatures and any mismatch is a type error rather than a runtime
        surprise. No keyboard binding is added here either: `Escape` is owned by the bar, and the
        list's own bare-letter hotkeys keep their single-record meaning.
      */}
      <BulkActionBar
        entityType="organization"
        selectedIds={selectedIds}
        getLabel={(id) => data.find((r) => r.id === id)?.name ?? id}
        retentionDays={retentionDays}
        owners={bulkOwners}
        onDelete={bulkDeleteOrganizations}
        onReassign={bulkReassignOrganizationOwner}
        onExport={exportSelectedOrganizations}
        onOutcome={handleOutcome}
        onClear={() => {
          setRowSelection({})
          setOutcome(null)
        }}
      />
    </div>
  )
}
