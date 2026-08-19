"use client"

import Link from "next/link"
import { TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CREATE_TIME_MATCH_LIMIT } from "@/lib/dedup/constants"
import type { DedupReason, MergeableEntityType } from "@/lib/dedup/types"
import type { CertainMatch } from "@/lib/dedup/matching"

/**
 * THE CREATE-TIME DUPLICATE ADVISORY — 39-UI-SPEC Surface 1, rules W-1 through W-10.
 *
 * Rendered INLINE inside the open create dialog, directly above the form fields (W-1). Not a nested
 * dialog, not a Sheet, not a toast: a second modal over a modal at 320px has nowhere to go, and a
 * toast is dismissible by timeout — an advisory the user can miss is not an advisory.
 *
 * ---
 * C-1 — `variant="default"`, NEVER `destructive`.
 *
 * There is no `--warning` token in `src/app/globals.css` and this phase adds none. A possible
 * duplicate is not an error, and painting it red would contradict the locked decision that the
 * warning is advisory and never blocking. The weight is carried by the words and the icon.
 * ---
 * THIS COMPONENT RENDERS NO BUTTONS, and that is a rule rather than an omission.
 *
 * All three actions belong to the dialog around it: "create anyway" is the dialog's EXISTING submit
 * button, relabelled while this is showing (W-4); cancel is the dialog's existing close (W-5); and
 * "open the existing record" is the per-row link below (W-3). A button here would put a second
 * primary-filled control on a surface the design contract allows exactly one of.
 *
 * There is deliberately no "merge now" either (W-6): an unsaved draft has no losing record to move
 * to Trash and no field history to reconcile, so a merge affordance here would name an operation
 * that cannot exist.
 * ---
 * The type-only imports of `CertainMatch`, `DedupReason` and `MergeableEntityType` are erased at
 * compile time, so nothing here drags `@/db` (and through it `postgres`) into the browser bundle.
 * `CREATE_TIME_MATCH_LIMIT` is a VALUE import and is safe because `@/lib/dedup/constants` imports
 * nothing at all — the same constraint `retention-form.tsx` documents for `@/lib/trash/settings`.
 */

/**
 * Every `DedupReason` mapped to its `dedup.reason.*` leaf.
 *
 * The map is not ceremony. next-intl messages are UNTYPED in this repo (there is no `IntlMessages`
 * augmentation), so `t(match.reason)` would compile against any string and a fifth reason would
 * surface as a missing-key error at runtime, in front of a user, on the one screen that is supposed
 * to reduce confusion. `Record<DedupReason, string>` makes a new reason a COMPILE error here, and
 * spelling all four leaves also lets a comment-blind source gate read the key set.
 */
const REASON_MESSAGE_KEY: Readonly<Record<DedupReason, string>> = Object.freeze({
  email: "email",
  nameIdentity: "nameIdentity",
  similarName: "similarName",
  similarNamePhone: "similarNamePhone",
})

/** Where a matched record lives. `Record<MergeableEntityType, …>` for the same exhaustiveness. */
const DETAIL_PATH: Readonly<Record<MergeableEntityType, string>> = Object.freeze({
  organization: "/organizations",
  person: "/people",
})

interface DuplicateWarningProps {
  matches: CertainMatch[]
  entityType: MergeableEntityType
}

export function DuplicateWarning({ matches, entityType }: DuplicateWarningProps) {
  const t = useTranslations("dedup.warning")
  const tReason = useTranslations("dedup.reason")

  if (matches.length === 0) return null

  /**
   * W-8 — capped at five, with NO "and N more" affordance.
   *
   * `findCertainMatches` already caps on the query, so this slice is a second belt on a client that
   * is handed a longer array by some future caller. Six certain matches means the data is broken in
   * a way a create-time interruption cannot fix; the scan at `/duplicates` is where a long list
   * belongs, and a "more" link here would invite the user to leave the dialog and lose the draft.
   */
  const visible = matches.slice(0, CREATE_TIME_MATCH_LIMIT)

  return (
    <Alert variant="default">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>{t("title", { count: matches.length })}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{t("body")}</p>

        {/* Stacked blocks, never a horizontal row: three values side by side cannot survive 241px
            of usable width inside a dialog at a 320px viewport. `min-w-0` on every block and
            `break-words` on every value, so a long domain or address wraps rather than being
            clipped — a value the user cannot read in full is a value they cannot audit, and the
            clipping utilities are gated at zero occurrences in this file. */}
        <ul className="space-y-2">
          {visible.map((match) => (
            <li key={match.id} className="min-w-0 space-y-1">
              <Link
                href={`${DETAIL_PATH[entityType]}/${match.id}`}
                // W-3 — A NEW TAB, ALWAYS. Opening in the same tab would navigate away from the
                // dialog and destroy the draft, which is exactly what W-2 exists to prevent. The
                // noopener/noreferrer pair below travels with the blank target and is never
                // separated from it (T-39-35); both are gated at exactly one occurrence in this
                // file, which is why neither attribute is spelled anywhere else in it.
                target="_blank"
                rel="noopener noreferrer"
                // The sanctioned accent use in this phase: a link from a listed row to the record
                // it names, the same idiom as `audit-entry.tsx`.
                className="block min-w-0 break-words text-sm text-primary hover:underline"
              >
                {match.name}
                {/* The new-tab behaviour is ANNOUNCED, not implied. Composed from content rather
                    than an `aria-label`, so the accessible name is still the record's name first
                    and a screen-reader user is told which record they are opening. */}
                <span className="sr-only"> {t("openExisting")}</span>
              </Link>

              <p className="min-w-0 break-words text-xs text-muted-foreground">
                {match.distinguishingValue}
              </p>

              {/* A MATCHED RECORD IS NEVER SHOWN WITHOUT ITS REASON. A bare name the user cannot
                  audit is what turns a warning into noise people learn to click through, so the
                  reason is not conditional and there is no branch that can omit it. */}
              <p className="min-w-0 break-words text-xs text-muted-foreground">
                {tReason(REASON_MESSAGE_KEY[match.reason])}
              </p>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
