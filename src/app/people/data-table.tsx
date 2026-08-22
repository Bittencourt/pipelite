"use client"

import { useState, useRef, useMemo, useCallback } from "react"
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
import { SavedViewsBar } from "@/components/views/saved-views-bar"
import { VIEW_ESCAPE_KEY, withViewEscape } from "@/lib/views/url-params"
import type { SavedViewsBarProps } from "@/lib/views/types"

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
  /**
   * Whether to RENDER the "Find duplicates" entry point. Cosmetic, never authorization — see the
   * comment at the button itself (T-39-01).
   *
   * Arrives as a prop from the server page rather than being read here: this is a `"use client"`
   * file, so the session helper is unavailable to it. That absence is grep-gated at zero
   * occurrences, which is why the helper is not named.
   */
  isAdmin?: boolean
  /**
   * ALL EIGHT of the saved-views bar's props, resolved server-side and spread straight onto it.
   *
   * One prop rather than eight loose ones, and the interface is IMPORTED rather than restated:
   * `SavedViewsBarProps` is declared once in `src/lib/views/types.ts` so the server resolver and the
   * `"use client"` bar cannot drift, and a ninth prop added there needs no edit on any of the four
   * list surfaces.
   */
  viewsBar: SavedViewsBarProps
  /**
   * The RESOLVED id of the open view, or `null` — the same value as `viewsBar.selectedViewId`, handed
   * over by itself because the three list-route writers below need only that.
   *
   * Why it is not read from `useSearchParams()` here: the bar is already this page's Suspense-wrapped
   * consumer of that hook and a second one buys nothing, and the resolved id is strictly better than
   * the raw param anyway. A `?view=<id>` whose view has since been deleted or unshared resolves to
   * `null`, so seeding from this value SCRUBS it on the next navigation instead of preserving a
   * selection that no longer exists.
   */
  selectedViewId: string | null
}

