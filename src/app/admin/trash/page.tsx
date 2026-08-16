/**
 * /admin/trash — the retention window (TRASH-03) and what it costs.
 *
 * A near-exact mirror of `/admin/audit`. `trash.retention_days` follows
 * `audit.retention_days` key-for-key, so the surface follows the same way: structural
 * divergence between two retention settings that behave identically would be a gratuitous
 * thing for an operator to relearn.
 *
 * NO AUTH CODE HERE, DELIBERATELY.
 * `src/app/admin/layout.tsx` already redirects a session-less or non-admin visitor away
 * from every `/admin/*` render. A second check in this file would be a second thing to
 * keep in sync, and the one place a check IS still required — the server action, which
 * the browser can POST to without ever rendering this page — has its own, in `actions.ts`
 * (T-37-01).
 *
 * SPLIT (CFUI-01)
 * This module is a server component. Everything stateful — the input, the transition, the
 * toast and the shorten `AlertDialog` — lives in `retention-form.tsx`, which is a client
 * module. Only plain serializable values cross: `retentionDays` is `number | null` and
 * nothing else is passed. No React element and no function crosses the boundary, which is
 * what the repo-wide gate in
 * `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx` enforces.
 *
 * The cost card stays here on purpose: it renders no `asChild` component, it needs no
 * client state, and it must NOT be optimistically updated after a save (the numbers only
 * move when the pruner next runs). Keeping it server-rendered makes that structural rather
 * than a rule someone has to remember.
 *
 * THE SHELL IS THE BARE `<h1>`, WITH NO ICON TILE
 * The six existing `/admin/*` pages open with a plain heading; the four user-facing list
 * pages open with a `--primary` icon tile. There are two established shells because there
 * are two kinds of page, and this file joins the admin one rather than minting a third.
 *
 * THERE IS NO ONE-CLICK "PURGE EVERYTHING NOW" CONTROL, AND ONE MUST NOT BE ADDED.
 * Permanent deletion is per-record on `/trash` (admin only, behind its own confirmation)
 * or automatic via the pruner. A one-click mass-destruction button on the settings page is
 * the single most dangerous thing this surface could grow, and it is out of scope by
 * design rather than by omission.
 */

import { getFormatter, getTranslations } from "next-intl/server"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { RelativeTime } from "@/components/ui/relative-time"
import { readTrashRetentionDays, readTrashStats } from "@/lib/trash/settings"

import { RetentionForm } from "./retention-form"

export default async function TrashRetentionPage() {
  const t = await getTranslations("trash")
  const format = await getFormatter()

  // Independent reads; neither throws (both fail closed inside `settings.ts`), so the page
  // renders even when the database is unhappy.
  const [retentionDays, stats] = await Promise.all([
    readTrashRetentionDays(),
    readTrashStats(),
  ])

  const oldestIso = stats.oldestDeletedAt?.toISOString() ?? null

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
            Migration 0015 seeds `trash.retention_days = 30`, so a fresh deployment renders
            30 in the input with the pruner already active. `null` still happens three real
            ways: a row cleared out of band, a value corrupted or tampered past the zod
            parse, and a database restored from a dump older than that migration. In all
            three `readTrashRetentionDays()` fails closed, nothing is purged, and this line
            is the only thing that tells the operator so.

            There is deliberately no "keep deleted records forever" control anywhere on
            this page: the unset state is a fail-safe, not a product option.
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
                {t("retention.recordsLabel")}
              </dt>
              <dd className="text-sm leading-tight font-semibold">
                {format.number(stats.trashedCount)}
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
                  // When nothing is in trash there is no oldest deletion, which is not the
                  // same as "now".
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
