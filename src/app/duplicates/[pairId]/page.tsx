/**
 * `/duplicates/[pairId]` — the merge screen's server render (DEDUP-02, DEDUP-03).
 *
 * NO AUTHORIZATION CHECK LIVES IN THIS FILE, AND THAT IS DELIBERATE RATHER THAN MISSING:
 * `src/app/duplicates/layout.tsx` is the authority for the whole subtree and renders for every
 * nested route, this one included, so it already refuses a non-admin here — including on a direct
 * URL navigation, since its redirect happens server-side before any markup exists. A second copy
 * of the same redirect would be a second place to get it wrong. The one control this route DOES add
 * for itself is in `./actions.ts`, because a server action is a POST endpoint no layout can protect.
 *
 * A FULL PAGE, NOT A DIALOG AND NOT A SHEET (M-10). This is a form with ten or more decision
 * points; a modal at 320px would put it inside a scroll container inside the page's own scroll
 * container. A route also gives the user a URL to come back to when a merge fails, and a back
 * button that works.
 *
 * THE SERVER IS THE AUTHORITY ON WHAT MAY BE CHOSEN. The comparable field set, the three-way
 * partition, the pre-selection and the display form of every stored value are all computed here and
 * passed down; `merge-form.tsx` only picks among them. That is what makes plan 39-02's rule
 * enforceable — a choice key the server did not compute writes nothing — and it is the same
 * property `applyMergeChoices` relies on inside the mutation (T-39-04).
 *
 * BOTH ORIENTATIONS ARE COMPUTED, because which section a field belongs to depends on which record
 * survives: a field only the loser fills is a question, and the moment the survivor flips it stops
 * being one. Computing both here is what lets the survivor selector be instant AND keeps the
 * partition on the server. The two calls below are one call site invoked twice, deliberately, so
 * there is exactly one place that decides how an orientation is built.
 *
 * `getPairDetail` RETURNING `null` IS A NORMAL STATE, NOT AN ERROR. It answers `null` for a missing
 * pair, for a pair either of whose records has been soft-deleted since the scan, and for a failed
 * query alike — from this page's position those are one fact, that there is no merge to offer, and
 * M-8 renders it as a refusal with no form at all. It is reachable in ordinary use: the review list
 * is a queue several admins work from, and another one of them can merge or delete either record
 * while this screen sits open.
 */

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { inArray } from "drizzle-orm"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { db } from "@/db"
import { organizations } from "@/db/schema"
import type { CustomFieldDefinition } from "@/db/schema"
/*
 * `describeField` is NOT imported here, and its absence is the point of M-4 rather than a gap in
 * it: `buildMergeFieldGroups` (plan 39-02) already runs every compared key through it, so the
 * `label` on each `MergeField` below IS its output. Calling it a second time here would be a
 * second resolver for a field's name — the exact drift M-4 exists to prevent, where a user is
 * asked about "Site" and then told about "Website". What this file does with that output is
 * resolve it into the viewer's language, which is a formatting step and not a naming decision.
 */
import { CUSTOM_FIELD_PREFIX, toAuditValue, type AuditResolution } from "@/lib/audit/present"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { buildMergeFieldGroups, type MergeField } from "@/lib/dedup/field-groups"
import { resolveMergeDefaults } from "@/lib/dedup/merge-defaults"
import { getPairDetail, type PairChildCounts, type PairRecordDetail } from "@/lib/dedup/queries"
import type { MergeableEntityType } from "@/lib/dedup/types"

import {
  MergeForm,
  type MergeFieldView,
  type MergeOrientation,
  type MergeRecordView,
} from "./merge-form"

const LOG_PREFIX = "[merge-page]"

const REVIEW_LIST_HREF = "/duplicates"

/**
 * The same bare shape test `./actions.ts` and `src/app/duplicates/actions.ts` apply, for the same
 * reason: a route parameter is a string from a URL bar, its only job here is to be a bindable
 * query parameter, and the ceiling stops a megabyte of path being carried into a query and a log.
 */
const MAX_RECORD_ID_LENGTH = 64

function parseRecordId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 && raw.length <= MAX_RECORD_ID_LENGTH
    ? raw
    : null
}

/**
 * A record's display name, mirroring `fetch-entities.ts:48-52` — the spelling the rest of the
 * product uses for a person, so this screen does not invent a second one.
 */
