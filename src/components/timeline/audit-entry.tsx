"use client"

/**
 * One audited change in the record timeline: who or what changed the record, which fields
 * moved, and what they moved from and to.
 *
 * SHARED SKELETON (36-UI-SPEC § Row skeleton)
 * The outer structure here is byte-for-byte the one in `note-entry.tsx`,
 * `activity-entry.tsx` and `stage-change-entry.tsx` — a `w-8 shrink-0` rail, a `gap-2`, and
 * a `min-w-0 flex-1` content column whose first line is `flex flex-wrap items-center gap-2`.
 * This is the FOURTH voice in a conversation Phase 35 started, and the merged feed only
 * reads as ONE list because all four kinds sit on the same grid. Changing the skeleton here
 * without changing it in the three siblings breaks SC-2.
 *
 * NO DIFF COLOURING (36-UI-SPEC § Color — the phase's single most important colour rule,
 * and it is a prohibition)
 * A field's `from` value must NOT be rendered in one hue and its `to` value in another. A
 * field changing is neither a loss nor a gain; borrowing version-control semantics would
 * turn every routine owner reassignment into something that reads like an error, and it
 * would add hues outside the token set. The before/after signal is muted-foreground versus
 * foreground, plus an explicit arrow, which carries the direction without carrying a
 * judgement. This file is grep-gated: no hardcoded colour literal of any kind appears in it.
 *
 * THE ACTOR KIND IS CARRIED IN TEXT (SC-3, 36-UI-SPEC § Accessibility Contract)
 * Every rail glyph is `aria-hidden`, so a non-`user` entry ALSO renders a text badge naming
 * the kind. An icon is never the only carrier of the actor kind, and the arrow is never the
 * only carrier of the before/after relationship — an `sr-only` "changed to" sits between the
 * two values. Do not delete either on the grounds that the picture already says it.
 *
 * THE NAME FALLBACK IS THE KIND LABEL, NEVER A GUESS (T-36-29)
 * This mirrors the backend rule that an unknown actor records `system` and never falls back
 * to the event's userId. A confidently wrong name in an audit log is worse than an honest
 * "unknown", and the UI must not re-introduce the guess the data layer refused to make. A
 * workflow-run actor whose workflow is gone renders the plain kind label — never a link that
 * leads nowhere.
 *
 * FIELD LABELS AND STORED VALUES (T-36-21)
 * Custom field labels and former values are arbitrary user-authored text, rendered as React
 * TEXT children, which React escapes. Raw-HTML injection props must never appear in this
 * file — it is grep-gated to zero occurrences — because there is no sanitizer in this repo.
 * `break-words` on the value cell stops a 200-character unbroken URL blowing out the card
 * (T-36-27), and `collapseAndTruncate` caps what is drawn at all.
 *
 * NO ROW ACTIONS
 * An audit entry is a fact about the past — the same argument `stage-change-entry.tsx` makes
 * for itself. Nothing about it is editable or deletable from the timeline, so this component
 * takes `entry` and nothing else. Restoring a deleted record is Phase 37's problem and this
 * row promises nothing about it.
 *
 * DELIBERATELY NOT COPIED from `stage-change-entry.tsx`: its NUL-sentinel slot machinery.
 * That exists because a translated SENTENCE had to host React badges. The field list here is
 * label/value with no interpolated elements, so importing it would be cargo cult.
 */

import { ArrowRight, ChevronDown, ChevronUp, Cog, Download, Key, Workflow } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import Link from "next/link"
import { type ComponentType, type ReactNode, useState } from "react"

import { getInitials } from "@/components/timeline/note-entry"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RelativeTime } from "@/components/ui/relative-time"
import { collapseAndTruncate } from "@/lib/audit/present"
import type {
  AuditActorKind,
  AuditFieldChange,
  AuditTimelineEntry,
  AuditValue,
} from "@/lib/timeline/types"
import { cn } from "@/lib/utils"

type NonUserActorKind = Exclude<AuditActorKind, "user">

/**
 * The rail for every actor that is not a person; `user` gets an Avatar with initials, so a
 * human change looks like a human change. Each icon already means this thing elsewhere in
 * the product — `Workflow` is the workflows nav icon, `Key` already means API key in the
 * user menu and the admin sidebar — so zero new symbols enter the vocabulary.
 *
 * `system` is `Cog`, NOT `Bot`: nothing here is an AI and the icon must not suggest one.
 */
