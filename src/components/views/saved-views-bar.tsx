"use client"

/**
 * THE SAVED-VIEWS BAR — the phase's primary affordance and its only new component.
 *
 * Two slots. Slot 1 is a `DropdownMenu` picker; slot 2 is a RESOLVER, one control and one label at a
 * time (B-1). Everything this component must NOT do is measured rather than preferred:
 *
 *   - IT IS NOT IN A `Popover` (O-2). `PopoverContent` never consumes
 *     `--radix-popover-content-available-height`, and the existing `/activities` filter popover
 *     already renders 388px into a 347px slot with 41px clipped off the top of the viewport (M-5).
 *     `DropdownMenuContent` is height-safe BY CONSTRUCTION — see the menu below — and is the one
 *     overlay host on these four pages that survives 320x640.
 *   - IT IS NOT STICKY AND NOT FIXED, AND IT ADDS NO SPACER (B-4, R-40-2f, K-8).
 *     `bulk-action-bar.tsx` already owns one fixed bar on all four of these pages and D-45-02 is a
 *     LIVE open UAT item about a fixed bar occluding content. A second one is not available to this
 *     phase.
 *   - IT DERIVES NOTHING. See below; this is the rule the gate exists for.
 *
 * B-2 — THE BAR DERIVES NOTHING. Every piece of state arrives as one of the eight props, and there
 * are three reasons that is a RULE and not a preference:
 *
 *   1. NO LOADING STATE, NO FLASH. All four hosts are server components that already
 *      `await searchParams`, so the views arrive with the first paint. A client-fetched picker would
 *      flash "All records" over the user's actual default view on every navigation. **There is
 *      therefore no loading state anywhere in this component, and that absence is a decision.**
 *   2. `isModified` AND `droppedFilterKeys` ARE NOT THE SAME THING. Both manifest as "the URL differs
 *      from the stored blob", and only the server knows WHICH: a key the user changed (modified)
 *      versus a key the read-side validator dropped because its target no longer exists (degraded). A
 *      client comparing the two would label every degraded view "Modified" and invite the user to save
 *      the damage.
 *   3. IT IS GATEABLE, and `__tests__/saved-views-bar-wiring.test.ts` gates it — including the parsed
 *      read of the eight-property interface and the absence of any local `isModified` declaration.
 *
 * THE ROW WRAPS AND THAT IS ACCEPTED (R-40-2a, M-10). A 200px trigger plus an 8px gap plus a 139px
 * "Guardar cambios" is 347px against a 241px usable budget. There is NO trigger width at which both
 * fit with the Spanish label, so `flex-wrap` is load-bearing rather than decorative.
 *
 * ACCENT BUDGET (§ Color). The bar spends ZERO primary-filled buttons: the trigger and slot 2's
 * control are both `variant="outline"`, and Manage/Export are menu items. All four host pages already
 * spend their one filled button on "Add Organization" / "Add Person" / "Add Deal" / "Add Activity".
 *
 * ON THE FRAGMENT. The bar row, the degraded notice and the two dialogs are SIBLINGS, so the notice
 * renders beneath the row and neither dialog is remounted per view. Plan 40-14 owns the four mount
 * points and mounts this inside each host's vertical stack.
 */

import { ChevronDown, Loader2 } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Suspense, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ManageViewsDialog } from "@/components/views/manage-views-dialog"
import { SaveViewDialog } from "@/components/views/save-view-dialog"
import { exportViewResults } from "@/lib/views/export-action"
import type { SavedViewSummary, SavedViewsBarProps } from "@/lib/views/types"
import {
  VIEW_ESCAPE_VALUE,
  pickFilterParams,
  withViewEscape,
  withViewSelection,
} from "@/lib/views/url-params"

const CSV_MIME_TYPE = "text/csv;charset=utf-8;"

/**
 * Hand a string to the browser as a file — E-6.
 *
 * COPIED IN SHAPE from `bulk-action-bar.tsx:73-83` rather than lifted into a shared helper, and that
 * is a decision with a reason: `bulk-action-bar-wiring.test.ts` asserts the literal
 * `URL.createObjectURL` appears in THAT file, so extracting the idiom out of it would turn a Phase 38
 * gate red. Lifting it and leaving a duplicate behind would be a fourth downloader wearing a shared
 * name. There is no `/api/export` route (M-14) and this phase adds none.
 *
 * The revoke is what releases the blob: an object URL keeps its blob alive for the LIFETIME OF THE
 * DOCUMENT, so a user exporting repeatedly would otherwise accumulate every CSV they ever generated
 * until they navigated away.
 */