function displayName(entityType: MergeableEntityType, row: Record<string, unknown>): string {
  if (entityType === "organization") return String(row.name ?? "")
  return `${String(row.firstName ?? "")} ${String(row.lastName ?? "")}`.trim()
}

/** A stored instant as an ISO string, whichever shape the driver handed back. */
function isoInstant(raw: unknown): string {
  if (raw instanceof Date) return raw.toISOString()
  if (typeof raw === "string") return raw
  return new Date(0).toISOString()
}

/**
 * WHITESPACE COLLAPSED, NOTHING CUT. The audit timeline runs its values through
 * `collapseAndTruncate`, which also caps them at 120 characters; that cap is right for a history
 * row and wrong here. A value the user is choosing BETWEEN must be readable whole — a truncated
 * website makes the choice unmakeable, which is the same rule that forbids a CSS clamp on these
 * cards (M-5). Collapsing is kept, because one pasted paragraph would otherwise contribute forty
 * blank-ish lines to an option card.
 */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * One stored value as the option card shows it, or `null` for a side that holds nothing.
 *
 * TYPED THROUGH THE AUDIT LAYER (`toAuditValue`), not stringified. Two of the nine shapes make this
 * load-bearing rather than tidy: a person's `organizationId` is a foreign key, and an id must never
 * reach a user (T-36-22), so it resolves to the organization's NAME through the resolution below;
 * and a file or multi-select custom field holds an array, which template-stringifies to something
 * no user can act on. `null` is returned for an empty side rather than a word, so the form decides
 * how emptiness LOOKS while this decides what emptiness IS.
 */
