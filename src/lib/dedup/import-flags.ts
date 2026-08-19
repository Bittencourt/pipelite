/**
 * THE FLAGGED-ROW COUNT FOR A FINISHED IMPORT — DEDUP-01's importer half.
 *
 * ---
 * THE IMPORTER GETS A REPORT, NOT A PROMPT. THAT IS A LOCKED DECISION, AND THIS FILE IS ITS SHAPE.
 *
 * 39-CONTEXT locks the importer as NON-INTERACTIVE. An import of 25,206 rows cannot stop to ask
 * about each match, so matched rows are imported as new records and the completion summary reports
 * HOW MANY of them look like duplicates, with a link to `/duplicates`. That is why this module
 * returns a `number` and not a list: the count plus a link is the whole report (39-UI-SPEC I-4).
 * A function here that returned pairs would invite a UI that lists them, and an import of
 * thousands can flag hundreds.
 * ---
 * WHICH IDENTIFIER EACH IMPORTER CAN SUPPLY (read during execution, recorded here because the
 * answer is not obvious and the wrong assumption yields a count that is silently always zero)
 *
 *   CSV importer, `src/app/import/actions.ts`
 *     - `batchInsert` (line 64) inserts with `.returning()` and hands back the written rows, so
 *       `importOrganizations` (line 280) and `importPeople` (line 413) HAVE THE IDS IN HAND.
 *     - It creates NO `import_sessions` row, so it passes `importSessionId: null` on its one audit
 *       row (lines 257 / 304, with the reason stated there: the audit column is a real foreign key
 *       and there would be no parent to point at).
 *     => it uses the `{ recordIds }` shape.
 *
 *   Pipedrive importer, `src/lib/import/pipedrive-api-import-actions.ts`
 *     - `importId` IS an `import_sessions` primary key and IS written to
 *       `audit_log.import_session_id` (line 311 / 375).
 *     - But that is ONE summary row per run, whose `entity_type` is `'import_session'`
 *       (lines 336-376). Per-record audit rows were rejected on measured cost — 25,206 CRM events
 *       would become 25,206 trigger evaluations — and the file says so explicitly.
 *     - Its inserts also use `.returning()` (line 746), so it too HAS THE IDS IN HAND.
 *     => it uses the `{ recordIds }` shape as well.
 *
 * The `{ importSessionId }` shape below therefore resolves ids from `audit_log` PER-RECORD rows
 * (`action = 'created'` with a CRM `entity_type`), which no producer writes today. It is
 * implemented, tested and correct, and it returns 0 — with no per-record query — for every real
 * session. It exists so that the day per-record provenance lands, nothing here has to change.
 * DO NOT WIRE A SUMMARY TO THAT SHAPE expecting a non-zero number.
 * ---
 * THE WORK IS BOUNDED, AND THE BOUND IS THE POINT (T-39-38)
 *
 * One query per imported record is the obvious implementation and it is the one that must not
 * exist: a 25,206-row import would issue 25,206 round trips inside a request that has already
 * finished doing the user's actual work. So ids are chunked into batches of
 * `IMPORT_FLAG_BATCH_SIZE`, each batch costs at most TWO queries (its own rows, then the
 * candidates sharing their identity), the candidate fetch is capped ON THE QUERY at
 * `IMPORT_FLAG_CANDIDATE_LIMIT`, and the total number of ids considered is capped at
 * `IMPORT_FLAG_MAX_RECORDS`. Worst case is therefore
 * `2 * ceil(IMPORT_FLAG_MAX_RECORDS / IMPORT_FLAG_BATCH_SIZE)` = 100 queries, whatever the size of
 * the import.
 *
 * Hitting the cap UNDER-reports. That is the right direction: the notice is advisory and points at
 * a scan that will find everything anyway.
 * ---
 * NOTHING HERE THROWS (S-5). A count that fails must not turn a successful import into a reported
 * failure — the rows are already in the database, and the same reasoning is written out at the
 * importers' own swallowed audit writes. A rejection logs `[dedup-import-flags]` with identifiers
 * and counts only (T-39-10) and returns 0, which renders as no notice at all.
 * ---
 * THE TIER DECISION IS NOT MADE HERE. `scoring.ts` decides, exactly as in `matching.ts`: the
 * queries narrow candidates and the pure classifiers post-filter, so the importer's notion of a
 * duplicate cannot drift from the background scan's.
 */

import { and, eq, inArray, isNull, type SQL } from "drizzle-orm"

import { db } from "@/db"
import { auditLog, organizations, people } from "@/db/schema"

import { readOrgIdentityFields } from "./identity-settings"
import { isComparableOrgName } from "./normalize"
import {
  classifyOrganizationMatch,
  classifyPersonMatch,
  isValidMatchEmail,
  type OrganizationMatchSide,
} from "./scoring"
import type { MergeableEntityType } from "./types"

const LOG_PREFIX = "[dedup-import-flags]"

/** Ids per batch. One batch costs at most two queries, whatever it contains. */
export const IMPORT_FLAG_BATCH_SIZE = 100

