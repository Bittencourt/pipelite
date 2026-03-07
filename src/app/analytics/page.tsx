import { auth } from "@/auth"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import {
  TrendingUp,
  Timer,
  DollarSign,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import {
  getWinRateMetrics,
  getDealVelocityMetrics,
  getPipelineValueByStage,
  getActivityCompletionMetrics,
  type DateFilter,
} from "@/lib/dashboard-queries"
import { formatCurrency } from "@/lib/currency"
import { PipelineValueChart } from "@/components/dashboard/pipeline-value-chart"
import { ActivityCompletionChart } from "@/components/dashboard/activity-completion-chart"

const ALLOWED_PERIODS: DateFilter[] = ["thisMonth", "thisQuarter", "last30", "allTime"]

function isValidPeriod(value: string | undefined): value is DateFilter {
  return ALLOWED_PERIODS.includes(value as DateFilter)
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  const tm = await getTranslations("home.metrics")

  const { period: rawPeriod } = await searchParams
  const period: DateFilter = isValidPeriod(rawPeriod) ? rawPeriod : "thisMonth"

  const [winRate, velocity, pipeline, activity] = await Promise.all([
    getWinRateMetrics(period),
    getDealVelocityMetrics(period),
    getPipelineValueByStage(),
    getActivityCompletionMetrics(period),
  ])

  const formattedTotal = formatCurrency(pipeline.total)

  const periodOptions: { key: DateFilter; label: string }[] = [
    { key: "thisMonth", label: tm("thisMonth") },
    { key: "thisQuarter", label: tm("thisQuarter") },
    { key: "last30", label: tm("last30Days") },
    { key: "allTime", label: tm("allTime") },
  ]

  return (
    <div className="container py-8 space-y-8">
      {/* Page header with period selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{tm("title")}</h1>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {periodOptions.map(({ key, label }) => (
            <Link
              key={key}
              href={`?period=${key}`}
              className={
                "inline-flex items-center px-3 py-1.5 rounded-md text-sm border transition-colors " +
                (period === key
                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                  : "border-input bg-background hover:bg-muted text-foreground")
              }
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Row 1: 4 stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Win Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tm("winRate")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {winRate.rate !== null ? `${winRate.rate}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {winRate.rate !== null
                ? tm("winRateSubtitle", { won: winRate.won, lost: winRate.lost })
                : tm("winRateNoData")}
            </p>
          </CardContent>
        </Card>

        {/* Deal Velocity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tm("dealVelocity")}</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {velocity.avgDays !== null
                ? tm("dealVelocityDays", { days: velocity.avgDays })
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {velocity.avgDays !== null
                ? tm("dealVelocitySubtitle", { count: velocity.count })
                : tm("dealVelocityNoData")}
            </p>
          </CardContent>
        </Card>

        {/* Pipeline Value */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tm("pipelineValue")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pipeline.stages.length > 0 ? formattedTotal : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {pipeline.stages.length > 0
                ? tm("pipelineValueSubtitle", { count: pipeline.stages.length })
                : tm("pipelineValueEmpty")}
            </p>
          </CardContent>
        </Card>

        {/* Activity Completion */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tm("activityCompletion")}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activity.rate !== null ? `${activity.rate}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {activity.rate !== null
                ? tm("activityCompletionSubtitle", {
                    completed: activity.completed,
                    total: activity.total,
                  })
                : tm("activityCompletionNoData")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Pipeline Value Chart (full width) */}
      <Card>
        <CardHeader>
          <CardTitle>{tm("pipelineValue")}</CardTitle>
        </CardHeader>
        <CardContent>
          <PipelineValueChart
            data={pipeline.stages}
          />
        </CardContent>
      </Card>

      {/* Row 3: Activity Completion Chart + Overdue */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tm("activityCompletion")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityCompletionChart
              completed={activity.completed}
              total={activity.total}
              rate={activity.rate}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activities</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{activity.overdue}</div>
            <p className="text-xs text-muted-foreground">
              {tm("overdueActivities", { count: activity.overdue })}
            </p>
            <Link
              href="/activities"
              className="text-sm text-primary hover:underline mt-2 inline-block"
            >
              View Activities
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
