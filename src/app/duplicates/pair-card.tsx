"use client"

/**
 * One reported duplicate pair, as the review list renders it (39-UI-SPEC L-3 to L-8).
 *
 * A CARD, NOT A TABLE ROW, AND THE TWO RECORDS ARE STACKED AT EVERY VIEWPORT. A table forces them
 * into columns; at a 320px viewport the container gutter leaves 241px, so each record would get about
 * 110px and `overflow-x-auto` would hide half of the comparison behind a scrollbar the user has no
 * reason to suspect. Stacked, the card reads identically at 320 and at 1280 (L-3, R-3).
 *
 * ONE COMPONENT FOR BOTH VIEWS. The dismissed list is this same card with `dedup.review.undismiss` in
 * place of the two actions (L-7), not a second list implementation that drifts from this one.
 *
 * DISMISSAL IS ONE CLICK WITH NO CONFIRMATION, because it is reversible through `?dismissed=1` — and
 * a confirm dialog on a reversible action teaches the user to dismiss dialogs unread (L-6). It is
 * also NOT OPTIMISTIC: the list is server-rendered, so a pair leaves it when a fresh render says so
 * and never because a client guessed. Hiding a pair whose write failed would be the worse of the two
 * failures, since the pair would silently return on the next navigation having never been dismissed
 * (L-8).
 *
 * NO AUTHORIZATION DECISION IS MADE HERE. `dismissPair` and `undismissPair` re-check the admin role
 * themselves and scope their UPDATE to the status they expect, so a stale button in a tab left open
 * for a day gets `PAIR_GONE` rather than rewriting a merged pair back into the queue (T-39-01).
 *
 * THE DISTINGUISHING VALUE IS RESOLVED ON THE SERVER, not here. `PairSideSummary` carries the whole
 * `customFields` blob for an organization, and shipping it to the browser to pick one identity value
 * out of it would send every custom field of both records to the client for every card on the page
 * (the D-44-02 payload precedent). `page.tsx` projects it to one string first.
 */

import { X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useTransition } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { DedupReason, DedupTier, MergeableEntityType } from "@/lib/dedup/types"

import { dismissPair, undismissPair } from "./actions"

/**
 * Every `DedupReason` mapped to its `dedup.reason.*` leaf.
 *
 * next-intl messages are untyped in this repo, so `tReason(reason)` would compile against any string
 * and a fifth reason would reach a user as a missing-key error. `Record<DedupReason, string>` makes a
 * new reason a COMPILE error here instead, and spelling all four leaves lets a comment-blind source
 * gate read the key set.
 *
 * Deliberately a local copy of the map `components/dedup/duplicate-warning.tsx` holds rather than a
 * shared export: the two surfaces have no other relationship, and coupling a review card to a create
 * dialog to save four lines is a dependency nobody would predict from either file's name.
 */
const REASON_MESSAGE_KEY: Readonly<Record<DedupReason, string>> = Object.freeze({
  email: "email",
  nameIdentity: "nameIdentity",
  similarName: "similarName",
  similarNamePhone: "similarNamePhone",
})

/** Where each entity type's detail page lives. `Record<…>` for the same exhaustiveness. */
const DETAIL_PATH: Readonly<Record<MergeableEntityType, string>> = Object.freeze({
  organization: "/organizations",
  person: "/people",
})

/** One side of a pair, already projected by the server render. */
export interface PairCardSide {
  id: string
  /**
   * `null` WHEN THE RECORD HAS BEEN DELETED SINCE THE SCAN — never when it has no name.
   *
   * `listPairs` keeps the visibility predicate in the join's ON clause precisely so this pair still
   * appears with one side null-extended, instead of vanishing from a list whose count came from a
   * query that did not join. The card says so, which is honest, and drops the merge affordance.
   */
  name: string | null
  /** The value the pair was matched on — an email, a phone, an identity field or the normalized name. */
  detail: string | null
}

export interface PairCardProps {
  pairId: string
  entityType: MergeableEntityType
  tier: DedupTier
  reason: DedupReason
  recordA: PairCardSide
  recordB: PairCardSide
  /** `true` under `?dismissed=1`: the same card, with `undismiss` in place of both actions (L-7). */
  dismissed: boolean
}

/**
 * One record block: its name as a link to itself, and beneath it the value that made it a candidate.
 *
 * NEITHER LINE IS TRUNCATED. The typography rule permits truncation on this surface, and this
 * component declines it: the two names on a card are near-identical by construction — that is why the
 * pair exists — so the characters a truncation would remove are exactly the ones that distinguish the
 * records. They wrap, at a cost of one line at 320px and nothing at 1280px.
 *
 * `text-primary hover:underline` is the sanctioned accent for a link from a listed row to the record
 * it names (§ Color item 6, the `audit-entry.tsx:357-361` precedent). It is the only accent on the
 * card.
 */
