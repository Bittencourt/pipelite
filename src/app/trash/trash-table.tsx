"use client"

/**
 * The trash table: one tab's rows, the row actions, both restore transitions, the toasts, and the
 * purge confirmation.
 *
 * Ghost and outline only. `/trash` has ZERO accent-filled controls, deliberately — a filled
 * Restore repeated down fifty rows would put the accent on roughly 40% of the page, which is the
 * 10% rule inverted. The page's primary visual anchor is the column of record names
 * (37-UI-SPEC § Color).
 *
 * The `AlertDialog` lives entirely inside this client module and is controlled, with no trigger
 * component of its own. CFUI-01 is a hard boundary: a React element crossing the RSC boundary into
 * a Radix `asChild` slot renders nothing at all, silently, and a repo-wide scan fails the build if
 * a server module hands children to one.
 */

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Loader2, RotateCcw, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useRef, useState, useTransition } from "react"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { TrashTab } from "@/lib/trash/entity-types"
import type { TrashRow } from "@/lib/trash/queries"

import { previewPurgeImpact, purgeRecord, restoreRecord, restoreWithLinked } from "./actions"
import type { TrashErrorCode } from "./actions"
import { useTrashColumns, type TrashTableMeta } from "./trash-columns"

interface TrashTableProps {
  tab: TrashTab
  rows: TrashRow[]
  hasMore: boolean
  page: number
  /** Visibility only. The server action re-checks the role on every call; this is never the gate. */
  isAdmin: boolean
  /** `null` means nothing is emptied automatically, and the empty state must say so. */
  retentionDays: number | null
}

