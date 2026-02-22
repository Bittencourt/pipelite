"use client"

import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Users, Pencil, Trash2, Building2 } from "lucide-react"

export type Person = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
  organizationId: string | null
  organizationName: string | null
  ownerName: string | null
  createdAt: Date
}

export const columns: ColumnDef<Person, unknown>[] = [
  {
    accessorKey: "lastName",
    header: "Name",
    cell: ({ row }) => {
      const person = row.original
      return (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Link
            href={`/people/${person.id}`}
            className="font-medium hover:underline"
          >
            {person.firstName} {person.lastName}
          </Link>
        </div>
      )
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => {
      const email = row.getValue("email") as string | null
      return email || <span className="text-muted-foreground">-</span>
    },
  },
  {
    accessorKey: "phone",
    header: "Phone",
    cell: ({ row }) => {
      const phone = row.getValue("phone") as string | null
      return phone || <span className="text-muted-foreground">-</span>
    },
  },
  {
    accessorKey: "organizationName",
    header: "Organization",
    cell: ({ row }) => {
      const person = row.original
      if (!person.organizationId || !person.organizationName) {
        return <span className="text-muted-foreground">-</span>
      }
      return (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Link
            href={`/organizations/${person.organizationId}`}
            className="hover:underline"
          >
            {person.organizationName}
          </Link>
        </div>
      )
    },
  },
  {
    accessorKey: "ownerName",
    header: "Owner",
    cell: ({ row }) => {
      const ownerName = row.getValue("ownerName") as string | null
      return ownerName || <span className="text-muted-foreground">-</span>
    },
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => {
      const createdAt = row.getValue("createdAt") as Date
      return new Date(createdAt).toLocaleDateString()
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const person = row.original
      // @ts-expect-error - meta callbacks are passed via table options
      const onEdit = table.options.meta?.onEdit
      // @ts-expect-error - meta callbacks are passed via table options
      const onDelete = table.options.meta?.onDelete

      return (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit?.(person)}
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete?.(person)}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      )
    },
  },
]
