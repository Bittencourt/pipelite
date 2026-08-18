import type { EntityType } from "@/db/schema/custom-fields"
import type { AuditAction, AuditFieldChange, AuditValue } from "@/lib/timeline/types"

/* -----------------------------------------------------------------------------------------
 * PURE. No database client, no bus, no clock, no I/O of any kind.
 *
 * The posture is copied from `src/lib/formula-helpers.ts` and from `./diff.ts`: the vitest
 * suite mocks `@/db` wholesale, so anything that queries cannot be unit tested. Every
 * database-dependent decision this module needs - resolving an owner id to a person,
 * reading a custom field's user-authored name, its type and its position - arrives in the
 * `AuditResolution` parameter, supplied by the timeline source's hydrate (36-17) and by the
 * run-detail reader. That is what makes the phase's display logic testable at all.
 *
 * Keep it that way: the only imports are types.
 *
 * WHAT THIS MODULE DOES NOT DO: locale formatting. Numbers, dates and lists are formatted
 * by the client component with `useFormatter`, because only it knows the locale. This module
 * decides WHICH of the nine value shapes a stored value is, and in what order the fields
 * appear; the renderer decides how each one reads in Portuguese.
 * ----------------------------------------------------------------------------------------- */

/** Collapsed display budget for one value. Roughly two lines in the content column at 14px. */
export const AUDIT_VALUE_MAX_CHARS = 120

/** Cap for the native `title` attribute. A 5,000-character tooltip is not a tooltip. */
export const AUDIT_TITLE_MAX_CHARS = 1000

/** U+2026. ONE character, so the truncation budget is exact. Never three periods. */
const ELLIPSIS = "…"

/**
 * Stored change keys for custom fields are namespaced by `./diff.ts` with this prefix.
 *
 * EXPORTED for the same reason as `AUDIT_REFERENCE_COLUMNS` below: `auditSource.hydrate`
 * (36-17) has to recognise the very same keys to know which stored ids are custom LOOKUP
 * values needing a label, and a second copy of the string would silently stop matching the
 * day `diff.ts` changed it.
 */
export const CUSTOM_FIELD_PREFIX = "customFields."

/** The renderer branches on this prefix, never on a heuristic about the label's content. */
const CUSTOM_CHANGE_PREFIX = "custom:"

/**
 * Every audited native column, mapped to the MESSAGE KEY that labels it.
 *
 * Keys, not English: the 20-branch mapping stays out of the render function and this module
 * stays pure. 36-13 resolves them with `useTranslations`. `AuditFieldChange.label` therefore
 * carries a message key for native columns and the VERBATIM user-authored name for custom
 * fields - the one property in this contract holding two kinds of string. The two are told
 * apart STRUCTURALLY, by whether `AuditFieldChange.field` starts with `custom:`.
 *
 * INSERTION ORDER IS LOAD-BEARING: it is the display order of native columns (see
 * `buildAuditFieldChanges`). Labels name the relationship, not the column - `stageId` is
 * "Stage", not "Stage ID", because the id is an implementation detail and never reaches a
 * screen.
 */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  title: "audit.field.title",
  name: "audit.field.name",
  firstName: "audit.field.firstName",
  lastName: "audit.field.lastName",
  email: "audit.field.email",
  phone: "audit.field.phone",
  website: "audit.field.website",
  industry: "audit.field.industry",
  defaultCurrency: "audit.field.defaultCurrency",
  value: "audit.field.value",
  stageId: "audit.field.stage",
  expectedCloseDate: "audit.field.expectedCloseDate",
  organizationId: "audit.field.organization",
  personId: "audit.field.person",
  dealId: "audit.field.deal",
  ownerId: "audit.field.owner",
  assigneeId: "audit.field.assignee",
  typeId: "audit.field.type",
  dueDate: "audit.field.dueDate",
  completedAt: "audit.field.completedAt",
}

const NATIVE_ORDER: ReadonlyMap<string, number> = new Map(
  Object.keys(AUDIT_FIELD_LABELS).map((column, index) => [column, index])
)

/** Date columns, mapped to whether the time of day is part of the value. */
const DATE_COLUMNS: Record<string, boolean> = {
  dueDate: true,
  completedAt: true,
  // A close date is a day, not an instant: showing 00:00 next to it would invent precision.
  expectedCloseDate: false,
  // DEFENCE IN DEPTH, not a display decision. `deletedAt` has no entry in the label map above
  // and the renderer replaces its row with a translated sentence carrying no value at all
  // (see `humaniseColumn` below), so this classification should never be consulted. Listing it
  // means `nativeKind` returns "date" if any future path DOES render the value, and the viewer
  // gets it in their own locale instead of the stored ISO instant - which is exactly what they
  // were shown before 45-06. `true`, because the moment of a deletion without its time of day
  // is not a useful fact.
  deletedAt: true,
}

