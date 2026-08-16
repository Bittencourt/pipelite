/**
 * /admin/audit — the retention window (AUDIT-04) and what it costs.
 *
 * NO AUTH CODE HERE, DELIBERATELY.
 * `src/app/admin/layout.tsx` already redirects a session-less or non-admin visitor away
 * from every `/admin/*` render. A second check in this file would be a second thing to
 * keep in sync, and the one place a check IS still required — the server action, which
 * the browser can POST to without ever rendering this page — has its own, in `actions.ts`
 * (T-36-30).
 *
 * SPLIT (CFUI-01)
 * This module is a server component. Everything stateful — the input, the transition, the
 * toast and the shorten `AlertDialog` — lives in `retention-form.tsx`, which is
 * `'use client'`. Only plain serializable values cross: `retentionDays` is `number | null`
 * and nothing else is passed. No React element and no function crosses the boundary, which
 * is what the repo-wide gate in
 * `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` enforces.
 *
 * The cost card stays here on purpose: it renders no `asChild` component, it needs no
 * client state, and it must NOT be optimistically updated after a save (the numbers only
 * move when the pruner next runs). Keeping it server-rendered makes that structural rather
 * than a rule someone has to remember.
 *
 * TYPE SCALE
 * The two readouts render at the Label role (`text-sm leading-tight font-semibold`), NOT
 * the larger bold stat treatment the admin dashboard uses for its counts. They are the
 * cost of a setting shown next to the setting, not KPIs; borrowing a fifth type size for
 * two numbers would leave this phase's declared scale (36-UI-SPEC § Typography). The class
 * string itself is deliberately not quoted here — this plan gates on its absence from the
 * file, and a gate a comment can invalidate is not a gate.
 */

import { getFormatter, getTranslations } from "next-intl/server"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { RelativeTime } from "@/components/ui/relative-time"
import { readAuditStats, readRetentionDays } from "@/lib/audit/settings"

import { RetentionForm } from "./retention-form"

export default async function AuditRetentionPage() {
  const t = await getTranslations("audit")
  const format = await getFormatter()

  // Independent reads; neither throws (both fail closed inside `settings.ts`), so the page
  // renders even when the database is unhappy.
  const [retentionDays, stats] = await Promise.all([
    readRetentionDays(),
    readAuditStats(),
  ])

  const oldestIso = stats.oldestEntryAt?.toISOString() ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("retention.title")}</h1>
        <p className="text-muted-foreground">{t("retention.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base leading-tight font-semibold">
            {t("retention.windowTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <RetentionForm retentionDays={retentionDays} />

          {/*
            NOT the fresh-install state, and NOT unreachable — do not delete this branch.
            Migration 0014 seeds `audit.retention_days = 90`, so a fresh deployment renders
            90 in the input with the pruner already active. `null` still happens three real
            ways: a row cleared out of band, a value corrupted or tampered past the zod
            parse, and a database restored from a dump older than that migration. In all
            three `readRetentionDays()` fails closed, nothing is pruned, and this line is
            the only thing that tells the operator so.

            There is deliberately no "keep entries forever" control anywhere on this page:
            the unset state is a fail-safe, not a product option.
          */}
          {retentionDays === null ? (
            <p className="text-muted-foreground text-xs">
              {t("retention.notSet")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base leading-tight font-semibold">
            {t("retention.costTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-wrap gap-x-8 gap-y-4">
            <div>
              <dt className="text-muted-foreground text-xs">
                {t("retention.entriesLabel")}
              </dt>
              <dd className="text-sm leading-tight font-semibold">
                {format.number(stats.entryCount)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t("retention.oldestLabel")}
              </dt>
              <dd className="text-sm leading-tight font-semibold">
                {oldestIso ? (
                  <time
                    dateTime={oldestIso}
                    title={format.dateTime(new Date(oldestIso), {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                      minute: "numeric",
                    })}
                  >
                    <RelativeTime date={oldestIso} />
                  </time>
                ) : (
                  // An empty table has no oldest entry, which is not the same as "now".
                  t("retention.oldestNone")
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
