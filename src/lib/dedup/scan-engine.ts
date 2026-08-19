/**
 * THE DUPLICATE SCAN — DEDUP-01's second half, SC-2.
 *
 * One transaction, one temp dictionary of DISTINCT normalized names, star pairs for the exact
 * tiers and a trigram self-join over the dictionary for the fuzzy tier, upserted into
 * `duplicate_pairs` in a way that cannot resurrect a dismissal.
 *
 * ---
 * THE DESIGN, AND WHY IT IS NOT THE OBVIOUS ONE
 *
 * The dominant cost of duplicate detection on this deployment is CLIQUE EXPANSION, not similarity
 * computation. Measured against the live database (46,054 organizations, 21,503 distinct
 * normalized names, 39-RESEARCH):
 *
 *   | Approach                    | Threshold | Wall clock              | Pairs                |
 *   |-----------------------------|-----------|-------------------------|----------------------|
 *   | Row self-join               | 0.30 (pg) | ~26 min (extrapolated)  | ~14.5 M (extrapolated)|
 *   | Row self-join               | 0.85      | 67.1 s                  | 27,156               |
 *   | DISTINCT-NAME self-join     | 0.85      | 18.2 s                  | 419                  |
 *
 * The 65x collapse is NOT a precision change. It is the same pairs with the cross-products
 * removed: a 216-member name group joined against an N-member group emits 216xN
 * identical-looking pairs at the row level and exactly ONE at the name level. So the fuzzy tier
 * joins `scan_groups` to itself and never touches the entity table.
 *
 * The exact tiers use STAR PAIRING: every non-canonical member of a group pairs with the group's
 * canonical (lowest-id) record, giving `n-1` pairs instead of `n(n-1)/2`. Measured: 24,551
 * instead of 1,030,436, a 42x reduction, and it is mathematically LOSSLESS because exact
 * equality is transitive — a human who merges the group's members onto the canonical record has
 * resolved every pair the clique would have listed.
 *
 * ---
 * WHAT WAS DELIBERATELY NOT BUILT: A TOKEN-BLOCKING LAYER.
 *
 * 39-CONTEXT proposed first-token blocking as the candidate-generation strategy. It was measured
 * and it does not tame this dataset: 7,698,277 candidate pairs, a largest block of 2,307
 * (`CONDOMINIO`), and 98.6% of its comparisons sitting in blocks larger than 50 rows. THE GIN
 * TRIGRAM INDEX OVER THE DEDUPLICATED NAME DICTIONARY IS THE BLOCKING MECHANISM — 21,503 rows
 * with an index the planner uses for the `%` operator. A token-blocking layer on top of it would
 * be a second, worse blocker in front of a working one.
 *
 * If a future dataset ever does need explicit blocking, the shape to reach for is RAREST-TOKEN
 * blocking (block on each record's least frequent token, so `CONDOMINIO` stops being a block key
 * at all), not first-token. That is the fallback, and it is named here so nobody re-derives the
 * measured dead end.
 *
 * ---
 * `SET LOCAL`, NEVER A BARE `SET` (T-39-26).
 *
 * The `%` operator reads its floor from the `pg_trgm.similarity_threshold` session GUC, and this
 * app uses postgres.js with connection pooling — so assigning that GUC for the SESSION rather
 * than for the transaction leaks the floor onto whatever query runs next on the same connection.
 * The session-scoped assignment therefore appears nowhere in this file, and the plan's acceptance
 * criteria grep for its absence: phrase any future comment about it the way this one is phrased,
 * because a grep cannot tell code from prose (39-06 recorded the same lesson).
 *
 * The scan sets the floor transaction-locally, through `set_config(name, value, is_local => true)`,
 * WHICH IS EXACTLY `SET LOCAL`: GUC assignment syntax accepts a literal only, so the statement
 * form cannot carry a bound parameter, and the function form is the only way to satisfy both
 * T-39-26 and T-39-06 at once.
 *
 * BELT AND BRACES: every fuzzy comparison ALSO carries an explicit
 * `similarity(a.norm_name, b.norm_name) >= $threshold` predicate. The operator is there for index
 * access; the function is there for correctness. If the GUC were somehow not applied, the scan
 * would get slower and stay CORRECT rather than getting faster and wrong.
 *
 * ---
 * THE TIER RULES LIVE IN `scoring.ts`, NOT HERE.
 *
 * `classifyPersonMatch` and `classifyOrganizationMatch` are the single definition of what makes a
 * pair *certain* or *likely*, and every predicate below is a SQL mirror of one of their branches,
 * annotated with which. Two consequences a reader should not have to discover:
 *
 *   - `similarNamePhone` is a LIKELY reason, not a certain one. Two people sharing a normalized
 *     name and a normalized phone number is good evidence and it is not identity evidence; a
 *     false *certain* is what puts a pre-checked merge in front of an admin.
 *   - THE ORGANIZATION CERTAIN TIER DOES NOT EXIST WHEN NO IDENTITY FIELD IS CONFIGURED, and it
 *     never degrades to name-only. 39-RESEARCH measured `website` NULL on all 46,054
 *     organizations, which killed the originally locked "identical name + identical website
 *     domain" rule; the tempting repair — calling an equal normalized name *certain* on its own —
 *     was measured at 1,030,436 pairs, because 70.7% of organizations share a normalized name.
 *     An unconfigured install degrades to *likely* only, which is a documented product behaviour
 *     (39-CONTEXT § Post-Research Decisions), and the same reasoning is why the scan does not
 *     emit the equal-name-without-identity case as *likely* star pairs either: 24,551
 *     undifferentiated pairs is not a queue a human opens twice.
 *
 * ---
 * `scripts/dedup-checks.sql` PART 8 IS A MIRROR OF THE STATEMENTS BELOW.
 *
 * Part 8 runs this exact statement family against the real tables, times each phase, and EXPLAINs
 * the fuzzy self-join to prove the trigram index is chosen. CHANGING A STATEMENT HERE WITHOUT
 * CHANGING PART 8 MAKES THAT MEASUREMENT A LIE while every unit test stays green — the same parity
 * posture Part 6 has for normalization.
 *
 * ---
 * FAILURE POSTURE: THE CALLER IS FIRE-AND-FORGET.
 *
 * Plan 39-11's server action starts the scan and returns immediately, so an unhandled rejection
 * here has no owner. Every failure path sets `status: 'error'` on the scan row and resolves. Logs
 * carry the scan id, the entity type, counts and bounds — never a record's contents (T-39-10).
 *
 * This module opens no `runWithActor`: the server action owns the actor context, and the scan
 * writes no `audit_log` row.
 */

