"use client"

/**
 * THE MANAGE VIEWS DIALOG — one surface owning every per-view operation.
 *
 * Share, unshare, set default, clear default, delete. All five live here (G-1) and none of them is
 * an inline icon on a picker menu row or a `DropdownMenuSub`: at 241px of usable width a menu row
 * holds a name and nothing else (R-40-2d), and `DropdownMenuSubContent` is not height-safe (O-2).
 *
 * This is also where criterion 2 becomes VISIBLE. The sharing switch is the write half of "shared
 * with the team", and the read-only row is where the asymmetry becomes legible: you may set someone
 * else's shared view as YOUR default, but you may not edit it.
 *
 * WHY TWO HEIGHT CLAMPS AND NOT ONE (O-1). `DialogContent` was measured this session and declares
 * NEITHER a max-height NOR an overflow-y: `max-height: none`, `overflow-y: visible`. So the dialog
 * needs `max-h-[calc(100dvh-2rem)] overflow-y-auto` at this call site — `dvh` and not `vh`, because
 * a mobile URL bar changes `vh` mid-scroll and F-39-07 was a mobile defect. But clamping only the
 * DIALOG is not enough: the row list is the one unbounded region on this surface, and at fifteen
 * views it would make the dialog itself the scroll container and push everything after the list out
 * of the viewport. So the list carries `max-h-[50vh] overflow-y-auto` of its own. Two clamps, and
 * the second one is the one that looks redundant.
 *
 * Neither clamp is an edit to `src/components/ui/dialog.tsx` or `alert-dialog.tsx`. Those primitives
 * are shared by roughly sixteen dialogs and retuning all sixteen is a different change with a
 * different blast radius. `max-w-[calc(100%-2rem)]` is deliberately left alone (R-6): it is what
 * keeps the dialog at 288px on a 320px screen.
 *
 * WHAT IS DELIBERATELY ABSENT.
 *
 *   - NO RENAME (G-5). The save dialog's update path already owns an editable name field and the
 *     duplicate-name refusal that goes with it. A second rename affordance here would be a second
 *     implementation of that same refusal logic, and the two would drift.
 *   - NO TABLE (R-40-2e). Rows are stacked. Name / visibility / default / actions in columns inside
 *     241px is about 60px each, and the name — the one thing this dialog exists to show in FULL —
 *     would be the first casualty.
 *   - NO CONFIRMATION ON THE SWITCHES (D-5). Share, unshare, set default and clear default are
 *     one-click, unconfirmed and reversible from the dialog they were pressed in. Deletion is the
 *     only confirmed operation in this phase, because a confirm dialog on a reversible change
 *     trains the user to dismiss dialogs unread.
 *
 * NOTHING HERE IS ACCESS CONTROL. `view.canEdit` decides what RENDERS; `canMutateView` in
 * `src/lib/views/write-guards.ts` decides what is ALLOWED, on the stored row, server-side, for every
 * one of the three actions this file calls (T-40-39). A row hidden in the UI is never the control.
 */

import { Loader2, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { deleteView, setViewDefault, setViewShared } from "@/lib/views/actions"
import type { SavedViewSummary, ViewEntityType } from "@/lib/views/types"

export interface ManageViewsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: ViewEntityType
  /**
   * Already scoped to what this viewer may see AND to this `entityType` (G-9).
   *
   * The dialog is opened from one surface's bar and manages that surface's views. A single dialog
   * listing all four entity types would need an entity-name resolver of its own and would show the
   * user rows they cannot act on from where they are standing.
   */
  views: SavedViewSummary[]
}

