"use client"

/**
 * THE PER-RECORD FAILURE REPORT — the surface that makes SC-3 true.
 *
 * SC-3 is "any per-record failure is named rather than silently swallowed", and it is the whole
 * reason bulk delete and bulk reassign run per-record and sequentially instead of inside one
 * transaction: an aborting transaction structurally cannot tell you WHICH record refused. Having
 * paid for that per-record shape in the server actions, this component is where the individual
 * records actually get named. The other half of a partial outcome is the toast summary, which
 * carries the counts; this one carries the list.
 *
 * NOTHING IS CAPPED HERE, AND THAT IS THE POINT. A trailing "plus another three" element is exactly
 * the swallowing SC-3 forbids — it is indistinguishable, from the user's side, from a failure that
 * was never reported. Forty failures therefore render as forty rows. Height is bounded instead by a
 * scrolling box on the list (192px, roughly eight rows), so the page does not grow, the fixed bar
 * below stays reachable, and every row remains in the DOM and in the accessibility tree, because a
 * screen reader walks the whole list regardless of what the scroll box shows.
 *
 * THE REASON IS A CODE, NEVER A SERVER SENTENCE. `BulkFailure` carries `{ id, reason }` and has no
 * message field to render, by design (T-38-07): a mutation's own refusal string never passes through
 * next-intl, so it would appear in English beside translated copy, and those strings are written for
 * a server log where naming a table or a Postgres constraint is fine. The lookup below is a direct
 * translation of the closed four-member union with no fallback branch, so there is no code path along
 * which server prose reaches the browser. The sibling gate additionally proves every member of that
 * union has a copy key, so widening the union cannot ship an untranslated raw key.
 *
 * IT DOES NOT DISAPPEAR ON ITS OWN. There is deliberately no timer of any kind in this file: a list
 * of records that failed is the one thing on this surface a user may need to write down before
 * acting. It goes away when the user presses Dismiss, when the next bulk result replaces it, or when
 * the caller clears the selection — all three owned by the caller.
 *
 * ON THE PRIMITIVES. `Alert` hardcodes `role="alert"`, so no bespoke announcement region is needed
 * or permitted here. Its destructive variant supplies a border and a foreground colour and NO
 * background fill, which is what makes a destructive REGION admissible rather than only a
 * destructive control. And its base class already carries `relative` plus the icon positioning
 * rules, so the corner dismiss button needs no positioning context of its own. `AlertTitle` ships at
 * weight 500 while the Label role asks for 600; the sanctioned resolution is the extra weight class
 * in this consumer's className rather than a patch to the shared primitive, which six other callers
 * depend on.
 *
 * Colour is never the sole carrier of the meaning: the title states a count in words, and each row
 * states its reason in words. A user who cannot tell the two themes apart still reads different
 * text and a different number.
 *
 * Mounted ABOVE the table by the caller, below the search and filter row — this is a report to read,
 * not a control to press, and it can run to several lines, so it must not go inside the fixed bar
 * that has to stay one compact cluster at every viewport.
 */

import { AlertCircle } from "lucide-react"
import { useTranslations } from "next-intl"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { BulkFailure, BulkOperationKind } from "@/lib/bulk/types"

export interface BulkFailureReportProps {
  kind: BulkOperationKind
  failures: BulkFailure[]
  /** id -> display name, captured AT SUBMIT TIME by the caller. */
  labelById: Record<string, string>
  onDismiss: () => void
}

export function BulkFailureReport({
  kind,
  failures,
  labelById,
  onDismiss,
}: BulkFailureReportProps) {
  const t = useTranslations("bulk")

  // Returning null rather than an empty box lets every caller mount this unconditionally: with
  // nothing to report the surface is ABSENT, not present-and-blank.
  if (failures.length === 0) return null

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" aria-hidden />
      <AlertTitle className="font-semibold">
        {kind === "delete"
          ? t("failures.deleteTitle", { count: failures.length })
          : t("failures.reassignTitle", { count: failures.length })}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
          {failures.map((failure) => (
            <li key={failure.id} className="flex flex-wrap items-baseline gap-1">
              {/*
                Falling back to the raw id when a label is missing still NAMES the record, which is
                what SC-3 asks for. A generic stand-in like "a record" would not, so there is none.
              */}
              <span>{labelById[failure.id] ?? failure.id}</span>
              <span className="text-muted-foreground text-xs">
                {"— " + t(`reason.${failure.reason}`)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-2 text-xs">{t("failures.retryHint")}</p>
      </AlertDescription>
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-2 top-2"
        onClick={onDismiss}
      >
        {t("failures.dismiss")}
      </Button>
    </Alert>
  )
}