import { sql, type SQL } from "drizzle-orm"

import { db } from "@/db"

import {
  MIN_PERSON_NAME_LENGTH,
  MIN_PERSON_NAME_TOKENS,
  SCAN_MIN_NAME_LENGTH,
  SENTINEL_EMAILS,
  SENTINEL_NORM_NAMES,
} from "./constants"
import { readOrgIdentityFields, readSimilarityThreshold } from "./identity-settings"
import { isScanCancelled, updateScanState } from "./scan-state"
import type { MergeableEntityType } from "./types"

const LOG = "[dedup-scan]"

/**
 * Thrown INSIDE the transaction when the scan wrote more pairs than the entity has records, so
 * Postgres discards every pair it wrote. Pitfall 3's in-code detector.
 */
export const PAIR_COUNT_EXPLOSION = "The scan produced at least as many pairs as there are records"

/**
 * `scoring.ts`'s `MATCHABLE_EMAIL` as a POSIX regular expression.
 *
 * The TypeScript original is `/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/`. `\s` has no POSIX equivalent
 * inside a bracket expression, so it becomes `[:space:]`; everything else is character for
 * character. Deliberately NOT an RFC 5322 parser — the job is not "is this deliverable", it is
 * "is this a real value or an import placeholder".
 *
 * Measured (39-RESEARCH B2): grouping people by exact e-mail with no predicate yields 28,032
 * pairs whose largest single group is 212 people sharing the literal value `#` — that one group
 * alone is 22,366 pairs. This predicate takes the total to 5,338 with a largest group of 23.
 */
const MATCHABLE_EMAIL_POSIX = "^[^@[:space:]]+@[^@[:space:]]+\\.[a-zA-Z]{2,}$"

const SENTINEL_EMAIL_LIST: string[] = [...SENTINEL_EMAILS]
const SENTINEL_NORM_NAME_LIST: string[] = [...SENTINEL_NORM_NAMES]

