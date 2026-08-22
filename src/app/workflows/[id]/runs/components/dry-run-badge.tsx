/**
 * "This row is a TEST run" — the one mark that keeps a persisted dry run from reading as a real run
 * whose changed-records panel is inexplicably empty.
 *
 * THIS FILE IS A SERVER COMPONENT and must not gain a client directive. It renders only `Badge`
 * with a plain string child, so no React element ever crosses the RSC boundary into a Radix slot
 * (T-36-32, asserted repo-wide by the CFUI-01 gate and stated verbatim next door in
 * `runs/[runId]/components/run-changed-records.tsx:4-7`). The next person who wants an `onClick` or
 * a `Tooltip` here has to make this a client component, and doing so breaks that constraint for the
 * whole runs table, which is a server tree. Put the interaction somewhere else.
 *
 * WHY `border-dashed` AND NOT A COLOUR (UI-SPEC C-41-2). Three options were weighed:
 *   - a new palette pair (violet, say) — would be the SEVENTH hardcoded pair in this directory and
 *     violates C-41-1, which says the code this phase adds introduces none;
 *   - `variant="secondary"` — already taken by `pending` in `run-status-badge.tsx`, so a test run
 *     and a pending run would be indistinguishable;
 *   - `variant="outline"` + `border-dashed` — chosen. A dashed border is this app's EXISTING idiom
 *     for provisional / not-real content (`runs-table.tsx` renders its empty state in
 *     `rounded-lg border border-dashed`). `variant="outline"` is `border-border text-foreground`,
 *     token-only, so it is theme-correct for free, and the distinction from `skipped` (also
 *     `outline`) is border STYLE rather than hue — which survives a monochrome or high-contrast
 *     display, as a colour pair does not.
 *
 * WHY `run-status-badge.tsx` WAS NOT EXTENDED. Its `Record<Status, …>` map is exhaustive-by-type on
 * purpose and `dryRun` is not a `WorkflowStatus`. Dry-run-ness is an ORTHOGONAL dimension: as a
 * sixth entry it would make "failed" and "test" mutually exclusive, when a failed test run is the
 * most interesting row on the page. So this badge renders BESIDE the status badge, never instead of
 * it.
 *
 * NO `aria-label`. The content is plain, self-describing text. `RunStatusBadge` supplies its own
 * `aria-label="Status: …"` because its label is a bare adjective; this is a separate label sitting
 * next to it, and labelling a label reads twice to a screen reader.
 *
 * i18n — the seam UI-SPEC § i18n Scope declares. The `/workflows` tree is English literals today;
 * every string THIS PHASE authors is translated anyway, `run-changed-records.tsx:23` being the
 * in-tree precedent for the `next-intl/server` import. So a translated "Test run" will sit beside
 * `RunStatusBadge`'s English "Failed". That is the declared trade, not an inconsistency to fix by
 * translating the rest of the tree.
 */

import { getTranslations } from "next-intl/server"

import { Badge } from "@/components/ui/badge"

export async function DryRunBadge() {
  const t = await getTranslations("workflows.dryRun")

  return (
    <Badge variant="outline" className="border-dashed">
      {t("badge")}
    </Badge>
  )
}