/**
 * Rows a single candidate fetch may pull.
 *
 * Not defensive. Measured: 70.7% of the 46,054 organizations share a normalized name with at least
 * one other, so a batch of 100 imported rows can point at a candidate set far larger than itself.
 */
export const IMPORT_FLAG_CANDIDATE_LIMIT = 2000

/**
 * The most ids one count will consider.
 *
 * A 25,206-row import stops being interesting long before this: once the number is in the
 * hundreds the user is going to run a scan regardless, and the scan — not this — is the surface
 * built to be exhaustive.
 */
export const IMPORT_FLAG_MAX_RECORDS = 5000

/**
 * Either the session that created the records, or the ids themselves.
 *
 * A union rather than two exported functions, because the caller is an import summary and both
 * importers reach it through the same component; one entry point means the notice cannot end up
 * wired to a different contract on each of the two completion screens (39-UI-SPEC I-1).
 */
export type CountFlaggedImportedRecordsInput = { entityType: MergeableEntityType } & (
  | { importSessionId: string; recordIds?: undefined }
  | { recordIds: readonly string[]; importSessionId?: undefined }
)

/**
 * The shared visibility predicate, composed once.
 *
 * `deleted_at IS NULL` is the whole of the rule and the reason is the same one `matching.ts`
 * states at length: `/organizations` and `/people` are not owner-scoped, so this count reveals
 * nothing about records the user cannot already read off a list page (T-39-05). IF EITHER LIST
 * PAGE EVER BECOMES OWNER-SCOPED, BOTH MODULES MUST CHANGE TOGETHER.
 *
 * `matching.ts` has a private helper of the same shape. It is duplicated rather than imported
 * because `matching.ts` belongs to plan 39-08 and this plan does not edit another plan's files;
 * the two are three lines each and the binding comment above is what keeps them honest.
 */
function scope(deletedAt: Parameters<typeof isNull>[0], match: SQL): SQL {
  return and(isNull(deletedAt), match) as SQL
}

/** Split ids into batches, applying the total cap first. */
function batched(recordIds: readonly string[]): string[][] {
  const capped = recordIds.slice(0, IMPORT_FLAG_MAX_RECORDS)
  const batches: string[][] = []
  for (let i = 0; i < capped.length; i += IMPORT_FLAG_BATCH_SIZE) {
    batches.push(capped.slice(i, i + IMPORT_FLAG_BATCH_SIZE))
  }
  return batches
}

/**
 * The ids of the records an import session created, from `audit_log`.
 *
 * See the header: no producer writes per-record rows today, so this returns `[]` in practice. The
 * one query it costs is issued once per count, not once per record.
 */
async function resolveSessionRecordIds(
  entityType: MergeableEntityType,
  importSessionId: string
): Promise<string[]> {
  const rows = await db
    .select({ entityId: auditLog.entityId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.importSessionId, importSessionId),
        eq(auditLog.action, "created"),
        eq(auditLog.entityType, entityType)
      )
    )
    // One more than the cap so a truncated resolution is still capped by `batched()` rather than
    // silently pulling an unbounded id list across the wire.
    .limit(IMPORT_FLAG_MAX_RECORDS + 1)

  return rows.map((row) => row.entityId)
}

/**
 * How many of these organizations have at least one CERTAIN duplicate?
 *
 * Certain = equal normalized name AND an equal admin-configured identity custom-field value. The
 * caller has already established that the identity key is configured; without it there is no
 * certain tier at all and no query is worth issuing.
 */
async function countFlaggedOrganizations(
  batch: readonly string[],
  identityFields: readonly string[]
): Promise<number> {
  const projection = {
    id: organizations.id,
    normName: organizations.normName,
    customFields: organizations.customFields,
  }

  const imported = await db
    .select(projection)
    .from(organizations)
    .where(scope(organizations.deletedAt, inArray(organizations.id, [...batch])))
    .limit(IMPORT_FLAG_BATCH_SIZE)

  // Only names that can be compared at all. Measured: 9 of 46,054 organizations normalize to
  // initials or to nothing, and equality over those collapses them into one clique — the exact
  // reason `isComparableOrgName` exists. A batch with none of them costs no candidate query.
  const comparable = imported.filter((row) => isComparableOrgName(row.normName ?? ""))
  const names = [...new Set(comparable.map((row) => row.normName as string))]
  if (names.length === 0) return 0

  const candidates = await db
    .select(projection)
    .from(organizations)
    .where(scope(organizations.deletedAt, inArray(organizations.normName, names)))
    .limit(IMPORT_FLAG_CANDIDATE_LIMIT)

  const byName = new Map<string, typeof candidates>()
  for (const candidate of candidates) {
    const key = candidate.normName ?? ""
    const group = byName.get(key)
    if (group) group.push(candidate)
    else byName.set(key, [candidate])
  }

  let flagged = 0

  for (const row of comparable) {
    const side: OrganizationMatchSide = {
      normName: row.normName ?? "",
      customFields: row.customFields,
    }
    const group = byName.get(row.normName as string) ?? []

    const hasCertainMatch = group.some((candidate) => {
      // SELF-EXCLUSION. The candidate set legitimately contains the imported row — it shares its
      // own normalized name and its own identity value — so without this line EVERY imported
      // record is flagged and the notice reports the size of the import instead of its duplicates.
      // This is the `excludeId` semantics of `findCertainMatches`, applied in memory because the
      // exclusion is per-row and the query is per-batch.
      if (candidate.id === row.id) return false

      const classification = classifyOrganizationMatch(
        side,
        { normName: candidate.normName ?? "", customFields: candidate.customFields },
        identityFields
      )
      return classification !== null && classification.tier === "certain"
    })

    if (hasCertainMatch) flagged += 1
  }

  return flagged
}