/**
 * The two table aliases the organization identity comparison reads.
 *
 * `sql.raw` rather than an interpolated string: these are frozen module constants, never derived
 * from an argument, and rendering them as raw fragments keeps the emitted SQL identical to
 * `dedup-checks.sql` Part 8's text.
 */
const CANONICAL_ALIAS = sql.raw("c")
const MEMBER_ALIAS = sql.raw("o")

// ---------------------------------------------------------------------------------------
// Statement 1 — how many records are in scope.
//
// This is `total` for UI-SPEC P-1 and the right-hand side of Pitfall 3's inequality. Held in a
// frozen map keyed by the closed `MergeableEntityType` union so the table name is a compile-time
// constant and never an argument (T-39-06).
// ---------------------------------------------------------------------------------------

const ROW_COUNT: Readonly<Record<MergeableEntityType, SQL>> = Object.freeze({
  organization: sql`SELECT count(*)::int AS n FROM organizations WHERE deleted_at IS NULL`,
  person: sql`SELECT count(*)::int AS n FROM people WHERE deleted_at IS NULL`,
})

// ---------------------------------------------------------------------------------------
// Statement 2 — the name dictionary.
//
// `ON COMMIT DROP` is load-bearing, not tidiness: postgres.js pools connections, and a temp table
// that outlives its transaction makes the NEXT scan to land on the same connection fail with
// "relation scan_groups already exists". It also covers the rollback path for free.
//
// The comparability predicate is a mirror of `isComparableOrgName` / `isComparablePersonName`,
// TOKEN-WISE rather than by total length. `isComparableOrgName`'s own docstring records why: a
// total-length test passes `a b c` and rebuilds the one-letter clique the guard exists to prevent.
// Measured: 9 of 46,054 organizations normalize to initials or to nothing.
// ---------------------------------------------------------------------------------------

function groupTableStatement(entityType: MergeableEntityType): SQL {
  if (entityType === "organization") {
    return sql`
      CREATE TEMP TABLE scan_groups ON COMMIT DROP AS
      SELECT norm_name,
             min(id)       AS canonical_id,
             count(*)::int AS n
        FROM organizations
       WHERE deleted_at IS NULL
         AND norm_name <> ''
         AND EXISTS (
               SELECT 1
                 FROM unnest(string_to_array(norm_name, ' ')) AS tok
                WHERE length(tok) >= ${SCAN_MIN_NAME_LENGTH}
             )
       GROUP BY 1
    `
  }

  return sql`
    CREATE TEMP TABLE scan_groups ON COMMIT DROP AS
    SELECT norm_name,
           min(id)       AS canonical_id,
           count(*)::int AS n
      FROM people
     WHERE deleted_at IS NULL
       AND length(norm_name) >= ${MIN_PERSON_NAME_LENGTH}
       AND array_length(array_remove(string_to_array(norm_name, ' '), ''), 1) >= ${MIN_PERSON_NAME_TOKENS}
       AND norm_name <> ALL(${sql.param(SENTINEL_NORM_NAME_LIST)}::text[])
     GROUP BY 1
  `
}

/**
 * The GIN trigram index over the dictionary. THIS is the blocking mechanism — see the header.
 *
 * The index name lives in the session's temp schema, so it cannot collide with anything global
 * and it disappears with the table.
 */
const GROUP_INDEX = sql`
  CREATE INDEX scan_groups_norm_trgm_idx ON scan_groups USING gin (norm_name gin_trgm_ops)
`

/**
 * Without statistics the planner has no idea how big `scan_groups` is and will happily sequential
 * scan 21,503 rows 21,503 times. `dedup-checks.sql` Part 4a exists for the same reason on the base
 * tables, and Part 8 asserts the plan for this join names the trigram index.
 */
const GROUP_ANALYZE = sql`ANALYZE scan_groups`

/**
 * Dictionary size, plus how many records sit in a multi-member group.
 *
 * `grouped_rows` is a REAL COUNT OF RECORDS THE EXACT TIER COMPARED, which is what makes UI-SPEC
 * P-1's "{current} of {total} records compared" an honest sentence rather than an interpolated
 * percentage wearing a row count's clothes.
 */