const ACTOR_KIND_ICONS: Record<NonUserActorKind, ComponentType<{ className?: string }>> = {
  workflow_run: Workflow,
  api_key: Key,
  import: Download,
  system: Cog,
}

const ACTOR_KIND_LABEL_KEYS: Record<NonUserActorKind, string> = {
  workflow_run: "actorKind.workflowRun",
  api_key: "actorKind.apiKey",
  import: "actorKind.import",
  system: "actorKind.system",
}

/**
 * `AuditFieldChange.label` holds two kinds of string, told apart STRUCTURALLY rather than by
 * guessing at content (`present.ts` § AUDIT_FIELD_LABELS): a mapped native column carries a
 * MESSAGE KEY, while a custom field carries the user-authored name VERBATIM. The `custom:`
 * test comes first, so a custom field a user happened to name after a message key is still
 * rendered as the name they typed. An unmapped native column carries an already-humanised
 * string — a path that should be unreachable — and falls through to verbatim too.
 */
const CUSTOM_CHANGE_PREFIX = "custom:"
const MESSAGE_NAMESPACE_PREFIX = "audit."
const FIELD_LABEL_KEY_PREFIX = "audit.field."

/**
 * The soft-delete column, and WHY its decision lives here rather than in `AUDIT_FIELD_LABELS`.
 *
 * That map holds ONE message key per column and `describeField` emits a single `label` with no
 * access to the from/to pair — but a `deleted_at` transition has two directions, and which one
 * it went is the whole content of the sentence. Two keys for one column do not fit a
 * one-to-one map. The map's INSERTION ORDER is separately load-bearing: `NATIVE_ORDER` is
 * derived from it and is the display order of native fields in every record timeline, so an
 * entry there is never a local edit. `AuditFieldRow` is the one place the pair is in hand.
 *
 * Before this branch existed the column fell through to `humaniseColumn` and this row printed
 * the database identifier beside an unformatted ISO instant — in English, to every reader.
 */
const DELETED_AT_COLUMN = "deletedAt"

/**
 * Which sentence a `deleted_at` pair asks for, as a full message key — or `null` when the pair
 * states no direction and the row must not render at all.
 *
 * The null case is not defensive padding. A create diffs the new row against nothing, so a
 * server-action create records `deletedAt: null` as a change with BOTH sides empty; the row
 * used to draw the column name beside a blank on every record ever created. Neither sentence is
 * true of it, so it is dropped — here and, so the disclosure count stays honest, in `AuditEntry`.
 *
 * A soft delete recorded as `deleted` never reaches this function: `buildAuditFieldChanges`
 * returns `[]` for that action and `AuditEntry` draws no field list, so the row is already
 * suppressed where it would be pure redundancy beside "deleted this deal". What survives is a
 * soft delete recorded as an UPDATE, which is the only case needing the first key.
 *
 * `change.to` is never null — only `change.from` is, and only on a create — so both directions
 * are read off `type !== "empty"` rather than off a null test that would never fire.
 */
function deletedAtDirectionKey(change: AuditFieldChange): string | null {
  const wasInTrash = change.from !== null && change.from.type !== "empty"
  const isInTrash = change.to.type !== "empty"

  if (isInTrash && !wasInTrash) return "audit.field.movedToTrash"
  if (wasInTrash && !isInTrash) return "audit.field.restoredFromTrash"
  return null
}

/** A diff needs the value that was STORED, not how long ago it was — so never RelativeTime. */
const DATE_OPTIONS = { year: "numeric", month: "short", day: "numeric" } as const
const DATE_TIME_OPTIONS = { ...DATE_OPTIONS, hour: "numeric", minute: "2-digit" } as const

/**
 * Three is the number at which an audit entry occupies the same vertical space as a typical
 * note. That is the whole point: this is a fourth voice in an existing conversation and it
 * must not shout.
 */
const VISIBLE_FIELD_COUNT = 3

/** The Label typography role, matching notes, activities and stage changes. */
const ACTOR_NAME_CLASS = "text-sm leading-tight font-semibold"

interface AuditValueTextProps {
  value: AuditValue
  /** The `from` side renders muted. That contrast IS the before/after signal. */
  muted: boolean
}

/**
 * One stored value, in the viewer's locale.
 *
 * Locale formatting lives HERE rather than in `present.ts` because only the client knows the
 * locale; `present.ts` decides which of the nine shapes a value is, and this decides how that
 * shape reads in Portuguese. Every branch ends in a string that goes through
 * `collapseAndTruncate`, including the ones that look bounded: a `numeric` column can hold a
 * 300-digit number, and one uncollapsed pasted paragraph would contribute forty blank-ish
 * lines to a history row.
 */
