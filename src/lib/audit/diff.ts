import { isDeepStrictEqual } from "node:util"

import { isFormulaWrapper } from "@/lib/formula-helpers"
import type { CrmEntityType, CrmEventPayload } from "@/lib/events/types"

/* -----------------------------------------------------------------------------------------
 * PURE. No database client, no bus, no clock, no I/O of any kind.
 *
 * The posture is copied deliberately from `src/lib/formula-helpers.ts`: the vitest suite
 * mocks `@/db` wholesale, so anything that touches the database cannot be properly unit
 * tested. This module is where the whole audit phase's testable logic lives on purpose -
 * everything hard about AUDIT-01 (two payload casings, formula exclusion, tombstones) is
 * decided here, and the subscriber that consumes it stays trivial.
 *
 * Keep it that way: the only imports are `isFormulaWrapper` and types.
 * ----------------------------------------------------------------------------------------- */

/** One entry of the audit row's `changes` JSONB: what the field was, and what it became. */
export type AuditChangeMap = Record<string, { from: unknown; to: unknown }>

/**
 * Columns that change without a user changing anything, and are therefore pure noise.
 *
 * `updatedAt` differs on literally every write; `position` differs on every kanban reorder
 * (and on every drag of an unrelated card); `id` and `createdAt` are immutable.
 */
export const IGNORED_COLUMNS: ReadonlySet<string> = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "position",
])

/**
 * Key names emitted by `serializePerson` (`src/lib/api/serialize.ts:50-65`), mapped back to
 * the column names the raw row uses.
 *
 * `full_name` is intentionally ABSENT from this table and dropped outright below: it is
 * computed as `${firstName} ${lastName}` inside the serializer and is never stored, so it
 * can only ever restate a change that `firstName`/`lastName` already record.
 */
const PERSON_KEY_MAP: Record<string, string> = {
  first_name: "firstName",
  last_name: "lastName",
  organization_id: "organizationId",
  owner_id: "ownerId",
  custom_fields: "customFields",
  created_at: "createdAt",
  updated_at: "updatedAt",
}

/** Key names emitted by `serializeDeal` (`src/lib/api/serialize.ts:71-87`). */
const DEAL_KEY_MAP: Record<string, string> = {
  stage_id: "stageId",
  organization_id: "organizationId",
  person_id: "personId",
  owner_id: "ownerId",
  expected_close_date: "expectedCloseDate",
  custom_fields: "customFields",
  created_at: "createdAt",
  updated_at: "updatedAt",
}

/**
 * TWO maps, not four - and the omission is deliberate, do not "fix" it.
 *
 * Only `serializePerson` and `serializeDeal` ever reach a `crmBus.emit`, at exactly five
 * sites: `/api/v1/people` create, `/api/v1/people/[id]` update, `/api/v1/people/batch`
 * create, `/api/v1/deals` create and `/api/v1/deals/batch` create. `serializeOrganization`
 * and `serializeActivity` never do - organizations and activities emit the raw camelCase row
 * at every site, as do all 18 `src/lib/mutations/*.ts` sites. Verified exhaustively in
 * 36-PATTERNS § "The five snake_case emit sites", which corrects 36-RESEARCH on this point.
 *
 * Adding organization/activity entries here would be harmless-looking but wrong: it would
 * mean claiming a snake_case shape exists on a path where it does not.
 */
const KEY_MAPS: Partial<Record<CrmEntityType, Record<string, string>>> = {
  person: PERSON_KEY_MAP,
  deal: DEAL_KEY_MAP,
}

/** Keys computed by a serializer rather than stored, which must never become a change. */
const COMPUTED_KEYS: Partial<Record<CrmEntityType, ReadonlySet<string>>> = {
  person: new Set(["full_name"]),
}

