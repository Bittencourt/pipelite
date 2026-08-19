/**
 * THE CREATE-TIME CERTAIN-MATCH LOOKUP — DEDUP-01's server half, SC-1.
 *
 * Given the draft a user just submitted, which existing records are *certain* duplicates of it?
 * Only *certain*: the create-time warning shows nothing weaker (39-UI-SPEC Surface 1, locked), and
 * the *likely* tier belongs to the background scan and `/duplicates`.
 *
 * ---
 * WHY THIS FILE IS IN `src/lib/dedup/` AND NOT IN `src/lib/mutations/dedup.ts`
 *
 * 39-RESEARCH sketched this function inside the mutations module. It is a READ: it selects and
 * never writes, has no transaction, and emits no event — so it belongs with the other read modules
 * and follows their fail-closed posture (S-5, `src/lib/trash/queries.ts` rule 3) rather than the
 * mutation return shape (S-1). Keeping it out of `mutations/dedup.ts` also keeps plans 39-08 and
 * 39-09 off the same file.
 * ---
 * WHY THE QUERY SHAPES ARE COPIED CHARACTER-FOR-CHARACTER FROM A SQL SCRIPT
 *
 * `scripts/dedup-checks.sql` PART 4 EXPLAINs these exact statements and asserts that Postgres
 * chooses `org_norm_btree_idx` (probe 2) and `people_norm_email_idx` (probe 5). Part 4 is this
 * module's ONLY proof that an index is used at all — there is no assertion here that could catch a
 * sequential scan, because a mocked `db` has no planner.
 *
 * So: the equality is on the GENERATED COLUMN (`norm_name`, `norm_email`), and the right-hand side
 * spells the SAME expression that column is generated from, applied to a bind parameter. A query
 * that normalizes in TypeScript and compares the result against the column would still be correct
 * and would still return the right rows — and would still use the index. A query that spells the
 * expression differently on the LEFT of the equality would not, silently. **Changing the shape of
 * either statement below without updating Part 4 breaks that proof without breaking a test.**
 * ---
 * VISIBILITY: `deleted_at IS NULL` AND NOTHING ELSE, AND THAT IS DELIBERATE (T-39-05)
 *
 * `/organizations` and `/people` are NOT owner-scoped — both list pages select every non-deleted
 * row for any authenticated user. So this lookup reveals nothing the submitting user could not
 * already read off a list page, and adding an owner predicate here would only hide duplicates from
 * the person best placed to avoid creating one. IF EITHER LIST PAGE EVER BECOMES OWNER-SCOPED,
 * THIS QUERY MUST CHANGE WITH IT — the two are bound, and this comment is the binding.
 * ---
 * NOTHING HERE THROWS (S-5). A duplicate check must never be the reason a create fails: a rejected
 * query logs `[dedup-matching]` with identifiers only and returns `[]`, which renders as "no
 * warning" — the same outcome as a clean draft.
 */

import { and, eq, isNull, ne, sql, type SQL } from "drizzle-orm"

import { db } from "@/db"
import { organizations, people } from "@/db/schema"

import { CREATE_TIME_MATCH_LIMIT } from "./constants"
import { readOrgIdentityFields } from "./identity-settings"
import { isComparableOrgName, normalizeOrgName, normalizePersonName } from "./normalize"
import {
  classifyOrganizationMatch,
  classifyPersonMatch,
  isValidMatchEmail,
  type OrganizationMatchSide,
} from "./scoring"
import type { DedupReason, MergeableEntityType } from "./types"

const LOG_PREFIX = "[dedup-matching]"

/**
 * The draft the user just submitted, as far as duplicate detection is concerned.
 *
 * One shape for both entity types rather than a discriminated union, because the create dialogs
 * both hand over a partial record and neither knows which fields the rule of the day consults.
 * `entityType` selects the branch; the fields that branch does not use are ignored.
 */
export interface CertainMatchInput {
  entityType: MergeableEntityType
  /** Organizations only. */
  name?: string | null
  /** People only. */
  firstName?: string | null
  /** People only. */
  lastName?: string | null
  /** People only — `people.email` is a real column, which is why the person tier survives. */
  email?: string | null
  /** Organizations only: the JSONB blob, keyed by the field definition's human label. */
  customFields?: Record<string, unknown> | null
  /**
   * A record that must not match itself. Unused by the create path (nothing exists yet) and
   * present for the future edit path — a record whose name is unchanged would otherwise be
   * reported as a certain duplicate of itself.
   */
  excludeId?: string | null
}

/** One row of 39-UI-SPEC W-7's three-line warning. */
export interface CertainMatch {
  id: string
  /** Line 1, the link text. */
  name: string
  /**
   * Line 2, at Label typography muted: the value that made this certain — the person's e-mail, or
   * the organization identity field that decided. Never empty; a row with nothing to show here
   * cannot justify interrupting a create and is dropped.
   */
  distinguishingValue: string
  /** Line 3, resolved through the `dedup.reason.*` message keys. */
  reason: DedupReason
}

