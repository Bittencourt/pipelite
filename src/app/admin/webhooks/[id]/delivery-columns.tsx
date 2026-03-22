"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import type { WebhookDelivery } from "@/db/schema"

const MAX_RETRIES = 5

interface WebhookPayload {
  event: string
  entity: string
  entityId: string
  action: "created" | "updated" | "deleted"
  data: unknown
  timestamp: string
}

function FormattedDateTime({ date }: { date: Date }) {
  const format = useFormatter()
  return (
    <>
      {format.dateTime(date, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "delivered"
      ? "default"
      : status === "failed"
        ? "destructive"
        : "secondary"
  const className =
    status === "delivered"
      ? "bg-green-500"
      : status === "pending"
        ? "bg-yellow-500 text-white"
        : ""

  return (
    <Badge variant={variant} className={className}>
      {status}
    </Badge>
  )
}

export function useDeliveryColumns({
  expandedRows,
  onToggleExpand,
}: {
  expandedRows: Set<string>
  onToggleExpand: (id: string) => void
}): ColumnDef<WebhookDelivery>[] {
  const t = useTranslations("admin.webhooks")

  return [
    {
      id: "expand",
      header: "",
      cell: ({ row }) => {
        const isExpanded = expandedRows.has(row.original.id)
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => onToggleExpand(row.original.id)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        )
      },
    },
    {
      accessorKey: "createdAt",
      header: t("timestamp"),
      cell: ({ row }) => <FormattedDateTime date={new Date(row.original.createdAt)} />,
    },
    {
      id: "event",
      header: t("event"),
      cell: ({ row }) => {
        const payload = row.original.payload as WebhookPayload | null
        return (
          <Badge variant="secondary" className="text-xs font-mono">
            {payload?.event ?? "unknown"}
          </Badge>
        )
      },
    },
    {
      accessorKey: "httpStatus",
      header: t("httpStatus"),
      cell: ({ row }) => {
        const status = row.original.httpStatus
        if (status === null || status === undefined) {
          return <span className="text-muted-foreground">N/A</span>
        }
        const isSuccess = status >= 200 && status < 300
        return (
          <span className={isSuccess ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
            {status}
          </span>
        )
      },
    },
    {
      id: "attempt",
      header: t("attempt"),
      cell: ({ row }) => {
        const retryCount = row.original.retryCount
        const status = row.original.status
        // For delivered on first try (retryCount=0), show "1/5"
        // For failed after exhausting retries, show retryCount/5
        // For in-progress retries, show retryCount/5
        const display =
          status === "delivered" && retryCount === 0
            ? `1/${MAX_RETRIES}`
            : `${retryCount}/${MAX_RETRIES}`
        return <span className="font-mono text-sm">{display}</span>
      },
    },
    {
      accessorKey: "status",
      header: t("statusHeader"),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ]
}