/** `deals.value` is `numeric`, which node-postgres hands back as a string. */
const NUMBER_COLUMNS: ReadonlySet<string> = new Set(["value"])

/**
 * Foreign keys. An id on one of these NEVER becomes a text value.
 *
 * EXPORTED, and as a tuple rather than a `Set`, so that the half of this rule that needs a
 * database can be written against the same list. `auditSource.hydrate` (36-17) declares its
 * column-to-table map as `Record<AuditReferenceColumn, ...>`, so adding a column here without
 * teaching that map which table the id points at is a COMPILE error rather than a screen that
 * reads "no longer available" for a reference this module knows perfectly well is one. The two
 * halves cannot drift.
 */
export const AUDIT_REFERENCE_COLUMNS = [
  "stageId",
  "organizationId",
  "personId",
  "dealId",
  "ownerId",
  "assigneeId",
  "typeId",
] as const

export type AuditReferenceColumn = (typeof AUDIT_REFERENCE_COLUMNS)[number]

const REFERENCE_COLUMNS: ReadonlySet<string> = new Set(AUDIT_REFERENCE_COLUMNS)

/** `customFieldDefinitions.type` mapped to the value shape it produces. */
const CUSTOM_TYPE_KINDS: Record<string, ValueKind> = {
  date: "date",
  number: "number",
  boolean: "boolean",
  multi_select: "list",
  file: "files",
  lookup: "reference",
}

type ValueKind = "auto" | "boolean" | "date" | "files" | "list" | "number" | "reference"

/**
 * Everything the display layer would otherwise need a query for.
 *
 * `references` is keyed `${changeKey}:${id}` - the change map's own key, so a native
 * `ownerId` and a custom lookup field are looked up the same way. A key mapped to `null`
 * and a key that is absent mean the same thing to the renderer ("no longer available"),
 * which is deliberate: a caller that could not resolve a row and a caller that did not try
 * must not produce different screens.
 */
export interface AuditResolution {
  references: Map<string, string | null>
  /** definitionId to the user-authored `customFieldDefinitions.name`. */
  customFieldNames: Map<string, string>
  /** definitionId to `customFieldDefinitions.type`. */
  customFieldTypes: Map<string, string>
  /** definitionId to `customFieldDefinitions.position`. */
  customFieldPositions: Map<string, number>
}

/**
 * Collapse whitespace, then truncate - in that order, for every string-producing case.
 *
 * Called by the RENDERER, not here, because `list` values are joined with `format.list`
 * under the viewer's locale and can only be measured after that. Keeping one truncation
 * point means the 120-character budget cannot drift between the two.
 *
 * `title` is `null` when nothing was cut, so the renderer omits the attribute instead of
 * duplicating the visible text into it.
 */
export function collapseAndTruncate(input: string): { display: string; title: string | null } {
  const collapsed = input.replace(/\s+/g, " ").trim()

  if (collapsed.length <= AUDIT_VALUE_MAX_CHARS) {
    return { display: collapsed, title: null }
  }

  return {
    display: collapsed.slice(0, AUDIT_VALUE_MAX_CHARS - 1) + ELLIPSIS,
    title: collapsed.slice(0, AUDIT_TITLE_MAX_CHARS),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * A value that renders as the word "empty" rather than as nothing at all.
 *
 * An empty array counts: clearing every option of a multi-select is the field becoming
 * empty, not a list of zero items the renderer would draw as blank.
 */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const parsed = Number(value)
    return value.trim() !== "" && Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * An ISO string a `new Date()` in the renderer can parse, or `null` if this is not a date.
 *
 * A string is carried VERBATIM rather than round-tripped through `Date`: these columns are
 * `timestamp` without a zone, so re-normalising would move the value by the offset between
 * the writer's clock and this process's `TZ`. `./diff.ts` already coerces every top-level
 * `Date` to an ISO string, so the `Date` branch only fires for a caller that skipped it.
 */
function toIsoString(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value === "string") {
    return Number.isNaN(new Date(value).getTime()) ? null : value
  }
  return null
}

/** A stored file descriptor, as `file-field.tsx` writes them. */
function isFileDescriptor(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (typeof value.filename !== "string") return false
  return "storedName" in value || "path" in value || "size" in value || "mimeType" in value
}

function compactJson(value: unknown): string {
  try {
    const encoded = JSON.stringify(value)
    return encoded === undefined ? String(value) : encoded
  } catch {
    // Circular structures cannot come out of JSONB, but a caller could hand one in, and a
    // throw here would take down the whole timeline for one unreadable field.
    return String(value)
  }
}

/** Shape inference for a value with no column or definition hint to go on. */
function inferValue(raw: unknown): AuditValue {
  if (typeof raw === "boolean") return { type: "boolean", value: raw }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { type: "number", value: raw } : { type: "json", value: String(raw) }
  }
  if (typeof raw === "string") return { type: "text", value: raw }
  if (raw instanceof Date) {
    const iso = toIsoString(raw)
    return iso === null ? { type: "json", value: String(raw) } : { type: "date", iso, withTime: true }
  }
  if (Array.isArray(raw)) {
    if (raw.every(isFileDescriptor)) return { type: "files", count: raw.length }
    if (raw.every((item) => typeof item === "string")) return { type: "list", items: raw }
    return { type: "json", value: compactJson(raw) }
  }
  return { type: "json", value: compactJson(raw) }
}

