"use client"

import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Layers, Pencil, Trash2, Star } from "lucide-react"

export type Pipeline = {
  id: string
  name: string
  isDefault: number | null
  stageCount: number
  createdAt: Date
}

export const columns: ColumnDef<Pipeline, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const name = row.getValue("name") as string
      return (
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <Link
            href={`/admin/pipelines/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {name}
          </Link>
        </div>
      )
    },
  },
  {
    accessorKey: "stageCount",
    header: "Stages",
    cell: ({ row }) => {
      const stageCount = row.getValue("stageCount") as number
      return (
        <Badge variant="secondary">
          {stageCount} {stageCount === 1 ? "stage" : "stages"}
        </Badge>
      )
    },
  },
  {
    accessorKey: "isDefault",
    header: "Default",
    cell: ({ row }) => {
      const isDefault = row.getValue("isDefault") as number | null
      if (isDefault === 1) {
        return (
          <Badge variant="default" className="bg-primary">
            <Star className="h-3 w-3 mr-1" />
            Default
          </Badge>
        )
      }
      return <span className="text-muted-foreground">-</span>
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
      const pipeline = row.original
      // @ts-expect-error - meta callbacks are passed via table options
      const onEdit = table.options.meta?.onEdit
      // @ts-expect-error - meta callbacks are passed via table options
      const onDelete = table.options.meta?.onDelete
      // @ts-expect-error - meta callbacks are passed via table options
      const onSetDefault = table.options.meta?.onSetDefault
      const isDefault = pipeline.isDefault === 1

      return (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit?.(pipeline)}
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
          {!isDefault && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onSetDefault?.(pipeline)}
            >
              <Star className="h-4 w-4" />
              <span className="sr-only">Set as Default</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete?.(pipeline)}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      )
    },
  },
]
