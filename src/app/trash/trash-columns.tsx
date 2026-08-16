"use client"

/**
 * The five columns of `/trash`, one builder for all four tabs.
 *
 * Everything a user needs in order to answer "is this the record I deleted by mistake?" — what it
 * was, one disambiguating identifier, when it went, who sent it there, and whether something it
 * hangs off is in trash too. That set is SC-1, and the whole reason the table is worth rendering.
 *
 * Three things this file deliberately does not have, each of which would be the obvious next
 * commit: a checkbox column (multi-select is Phase 38's, and shipping one here would force a
 * redesign), a sort control (the ordering is `deleted_at` DESC, always), and a search input (the
 * list is bounded by the retention window and sorted newest-first, which already puts the thing
 * the user just deleted at row 1).
 */

import type { ColumnDef } from "@tanstack/react-table"
import { Cog, Download, Key, Trash2, Workflow } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { RelativeTime } from "@/components/ui/relative-time"
import type { TrashTab } from "@/lib/trash/entity-types"
import type { DeletedByPresentation } from "@/lib/trash/present"
import type { TrashRow } from "@/lib/trash/queries"

/**
 * How the table hands its row actions to the actions column.
 *
 * The actions are the table's business — they own two transitions, a dialog and the admin
 * predicate — so the column asks for them through `table.options.meta` rather than taking a
 * dozen callbacks as arguments to this hook.
 */
export interface TrashTableMeta {
  renderActions: (row: TrashRow) => ReactNode
}

/**
 * FOUR SINGULAR NOUNS, not one "Record" header with a placeholder.
 *
 * es-ES and pt-BR inflect with the noun's gender, and these same four strings are reused in the
 * purge dialog's description where that inflection matters (37-UI-SPEC § New key inventory).
 */
const RECORD_HEADER_KEYS: Record<TrashTab, string> = {
  deals: "column.deal",
  people: "column.person",
  organizations: "column.organization",
  activities: "column.activity",
}

/** One entity-appropriate disambiguator per tab, per 37-CONTEXT and 37-UI-SPEC § Columns. */
const SECONDARY_HEADER_KEYS: Record<TrashTab, string> = {
  deals: "column.organization",
  people: "column.email",
  organizations: "column.website",
  activities: "column.dueDate",
}

/**
 * Phase 36's actor vocabulary, reused rather than duplicated under `trash.*`.
 *
 * The keys resolve in the `audit` namespace on purpose: the same delete rendered in a record's
 * timeline and in this table must read identically, and two copies of "Workflow" in two
 * catalogues is two things a translator can disagree with themselves about.
 */
const ACTOR_KIND_LABEL_KEYS = {
  workflowRun: "actorKind.workflowRun",
  apiKey: "actorKind.apiKey",
  import: "actorKind.import",
  system: "actorKind.system",
} as const

/** The Label role — the record name is this page's primary visual anchor (37-UI-SPEC § Color). */
const RECORD_NAME_CLASS = "text-sm leading-tight font-semibold"

/** The Body role, for every cell that is not the name and not a timestamp. */
const BODY_CLASS = "text-sm leading-normal"

/** Matches every other absolute timestamp in the product. */
const ABSOLUTE_TIME_OPTIONS = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
} as const

/** A due date is a day, not an instant — the same options the activity surfaces use. */
const DUE_DATE_OPTIONS = { year: "numeric", month: "short", day: "numeric" } as const

/**
 * The record name, and the linked-in-trash flag beneath it.
 *
 * NOT A LINK, and that is a decision rather than an omission. A trashed record's detail page
 * either 404s or renders a live view of a deleted record; both are wrong, and a dead link is
 * worse than an honest dead end (37-UI-SPEC § Columns).
 */
function RecordCell({ row }: { row: TrashRow }) {
  const t = useTranslations("trash")
  const format = useFormatter()

  return (
    <div>
      {/*
        `TableCell` is `whitespace-nowrap` by default, so the override is load-bearing: without
        it a 120-character deal title pushes the badge off the row instead of letting it sit
        underneath.
      */}
      <div className={`${RECORD_NAME_CLASS} whitespace-normal`}>{row.name}</div>

      {row.linkedParents.length > 0 ? (
        // A secondary badge, and no warning icon or warning colour anywhere near it. A trashed
        // parent is a FACT about the data, not an error state — the same posture Phase 36 took
        // toward a completed deletion. The parents are named in the `title` so the user can see
        // WHICH ones without the table growing a sixth column.
        <Badge
          variant="secondary"
          className="mt-1 gap-1 font-normal"
          title={t("linkedInTrashTitle", { names: format.list(row.linkedParents) })}
        >
          <Trash2 className="size-3" aria-hidden="true" />
          {t("linkedInTrash")}
        </Badge>
      ) : null}
    </div>
  )
}

/**
 * Who sent the record to trash — all seven presentations, exhaustively.
 *
 * The kind is ALWAYS carried by text. Every icon here is `aria-hidden`, because an actor a
 * screen-reader user cannot hear is half of SC-1 missing.
 */
