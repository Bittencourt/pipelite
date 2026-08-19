/**
 * THIS MODULE IS A MIRROR, NOT THE IMPLEMENTATION.
 *
 * Every production query normalizes IN POSTGRES, through the SQL functions
 * `public.dedup_norm_org` and `public.dedup_norm_person` (created in plan 39-03), because the
 * trigram index is built on the SQL expression and a TypeScript pre-pass would make that index
 * unusable — 46,054 organizations turn a ~20s indexed scan into a ~26min sequential one.
 *
 * This file exists so the rules are unit-testable without a database, and so that "what the rule
 * IS" has a reviewable statement in the language the rest of the app is written in. It is also
 * what the create-time warning uses to normalize the single name the user just typed before
 * sending it as a bind parameter.
 *
 * Drift between the two implementations is caught, not trusted: `normalize.fixtures.ts` holds the
 * case table, this file's tests run it through TypeScript, and `scripts/dedup-checks.sql` (plan
 * 39-05) runs the SAME rows through `public.dedup_norm_org` in Postgres. A row added to one must
 * be added to the other.
 *
 * The SQL being mirrored (39-RESEARCH § The Matching Layer, item 2, measured on the live database):
 *
 *   btrim(regexp_replace(
 *     regexp_replace(
 *       regexp_replace(lower(immutable_unaccent(coalesce($1,''))), '[^a-z0-9]+', ' ', 'g'),
 *       '\m(ltda|me|epp|eireli|sa|cia|mei)\M', ' ', 'g'),
 *     '\s+', ' ', 'g'))
 *
 * Deliberately NOT reusing `src/lib/import/fuzzy-match.ts`'s private `normalize()`: it strips an
 * Anglo-American suffix list (inc/corp/ltd/llc/...), does not strip `LTDA`, and does not fold
 * accents. On this dataset it is simply the wrong function, and repointing its caller is out of
 * scope for this phase (39-RESEARCH § The `fuzzy-match.ts` collision, option 1).
 */
import {
  LEGAL_SUFFIXES,
  MIN_PERSON_NAME_LENGTH,
  MIN_PERSON_NAME_TOKENS,
  SCAN_MIN_NAME_LENGTH,
  SENTINEL_NORM_NAMES,
} from "./constants"

/** Membership test hoisted out of the hot loop; `LEGAL_SUFFIXES` is module-frozen. */
const LEGAL_SUFFIX_SET: ReadonlySet<string> = new Set(LEGAL_SUFFIXES)

/**
 * Steps (1)-(4) of the pipeline, shared by both normalizers: coalesce, lowercase, fold accents,
 * reduce every run of non-alphanumerics to a single space, then split into tokens.
 *
 * `normalize("NFD")` decomposes `á` into `a` + U+0301 and `\p{Diacritic}` then removes the
 * combining mark. That is the TypeScript stand-in for Postgres `unaccent`; it agrees with the
 * `unaccent` dictionary on every Latin-1 letter that appears in this dataset. Note it runs BEFORE
 * the `[^a-z0-9]` pass, so the stripped marks cannot leave a stray space behind.
 */
function baseTokens(input: string | null | undefined): string[] {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 0)
}

/**
 * Step (5): join the two-token sequence `s a` into the single token `sa`.
 *
 * THIS RUNS BEFORE THE SUFFIX PASS AND THE ORDER IS THE POINT. `S.A.` and `S A` both survive step
 * (4) as two separate one-letter tokens, which the suffix pass — matching whole tokens — would
 * never recognise. Joining first is what makes `UNIAO DE LOJAS LEADER S A` and
 * `Uniao de Lojas Leader S.A.` reach the same normalized string. Reverse the two steps and the
 * spaced form keeps a trailing ` s a` while the dotted form does not, so the two spellings of the
 * same company never match. `normalize.test.ts` proves this with a named case.
 *
 * The join is expressed over the TOKEN ARRAY rather than as a regex on the joined string, because
 * a regex like /s a/ would also fire inside `casas atacado` -> tokens `casas`,`atacado`. Matching
 * on whole tokens makes that impossible by construction.
 *
 * Only `s`+`a` is joined. A standalone `a` on its own is a Portuguese article and a standalone `s`
 * is a real initial; 39-RESEARCH explicitly records that the probe version which stripped either
 * of them in isolation was WRONG.
 */