/** The definition whose values are stored under this custom field name, if it still exists. */
function customDefinitionId(name: string, resolution: AuditResolution): string | null {
  for (const [definitionId, definitionName] of resolution.customFieldNames) {
    if (definitionName === name) return definitionId
  }
  return null
}

/** How a stored change key should be typed, labelled and ordered. */
interface FieldDescriptor {
  /** `AuditFieldChange.field`: the column name, or `custom:<definitionId>`. */
  field: string
  label: string
  kind: ValueKind
  withTime: boolean
  /** 0 = mapped native column, 1 = unmapped native column, 2 = custom field. */
  group: number
  /** Position within the group: the label-map index, or the definition's position. */
  rank: number
}

/**
 * A column name split on capitals and sentence-cased: `someNewColumn` to "Some new column".
 *
 * THIS PATH IS REACHED, and by exactly one column today. The comment here used to assert the
 * opposite, and that assertion is why a raw database identifier sat in the record timeline
 * beside an unformatted instant for the whole of phases 36-38: a reader who believed it went
 * looking for the missing label in the map above and concluded there was nothing to fix.
 *
 * The column is `deletedAt`, and its absence from the map is DELIBERATE. `AUDIT_FIELD_LABELS`
 * holds one message key per column and `describeField` emits one `label` with no sight of the
 * from/to pair, but a `deleted_at` transition has two directions - a value appearing is a soft
 * delete, a value being cleared is a restore - and they are different sentences. So the choice
 * is made where the pair is in hand, in `AuditFieldRow` in
 * `src/components/timeline/audit-entry.tsx`, which intercepts the column before this label is
 * used. Adding an entry here would also take a rank in `NATIVE_ORDER`, whose insertion order is
 * the display order of native fields in every record timeline.
 *
 * For any OTHER column, reaching this function still means what it always meant: a column was
 * added to the schema and audited without its label being added, and a user is now reading a
 * raw identifier. It exists so that oversight degrades into an ugly label rather than a blank
 * one - never as a licence to skip the map.
 */