function AuditValueText({ value, muted }: AuditValueTextProps) {
  const t = useTranslations("audit")
  const format = useFormatter()

  let text: string
  /** An absence, not a value — so it reads as prose rather than as something a user typed. */
  let absent = false

  switch (value.type) {
    case "empty":
      // The WORD "empty". Never `null`, which is not a word, and never an em-dash, which is
      // indistinguishable from one a user actually typed into the field.
      text = t("value.empty")
      absent = true
      break
    case "text":
      text = value.value
      break
    case "number":
      // No currency symbol: the field label supplies the meaning, a deal's currency lives on
      // its organization, and inventing one here would be a guess.
      text = format.number(value.value)
      break
    case "boolean":
      text = value.value ? t("value.yes") : t("value.no")
      break
    case "date":
      text = format.dateTime(
        new Date(value.iso),
        value.withTime ? DATE_TIME_OPTIONS : DATE_OPTIONS
      )
      break
    case "list":
      // Joined under the viewer's locale FIRST, then measured — which is why the truncation
      // point lives in the renderer and not in `present.ts`.
      text = format.list(value.items)
      break
    case "reference":
      if (value.label === null) {
        // A row that is gone. An id is never shown to a user (T-36-28).
        text = t("value.unavailable")
        absent = true
      } else {
        text = value.label
      }
      break
    case "files":
      text = t("value.files", { count: value.count })
      break
    case "json":
      // The compacted string, and nothing more. A collapsible code block inside a timeline
      // row would wreck the shared skeleton; `json-viewer.tsx` belongs on the run page.
      text = value.value
      break
    default: {
      const unhandled: never = value
      void unhandled
      text = ""
    }
  }

  const { display, title } = collapseAndTruncate(text)

  return (
    <span
      // A native `title`, not a floating overlay primitive: that primitive is not vendored
      // and `components.json` declares an empty registries object, so pulling one would
      // contradict § Registry Safety. `title` is keyboard- and screen-reader-reachable, and
      // it is `null` when nothing was cut so the attribute is omitted rather than echoing
      // the visible text.
      title={title ?? undefined}
      className={cn(absent ? "text-muted-foreground italic" : muted && "text-muted-foreground")}
    >
      {display}
    </span>
  )
}

/**
 * One field's before and after, as a `<dt>`/`<dd>` pair so assistive technology reads
 * "Owner, Ana Lima changed to Bruno Sá" rather than four unlabelled fragments.
 */
function AuditFieldRow({ change }: { change: AuditFieldChange }) {
  const t = useTranslations("audit")

  if (change.field === DELETED_AT_COLUMN) {
    const directionKey = deletedAtDirectionKey(change)
    if (directionKey === null) return null

    // ONE line, at the Label typography role, and nothing else: no arrow, no before/after pair,
    // no timestamp. The sentence already carries the direction in words, and the entry header
    // above already carries who and when — the stored value IS that same instant, so a second
    // copy of it would add precision without adding a fact. The key is resolved by this file's
    // usual convention, slicing the namespace off a stored `audit.` key, because `t` is scoped
    // to the `audit` namespace and the full path would resolve to `audit.audit.field.…`.
    return (
      <div className="flex flex-wrap items-baseline gap-2">
        <dt className="text-muted-foreground text-xs">
          {t(directionKey.slice(MESSAGE_NAMESPACE_PREFIX.length))}
        </dt>
      </div>
    )
  }

  const isCustomField = change.field.startsWith(CUSTOM_CHANGE_PREFIX)
  const label =
    !isCustomField && change.label.startsWith(FIELD_LABEL_KEY_PREFIX)
      ? t(change.label.slice(MESSAGE_NAMESPACE_PREFIX.length))
      : change.label

  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="min-w-0 text-sm leading-normal break-words">
        {change.from === null ? null : (
          <>
            <AuditValueText value={change.from} muted />
            <span className="sr-only">{t("value.changedTo")}</span>
            <ArrowRight
              className="text-muted-foreground mx-1 inline h-3 w-3 align-middle"
              aria-hidden="true"
            />
          </>
        )}
        <AuditValueText value={change.to} muted={false} />
      </dd>
    </div>
  )
}

interface AuditEntryProps {
  entry: AuditTimelineEntry
}

