"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { approveUser, rejectUser } from "./actions"
import { toast } from "sonner"
import { startTransition } from "react"

export type PendingUser = {
  id: string
  email: string
  createdAt: Date
  emailVerified: Date | null
}

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
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
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
