"use client"

/**
 * The one floating bulk action bar: four surfaces mount this, and it owns both dialogs, the in-flight
 * state, the over-cap state and the export download.
 *
 * A FIXED BOTTOM BAR, WHICH IS THE LOAD-BEARING LAYOUT DECISION OF THE PHASE. The two alternatives
 * fail concretely rather than aesthetically. A row inserted above the table pushes every row down by
 * about 48px WHILE the user is mid-selection, so the second checkbox they aim at sits under a
 * different record — the one failure a selection UI must never have. And both alternatives scroll out
 * of view long before the user finishes selecting on a list that accumulates 150+ rows through Load
 * More, which is precisely when a bulk action is wanted.
 *
 * THE SPACER IS NOT OPTIONAL. A `fixed` bar covers whatever is at the bottom of the document, which
 * on every one of these surfaces is the last table row and the Load More button. The sibling spacer
 * below the bar is what buys that space back, and because the caller mounts this component at the end
 * of its stack the spacer changes only what sits below everything — no row the user is aiming at
 * moves.
 *
 * THE WRAP CONTRACT IS A CORRECTNESS REQUIREMENT, NOT STYLING. A `fixed` element that exceeds the
 * viewport still contributes to `document.scrollWidth`, so a bar wider than 320px would give the whole
 * page a horizontal scrollbar. The capped max-width plus wrapping is what makes the bar fold onto two
 * or three lines instead. This is Phase 37's measured lesson, applied before the defect.
 *
 * ON THE STACKING ORDER. The app mounts a global keyboard-shortcuts hint as a `fixed bottom-0`
 * element with a z-index of fifty for the first ten seconds of any session whose dismissal flag is
 * unset, so on a fresh browser profile a bar layered below that would be unreachable exactly when a
 * new user first tries a bulk action. This bar therefore sits above it (D-22). Nothing is coupled: the
 * hint still auto-dismisses on its own, and the toast container is untouched because it carries a
 * nine-digit z-index of its own and always renders above both (D-23).
 *
 * ZERO FILLED CONTROLS, DELIBERATELY. The bar already has the strongest visual weight on the page —
 * it floats over the rows on a raised card surface — so a filled button inside it would read as the
 * page's dominant element while sitting permanently on top of the user's data. Reassign and Export are
 * outlines, Delete is a ghost tinted with the destructive token, Clear is a ghost.
 *
 * EVERY CONTROL CARRIES A VISIBLE TEXT LABEL. No hover-only hint primitive is vendored in this repo,
 * so a label is the only reachable accessible name — and a bare red trash glyph floating over the
 * user's records is the single most dangerous unlabelled control this phase could ship.
 */

import { Download, Loader2, Trash2, UserPen, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState, useTransition } from "react"

import { BulkDeleteDialog } from "@/components/bulk/bulk-delete-dialog"
import {
  BulkReassignDialog,
  type BulkOwnerOption,
} from "@/components/bulk/bulk-reassign-dialog"
import { Button } from "@/components/ui/button"
import type { EntityType } from "@/db/schema/custom-fields"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import type { BulkOutcome, BulkWriteResult } from "@/lib/bulk/types"
import type { ExportResult } from "@/lib/export/types"

/** Which action is in flight. ONE value rather than three booleans: the bar is not a queue. */
type PendingAction = null | "delete" | "reassign" | "export"

export interface BulkActionBarProps {
  entityType: EntityType
  selectedIds: string[]
  /** Resolves a display name for the failure report; called at SUBMIT time, not render time. */
  getLabel: (id: string) => string
  /** null means nothing is purged automatically. Never defaulted. */
  retentionDays: number | null
  owners: BulkOwnerOption[]
  onDelete: (ids: string[]) => Promise<BulkWriteResult>
  onReassign: (ids: string[], ownerId: string) => Promise<BulkWriteResult>
  onExport: (ids: string[]) => Promise<ExportResult>
  /** Called after a delete or reassign settles. The caller deselects succeeded ids, keeps failed
   *  ids selected, and renders the failure report. */
  onOutcome: (outcome: BulkOutcome) => void
  /** Called after a successful export, and by Clear selection. */
  onClear: () => void
}