function formatMergeValue(
  key: string,
  raw: unknown,
  resolution: AuditResolution,
  format: Awaited<ReturnType<typeof getFormatter>>,
  tAudit: Awaited<ReturnType<typeof getTranslations>>
): string | null {
  const value = toAuditValue(key, raw, resolution)

  switch (value.type) {
    case "empty":
      return null
    case "text":
      return collapse(value.value)
    case "number":
      // No currency symbol: the field label supplies the meaning, and inventing one would be a
      // guess — the same reasoning `AuditValueText` records.
      return format.number(value.value)
    case "boolean":
      return value.value ? tAudit("value.yes") : tAudit("value.no")
    case "date":
      return format.dateTime(
        new Date(value.iso),
        value.withTime
          ? { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
          : { year: "numeric", month: "short", day: "numeric" }
      )
    case "list":
      return collapse(format.list(value.items))
    case "reference":
      // A row that is gone, or one this render could not resolve. Both read the same way on
      // purpose: `present.ts` records that a caller which could not resolve a row and a caller
      // which did not try must not produce different screens.
      return value.label === null ? tAudit("value.unavailable") : collapse(value.label)
    case "files":
      return tAudit("value.files", { count: value.count })
    case "json":
      return collapse(value.value)
    default: {
      const unhandled: never = value
      void unhandled
      return null
    }
  }
}

/**
 * The label a user reads for a compared field.
 *
 * `describeField` (via `buildMergeFieldGroups`) emits TWO kinds of string, told apart structurally
 * rather than by guessing at content: a mapped native column carries a message key, and a custom
 * field carries the user-authored name verbatim. The custom test comes first, so a field somebody
 * happened to name after a message key still renders as the name they typed.
 *
 * An unmapped native column carries an already-humanised string, which no catalog holds — hence
 * `has` rather than a prefix test. This is also why the label is resolved HERE and not in the
 * client component: doing it there would mean spelling the native label-key prefix in the browser
 * bundle, and there is exactly one resolver for a field's name in this product (M-4).
 */
function resolveLabel(
  field: MergeField,
  tRoot: Awaited<ReturnType<typeof getTranslations>>
): string {
  if (field.key.startsWith(CUSTOM_FIELD_PREFIX)) return field.label
  return tRoot.has(field.label) ? tRoot(field.label) : field.label
}

/**
 * How many files a record's file-type custom fields hold.
 *
 * DERIVED FROM THE DEFINITIONS, because a `customFields` blob carries no type information — an
 * array under a key could be a multi-select just as easily. Counted for the what-moves list only
 * (M-6), where `dedup.merge.filesStayInPlace` is the sentence that qualifies it: the blob entries
 * follow whichever record's value the user keeps, while the uploaded bytes stay at the path they
 * were written to. This is the one number in that list with no reparenting statement behind it, and
 * that is precisely why the list carries that sentence.
 */
function countFiles(row: Record<string, unknown>, definitions: CustomFieldDefinition[]): number {
  const blob = row.customFields
  if (typeof blob !== "object" || blob === null || Array.isArray(blob)) return 0

  const values = blob as Record<string, unknown>
  let total = 0

  for (const definition of definitions) {
    if (definition.type !== "file") continue
    const value = values[definition.name]
    if (Array.isArray(value)) total += value.length
  }

  return total
}

/**
 * The definitions this entity type's custom fields are described by, or `[]`.
 *
 * WRAPPED BECAUSE `getActiveFieldDefinitions` IS A BARE `db.select()` WITH NO GUARD OF ITS OWN,
 * unlike `getPairDetail`, which fails closed inside its module. `/duplicates` has no `error.tsx`
 * above it, so an unguarded rejection here would take the merge screen down over field LABELS —
 * and the merge would still be perfectly performable with the stored key as its own name, which is
 * what `describeField` falls back to. Same posture, and the same reason, as `page.tsx` one
 * directory up.
 */
async function readDefinitions(
  entityType: MergeableEntityType
): Promise<CustomFieldDefinition[]> {
  try {
    return await getActiveFieldDefinitions(entityType)
  } catch (error) {
    console.error(`${LOG_PREFIX} could not read the ${entityType} field definitions:`, error)
    return []
  }
}

/**
 * Organization names for the ids a person pair might disagree about, keyed as
 * `resolution.references` keys them.
 *
 * ONLY `people.organizationId` NEEDS THIS. It is the single reference column in the compared set:
 * `ownerId` is excluded from the merge outright (Phase 38 owns owner writes, T-39-13) and every
 * other compared native column on both tables is plain text.
 *
 * NO `deletedAt` PREDICATE, deliberately. A person can point at an organization that is in Trash;
 * the row is still there and its name is still the honest answer. Filtering it out would render
 * "no longer available" on BOTH sides of a conflict, which would make the choice unmakeable.
 */
async function readReferences(
  entityType: MergeableEntityType,
  rows: Record<string, unknown>[]
): Promise<Map<string, string | null>> {
  const references = new Map<string, string | null>()

  if (entityType !== "person") return references

  const ids = [
    ...new Set(
      rows
        .map((row) => row.organizationId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ]

  if (ids.length === 0) return references

  try {
    const found = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(inArray(organizations.id, ids))

    for (const organization of found) {
      references.set(`organizationId:${organization.id}`, organization.name)
    }
  } catch (error) {
    // Fails closed to an empty map: the two option cards then read "no longer available" instead
    // of taking the page down. Logged with identifiers only (T-37-09).
    console.error(`${LOG_PREFIX} could not resolve ${ids.length} organization reference(s):`, error)
  }

  return references
}

export default async function MergePairPage({
  params,
}: {
  params: Promise<{ pairId: string }>
}) {
  const { pairId: rawPairId } = await params
  const pairId = parseRecordId(rawPairId)

  const t = await getTranslations("dedup")
  const tAudit = await getTranslations("audit")
  const tRoot = await getTranslations()
  const format = await getFormatter()

  /**
   * The refusal, shared by "that is not an id" and "there is no merge to offer here" (M-8).
   *
   * ONE RENDERING FOR BOTH, and no form in it. A malformed id and a pair whose record has gone are
   * the same fact from the user's position, and telling them apart would say more about the
   * database than the screen has any reason to. A malformed id is answered without touching the
   * database at all.
   */
  const goneState = (
    <div className="container py-8">
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>{t("merge.gone")}</AlertDescription>
        </Alert>
        <Button asChild variant="ghost" size="sm">
          <Link href={REVIEW_LIST_HREF}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("merge.backToList")}
          </Link>
        </Button>
      </div>
    </div>
  )

  if (pairId === null) return goneState

  const detail = await getPairDetail(pairId)

  if (detail === null) return goneState

  const entityType = detail.pair.entityType
  const rows = [detail.recordA.row, detail.recordB.row]

  const [definitions, references] = await Promise.all([
    readDefinitions(entityType),
    readReferences(entityType, rows),
  ])

  /**
   * Everything `describeField` would otherwise need a query for, assembled exactly as
   * `buildAuditResolution` in `src/lib/timeline/sources.ts` assembles it — same three maps, keyed
   * by definition id, `position` parsed out of the `numeric` string the driver returns.
   *
   * This is the resolution the merge SCREEN builds and the mutation deliberately does not: the
   * mutation needs the key set and the partition, both of which are resolution-independent, and
   * building one there would be a definition read whose result is discarded.
   */
  const resolution: AuditResolution = {
    references,
    customFieldNames: new Map(definitions.map((d) => [d.id, d.name])),
    customFieldTypes: new Map(definitions.map((d) => [d.id, d.type])),
    customFieldPositions: new Map(definitions.map((d) => [d.id, Number.parseFloat(d.position)])),
  }

  /** One compared field, as the picker asks about it: a resolved label and two display strings. */
  const toView = (field: MergeField): MergeFieldView => ({
    key: field.key,
    label: resolveLabel(field, tRoot),
    survivor: formatMergeValue(field.key, field.survivorValue, resolution, format, tAudit),
    loser: formatMergeValue(field.key, field.loserValue, resolution, format, tAudit),
  })

  /**
   * The partition and the pre-selection for ONE choice of survivor.
   *
   * The single call site for both pure functions, invoked once per possible survivor. Writing the
   * two calls out twice would be two places for the two orientations to stop agreeing about how an
   * orientation is built.
   */
  const buildOrientation = (
    survivorRecord: PairRecordDetail,
    loserRecord: PairRecordDetail
  ): MergeOrientation => {
    const groups = buildMergeFieldGroups({
      entityType,
      survivor: survivorRecord.row,
      loser: loserRecord.row,
      resolution,
    })

    return {
      survivorId: survivorRecord.id,
      loserId: loserRecord.id,
      conflicts: groups.conflicts.map(toView),
      filledOnly: groups.filledOnly.map(toView),
      identical: groups.identical.map(toView),
      defaults: resolveMergeDefaults(groups),
    }
  }

  const toRecordView = (record: PairRecordDetail, counts: PairChildCounts): MergeRecordView => ({
    id: record.id,
    name: displayName(entityType, record.row),
    createdAt: isoInstant(record.row.createdAt),
    counts: {
      deals: counts.deals,
      people: counts.people,
      notes: counts.notes,
      files: countFiles(record.row, definitions),
    },
  })

  const records = [
    toRecordView(detail.recordA, detail.recordA.childCounts),
    toRecordView(detail.recordB, detail.recordB.childCounts),
  ]

  const orientations = [
    buildOrientation(detail.recordA, detail.recordB),
    buildOrientation(detail.recordB, detail.recordA),
  ]

  /**
   * M-2's default: THE OLDER RECORD SURVIVES.
   *
   * Decided here, where both instants are in hand as instants rather than as formatted strings. A
   * tie falls to the pair's first member, which is `duplicate_pairs`' lexicographically first id —
   * arbitrary, but stable, so the same pair opens the same way every time.
   */
  const defaultSurvivorId =
    Date.parse(records[1].createdAt) < Date.parse(records[0].createdAt)
      ? records[1].id
      : records[0].id

  return (
    <div className="container py-8">
      <div className="space-y-6">
        {/* ABOVE THE `<h1>`, per M-10: the way out of a destructive form is the first thing on the
            page, not something to hunt for at the bottom of ten decisions. */}
        <Button asChild variant="ghost" size="sm">
          <Link href={REVIEW_LIST_HREF}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("merge.backToList")}
          </Link>
        </Button>

        <div>
          {/* The display-typography h1 the 320px spec locates by role, so its shape is
              load-bearing rather than decorative — and its classes are spelled ONCE, in the
              element itself, because the plan's acceptance criteria count them. */}
          <h1 className="text-3xl font-bold">{t("merge.title")}</h1>
          <p className="text-muted-foreground">{t("merge.description")}</p>
        </div>

        <MergeForm
          pairId={detail.pair.id}
          records={records}
          orientations={orientations}
          defaultSurvivorId={defaultSurvivorId}
        />
      </div>
    </div>
  )
}
