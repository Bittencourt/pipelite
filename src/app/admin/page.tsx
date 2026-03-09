import { auth } from "@/auth"
import { db } from "@/db"
import { users } from "@/db/schema/users"
import { eq, count, and, isNull } from "drizzle-orm"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCheck, Layers, SlidersHorizontal, Database, Key } from "lucide-react"
import { getTranslations } from 'next-intl/server'

export default async function AdminDashboard() {
  const session = await auth()
  const t = await getTranslations('admin.dashboard')

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

  const userName = session?.user?.email?.split("@")[0] || ""

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('welcomeBack', { name: userName })}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('pendingApprovals')}
            </CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount.count}</div>
            <p className="text-xs text-muted-foreground">
              {t('usersAwaiting')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('totalUsers')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedCount.count}</div>
            <p className="text-xs text-muted-foreground">
              {t('approvedAccounts')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('teamMembers')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{memberCount.count}</div>
            <p className="text-xs text-muted-foreground">
              {t('nonAdminMembers')}
            </p>
          </CardContent>
        </Card>
      </div>

      {pendingCount.count > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('actionRequired')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {t('usersWaiting', { count: pendingCount.count })}
            </p>
            <a
              href="/admin/users"
              className="text-primary hover:underline mt-2 inline-block"
            >
              {t('reviewPending')}
            </a>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-4">{t('adminTools')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/admin/users">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t('userManagement')}</CardTitle>
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription>
                  {t('manageUsers')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/pipelines">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t('pipelines')}</CardTitle>
                  <Layers className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription>
                  {t('configurePipelines')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/fields">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t('customFields')}</CardTitle>
                  <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription>
                  {t('configureCustomFields')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">{t('dataManagement')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/admin/export">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t('exportData')}</CardTitle>
                  <Database className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription>
                  {t('exportDescription')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/admin/import/pipedrive-api">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t('pipedriveImport')}</CardTitle>
                  <Key className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription>
                  {t('pipedriveImportDescription')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}