function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: CSV_MIME_TYPE })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/*
 * RE-EXPORTED, NOT RESTATED. The interface is DECLARED in `src/lib/views/types.ts` so the server
 * resolver (plan 40-05) can name its own return type without a server import graph reaching into a
 * `"use client"` module — and so there is ONE declaration of the eight props rather than two that can
 * drift. That file is also the one V-40-5's parsed-interface gate reads.
 */
export type { SavedViewsBarProps } from "@/lib/views/types"

export function SavedViewsBar(props: SavedViewsBarProps) {
  const t = useTranslations("views")

  /*
   * B-3. The inner component calls `useSearchParams`, `usePathname` and `useRouter`, so it needs a
   * Suspense boundary. The fallback is the picker trigger in its disabled shape reading
   * `views.allRecords` — the `activity-filters.tsx:356` precedent, verbatim in shape.
   */
  return (
    <Suspense
      fallback={
        <Button variant="outline" className="min-w-0 max-w-[200px]" disabled>
          <span className="truncate">{t("allRecords")}</span>
          <ChevronDown className="shrink-0" aria-hidden="true" />
        </Button>
      }
    >
      <SavedViewsBarInner {...props} />
    </Suspense>
  )
}

function SavedViewsBarInner({
  entityType,
  views,
  selectedViewId,
  isModified,
  droppedFilterKeys,
  canSave,
  canExport,
  canUpdateSelected,
}: SavedViewsBarProps) {
  const t = useTranslations("views")
  const tBulk = useTranslations("bulk")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [saveOpen, setSaveOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  /*
   * E-4 / K-7. The in-flight state IS the transition's own `isPending`, so there is no setter to call
   * from an effect body and nothing for `react-hooks/set-state-in-effect` — an ERROR in this repo — to
   * catch. It lives in the BAR rather than in the menu: a menu held open for the duration of a 50k-row
   * SELECT is dismissible by any outside click, which would strand the user with no feedback, and
   * nothing can dismiss the bar. Nothing else is disabled while it runs — the user may keep working.
   */
  const [isExporting, startTransition] = useTransition()

  /*
   * The CURRENT filters, picked through the 40-01 whitelist. A plain object and not the params
   * instance itself: this crosses into a server action and a `URLSearchParams` is not serialisable
   * across that boundary. Nothing here compares it to anything (B-2).
   */
  const filters = pickFilterParams(entityType, searchParams)

  const selectedView = views.find((view) => view.id === selectedViewId) ?? null

  /*
   * V-3 (3) and (4). The split is a GROUPING, not a control: the server's SQL predicate (plan 40-05)
   * is what guarantees the shared group never contains someone else's PRIVATE view, for any viewer
   * including an admin (V-6). A private view never reaches the RSC payload, so it cannot be read out
   * of the DOM either.
   *
   * Alphabetical, and the default view is NOT floated to the top — it carries the word
   * `views.badgeDefault` instead, because a list that reorders itself under the user's finger is a
   * misclick generator.
   */
  const byName = (left: SavedViewSummary, right: SavedViewSummary) =>
    left.name.localeCompare(right.name)
  const ownViews = views.filter((view) => view.isOwnedByViewer).sort(byName)
  const sharedViews = views.filter((view) => !view.isOwnedByViewer).sort(byName)

  /**
   * V-9. A FRESH navigation INTO a view: the view's own stored filters in canonical order, plus
   * `view=<id>`, with every param outside the whitelist dropped — `page` included, so a view lands
   * you on page 1.
   *
   * NAMING THE VIEW IN THE URL IS WHAT MAKES "MODIFIED" POSSIBLE AT ALL. Before plan 40-18 the
   * selection was derived from filter equality, so `selected && modified` was unrepresentable —
   * measured: 10 URLs x 3 views, ZERO modified — and slot 2's `views.saveChanges` row was dead code.
   * `withViewEscape` must NOT be used here: it deletes an unparsed `view` key and would silently drop
   * the selection, reinstating exactly that defect while the list still filters correctly.
   */
  function selectView(view: SavedViewSummary) {
    router.push(`${pathname}?${withViewSelection(entityType, view.filters, view.id)}`)
  }

  /**
   * V-9's other half, and U-1/U-2. `views.allRecords` navigates to `?view=none` rather than to a bare
   * path, because the default-view redirect fires on "no params at all" — a bare path would bounce the
   * user straight back into the view they were trying to leave.
   */
  function selectAllRecords() {
    router.push(`${pathname}?${withViewEscape(entityType, new URLSearchParams())}`)
  }

  function handleSelect(value: string) {
    // The sentinel, never a translated label: the label changes per locale, `none` does not.
    if (value === VIEW_ESCAPE_VALUE) {
      selectAllRecords()
      return
    }

    const picked = views.find((view) => view.id === value)

    // A value naming a view that is no longer in the list is a no-op, not a navigation to nowhere.
    if (picked === undefined) return

    selectView(picked)
  }

  /**
   * V-4's second line: the state words, joined by ` · `, in the order visibility, default, owner.
   *
   * The owner segment is TWO BRANCHES and never `ownedBy` interpolated with `ownerUnavailable` —
   * `ownedBy` is "by {owner}" and `ownerUnavailable` is a whole sentence, so nesting them reads
   * "de El propietario ya no está activo" in es-ES (the 40-09 finding). Both branches are live in
   * this deployment: two of three active users have `name = NULL` and six users are soft-deleted.
   * Never a blank, never a uuid.
   */
  function stateWords(view: SavedViewSummary): string {
    return [
      view.isShared ? t("badgeShared") : t("badgePrivate"),
      view.isDefaultForViewer ? t("badgeDefault") : null,
      view.ownerLabel === null ? t("ownerUnavailable") : t("ownedBy", { owner: view.ownerLabel }),
    ]
      .filter((word) => word !== null)
      .join(" · ")
  }

  /**
   * E-6 / E-7 / E-8. Ask, then hand the answer to the browser.
   *
   * The action authorizes; the bar only asks. `canExport` decides whether the affordance is
   * ENABLED, and `guardExportInput` re-derives the same question server-side before a single row is
   * read — so a crafted call gets `refused`, not a CSV.
   *
   * The toasts: success REUSES `bulk.exported`, and the generic failure REUSES
   * `bulk.error.exportFailed`. Zero new keys in a namespace this phase does not own, and
   * `REQUIRED_BULK_KEYS` does not move. `bulk.error.tooMany` is deliberately NOT reused — its copy is
   * about a selection of ids ("{count} are selected") and would read as nonsense over a filter set
   * nobody selected, which is why `views.export.tooMany` exists.
   *
   * The filename comes from the SERVER and is never translated (E-6): a locale-dependent name on disk
   * is unsupportable, and a server-generated name cannot disagree with the row count beside it.
   */
  async function runExport() {
    try {
      const result = await exportViewResults({ entityType, filters })

      if (!result.success) {
        if (result.error === "too_many") {
          toast.error(t("export.tooMany", { max: result.max }))
          return
        }

        if (result.error === "refused") {
          toast.error(t("export.refused"))
          return
        }

        // Everything else — including `unauthenticated` — collapses to one message (E-8). The user is
        // told nothing about our internals.
        toast.error(tBulk("error.exportFailed"))
        return
      }

      downloadCsv(result.data, result.filename)

      // Required even though nothing on the page changed — which is exactly why: the file left the
      // browser, so there is no visible result for the no-redundant-toast rule to apply to.
      toast.success(tBulk("exported", { count: result.count }))
    } catch {
      toast.error(tBulk("error.exportFailed"))
    }
  }

  /**
   * V-4 / R-40-2d. TWO STACKED LINES, `py-2` overriding the primitive's `py-1.5`: the name at
   * `text-sm` with `truncate`, then the state words at `text-xs text-muted-foreground`.
   *
   * LINE 2 IS NEVER TRUNCATED. One horizontal row of name + badges cannot survive 241px, and
   * truncating that row would delete the state words — the only thing on the item that says whether
   * a view is shared, default, or someone else's. The horizontal padding is left exactly as the
   * primitive ships it: `pl-8` is the radio indicator's gutter, not a decoration.
   */
  function viewItem(view: SavedViewSummary): ReactNode {
    return (
      <DropdownMenuRadioItem
        key={view.id}
        value={view.id}
        className="min-w-0 flex-col items-start gap-0 py-2"
      >
        <span className="w-full truncate text-sm">{view.name}</span>
        <span className="text-muted-foreground text-xs">{stateWords(view)}</span>
      </DropdownMenuRadioItem>
    )
  }

  /**
   * B-5 — SLOT 2, one control and one label at a time, in this precedence.
   *
   * `!canSave` renders a SENTENCE and not a disabled button: 39-UI-SPEC P-7 forbids a bare greyed
   * control with no explanation, a sentence in the control's place IS the explanation, and it costs
   * the same 36px row. On an unfiltered list the bar has nothing else to say, so this is the bar's
   * empty state rather than noise.
   *
   * `selected && isModified && canUpdateSelected` was structurally UNREACHABLE before plan 40-18,
   * because selection came from filter equality. It is live now, and it is the reason
   * `views.saveChanges` exists.
   *
   * `selected && !isModified` renders NOTHING — there is nothing to save. The capability is not lost:
   * `views.saveNew` stays in the menu (V-3 item 6), only the redundant button goes.
   */
  function saveSlot(): ReactNode {
    /*
     * The in-flight row OVERRIDES everything below it. Muted and non-interactive: there is no control
     * to press, only the honest statement that a query is running. No progress bar (E-5) —
     * `fetchFilteredData` is ONE query, not a job, and `ProgressBar` has no `role="progressbar"` or
     * `aria-valuenow` (F-39-04), so a fake bar would add an a11y defect in service of a lie.
     *
     * `text-primary` sits on the SPINNER and nowhere else in this file. It is legible here — unlike on
     * a `bg-primary` submit button, where 40-08 found it draws primary-on-primary — because the row
     * around it is the page background.
     */
    if (isExporting) {
      return (
        <span className="text-muted-foreground flex items-center gap-2 text-xs" aria-live="polite">
          <Loader2 className="text-primary size-4 animate-spin" aria-hidden="true" />
          {t("exporting")}
        </span>
      )
    }

    if (!canSave) {
      return <p className="text-muted-foreground text-xs">{t("needsFilter")}</p>
    }

    if (selectedViewId === null) {
      return (
        <Button variant="outline" onClick={() => setSaveOpen(true)}>
          {t("saveNew")}
        </Button>
      )
    }

    if (!isModified) return null

    return (
      <Button variant="outline" onClick={() => setSaveOpen(true)}>
        {canUpdateSelected ? t("saveChanges") : t("saveNew")}
      </Button>
    )
  }

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/*
              V-1 / R-40-2b. `min-w-0` is what lets the trigger shrink at all — a flex item's default
              `min-width: auto` is the mechanism behind every overflow Phase 45 measured.
              `max-w-[200px]` is MEASURED (M-10): wider and the trigger alone eats the 241px row
              before the badge gets a pixel; narrower and an ordinary name shows four characters.
              `truncate` on the name and `shrink-0` on the badge together guarantee that the STATE
              survives when the NAME does not.
            */}
            <Button
              variant="outline"
              className="min-w-0 max-w-[200px]"
              aria-label={t("picker.label")}
            >
              <span className="truncate">
                {selectedView === null ? t("allRecords") : selectedView.name}
              </span>
              {isModified && (
                <Badge variant="secondary" className="shrink-0">
                  {t("modified")}
                </Badge>
              )}
              <ChevronDown className="shrink-0" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>

          {/*
            M-7 / O-1. NO className that removes `max-h-(--radix-dropdown-menu-content-available-height)`
            or `overflow-y-auto`. The primitive is height-safe by construction and that is the ONLY
            reason this menu may be uncapped and unpaged (V-7) — `cn`'s tailwind-merge would drop the
            primitive's clamp in favour of a local one SILENTLY. The width cap carries no height or
            overflow of its own; it only keeps a long view name inside a 320px screen.
          */}
          <DropdownMenuContent align="start" className="max-w-[calc(100vw-2rem)]">
            <DropdownMenuRadioGroup
              value={selectedViewId ?? VIEW_ESCAPE_VALUE}
              onValueChange={handleSelect}
            >
              {/*
                V-2 / V-3. A radio group, not plain items: `role="menuitemradio"` plus `aria-checked`
                exposes the selection to assistive tech instead of drawing it, and the indicator the
                block ships is a SHAPE rather than a colour. `views.allRecords` is always present and
                always first.
              */}
              <DropdownMenuRadioItem value={VIEW_ESCAPE_VALUE}>
                {t("allRecords")}
              </DropdownMenuRadioItem>

              <DropdownMenuSeparator />

              {/*
                V-8. Non-interactive, between the separators. `views.allRecords`, `views.saveNew` and
                `views.manageAction` all stay present — the menu is never a dead end.
              */}
              {views.length === 0 && (
                <DropdownMenuLabel className="text-muted-foreground font-normal">
                  {t("emptyMenu")}
                </DropdownMenuLabel>
              )}

              {ownViews.length > 0 && (
                <>
                  <DropdownMenuLabel>{t("groupMine")}</DropdownMenuLabel>
                  {ownViews.map((view) => viewItem(view))}
                </>
              )}

              {sharedViews.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>{t("groupShared")}</DropdownMenuLabel>
                  {sharedViews.map((view) => viewItem(view))}
                </>
              )}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            {/*
              V-3 item 6. Present whenever `canSave`, so the capability stays reachable even in the
              B-5 state where slot 2 renders nothing at all.
            */}
            {canSave && (
              <DropdownMenuItem onSelect={() => setSaveOpen(true)}>{t("saveNew")}</DropdownMenuItem>
            )}

            {/*
              E-1 / E-3 / E-4. The affordance is a MENU ITEM and not a toolbar button: all four
              toolbars are at or past their width budget — `/activities` and `/deals` are EXACTLY full
              at 241px (M-2, M-3) and `/organizations` and `/people` already wrap to two rows (M-4) —
              and the menu is the one height-safe container on these pages.

              When `!canExport` the item is `disabled` with its reason as a second muted line. This is
              the ONE place in the phase where a disabled control is correct, and it is correct only
              because a menu is a vertical list with room for the reason ADJACENT rather than hidden in
              a tooltip. Note `canExport` is NOT `canSave`: on `/deals` a pipeline-only view is
              saveable and NOT exportable, because a board selector scoping 25,195 deals is the
              unbounded export 38-CONTEXT forbids.

              `onSelect` is NOT prevented — here or anywhere in this file (V-10). The menu closes and
              slot 2 picks up the in-flight state.
            */}
            <DropdownMenuItem
              disabled={!canExport}
              className="flex-col items-start gap-0 py-2"
              onSelect={() => {
                startTransition(async () => {
                  await runExport()
                })
              }}
            >
              <span>{t("exportAction")}</span>
              {!canExport && (
                <span className="text-muted-foreground text-xs">
                  {t("export.disabledReason")}
                </span>
              )}
            </DropdownMenuItem>

            <DropdownMenuItem onSelect={() => setManageOpen(true)}>
              {t("manageAction")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {saveSlot()}
      </div>

      {/*
        V-11 / C-40-4. One muted line BENEATH the bar. Never inside the menu, never an `Alert`, never
        destructive: a view whose owner or pipeline id no longer exists still rendered a list — nothing
        failed and nothing is unsafe — and a red panel over a working list teaches the user that red
        means nothing. There is no `--warning` token in this repo and this phase does not add one. One
        sentence covers all three degradations deliberately: naming WHICH key was dropped would need a
        per-key label resolver, which is the second field-label map 39-UI-SPEC M-4 refused, and the
        repair is identical in all three cases.
      */}
      {droppedFilterKeys.length > 0 && (
        <p className="text-muted-foreground text-xs">{t("degraded")}</p>
      )}

      <SaveViewDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        entityType={entityType}
        filters={filters}
        selectedView={selectedView}
        canUpdateSelected={canUpdateSelected}
      />

      <ManageViewsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        entityType={entityType}
        views={views}
      />
    </>
  )
}
