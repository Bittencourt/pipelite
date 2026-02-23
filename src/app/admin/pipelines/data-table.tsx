"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
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

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      onEdit: handleEdit,
      onDelete: handleDeleteClick,
      onSetDefault: handleSetDefault,
      settingDefaultId,
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Pipeline
        </Button>
      </div>
      <div className="rounded-md border">
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
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
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
              ))
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