export function ManageViewsDialog({
  open,
  onOpenChange,
  entityType,
  views,
}: ManageViewsDialogProps) {
  const t = useTranslations("views")
  const tCommon = useTranslations("common")

  /*
   * THE PENDING SWITCH POSITIONS, held locally so a REFUSED write can put them back (G-4, T-40-40).
   *
   * The truth is the `views` prop, which the server rebuilds after every action's
   * `revalidatePath`. Between the click and that rebuild the switch has to show the position the
   * user just chose, and if the write is refused it has to show the position it had BEFORE. Never an
   * optimistic state a failed write leaves standing as a lie.
   *
   * Sharing is per view, so its override is a map. The DEFAULT is per (user, entityType) — plan
   * 40-02 keyed the table that way precisely so one user's choice is not the owner's — so exactly
   * one view can hold it and a single override models it. A per-row boolean would leave TWO switches
   * on after moving the default from view A to view B, which is not what the server did.
   */
  const [sharedOverride, setSharedOverride] = useState<Record<string, boolean>>({})
  const [defaultOverride, setDefaultOverride] = useState<{ viewId: string | null } | null>(null)

  /** The row the confirmation is armed for, or `null` when it is closed (D-1). */
  const [pendingDelete, setPendingDelete] = useState<SavedViewSummary | null>(null)

  /*
   * In-flight state comes from `useTransition` and is never written into a state variable from an
   * effect body: `react-hooks/set-state-in-effect` is an ERROR in this repo (K-7). One transition
   * for the whole surface, so a second toggle cannot interleave with a write already in flight and
   * leave two overrides racing one revalidation.
   */
  const [isWriting, startTransition] = useTransition()

  const storedDefaultId = views.find((view) => view.isDefaultForViewer)?.id ?? null
  const defaultViewId = defaultOverride === null ? storedDefaultId : defaultOverride.viewId

  /**
   * DELETE, CONFIRMED (D-4).
   *
   * `pendingDelete` is captured into a local before the transition starts, because the confirmation
   * closes and the row is gone by the time the callback resolves. The success toast's `{name}` comes
   * from the ACTION'S RETURN VALUE for the same reason — `deleteView` reads the name before the
   * delete precisely so the client has something to interpolate.
   *
   * ON FAILURE THE ROW STAYS. There is no optimistic removal here at all: the list is the `views`
   * prop, so a refused delete simply leaves it as it was and the error toast is the only change on
   * screen (39-UI-SPEC L-8).
   */
  const handleDelete = () => {
    const target = pendingDelete

    if (target === null) return

    startTransition(async () => {
      const result = await deleteView({ id: target.id })

      if (result.success) {
        toast.success(t("delete.success", { name: result.name }))
        // The confirmation closes; THE MANAGE DIALOG STAYS OPEN, minus the row (D-4). The next act
        // after deleting one view is usually deleting or re-defaulting another.
        setPendingDelete(null)
        return
      }

      toast.error(t("delete.failed"))
      setPendingDelete(null)
    })
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // ESC and an overlay click must not abandon a write that is already in flight.
          if (isWriting) return
          onOpenChange(next)
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            {/*
              `leading-tight` per call site (T-1): the primitive ships `text-lg leading-none`, and
              `leading-none` on a title that wraps inside 288px overlaps its own lines.
            */}
            <DialogTitle className="leading-tight">{t("manage.title")}</DialogTitle>
            <DialogDescription>{t("manage.description")}</DialogDescription>
          </DialogHeader>

          {views.length === 0 ? (
            /*
              EMPTY STATE (G-8). Two lines, not one generic "Nothing here": the body names the next
              step, and that step is on a DIFFERENT screen — you cannot create a view from inside
              this dialog, so the emptiness has to say where to go.
            */
            <div className="space-y-1">
              <p className="text-sm">{t("manage.empty")}</p>
              <p className="text-muted-foreground text-xs">{t("manage.emptyBody")}</p>
            </div>
          ) : (
            /*
              THE SECOND CLAMP (O-1b). This is the only unbounded region on the surface, and
              clamping it — not just the dialog — is what keeps everything around it on screen at
              every list length. It looks redundant beside the dialog's own clamp; it is not.
            */
            <div className="max-h-[50vh] overflow-y-auto">
              {views.map((view) => {
                const isSharedNow = sharedOverride[view.id] ?? view.isShared
                const isDefaultNow = defaultViewId === view.id

                /*
                 * `ownerLabel` is server-computed (`name || email`) and is `null` ONLY when the
                 * owner row is soft-deleted. Both branches are live in this deployment: two of the
                 * three active users have a NULL name, and six users are soft-deleted. A uuid or a
                 * blank must never reach the UI (T-40-43).
                 */
                const owner = view.ownerLabel ?? t("ownerUnavailable")

                /*
                 * THE STATE WORDS (C-40-2): visibility, then default, then owner, joined by ` · `.
                 * WORDS, never icons and never colour. A lock glyph and a share glyph are two more
                 * vocabularies to learn and neither says anything to a screen reader without a
                 * label. This line is NEVER truncated — it is the only carrier of
                 * Shared / Private / Default on this surface.
                 *
                 * The owner segment uses `ownedBy` ("by {owner}") when there is a label and
                 * `ownerUnavailable` ("Owner no longer active") STANDALONE when there is not,
                 * rather than interpolating the latter into the former: es-ES resolves to
                 * "de {owner}" and "El propietario ya no está activo", and nesting them would read
                 * "de El propietario ya no está activo".
                 */
                const stateWords = [
                  isSharedNow ? t("badgeShared") : t("badgePrivate"),
                  isDefaultNow ? t("badgeDefault") : null,
                  view.isOwnedByViewer
                    ? null
                    : view.ownerLabel === null
                      ? t("ownerUnavailable")
                      : t("ownedBy", { owner: view.ownerLabel }),
                ]
                  .filter((word) => word !== null)
                  .join(" · ")

                return (
                  <div
                    key={view.id}
                    className="border-border border-b p-4 last:border-b-0"
                  >
                    {/*
                      `min-w-0` (R-3) so the name cluster may shrink instead of forcing its parent
                      wider. The NAME WRAPS and is NOT truncated: this dialog is where the full name
                      lives, and the picker is the place that truncates.
                    */}
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm">{view.name}</p>
                      <p className="text-muted-foreground text-xs">{stateWords}</p>
                      {/*
                        Server-computed from the 40-01 whitelist (U-3), so the number the user reads
                        and the number the parser accepts cannot diverge.
                      */}
                      <p className="text-muted-foreground text-xs">
                        {t("manage.filterCount", { count: view.filterCount })}
                      </p>
                    </div>

                    {!view.canEdit && (
                      /*
                        G-7's sentence. It explains why the share switch and the delete button are
                        absent from this row, because a missing control with no explanation is how a
                        user concludes the feature is broken. When the owner is soft-deleted the
                        sentence substitutes `ownerUnavailable` and therefore names an admin as the
                        only remaining editor — which is true.
                      */
                      <p className="text-muted-foreground mt-2 text-xs">
                        {t("manage.readOnly", { owner })}
                      </p>
                    )}

                    {/* `flex flex-wrap` (G-3) so the cluster stacks rather than overflowing 241px. */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {view.canEdit && (
                        <div className="flex items-center gap-2">
                          {/*
                            A `Switch` and not a `Checkbox` (G-4): this commits on toggle, and a
                            Switch in this app means immediate effect — which is exactly why the
                            save dialog, whose controls take effect on submit, uses Checkboxes.
                          */}
                          <Switch
                            id={`manage-view-shared-${view.id}`}
                            checked={isSharedNow}
                            disabled={isWriting}
                            onCheckedChange={(next) => {
                              const previous = isSharedNow
                              setSharedOverride((current) => ({ ...current, [view.id]: next }))
                              startTransition(async () => {
                                const result = await setViewShared({ id: view.id, isShared: next })
                                if (result.success) {
                                  /*
                                    THE OVERRIDE IS DISCARDED HERE, NOT LEFT STANDING (WR-06).
                                    It existed to cover the gap between the click and the server's
                                    rebuild; the action has resolved, so `revalidatePath` has
                                    already run and the authoritative `views` prop is on its way.
                                    Leaving the entry in place shadowed that prop PERMANENTLY for
                                    this row — the component is always mounted, only `open`
                                    changes — so a later change from the save dialog, from another
                                    tab, or by a colleague would render as the position this switch
                                    last wrote. Only THIS view's key is dropped: replacing the map
                                    would discard a sibling row's in-flight position.
                                  */
                                  setSharedOverride((current) => {
                                    const remaining = { ...current }
                                    delete remaining[view.id]
                                    return remaining
                                  })
                                  toast.success(t("manage.saved"))
                                  return
                                }
                                setSharedOverride((current) => ({ ...current, [view.id]: previous }))
                                toast.error(t("manage.failed"))
                              })
                            }}
                          />
                          {/* ONE label at a time, resolved on the current state (G-4). */}
                          <Label
                            htmlFor={`manage-view-shared-${view.id}`}
                            className="text-sm font-normal"
                          >
                            {isSharedNow ? t("manage.unshare") : t("manage.share")}
                          </Label>
                        </div>
                      )}

                      {/*
                        THE DEFAULT SWITCH IS RENDERED ALWAYS — INCLUDING ON A ROW THIS VIEWER
                        CANNOT EDIT (G-7). DO NOT move this inside the `view.canEdit &&` guard
                        above; it would look like consistency and would silently delete a capability
                        the feature was designed to grant.
                        A default is PER USER, keyed `(userId, entityType)` in its own table, and
                        40-CONTEXT is explicit that a user may set someone else's SHARED view as
                        their own default — "otherwise sharing has little payoff". `setViewDefault`
                        authorizes on VISIBILITY and deliberately not on ownership for this exact
                        reason (see its header, and T-40-24 for what it does check instead). This
                        asymmetry is the one thing the read-only row must make legible, and the
                        sentence above plus this one live switch is what does it.
                      */}
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`manage-view-default-${view.id}`}
                          checked={isDefaultNow}
                          disabled={isWriting}
                          onCheckedChange={(next) => {
                            const previous = defaultOverride
                            const viewId = next ? view.id : null
                            setDefaultOverride({ viewId })
                            startTransition(async () => {
                              const result = await setViewDefault({ entityType, viewId })
                              if (result.success) {
                                /*
                                  DISCARDED ON SUCCESS, same rule as the share switch (WR-06). The
                                  default is per (user, entityType), so exactly one view can hold
                                  it and `null` IS "no override" — the render falls back to
                                  `storedDefaultId`, derived from the `views` prop the server has
                                  just rebuilt. Left standing, this one override would shadow the
                                  default for EVERY row in the dialog, not just the one clicked.
                                */
                                setDefaultOverride(null)
                                toast.success(t("manage.saved"))
                                return
                              }
                              setDefaultOverride(previous)
                              toast.error(t("manage.failed"))
                            })
                          }}
                        />
                        <Label
                          htmlFor={`manage-view-default-${view.id}`}
                          className="text-sm font-normal"
                        >
                          {isDefaultNow ? t("manage.clearDefault") : t("manage.setDefault")}
                        </Label>
                      </div>

                      {view.canEdit && (
                        /*
                          G-6. `variant="ghost"`, and the WORD beside the icon so colour and glyph
                          are not the sole carriers. It opens the confirmation rather than deleting;
                          this is the only operation on the surface that asks (D-5).
                        */
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isWriting}
                          onClick={() => setPendingDelete(view)}
                        >
                          <Trash2 className="size-4" />
                          {t("manage.delete")}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (isWriting) return
          if (!next) setPendingDelete(null)
        }}
      >
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="leading-tight">{t("delete.title")}</AlertDialogTitle>
            {/*
              ALL THREE CLAUSES OF `views.delete.body` ARE LOAD-BEARING AND NONE MAY BE SHORTENED
              (D-2). Clause 1 is the shared-view blast radius — the row disappears for everyone who
              selected it. Clause 2 states the locked "degrades to unfiltered, with no error"
              outcome BEFORE the click, rather than letting a teammate discover it afterwards with
              nothing on screen to explain why their list changed. Clause 3 is the sentence that
              stops a user believing they just deleted 46,054 organizations.
            */}
            <AlertDialogDescription>
              {t("delete.body", { name: pendingDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* No variant override: the primitive already defaults to `outline` (D-3, K-4). */}
            <AlertDialogCancel disabled={isWriting}>{tCommon("cancel")}</AlertDialogCancel>
            {/*
              `variant="destructive"` PASSED EXPLICITLY (C-40-3). `AlertDialogAction` destructures
              `variant = "default"`, so omitting it is silent: the button would still delete a view
              for every teammate while looking exactly like "OK".

              `preventDefault` because the Radix Action closes the dialog on click. Keeping it open
              for the round trip is what makes the spinner and the disabled Cancel mean anything,
              and it is what lets a REFUSED delete leave the confirmation on screen long enough for
              the error toast to be attributable to it.

              The spinner carries no colour class: a destructive-variant button already tints its
              own foreground, so `text-primary` here would fight it.
            */}
            <AlertDialogAction
              variant="destructive"
              disabled={isWriting}
              onClick={(event) => {
                event.preventDefault()
                handleDelete()
              }}
            >
              {isWriting ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("delete.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
