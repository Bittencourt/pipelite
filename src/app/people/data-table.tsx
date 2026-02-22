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
import { Person } from "./columns"
import { Plus } from "lucide-react"
import { PersonDialog } from "./person-dialog"
import { DeleteDialog } from "./delete-dialog"
import { deletePerson } from "./actions"
import { toast } from "sonner"

interface DataTableProps {
  columns: ColumnDef<Person, unknown>[]
  data: Person[]
  organizations: { id: string; name: string }[]
  refresh?: () => void
}

export function DataTable({ columns, data, organizations, refresh }: DataTableProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

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

  const handleSuccess = () => {
    setDialogOpen(false)
    setEditingPerson(null)
    refresh?.()
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      refresh: refresh || (() => {}),
      onEdit: handleEdit,
      onDelete: handleDeleteClick,
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Person
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
                  No people found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <PersonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        person={editingPerson}
        organizations={organizations}
        onSuccess={handleSuccess}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        personName={personToDelete ? `${personToDelete.firstName} ${personToDelete.lastName}` : ""}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </div>
  )
}
