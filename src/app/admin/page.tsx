import { auth } from "@/auth"
import { db } from "@/db"
import { users } from "@/db/schema/users"
import { eq, count, and, isNull } from "drizzle-orm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCheck } from "lucide-react"

export default async function AdminDashboard() {
  const session = await auth()

  // Get counts for dashboard
  const [pendingCount] = await db
    .select({ count: count() })
    .from(users)
    .where(
      and(
        eq(users.status, "pending_approval"),
        isNull(users.deletedAt)
      )
    )

  const [approvedCount] = await db
    .select({ count: count() })
    .from(users)
    .where(
      and(
        eq(users.status, "approved"),
        isNull(users.deletedAt)
      )
    )

  const [memberCount] = await db
    .select({ count: count() })
    .from(users)
    .where(
      and(
        eq(users.role, "member"),
        eq(users.status, "approved"),
        isNull(users.deletedAt)
      )
    )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session?.user?.email?.split("@")[0]}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Approvals
            </CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount.count}</div>
            <p className="text-xs text-muted-foreground">
              Users awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedCount.count}</div>
            <p className="text-xs text-muted-foreground">
              Approved accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Team Members
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memberCount.count}</div>
            <p className="text-xs text-muted-foreground">
              Non-admin members
            </p>
          </CardContent>
        </Card>
      </div>

      {pendingCount.count > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Action Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You have {pendingCount.count} user{pendingCount.count !== 1 ? "s" : ""} waiting for approval.
            </p>
            <a
              href="/admin/users"
              className="text-primary hover:underline mt-2 inline-block"
            >
              Review pending users
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