export function DataTable({ columns, data, hasMore = false, search = "", currentPage = 1, refresh, retentionDays, bulkOwners, isAdmin = false, viewsBar, selectedViewId }: DataTableProps) {
  const router = useRouter()
  // Scoped to the `dedup` namespace on purpose: this file's other labels are pre-existing English
  // literals and translating them is not this plan's business.
  const tDedup = useTranslations("dedup")
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
  /**
   * The search box is controlled by LOCAL state, resynced from the URL in the block below.
   * Declared BEFORE that block: it is read and written there, and a `const` referenced above its
   * own declaration is a temporal-dead-zone ReferenceError, not a hoisted undefined.
   *
   * This replaces an earlier `key={search}` on the `<Input>`. That did resync the box, but by
   * REMOUNTING it: the 300ms debounce fires, `router.push` lands, `search` changes, the key
   * changes, and React throws the focused DOM node away mid-typing. Pausing briefly while typing
   * a search lost the cursor.
   *
   * `value={search}` is also wrong — a value fed straight from the URL fights its own debounce on
   * every keystroke. Local state is the shape that satisfies both: it updates synchronously on
   * each keystroke so typing is never interrupted, while only the router push stays debounced,
   * and the adjust-during-render resync below still clears the box when the URL's search actually
   * changes (applying a view, choosing "All records", pressing Back — the M-9 defect, B-6).
   */
  const [searchInput, setSearchInput] = useState(search)

  const [prevSearch, setPrevSearch] = useState(search)
  if (search !== prevSearch) {
    setPrevSearch(search)
    setRowSelection({})
    setSearchInput(search)
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

  /**
   * WHAT EVERY LIST-ROUTE NAVIGATION FROM THIS TABLE STARTS FROM: an empty param set, carrying
   * `view=<id>` when a view is open.
   *
   * The seeding is the whole point and it is not tidiness. `withViewEscape` PRESERVES a selection
   * whenever a saveable filter survives the navigation — that preservation is what makes "this view,
   * modified" a state a user can reach at all (plan 40-18) — but it can only preserve what it is
   * GIVEN. A `new URLSearchParams()` seeded with nothing but `search` and `page` drops `view` and
   * destroys the selection on the first keystroke, which is exactly the defect 40-18 exists to fix.
   *
   * SEEDED FROM THE RESOLVED ID, NOT FROM THE RAW PARAM, and that is strictly better rather than
   * merely convenient: the server resolver answers `null` for a `view=<id>` whose view has since been
   * deleted or unshared, so seeding from it SCRUBS the dead id on the next navigation instead of
   * leaving it haunting the address bar. This file deliberately does not call `useSearchParams` —
   * the bar is already this page's one Suspense-wrapped consumer of that hook.
   *
   * The null guard keeps the key off entirely rather than writing the string "null" into the URL.
   */
  const seededParams = () => {
    const params = new URLSearchParams()

    if (selectedViewId !== null) params.set(VIEW_ESCAPE_KEY, selectedViewId)

    return params
  }

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (value) {
        const params = seededParams()
        params.set("search", value)
        params.set("page", "1")
        // Built as params and handed to the helper rather than concatenated: the helper rewrites the
        // whitelisted keys from its own parser, which is what gives every URL on this surface the
        // canonical key order plan 40-05 compares against a stored blob as strings.
        router.push(`/people?${withViewEscape("person", params)}`)
      } else {
        /*
         * THE SITE THAT MATTERS (T-40-50). This branch used to push the bare `"/people"`, and the
         * default-view redirect added by this plan reads a params-free URL as "send this user to
         * their default view" — so a user clearing their search box would find themselves back inside
         * the filter they were trying to leave. Routed through the helper it lands on `?view=none`,
         * which IS a param, so the guard does not fire.
         *
         * FRESH params, not the seeded ones, and the difference is only rhetorical: clearing the only
         * filter a view can carry on this surface leaves no filter, so no selection is coherent (U-2)
         * and `withViewEscape` answers `view=none` from either input. The fresh one says what it means.
         */
        router.push(`/people?${withViewEscape("person", new URLSearchParams())}`)
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
      {/*
        ITS OWN ROW, ABOVE THE TOOLBAR, AND NEVER MERGED INTO IT (R-40-2c).

        Measured, M-4: this page's toolbar ALREADY wraps to two rows at 320px with the three controls
        it carries — search cluster 50 + "Find duplicates" 133 on row one, "Add Person" on row two.
        A fourth and fifth control on that row produces four rows of ungrouped buttons, and it also
        mixes two different questions: "which slice of the list am I seeing" belongs above "search and
        create", not beside it.

        NOT STICKY AND NOT FIXED (K-8). `bulk-action-bar.tsx` at the bottom of this file already owns
        one fixed element on this page, and D-45-02 is an open UAT item about a fixed bar occluding
        content — a second one would be the same finding twice. The bar carries no positioning class
        of its own; it is a plain first child of this stack, so `space-y-4` gives it its row.
      */}
      <SavedViewsBar {...viewsBar} />
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
          {/*
            THE RE-SYNC IS LOCAL STATE, AND IT IS A BUG FIX RATHER THAN POLISH (B-6).

            `defaultValue` alone is read once, at mount, and IGNORED afterwards — and app-router
            navigation re-renders this tree WITHOUT remounting it. So applying a saved view that
            stores `search=acme` filters the list correctly while the box still shows whatever was
            in it before, and selecting "All records" clears the filter and leaves "acme" sitting
            there. Measured on the sibling surface, M-9: typed "acme" on `/organizations`, pressed
            Back, and the URL returned to `/organizations` with the input still reading "acme".
            This file's input is the same shape.

            Neither `key={search}` nor `value={search}` is the right fix. `key` resyncs by
            REMOUNTING, which destroys focus mid-typing once the debounce lands. `value={search}`
            feeds a 300ms-DEBOUNCED writer from the URL, so it fights its own debounce on every
            keystroke. Local state resynced during render (see `searchInput` above) does both jobs:
            keystrokes are immediate and never interrupted, and the box still resets on the one
            event that must reset it — the URL's search actually changing.

            The English placeholder is pre-existing and deliberately left alone — translating this
            file's literals is not this plan's business.
          */}
          <Input
            placeholder="Search people..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              handleSearchChange(e.target.value)
            }}
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
            <Link href="/duplicates?type=people">{tDedup("findDuplicates")}</Link>
          </Button>
        )}
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
          stillSelected={outcome.failed.filter((f) => loadedIds.has(f.id)).length}
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
            onClick={() => {
              /*
               * SEEDED LIKE THE SEARCH WRITER, so paging inside a view keeps the view open.
               *
               * `search` may be `""` here, and the helper treats a blank value as no filter at all:
               * the result then carries `page` and `view=none`, which is correct rather than merely
               * harmless — page 2 of an unfiltered list is not a slice anybody saved.
               */
              const params = seededParams()
              params.set("search", search)
              params.set("page", String(currentPage + 1))
              router.push(`/people?${withViewEscape("person", params)}`)
            }}
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