function joinSpacedSA(tokens: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "s" && tokens[i + 1] === "a") {
      out.push("sa")
      i++
      continue
    }
    out.push(tokens[i])
  }
  return out
}

/**
 * Normalize an ORGANIZATION name. Mirrors `public.dedup_norm_org`.
 *
 * Full pipeline: (1) coalesce to "" (2) lowercase (3) fold accents (4) non-alphanumerics to
 * spaces (5) join `s a` -> `sa` (6) drop whole tokens in `LEGAL_SUFFIXES` (7) collapse whitespace
 * and trim — (7) falls out of joining the surviving tokens with single spaces.
 *
 * Measured: 16,763 of 46,054 organizations (36.4%) carry a suffix step (6) removes.
 */
export function normalizeOrgName(input: string | null | undefined): string {
  const tokens = joinSpacedSA(baseTokens(input))
  return tokens.filter((token) => !LEGAL_SUFFIX_SET.has(token)).join(" ")
}

/**
 * Normalize a PERSON name. Mirrors `public.dedup_norm_person`.
 *
 * The same pipeline as `normalizeOrgName` with steps (5) and (6) OMITTED, and that omission is the
 * entire reason this is a second function instead of `normalizeOrgName(x, { suffixes: false })`:
 * `Sá` is a common Brazilian surname, so the organization suffix list would turn `José de Sá` into
 * `jose de` and collide every Sá in the database with every other. A boolean flag would let a
 * caller make that mistake silently; two names cannot be confused at a call site.
 */
export function normalizePersonName(input: string | null | undefined): string {
  return baseTokens(input).join(" ")
}

/**
 * Digits only. Used to compare phone numbers without caring about `(21) 9…` vs `+55 21 9…`
 * formatting, which this dataset mixes freely.
 *
 * Note this does NOT reconcile a country prefix: `21998765432` and `5521998765432` stay different.
 * Phone is only ever a SECONDARY conjunct (`similarNamePhone`), so a false negative costs a tier,
 * never a missed pair.
 */
export function normalizePhone(input: string | null | undefined): string {
  return (input ?? "").replace(/\D/g, "")
}

/**
 * May this normalized ORGANIZATION name be compared against another one at all?
 *
 * Requires at least one token of `SCAN_MIN_NAME_LENGTH` characters, NOT merely a total length —
 * measured, 9 of 46,054 organizations normalize to initials or to nothing, and equality over those
 * turns them into one fully connected clique. A total-length test would pass `a b c` and rebuild
 * exactly that clique out of one-letter tokens.
 *
 * `""` is refused first and explicitly, because "two organizations whose names both normalize to
 * empty are the same organization" is the single most expensive wrong answer this file could give.
 */
export function isComparableOrgName(norm: string): boolean {
  if (norm.length === 0) return false
  return norm.split(" ").some((token) => token.length >= SCAN_MIN_NAME_LENGTH)
}

/**
 * May this normalized PERSON name be compared against another one at all?
 *
 * A person needs a given name AND a surname to discriminate anything: measured, `marcelo` is the
 * complete normalized name of 78 different people and `eduardo` of 71. The length floor rejects
 * two-token strings that are really initials (`a b`), and the sentinel set rejects the 559
 * occurrences of the import placeholder `nao encotrado`.
 */
export function isComparablePersonName(norm: string): boolean {
  if (norm.length < MIN_PERSON_NAME_LENGTH) return false
  if (SENTINEL_NORM_NAMES.has(norm)) return false
  return norm.split(" ").filter((token) => token.length > 0).length >= MIN_PERSON_NAME_TOKENS
}
