import { db } from "@/db"
import { users } from "@/db/schema/users"
import { and, eq, isNull, desc } from "drizzle-orm"
import { columns, PendingUser } from "./columns"
import { DataTable } from "./data-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserCheck } from "lucide-react"

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

export default async function AdminUsersPage() {
  const pendingUsers = await getPendingUsers()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground">
          Review and approve pending user signups
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Pending Approvals</CardTitle>
          </div>
          <CardDescription>
            Users who have verified their email and are waiting for approval
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={pendingUsers} />
        </CardContent>
      </Card>
    </div>
  )
}
