"use client"

import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Building2, ExternalLink, Pencil, Trash2 } from "lucide-react"
import { useFormatter, useTranslations } from 'next-intl'

export type Organization = {
  id: string
  name: string
  website: string | null
  industry: string | null
  notes: string | null
  ownerName: string | null
  createdAt: Date
}

// Client component for formatted date display
function FormattedDate({ date }: { date: Date }) {
  const format = useFormatter()
  return format.dateTime(date, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Hook to get column definitions with translations
export function useColumns(): ColumnDef<Organization, unknown>[] {
  const t = useTranslations('organizations')
  
  return [
    {
      accessorKey: "name",
      header: t('name'),
      cell: ({ row }) => {
        const name = row.getValue("name") as string
        return (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Link
              href={`/organizations/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {name}
            </Link>
          </div>
        )
      },
    },
    {
      accessorKey: "website",
      header: t('website'),
      cell: ({ row }) => {
        const website = row.getValue("website") as string | null
        if (!website) {
          return <span className="text-muted-foreground">-</span>
        }
        return (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="max-w-[200px] truncate">{website}</span>
          </a>
        )
      },
    },
    {
      accessorKey: "industry",
      header: t('industry'),
      cell: ({ row }) => {
        const industry = row.getValue("industry") as string | null
        return industry || <span className="text-muted-foreground">-</span>
      },
    },
    {
      accessorKey: "ownerName",
      header: t('owner'),
      cell: ({ row }) => {
        const ownerName = row.getValue("ownerName") as string | null
        return ownerName || <span className="text-muted-foreground">-</span>
      },
    },
    {
      accessorKey: "createdAt",
      header: t('created'),
      cell: ({ row }) => {
        const createdAt = row.getValue("createdAt") as Date
        return <FormattedDate date={new Date(createdAt)} />
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row, table }) => {
        const organization = row.original
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
              onClick={() => onEdit?.(organization)}
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Edit</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onDelete?.(organization)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        )
      },
    },
  ]
}

// Keep legacy export for backward compatibility (without translations)
export const columns: ColumnDef<Organization, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const name = row.getValue("name") as string
      return (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Link
            href={`/organizations/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {name}
          </Link>
        </div>
      )
    },
  },
  {
    accessorKey: "website",
    header: "Website",
    cell: ({ row }) => {
      const website = row.getValue("website") as string | null
      if (!website) {
        return <span className="text-muted-foreground">-</span>
      }
      return (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          <span className="max-w-[200px] truncate">{website}</span>
        </a>
      )
    },
  },
  {
    accessorKey: "industry",
    header: "Industry",
    cell: ({ row }) => {
      const industry = row.getValue("industry") as string | null
      return industry || <span className="text-muted-foreground">-</span>
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
      return <FormattedDate date={new Date(createdAt)} />
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const organization = row.original
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
            onClick={() => onEdit?.(organization)}
          >
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete?.(organization)}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      )
    },
  },
]
