/**
 * Tunable constants for duplicate detection.
 *
 * Every value here is either a product decision recorded in 39-CONTEXT.md / 39-UI-SPEC.md, or a
 * match-quality guard measured against THIS deployment's live database on 2026-08-18 (39-RESEARCH).
 * The measured ones are annotated with the number that justifies them, because a guard whose
 * motivation is lost is a guard the next reader deletes as defensive noise.
 */

/**
 * Brazilian legal-entity suffixes stripped from ORGANIZATION names only.
 *
 * Source: 39-RESEARCH § The Matching Layer, item 2 — the same seven alternatives as the SQL
 * function `public.dedup_norm_org`: '\m(ltda|me|epp|eireli|sa|cia|mei)\M'.
 * Measured: 16,763 of 46,054 organizations (36.4%) carry one, so this step is load-bearing rather
 * than cosmetic — without it more than a third of real duplicates never come within trigram range.
 *
 * NOT applied to person names: `Sa` is a common Brazilian surname. See `normalizePersonName`.
 */
export const LEGAL_SUFFIXES: readonly string[] = Object.freeze([
  "ltda",
  "me",
  "epp",
  "eireli",
  "sa",
  "cia",
  "mei",
])

/**
 * Default `pg_trgm` similarity floor for the *likely* tier.
 *
 * Source: 39-RESEARCH, sampled by eye across the 0.85-0.92 band; 39-VALIDATION A8 records that this
 * has no scored ground truth on this dataset, which is precisely why it is surfaced as an
 * `app_settings` value later in the phase rather than frozen into a query. This constant is the
 * fallback used when that setting is absent.
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.85

/**
 * Shortest token that can make a normalized name comparable at all.
 *
 * Measured: 9 of 46,054 organizations normalize to a string with no token this long (initials,
 * punctuation-only names). Those nine must never be reported as duplicates OF EACH OTHER — with a
 * naive `length >= 1` guard they collapse into a single clique. See `isComparableOrgName`.
 */
export const SCAN_MIN_NAME_LENGTH = 3

/**
 * A person name needs at least a given name and a surname to discriminate anything.
 *
 * Measured: normalized `marcelo` occurs 78 times and `eduardo` 71 times as a COMPLETE person name.
 * Single-token names are therefore not evidence of anything and are refused outright.
 */
export const MIN_PERSON_NAME_TOKENS = 2

/** Companion length floor to `MIN_PERSON_NAME_TOKENS`, so `a b` is not treated as two real tokens. */
export const MIN_PERSON_NAME_LENGTH = 5

/** How many create-time matches the warning may list before it truncates. Source: 39-UI-SPEC W-8. */
export const CREATE_TIME_MATCH_LIMIT = 5

/** Pairs per page on `/duplicates`. Source: 39-UI-SPEC L-9. */
export const PAIR_PAGE_SIZE = 25

/**
 * Placeholder addresses that are syntactically valid and semantically meaningless.
 *
 * ADDITIVE MATCH-QUALITY GUARD, MEASURED — NOT A PRODUCT RULE. Measured on this deployment:
 * `teste@gmail.com` is shared by 23 people and `teste@teste.com` by 16, the two largest groups that
 * survive the syntactic e-mail predicate. Left in, each becomes a fully connected clique of
 * "certain" duplicates. Any deployment-specific junk value found later belongs in this set; nothing
 * about the algorithm changes when it grows.
 *
 * `ReadonlySet` rather than `Object.freeze`: freezing a Set does not disable `.add()`, so the type
 * is the only real guard here.
 */
export const SENTINEL_EMAILS: ReadonlySet<string> = new Set(["teste@teste.com", "teste@gmail.com"])

/**
 * Normalized person names that are import placeholders rather than names.
 *
 * ADDITIVE MATCH-QUALITY GUARD, MEASURED — NOT A PRODUCT RULE. Measured: the normalized string
 * `nao encotrado` (sic — the misspelling is in the source data) occurs 559 times. The correctly
 * spelled `nao encontrado` is listed alongside it so a later import of clean data is covered too.
 */
export const SENTINEL_NORM_NAMES: ReadonlySet<string> = new Set([
  "nao encotrado",
  "nao encontrado",
])
