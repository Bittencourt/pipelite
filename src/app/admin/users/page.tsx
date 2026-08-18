import { auth } from "@/auth"
import { db } from "@/db"
import { users } from "@/db/schema/users"
import { userInvites } from "@/db/schema/user-invites"
import { and, eq, isNull, desc, ne, gt } from "drizzle-orm"
import { columns, PendingUser } from "./columns"
import type { AllUser } from "./columns"
import { DataTable } from "./data-table"
import { AllUsersClient } from "./all-users-client"
import { PendingInvitesClient, type PendingInvite } from "./pending-invites-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, UserCheck, Users } from "lucide-react"
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

async function getPendingInvites(): Promise<PendingInvite[]> {
  return db
    .select({
      id: userInvites.id,
      email: userInvites.email,
      invitedByName: users.name,
      invitedByEmail: users.email,
      createdAt: userInvites.createdAt,
      expiresAt: userInvites.expiresAt,
    })
    .from(userInvites)
    .innerJoin(users, eq(userInvites.invitedBy, users.id))
    .where(
      and(
        isNull(userInvites.acceptedAt),
        gt(userInvites.expiresAt, new Date())
      )
    )
    .orderBy(desc(userInvites.createdAt))
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
  const pendingInvites = await getPendingInvites()
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
            <Mail className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t('invite.pendingInvitations')}</CardTitle>
          </div>
          <CardDescription>
            {t('invite.pendingInvitationsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PendingInvitesClient invites={pendingInvites} />
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