const GROUP_STATS = sql`
  SELECT count(*)::int                                    AS groups,
         coalesce(sum(n) FILTER (WHERE n > 1), 0)::int     AS grouped_rows
    FROM scan_groups
`

// ---------------------------------------------------------------------------------------
// Statement 3 — the transaction-local trigram floor.
// ---------------------------------------------------------------------------------------

function similarityThresholdStatement(threshold: number): SQL {
  // `is_local => true` is what makes this `SET LOCAL`. See the header for why the statement form
  // is unavailable and why that is the safer trade rather than a compromise.
  return sql`SELECT set_config('pg_trgm.similarity_threshold', ${String(threshold)}, true)`
}

// ---------------------------------------------------------------------------------------
// The upsert tail every tier shares.
//
// TWO GUARDS, AND BOTH ARE MECHANISMS RATHER THAN DEFENCE:
//
//   1. `duplicate_pairs.status <> 'dismissed'` IS THE DISMISSAL-SURVIVES-A-RESCAN MECHANISM.
//      "A pair dismissed as not-a-duplicate stays dismissed across future scans" is a locked
//      functional requirement, and this conjunct plus `duplicate_pairs_uniq` plus the canonical
//      id ordering are the whole of its implementation. Remove it and the requirement is gone
//      with no error anywhere (T-39-21).
//
//   2. NO DOWNGRADE. Two people can share a valid e-mail AND a normalized name AND a normalized
//      phone, so the *certain* e-mail tier and the *likely* name+phone tier can land on the same
//      canonical pair; so can the fuzzy tier and a certain pair whose two records have different
//      names. Without this conjunct the later statement's DO UPDATE would rewrite `certain` as
//      `likely` and silently demote the strongest evidence the scan found.
//
// `status` IS NEVER WRITTEN by the DO UPDATE, which is how a `merged` or `superseded` pair keeps
// its lifecycle state through a rescan without needing its own conjunct.
// ---------------------------------------------------------------------------------------

const UPSERT_TAIL = sql`
  ON CONFLICT (entity_type, record_a_id, record_b_id) DO UPDATE
     SET tier       = excluded.tier,
         reason     = excluded.reason,
         score      = excluded.score,
         scan_id    = excluded.scan_id,
         updated_at = now()
   WHERE duplicate_pairs.status <> 'dismissed'
     AND NOT (duplicate_pairs.tier = 'certain' AND excluded.tier <> 'certain')
`

const PAIR_COLUMNS = sql.raw(
  "(id, entity_type, record_a_id, record_b_id, tier, reason, score, status, scan_id, created_at, updated_at)"
)

// ---------------------------------------------------------------------------------------
// Statement 4 — the ORGANIZATION certain tier, star-paired.
// ---------------------------------------------------------------------------------------

/**
 * `scoring.ts`'s private `readIdentityValue`, expressed in SQL.
 *
 * `jsonb_typeof(... -> $field) = 'string'` is not defensive noise — it is PARITY. The TypeScript
 * original returns `""` for any non-string JSONB value, and a bare `->>` would render the number
 * `123` as the text `'123'` and match it against another record's string `'123'`. A JSONB blob
 * legitimately holds numbers, arrays and objects for other field types and none of those is an
 * identity key.
 *
 * `lower(btrim(...))` is the same trim-then-lowercase the classifier applies, in the same order.
 */
function identityText(alias: SQL, field: string): SQL {
  return sql`lower(btrim(CASE WHEN jsonb_typeof(${alias}.custom_fields -> ${field}) = 'string' THEN ${alias}.custom_fields ->> ${field} ELSE '' END))`
}

/**
 * `firstSharedIdentity` + equality, as one CASE expression.
 *
 * "The FIRST configured field non-empty on BOTH records decides, and no later field is consulted"
 * — not "all populated fields must agree". This deployment configures `CNPJ / CPF` (11.5%
 * populated) ahead of `E-mail de Contato 1` (55.4%), and two branches of one company legitimately
 * share a contact e-mail while carrying different CNPJs. Letting the weaker field vote after the
 * stronger one has spoken would manufacture certain matches.
 *
 * `ELSE false` is the "no configured field populated on both sides" branch, which is the same
 * fail-closed answer `firstSharedIdentity` gives by returning `null`.
 */
