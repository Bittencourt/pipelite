/**
 * Confidence-tier classification: given two already-normalized records, is this pair *certain*,
 * *likely*, or not a pair at all?
 *
 * PURE. No database access, no settings read, no SQL construction — the admin's identity-field
 * list arrives as an argument (read and zod-validated by `src/lib/dedup/identity-settings.ts` in
 * plan 39-08) precisely so this file can be exhaustively unit-tested and so that a tampered
 * setting cannot reach a query through here (T-39-06, T-39-11).
 *
 * The tiers are asymmetric on purpose. A FALSE *certain* is expensive: it is what puts a
 * pre-checked merge in front of an admin. A false *likely* only costs a row in a review queue.
 * Every rule below therefore fails closed.
 */
import { SENTINEL_EMAILS } from "./constants"
import { isComparableOrgName, isComparablePersonName } from "./normalize"
import type { DedupReason, DedupTier } from "./types"

export interface DedupClassification {
  tier: DedupTier
  reason: DedupReason
}

/** One side of a person comparison. `normName`/`normPhone` come from `./normalize`. */
export interface PersonMatchSide {
  email: string | null | undefined
  normName: string
  normPhone: string
}

/**
 * One side of an organization comparison.
 *
 * `customFields` is the entity's JSONB blob, which this codebase keys by the field definition's
 * HUMAN NAME rather than by its id — so `identityFields` below is a list of labels, and a label
 * is what gets looked up here. Nothing is de-duplicated at this level: this deployment has two
 * definitions both named `Segmento Organização`, and reconciling that belongs at the field-list
 * build site (plan 39-15), not in a pure comparison function.
 */
export interface OrganizationMatchSide {
  normName: string
  customFields: Record<string, unknown> | null | undefined
}

const CERTAIN_EMAIL: DedupClassification = Object.freeze({ tier: "certain", reason: "email" })
const CERTAIN_NAME_IDENTITY: DedupClassification = Object.freeze({
  tier: "certain",
  reason: "nameIdentity",
})
const LIKELY_SIMILAR_NAME: DedupClassification = Object.freeze({
  tier: "likely",
  reason: "similarName",
})
const LIKELY_SIMILAR_NAME_PHONE: DedupClassification = Object.freeze({
  tier: "likely",
  reason: "similarNamePhone",
})

/**
 * Syntactic shape of an address that is allowed to make a match *certain*.
 *
 * Local part and domain both non-empty and free of whitespace, and a dotted TLD of at least two
 * letters. Deliberately NOT an RFC 5322 parser — the job is not "is this deliverable", it is
 * "is this a real value or an import placeholder".
 */
const MATCHABLE_EMAIL = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/

/**
 * May this e-mail address be used as a certain-tier identity key?
 *
 * THIS PREDICATE IS THE SINGLE HIGHEST-LEVERAGE LINE IN THE MATCHING LAYER, not defensive polish.
 * Measured on the live database (39-RESEARCH B2): grouping people by exact e-mail with no
 * predicate yields 28,032 pairs, whose largest single group is 212 people all sharing the literal
 * value `#`; that one group alone is 22,366 pairs. Applying the syntactic test drops the total to
 * 5,338 pairs with a largest group of 23 — a 5.25x precision improvement, and the difference
 * between a review queue a human can work through and one nobody will ever open.
 *
 * The sentinel rejection then removes the two values that survive the syntax test and still mean
 * nothing (`teste@gmail.com` x23, `teste@teste.com` x16). Compared lowercased, because the same
 * placeholder appears in mixed case.
 */
export function isValidMatchEmail(email: string | null | undefined): boolean {
  if (email === null || email === undefined) return false
  const trimmed = email.trim()
  if (!MATCHABLE_EMAIL.test(trimmed)) return false
  return !SENTINEL_EMAILS.has(trimmed.toLowerCase())
}

/**
 * Classify a candidate PERSON pair.
 *
 * Rules are evaluated in this order and the FIRST hit wins:
 *   1. both addresses valid and equal          -> certain / email
 *   2. comparable equal names + equal phone    -> likely  / similarNamePhone
 *   3. comparable equal names                  -> likely  / similarName
 *   4. otherwise                               -> null
 *
 * `people.email` is a real column on this schema (unlike `organizations.website`, which is NULL on
 * every row), which is why the person side keeps a genuine certain tier while the organization
 * side had to be redesigned around configurable custom fields.
 */
