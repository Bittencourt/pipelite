/**
 * "Which CRM records did this run change?" — the operator-facing half of SC-2.
 *
 * THIS FILE IS A SERVER COMPONENT and must not gain a client directive. It renders only
 * `Link`, `Badge` (with no children-forwarding slot prop), plain DOM and lucide icons, so no
 * React element ever crosses the RSC boundary into a Radix slot (T-36-32, asserted repo-wide by
 * the CFUI-01 gate).
 *
 * IT DOES NOT PERFORM THE READ. `readRunChangedRecords` deliberately carries no try/catch —
 * swallowing there would return `[]`, and `[]` renders "This run didn't change any records", a
 * statement the operator cannot tell apart from the truth. The page performs the read, catches,
 * and expresses the failure as the `failed` prop, so an empty list here always means EMPTY.
 *
 * i18n — a deliberate, declared inconsistency. The `/workflows` tree has zero `next-intl` call
 * sites today and its strings are English literals. This section is translated anyway: three
 * locales ship, `locale-parity.test.ts` makes translated keys the enforced default, and writing
 * new untranslated English would propagate the debt. The result is one translated section on an
 * otherwise-English page for es-ES and pt-BR. That seam is the trade; it is NOT to be "fixed" by
 * translating the rest of the run page, which is unrelated scope.
 */

import { Building2, CheckCircle2, Kanban, Users, type LucideIcon } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { RelativeTime } from "@/components/ui/relative-time"
import type { AuditAction } from "@/db/schema/audit-log"
import type { EntityType } from "@/db/schema/custom-fields"
import type { RunChangedRecord } from "@/lib/audit/linked-records"

/** `person` lives at `/people`, not `/persons` — same map the import wizard already uses. */
const ENTITY_PATHS: Record<EntityType, string> = {
  organization: "/organizations",
  person: "/people",
  deal: "/deals",
  activity: "/activities",
}

/**
 * The app's own nav vocabulary (`nav-header.tsx:9`), so zero new symbols enter the product.
 */
const ENTITY_ICONS: Record<EntityType, LucideIcon> = {
  organization: Building2,
  person: Users,
  deal: Kanban,
  activity: CheckCircle2,
}

/**
 * NEVER `destructive`. A completed deletion is a fact, not a warning, and `--destructive` is
 * reserved in this phase for the shorten-retention confirmation and `toast.error`.
 */
const ACTION_BADGE_VARIANT: Record<AuditAction, "outline" | "secondary"> = {
  created: "outline",
  updated: "outline",
  deleted: "secondary",
}

/**
 * A degraded render carries no records, and a successful render is never degraded — the union
 * makes "failed but has records" unrepresentable rather than merely unlikely.
 */
type RunChangedRecordsProps =
  | { failed: true; records?: undefined }
  | { failed?: false; records: RunChangedRecord[] }

export async function RunChangedRecords(props: RunChangedRecordsProps) {
  const t = await getTranslations("audit")

  if (props.failed) {
    return (
      <section>
        <h2 className="text-base font-semibold leading-tight mb-4">{t("run.heading")}</h2>
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          {t("run.unavailable")}
        </div>
      </section>
    )
  }

  const { records } = props

  if (records.length === 0) {
    return (
      <section>
        <h2 className="text-base font-semibold leading-tight mb-4">{t("run.heading")}</h2>
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          {t("run.empty")}
        </div>
      </section>
    )
  }

  const format = await getFormatter()

  return (
    <section>
      <h2 className="text-base font-semibold leading-tight mb-4">
        {t("run.heading")}{" "}
        <span className="text-muted-foreground text-sm">({records.length})</span>
      </h2>

      <ul role="list" className="rounded-md border divide-y">
        {records.map((record) => {
          const Icon = ENTITY_ICONS[record.entityType]
          const label = record.title ?? t("run.untitledRecord")

          // Muted when there is no title to show, so the placeholder never reads as a name.
          const titleClass = `text-sm leading-tight font-semibold break-words ${
            record.title === null ? "text-muted-foreground" : "text-primary"
          }`

          return (
            <li
              key={`${record.entityType}:${record.entityId}`}
              role="listitem"
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                {record.deleted ? (
                  // NOT a link: the detail page 404s for a record that is gone or soft-deleted.
                  // A dead link is worse than an honest dead end (T-36-36). The row still
                  // appears — the run did mutate it, and dropping it would make the list a lie.
                  <span className="text-sm leading-tight font-semibold break-words text-muted-foreground">
                    {label}
                  </span>
                ) : (
                  <Link
                    href={`${ENTITY_PATHS[record.entityType]}/${record.entityId}`}
                    className={`${titleClass} hover:underline`}
                  >
                    {label}
                  </Link>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={ACTION_BADGE_VARIANT[record.action]}>
                  {t(`run.action.${record.action}`)}
                </Badge>

                {/* A tombstone has no field count. */}
                {record.action === "deleted" ? null : (
                  <span className="text-xs text-muted-foreground">
                    {t("run.fieldCount", { count: record.fieldCount })}
                  </span>
                )}

                <time
                  dateTime={record.occurredAt.toISOString()}
                  title={format.dateTime(record.occurredAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  className="text-xs text-muted-foreground"
                >
                  <RelativeTime date={record.occurredAt} />
                </time>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
