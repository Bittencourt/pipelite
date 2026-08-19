/**
 * The two `app_settings` keys phase 39 owns — the admin-configurable ORGANIZATION IDENTITY FIELD
 * list, and the trigram similarity floor for the *likely* tier.
 *
 * This is the THIRD `app_settings` key group in the codebase, after `audit.retention_days`
 * (`src/lib/audit/settings.ts`) and `trash.retention_days` (`src/lib/trash/settings.ts`), and the
 * module shape is copied from the latter deliberately: an exported `*_KEY` constant, a private
 * `zod` schema, a fail-closed `read*`, a `Write*Result` discriminated type, and a `write*` that
 * validates BEFORE touching the database.
 *
 * Like both analogs, this module DOES import the database. That is correct and expected: it is a
 * service, not a pure helper — which is also why nothing here may be imported from a
 * `"use client"` component. The admin form re-states its bounds rather than importing them, for
 * the same reason `retention-form.tsx` does.
 *
 * NOTHING HERE THROWS (S-5). Every read is reachable from a create-time submit path, and a
 * duplicate check must never be the reason a create fails. Every log line carries the key name
 * and the accepted bounds and NOTHING ELSE — never the stored value, which is admin-supplied
 * content (T-39-10).
 *
 * ---
 *
 * ONE DELIBERATE DIVERGENCE FROM THE ANALOGS, STATED HERE SO NOBODY HUNTS FOR A MISSING
 * MIGRATION: audit and trash both SEED their default row (migrations 0014 and 0015). PHASE 39
 * SEEDS NOTHING. `dedup.organization_identity_fields` is the first `app_settings` key that is
 * intentionally ABSENT on a fresh install, because there is no deployment-neutral custom-field
 * label to seed — `customFields` is keyed by the field definition's HUMAN LABEL, and those labels
 * are created per installation (here, by a Pipedrive import). A seeded guess would be wrong
 * everywhere except the one deployment it was copied from.
 */

import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema/app-settings"
import { DEFAULT_SIMILARITY_THRESHOLD } from "./constants"

const LOG_PREFIX = "[dedup-settings]"

/**
 * The ordered list of organization custom-field LABELS that act as identity keys.
 *
 * NOT SEEDED BY ANY MIGRATION — see the module header. Absent means unconfigured, and
 * unconfigured means no certain tier at all.
 */
export const ORG_IDENTITY_FIELDS_KEY = "dedup.organization_identity_fields"

/** The `pg_trgm` similarity floor for the *likely* tier. Also not seeded; it has a code default. */
export const DEDUP_SIMILARITY_KEY = "dedup.similarity_threshold"

/**
 * At most two identity fields.
 *
 * The cap is a CONTROL, not ergonomics. `scoring.ts`'s `firstSharedIdentity` consults fields in
 * order and stops at the first one populated on both records, so every additional entry is another
 * way for a weaker field to decide a *certain* match once the stronger ones are absent. Two is
 * what the admin control offers; a stored array longer than two therefore means something wrote
 * this row out of band, and the read side rejects it as well as the write side so that an
 * out-of-band write cannot widen the check (T-39-11).
 */
export const ORG_IDENTITY_FIELDS_MAX = 2

/**
 * Below 0.1 every pair of names in the database is "similar" and the scan degrades into a
 * cross join; the useful measured band is 0.75-0.92 (39-RESEARCH), so the floor is generous
 * rather than tight.
 */
export const SIMILARITY_MIN = 0.1

/** 1 is exact identity — the ceiling of `similarity()` itself, so nothing above it means anything. */
export const SIMILARITY_MAX = 1

/**
 * The single validation for both directions of the identity key.
 *
 * `app_settings.value` is `jsonb` typed as `unknown`, so a stored string, number, object or JSON
 * null all arrive here and all fail — no coercion anywhere. `.trim()` runs before `.min(1)`, so a
 * whitespace-only label is rejected rather than stored as a key that can never match a real
 * `customFields` entry.
 */
const identityFieldsSchema = z.array(z.string().trim().min(1)).max(ORG_IDENTITY_FIELDS_MAX)

/** The single validation for both directions of the threshold. `z.number()` also rejects `NaN`. */
const similaritySchema = z.number().min(SIMILARITY_MIN).max(SIMILARITY_MAX)

/**
 * Reads the configured organization identity fields, or `null`.
 *
 * `null` MEANS ORGANIZATIONS HAVE NO CERTAIN TIER AND NO CREATE-TIME WARNING. It does not mean
 * "fall back to name-only", and no such fallback may ever be added here or at any call site.
 * 39-RESEARCH measured `website` as NULL on all 46,054 organizations, which killed the originally
 * locked "name + website domain" rule outright; the tempting repair — call an equal normalized
 * name "certain" on its own — was measured at **1,030,436 pairs**, because 70.7% of organizations
 * share a normalized name. An unconfigured install degrading to *likely* only is a documented
 * product behaviour (39-CONTEXT § Post-Research Decisions), not a gap.
 *
 * `null` is ALSO what an empty array, a corrupted row, a tampered value, an over-long array and a
 * database outage produce. Collapsing all of them onto the same safe answer is the point: the
 * expensive wrong answer in this phase is a false *certain*, which is what puts a pre-checked
 * merge in front of an admin.
 *
 * Contrast `readSimilarityThreshold` below, which DOES fall back. The asymmetry is deliberate and
 * neither half may be "tidied up" into the other: a threshold has a measured safe default, a
 * per-installation custom-field label does not.
 */
