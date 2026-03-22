"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Pencil, Trash2 } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import Link from "next/link"

export type WebhookRow = {
  id: string
  url: string
  events: string[]
  active: boolean
  createdAt: Date
  ownerEmail: string
  userId: string
}

function FormattedDate({ date }: { date: Date }) {
  const format = useFormatter()
  return format.dateTime(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function useColumns(callbacks: {
  onEdit: (webhook: WebhookRow) => void
  onDelete: (webhook: WebhookRow) => void
}): ColumnDef<WebhookRow>[] {
  const t = useTranslations("admin.webhooks")

  return [
    {
      accessorKey: "url",
      header: t("url"),
      cell: ({ row }) => {
        const url = row.getValue("url") as string
        return (
          <Link
            href={`/admin/webhooks/${row.original.id}`}
            className="font-medium text-primary hover:underline max-w-[300px] truncate block"
            title={url}
          >
            {url.length > 50 ? url.slice(0, 50) + "..." : url}
          </Link>
        )
      },
    },
    {
      accessorKey: "ownerEmail",
      header: t("owner"),
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.getValue("ownerEmail")}</span>
      ),
    },
    {
      accessorKey: "events",
      header: t("events"),
      cell: ({ row }) => {
        const events = row.getValue("events") as string[]
        return (
          <div className="flex flex-wrap gap-1 max-w-[250px]">
            {events.slice(0, 3).map((event) => (
              <Badge key={event} variant="secondary" className="text-xs">
                {event}
              </Badge>
            ))}
            {events.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{events.length - 3}
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "active",
      header: t("active"),
      cell: ({ row }) => {
        const active = row.getValue("active") as boolean
        return (
          <Badge variant={active ? "default" : "secondary"} className={active ? "bg-green-500" : ""}>
            {active ? t("statusActive") : t("statusInactive")}
          </Badge>
        )
      },
    },
    {
      accessorKey: "createdAt",
      header: t("createdAt"),
      cell: ({ row }) => {
        const date = new Date(row.getValue("createdAt"))
        return <FormattedDate date={date} />
      },
    },
    {
      id: "actions",
      header: t("actionsHeader"),
      cell: ({ row }) => {
        const webhook = row.original
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => callbacks.onEdit(webhook)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => callbacks.onDelete(webhook)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )
      },
    },
  ]
}