function humaniseColumn(column: string): string {
  const words = column.replace(/([A-Z])/g, " $1").trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function describeField(changeKey: string, resolution: AuditResolution): FieldDescriptor {
  if (changeKey.startsWith(CUSTOM_FIELD_PREFIX)) {
    const name = changeKey.slice(CUSTOM_FIELD_PREFIX.length)
    const definitionId = customDefinitionId(name, resolution)

    if (definitionId === null) {
      // The definition was deleted after the entry was written. The stored key is the only
      // name that ever existed for it, and an audit surface that dropped the row instead
      // would be omitting history.
      return {
        field: CUSTOM_CHANGE_PREFIX + name,
        label: name,
        kind: "auto",
        withTime: false,
        group: 2,
        rank: Number.MAX_SAFE_INTEGER,
      }
    }

    const definitionType = resolution.customFieldTypes.get(definitionId)

    return {
      field: CUSTOM_CHANGE_PREFIX + definitionId,
      // VERBATIM and unescaped: React escapes text children downstream, and escaping here
      // as well would show the entity codes to the user (T-36-21).
      label: resolution.customFieldNames.get(definitionId) ?? name,
      kind: (definitionType === undefined ? undefined : CUSTOM_TYPE_KINDS[definitionType]) ?? "auto",
      withTime: false,
      group: 2,
      rank: resolution.customFieldPositions.get(definitionId) ?? Number.MAX_SAFE_INTEGER,
    }
  }

  const nativeIndex = NATIVE_ORDER.get(changeKey)

  return {
    field: changeKey,
    label: nativeIndex === undefined ? humaniseColumn(changeKey) : AUDIT_FIELD_LABELS[changeKey],
    kind: nativeKind(changeKey),
    withTime: DATE_COLUMNS[changeKey] === true,
    group: nativeIndex === undefined ? 1 : 0,
    rank: nativeIndex ?? 0,
  }
}

function nativeKind(column: string): ValueKind {
  if (column in DATE_COLUMNS) return "date"
  if (NUMBER_COLUMNS.has(column)) return "number"
  if (REFERENCE_COLUMNS.has(column)) return "reference"
  return "auto"
}

function resolveWithDescriptor(
  changeKey: string,
  raw: unknown,
  resolution: AuditResolution,
  descriptor: FieldDescriptor
): AuditValue {
  if (isEmptyValue(raw)) return { type: "empty" }

  switch (descriptor.kind) {
    case "reference": {
      if (typeof raw === "string" || typeof raw === "number") {
        // `get` returning undefined (never resolved) and returning null (row gone) both
        // mean "no longer available". An id is never shown to a user (T-36-22).
        return { type: "reference", label: resolution.references.get(`${changeKey}:${raw}`) ?? null }
      }
      break
    }
    case "date": {
      const iso = toIsoString(raw)
      if (iso !== null) return { type: "date", iso, withTime: descriptor.withTime }
      break
    }
    case "number": {
      const parsed = toFiniteNumber(raw)
      if (parsed !== null) return { type: "number", value: parsed }
      break
    }
    case "boolean": {
      if (typeof raw === "boolean") return { type: "boolean", value: raw }
      break
    }
    case "list": {
      if (Array.isArray(raw)) {
        return { type: "list", items: raw.map((item) => (typeof item === "string" ? item : compactJson(item))) }
      }
      break
    }
    case "files": {
      if (Array.isArray(raw)) return { type: "files", count: raw.length }
      break
    }
    default:
      break
  }

  // The hint did not fit the stored value - a definition retyped after the entry was
  // written, or a column that changed shape. Infer rather than assert: a wrong assertion
  // here renders a date as an empty box, an inference renders the truth.
  return inferValue(raw)
}

/**
 * One stored value, typed for display.
 *
 * `changeKey` is the RAW key from the change map (a column name, or `customFields.<name>`),
 * because it is what selects the column hint and what keys `resolution.references`.
 */
export function toAuditValue(
  changeKey: string,
  raw: unknown,
  resolution: AuditResolution
): AuditValue {
  return resolveWithDescriptor(changeKey, raw, resolution, describeField(changeKey, resolution))
}

interface RankedChange {
  descriptor: FieldDescriptor
  change: AuditFieldChange
}

/**
 * Ordering is FIXED, not incidental: mapped native columns in label-map order, then unmapped
 * native columns, then custom fields ascending by position, every tie broken by the label
 * and finally by the field identity so the comparator is total.
 *
 * Only the first three rows render by default, so an order that depended on object key
 * insertion would show a different three on every render.
 */
function compareChanges(a: RankedChange, b: RankedChange): number {
  if (a.descriptor.group !== b.descriptor.group) return a.descriptor.group - b.descriptor.group
  if (a.descriptor.rank !== b.descriptor.rank) return a.descriptor.rank - b.descriptor.rank

  const byLabel = a.change.label.localeCompare(b.change.label)
  if (byLabel !== 0) return byLabel

  if (a.change.field === b.change.field) return 0
  return a.change.field < b.change.field ? -1 : 1
}

/**
 * The stored `{ field: { from, to } }` blob, turned into the labelled, typed, ordered list
 * the renderer consumes.
 *
 * `deleted` returns `[]` whatever the map holds: the UI-SPEC draws no field list for a
 * delete, and the tombstone `./diff.ts` writes is a restore payload (Phase 37), not display
 * copy. `created` forces every `from` to null - a create is an initial state, and an arrow
 * drawn from nothing would be a fiction.
 */
export function buildAuditFieldChanges(
  entityType: EntityType,
  action: AuditAction,
  changes: Record<string, { from: unknown; to: unknown }>,
  resolution: AuditResolution
): AuditFieldChange[] {
  // Part of the contract and passed by every caller, but no rule here is entity-dependent
  // yet: the label map is shared across all four entities on purpose (`title` labels both a
  // deal and an activity). Kept in the signature so per-entity divergence, if it ever lands,
  // does not churn 36-13 and 36-17. Same `void` idiom as `timeline-entry.tsx`.
  void entityType

  if (action === "deleted") return []

  const isCreate = action === "created"
  const ranked: RankedChange[] = []

  for (const [changeKey, stored] of Object.entries(changes)) {
    const descriptor = describeField(changeKey, resolution)

    ranked.push({
      descriptor,
      change: {
        field: descriptor.field,
        label: descriptor.label,
        from: isCreate
          ? null
          : resolveWithDescriptor(changeKey, stored?.from, resolution, descriptor),
        to: resolveWithDescriptor(changeKey, stored?.to, resolution, descriptor),
      },
    })
  }

  ranked.sort(compareChanges)

  return ranked.map((entry) => entry.change)
}
