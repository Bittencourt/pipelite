"use client"

import { useState } from "react"
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
import { Organization } from "./columns"
import { Plus } from "lucide-react"
import { OrganizationDialog } from "./organization-dialog"

interface DataTableProps {
  columns: ColumnDef<Organization, unknown>[]
  data: Organization[]
  refresh?: () => void
}

export function DataTable({ columns, data, refresh }: DataTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)

  const handleAddNew = () => {
    setEditingOrg(null)
    setDialogOpen(true)
  }

  const handleEdit = (org: Organization) => {
    setEditingOrg(org)
    setDialogOpen(true)
  }

  const handleDelete = (org: Organization) => {
    // Will be wired in Task 2
    console.log("Delete organization:", org.id)
  }

  const handleSuccess = () => {
    setDialogOpen(false)
    setEditingOrg(null)
    refresh?.()
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      refresh: refresh || (() => {}),
      onEdit: handleEdit,
      onDelete: handleDelete,
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Organization
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
                  No organizations found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <OrganizationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        organization={editingOrg}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
