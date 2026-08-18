"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { useFormatter, useTranslations } from "next-intl"
import { DataTable } from "./data-table"

export type PendingInvite = {
  id: string
  email: string
  invitedByName: string | null
  invitedByEmail: string
  createdAt: Date
  expiresAt: Date
}

function FormattedDate({ date }: { date: Date }) {
  const format = useFormatter()
  return format.dateTime(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function usePendingInviteColumns(): ColumnDef<PendingInvite, unknown>[] {
  const t = useTranslations("admin.users.invite")

  return [
    {
      accessorKey: "email",
      header: t("email"),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.email}</span>
      ),
    },
    {
      id: "invitedBy",
      header: t("invitedBy"),
      cell: ({ row }) => (
        <span>{row.original.invitedByName || row.original.invitedByEmail}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: t("sent"),
      cell: ({ row }) => <FormattedDate date={row.original.createdAt} />,
    },
    {
      accessorKey: "expiresAt",
      header: t("expires"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FormattedDate date={row.original.expiresAt} />
          <Badge variant="secondary">{t("pending")}</Badge>
        </div>
      ),
    },
  ]
}

export function PendingInvitesClient({ invites }: { invites: PendingInvite[] }) {
  const t = useTranslations("admin.users.invite")
  const columns = usePendingInviteColumns()

  return (
    <DataTable
      columns={columns}
      data={invites}
      emptyMessage={t("noPendingInvites")}
    />
  )
}