/** The TypeScript mirror of `people.norm_email`'s generation expression: `lower(btrim(email))`. */
function normalizedEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

/**
 * How many of these people have at least one CERTAIN duplicate?
 *
 * Certain = an exact, syntactically valid, non-sentinel e-mail address on BOTH sides.
 * `isValidMatchEmail` runs BEFORE the candidate query for the reason `matching.ts` measures at
 * length: 212 people share the literal value `#`, and fetching that group for a guaranteed empty
 * answer is the single most expensive mistake available here.
 */
async function countFlaggedPeople(batch: readonly string[]): Promise<number> {
  const projection = {
    id: people.id,
    email: people.email,
    normName: people.normName,
    normPhone: people.normPhone,
  }

  const imported = await db
    .select(projection)
    .from(people)
    .where(scope(people.deletedAt, inArray(people.id, [...batch])))
    .limit(IMPORT_FLAG_BATCH_SIZE)

  const qualifying = imported.filter((row) => isValidMatchEmail(row.email))
  const probes = [...new Set(qualifying.map((row) => normalizedEmail(row.email)))]
  if (probes.length === 0) return 0

  const candidates = await db
    .select(projection)
    .from(people)
    .where(
      scope(
        people.deletedAt,
        // The equality is on the GENERATED COLUMN, matching `scripts/dedup-checks.sql` Part 4
        // probe 5's shape so `people_norm_email_idx` stays usable. The probes are already
        // normalized in TypeScript here rather than in SQL, because `IN` over a list cannot wrap
        // each element in the generation expression — the values go over as bind parameters
        // either way (T-39-06).
        inArray(people.normEmail, probes)
      )
    )
    .limit(IMPORT_FLAG_CANDIDATE_LIMIT)

  const byEmail = new Map<string, typeof candidates>()
  for (const candidate of candidates) {
    const key = normalizedEmail(candidate.email)
    const group = byEmail.get(key)
    if (group) group.push(candidate)
    else byEmail.set(key, [candidate])
  }

  let flagged = 0

  for (const row of qualifying) {
    const group = byEmail.get(normalizedEmail(row.email)) ?? []

    const hasCertainMatch = group.some((candidate) => {
      // SELF-EXCLUSION — see the organization branch. Same reason, same consequence.
      if (candidate.id === row.id) return false

      const classification = classifyPersonMatch(
        { email: row.email, normName: row.normName ?? "", normPhone: row.normPhone ?? "" },
        {
          email: candidate.email,
          normName: candidate.normName ?? "",
          normPhone: candidate.normPhone ?? "",
        }
      )
      return classification !== null && classification.tier === "certain"
    })

    if (hasCertainMatch) flagged += 1
  }

  return flagged
}

/**
 * How many of the records this import created look like duplicates of something already there?
 *
 * Returns a count of RECORDS, not of pairs: a record with three certain matches counts once,
 * because the notice's sentence is "N imported records look like duplicates" and a pair count
 * would overstate it.
 *
 * `0` means "no notice" and is also every failure mode's answer — an unconfigured organization
 * identity key, an empty id list, a rejected query, a capped-out import. That is the correct
 * direction for an advisory line on a screen whose actual news is that the import succeeded.
 */
export async function countFlaggedImportedRecords(
  input: CountFlaggedImportedRecordsInput
): Promise<number> {
  const { entityType } = input

  try {
    // READ THE SETTING FIRST, BEFORE ANY QUERY. An unconfigured identity key means organizations
    // have no certain tier, so nothing can be flagged and the whole count must cost nothing — not
    // even the id resolution. Same posture, and the same asymmetry, as `matching.ts`.
    let identityFields: readonly string[] | null = null
    if (entityType === "organization") {
      identityFields = await readOrgIdentityFields()
      if (identityFields === null) return 0
    }

    const recordIds =
      input.recordIds !== undefined
        ? input.recordIds
        : await resolveSessionRecordIds(entityType, input.importSessionId)

    let flagged = 0

    for (const batch of batched(recordIds)) {
      flagged +=
        entityType === "organization"
          ? await countFlaggedOrganizations(batch, identityFields as readonly string[])
          : await countFlaggedPeople(batch)
    }

    return flagged
  } catch (error) {
    // Identifiers and counts only — never a record's name, e-mail or custom-field value (T-39-10).
    // `error` is the driver's own message and carries no row contents.
    console.error(
      `${LOG_PREFIX} flagged-import count failed for entityType=${entityType}; reporting 0:`,
      error instanceof Error ? error.message : error
    )
    return 0
  }
}