/**
 * Compose the shared visibility predicate with the optional self-exclusion.
 *
 * One helper for both branches so the two cannot drift: `deleted_at IS NULL` is the whole of the
 * visibility rule (see the header), and `excludeId` is the whole of the rest.
 */
function scope(
  deletedAt: Parameters<typeof isNull>[0],
  id: Parameters<typeof eq>[0],
  match: SQL,
  excludeId: string | null | undefined
): SQL {
  const exclusion =
    typeof excludeId === "string" && excludeId.length > 0 ? ne(id, excludeId) : undefined

  // `and()` is only `undefined` when every argument is, and `match` never is.
  return and(isNull(deletedAt), match, exclusion) as SQL
}

/** Read one identity value from a JSONB blob, trimmed. `""` when absent or not a string. */
function identityValue(customFields: Record<string, unknown> | null | undefined, field: string) {
  const raw = customFields?.[field]
  if (typeof raw !== "string") return ""
  return raw.trim()
}

/**
 * The first configured field the DRAFT populates.
 *
 * This is the "no query" gate, not the decision: a certain match needs the field populated on BOTH
 * records, so a draft that populates none of them cannot match anything and the round trip is pure
 * cost.
 */
function draftHasIdentityValue(
  customFields: Record<string, unknown> | null | undefined,
  identityFields: readonly string[]
): boolean {
  return identityFields.some((field) => identityValue(customFields, field).length > 0)
}

/**
 * WHICH field decided, so W-7's middle line can show its value — the DISPLAY value only.
 *
 * THE TIER DECISION IS NOT MADE HERE. `classifyOrganizationMatch` decides, and this runs only on
 * rows it already called *certain*. The iteration deliberately mirrors `scoring.ts`'s private
 * `firstSharedIdentity` (first field non-empty on both sides wins, no later field is consulted) so
 * the value shown is the value that decided; it is duplicated rather than exported from there
 * because `scoring.ts` is a PURE module owned by another plan and returns a classification, not a
 * provenance. If the two ever disagree this returns `null` and the row is dropped — a warning that
 * cannot say why is worse than no warning.
 */
function matchedIdentityValue(
  draft: OrganizationMatchSide,
  row: OrganizationMatchSide,
  identityFields: readonly string[]
): string | null {
  for (const field of identityFields) {
    const draftValue = identityValue(draft.customFields, field)
    const rowValue = identityValue(row.customFields, field)
    if (draftValue.length === 0 || rowValue.length === 0) continue
    // The EXISTING record's value, not the draft's: the warning row describes the record the user
    // is being pointed at.
    return rowValue
  }
  return null
}

/**
 * ORGANIZATIONS: equal normalized name AND an equal identity custom-field value.
 *
 * Returns `[]` WITHOUT ISSUING A QUERY in three cases, and each one is a documented product
 * behaviour rather than an optimization:
 *
 *   1. The identity key is unconfigured (`readOrgIdentityFields()` is `null`). There is NO certain
 *      tier and NO create-time warning — never a fall back to name-only, which 39-RESEARCH
 *      measured at 1,030,436 pairs because 70.7% of organizations share a normalized name.
 *   2. The draft populates none of the configured fields, so no row can qualify.
 *   3. The draft's normalized name is not comparable (`isComparableOrgName` — initials, or
 *      punctuation that normalizes to nothing). Measured: 9 of 46,054 organizations normalize to
 *      one of these, and equality over them collapses them into a single clique.
 */
async function findCertainOrganizationMatches(
  input: CertainMatchInput
): Promise<CertainMatch[]> {
  const identityFields = await readOrgIdentityFields()

  if (identityFields === null) return []
  if (!draftHasIdentityValue(input.customFields, identityFields)) return []

  // The TypeScript mirror of `public.dedup_norm_org`, used for the draft side only. The query
  // normalizes IN POSTGRES (see the header); this value is what the post-filter compares against
  // the column the database already computed. A drift between the two implementations therefore
  // yields ZERO certain matches rather than wrong ones — `normalize.test.ts` plus
  // `scripts/dedup-checks.sql` is what catches the drift itself.
  const draftNormName = normalizeOrgName(input.name)
  if (!isComparableOrgName(draftNormName)) return []

  const draftSide: OrganizationMatchSide = {
    normName: draftNormName,
    customFields: input.customFields,
  }

  try {
    const rows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        normName: organizations.normName,
        customFields: organizations.customFields,
      })
      .from(organizations)
      .where(
        scope(
          organizations.deletedAt,
          organizations.id,
          // `scripts/dedup-checks.sql` Part 4 probe 2, character for character:
          //   norm_name = public.dedup_norm_org($1)
          // The raw name is a BIND PARAMETER and the normalization runs in the database, so
          // nothing is concatenated into SQL (T-39-06) and the btree index on the generated
          // column is usable.
          eq(organizations.normName, sql`public.dedup_norm_org(${input.name ?? ""})`),
          input.excludeId
        )
      )
      // T-39-23 / W-8: the cap is ON THE QUERY. Six certain matches means the data is broken in a
      // way a create-time interruption cannot fix, and the scan is where a long list belongs.
      .limit(CREATE_TIME_MATCH_LIMIT)

    const matches: CertainMatch[] = []

    for (const row of rows) {
      const rowSide: OrganizationMatchSide = {
        normName: row.normName ?? "",
        customFields: row.customFields,
      }

      // THE TIER IS DECIDED BY `scoring.ts`, NOT HERE. The query narrows candidates; the pure
      // classifier is the single place the rule lives, so this module cannot drift from the scan.
      const classification = classifyOrganizationMatch(draftSide, rowSide, identityFields)
      if (classification === null || classification.tier !== "certain") continue

      const distinguishingValue = matchedIdentityValue(draftSide, rowSide, identityFields)
      if (distinguishingValue === null) continue

      matches.push({
        id: row.id,
        name: row.name,
        distinguishingValue,
        reason: classification.reason,
      })
    }

    return matches
  } catch (error) {
    // Identifiers only — never a record's contents (T-39-10).
    console.error(`${LOG_PREFIX} organization certain-match lookup failed:`, error)
    return []
  }
}

