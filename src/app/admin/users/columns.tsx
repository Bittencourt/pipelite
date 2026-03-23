"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { approveUser, rejectUser } from "./actions"
import { toast } from "sonner"
import { startTransition } from "react"
import { useFormatter, useTranslations } from 'next-intl'

export type PendingUser = {
  id: string
  email: string
  createdAt: Date
  emailVerified: Date | null
}

// Client component for formatted date display
function FormattedDate({ date }: { date: Date }) {
  const format = useFormatter()
  return format.dateTime(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// Hook to get column definitions with translations
export function useColumns(): ColumnDef<PendingUser>[] {
  const t = useTranslations('admin.users')
  
  return [
    {
      accessorKey: "email",
      header: t('email'),
      cell: ({ row }) => {
        return <span className="font-medium">{row.getValue("email")}</span>
      },
    },
    {
      accessorKey: "emailVerified",
      header: t('verified'),
      cell: ({ row }) => {
        const verified = row.getValue("emailVerified") as Date | null
        if (!verified) {
          return <Badge variant="secondary">{t('notVerified')}</Badge>
        }
        return (
          <Badge variant="default" className="bg-green-500">
            {t('verified')}
          </Badge>
        )
      },
    },
    {
      accessorKey: "createdAt",
      header: t('requested'),
      cell: ({ row }) => {
        const date = new Date(row.getValue("createdAt"))
        return <FormattedDate date={date} />
      },
    },
    {
      id: "actions",
      header: t('actions'),
      cell: ({ row, table }) => {
        const user = row.original
        const meta = table.options.meta as { refresh: () => void } | undefined

        const handleApprove = () => {
          startTransition(async () => {
            try {
              await approveUser(user.id)
              toast.success("User approved successfully")
              meta?.refresh()
            } catch (error) {
              toast.error("Failed to approve user")
            }
          })
        }

        const handleReject = () => {
          startTransition(async () => {
            try {
              await rejectUser(user.id)
              toast.success("User rejected")
              meta?.refresh()
            } catch (error) {
              toast.error("Failed to reject user")
            }
          })
        }

        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleApprove}
            >
              {t('approve')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReject}
            >
              {t('reject')}
            </Button>
          </div>
        )
      },
    },
  ]
}

// All Users types and columns
export type AllUser = {
  id: string
  email: string
  name: string | null
  role: "admin" | "member"
  status: "pending_verification" | "pending_approval" | "approved" | "rejected"
  createdAt: Date
  deletedAt: Date | null
}

// Client component for formatted date display (short)
function FormattedDateShort({ date }: { date: Date }) {
  const format = useFormatter()
  return format.dateTime(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function useAllUsersColumns(onEdit: (user: AllUser) => void): ColumnDef<AllUser>[] {
  const t = useTranslations('admin.users')

  return [
    {
      accessorKey: "name",
      header: t('name'),
      cell: ({ row }) => {
        const name = row.getValue("name") as string | null
        if (!name) {
          return <span className="text-muted-foreground">{t('noName')}</span>
        }
        return <span>{name}</span>
      },
    },
    {
      accessorKey: "email",
      header: t('email'),
      cell: ({ row }) => {
        return <span className="font-medium">{row.getValue("email")}</span>
      },
    },
    {
      accessorKey: "role",
      header: t('role'),
      cell: ({ row }) => {
        const role = row.getValue("role") as AllUser["role"]
        return (
          <Badge variant={role === "admin" ? "default" : "secondary"}>
            {t(`roles.${role}`)}
          </Badge>
        )
      },
    },
    {
      id: "status",
      header: t('status'),
      cell: ({ row }) => {
        const user = row.original
        if (user.deletedAt) {
          return <Badge variant="destructive">{t('deactivated')}</Badge>
        }
        const status = user.status
        const variantMap: Record<AllUser["status"], "default" | "secondary" | "outline" | "destructive"> = {
          approved: "default",
          pending_approval: "secondary",
          pending_verification: "outline",
          rejected: "destructive",
        }
        return (
          <Badge
            variant={variantMap[status]}
            className={status === "approved" ? "bg-green-500" : undefined}
          >
            {t(`statuses.${status}`)}
          </Badge>
        )
      },
    },
    {
      id: "actions",
      header: t('actions'),
      cell: ({ row }) => {
        return (
          <Button size="sm" variant="outline" onClick={() => onEdit(row.original)}>
            {t('editUser')}
          </Button>
        )
      },
    },
  ]
}

// Keep legacy export for backward compatibility (without translations)
export const columns: ColumnDef<PendingUser>[] = [
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => {
      return <span className="font-medium">{row.getValue("email")}</span>
    },
  },
  {
    accessorKey: "emailVerified",
    header: "Verified",
    cell: ({ row }) => {
      const verified = row.getValue("emailVerified") as Date | null
      if (!verified) {
        return <Badge variant="secondary">Not verified</Badge>
      }
      return (
        <Badge variant="default" className="bg-green-500">
          Verified
        </Badge>
      )
    },
  },
  {
    accessorKey: "createdAt",
    header: "Requested",
    cell: ({ row }) => {
      const date = new Date(row.getValue("createdAt"))
      return <FormattedDate date={date} />
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row, table }) => {
      const user = row.original
      const meta = table.options.meta as { refresh: () => void } | undefined

      const handleApprove = () => {
        startTransition(async () => {
          try {
            await approveUser(user.id)
            toast.success("User approved successfully")
            meta?.refresh()
          } catch (error) {
            toast.error("Failed to approve user")
          }
        })
      }

      const handleReject = () => {
        startTransition(async () => {
          try {
            await rejectUser(user.id)
            toast.success("User rejected")
            meta?.refresh()
          } catch (error) {
            toast.error("Failed to reject user")
          }
        })
      }

      return (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleApprove}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleReject}
          >
            Reject
          </Button>
        </div>
      )
    },
  },
]
