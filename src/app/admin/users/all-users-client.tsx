"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { DataTable } from "./data-table"
import { useAllUsersColumns, type AllUser } from "./columns"
import { EditUserDialog } from "./edit-user-dialog"

interface AllUsersClientProps {
  users: AllUser[]
  currentUserId: string
}

export function AllUsersClient({ users, currentUserId }: AllUsersClientProps) {
  const t = useTranslations("admin.users")
  const router = useRouter()
  const [editUser, setEditUser] = useState<AllUser | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showDeactivated, setShowDeactivated] = useState(false)

  const columns = useAllUsersColumns((user) => {
    setEditUser(user)
    setDialogOpen(true)
  })

  const filteredUsers = useMemo(() => {
    if (showDeactivated) return users
    return users.filter((u) => u.deletedAt === null)
  }, [users, showDeactivated])

  function handleDialogChange(open: boolean) {
    setDialogOpen(open)
    if (!open) {
      setEditUser(null)
      router.refresh()
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Checkbox
          id="show-deactivated"
          checked={showDeactivated}
          onCheckedChange={(checked: boolean) => setShowDeactivated(checked)}
        />
        <Label htmlFor="show-deactivated" className="text-sm cursor-pointer">
          {t("showDeactivated")}
        </Label>
      </div>
      <DataTable columns={columns} data={filteredUsers} />
      <EditUserDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        user={editUser}
        currentUserId={currentUserId}
      />
    </>
  )
}
