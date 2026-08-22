"use client"

/**
 * THE SAVE / UPDATE DIALOG — where a filter set becomes a named object.
 *
 * One name field, two checkboxes, an optional target choice, and this phase's ONLY primary-filled
 * button. It is criterion 1's write half: everything else in the feature reads views, this is the
 * one surface that creates and overwrites them.
 *
 * WHY THE HEIGHT CLAMP IS ON THIS CALL SITE AND NOT ON THE PRIMITIVE (O-1). `DialogContent` was
 * measured this session and declares NEITHER a max-height NOR an overflow-y: `max-height: none`,
 * `overflow-y: visible`, `position: fixed`, with `body { overflow: hidden }` behind it. The
 * `/organizations` create dialog already occupies 586px of a 640px viewport — about 54px of
 * headroom — and this dialog carries strictly more content than that one. Without
 * `max-h-[calc(100dvh-2rem)] overflow-y-auto` the submit button leaves the viewport with nothing to
 * scroll, which is F-39-07 verbatim: a mobile dead-end that shipped past a green
 * horizontal-overflow gate. `dvh` and not `vh`, because a mobile browser's URL bar changes `vh`
 * mid-scroll and F-39-07 was a mobile defect.
 *
 * The clamp is NOT an edit to `src/components/ui/dialog.tsx`. That primitive is shared by roughly
 * sixteen dialogs, and retuning the height behaviour of all sixteen is a different change with a
 * different blast radius. `max-w-[calc(100%-2rem)]` is deliberately left alone (R-6): it is what
 * keeps the dialog at 288px on a 320px screen.
 *
 * WHY THIS IS A REAL `<form>` (O-4). `data-table-keyboard.tsx` registers
 * `useHotkeys("enter", …, { preventDefault: true })` with NO ref, and its `isFormFocused` guard
 * exempts INPUT, TEXTAREA, SELECT and contenteditable — but NOT BUTTON. The name input is therefore
 * exempt, so Enter typed inside it reaches this form and submits it; a click handler on the button
 * would instead let the page-level hotkey win. That app-wide defect (F-39-08) is out of scope here
 * and is accepted rather than inherited silently — plan 40-15 asserts that Enter on the focused
 * submit does not navigate the list behind the dialog.
 *
 * NOTHING HERE TRUSTS ITSELF. The submitted name, filter map and booleans are all re-derived by
 * `guardSaveInput` server-side, and authorization is read from the STORED row. The target choice
 * below is an explanation of what the server will allow, never the enforcement of it.
 */

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { createView, updateView } from "@/lib/views/actions"
import type { SavedViewSummary, ViewEntityType, ViewFilters } from "@/lib/views/types"

/** Which row the submit writes. The two values are also the two catalog key suffixes. */
type SaveTarget = "targetUpdate" | "targetNew"

/** The inline slot beneath the name input holds exactly one refusal at a time. */
type NameError = "nameRequired" | "nameTaken" | null

export interface SaveViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: ViewEntityType
  /**
   * The CURRENT filters, already picked through the 40-01 whitelist by the bar.
   *
   * This — never `selectedView.filters` — is what both branches persist. The entire point of the
   * feature is that the saved filters are the ones on screen now, and since plan 40-18 made
   * selection come from `?view=<id>` rather than from filter equality, a view can be selected while
   * the URL's filters differ from its stored ones. Writing back the stored map would make
   * "Save changes" a successful no-op.
   */
  filters: ViewFilters
  /** The view named by `?view=<id>`, or `null` when nothing is selected. */
  selectedView: SavedViewSummary | null
  /** Owner-or-admin on `selectedView`, resolved server-side. */
  canUpdateSelected: boolean
}

