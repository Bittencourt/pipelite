import { auth } from "@/auth"
import { db } from "@/db"
import { users } from "@/db/schema/users"
import { and, eq, isNull, desc, ne } from "drizzle-orm"
import { columns, PendingUser } from "./columns"
import type { AllUser } from "./columns"
import { DataTable } from "./data-table"
import { AllUsersClient } from "./all-users-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserCheck, Users } from "lucide-react"
import { getTranslations } from 'next-intl/server'
import { InviteDialog } from "./invite-dialog"

async function getPendingUsers(): Promise<PendingUser[]> {
  const pendingUsers = await db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(
      and(
        eq(users.status, "pending_approval"),
        isNull(users.deletedAt)
      )
    )
    .orderBy(desc(users.createdAt))

  return pendingUsers.map((user) => ({
    ...user,
    createdAt: user.createdAt,
    emailVerified: user.emailVerified,
  }))
}

async function getAllUsers(): Promise<AllUser[]> {
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(ne(users.status, "pending_approval"))
    .orderBy(desc(users.createdAt))

  return allUsers
}

export default async function AdminUsersPage() {
  const session = await auth()
  const pendingUsers = await getPendingUsers()
  const allUsers = await getAllUsers()
  const t = await getTranslations('admin.users')
  const currentUserId = session?.user?.id ?? ""

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('userManagement')}</h1>
          <p className="text-muted-foreground">
            {t('reviewApprove')}
          </p>
        </div>
        <InviteDialog />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t('pendingApprovals')}</CardTitle>
          </div>
          <CardDescription>
            {t('waitingForApproval')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={pendingUsers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t('allUsers')}</CardTitle>
          </div>
          <CardDescription>
            {t('allUsersDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AllUsersClient users={allUsers} currentUserId={currentUserId} />
        </CardContent>
      </Card>
    </div>
  )
}
