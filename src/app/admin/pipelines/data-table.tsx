"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type TableMeta,
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
import { Pipeline } from "./columns"
import { Plus } from "lucide-react"
import { PipelineDialog } from "./pipeline-dialog"
import { DeleteDialog } from "./delete-dialog"
import { deletePipeline, setDefaultPipeline } from "./actions"
import { toast } from "sonner"
import { useDataTableKeyboard } from "@/components/keyboard"

/**
 * WHAT THIS TABLE PROMISES ITS COLUMNS. A NARROWING of the one shared `TableMeta` declaration in
 * `src/types/tanstack-table.d.ts` — NOT a second interface. `Pick` selects from that same
 * declaration, so a member renamed there stops compiling here, which is the whole point.
 *
 * WHY REQUIRED-NESS LIVES HERE AND NOT THERE. Every member of the shared declaration is optional
 * and must stay optional, because it is shared by every table in the app and
 * `src/app/admin/users/data-table.tsx:41` passes only `{ refresh }` — making `onEdit` required over
 * there breaks that table, in a file a change to the declaration would never make you open. So the
 * declaration says what a table MAY pass, and this alias says what THIS table DOES pass.
 *
 * `settingDefaultId` IS IN HERE ON PURPOSE, and it is the member most likely to be got wrong: it is
 * a VALUE (`useState<string | null>(null)` below), not a callback, and the columns file never reads
 * it. It is listed because it is in the literal, and `Required<>` strips only the `?`, leaving its
 * `string | null` intact — so `null` stays assignable and the four-member object still compiles.
 *
 * MEASURED, NOT ASSUMED: deleting `settingDefaultId` from the literal below yields
 * `TS2741: Property 'settingDefaultId' is missing`. Plan 43-02 ran exactly that deletion, on this
 * member specifically because a value nobody reads is the one whose absence nothing else would
 * notice, and then reverted it.
 */
type PipelineTableMeta = Required<Pick<TableMeta<Pipeline>, "onEdit" | "onDelete" | "onSetDefault" | "settingDefaultId">>

interface DataTableProps {
  columns: ColumnDef<Pipeline, unknown>[]
  data: Pipeline[]
}

export function DataTable({ columns, data }: DataTableProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pipelineToDelete, setPipelineToDelete] = useState<Pipeline | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)

  const handleAddNew = () => {
    setEditingPipeline(null)
    setDialogOpen(true)
  }

  const handleEdit = (pipeline: Pipeline) => {
    setEditingPipeline(pipeline)
    setDialogOpen(true)
  }

  const handleDeleteClick = (pipeline: Pipeline) => {
    setPipelineToDelete(pipeline)
    setDeleteDialogOpen(true)
  }

  const handleSetDefault = async (pipeline: Pipeline) => {
    setSettingDefaultId(pipeline.id)
    try {
      const result = await setDefaultPipeline(pipeline.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`${pipeline.name} is now the default pipeline`)
      router.refresh()
    } catch {
      toast.error("Failed to set default pipeline")
    } finally {
      setSettingDefaultId(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!pipelineToDelete) return

    setIsDeleting(true)
    try {
      const result = await deletePipeline(pipelineToDelete.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Pipeline deleted")
      setDeleteDialogOpen(false)
      setPipelineToDelete(null)
      router.refresh()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSuccess = () => {
    setDialogOpen(false)
    setEditingPipeline(null)
    router.refresh()
  }

  const { containerProps, rowProps } = useDataTableKeyboard({
    data,
    onEdit: handleEdit,
    onDelete: handleDeleteClick,
    onOpen: (pipeline) => router.push(`/admin/pipelines/${pipeline.id}`),
    onCreate: handleAddNew,
    getId: (pipeline) => pipeline.id,
  })

  /**
   * Annotated, so the object is checked against the contract in BOTH directions: a missing member is
   * TS2741 here, a misspelled one is TS2353 against the shared declaration. Handed to the table by
   * reference below rather than written inline, which is the shape `src/app/trash/trash-table.tsx`
   * has used since Phase 37 — an inline literal is checked too, but nothing names what it must be.
   */
  const meta: PipelineTableMeta = {
    onEdit: handleEdit,
    onDelete: handleDeleteClick,
    onSetDefault: handleSetDefault,
    settingDefaultId,
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta,
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Pipeline
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
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No pipelines found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <PipelineDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pipeline={editingPipeline}
        onSuccess={handleSuccess}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        pipeline={pipelineToDelete}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </div>
  )
}