export function SaveViewDialog({
  open,
  onOpenChange,
  entityType,
  filters,
  selectedView,
  canUpdateSelected,
}: SaveViewDialogProps) {
  const t = useTranslations("views")
  const tCommon = useTranslations("common")

  /*
   * DEFAULT `targetUpdate` (S-3). "I opened my view, tweaked it and pressed save" means update far
   * more often than it means fork, and the opposite default silently accumulates near-identical
   * copies of one view. This branch was structurally unreachable before plan 40-18, so the default
   * has never been corrected by a user noticing it.
   */
  const [target, setTarget] = useState<SaveTarget>("targetUpdate")
  const [name, setName] = useState(
    selectedView !== null && canUpdateSelected ? selectedView.name : ""
  )
  const [isShared, setIsShared] = useState(selectedView?.isShared ?? false)
  const [makeDefault, setMakeDefault] = useState(selectedView?.isDefaultForViewer ?? false)
  const [nameError, setNameError] = useState<NameError>(null)

  /*
   * In-flight state comes from `useTransition` and is never written into a state variable from an
   * effect: `react-hooks/set-state-in-effect` is an ERROR in this repo (K-7), and the three existing
   * suppressions are all logged deferrals. A brand-new file adding a fourth would be debt created
   * on purpose.
   */
  const [isSaving, startTransition] = useTransition()

  /*
   * Re-seed the fields when the dialog OPENS, using React's documented
   * adjust-state-when-a-prop-changes pattern rather than an effect — same reason as above, and the
   * same shape `bulk-reassign-dialog.tsx` uses. Keyed on the `open` transition and never on
   * `selectedView`, because `revalidatePath` re-renders the current client tree regardless of its
   * path argument, so a reset keyed on a server-rebuilt prop can fire mid-submit and clear the
   * user's typing out from under a request that is already running.
   */
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setTarget("targetUpdate")
      setName(selectedView !== null && canUpdateSelected ? selectedView.name : "")
      setIsShared(selectedView?.isShared ?? false)
      setMakeDefault(selectedView?.isDefaultForViewer ?? false)
      setNameError(null)
    }
  }

  /**
   * The row this submit will overwrite, or `null` when it will create one instead.
   *
   * A `const` rather than a boolean so the non-null narrowing survives into the transition callback
   * below. `canUpdateSelected` is re-checked here and not only at the render site: a viewer who may
   * not overwrite the selected view never gets the radio group, so `target` would still read
   * `targetUpdate` from its initial state and the submit would aim at a row the server refuses.
   */
  const overwriteTarget = target === "targetUpdate" && canUpdateSelected ? selectedView : null

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = name.trim()

    /*
     * The refusal is inline and on submit, and the submit button is NOT disabled on an empty name
     * (S-7, P-7): a disabled control with no adjacent reason tells the user nothing about why, while
     * this message sits beside the field that caused it and is announced.
     */
    if (trimmedName.length === 0) {
      setNameError("nameRequired")
      return
    }

    // Cleared on SUBMIT, not on every keystroke — a duplicate-name refusal has to survive while the
    // user reads it and edits the name it names.
    setNameError(null)

    startTransition(async () => {
      const result =
        overwriteTarget !== null
          ? await updateView({
              id: overwriteTarget.id,
              name: trimmedName,
              filters,
              isShared,
              makeDefault,
            })
          : await createView({
              entityType,
              name: trimmedName,
              filters,
              isShared,
              makeDefault,
            })

      if (result.success) {
        // The action revalidates the list route, so the bar re-renders with the new selection on its
        // own. There is nothing to refetch here (S-13).
        toast.success(
          overwriteTarget !== null
            ? t("save.updated", { name: result.name })
            : t("save.created", { name: result.name })
        )
        onOpenChange(false)
        return
      }

      // Both name refusals land in the same inline slot, and the dialog stays open with every field
      // intact — the user's next act is to edit the name they just typed.
      if (result.error === "name_taken") {
        setNameError("nameTaken")
        return
      }

      if (result.error === "name_required") {
        setNameError("nameRequired")
        return
      }

      /*
       * Everything else — including `forbidden`, `no_filters` and `not_authenticated` — is one
       * toast and an open dialog with nothing discarded (S-14). `forbidden` gets no dedicated
       * sentence: the radio group already explained what this viewer may do, so reaching it means
       * the row changed underneath them and a retry is the honest next step.
       */
      toast.error(t("save.failed"))
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // ESC and an overlay click must not abandon a write that is already in flight.
        if (isSaving) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          {/*
            `leading-tight` per call site (T-1): the primitive ships `text-lg leading-none`, and the
            es-ES `titleUpdate` is 33 characters, which wraps inside 288px. `leading-none` on a
            wrapping title overlaps its own lines.

            ONE label at a time, keyed on the PRESENCE of the target choice rather than on which
            option is selected — the question the title answers is "what surface am I on", and that
            does not change when the user picks "save as new".
          */}
          <DialogTitle className="leading-tight">
            {selectedView !== null && canUpdateSelected
              ? t("save.titleUpdate")
              : t("save.titleNew")}
          </DialogTitle>
          <DialogDescription>{t("save.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {selectedView !== null && canUpdateSelected && (
            <div className="space-y-2">
              <Label id="save-view-target-legend">{t("save.targetLegend")}</Label>
              <RadioGroup
                aria-labelledby="save-view-target-legend"
                value={target}
                onValueChange={(next) => {
                  const chosen: SaveTarget = next === "targetNew" ? "targetNew" : "targetUpdate"
                  setTarget(chosen)
                  // The name follows the target: overwriting starts from the view's own name,
                  // forking starts from an empty field. NEVER from a generated name (S-5) — a
                  // default nobody chose is a list of identical rows six months later.
                  setName(chosen === "targetUpdate" ? (selectedView?.name ?? "") : "")
                }}
                disabled={isSaving}
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="targetUpdate" id="save-view-target-update" />
                  <Label htmlFor="save-view-target-update" className="font-normal">
                    {t("save.targetUpdate", { name: selectedView.name })}
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="targetNew" id="save-view-target-new" />
                  <Label htmlFor="save-view-target-new" className="font-normal">
                    {t("save.targetNew")}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {selectedView !== null && !canUpdateSelected && (
            /*
              S-4. The refusal REPLACES the choice; the two are mutually exclusive. It names both
              the reason and the person, because a missing option with no explanation is how a user
              concludes the feature is broken.

              `ownerLabel` is server-computed (`name || email`) and is `null` only when the owner row
              is soft-deleted — both branches are live in this deployment, where two of three active
              users have a NULL name and six users are soft-deleted. A uuid or a blank must never
              reach this sentence (T-40-38).
            */
            <p className="text-muted-foreground text-xs">
              {t("save.targetNewOnly", {
                name: selectedView.name,
                owner: selectedView.ownerLabel ?? t("ownerUnavailable"),
              })}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="save-view-name">{t("save.nameLabel")}</Label>
            <Input
              id="save-view-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("save.namePlaceholder")}
              disabled={isSaving}
              // The focal point of the surface and the only control with no correct default.
              autoFocus
              aria-invalid={nameError !== null}
              aria-describedby={nameError === null ? undefined : "save-view-name-error"}
            />
            {nameError !== null && (
              <p id="save-view-name-error" className="text-destructive text-xs">
                {nameError === "nameTaken"
                  ? t("save.nameTaken", { name: name.trim() })
                  : t("save.nameRequired")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              {/*
                A `Checkbox` and not a `Switch` (S-8): this change takes effect on submit, and a
                `Switch` in this app means immediate effect — the manage dialog uses one for exactly
                that reason.
              */}
              <Checkbox
                id="save-view-shared"
                checked={isShared}
                onCheckedChange={(checked) => setIsShared(checked === true)}
                disabled={isSaving}
              />
              <Label htmlFor="save-view-shared" className="font-normal">
                {t("save.sharedLabel")}
              </Label>
            </div>
            {/*
              The helper resolves on the state, and the unchecked sentence is load-bearing: "Nobody
              else, including admins" is the entire point of this feature's departure from the app's
              `owner || role === "admin"` idiom, and a user who cannot read it cannot rely on it.
            */}
            <p className="text-muted-foreground text-xs">
              {isShared ? t("save.sharedHelp") : t("save.privateHelp")}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="save-view-default"
                checked={makeDefault}
                onCheckedChange={(checked) => setMakeDefault(checked === true)}
                disabled={isSaving}
              />
              <Label htmlFor="save-view-default" className="font-normal">
                {t("save.defaultLabel")}
              </Label>
            </div>
            {/*
              One sentence for all four surfaces, with NO `{entity}` placeholder (S-10). Interpolating
              the entity noun would need gender agreement on the article in pt-BR and es-ES and would
              turn one key into twelve — the trap `audit.entry.*` already paid for.
            */}
            <p className="text-muted-foreground text-xs">{t("save.defaultHelp")}</p>
          </div>

          <DialogFooter>
            {/*
              Cancel FIRST in the DOM, submit LAST, and `DialogFooter`'s `flex-col-reverse` is NOT
              overridden (S-12): at 320px it stacks and renders the last DOM child visually first,
              which puts the primary action at the top of the stack. Plan 40-15 asserts it is
              trial-clickable there. No close-label override (K-4).
            */}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {tCommon("cancel")}
            </Button>
            {/*
              THE ONLY PRIMARY-FILLED BUTTON THIS PHASE ADDS ANYWHERE. Every other control the
              feature introduces is outline, ghost or a menu item. Do not add a second one.

              The spinner carries no colour class: this button is `bg-primary text-primary-foreground`,
              so it already tints its own icon, and `text-primary` here would draw primary-on-primary.
            */}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              {isSaving ? t("save.submitting") : t("save.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