/**
 * PEOPLE: an exact, syntactically valid e-mail address.
 *
 * `isValidMatchEmail` RUNS BEFORE THE ROUND TRIP, and that ordering is the single
 * highest-leverage line in the module. Measured (39-RESEARCH B2): grouping people by exact e-mail
 * with no predicate yields 28,032 pairs, whose largest group is 212 people sharing the literal
 * value `#` — 22,366 pairs from that one value. Querying first and filtering after would fetch
 * those 212 rows on every create with a junk address, for a guaranteed empty answer.
 */
async function findCertainPersonMatches(input: CertainMatchInput): Promise<CertainMatch[]> {
  const email = input.email

  if (!isValidMatchEmail(email)) return []

  const draftSide = {
    email,
    normName: normalizePersonName(`${input.firstName ?? ""} ${input.lastName ?? ""}`),
    // The draft carries no phone into this check: phone is only ever a secondary conjunct of the
    // *likely* tier (`similarNamePhone`), and the person certain rule is decided entirely by the
    // two addresses.
    normPhone: "",
  }

  try {
    const rows = await db
      .select({
        id: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
        email: people.email,
        normName: people.normName,
        normPhone: people.normPhone,
      })
      .from(people)
      .where(
        scope(
          people.deletedAt,
          people.id,
          // `scripts/dedup-checks.sql` Part 4 probe 5, character for character:
          //   norm_email = lower(btrim(coalesce($1, '')))
          // The right-hand side spells the SAME expression `people.norm_email` is generated from,
          // applied to a bind parameter — which is why the raw address goes over untrimmed and
          // unlowered, and why nothing can drift from the index.
          eq(people.normEmail, sql`lower(btrim(coalesce(${email}, '')))`),
          input.excludeId
        )
      )
      .limit(CREATE_TIME_MATCH_LIMIT)

    const matches: CertainMatch[] = []

    for (const row of rows) {
      // Both sides are validated independently by `classifyPersonMatch`, so a junk value on either
      // side can never be promoted by a good value on the other. In practice the equality above
      // guarantees the row's address matches the (already valid) probe; running the classifier
      // anyway keeps the rule in one place instead of two.
      const classification = classifyPersonMatch(draftSide, {
        email: row.email,
        normName: row.normName ?? "",
        normPhone: row.normPhone ?? "",
      })

      if (classification === null || classification.tier !== "certain") continue

      const distinguishingValue = (row.email ?? "").trim()
      if (distinguishingValue.length === 0) continue

      matches.push({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`.trim(),
        distinguishingValue,
        reason: classification.reason,
      })
    }

    return matches
  } catch (error) {
    console.error(`${LOG_PREFIX} person certain-match lookup failed:`, error)
    return []
  }
}

/**
 * Find the *certain* duplicates of a draft record, capped at `CREATE_TIME_MATCH_LIMIT`.
 *
 * Called from the create server action on submit, before the insert commits. 39-UI-SPEC W-9 folds
 * it into the submit — there is no separate "checking for duplicates" step, because naming one
 * invites the user to think it is optional. Measured cost: the certain tier is a btree equality
 * lookup, sub-millisecond.
 *
 * `[]` means "no warning" and is also every failure mode's answer. That is the correct direction:
 * the warning is advisory and never blocking, so a duplicate check that cannot run must cost the
 * user nothing at all.
 */
export async function findCertainMatches(input: CertainMatchInput): Promise<CertainMatch[]> {
  if (input.entityType === "organization") {
    return findCertainOrganizationMatches(input)
  }

  return findCertainPersonMatches(input)
}
