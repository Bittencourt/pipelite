"use client"

import { useState, useTransition } from "react"
import {
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
import { RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { WebhookDelivery } from "@/db/schema"
import { useDeliveryColumns } from "./delivery-columns"
import { replayDelivery } from "../actions"

interface DeliveryTableProps {
  data: WebhookDelivery[]
  showReplay?: boolean
}

interface WebhookPayload {
  event?: string
  [key: string]: unknown
}

export function DeliveryTable({ data, showReplay = false }: DeliveryTableProps) {
  const t = useTranslations("admin.webhooks")
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [replayingId, setReplayingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const onToggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const columns = useDeliveryColumns({ expandedRows, onToggleExpand })

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const handleReplay = (deliveryId: string) => {
    setReplayingId(deliveryId)
    startTransition(async () => {
      const result = await replayDelivery(deliveryId)
      if (result.success) {
        toast.success(t("replaySuccess"))
      } else {
        toast.error(result.error ?? t("replayError"))
      }
      setReplayingId(null)
    })
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
              {showReplay && <TableHead>{t("replay")}</TableHead>}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const isExpanded = expandedRows.has(row.original.id)
              const payload = row.original.payload as WebhookPayload | null
              const colCount = columns.length + (showReplay ? 1 : 0)

              return (
                <>
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                    {showReplay && (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReplay(row.original.id)}
                          disabled={isPending && replayingId === row.original.id}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          {t("replay")}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${row.id}-expanded`}>
                      <TableCell colSpan={colCount} className="bg-muted/50 p-4">
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-sm font-medium mb-1">{t("payload")}</h4>
                            <pre className="text-xs bg-background rounded p-3 overflow-x-auto font-mono max-h-64 overflow-y-auto border">
                              {payload ? JSON.stringify(payload, null, 2) : "N/A"}
                            </pre>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium mb-1">{t("response")}</h4>
                            <pre className="text-xs bg-background rounded p-3 overflow-x-auto font-mono max-h-64 overflow-y-auto border">
                              {row.original.responseBody || "N/A"}
                            </pre>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length + (showReplay ? 1 : 0)}
                className="h-24 text-center"
              >
                {t("noDeliveries")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