/**
 * Reduce a value to one representation so the two payload shapes can be compared.
 *
 * `toIsoString` (`serialize.ts:24-27`) runs on the snake_case sites only, so a date column
 * can disagree in TYPE as well as in key name: `previous.expectedCloseDate` is a `Date`
 * while `data.expected_close_date` is an ISO string. `IGNORED_COLUMNS` closes this for
 * `createdAt`/`updatedAt`, but `expectedCloseDate`, `dueDate` and `completedAt` get no such
 * escape, so every top-level `Date` is coerced instead of just those three - the rule is
 * simpler than the list and cannot fall out of date with the schema.
 *
 * Custom field values are left alone: they come out of JSONB, so they never contain a `Date`.
 */
function canonicaliseValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value
}

/**
 * Rewrite an event payload's keys into raw column names.
 *
 * Keys already in column form pass through untouched, which is exactly what makes it safe to
 * apply to BOTH sides of every payload without knowing which emit site produced them.
 */
export function normaliseEventData(
  entity: CrmEntityType,
  obj: Record<string, unknown>
): Record<string, unknown> {
  const keyMap = KEY_MAPS[entity]
  const computed = COMPUTED_KEYS[entity]
  const normalised: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (computed?.has(key)) continue
    normalised[keyMap?.[key] ?? key] = canonicaliseValue(value)
  }

  return normalised
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * Build the `field -> { from, to }` map that becomes the audit row's `changes` JSONB.
 *
 * An update whose result is `{}` must write NO row at all - that is the caller's contract,
 * and it is why `updatedAt` is ignored rather than merely uninteresting.
 */
export function buildChanges(payload: CrmEventPayload): AuditChangeMap {
  const isDelete = payload.action === "deleted"
  const isUpdate = payload.action === "updated"

  const before = normaliseEventData(payload.entity, payload.previous ?? {})
  // A delete carries `data === { id }` at all seven delete emit sites, so `previous` is the
  // ONLY source of state: the tombstone is built by diffing the whole before-row against
  // nothing. Diffing `data` here instead produces a useless one-key `{ id }` map, and does
  // it silently.
  const after = isDelete ? {} : normaliseEventData(payload.entity, payload.data)

  const changes: AuditChangeMap = {}

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORED_COLUMNS.has(key)) continue
    if (key === "customFields") continue // handled below, key by key, behind the formula gate

    // A column the writer did not report at all is not a column that was cleared. The
    // serializers omit `deleted_at` entirely while the pre-read row that becomes `previous`
    // always carries `deletedAt: null`, so without this an ordinary REST edit would report a
    // phantom `deletedAt` change alongside the real one. Creates and deletes are exempt:
    // there, "absent from the other side" is the whole point.
    if (isUpdate && !(key in after)) continue

    if (!isDeepStrictEqual(before[key], after[key])) {
      changes[key] = { from: before[key], to: after[key] }
    }
  }

  const cfBefore = asRecord(before.customFields) ?? {}
  const cfAfter = asRecord(after.customFields) ?? {}

  // Same reasoning as above, one level down: if an update reported no `custom_fields` at all,
  // nothing about the custom fields was asserted. When it IS reported it is always written
  // whole, so a key that disappeared really was cleared and is diffed normally.
  const customFieldsReported = isDelete || !isUpdate || "customFields" in after

  if (customFieldsReported) {
    for (const key of new Set([...Object.keys(cfBefore), ...Object.keys(cfAfter)])) {
      // THE FORMULA GATE. A formula value is stored as `{ formula: true, value, error }`, so
      // testing the VALUE means no `custom_field_definitions` read is needed at all - the
      // discriminator travels inside the payload, which is what keeps this module db-free.
      // Both sides are tested: a definition flipped to formula-typed leaves an unwrapped
      // `from` beside a wrapped `to`, and that is still derived noise. Phase 34
      // recalculations are writes, and a formula moving because its input moved is already
      // recorded by the input's own entry.
      if (isFormulaWrapper(cfBefore[key]) || isFormulaWrapper(cfAfter[key])) continue

      if (!isDeepStrictEqual(cfBefore[key], cfAfter[key])) {
        changes[`customFields.${key}`] = { from: cfBefore[key], to: cfAfter[key] }
      }
    }
  }

  return changes
}
