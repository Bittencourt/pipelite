import { db } from "@/db"
import { deals, stages, activities } from "@/db/schema"
import {
  count,
  sum,
  sql,
  eq,
  and,
  isNull,
  isNotNull,
  lt,
  gte,
  lte,
  inArray,
} from "drizzle-orm"
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  subMonths,
} from "date-fns"

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type DateFilter = "thisMonth" | "thisQuarter" | "last30" | "allTime"

export function getDateRange(
  filter: DateFilter
): { from: Date; to: Date } | null {
  const now = new Date()
  switch (filter) {
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case "thisQuarter":
      return { from: startOfQuarter(now), to: endOfQuarter(now) }
    case "last30":
      return { from: subMonths(now, 1), to: now }
    case "allTime":
      return null
  }
}

// ------------------------------------------------------------------
// Win Rate
// ------------------------------------------------------------------

export async function getWinRateMetrics(
  filter: DateFilter = "thisMonth"
): Promise<{ won: number; lost: number; total: number; rate: number | null }> {
  const range = getDateRange(filter)

  const rows = await db
    .select({
      type: stages.type,
      count: count(deals.id),
    })
    .from(deals)
    .innerJoin(stages, eq(deals.stageId, stages.id))
    .where(
      and(
        isNull(deals.deletedAt),
        inArray(stages.type, ["won", "lost"]),
        ...(range
          ? [gte(deals.updatedAt, range.from), lte(deals.updatedAt, range.to)]
          : [])
      )
    )
    .groupBy(stages.type)

  const won = rows.find((r) => r.type === "won")?.count ?? 0
  const lost = rows.find((r) => r.type === "lost")?.count ?? 0
  const total = won + lost
  const rate = total === 0 ? null : Math.round((won / total) * 100)

  return { won, lost, total, rate }
}

// ------------------------------------------------------------------
// Deal Velocity
// Note: using updatedAt as proxy for close date — deals table has no closedAt column
// ------------------------------------------------------------------

export async function getDealVelocityMetrics(
  filter: DateFilter = "thisMonth"
): Promise<{ avgDays: number | null; count: number }> {
  const range = getDateRange(filter)

  const rows = await db
    .select({
      avgDays: sql<number>`AVG(EXTRACT(EPOCH FROM (${deals.updatedAt} - ${deals.createdAt})) / 86400.0)`,
      count: count(deals.id),
    })
    .from(deals)
    .innerJoin(stages, eq(deals.stageId, stages.id))
    .where(
      and(
        isNull(deals.deletedAt),
        eq(stages.type, "won"),
        ...(range
          ? [gte(deals.updatedAt, range.from), lte(deals.updatedAt, range.to)]
          : [])
      )
    )

  const row = rows[0]
  if (!row || row.count === 0) {
    return { avgDays: null, count: 0 }
  }

  const avgDays =
    row.avgDays !== null && row.avgDays !== undefined
      ? Math.round(Number(row.avgDays))
      : null

  return { avgDays, count: row.count }
}

// ------------------------------------------------------------------
// Pipeline Value by Stage
// ------------------------------------------------------------------

export async function getPipelineValueByStage(): Promise<{
  stages: Array<{ stage: string; color: string; value: number; count: number }>
  total: number
}> {
  const rows = await db
    .select({
      stageName: stages.name,
      stageColor: stages.color,
      stagePosition: stages.position,
      totalValue: sum(deals.value),
      dealCount: count(deals.id),
    })
    .from(deals)
    .innerJoin(stages, eq(deals.stageId, stages.id))
    .where(and(isNull(deals.deletedAt), eq(stages.type, "open")))
    .groupBy(stages.id, stages.name, stages.color, stages.position)
    .orderBy(stages.position)

  const stageResults = rows.map((r) => ({
    stage: r.stageName,
    color: r.stageColor,
    value: parseFloat(r.totalValue ?? "0"),
    count: r.dealCount,
  }))

  const total = stageResults.reduce((acc, s) => acc + s.value, 0)

  return { stages: stageResults, total }
}

// ------------------------------------------------------------------
// Activity Completion
// ------------------------------------------------------------------

export async function getActivityCompletionMetrics(
  filter: DateFilter = "thisMonth"
): Promise<{
  completed: number
  total: number
  overdue: number
  rate: number | null
}> {
  const range = getDateRange(filter)

  const dateCondition = range
    ? [gte(activities.dueDate, range.from), lte(activities.dueDate, range.to)]
    : []

  const [completedResult, totalResult, overdueResult] = await Promise.all([
    // Completed within period
    db
      .select({ count: count() })
      .from(activities)
      .where(
        and(
          isNull(activities.deletedAt),
          isNotNull(activities.completedAt),
          ...dateCondition
        )
      ),
    // Total within period
    db
      .select({ count: count() })
      .from(activities)
      .where(and(isNull(activities.deletedAt), ...dateCondition)),
    // All-time overdue (no date range filter)
    db
      .select({ count: count() })
      .from(activities)
      .where(
        and(
          isNull(activities.deletedAt),
          isNull(activities.completedAt),
          lt(activities.dueDate, new Date())
        )
      ),
  ])

  const completed = completedResult[0]?.count ?? 0
  const total = totalResult[0]?.count ?? 0
  const overdue = overdueResult[0]?.count ?? 0
  const rate = total === 0 ? null : Math.round((completed / total) * 100)

  return { completed, total, overdue, rate }
}
