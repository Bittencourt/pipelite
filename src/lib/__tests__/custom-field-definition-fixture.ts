/**
 * =============================================================================
 * custom-field-definition-fixture.ts — MANUFACTURING THE SUBJECT PHASE 49 HAS NONE OF
 * =============================================================================
 *
 * WHY THIS MODULE EXISTS, AND IT IS NOT CONVENIENCE. Measured against the running `pipelite`
 * database on **2026-08-26**, and re-measured in plan 49-01 Task 1 rather than inherited from
 * research: `custom_field_definitions` holds **169 live rows** — 62 `text`, 56 `multi_select`,
 * 28 `single_select`, 12 `number`, 11 `date` — and **zero of `type='formula'` and zero of
 * `type='file'`**. Across all four CRM tables (188,619 rows) **zero records carry a stored file
 * descriptor**, on both the `%storedName%` and the `%publicUrl%` probe.
 *
 * That absence makes three of Phase 49's four criteria unprovable against live data:
 *
 *   - **SC-2** (a purge deletes the blob) finds no blobs. It asserts about an empty set and passes.
 *   - **SC-3** (a merge leaves the survivor's formulas consistent) has no formula to recompute.
 *   - **SC-4** (a 201 carries what a read would) has no server-side derivation to diverge from.
 *     `recalculateFormulas` only writes when `inScope.length > 0`, so with zero formula definitions
 *     an SC-4 test written against live definitions is green **before AND after** the fix.
 *
 * One trap in three places, and the only escape is a test that creates its own subject. That is
 * what this module is for: it is the difference between a proof and a test that would pass either
 * way.
 *
 * WHY THE CALLER SUPPLIES THE ID. `custom_field_definitions.id` is `text` with
 * `$defaultFn(() => crypto.randomUUID())` (`src/db/schema/custom-fields.ts:22`). A fixture that let
 * the default fire would produce an unprefixed UUID that a prefix-scoped teardown cannot find —
 * and a leaked `type='formula'` definition does not merely litter the table, it silently activates
 * the formula-recalculation path for every later suite in the same run. Every fixture in this
 * repository cleans up by id prefix, so the id is a REQUIRED argument with no default and there is
 * deliberately no `crypto.randomUUID` fallback anywhere below.
 *
 * WHY A SHARED MODULE rather than a helper local to one test file: plans **49-05** (SC-4's
 * canonical-read proof, four entities), **49-07** (SC-2's purge and injected-failure proof) and
 * **49-08** (SC-3's merge-consistency proof) all need the same two definitions. `api-key-fixture.ts`
 * is this repository's only precedent for a shared fixture module and it set the convention of
 * naming its future consumers in its own header; these are ours.
 *
 * WHY `src/lib/__tests__/`, stated rather than picked silently. `api-key-fixture.ts` lives inside a
 * `__tests__/` directory, so this follows it; and `src/lib/__tests__/` is import-reachable from all
 * three consumers (`src/app/api/v1/__tests__/`, `src/lib/trash/`, `src/lib/mutations/`) without any
 * of them reaching into another feature's test directory. The `-fixture.ts` suffix is matched by no
 * vitest project's include glob — the base project globs `src/**\/*.{test,spec}.*` and the db
 * project globs `src/**\/*.db.test.*` — so this module never runs as a suite of its own.
 *
 * `deleted_at` is left NULL deliberately: a non-null value makes `getActiveFieldDefinitions`
 * (`src/lib/custom-fields.ts:22-30`) skip the row, which would define a field that activates
 * nothing.
 *
 * THE CALLER OWNS THE TEARDOWN, and `removeFieldDefinitions` HARD deletes for a reason stated in
 * its own doc comment.
 * =============================================================================
 */
import { like } from "drizzle-orm"

import { db } from "@/db"
import {
  customFieldDefinitions,
  type EntityType,
  type FieldConfig,
  type FieldType,
} from "@/db/schema"

export interface MintFieldDefinitionInput {
  /**
   * Supplied, never defaulted, so a prefix-scoped teardown can find the row. There is no fallback
   * to `crypto.randomUUID()` here on purpose — see the module header.
   */
  id: string
  entityType: EntityType
  /**
   * The field name, which is also the key the value is stored under in the entity's `customFields`
   * JSONB column.
   *
   * A `file` field's name additionally becomes a URL segment in
   * `/api/files/${entityId}/${fieldName}/${storedName}`, so a name containing `/` cannot round-trip
   * through that three-segment route. The fixture does not enforce that — the caller's own test
   * asserts it, because the constraint applies only to the `file` type.
   */
  name: string
  /** The column is `type`, never `field_type`. */
  type: FieldType
  /**
   * Passed through UNTOUCHED. A formula's `expression` and a file field's limits are the caller's
   * business: this module manufactures a definition, it does not decide what the definition means.
   */
  config?: FieldConfig
  /**
   * `position` is `numeric(20,10)` and NOT NULL. Defaulted to the same string the column's own
   * default uses, so a caller that does not care about ordering does not have to think about the
   * numeric-as-string representation.
   */
  position?: string
}

export interface MintedFieldDefinition {
  /** The `custom_field_definitions.id` of the row that was written — the caller's own value. */
  id: string
  /**
   * The field name that was written, echoed so a caller can key into a `customFields` payload
   * without restating the literal and letting the two drift.
   */
  name: string
}

/**
 * Create one custom-field definition, in the database the caller is connected to.
 *
 * The caller is responsible for deleting it afterwards — see `removeFieldDefinitions`.
 */
export async function mintFieldDefinition({
  id,
  entityType,
  name,
  type,
  config,
  position = "10000",
}: MintFieldDefinitionInput): Promise<MintedFieldDefinition> {
  await db.insert(customFieldDefinitions).values({
    id,
    entityType,
    name,
    type,
    // `?? null` rather than omitting the key: the column is nullable with no default, and passing
    // `undefined` through drizzle's insert would leave the shape of the statement dependent on
    // whether the caller spelled the argument, which is a difference that should not exist.
    config: config ?? null,
    position,
  })

  return { id, name }
}

/**
 * HARD delete every definition whose `id` matches `likePrefix`, and return how many rows went.
 *
 * HARD, not soft, and the distinction is load-bearing. A soft delete leaves the row in the table:
 * `getActiveFieldDefinitions` would stop returning it, so a reader-level check would look clean,
 * while a table-count parity check would still see it and report a leak. Worse, a soft-deleted row
 * is still a row — and `dedup.db.test.ts`'s parity `afterAll` counts rows, not live rows.
 *
 * The COUNT is returned so a caller can assert a named-integer floor on its own teardown rather
 * than trusting it. A teardown that silently removed nothing is how a leaked `type='formula'`
 * definition reaches the next suite in the same run and activates the formula-recalculation path in
 * a file that never asked for one.
 *
 * @param likePrefix a SQL LIKE pattern, e.g. `"cfdfix-%"`. Callers use a prefix containing no `_`
 *   and no `%` so no LIKE escaping is needed.
 */
export async function removeFieldDefinitions(likePrefix: string): Promise<number> {
  const removed = await db
    .delete(customFieldDefinitions)
    .where(like(customFieldDefinitions.id, likePrefix))
    .returning({ id: customFieldDefinitions.id })

  return removed.length
}