export function TrashTable({
  tab,
  rows,
  hasMore,
  page,
  isAdmin,
  retentionDays,
}: TrashTableProps) {
  const t = useTranslations("trash")
  const tNav = useTranslations("nav")
  const router = useRouter()

  const [isPending, startTransition] = useTransition()

  /**
   * Only the row the user clicked goes busy. Every other row stays interactive, because a user
   * who restored the wrong thing needs to restore the right thing immediately after.
   */
  const [pendingRowId, setPendingRowId] = useState<string | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<TrashRow | null>(null)

  /**
   * How many linked records the pending purge would unlink, or `null` for "not known".
   *
   * `null` covers BOTH "the count has not arrived yet" and "the count could not be taken", and
   * collapsing the two is correct here: the dialog's job is to say what it knows, and it knows the
   * same amount in either case. It renders the no-number wording for `null` rather than assuming
   * zero — telling an admin nothing else will change, on the strength of a query that failed or has
   * not returned, is the one wrong answer available on this surface.
   *
   * Deliberately NOT a reason to disable Confirm. An admin who confirms before the count lands has
   * consented to the wording they were actually shown, which promises no number; blocking the most
   * important control in the surface on a count it does not need would be the worse trade.
   */
  const [purgeImpact, setPurgeImpact] = useState<number | null>(null)

  /**
   * Which row the open dialog is about, as a ref rather than as state.
   *
   * The preview below is a request in flight against a dialog the user can close and reopen on a
   * DIFFERENT row before it lands. Without this check a slow count for row A would arrive after the
   * dialog had moved to row B and be rendered as B's impact — a wrong number on a confirmation for
   * an irreversible write. A ref, because the resolved callback needs the value as of resolution
   * time, not as of the render that started the request.
   */
  const purgeTargetIdRef = useRef<string | null>(null)

  /** Open the confirmation, then fill in what else the purge would touch. */
  function openPurgeDialog(row: TrashRow) {
    purgeTargetIdRef.current = row.id
    setPurgeTarget(row)
    setPurgeImpact(null)

    void previewPurgeImpact(tab, row.id)
      .then((result) => {
        if (purgeTargetIdRef.current !== row.id) return
        // Nothing is reported to the user on failure: the dialog is already open and already
        // honest, and a toast about a count would be noise stacked on a destructive decision.
        if (result.success) setPurgeImpact(result.detached)
      })
      .catch(() => {
        if (purgeTargetIdRef.current === row.id) setPurgeImpact(null)
      })
  }

  /** Close the confirmation and invalidate any preview still in flight for it. */
  function closePurgeDialog() {
    purgeTargetIdRef.current = null
    setPurgeTarget(null)
    setPurgeImpact(null)
  }

  /**
   * ONE transition for all three writes, disambiguated by which target is set. The two are
   * mutually exclusive by construction — the purge dialog is modal, so no row action is
   * reachable while it is open, and `pendingRowId` is never set by the purge path.
   */
  const isPurging = isPending && purgeTarget !== null

  /**
   * Restoring or purging destroys the button that had focus, which drops focus to `<body>`.
   * Focus moves here instead. The announcement rides Sonner's own live region — no second
   * `aria-live` region is added.
   */
  const wrapperRef = useRef<HTMLDivElement>(null)

  function settle() {
    wrapperRef.current?.focus()
    router.refresh()
  }

  /**
   * Branch on the CODE, never on prose. `NOT_IN_TRASH` is the one failure that must not read
   * "try again": the record is gone, and a user told to retry a record that no longer exists
   * will retry forever (T-37-34). It gets a refresh so the stale row leaves.
   */
  function reportRestoreFailure(code: TrashErrorCode) {
    switch (code) {
      case "NOT_IN_TRASH":
        toast.error(t("error.alreadyPurged"))
        router.refresh()
        break
      case "NOT_AUTHENTICATED":
      case "NOT_AUTHORIZED":
      case "NOT_ADMIN":
      case "FAILED":
      default:
        // The row stays and the buttons re-enable, so the action is still reachable.
        toast.error(t("error.restoreFailed"))
    }
  }

  function handleRestore(row: TrashRow) {
    setPendingRowId(row.id)

    startTransition(async () => {
      try {
        const result = await restoreRecord(tab, row.id)

        if (!result.success) {
          reportRestoreFailure(result.code)
          return
        }

        // REQUIRED, and not a violation of "no success toast where the result is visible" — it
        // is the case that rule was written to exclude. A row vanishing from trash is ambiguous
        // between restored and destroyed, so the toast has to name the destination list. The
        // Open action earns its place: the reason someone restores a record is that they need it.
        toast.success(t("restored", { name: result.name, list: tNav(result.tab) }), {
          action: {
            label: t("openRecord"),
            onClick: () => router.push(`/${result.tab}/${row.id}`),
          },
        })
        settle()
      } catch {
        toast.error(t("error.restoreFailed"))
      } finally {
        setPendingRowId(null)
      }
    })
  }

  function handleRestoreWithLinked(row: TrashRow) {
    setPendingRowId(row.id)

    startTransition(async () => {
      try {
        const result = await restoreWithLinked(tab, row.id)

        if (!result.success) {
          reportRestoreFailure(result.code)
          return
        }

        // The ICU plural, reporting the server's `count` and not the length of the badge's
        // parent list: a parent the caller may not touch is skipped by design, so the two can
        // legitimately differ and the toast must not overstate what came back.
        toast.success(t("restoredWithLinked", { count: result.count }))

        // AND THE SHORTFALL, when there is one. Without this second toast the user asked for
        // three records, was told "1 record restored." and got no account of the other two —
        // while the badge that offered the affordance is still on screen after the refresh,
        // which reads as a broken button rather than as a permission boundary. A count only:
        // naming the parents would disclose records this user may not see.
        if (result.unrestoredParents > 0) {
          toast.warning(t("linkedNotRestored", { count: result.unrestoredParents }))
        }

        settle()
      } catch {
        toast.error(t("error.restoreFailed"))
      } finally {
        setPendingRowId(null)
      }
    })
  }

  function confirmPurge(row: TrashRow) {
    startTransition(async () => {
      try {
        const result = await purgeRecord(tab, row.id)
        closePurgeDialog()

        if (!result.success) {
          switch (result.code) {
            case "NOT_ADMIN":
              // Reachable: the control is hidden, not disabled, and the action is a POST
              // endpoint the browser can invoke without ever rendering this page.
              toast.error(t("error.purgeNotPermitted"))
              break
            case "NOT_IN_TRASH":
              // The SAME handling `reportRestoreFailure` gives this code, and for the same
              // reason: the record was purged or restored in another tab, so it is already
              // gone. Falling through to `purgeFailed` with no refresh left the dead row on
              // screen telling the admin the purge failed, which invites a retry of a record
              // that no longer exists — the exact loop the code vocabulary exists to break.
              toast.error(t("error.alreadyPurged"))
              router.refresh()
              break
            case "NOT_AUTHENTICATED":
            case "NOT_AUTHORIZED":
            case "FAILED":
            default:
              // The row stays and the control re-enables, so the action is still reachable.
              toast.error(t("error.purgeFailed"))
          }
          return
        }

        toast.success(t("purged", { name: result.name }))
        settle()
      } catch {
        closePurgeDialog()
        toast.error(t("error.purgeFailed"))
      }
    })
  }

  const columns = useTrashColumns(tab)

  /**
   * The row actions, handed to the actions column through `meta`.
   *
   * Every one carries a VISIBLE TEXT LABEL. Trash is a rarely-visited recovery surface, no
   * tooltip primitive is vendored, and a label is the only reachable accessible name — so an
   * unlabelled glyph beside a red glyph is exactly the wrong thing to hand someone who has
   * never seen this page before.
   */
  const meta: TrashTableMeta = {
    renderActions: (row) => {
      const busy = isPending && pendingRowId === row.id

      return (
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => handleRestore(row)}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {busy ? t("restoring") : t("restore")}
          </Button>

          {/*
            Plural and kind-agnostic on purpose: a deal can have two trashed parents, so
            "Restore with organization" would be a lie half the time.
          */}
          {row.linkedParents.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => handleRestoreWithLinked(row)}
            >
              {busy ? t("restoring") : t("restoreWithLinked")}
            </Button>
          ) : null}

          {/*
            HIDDEN for a non-admin, not disabled. A permanently disabled destructive button is
            furniture and invites "how do I enable this?". The visibility is a courtesy; the
            server action's own admin check is the control.
          */}
          {isAdmin ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => openPurgeDialog(row)}
            >
              <Trash2 className="h-4 w-4" />
              {t("deletePermanently")}
            </Button>
          ) : null}
        </>
      )
    },
  }

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta,
  })

  /*
    Four deliberate omissions from `src/app/organizations/data-table.tsx`, the analog this body
    is otherwise copied from:

    1. No shared data-table keyboard hook, and none of its container or row props. That hook's
       contract is open / edit / create, and none of the three has any meaning on a trashed
       record — wiring it would hand the user shortcuts that either do nothing or navigate to a
       404.
    2. No search input and no "Add" button. Search inside trash is out of scope: the list is
       bounded by the retention window and sorted newest-deleted-first, which already puts "the
       thing I just deleted by mistake" at row 1.
    3. The empty cell is translated per entity rather than carrying an English literal, and it
       never promises a retention window the system is not enforcing.
    4. The pagination button's label is translated too. Writing new untranslated English in 2026
       to match legacy debt propagates the debt.
  */
  return (
    <div className="space-y-4">
      <div className="rounded-md border" ref={wrapperRef} tabIndex={-1}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <p className="text-sm leading-tight font-semibold">
                    {t(`empty.${tab}`)}
                  </p>
                  <p className="text-muted-foreground text-sm leading-normal">
                    {retentionDays === null
                      ? t("empty.bodyNoRetention")
                      : t("empty.body", { days: retentionDays })}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {hasMore ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/trash?type=${tab}&page=${page + 1}`)}
          >
            {t("loadMore")}
          </Button>
        </div>
      ) : null}

      {/*
        Controlled, with no trigger of its own — the non-definer shape `retention-form.tsx` and
        `delete-note-dialog.tsx` both use. `onOpenChange` refuses to close while the purge is in
        flight, so ESC and an overlay click cannot abandon a request that is already running.

        The description names all THREE categories of consequence, which is what took a copy
        amendment to get right (WR-08, UAT G1):

          - DESTROYED — the record and its notes;
          - MODIFIED  — the linked records the purge unlinks but keeps. These are LIVE rows the
            admin did not select: purging one deal unlinks up to 117 activities, and purging an
            organization unlinks every deal and person under it. The dialog enumerated the other
            two categories and silently omitted this one, and UAT G1 watched a live person lose its
            organization through it. The count comes from `previewPurgeImpact` before the write;
            when it is not known, `descriptionUnknownImpact` says so without inventing a number;
          - PRESERVED — the change history, plus one further entry recording the purge. Omitting
            that would leave an admin believing a purge erases the evidence of the purge (T-37-14).
      */}
      <AlertDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => {
          if (isPurging) return
          if (!open) closePurgeDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("purgeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {purgeImpact === null
                ? t("purgeDialog.descriptionUnknownImpact", {
                    name: purgeTarget?.name ?? "",
                  })
                : t("purgeDialog.description", {
                    name: purgeTarget?.name ?? "",
                    detached: purgeImpact,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPurging}>
              {t("purgeDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Radix closes on click by default; the dialog has to stay open while the
                // request is in flight so the spinner and the disabled state are visible.
                event.preventDefault()
                if (purgeTarget !== null) confirmPurge(purgeTarget)
              }}
              disabled={isPurging}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPurging ? <Loader2 className="size-4 animate-spin" /> : null}
              {isPurging ? t("deleting") : t("purgeDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