function DeletedByCell({ presentation }: { presentation: DeletedByPresentation }) {
  const t = useTranslations("trash")
  const tAudit = useTranslations("audit")

  switch (presentation.kind) {
    case "user":
      // `email` is non-null whenever the presenter returns this kind, so the fallback is a type
      // accommodation rather than a rendering path anyone reaches.
      return <span className={BODY_CLASS}>{presentation.name ?? presentation.email}</span>

    case "unknownUser":
      // A user DID this, and the row naming them is gone. Distinct from `notRecorded` below,
      // and the distinction is the whole of T-37-REP2.
      return (
        <span className={`${BODY_CLASS} text-muted-foreground`}>{tAudit("unknownActor")}</span>
      )

    case "workflowRun": {
      // The link needs all three parts. A run whose workflow was deleted keeps the kind label
      // and loses the link — never a broken one (audit-entry.tsx:289-303).
      const linkable =
        presentation.workflowId !== null &&
        presentation.runId !== null &&
        presentation.workflowName !== null

      return (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 font-normal">
            <Workflow className="size-3" aria-hidden="true" />
            {tAudit(ACTOR_KIND_LABEL_KEYS.workflowRun)}
          </Badge>
          {linkable ? (
            <Link
              href={`/workflows/${presentation.workflowId}/runs/${presentation.runId}`}
              className={`text-primary hover:underline ${BODY_CLASS}`}
            >
              {presentation.workflowName}
            </Link>
          ) : null}
        </div>
      )
    }

    case "apiKey":
      // THE KIND LABEL ALONE. `audit_log` carries no reference to the key that acted — only the
      // key owner's user id, which the presenter refuses to resolve because doing so would pick
      // an arbitrary one of that user's keys and print it as fact (T-37-09). 37-UI-SPEC asks for
      // "the key name beside it when known"; this schema can never know it, and 37-02 recorded
      // that under-delivering it honestly beats a field that is always empty.
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Key className="size-3" aria-hidden="true" />
          {tAudit(ACTOR_KIND_LABEL_KEYS.apiKey)}
        </Badge>
      )

    case "import":
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Download className="size-3" aria-hidden="true" />
          {tAudit(ACTOR_KIND_LABEL_KEYS.import)}
        </Badge>
      )

    case "system":
      // `Cog`, not `Bot`: nothing here is an AI and the icon must not suggest one.
      return (
        <Badge variant="secondary" className="gap-1 font-normal">
          <Cog className="size-3" aria-hidden="true" />
          {tAudit(ACTOR_KIND_LABEL_KEYS.system)}
        </Badge>
      )

    case "notRecorded":
      // "Nobody wrote it down", which is NOT "Unknown user". This is 100% of the current live
      // dataset: every record in trash today was soft-deleted before change history existed.
      // The explanation is a native `title` because no tooltip primitive is vendored.
      return (
        <span
          className={`${BODY_CLASS} text-muted-foreground italic`}
          title={t("actor.notRecordedTitle")}
        >
          {t("actor.notRecorded")}
        </span>
      )

    default: {
      // An eighth presentation is a COMPILE error here, not a blank cell in production.
      const unhandled: never = presentation
      void unhandled
      return null
    }
  }
}

/**
 * The five column definitions for one tab.
 *
 * A hook rather than a constant because every header is translated, following the
 * `useColumns()` form in `src/app/organizations/columns.tsx:30-131`.
 */
export function useTrashColumns(tab: TrashTab): ColumnDef<TrashRow, unknown>[] {
  const t = useTranslations("trash")
  const tCommon = useTranslations("common")
  const format = useFormatter()

  return [
    {
      id: "record",
      header: t(RECORD_HEADER_KEYS[tab]),
      cell: ({ row }) => <RecordCell row={row.original} />,
    },
    {
      id: "secondary",
      header: t(SECONDARY_HEADER_KEYS[tab]),
      cell: ({ row }) => {
        const secondary = row.original.secondary

        if (secondary === null || secondary === "") {
          // The em-dash idiom the four existing tables use for an absent value.
          return <span className="text-muted-foreground">—</span>
        }

        // Activities carry an ISO-8601 instant here so `TrashRow` stays uniform and no `Date`
        // other than `deletedAt` crosses into a client component (queries.ts:43-48). The
        // formatting it deferred is this cell's job; rendering the raw instant would put
        // `2026-08-16T00:00:00.000Z` in front of a user.
        if (tab === "activities") {
          return (
            <span className={BODY_CLASS}>
              {format.dateTime(new Date(secondary), DUE_DATE_OPTIONS)}
            </span>
          )
        }

        return <span className={BODY_CLASS}>{secondary}</span>
      },
    },
    {
      id: "deletedAt",
      header: t("column.deletedAt"),
      cell: ({ row }) => {
        const deletedAt = new Date(row.original.deletedAt)
        const iso = deletedAt.toISOString()

        return (
          <time
            dateTime={iso}
            title={format.dateTime(deletedAt, ABSOLUTE_TIME_OPTIONS)}
            className="text-muted-foreground text-xs"
          >
            {/* Already handles the SSR/CSR hydration guard — do not reimplement it here. */}
            <RelativeTime date={deletedAt} />
          </time>
        )
      },
    },
    {
      id: "deletedBy",
      header: t("column.deletedBy"),
      cell: ({ row }) => <DeletedByCell presentation={row.original.deletedBy} />,
    },
    {
      id: "actions",
      // The four existing tables ship a literally empty `<th>`; this one does not copy that.
      // The visual result is identical and the header row stops being unlabelled.
      header: () => <span className="sr-only">{tCommon("actions")}</span>,
      cell: ({ row, table }) => {
        const meta = table.options.meta as TrashTableMeta | undefined

        return (
          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
            {meta?.renderActions(row.original)}
          </div>
        )
      },
    },
  ]
}
