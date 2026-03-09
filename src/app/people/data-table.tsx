"use client"

import { useState, useRef } from "react"
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
import { Input } from "@/components/ui/input"
import { Person } from "./columns"
import { Plus, Search } from "lucide-react"
import { PersonDialog } from "./person-dialog"
import { DeleteDialog } from "./delete-dialog"
import { deletePerson } from "./actions"
import { toast } from "sonner"
import { useDataTableKeyboard } from "@/components/keyboard"

interface DataTableProps {
  columns: ColumnDef<Person, unknown>[]
  data: Person[]
  hasMore?: boolean
  search?: string
  currentPage?: number
  refresh?: () => void
}

export function DataTable({ columns, data, hasMore = false, search = "", currentPage = 1, refresh }: DataTableProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        onOpenChange={setDialogOpen}
        person={editingPerson}
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