function identityAgreement(identityFields: readonly string[]): SQL {
  const branches = identityFields.map(
    (field) => sql`
             WHEN ${identityText(CANONICAL_ALIAS, field)} <> ''
              AND ${identityText(MEMBER_ALIAS, field)} <> ''
              THEN ${identityText(CANONICAL_ALIAS, field)} = ${identityText(MEMBER_ALIAS, field)}`
  )

  return sql`CASE${sql.join(branches, sql` `)} ELSE false END`
}

/**
 * One pair per non-canonical member of every multi-member exact-name group whose identity field
 * ALSO agrees. `classifyOrganizationMatch`'s `certain` branch, star-paired.
 */
function organizationCertainStatement(
  entityType: MergeableEntityType,
  scanId: string,
  identityFields: readonly string[]
): SQL {
  return sql`
    INSERT INTO duplicate_pairs ${PAIR_COLUMNS}
    SELECT gen_random_uuid()::text,
           ${entityType},
           least(g.canonical_id, o.id), greatest(g.canonical_id, o.id),
           'certain', 'nameIdentity',
           NULL,
           'open',
           ${scanId},
           now(), now()
      FROM scan_groups g
      JOIN organizations c ON c.id = g.canonical_id
      JOIN organizations o ON o.norm_name = g.norm_name
                          AND o.deleted_at IS NULL
                          AND o.id <> g.canonical_id
     WHERE g.n > 1
       AND ${identityAgreement(identityFields)}
    ${UPSERT_TAIL}
  `
}

// ---------------------------------------------------------------------------------------
// Statement 4 — the PERSON exact tiers, star-paired. Two of them.
// ---------------------------------------------------------------------------------------

/**
 * `classifyPersonMatch` rule 1: both addresses syntactically valid and equal -> certain / email.
 *
 * The grouping key is `norm_email`, which migration 0017 generates as
 * `lower(btrim(coalesce(email, '')))` — so the sentinel comparison is already lowercased, exactly
 * as `SENTINEL_EMAILS.has(trimmed.toLowerCase())` requires, and `people_norm_email_idx` is the
 * index that serves it.
 */
function personEmailStatement(entityType: MergeableEntityType, scanId: string): SQL {
  return sql`
    WITH g AS (
      SELECT norm_email, min(id) AS canonical_id
        FROM people
       WHERE deleted_at IS NULL
         AND norm_email ~ ${MATCHABLE_EMAIL_POSIX}
         AND norm_email <> ALL(${sql.param(SENTINEL_EMAIL_LIST)}::text[])
       GROUP BY 1
      HAVING count(*) > 1
    )
    INSERT INTO duplicate_pairs ${PAIR_COLUMNS}
    SELECT gen_random_uuid()::text,
           ${entityType},
           least(g.canonical_id, p.id), greatest(g.canonical_id, p.id),
           'certain', 'email',
           NULL,
           'open',
           ${scanId},
           now(), now()
      FROM g
      JOIN people p ON p.norm_email = g.norm_email
                   AND p.deleted_at IS NULL
                   AND p.id <> g.canonical_id
    ${UPSERT_TAIL}
  `
}

/**
 * `classifyPersonMatch` rule 2: comparable equal names + equal phone -> LIKELY / similarNamePhone.
 *
 * LIKELY, NOT CERTAIN, and the tier is scoring.ts's to decide. A shared name and a shared phone
 * number is strong evidence and it is not identity evidence — one household, one switchboard and
 * one badly imported contact list all produce it.
 *
 * `norm_phone <> ''` is the conjunct that stops the ABSENCE of data promoting every same-name
 * pair in the database into this reason.
 */