export function BulkActionBar({
  entityType,
  selectedIds,
  getLabel,
  retentionDays,
  owners,
  onDelete,
  onReassign,
  onExport,
  onOutcome,
  onClear,
}: BulkActionBarProps) {
  const t = useTranslations("bulk")

  const [, startTransition] = useTransition()

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [pending, setPending] = useState<PendingAction>(null)

  const count = selectedIds.length
  const hasSelection = count > 0
  const busy = pending !== null

  /**
   * The client mirror of the cap is ADVISORY ONLY — every bulk server action re-checks the same
   * constant, because a server action is a POST endpoint and a client-side cap is a hint. Its purpose
   * here is to make the state legible BEFORE the click instead of after a rejection.
   */
  const overCap = count > BULK_MAX_IDS

  /**
   * ESCAPE IS THE ONLY NEW BINDING, AND THAT IS THE PHASE'S MOST SAFETY-RELEVANT NON-CHANGE.
   * The list surfaces already bind bare letters to single-record actions, and the letter that opens
   * the single-record delete dialog for the keyboard-cursor row keeps doing exactly that while a bulk
   * selection exists. Silently repurposing it to mean "delete twelve records" would be the most
   * dangerous thing this phase could ship, so no letter, and no bare deletion key, is bound here.
   *
   * The gate in the handler is what keeps Radix owning Escape while a dialog is open, and what stops
   * a stray Escape from discarding the selection out from under a request that is already running.
   * A listener registered in an effect rather than a state update in one: this repo treats a
   * synchronous state update inside an effect as a build error.
   */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (!hasSelection || busy || deleteOpen || reassignOpen) return
      onClear()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [hasSelection, busy, deleteOpen, reassignOpen, onClear])

  /**
   * id -> display name, captured AT SUBMIT TIME and never at render time.
   *
   * A record that failed because it no longer exists is by definition absent from the next server
   * render, so a label resolved from a server-rebuilt prop after the call would be missing for
   * exactly the rows that need one. The submitted array still holds every id.
   */
  function captureLabels(ids: string[]): Record<string, string> {
    return Object.fromEntries(ids.map((id) => [id, getLabel(id)]))
  }

  function handleDelete() {
    const ids = [...selectedIds]
    const labelById = captureLabels(ids)

    setPending("delete")

    startTransition(async () => {
      try {
        const result = await onDelete(ids)
        setDeleteOpen(false)

        if (!result.success) return

        onOutcome({
          kind: "delete",
          succeeded: result.succeeded,
          failed: result.failed,
          labelById,
        })
      } finally {
        setPending(null)
      }
    })
  }

  function handleReassign(ownerId: string) {
    const ids = [...selectedIds]
    const labelById = captureLabels(ids)

    setPending("reassign")

    startTransition(async () => {
      try {
        const result = await onReassign(ids, ownerId)
        setReassignOpen(false)

        if (!result.success) return

        onOutcome({
          kind: "reassign",
          succeeded: result.succeeded,
          failed: result.failed,
          labelById,
        })
      } finally {
        setPending(null)
      }
    })
  }

  function handleExport() {
    const ids = [...selectedIds]

    setPending("export")

    startTransition(async () => {
      try {
        const result = await onExport(ids)

        if (!result.success) return

        onClear()
      } finally {
        setPending(null)
      }
    })
  }

  /**
   * WITH NOTHING SELECTED THE BAR IS ABSENT FROM THE DOM, ALONG WITH ITS SPACER. No reserved strip and
   * no ghost bar: a permanently present empty bar would consume 80px of every list on the chance a
   * selection appears. The hooks above all run first, so this early return is a render decision only.
   */
  if (!hasSelection) return null

  return (
    <>
      <div
        role="region"
        aria-label={t("actionBarLabel", { count })}
        className="fixed inset-x-4 bottom-4 z-[60] mx-auto w-fit max-w-[calc(100%-2rem)]
                   rounded-lg border bg-card shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-center gap-2 p-2">
          {/*
            The count is the bar's FIRST element and it is Label weight, not body weight: a user about
            to press a destructive button must read a number before they read a verb, and rendering it
            lighter than the button labels beside it would make it the weakest text in the most
            consequential control cluster in the product.
          */}
          <span className="text-sm leading-tight font-semibold px-1">
            {t("selected", { count })}
          </span>

          {overCap ? (
            <span className="text-xs text-destructive">
              {t("error.tooMany", { max: BULK_MAX_IDS, count })}
            </span>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            disabled={busy || overCap}
            onClick={() => setReassignOpen(true)}
          >
            {pending === "reassign" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPen className="h-4 w-4" />
            )}
            {pending === "reassign"
              ? t("reassignDialog.reassigning")
              : t("reassignOwner")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={busy || overCap}
            onClick={handleExport}
          >
            {pending === "export" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {pending === "export" ? t("exporting") : t("exportCsv")}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={busy || overCap}
            onClick={() => setDeleteOpen(true)}
          >
            {pending === "delete" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {pending === "delete" ? t("deleteDialog.deleting") : t("delete")}
          </Button>

          {/*
            Clear selection stays enabled over the cap, and that is the whole point of the over-cap
            state: the three actions are refused, so the one control that resolves the situation must
            not be refused with them.
          */}
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClear}>
            <X className="h-4 w-4" />
            {t("clearSelection")}
          </Button>
        </div>
      </div>

      <div aria-hidden className="h-20" />

      <BulkDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        count={count}
        retentionDays={retentionDays}
        isDeleting={pending === "delete"}
        onConfirm={handleDelete}
      />

      <BulkReassignDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        count={count}
        owners={owners}
        isReassigning={pending === "reassign"}
        onConfirm={handleReassign}
      />
    </>
  )
}
