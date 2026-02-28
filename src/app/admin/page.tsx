import { auth } from "@/auth"
import { db } from "@/db"
import { users } from "@/db/schema/users"
import { eq, count, and, isNull } from "drizzle-orm"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCheck, Layers, SlidersHorizontal } from "lucide-react"

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

      <div>
        <h2 className="text-xl font-semibold mb-4">Admin Tools</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/admin/users">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">User Management</CardTitle>
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription>
                  Manage user accounts, roles, and approvals
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/pipelines">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Pipelines</CardTitle>
                  <Layers className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription>
                  Configure sales pipelines and stages
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/fields">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Custom Fields</CardTitle>
                  <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription>
                  Configure custom fields for organizations, people, deals, and activities
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}