function personNamePhoneStatement(entityType: MergeableEntityType, scanId: string): SQL {
  return sql`
    WITH g AS (
      SELECT norm_name, norm_phone, min(id) AS canonical_id
        FROM people
       WHERE deleted_at IS NULL
         AND norm_phone <> ''
         AND length(norm_name) >= ${MIN_PERSON_NAME_LENGTH}
         AND array_length(array_remove(string_to_array(norm_name, ' '), ''), 1) >= ${MIN_PERSON_NAME_TOKENS}
         AND norm_name <> ALL(${sql.param(SENTINEL_NORM_NAME_LIST)}::text[])
       GROUP BY 1, 2
      HAVING count(*) > 1
    )
    INSERT INTO duplicate_pairs ${PAIR_COLUMNS}
    SELECT gen_random_uuid()::text,
           ${entityType},
           least(g.canonical_id, p.id), greatest(g.canonical_id, p.id),
           'likely', 'similarNamePhone',
           NULL,
           'open',
           ${scanId},
           now(), now()
      FROM g
      JOIN people p ON p.norm_name = g.norm_name
                   AND p.norm_phone = g.norm_phone
                   AND p.deleted_at IS NULL
                   AND p.id <> g.canonical_id
    ${UPSERT_TAIL}
  `
}

// ---------------------------------------------------------------------------------------
// Statement 5 — the fuzzy tier, AT THE NAME LEVEL. The phase's biggest measured win.
// ---------------------------------------------------------------------------------------

/**
 * `scan_groups` joined to itself. The entity table is not mentioned, and that is the whole point:
 * 419 pairs in 18.2 s instead of 27,156 in 67.1 s, for the same evidence.
 *
 * `b.norm_name > a.norm_name` makes each unordered NAME pair appear exactly once, which is also
 * what guarantees no `(record_a_id, record_b_id)` key repeats WITHIN this statement — a repeat
 * would raise SQLSTATE 21000, "ON CONFLICT DO UPDATE command cannot affect row a second time".
 * The exact tiers get the same guarantee from each record belonging to exactly one group.
 */
function fuzzyStatement(
  entityType: MergeableEntityType,
  scanId: string,
  threshold: number
): SQL {
  return sql`
    INSERT INTO duplicate_pairs ${PAIR_COLUMNS}
    SELECT gen_random_uuid()::text,
           ${entityType},
           least(a.canonical_id, b.canonical_id), greatest(a.canonical_id, b.canonical_id),
           'likely', 'similarName',
           similarity(a.norm_name, b.norm_name),
           'open',
           ${scanId},
           now(), now()
      FROM scan_groups a
      JOIN scan_groups b
        ON b.norm_name % a.norm_name
       AND b.norm_name > a.norm_name
       AND similarity(a.norm_name, b.norm_name) >= ${threshold}
    ${UPSERT_TAIL}
  `
}

// ---------------------------------------------------------------------------------------
// Statement 6 — Pitfall 3.
// ---------------------------------------------------------------------------------------

function pairCountStatement(entityType: MergeableEntityType): SQL {
  return sql`SELECT count(*)::int AS n FROM duplicate_pairs WHERE entity_type = ${entityType}`
}

// ---------------------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------------------

/** A `tx.execute` handle. Narrowed to what this module uses so the tests can supply one. */
interface Executor {
  execute: (statement: SQL) => Promise<unknown>
}