export async function readOrgIdentityFields(): Promise<string[] | null> {
  try {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, ORG_IDENTITY_FIELDS_KEY),
    })

    if (!row) {
      return null
    }

    const parsed = identityFieldsSchema.safeParse(row.value)

    if (!parsed.success) {
      // Key name and bounds only — never the stored value, which is admin-supplied content
      // (T-39-10).
      console.warn(
        `${LOG_PREFIX} ${ORG_IDENTITY_FIELDS_KEY} is not an array of 0-${ORG_IDENTITY_FIELDS_MAX} non-empty strings — organizations have no certain tier and no create-time warning until it is corrected`
      )
      return null
    }

    // An empty array is UNCONFIGURED, not "configured with nothing", and it is a legal state
    // rather than an error: clearing the setting is how an admin switches the organization
    // certain tier off. No warning, because the admin did nothing wrong.
    if (parsed.data.length === 0) {
      return null
    }

    return parsed.data
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read ${ORG_IDENTITY_FIELDS_KEY}:`, error)
    return null
  }
}

/** Discriminated result so a caller cannot mistake a failure for a success. */
export type WriteOrgIdentityFieldsResult = { success: true } | { success: false; error: string }

/**
 * Upserts the identity field list.
 *
 * Validation happens BEFORE any database call, so an out-of-shape value never reaches storage
 * where every later read would have to defend against it (T-39-11). The tests assert the ABSENCE
 * of a database call for a non-string entry, a whitespace-only entry and an over-long array — a
 * `false` result alone would not prove the value never landed.
 *
 * `[]` is accepted and stored: clearing the setting is legal, and `readOrgIdentityFields` maps it
 * back to `null`.
 *
 * `onConflictDoUpdate` rather than an insert, because the row may or may not exist — this key is
 * seeded by no migration, so the very first write is an insert and every later one an update.
 */
export async function writeOrgIdentityFields(
  fields: string[]
): Promise<WriteOrgIdentityFieldsResult> {
  const parsed = identityFieldsSchema.safeParse(fields)

  if (!parsed.success) {
    return {
      success: false,
      error: `Identity fields must be up to ${ORG_IDENTITY_FIELDS_MAX} non-empty field names.`,
    }
  }

  // The trimmed values, not the caller's: a label with stray whitespace would never match a
  // `customFields` key and would look configured while matching nothing.
  const value = parsed.data

  try {
    const updatedAt = new Date()

    await db
      .insert(appSettings)
      .values({ key: ORG_IDENTITY_FIELDS_KEY, value, updatedAt })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt },
      })

    return { success: true }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to write ${ORG_IDENTITY_FIELDS_KEY}:`, error)
    return { success: false, error: "Failed to save the identity fields." }
  }
}

/**
 * Reads the similarity floor, falling back to `DEFAULT_SIMILARITY_THRESHOLD` (0.85).
 *
 * THIS FUNCTION FALLS BACK AND `readOrgIdentityFields` DOES NOT, AND THAT ASYMMETRY IS THE POINT.
 * An unset identity key must mean "no certain tier", because the alternative is 1,030,436 pairs.
 * An unset threshold has a real safe default: 39-RESEARCH measured 44,522 / 27,156 / 1,474 row
 * pairs at 0.75 / 0.85 / 0.92 and sampled the 0.85-0.92 band as high precision. A missing
 * threshold therefore has an answer, while a missing field label does not.
 *
 * Being a setting rather than a constant is what lets 39-VALIDATION's one manual judgement —
 * "read 20 pairs and decide whether they are duplicates" — be re-answered at a different floor
 * without a code change. There is deliberately no writer here: the sweep is an operator `UPDATE`
 * against one row, and an admin control for a number nobody has yet calibrated would be a surface
 * with no owner.
 *
 * Never throws (S-5): a bad row costs the configured floor, not the scan.
 */
export async function readSimilarityThreshold(): Promise<number> {
  try {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, DEDUP_SIMILARITY_KEY),
    })

    if (!row) {
      return DEFAULT_SIMILARITY_THRESHOLD
    }

    const parsed = similaritySchema.safeParse(row.value)

    if (!parsed.success) {
      // Key name and bounds only (T-39-10). The bounds are the product's own numbers and are safe
      // to print; the stored value is not.
      console.warn(
        `${LOG_PREFIX} ${DEDUP_SIMILARITY_KEY} is not a number in [${SIMILARITY_MIN}, ${SIMILARITY_MAX}] — falling back to the default floor of ${DEFAULT_SIMILARITY_THRESHOLD}`
      )
      return DEFAULT_SIMILARITY_THRESHOLD
    }

    return parsed.data
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to read ${DEDUP_SIMILARITY_KEY}:`, error)
    return DEFAULT_SIMILARITY_THRESHOLD
  }
}