export function AuditEntry({ entry }: AuditEntryProps) {
  const t = useTranslations("audit")
  const format = useFormatter()

  /**
   * Per entry, resets on unmount, persisted nowhere. Plain state and a conditional render
   * rather than the vendored disclosure primitive, for exactly two reasons: there is no
   * animation requirement, and a conditional render is one line. The RSC boundary gate
   * (CFUI-01) is NOT a third reason and must not be cited as one — it governs a SERVER
   * component handing an element into a client slot, and this file is a client module
   * reached through Phase 35's client subtree, so it would not engage either way. A wrong
   * reason quoted as precedent by a later phase is worse than no reason.
   */
  const [expanded, setExpanded] = useState(false)

  const nonUserKind: NonUserActorKind | null =
    entry.actorKind === "user" ? null : entry.actorKind
  const KindIcon = nonUserKind === null ? null : ACTOR_KIND_ICONS[nonUserKind]
  const kindLabel = nonUserKind === null ? null : t(ACTOR_KIND_LABEL_KEYS[nonUserKind])

  const initials =
    entry.actorKind === "user" && entry.actor
      ? getInitials(entry.actor.name, entry.actor.email)
      : null

  let actorNode: ReactNode
  switch (entry.actorKind) {
    case "user":
      actorNode = (
        <span className={ACTOR_NAME_CLASS}>
          {entry.actor?.name ?? entry.actor?.email ?? t("unknownActor")}
        </span>
      )
      break
    case "workflow_run":
      actorNode =
        entry.workflowRun === null ? (
          // The workflow is gone. The kind label, with no link — never a broken one.
          <span className={ACTOR_NAME_CLASS}>{kindLabel}</span>
        ) : (
          // A sanctioned use of the accent inside this card: a link from an entry to the
          // record it describes.
          <Link
            href={`/workflows/${entry.workflowRun.workflowId}/runs/${entry.workflowRun.runId}`}
            className={cn("text-primary hover:underline", ACTOR_NAME_CLASS)}
          >
            {entry.workflowRun.workflowName}
          </Link>
        )
      break
    case "api_key":
      actorNode = <span className={ACTOR_NAME_CLASS}>{entry.apiKeyName ?? kindLabel}</span>
      break
    case "import":
    case "system":
      actorNode = <span className={ACTOR_NAME_CLASS}>{kindLabel}</span>
      break
    default: {
      const unhandled: never = entry.actorKind
      void unhandled
      actorNode = null
    }
  }

  const absoluteTimestamp = format.dateTime(entry.occurredAt, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  })

  /**
   * A `deleted_at` pair stating no direction renders nothing (see `deletedAtDirectionKey`), so
   * it is dropped from the LIST as well as from the row. The row returning null is not enough:
   * `hiddenFieldCount` is derived from this array's length, so an invisible member would promise
   * "show 1 more" and then produce nothing, and the defensive empty-list branch below would
   * never fire for an entry whose only recorded change is one of these.
   *
   * Scoped to that one column by design — no other field is filtered out of the history here.
   */
  const changes = entry.changes.filter(
    (change) => change.field !== DELETED_AT_COLUMN || deletedAtDirectionKey(change) !== null
  )
  const hiddenFieldCount = changes.length - VISIBLE_FIELD_COUNT
  const visibleChanges = expanded ? changes : changes.slice(0, VISIBLE_FIELD_COUNT)
  const fieldListId = `audit-fields-${entry.id}`

  /**
   * Twelve separate predicate keys rather than one sentence with an `{entity}` placeholder:
   * Spanish and Portuguese inflect the demonstrative with the noun's gender ("este trato" vs
   * "esta actividad"), so a placeholder would produce broken grammar in two of the three
   * shipped locales.
   *
   * FOURTEEN AS OF PHASE 39. `merged` adds two — organization and person only, because a deal
   * and an activity cannot be merged — and it is the ONLY action whose sentence carries a
   * placeholder: "merged {name} into this organization". The values object is therefore passed
   * UNCONDITIONALLY rather than behind a ternary. next-intl tolerates values a message does not
   * use, so the twelve existing predicates are unaffected, and this stays ONE call site — which
   * is the whole of what 39-UI-SPEC A-2 protects. A conditional would create the second
   * predicate-building path A-2 forbids, for no gain.
   *
   * THE LOSER'S NAME IS PLAIN TEXT AND MUST STAY THAT WAY (A-3). It arrives as an interpolated
   * ICU value, so it is a React text child, which React escapes — the same posture the field
   * list takes toward user-authored values (T-36-21). It is deliberately NOT wrapped in a
   * `Link`: the losing record is soft-deleted, its detail route answers 404 while it is in
   * Trash, and `/trash` already owns the affordance for finding it. A dead link out of an audit
   * entry is worse than a name.
   *
   * `?? ""` rather than a guard: a `merged` row whose `__mergedFromName` marker is missing or
   * malformed hydrates `null` (see `AuditTimelineEntry.mergedLoserName`), and HTML collapses the
   * resulting double space, so the sentence degrades to "merged into this organization" — less
   * specific, still grammatical, and never a rendering failure.
   */
  const predicate = t(`entry.${entry.action}.${entry.entityType}`, {
    name: entry.mergedLoserName ?? "",
  })

  return (
    <div className="flex gap-2">
      <div className="w-8 shrink-0">
        {KindIcon === null ? (
          <Avatar className="size-8">
            {/* Null initials when the user row is gone — an initial-less avatar, the same
                shape `note-entry.tsx` draws for an unknown author. */}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="bg-muted flex size-8 items-center justify-center rounded-full">
            <KindIcon className="text-muted-foreground h-4 w-4" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {actorNode}
          <span className="text-sm leading-normal">{predicate}</span>
          <time
            dateTime={entry.occurredAt.toISOString()}
            title={absoluteTimestamp}
            className="text-muted-foreground text-xs"
          >
            <RelativeTime date={entry.occurredAt} />
          </time>
          {KindIcon === null ? null : (
            // Not decoration. The rail glyph is aria-hidden, so this badge is the only text
            // carrier of the actor kind and it is how SC-3 is met in words, not in pixels.
            <Badge variant="secondary" className="gap-1 font-normal">
              <KindIcon className="h-3 w-3" aria-hidden="true" />
              {kindLabel}
            </Badge>
          )}
        </div>

        {/* A-7. The timeline's answer to "was anything orphaned?", and it belongs BEFORE the
            field list rather than inside it: the count is a fact about the merge, not a field
            whose value changed, so it must not take a row in the <dl> and must not be counted by
            `hiddenFieldCount`. Label typography and muted, so it reads as a statement about the
            record rather than as data. `mergedChildCount` is 0 on every other action, but the
            line is still gated on the action — "0 linked records moved to this one" beside an
            ordinary edit would be a sentence about nothing. */}
        {entry.action === "merged" ? (
          <p className="text-muted-foreground mt-1 text-xs">
            {t("entry.mergedChildren", { count: entry.mergedChildCount })}
          </p>
        ) : null}

        {entry.action === "deleted" ? null : changes.length === 0 ? (
          /*
            Defensive. The capture subscriber returns early on an empty diff, so this row
            should not exist — but a renderer that silently drew an empty field list would
            make that bug invisible, and an audit surface that quietly omits history is the
            worst failure available here. Applied to `created` as well as `updated`: a
            create with nothing recorded is the same defect wearing a different action.

            NOT APPLIED TO `merged`, AND THE KEY BRANCHES ON THE ACTION FOR THAT REASON (A-6).
            For a merge an empty diff is a CORRECT, expected outcome — the survivor won every
            field, so no value changed — and `noVisibleChanges` reads as a bug report in prose
            ("No field-level detail was recorded."), which would tell the reader a successful
            merge had gone wrong. `mergedNoFieldChanges` states the same emptiness as the fact it
            is. The `created`/`updated` wording is untouched; only `merged` gets the other key.
          */
          <p className="text-muted-foreground mt-1 text-sm leading-normal">
            {entry.action === "merged"
              ? t("entry.mergedNoFieldChanges")
              : t("entry.noVisibleChanges")}
          </p>
        ) : (
          <>
            <dl id={fieldListId} className="mt-1 space-y-1">
              {visibleChanges.map((change) => (
                <AuditFieldRow key={change.field} change={change} />
              ))}
            </dl>

            {hiddenFieldCount > 0 ? (
              // Ghost and muted, deliberately not accent: this is a disclosure affordance,
              // not a link, and it must not read as one. Its accessible name states the
              // count — never a bare "Show more".
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground mt-1"
                aria-expanded={expanded}
                aria-controls={fieldListId}
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? (
                  <ChevronUp className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                )}
                {expanded
                  ? t("showFewerFields")
                  : t("showMoreFields", { count: hiddenFieldCount })}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