function PairRecord({
  href,
  name,
  detail,
}: {
  href: string
  name: string | null
  detail: string | null
}) {
  const t = useTranslations("dedup")

  if (name === null) {
    /*
      GONE SINCE THE SCAN. `dedup.merge.gone` is reused rather than duplicated into a review-list key:
      it says "One of these records is no longer available. It may already have been merged or
      deleted", which is exactly what is true here and is the same sentence the merge screen shows for
      the same cause. A link would be a broken one, and a name would be a name nobody can open.
    */
    return <p className="text-muted-foreground text-sm break-words">{t("merge.gone")}</p>
  }

  return (
    <div className="min-w-0">
      <Link href={href} className="text-primary text-sm break-words hover:underline">
        {name}
      </Link>
      {detail === null ? null : (
        <p className="text-muted-foreground text-xs break-words">{detail}</p>
      )}
    </div>
  )
}

export function PairCard({
  pairId,
  entityType,
  tier,
  reason,
  recordA,
  recordB,
  dismissed,
}: PairCardProps) {
  const t = useTranslations("dedup")
  const tReason = useTranslations("dedup.reason")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  /**
   * A pair with a missing side cannot be merged — `mergeRecords` needs both records to exist, and the
   * merge screen would open only to refuse. Dismissing it still works and is the useful action, since
   * it is what takes a pair nobody can act on out of the queue.
   */
  const mergeable = recordA.name !== null && recordB.name !== null

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissPair(pairId)

      if (!result.success) {
        if (result.code === "PAIR_GONE") {
          /*
            The pair is no longer `open` — someone else dismissed or merged it, or a rescan superseded
            it. `dedup.merge.gone` names that cause; `review.dismissFailed` would blame the user's
            connection for a write the server refused on purpose. The refresh is what removes a button
            that can no longer do anything.
          */
          toast.error(t("merge.gone"))
          router.refresh()
          return
        }

        // EVERYTHING ELSE LEAVES THE PAIR EXACTLY WHERE IT IS (L-8). No refresh either: the server's
        // answer is that nothing changed, so re-rendering the same list would only cost a round trip.
        toast.error(t("review.dismissFailed"))
        return
      }

      toast.success(t("review.dismissed"))
      router.refresh()
    })
  }

  function handleUndismiss() {
    startTransition(async () => {
      const result = await undismissPair(pairId)

      if (!result.success) {
        toast.error(result.code === "PAIR_GONE" ? t("merge.gone") : t("review.undismissFailed"))
        if (result.code === "PAIR_GONE") router.refresh()
        return
      }

      toast.success(t("review.undismissed"))
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-md border p-4">
      {/*
        THE TIER IS CARRIED BY WORDS FIRST (C-3). `default` for certain and `secondary` for likely are
        two greys apart in this theme, so the badge's TEXT is what tells them apart — never a bare
        colour-only dot, and never red/amber/green.
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant={tier === "certain" ? "default" : "secondary"}>
          {tier === "certain" ? t("review.confidenceCertain") : t("review.confidenceLikely")}
        </Badge>
        {/* A matched record is never shown without its reason — a name the user cannot audit is noise. */}
        <p className="text-muted-foreground min-w-0 text-xs">
          {tReason(REASON_MESSAGE_KEY[reason])}
        </p>
      </div>

      {/*
        STACKED, AT EVERY VIEWPORT (L-4, R-3). No two-column grid, no unwrapped flex row of two record
        blocks, no table: each of those puts the records side by side somewhere, and 320px is the
        viewport Phase 45 made an enforced e2e gate.
      */}
      <PairRecord
        href={`${DETAIL_PATH[entityType]}/${recordA.id}`}
        name={recordA.name}
        detail={recordA.detail}
      />
      <PairRecord
        href={`${DETAIL_PATH[entityType]}/${recordB.id}`}
        name={recordB.name}
        detail={recordB.detail}
      />

      {/*
        NEITHER ACTION IS PRIMARY-FILLED. Twenty-five cards on a page, each with a filled button, is
        not a 10% accent — this surface spends its one filled button on the scan CTA (§ Color).
      */}
      <div className="flex min-w-0 flex-wrap gap-2">
        {dismissed ? (
          <Button variant="outline" onClick={handleUndismiss} disabled={isPending}>
            {t("review.undismiss")}
          </Button>
        ) : (
          <>
            {mergeable ? (
              <Button asChild variant="outline">
                <Link href={`/duplicates/${pairId}`}>{t("review.merge")}</Link>
              </Button>
            ) : null}
            <Button variant="ghost" onClick={handleDismiss} disabled={isPending}>
              <X className="size-4" aria-hidden="true" />
              {t("review.dismiss")}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