export function classifyPersonMatch(
  a: PersonMatchSide,
  b: PersonMatchSide
): DedupClassification | null {
  // Both sides are validated independently, so a junk value on either side can never be promoted
  // by a good value on the other.
  if (isValidMatchEmail(a.email) && isValidMatchEmail(b.email)) {
    const emailA = (a.email ?? "").trim().toLowerCase()
    const emailB = (b.email ?? "").trim().toLowerCase()
    if (emailA === emailB) return CERTAIN_EMAIL
  }

  const namesMatch =
    isComparablePersonName(a.normName) &&
    isComparablePersonName(b.normName) &&
    a.normName === b.normName

  if (!namesMatch) return null

  // Two absent phones are not an agreement. Without the non-empty test, every name pair in the
  // database would be promoted to the higher `similarNamePhone` reason by the absence of data.
  if (a.normPhone.length > 0 && a.normPhone === b.normPhone) return LIKELY_SIMILAR_NAME_PHONE

  return LIKELY_SIMILAR_NAME
}

/**
 * Read one identity custom-field value, trimmed and lowercased, or `""` if it is absent.
 *
 * Non-string values yield `""`: a JSONB blob can legitimately hold a number, an array or an
 * object for other field types, and none of those is an identity key. Coercing them with
 * `String(v)` would turn two unrelated `{}` values into the matching string `[object Object]`.
 */
function readIdentityValue(side: OrganizationMatchSide, field: string): string {
  const raw = side.customFields?.[field]
  if (typeof raw !== "string") return ""
  return raw.trim().toLowerCase()
}

/**
 * The FIRST configured field that is non-empty on BOTH records decides, and no later field is
 * consulted.
 *
 * "First populated on both" rather than "all populated must agree": this deployment configures
 * `CNPJ / CPF` (11.5% populated) ahead of `E-mail de Contato 1` (55.4%), and two branches of one
 * company legitimately share a contact e-mail while carrying different CNPJs. Letting the weaker
 * field vote after the stronger one has already spoken would manufacture certain matches.
 *
 * Returns `null` when no configured field is populated on both sides — which INCLUDES the case of
 * no configured fields at all.
 */
function firstSharedIdentity(
  a: OrganizationMatchSide,
  b: OrganizationMatchSide,
  identityFields: readonly string[]
): { a: string; b: string } | null {
  for (const field of identityFields) {
    const valueA = readIdentityValue(a, field)
    const valueB = readIdentityValue(b, field)
    if (valueA.length === 0 || valueB.length === 0) continue
    return { a: valueA, b: valueB }
  }
  return null
}

/**
 * Classify a candidate ORGANIZATION pair.
 *
 * `identityFields` is the ordered list of custom-field LABELS an admin nominated as identity keys.
 *
 * WHEN `identityFields` IS EMPTY THERE IS NO CERTAIN TIER AT ALL, AND THE CODE NEVER FALLS BACK TO
 * NAME-ONLY. This is the load-bearing decision of the whole organization side (39-CONTEXT
 * § Post-Research Decisions). The original locked rule was "identical normalized name + identical
 * website domain"; `website` was then measured NULL on all 46,054 rows, so that rule can never
 * fire. The tempting repair — drop the second conjunct and call an equal name "certain" — was
 * measured at **1,030,436 pairs**, because 70.7% of organizations share a normalized name. An
 * unconfigured install therefore degrades gracefully to *likely* only, and that is a documented
 * product behaviour rather than a gap.
 *
 * Certain requires name AND identity, never identity alone: one CNPJ covers every branch of a
 * company, and those branches are separate organizations.
 */
export function classifyOrganizationMatch(
  a: OrganizationMatchSide,
  b: OrganizationMatchSide,
  identityFields: readonly string[]
): DedupClassification | null {
  const namesMatch =
    isComparableOrgName(a.normName) && isComparableOrgName(b.normName) && a.normName === b.normName

  if (!namesMatch) return null

  // No identity configuration => no positive identity evidence => no certain tier. Stated as its
  // own branch rather than left to `firstSharedIdentity` returning null, so the rule is legible at
  // the one place a reader looks for it. (Both paths fail closed; this is belt and braces on the
  // most expensive wrong answer in the phase.)
  if (identityFields.length === 0) return LIKELY_SIMILAR_NAME

  const identity = firstSharedIdentity(a, b, identityFields)
  if (identity !== null && identity.a === identity.b) return CERTAIN_NAME_IDENTITY

  return LIKELY_SIMILAR_NAME
}