function firstNumber(rows: unknown, key: string): number {
  const list = rows as Record<string, unknown>[] | undefined
  const raw = list?.[0]?.[key]
  if (typeof raw === "number") return raw
  // `count(*)` is `bigint`, which postgres.js returns as a string unless it is cast. Every count
  // above is cast to `int`; this is the belt for a driver that decides otherwise.
  if (typeof raw === "string") {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * Run a full duplicate scan for one entity type.
 *
 * NEVER REJECTS. The caller is a fire-and-forget server action (plan 39-11), which has nowhere to
 * put a rejection; every failure ends as `status: 'error'` on the scan row, which is what the
 * poller renders.
 *
 * Progress and the terminal status are written through `updateScanState`, which uses the
 * MODULE-LEVEL `db` rather than the transaction handle. That is deliberate and necessary: a
 * progress row written inside the scan's transaction is invisible to the polling client until the
 * transaction commits, which is precisely when the progress stops mattering.
 */
export async function runDuplicateScan(
  scanId: string,
  entityType: MergeableEntityType
): Promise<void> {
  try {
    // Both settings are read BEFORE the transaction opens: neither is part of the statement
    // family Part 8 mirrors, and holding a transaction open across an unrelated round trip is
    // lock time nobody asked for.
    const threshold = await readSimilarityThreshold()
    const identityFields =
      entityType === "organization" ? await readOrgIdentityFields() : null

    const outcome = await db.transaction(async (tx) => {
      const executor = tx as unknown as Executor

      // ---- 1. Scope -----------------------------------------------------------------
      const rowCount = firstNumber(await executor.execute(ROW_COUNT[entityType]), "n")

      // ---- 2. The name dictionary --------------------------------------------------
      await executor.execute(groupTableStatement(entityType))
      await executor.execute(GROUP_INDEX)
      await executor.execute(GROUP_ANALYZE)

      const stats = await executor.execute(GROUP_STATS)
      const groupCount = firstNumber(stats, "groups")
      // Clamped: `grouped_rows` cannot honestly exceed the scanned row count, and a `current`
      // above `total` would push UI-SPEC P-1's bar past its own track.
      const comparedRows = Math.min(firstNumber(stats, "grouped_rows"), rowCount)

      console.log(
        `${LOG} ${entityType} scan ${scanId}: ${rowCount} record(s), ${groupCount} distinct normalized name(s)`
      )
      await updateScanState(scanId, { current: 0, total: rowCount })

      // ---- 3. The trigram floor, transaction-locally --------------------------------
      await executor.execute(similarityThresholdStatement(threshold))

      // ---- 4. The exact tiers, star-paired -----------------------------------------
      if (entityType === "organization") {
        // `null` and `[]` both mean UNCONFIGURED, and unconfigured means NO certain tier. Never a
        // name-only fallback — see the header.
        if (identityFields !== null && identityFields.length > 0) {
          await executor.execute(
            organizationCertainStatement(entityType, scanId, identityFields)
          )
        } else {
          console.log(
            `${LOG} ${entityType} scan ${scanId}: no identity field configured, so no certain tier`
          )
        }
      } else {
        await executor.execute(personEmailStatement(entityType, scanId))
        await executor.execute(personNamePhoneStatement(entityType, scanId))
      }

      await updateScanState(scanId, { current: comparedRows, total: rowCount })

      // ---- 5. Cancellation, BETWEEN the tiers --------------------------------------
      // The expensive half is the fuzzy join, so this is the poll that can actually save time.
      // `isScanCancelled` reads through the module-level `db`, i.e. a connection that can see a
      // cancel another request committed while this transaction has been open.
      if (await isScanCancelled(scanId)) {
        console.log(`${LOG} ${entityType} scan ${scanId} cancelled before the fuzzy tier`)
        assertPairCount(await executor.execute(pairCountStatement(entityType)), rowCount, scanId)
        return "cancelled" as const
      }

      // ---- 6. The fuzzy tier, at the name level ------------------------------------
      await executor.execute(fuzzyStatement(entityType, scanId, threshold))

      // ---- 7. Pitfall 3, BEFORE the commit ----------------------------------------
      assertPairCount(await executor.execute(pairCountStatement(entityType)), rowCount, scanId)

      await updateScanState(scanId, { current: rowCount, total: rowCount })

      return "completed" as const
    })

    // The terminal status is written AFTER the transaction resolves. Writing it inside would
    // report `completed` over a connection that cannot know whether the commit succeeded.
    await updateScanState(scanId, { status: outcome })
    console.log(`${LOG} ${entityType} scan ${scanId} ${outcome}`)
  } catch (error) {
    // Identifiers and counts only (T-39-10).
    console.error(`${LOG} ${entityType} scan ${scanId} failed:`, error)
    await updateScanState(scanId, { status: "error" })
  }
}

/**
 * PITFALL 3. A scan may never write more pairs than the entity has records.
 *
 * That single inequality is the whole detector, and it is violated the instant a clique join
 * sneaks into either tier: star pairing gives 24,551 organization pairs where clique pairing
 * gives 1,030,436, against 46,054 rows. Throwing here rather than logging is the point — the
 * throw happens inside the transaction, so Postgres discards every pair the run wrote instead of
 * committing a review queue nobody can work through. `dedup-checks.sql` Parts 7 and 8 assert the
 * same inequality against the live data.
 */
function assertPairCount(rows: unknown, rowCount: number, scanId: string): void {
  const pairCount = firstNumber(rows, "n")
  if (pairCount >= rowCount) {
    console.error(
      `${LOG} scan ${scanId}: ${pairCount} pair(s) against ${rowCount} record(s) — rolling back`
    )
    throw new Error(PAIR_COUNT_EXPLOSION)
  }
}
