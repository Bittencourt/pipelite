"use client"

import { useState } from "react"
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
import { useTranslations } from "next-intl"
import { useColumns, type WebhookRow } from "./columns"
import { WebhookDialog } from "./webhook-dialog"
import { DeleteDialog } from "./delete-dialog"

interface DataTableProps {
  data: WebhookRow[]
  users: { id: string; email: string }[]
}

export function DataTable({ data, users }: DataTableProps) {
  const t = useTranslations("admin.webhooks")
  const [editWebhook, setEditWebhook] = useState<WebhookRow | null>(null)
  const [deleteWebhook, setDeleteWebhook] = useState<WebhookRow | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const columns = useColumns({
    onEdit: (webhook) => setEditWebhook(webhook),
    onDelete: (webhook) => setDeleteWebhook(webhook),
  })

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <>
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
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t("noWebhooks")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <WebhookDialog
        open={!!editWebhook}
        onOpenChange={(open) => !open && setEditWebhook(null)}
        webhook={editWebhook}
        users={users}
      />

      <WebhookDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users}
      />

      <DeleteDialog
        open={!!deleteWebhook}
        onOpenChange={(open) => !open && setDeleteWebhook(null)}
        webhook={deleteWebhook}
      />
    </>
  )
}

export { DataTable as WebhooksDataTable }
