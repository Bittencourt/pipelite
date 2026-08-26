/**
 * =============================================================================
 * purge-blobs.db.test.ts — SEC-04 / ROADMAP SC-2, PROVEN BEHAVIOURALLY
 * =============================================================================
 *
 * Four entity types, real bytes on a real disk, a real purge through the real dispatch, and a
 * storage failure injected on purpose so the commit can be watched surviving it.
 *
 * ## WHY THIS PROOF MANUFACTURES ITS OWN SUBJECT
 *
 * Measured against the running `pipelite` database on **2026-08-26** and re-measured in plan 49-01
 * Task 1 rather than inherited from research:
 *
 *   - `custom_field_definitions` holds **169 live rows** — 62 `text`, 56 `multi_select`,
 *     28 `single_select`, 12 `number`, 11 `date` — and **zero of `type='file'`**.
 *   - Across all four CRM tables (**188,619 rows**) **zero records carry a stored file
 *     descriptor**, on the `%storedName%` probe AND on the `%publicUrl%` probe that research named
 *     as the cheapest follow-up and never ran.
 *   - `/app/uploads` inside the application container is **empty**.
 *
 * So a purge test that reaches for existing data finds no blobs, deletes nothing, and passes on an
 * empty set — before the fix and after it. That is not a weak test, it is a test that cannot fail.
 * Every subject below is therefore minted by this file: four `type='file'` definitions through plan
 * 49-01's `mintFieldDefinition`, four soft-deleted records carrying real descriptors, and real
 * bytes written to a real directory. The pre-flight describe asserts the ref lists are NON-EMPTY
 * before any "the blob is gone" assertion is allowed to mean anything.
 *
 * The four minted definitions are FIXTURE FAITHFULNESS, not a load-bearing dependency, and saying
 * so is the honest form: neither `collectFileFieldRefs` nor the file route reads
 * `custom_field_definitions` — both walk the JSONB by shape, deliberately, so that a blob whose
 * definition was soft-deleted or retyped is still found. The definitions exist because a record
 * carrying a file value for a field that was never defined is a subject the product could not have
 * produced, and a proof about an impossible record proves nothing about a real one.
 *
 * ## WHY THE DELETION IS POST-COMMIT, AND WHY THAT IS THE CRITERION
 *
 * SC-2 is not "the blob is deleted". It is "the blob is deleted, AND a storage failure during that
 * deletion leaves the purge committed". Those are two claims and the second is the load-bearing
 * one, because it is the one that decides where the code goes. A deletion inside the transaction is
 * an irreversible `unlink` that a later rollback cannot undo; a throw after the transaction reports
 * a purge that DID happen as a failure, and the operator retries a delete that already succeeded
 * while the record stays visible as un-purged.
 *
 * So the injected-failure cell below asserts in this order, deliberately: the returned result is
 * `{ success: true, detached: N }`, **then** the row is gone from the database by direct SQL,
 * **then** the mismatch was logged. The row being gone is the criterion. The log is the evidence.
 * Reversing those two would make a test that passes when the purge rolled back but logged nicely.
 *
 * ## WHY `PurgeResult` IS NOT WIDENED
 *
 * The mismatch could have been returned instead of logged. It is not, because `PurgeResult` is
 * declared once (`src/lib/trash/dispatch.ts:51-53`) and read by **eleven exact
 * `toEqual({ success: true, detached: N })` assertions** — `activities.test.ts:878,898`;
 * `deals.test.ts:1011,1095,1127`; `organizations.test.ts:968,1010,1063`;
 * `people.test.ts:936,996,1017`. SC-2's criterion is a log line, not a return value, so the shape
 * stays put and every cell here asserts the result with `toEqual` rather than `toMatchObject`:
 * an accidentally widened result is a red HERE as well as in those four files.
 *
 * `detached` is asserted per cell with a named literal, but this file is not the proof of the
 * detach counts — those eleven assertions are. What the `toEqual` carries here is the KEY SET.
 *
 * ## SCOPE: `FILE_STORAGE` LOCAL, AND NO CLAIM BEYOND IT
 *
 * `FILE_STORAGE` is unset in this deployment, which means `'local'` (measured, plan 49-01 (e)).
 * `deleteEntityFiles` has an S3 branch and it is mock-covered by plan 49-02's unit file, but no
 * bucket is configured anywhere this phase can reach, so **nothing in this file is evidence about
 * the S3 blob case. That is SEC-49-A, it is owned separately, and it is not claimed here.** The
 * configuration is asserted in the pre-flight describe rather than assumed, because under `s3`
 * every local `existsSync` assertion below would pass for the wrong reason.
 *
 * ## PLACEMENT: A SIBLING, NOT A `__tests__/` DIRECTORY
 *
 * `49-VALIDATION.md` prescribed `src/lib/trash/__tests__/purge-blobs.db.test.ts`. Overridden, and
 * stated rather than done quietly: `src/lib/trash/` has **no** `__tests__/` directory and all of its
 * existing tests are siblings of the modules they cover (`prune.test.ts`, `dispatch.test.ts`,
 * `present.test.ts`, `collect-file-field-refs.test.ts`, `delete-entity-files.test.ts`, …). Adding a
 * `__tests__/` directory for one file introduces a second convention inside one module, which is a
 * worse outcome than departing from a validation document. The helpers are imported relatively
 * (`./collect-file-field-refs`), matching those siblings.
 *
 * ## NO SOURCE-TEXT ASSERTIONS
 *
 * Not one `toContain` over any file read from disk, and specifically none over `prune.ts`'s prose.
 * A comment that explains a rule contains the rule; fifteen gates in this project have gone green
 * by matching their own explanatory prose. The proof is a purge invocation, a returned object, an
 * `existsSync`, a direct SQL count and a parsed log line.
 *
 * ## HOW TO RUN IT
 *   docker compose up -d
 *   bash scripts/dedup-db-test-setup.sh
 *   ./node_modules/.bin/vitest run --config vitest.db.config.ts src/lib/trash/purge-blobs.db.test.ts
 *
 * It runs against `pipelite_dedup_test`, never `pipelite`. The guard below re-derives the host AND
 * the database name from the connection string and throws at MODULE SCOPE, so a wrong target aborts
 * collection before a single statement is sent. That matters more here than almost anywhere else in
 * the repository: this file HARD DELETES rows and IRREVERSIBLY UNLINKS real files.
 * =============================================================================
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { unlink } from "fs/promises"
import path from "path"

import { like, sql } from "drizzle-orm"
import { NextRequest } from "next/server"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The session the file route runs as. Declared through `vi.hoisted` so the `@/auth` factory can
 * reach it. `@/auth` is the ONLY module mocked in this file: `auth()` reads an Auth.js JWT out of
 * request headers and an in-process handler call has none, so supplying the session is what makes
 * the caller's identity a known input. `@/db` is not mocked. `fs` is not mocked — the purge's
 * `unlink` is real, which is the entire point. Nothing that decides the outcome under test is
 * substituted.
 */
const authState = vi.hoisted(() => ({ userId: "" }))

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: authState.userId } })),
}))

/**
 * THE UPLOAD DIRECTORY, ASSIGNED BEFORE THE STATIC IMPORTS ARE EVALUATED — AND THIS IS A
 * CORRECTION TO THIS PLAN'S OWN TEXT.
 *
 * The plan says to point `process.env.UPLOAD_DIR` at a `mkdtempSync` directory in `beforeAll`, and
 * notes that no `vi.hoisted` gymnastics are needed because plan 49-02 made `deleteEntityFiles` read
 * the variable at CALL TIME. That half is true, and it is why the purge path needs no help. But
 * this file also drives the file download route to prove the URL goes dark, and
 * `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:14` is
 * `const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads'` — a MODULE-LEVEL read. A `beforeAll`
 * assignment arrives after that module has been evaluated and has no effect on it, so the route
 * would resolve `/tmp/uploads`, find nothing there, and answer 404 to the POSITIVE ANCHOR. The
 * anchor would fail against correct code, and the 404-after-purge assertion beside it would pass
 * for the wrong reason. So the assignment happens in `vi.hoisted`, which runs before the static
 * imports, and the pre-flight describe then ASSERTS the route really resolved this directory by
 * serving a file out of it rather than trusting that it did.
 *
 * NOT `mkdtempSync`, for the reason plan 49-06 measured: inside a hoisted factory the static
 * imports have not run, so reaching `mkdtempSync` means a bare `require("fs")`, which this
 * repository's eslint config makes an ERROR (`@typescript-eslint/no-require-imports`). The property
 * `mkdtempSync` provides is collision-freedom, and it is PRESERVED rather than assumed: the
 * creation below is a NON-recursive `mkdirSync` on the leaf, so a name that already exists throws
 * `EEXIST` and aborts collection instead of silently sharing a directory with another process.
 */
const uploadEnv = vi.hoisted(() => {
  const parent = process.env.TMPDIR ?? "/tmp"
  const dir = `${parent}/purgeblob-uploads-${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
  process.env.UPLOAD_DIR = dir
  return { dir }
})

import { db } from "@/db"
import {
  activities,
  activityTypes,
  auditLog,
  deals,
  notes,
  organizations,
  people,
  pipelines,
  stages,
  users,
} from "@/db/schema"
import type { EntityType } from "@/db/schema/custom-fields"

import { GET } from "@/app/api/files/[entityId]/[fieldName]/[filename]/route"
import {
  mintFieldDefinition,
  removeFieldDefinitions,
} from "@/lib/__tests__/custom-field-definition-fixture"

import { mergeRecordsMutation } from "@/lib/mutations/dedup"

import { collectFileFieldRefs } from "./collect-file-field-refs"
import { purgeRecordByType } from "./dispatch"

/* ---------------------------------------------------------------------------
 * The environment guard — module scope, so a wrong target aborts collection.
 * ------------------------------------------------------------------------ */

const TEST_DATABASE = "pipelite_dedup_test"
/** The development database, named here only so it can be refused BY NAME. */
const DEV_DATABASE = "pipelite"

function assertIsolatedConnection(connectionString: string | undefined): string {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set for the db vitest project. It is derived from E2E_DATABASE_URL " +
        `by vitest.db.config.ts and must name the isolated ${TEST_DATABASE} database. ` +
        "Run `npm run test:db`, which provisions it first.",
    )
  }

  const url = new URL(connectionString)

  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error(
      `refusing to run: connection host "${url.hostname}" is not loopback. ` +
        "This suite PURGES rows and IRREVERSIBLY UNLINKS real files.",
    )
  }

  const database = url.pathname.replace(/^\//, "")

  if (database !== TEST_DATABASE) {
    throw new Error(
      `refusing to run: connection names database "${database}", not "${TEST_DATABASE}". ` +
        (database === DEV_DATABASE
          ? `"${DEV_DATABASE}" is the DEVELOPMENT database and holds 46,054 organizations, ` +
            "38,348 people, 25,195 deals and 79,022 activities of real CRM data. This suite " +
            "PURGES records permanently; it must never be pointed at it. "
          : "") +
        "Run `npm run test:db`.",
    )
  }

  return connectionString
}

assertIsolatedConnection(process.env.DATABASE_URL)

/**
 * The upload root, created NON-recursively so a collision is an error rather than a silent share.
 * See the `vi.hoisted` comment above for why the name was built there and the directory here.
 */
const UPLOAD_ROOT = uploadEnv.dir
mkdirSync(UPLOAD_ROOT)

/** The fallback `route.ts:14` uses when `UPLOAD_DIR` is unset — named so it can be RULED OUT. */
const DEFAULT_UPLOAD_DIR = "/tmp/uploads"

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------ */

/** One prefix on every id. No `_` and no `%`, so no LIKE escaping is needed. */
const PREFIX = "purgeblob-"
const LIKE_PREFIX = `${PREFIX}%`

const USER = `${PREFIX}user`
const PIPELINE = `${PREFIX}pipeline`
const STAGE = `${PREFIX}stage`
const ACTIVITY_TYPE = `${PREFIX}type`

/** The four PURGE SUBJECTS. Each is soft-deleted, so `purge{Entity}Mutation` accepts it. */
const ORG = `${PREFIX}org`
const PERSON = `${PREFIX}person`
const DEAL = `${PREFIX}deal`
const ACTIVITY = `${PREFIX}activity`

/**
 * The four NEIGHBOURS — same entity type, LIVE, never purged, each with its own blob under its own
 * field directory. They are the barrier for T-49-07-10: a purge that deleted the field directory
 * rather than the record's own blobs would take these with it. Each is also the detach target that
 * makes its subject's `detached` count a non-zero named literal instead of a constant 0.
 */
const ORG_NEIGHBOUR = `${PREFIX}org-neighbour`
const PERSON_NEIGHBOUR = `${PREFIX}person-neighbour`
const DEAL_NEIGHBOUR = `${PREFIX}deal-neighbour`
const ACTIVITY_NEIGHBOUR = `${PREFIX}activity-neighbour`

/**
 * CR-02 — THE MERGE PAIR. Two LIVE organizations, each with its own blob under its own `entityId`
 * directory, used by the "a merge must not re-home a descriptor without its bytes" describe below.
 *
 * They are a separate pair rather than a reuse of the subjects because a merge needs BOTH records
 * live, and `restoreFixtureRows` keeps every subject soft-deleted so the purges can accept them.
 * Flipping a subject's `deleted_at` for one describe is the shape of fixture reuse that
 * `crm-ownership.db.test.ts:348-395` measured five cascaded reds from.
 */
const MERGE_SURVIVOR = `${PREFIX}merge-survivor`
const MERGE_LOSER = `${PREFIX}merge-loser`

/**
 * One file field per entity type, each with its own name so a red transcript names one entity
 * unambiguously. Spaces and an accent are deliberate: that is what this deployment's file fields
 * are actually called, and the name is interpolated into a filesystem path AND into a URL segment.
 * No forward slash in any of them — a `/` cannot round-trip through the three-segment file route.
 */
const FIELD_ORG = "Anexos Ação"
const FIELD_PERSON = "Documento Pessoal"
const FIELD_DEAL = "Contrato Assinado"
const FIELD_ACTIVITY = "Comprovante"

/**
 * `storedName`s in exactly the shape `src/app/api/upload/route.ts:59-62` mints —
 * `${crypto.randomUUID()}${path.extname(original)}`. Fixed rather than random so a red transcript
 * names the same file twice.
 */
const STORED_ORG_MAIN = "3f1c0d4e-6b21-4f77-a0aa-000000000101.pdf"
/** The ORGANIZATION'S SECOND BLOB. This is the barrier in the injected-failure cell. */
const STORED_ORG_SECOND = "3f1c0d4e-6b21-4f77-a0aa-000000000102.pdf"
const STORED_PERSON = "3f1c0d4e-6b21-4f77-a0aa-000000000103.pdf"
const STORED_DEAL = "3f1c0d4e-6b21-4f77-a0aa-000000000104.pdf"
const STORED_ACTIVITY = "3f1c0d4e-6b21-4f77-a0aa-000000000105.pdf"
const STORED_ORG_NEIGHBOUR = "3f1c0d4e-6b21-4f77-a0aa-000000000201.pdf"
const STORED_PERSON_NEIGHBOUR = "3f1c0d4e-6b21-4f77-a0aa-000000000202.pdf"
const STORED_DEAL_NEIGHBOUR = "3f1c0d4e-6b21-4f77-a0aa-000000000203.pdf"
const STORED_ACTIVITY_NEIGHBOUR = "3f1c0d4e-6b21-4f77-a0aa-000000000204.pdf"
/** CR-02's pair. Distinct names so a red transcript can attribute a surviving file to one side. */
const STORED_MERGE_SURVIVOR = "3f1c0d4e-6b21-4f77-a0aa-000000000301.pdf"
const STORED_MERGE_LOSER = "3f1c0d4e-6b21-4f77-a0aa-000000000302.pdf"

/**
 * Distinct contents per file, so a served body can be attributed to ONE specific record. A body
 * assertion against identical bytes would be satisfied by the wrong file.
 */
function bytesFor(label: string): Buffer {
  return Buffer.from(`${PREFIX}${label}: real bytes, written to a real disk by this fixture.\n`)
}

interface SeededBlob {
  readonly entityId: string
  readonly fieldName: string
  readonly storedName: string
  readonly bytes: Buffer
}

/** Every file this suite puts on disk, subjects and neighbours together. */
const SEEDED_BLOBS: readonly SeededBlob[] = Object.freeze([
  { entityId: ORG, fieldName: FIELD_ORG, storedName: STORED_ORG_MAIN, bytes: bytesFor("ORG-MAIN") },
  {
    entityId: ORG,
    fieldName: FIELD_ORG,
    storedName: STORED_ORG_SECOND,
    bytes: bytesFor("ORG-SECOND"),
  },
  { entityId: PERSON, fieldName: FIELD_PERSON, storedName: STORED_PERSON, bytes: bytesFor("PERSON") },
  { entityId: DEAL, fieldName: FIELD_DEAL, storedName: STORED_DEAL, bytes: bytesFor("DEAL") },
  {
    entityId: ACTIVITY,
    fieldName: FIELD_ACTIVITY,
    storedName: STORED_ACTIVITY,
    bytes: bytesFor("ACTIVITY"),
  },
  {
    entityId: ORG_NEIGHBOUR,
    fieldName: FIELD_ORG,
    storedName: STORED_ORG_NEIGHBOUR,
    bytes: bytesFor("ORG-NEIGHBOUR"),
  },
  {
    entityId: PERSON_NEIGHBOUR,
    fieldName: FIELD_PERSON,
    storedName: STORED_PERSON_NEIGHBOUR,
    bytes: bytesFor("PERSON-NEIGHBOUR"),
  },
  {
    entityId: DEAL_NEIGHBOUR,
    fieldName: FIELD_DEAL,
    storedName: STORED_DEAL_NEIGHBOUR,
    bytes: bytesFor("DEAL-NEIGHBOUR"),
  },
  {
    entityId: ACTIVITY_NEIGHBOUR,
    fieldName: FIELD_ACTIVITY,
    storedName: STORED_ACTIVITY_NEIGHBOUR,
    bytes: bytesFor("ACTIVITY-NEIGHBOUR"),
  },
  // CR-02's pair. Each blob sits under its OWN record's directory, which is where
  // `upload/route.ts:92-101` puts it — that is the whole premise the merge was breaking.
  {
    entityId: MERGE_SURVIVOR,
    fieldName: FIELD_ORG,
    storedName: STORED_MERGE_SURVIVOR,
    bytes: bytesFor("MERGE-SURVIVOR"),
  },
  {
    entityId: MERGE_LOSER,
    fieldName: FIELD_ORG,
    storedName: STORED_MERGE_LOSER,
    bytes: bytesFor("MERGE-LOSER"),
  },
])

/**
 * THE NUMBERS THIS PROOF TURNS ON — every one a NAMED LITERAL, declared once and consumed by BOTH
 * the seed and the assertions so the two cannot drift.
 *
 * The floors are not decoration. Plan 49-01's R4 is the concrete argument: with its named-integer
 * floor removed, its suite went 14/14 GREEN against the very condition the floor exists to catch,
 * and with the floor restored it was the ONLY cell that reddened. Here the condition is worse than
 * a planted row — it is an EMPTY ref list, which is exactly what the live database would hand this
 * file. `collectFileFieldRefs` returning `[]` makes "every blob this record referenced is gone"
 * vacuously true, so each entity type's ref count is asserted against its literal FIRST.
 */
const ORG_REF_COUNT = 2
const PERSON_REF_COUNT = 1
const DEAL_REF_COUNT = 1
const ACTIVITY_REF_COUNT = 1
const SEEDED_SUBJECT_BLOBS = 5
const SEEDED_NEIGHBOUR_BLOBS = 4
/** CR-02's pair, one blob each. */
const SEEDED_MERGE_BLOBS = 2
const SEEDED_BLOB_TOTAL = 11
const SEEDED_FILE_DEFINITIONS = 4

/**
 * The detach counts, per subject. Three of the four are non-zero on purpose: a `detached` that was
 * always 0 would make the per-cell `toEqual` unable to tell a correct count from a missing one. The
 * activity's 0 is the value `activities.ts:504` spells as a LITERAL, which is why it is the one
 * subject with no detach target.
 */
const ORG_DETACHED = 1
const PERSON_DETACHED = 1
const DEAL_DETACHED = 1
const ACTIVITY_DETACHED = 0

/**
 * The injected failure's arithmetic, pinned rather than expressed as an inequality.
 * `deleted < expected` alone would be satisfied by a deletion that deleted NOTHING — which is
 * precisely the pre-fix state — so the shortfall is a named 1 and the survivor count is a named 1.
 */
const SABOTAGED_REF_COUNT = 1
const ORG_DELETED_UNDER_SABOTAGE = ORG_REF_COUNT - SABOTAGED_REF_COUNT

/** When each subject was trashed. A fixed instant, restored by direct SQL before every cell. */
const TRASHED_AT = new Date("2026-01-15T12:00:00.000Z")
/** `activities.due_date` is NOT NULL. */
const DUE_DATE = new Date("2026-02-01T12:00:00.000Z")

/** The absolute path the purge — and the route — will resolve for these three segments. */
function blobPath(entityId: string, fieldName: string, storedName: string): string {
  return path.join(UPLOAD_ROOT, entityId, fieldName, storedName)
}

/**
 * A stored descriptor in exactly the shape `src/app/api/upload/route.ts:102-110` writes and
 * `FileItem` (`src/components/custom-fields/file-field.tsx:14-22`) declares. `path` is the ABSOLUTE
 * local path in that shape and `publicUrl` is the download URL — both faithful, so nothing about
 * this fixture is a convenience. `collectFileFieldRefs` deliberately ignores the stored `path` and
 * rebuilds it from the three segments; seeding a faithful one is what makes that a real choice
 * rather than an untested claim.
 */
function descriptor(entityId: string, fieldName: string, storedName: string, bytes: Buffer) {
  return {
    id: storedName.replace(/\.[^.]+$/, ""),
    filename: `${PREFIX}original name.pdf`,
    storedName,
    path: blobPath(entityId, fieldName, storedName),
    publicUrl: `/api/files/${entityId}/${fieldName}/${storedName}`,
    size: bytes.byteLength,
    mimeType: "application/pdf",
  }
}

/** The organization carries TWO descriptors under ONE field — the injected-failure cell's barrier. */
const CUSTOM_FIELDS_ORG = {
  [FIELD_ORG]: [
    descriptor(ORG, FIELD_ORG, STORED_ORG_MAIN, bytesFor("ORG-MAIN")),
    descriptor(ORG, FIELD_ORG, STORED_ORG_SECOND, bytesFor("ORG-SECOND")),
  ],
}
const CUSTOM_FIELDS_PERSON = {
  [FIELD_PERSON]: [descriptor(PERSON, FIELD_PERSON, STORED_PERSON, bytesFor("PERSON"))],
}
const CUSTOM_FIELDS_DEAL = {
  [FIELD_DEAL]: [descriptor(DEAL, FIELD_DEAL, STORED_DEAL, bytesFor("DEAL"))],
}
const CUSTOM_FIELDS_ACTIVITY = {
  [FIELD_ACTIVITY]: [
    descriptor(ACTIVITY, FIELD_ACTIVITY, STORED_ACTIVITY, bytesFor("ACTIVITY")),
  ],
}
const CUSTOM_FIELDS_ORG_NEIGHBOUR = {
  [FIELD_ORG]: [
    descriptor(ORG_NEIGHBOUR, FIELD_ORG, STORED_ORG_NEIGHBOUR, bytesFor("ORG-NEIGHBOUR")),
  ],
}
const CUSTOM_FIELDS_PERSON_NEIGHBOUR = {
  [FIELD_PERSON]: [
    descriptor(
      PERSON_NEIGHBOUR,
      FIELD_PERSON,
      STORED_PERSON_NEIGHBOUR,
      bytesFor("PERSON-NEIGHBOUR"),
    ),
  ],
}
const CUSTOM_FIELDS_DEAL_NEIGHBOUR = {
  [FIELD_DEAL]: [
    descriptor(DEAL_NEIGHBOUR, FIELD_DEAL, STORED_DEAL_NEIGHBOUR, bytesFor("DEAL-NEIGHBOUR")),
  ],
}
const CUSTOM_FIELDS_ACTIVITY_NEIGHBOUR = {
  [FIELD_ACTIVITY]: [
    descriptor(
      ACTIVITY_NEIGHBOUR,
      FIELD_ACTIVITY,
      STORED_ACTIVITY_NEIGHBOUR,
      bytesFor("ACTIVITY-NEIGHBOUR"),
    ),
  ],
}

/* ---------------------------------------------------------------------------
 * CR-02's pair, and the two shapes it is proven against
 * ------------------------------------------------------------------------ */

/**
 * A NON-file value the merge really does adopt from the loser, so "the file did not move" cannot be
 * satisfied by a merge in which NOTHING moved.
 *
 * `website` is a plain nullable `text` column on `organizations` and is not in
 * `MERGE_EXCLUDED_COLUMNS`, so with the survivor's empty and the loser's populated it lands in
 * `filledOnly`, whose default is the LOSER. That is the same group, the same default and the same
 * write path the file value takes — which is exactly why it is the right anchor: if `website`
 * arrives on the survivor and `Anexos Ação` does not, the exclusion is what stopped it and not a
 * broken fixture.
 */
const MERGE_LOSER_WEBSITE = "https://loser.example.test"

/** The loser's file value. One descriptor, named so a red transcript can attribute the bytes. */
const CUSTOM_FIELDS_MERGE_LOSER = {
  [FIELD_ORG]: [
    descriptor(MERGE_LOSER, FIELD_ORG, STORED_MERGE_LOSER, bytesFor("MERGE-LOSER")),
  ],
}
/** The survivor's OWN file value, for the explicit-choice cell. */
const CUSTOM_FIELDS_MERGE_SURVIVOR = {
  [FIELD_ORG]: [
    descriptor(MERGE_SURVIVOR, FIELD_ORG, STORED_MERGE_SURVIVOR, bytesFor("MERGE-SURVIVOR")),
  ],
}

/**
 * Named-integer floors for the pair. One descriptor per side, asserted BEFORE the merge in both
 * cells: with zero descriptors, "the survivor does not reference the loser's blob" and "the
 * survivor's own bytes survived" are both vacuously true, and zero is exactly what the live
 * database holds.
 */
const MERGE_LOSER_REF_COUNT = 1
const MERGE_SURVIVOR_REF_COUNT = 1
/** What a purge of the loser must return: an organization with no children detaches nothing. */
const MERGE_LOSER_DETACHED = 0

/**
 * Which `customFields` each seeded record carries, and which blob paths belong to it. One table,
 * consumed by the seed, by the restore and by every cell, so a subject's ref list and its files
 * cannot disagree.
 */
interface Subject {
  readonly entityType: EntityType
  readonly id: string
  readonly fieldName: string
  readonly customFields: Record<string, unknown>
  readonly refCount: number
  readonly detached: number
  readonly storedNames: readonly string[]
  readonly neighbourId: string
  readonly neighbourStoredName: string
  /**
   * The neighbour's exact bytes.
   *
   * Carried here so the barrier can assert BYTE EQUALITY rather than a non-zero length, and that is
   * not a style preference — `src/lib/__tests__/suite-timing-hygiene.test.ts` flagged the
   * `toBeGreaterThan(0)` this replaced. Its taint analysis is RIGHT: `blobPath` derives from
   * `UPLOAD_ROOT`, which derives from the `Date.now()` in the `vi.hoisted` directory name, so a
   * THRESHOLD matcher over a path-derived value is clock-derived by its rules. That gate's house
   * rule is "assert the property instead — assert exactly", never weaken the gate, and here the
   * property actually worth asserting is stronger anyway: the neighbour's bytes are UNCHANGED, not
   * merely present. A truncated-but-non-empty neighbour file would have passed the old form.
   */
  readonly neighbourBytes: Buffer
}

const SUBJECTS: readonly Subject[] = Object.freeze([
  {
    entityType: "organization",
    id: ORG,
    fieldName: FIELD_ORG,
    customFields: CUSTOM_FIELDS_ORG,
    refCount: ORG_REF_COUNT,
    detached: ORG_DETACHED,
    storedNames: [STORED_ORG_MAIN, STORED_ORG_SECOND],
    neighbourId: ORG_NEIGHBOUR,
    neighbourStoredName: STORED_ORG_NEIGHBOUR,
    neighbourBytes: bytesFor("ORG-NEIGHBOUR"),
  },
  {
    entityType: "person",
    id: PERSON,
    fieldName: FIELD_PERSON,
    customFields: CUSTOM_FIELDS_PERSON,
    refCount: PERSON_REF_COUNT,
    detached: PERSON_DETACHED,
    storedNames: [STORED_PERSON],
    neighbourId: PERSON_NEIGHBOUR,
    neighbourStoredName: STORED_PERSON_NEIGHBOUR,
    neighbourBytes: bytesFor("PERSON-NEIGHBOUR"),
  },
  {
    entityType: "deal",
    id: DEAL,
    fieldName: FIELD_DEAL,
    customFields: CUSTOM_FIELDS_DEAL,
    refCount: DEAL_REF_COUNT,
    detached: DEAL_DETACHED,
    storedNames: [STORED_DEAL],
    neighbourId: DEAL_NEIGHBOUR,
    neighbourStoredName: STORED_DEAL_NEIGHBOUR,
    neighbourBytes: bytesFor("DEAL-NEIGHBOUR"),
  },
  {
    entityType: "activity",
    id: ACTIVITY,
    fieldName: FIELD_ACTIVITY,
    customFields: CUSTOM_FIELDS_ACTIVITY,
    refCount: ACTIVITY_REF_COUNT,
    detached: ACTIVITY_DETACHED,
    storedNames: [STORED_ACTIVITY],
    neighbourId: ACTIVITY_NEIGHBOUR,
    neighbourStoredName: STORED_ACTIVITY_NEIGHBOUR,
    neighbourBytes: bytesFor("ACTIVITY-NEIGHBOUR"),
  },
])

/** The `custom_field_definitions` ids, one `type='file'` definition per entity type. */
const DEFINITION_IDS = Object.freeze({
  organization: `${PREFIX}def-org`,
  person: `${PREFIX}def-person`,
  deal: `${PREFIX}def-deal`,
  activity: `${PREFIX}def-activity`,
})

/* ---------------------------------------------------------------------------
 * Table bookkeeping
 * ------------------------------------------------------------------------ */

const TOUCHED_TABLES = [
  "users",
  "pipelines",
  "stages",
  "activity_types",
  "organizations",
  "people",
  "deals",
  "activities",
  "notes",
  "custom_field_definitions",
  "audit_log",
] as const

/**
 * How a leftover fixture row is RECOGNISED, per table.
 *
 * Not a shared `id like 'purgeblob-%'`. `audit_log.id` and `notes.id` are generated UUIDs, so an
 * id-prefix check on either would report zero no matter how many rows leaked — a vacuous half of
 * the very assertion that exists to catch a leak. Both are recognised by their fixture LINKS
 * instead. `audit_log` is scoped on `entity_id` AND `actor_user_id`, which is what the plan
 * specifies and what catches a row written by the purge's own audit insert.
 *
 * The FOREIGN-KEY columns are included alongside `id` on every CRM table, because a purge MUTATES
 * a live neighbour (that is what `detached` counts) and an id-prefix sweep cannot see a row whose
 * only fixture link is a foreign key it now holds.
 */
const LEFTOVER_PREDICATE: Record<(typeof TOUCHED_TABLES)[number], ReturnType<typeof sql>> = {
  users: sql`id like ${LIKE_PREFIX}`,
  pipelines: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX}`,
  stages: sql`id like ${LIKE_PREFIX} or pipeline_id like ${LIKE_PREFIX}`,
  activity_types: sql`id like ${LIKE_PREFIX}`,
  organizations: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX}`,
  people: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX} or organization_id like ${LIKE_PREFIX}`,
  deals: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX} or stage_id like ${LIKE_PREFIX} or organization_id like ${LIKE_PREFIX} or person_id like ${LIKE_PREFIX}`,
  activities: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX} or type_id like ${LIKE_PREFIX} or deal_id like ${LIKE_PREFIX}`,
  notes: sql`entity_id like ${LIKE_PREFIX} or author_id like ${LIKE_PREFIX}`,
  custom_field_definitions: sql`id like ${LIKE_PREFIX}`,
  audit_log: sql`entity_id like ${LIKE_PREFIX} or actor_user_id like ${LIKE_PREFIX}`,
}

/** Totals before the run, re-asserted afterwards: a prefix query cannot see a MUTATED row. */
const baseline: Record<string, number> = {}

async function countAll(table: string): Promise<number> {
  const rows = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`)

  return Number((rows as unknown as { n: number }[])[0].n)
}

async function countLeftovers(table: (typeof TOUCHED_TABLES)[number]): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from ${sql.identifier(table)} where ${LEFTOVER_PREDICATE[table]}`,
  )

  return Number((rows as unknown as { n: number }[])[0].n)
}

/** How many rows of `table` carry the fixture prefix in `id`. Used for row-gone assertions. */
async function countById(table: string, id: string): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from ${sql.identifier(table)} where id = ${id}`,
  )

  return Number((rows as unknown as { n: number }[])[0].n)
}

/** Is this row soft-deleted, by direct SQL? `null` when the row is absent. */
async function readDeletedAt(table: string, id: string): Promise<string | null | undefined> {
  const rows = (await db.execute(
    sql`select deleted_at from ${sql.identifier(table)} where id = ${id}`,
  )) as unknown as { deleted_at: string | null }[]

  return rows.length === 0 ? undefined : rows[0].deleted_at
}

/** The table each entity type's row lives in — for the direct-SQL row-gone assertions. */
const TABLE_FOR: Record<EntityType, string> = {
  organization: "organizations",
  person: "people",
  deal: "deals",
  activity: "activities",
}

async function removeFixtures(): Promise<void> {
  // Foreign-key order, read leaf-first. Audit and note rows first: they reference the records they
  // describe and the users they attribute. Then activities (→ deals, activity_types, users), deals
  // (→ stages, organizations, people, users), people (→ organizations, users), organizations
  // (→ users), stages (→ pipelines), pipelines (→ users), activity_types, definitions, users.
  // Reversing any two of these is a 23503 at teardown, not a silent leak.
  await db.delete(auditLog).where(like(auditLog.entityId, LIKE_PREFIX))
  await db.delete(auditLog).where(like(auditLog.actorUserId, LIKE_PREFIX))
  await db.delete(notes).where(like(notes.entityId, LIKE_PREFIX))
  await db.delete(notes).where(like(notes.authorId, LIKE_PREFIX))
  await db.delete(activities).where(like(activities.id, LIKE_PREFIX))
  await db.delete(activities).where(like(activities.dealId, LIKE_PREFIX))
  await db.delete(activities).where(like(activities.typeId, LIKE_PREFIX))
  await db.delete(deals).where(like(deals.id, LIKE_PREFIX))
  await db.delete(deals).where(like(deals.stageId, LIKE_PREFIX))
  await db.delete(deals).where(like(deals.organizationId, LIKE_PREFIX))
  await db.delete(deals).where(like(deals.personId, LIKE_PREFIX))
  await db.delete(people).where(like(people.id, LIKE_PREFIX))
  await db.delete(people).where(like(people.organizationId, LIKE_PREFIX))
  await db.delete(organizations).where(like(organizations.id, LIKE_PREFIX))
  await db.delete(organizations).where(like(organizations.ownerId, LIKE_PREFIX))
  await db.delete(stages).where(like(stages.id, LIKE_PREFIX))
  await db.delete(pipelines).where(like(pipelines.id, LIKE_PREFIX))
  await db.delete(activityTypes).where(like(activityTypes.id, LIKE_PREFIX))
  await removeFieldDefinitions(LIKE_PREFIX)
  await db.delete(users).where(like(users.id, LIKE_PREFIX))
}

/**
 * Put every seeded file back on disk with its original contents.
 *
 * `rmSync(..., { recursive: true, force: true })` FIRST, and that is not tidiness. The injected
 * failure below turns a blob PATH into a DIRECTORY — research option (A), the seam plan 49-01
 * executed at uid 1000 and uid 0 — and `writeFileSync` over a directory raises `EISDIR`. Without
 * this removal the run AFTER the sabotage cell dies in `beforeEach` rather than in a test body,
 * which is the cascade plan 49-01 measured: a sabotage that breaks the restore turns one red cell
 * into a whole file that cannot collect.
 */
function writeSeededBlobs(): void {
  for (const blob of SEEDED_BLOBS) {
    const target = blobPath(blob.entityId, blob.fieldName, blob.storedName)
    mkdirSync(path.dirname(target), { recursive: true })
    rmSync(target, { recursive: true, force: true })
    writeFileSync(target, blob.bytes)
  }
}

/**
 * PUT EVERY FIXTURE ROW AND EVERY BYTE BACK, BEFORE EVERY CELL — and this restore is heavier than
 * most in this repository for a specific reason: **a purge cell destroys its own subject.**
 *
 * MEASURED, in `src/lib/execution/actions/crm-ownership.db.test.ts:348-395`: a restore that covers
 * the fields a cell WRITES but not the field a cell TRANSFERS is not a restore. CR-04's second cell
 * moved a fixture deal's `ownerId` and succeeded against the unfixed handler; every subsequent cell
 * then threw "No deal found" — **five cascaded reds for one defect, with the positive anchors
 * reporting the wrong cause.**
 *
 * A purge is the extreme form of that hazard: the subject row is GONE, its notes are gone, its
 * neighbour's foreign key has been nulled, and (after the fix) its bytes have been unlinked. So
 * this function does four things and every one of them is load-bearing:
 *
 *   1. RE-INSERTS any purged row (`onConflictDoNothing`, so it is safe when the row survived);
 *   2. RESETS `customFields`, `deletedAt` AND `ownerId` on every subject and every neighbour;
 *   3. RE-LINKS the detach targets, because a purge NULLS them and the next cell's `detached`
 *      literal would otherwise be wrong by one — a false red naming the wrong defect;
 *   4. REWRITES every blob to disk, including removing a sabotage directory.
 *
 * A restore that removed rows but left bytes — or put bytes back but left a nulled foreign key —
 * would make the following cell fail on a later assertion than the one describing the defect. That
 * is the third fixture hazard `49-PATTERNS.md` names, and this file's subject is exactly the one it
 * warns about.
 *
 * Restored by direct SQL, never through a mutation: the mutations are what is under test.
 */
async function restoreFixtureRows(): Promise<void> {
  // 1. Re-insert anything a purge destroyed. Order is the foreign-key chain, root-first.
  await db
    .insert(organizations)
    .values([
      { id: ORG, name: `${PREFIX}org subject`, ownerId: USER },
      { id: ORG_NEIGHBOUR, name: `${PREFIX}org neighbour`, ownerId: USER },
      // CR-02's pair. DISTINCT names on purpose: `norm_name` is a GENERATED ALWAYS column and
      // both trigram indexes are partial on `deleted_at is null`, so two identical names would
      // make these two rows a genuine duplicate pair for every OTHER suite in the same database.
      { id: MERGE_SURVIVOR, name: `${PREFIX}merge survivor`, ownerId: USER },
      { id: MERGE_LOSER, name: `${PREFIX}merge loser`, ownerId: USER },
    ])
    .onConflictDoNothing()
  await db
    .insert(people)
    .values([
      { id: PERSON, firstName: `${PREFIX}person`, lastName: "subject", ownerId: USER },
      { id: PERSON_NEIGHBOUR, firstName: `${PREFIX}person`, lastName: "neighbour", ownerId: USER },
    ])
    .onConflictDoNothing()
  await db
    .insert(deals)
    .values([
      { id: DEAL, title: `${PREFIX}deal subject`, stageId: STAGE, ownerId: USER },
      { id: DEAL_NEIGHBOUR, title: `${PREFIX}deal neighbour`, stageId: STAGE, ownerId: USER },
    ])
    .onConflictDoNothing()
  await db
    .insert(activities)
    .values([
      {
        id: ACTIVITY,
        title: `${PREFIX}activity subject`,
        typeId: ACTIVITY_TYPE,
        ownerId: USER,
        dueDate: DUE_DATE,
      },
      {
        id: ACTIVITY_NEIGHBOUR,
        title: `${PREFIX}activity neighbour`,
        typeId: ACTIVITY_TYPE,
        ownerId: USER,
        dueDate: DUE_DATE,
      },
    ])
    .onConflictDoNothing()

  // 2 + 3. The subjects: soft-deleted, with their descriptors. The neighbours: LIVE, with their own
  //        descriptors, and RE-LINKED to their subject so the detach counts hold.
  await db
    .update(organizations)
    .set({ customFields: CUSTOM_FIELDS_ORG, deletedAt: TRASHED_AT, ownerId: USER })
    .where(sql`${organizations.id} = ${ORG}`)
  await db
    .update(organizations)
    .set({ customFields: CUSTOM_FIELDS_ORG_NEIGHBOUR, deletedAt: null, ownerId: USER })
    .where(sql`${organizations.id} = ${ORG_NEIGHBOUR}`)

  // CR-02's pair, reset to its PRE-MERGE state. Both LIVE, because a merge refuses a soft-deleted
  // record on either side, and a purge of the loser in one cell leaves the row gone for the next.
  //
  // The survivor's file key is set to `null` here rather than omitted: the merge writes
  // `customFields` WHOLESALE, so the cell that adopts the loser's `website` would otherwise leave a
  // stale `Anexos Ação` behind from the previous cell and the "the survivor holds its own
  // descriptor" assertion would be reading the wrong run's state. Each cell that needs the
  // survivor's own file value sets it explicitly.
  await db
    .update(organizations)
    .set({
      customFields: { [FIELD_ORG]: null },
      deletedAt: null,
      ownerId: USER,
      website: null,
    })
    .where(sql`${organizations.id} = ${MERGE_SURVIVOR}`)
  await db
    .update(organizations)
    .set({
      customFields: CUSTOM_FIELDS_MERGE_LOSER,
      deletedAt: null,
      ownerId: USER,
      website: MERGE_LOSER_WEBSITE,
    })
    .where(sql`${organizations.id} = ${MERGE_LOSER}`)

  await db
    .update(people)
    .set({
      customFields: CUSTOM_FIELDS_PERSON,
      deletedAt: TRASHED_AT,
      ownerId: USER,
      organizationId: null,
    })
    .where(sql`${people.id} = ${PERSON}`)
  // The organization's detach target: a LIVE person pointing at the trashed organization.
  await db
    .update(people)
    .set({
      customFields: CUSTOM_FIELDS_PERSON_NEIGHBOUR,
      deletedAt: null,
      ownerId: USER,
      organizationId: ORG,
    })
    .where(sql`${people.id} = ${PERSON_NEIGHBOUR}`)

  await db
    .update(deals)
    .set({
      customFields: CUSTOM_FIELDS_DEAL,
      deletedAt: TRASHED_AT,
      ownerId: USER,
      organizationId: null,
      personId: null,
    })
    .where(sql`${deals.id} = ${DEAL}`)
  // The person's detach target: a LIVE deal pointing at the trashed person.
  await db
    .update(deals)
    .set({
      customFields: CUSTOM_FIELDS_DEAL_NEIGHBOUR,
      deletedAt: null,
      ownerId: USER,
      organizationId: null,
      personId: PERSON,
    })
    .where(sql`${deals.id} = ${DEAL_NEIGHBOUR}`)

  await db
    .update(activities)
    .set({
      customFields: CUSTOM_FIELDS_ACTIVITY,
      deletedAt: TRASHED_AT,
      ownerId: USER,
      dealId: null,
    })
    .where(sql`${activities.id} = ${ACTIVITY}`)
  // The deal's detach target: a LIVE activity pointing at the trashed deal.
  await db
    .update(activities)
    .set({
      customFields: CUSTOM_FIELDS_ACTIVITY_NEIGHBOUR,
      deletedAt: null,
      ownerId: USER,
      dealId: DEAL,
    })
    .where(sql`${activities.id} = ${ACTIVITY_NEIGHBOUR}`)

  // 4. The bytes.
  writeSeededBlobs()
}

/* ---------------------------------------------------------------------------
 * Driving the file route — the URL-goes-dark cell only
 * ------------------------------------------------------------------------ */

interface HandlerResult {
  readonly status: number
  readonly body: Buffer
}

/**
 * One real `GET` on the file route as `userId`.
 *
 * `params` is a promise because that is the Next.js 15+ signature the route destructures. Plan
 * 49-06 owns this route's own proof; the single cell here asks only whether the URL that served a
 * blob still serves it after the purge.
 */
async function getFileAs(
  userId: string,
  entityId: string,
  fieldName: string,
  filename: string,
): Promise<HandlerResult> {
  authState.userId = userId

  const url =
    `http://localhost/api/files/${encodeURIComponent(entityId)}` +
    `/${encodeURIComponent(fieldName)}/${encodeURIComponent(filename)}`
  const request = new NextRequest(url, { method: "GET" })
  const params = Promise.resolve({ entityId, fieldName, filename })

  const response = await GET(request, { params })

  return { status: response.status, body: Buffer.from(await response.arrayBuffer()) }
}

/* ---------------------------------------------------------------------------
 * Capturing the mismatch log
 * ------------------------------------------------------------------------ */

/**
 * `src/lib/log.ts` emits ONE `JSON.stringify`'d line per call and delegates `error` to
 * `console.error`, so a spy on `console.error` sees the whole record as a single string argument.
 * Parsing it is what lets the injected-failure cell assert the NUMBERS rather than the presence of
 * a line — `expect(spy).toHaveBeenCalled()` would be satisfied by any log at all, including the
 * purge failing.
 */
interface CapturedLine {
  readonly raw: string
  readonly fields: Record<string, unknown>
}

function parseCapturedLines(calls: unknown[][]): CapturedLine[] {
  const parsed: CapturedLine[] = []

  for (const call of calls) {
    const raw = String(call[0])
    try {
      const fields = JSON.parse(raw) as Record<string, unknown>
      if (fields !== null && typeof fields === "object") parsed.push({ raw, fields })
    } catch {
      // Not a structured line. Kept out rather than guessed at.
    }
  }

  return parsed
}

/* ---------------------------------------------------------------------------
 * Setup / teardown
 * ------------------------------------------------------------------------ */

beforeAll(async () => {
  // CLEAN FIRST, THEN MEASURE — and the ORDER is the whole point (WR-04). `afterAll` asserts
  // `countAll(table) === baseline[table]`, so a baseline captured INCLUDING leftovers from a
  // previous aborted run converts that run into a false RED on the next one: every test green, the
  // suite red in teardown, with a message describing a mutated pre-existing row that never existed.
  // Cleaning first makes the baseline a measurement of the table WITHOUT this fixture, which is
  // what `afterAll` compares against — and makes a run after a crash self-healing.
  await removeFixtures()

  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)

  await db.insert(users).values({
    id: USER,
    email: `${PREFIX}owner@local.test`,
    name: "Purge Blob Owner",
    role: "member",
    status: "approved",
  })

  await db.insert(pipelines).values({ id: PIPELINE, name: `${PREFIX}pipeline`, ownerId: USER })
  await db
    .insert(stages)
    .values({ id: STAGE, pipelineId: PIPELINE, name: `${PREFIX}stage`, position: 1000 })
  await db
    .insert(activityTypes)
    .values({ id: ACTIVITY_TYPE, name: `${PREFIX}Task`, isDefault: false })

  // The four `type='file'` definitions, through plan 49-01's fixture. See the header for why they
  // are fixture faithfulness rather than a load-bearing dependency, and for why saying so matters.
  for (const subject of SUBJECTS) {
    await mintFieldDefinition({
      id: DEFINITION_IDS[subject.entityType],
      entityType: subject.entityType,
      name: subject.fieldName,
      type: "file",
    })
  }

  // Every row and every byte. `restoreFixtureRows` inserts what is missing and sets what is stale,
  // so the seed and the per-cell restore are ONE function — two of them is how they drift.
  await restoreFixtureRows()
}, 60_000)

beforeEach(async () => {
  await restoreFixtureRows()
})

afterAll(async () => {
  await removeFixtures()

  for (const table of TOUCHED_TABLES) {
    // Half 1: nothing of ours is left.
    expect(await countLeftovers(table)).toBe(0)
    // Half 2: and nothing that was NOT ours changed in number either. This is what catches a
    // pre-existing row that was MUTATED rather than created — a prefix sweep cannot see one.
    expect(await countAll(table)).toBe(baseline[table])
  }

  // THE BYTES, TOO. A teardown that removes rows but leaves bytes is the third fixture hazard
  // `49-PATTERNS.md` names, and this is the file it was written for: every path below is a real
  // file this suite created on a real disk.
  rmSync(UPLOAD_ROOT, { recursive: true, force: true })
  expect(existsSync(UPLOAD_ROOT)).toBe(false)
}, 60_000)

/* ---------------------------------------------------------------------------
 * The harness, asserted rather than assumed
 * ------------------------------------------------------------------------ */

describe("the connection guard — the thing that makes running this file at all safe", () => {
  it("refuses the DEVELOPMENT database by name", () => {
    expect(() =>
      assertIsolatedConnection(`postgresql://pipelite:pipelite@localhost:5433/${DEV_DATABASE}`),
    ).toThrow(/refusing to run/)
    expect(() =>
      assertIsolatedConnection(`postgresql://pipelite:pipelite@localhost:5433/${DEV_DATABASE}`),
    ).toThrow(/DEVELOPMENT database/)
  })

  it("refuses a non-loopback host even when the database name is right", () => {
    expect(() =>
      assertIsolatedConnection(`postgresql://u:p@db.example.com:5432/${TEST_DATABASE}`),
    ).toThrow(/not loopback/)
  })

  it("refuses an absent connection string rather than defaulting", () => {
    expect(() => assertIsolatedConnection(undefined)).toThrow(/DATABASE_URL is not set/)
  })

  it("ACCEPTS the isolated database — so the three refusals above are not vacuous", () => {
    const accepted = `postgresql://pipelite:pipelite@localhost:5433/${TEST_DATABASE}`
    expect(assertIsolatedConnection(accepted)).toBe(accepted)
    expect(process.env.DATABASE_URL).toContain(TEST_DATABASE)
  })
})

describe("PRE-FLIGHT — the floors without which every assertion below is about an empty set", () => {
  it("points UPLOAD_DIR at this file's own temp root, not at the module-scope default", () => {
    expect(process.env.UPLOAD_DIR).toBe(UPLOAD_ROOT)
    expect(UPLOAD_ROOT).not.toBe(DEFAULT_UPLOAD_DIR)
    expect(UPLOAD_ROOT).toContain("purgeblob-uploads-")
    expect(existsSync(UPLOAD_ROOT)).toBe(true)
  })

  it("runs under FILE_STORAGE local — SEC-49-A owns S3 and nothing here is evidence about it", () => {
    expect(process.env.FILE_STORAGE ?? "local").toBe("local")
  })

  it("has real bytes on disk for every one of the seeded blobs", () => {
    expect(SEEDED_BLOBS).toHaveLength(SEEDED_BLOB_TOTAL)
    expect(SEEDED_SUBJECT_BLOBS + SEEDED_NEIGHBOUR_BLOBS + SEEDED_MERGE_BLOBS).toBe(
      SEEDED_BLOB_TOTAL,
    )

    for (const blob of SEEDED_BLOBS) {
      const target = blobPath(blob.entityId, blob.fieldName, blob.storedName)
      expect(existsSync(target), `seeded blob missing before any purge: ${target}`).toBe(true)
      expect(readFileSync(target).equals(blob.bytes)).toBe(true)
    }
  })

  it("minted four type='file' definitions where the live database has zero", async () => {
    const rows = (await db.execute(
      sql`select count(*)::int as n from custom_field_definitions
          where id like ${LIKE_PREFIX} and type = 'file' and deleted_at is null`,
    )) as unknown as { n: number }[]

    expect(Number(rows[0].n)).toBe(SEEDED_FILE_DEFINITIONS)
  })

  it.each(SUBJECTS.map((s) => [s.entityType, s] as const))(
    "collects at least its named ref floor from the %s subject's customFields",
    async (_entityType, subject) => {
      const refs = collectFileFieldRefs(subject.id, subject.customFields)

      expect(
        refs.length,
        "a purge test whose ref list is EMPTY asserts about nothing: 'every blob this record " +
          "referenced is gone' is vacuously true for zero blobs, and the live database holds zero " +
          "file descriptors across 188,619 rows. This floor is what makes the cells below mean " +
          "something.",
      ).toBeGreaterThanOrEqual(subject.refCount)
      expect(refs.length).toBe(subject.refCount)
      expect(refs.map((r) => r.storedName).sort()).toEqual([...subject.storedNames].sort())
      for (const ref of refs) {
        expect(ref.entityId).toBe(subject.id)
        expect(ref.fieldName).toBe(subject.fieldName)
      }
    },
  )

  it("has all four subjects present AND soft-deleted, by direct SQL", async () => {
    for (const subject of SUBJECTS) {
      const table = TABLE_FOR[subject.entityType]
      expect(await countById(table, subject.id)).toBe(1)
      expect(
        await readDeletedAt(table, subject.id),
        `${subject.id} must be soft-deleted or purge${subject.entityType} refuses NOT_IN_TRASH`,
      ).not.toBeNull()
    }
  })

  it("has all four neighbours present and LIVE, by direct SQL", async () => {
    for (const subject of SUBJECTS) {
      const table = TABLE_FOR[subject.entityType]
      expect(await countById(table, subject.neighbourId)).toBe(1)
      expect(await readDeletedAt(table, subject.neighbourId)).toBeNull()
    }
  })

  it("serves a LIVE neighbour's blob through the route — proving the route resolved THIS root", async () => {
    // Without this cell the whole file could be exercising `/tmp/uploads`, finding nothing, and
    // answering 404 to every request — including the URL-goes-dark cell's 404, which would then
    // pass for the wrong reason. The route reads UPLOAD_DIR at MODULE scope, so this is the only
    // honest way to check that the `vi.hoisted` assignment took.
    const result = await getFileAs(USER, ORG_NEIGHBOUR, FIELD_ORG, STORED_ORG_NEIGHBOUR)

    expect(result.status).toBe(200)
    expect(result.body.equals(bytesFor("ORG-NEIGHBOUR"))).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * SC-2, per entity type
 * ------------------------------------------------------------------------ */

describe("SC-2 — after a purge, the record's blobs are gone from disk", () => {
  // One `it` per entity type, so a failure NAMES the entity rather than reporting a loop index.
  it.each(SUBJECTS.map((s) => [s.entityType, s] as const))(
    "purging a %s removes its bytes, leaves the neighbour's, and returns an unchanged result shape",
    async (entityType, subject) => {
      const table = TABLE_FOR[entityType]
      const subjectPaths = subject.storedNames.map((stored) =>
        blobPath(subject.id, subject.fieldName, stored),
      )
      const neighbourPath = blobPath(
        subject.neighbourId,
        subject.fieldName,
        subject.neighbourStoredName,
      )

      // POSITIVE ANCHOR. Without it, "the blob is gone" is satisfied by a blob that never existed.
      for (const target of subjectPaths) {
        expect(existsSync(target), `positive anchor: ${target} must exist BEFORE the purge`).toBe(
          true,
        )
      }
      expect(existsSync(neighbourPath)).toBe(true)
      expect(await countById(table, subject.id)).toBe(1)

      // THE REAL DISPATCH PATH, not the mutation directly, so the delegation
      // `purgeRecordByType` → `PURGE_BY_TYPE[entityType]` → `purge{Entity}Mutation` is in the proof.
      // `prune.ts` is not the transaction boundary; this is the path it takes.
      const result = await purgeRecordByType(entityType, subject.id)

      // RESULT SHAPE UNCHANGED. `toEqual`, never `toMatchObject`: an extra key is a red here as
      // well as in the eleven assertions across the four mutation test files.
      expect(result).toEqual({ success: true, detached: subject.detached })

      // THE PROOF.
      for (const target of subjectPaths) {
        expect(
          existsSync(target),
          `SC-2: the purge committed but ${target} is still on disk — the blob survived a ` +
            "permanent delete and stays reachable to anyone holding its URL.",
        ).toBe(false)
      }

      // BARRIER: the purge deleted THIS record's bytes, not the field directory. A deletion that
      // took the neighbour with it would be a worse defect than the one being fixed.
      expect(
        existsSync(neighbourPath),
        `the neighbour's blob was destroyed by another record's purge: ${neighbourPath}`,
      ).toBe(true)
      // BYTE EQUALITY, not a non-zero length. See `Subject.neighbourBytes` for why the weaker form
      // was replaced and why the replacement is the stronger claim rather than a concession.
      expect(readFileSync(neighbourPath).equals(subject.neighbourBytes)).toBe(true)

      // DATABASE: the row is gone, by direct SQL rather than through the ORM that just deleted it.
      expect(await countById(table, subject.id)).toBe(0)
    },
  )
})

describe("SC-2 — the URL that served the blob serves nothing afterwards", () => {
  it("answers 200 with the bytes while the record is live, and 404 with the bytes gone after the purge", async () => {
    const target = blobPath(ORG, FIELD_ORG, STORED_ORG_MAIN)

    // THE POSITIVE ANCHOR, AND A CORRECTION TO THIS PLAN'S OWN TEXT.
    //
    // The plan says "before the purge, the same request as the owner returns 200 with the bytes".
    // Taken literally that anchor CANNOT PASS against correct code: `findOwnedRecordById`
    // (`src/lib/api/file-access.ts:150-163`) carries `isNull(source.deletedAt)` — plan 49-04's
    // deliberate trashed-record decision — so a soft-deleted record already answers 404, and the
    // subject has to BE soft-deleted for the purge to accept it at all. So the anchor is taken
    // while the record is LIVE, the record is then trashed by direct SQL, and only then purged.
    // Without the correction this cell would have reddened against a correct route and a correct
    // purge, and the "404 afterwards" half beside it would have been proving nothing.
    await db
      .update(organizations)
      .set({ deletedAt: null })
      .where(sql`${organizations.id} = ${ORG}`)

    const before = await getFileAs(USER, ORG, FIELD_ORG, STORED_ORG_MAIN)
    expect(
      before.status,
      "the positive anchor: without a 200 here, the 404 below could be a route that refuses " +
        "everything and this cell would prove nothing.",
    ).toBe(200)
    expect(before.body.equals(bytesFor("ORG-MAIN"))).toBe(true)
    expect(existsSync(target)).toBe(true)

    // Back into the trash, so the purge accepts it.
    await db
      .update(organizations)
      .set({ deletedAt: TRASHED_AT })
      .where(sql`${organizations.id} = ${ORG}`)

    const result = await purgeRecordByType("organization", ORG)
    expect(result).toEqual({ success: true, detached: ORG_DETACHED })

    // BOTH HALVES, and only one of them is this plan's achievement.
    //
    // The 404 is ALREADY TRUE before this plan: plan 49-04's resolver cannot find a deleted record,
    // so the route refuses as soon as the row is gone. Recording it here is honest bookkeeping, not
    // a claim. THE HALF THIS PLAN DELIVERS IS THE SECOND ONE: the bytes are gone. Before the fix
    // this cell's 404 passes and its `existsSync` fails, which is exactly the shape of the defect —
    // an unreachable URL over a file that is still there for anyone who can read the disk, restore
    // a backup, or reconfigure the route.
    const after = await getFileAs(USER, ORG, FIELD_ORG, STORED_ORG_MAIN)
    expect(after.status).toBe(404)
    expect(
      existsSync(target),
      "the URL going dark is NOT the criterion — the bytes being gone is. This is the half " +
        "plan 49-07 delivers.",
    ).toBe(false)
  })
})

describe("SC-2 — an injected storage failure leaves the purge COMMITTED and logs the mismatch", () => {
  it("keeps the row deleted, logs expected/deleted with no filename, and still deletes the other blob", async () => {
    const sabotagedPath = blobPath(ORG, FIELD_ORG, STORED_ORG_MAIN)
    const barrierPath = blobPath(ORG, FIELD_ORG, STORED_ORG_SECOND)

    // Positive anchor: both blobs are real files right now.
    expect(existsSync(sabotagedPath)).toBe(true)
    expect(existsSync(barrierPath)).toBe(true)

    // THE INJECTION — research option (A), the seam plan 49-01 EXECUTED rather than reasoned:
    // make the blob path a DIRECTORY, so `unlink` raises EISDIR. Observed at uid 1000 (the uid
    // vitest actually runs as) AND at uid 0. Option (B), `chmod 0500` on the parent, is retired by
    // its own executed negative control — it RESOLVES as root, which would have produced a
    // successful deletion inside a test named for a failure path: a gate that cannot fail.
    rmSync(sabotagedPath, { recursive: true, force: true })
    mkdirSync(sabotagedPath)

    // THE INJECTION TOOK — asserted before anything relies on it. An injection that silently
    // succeeded would make this the phase's next gate that cannot fail (T-49-07-07).
    await expect(unlink(sabotagedPath)).rejects.toThrow(/EISDIR/)
    expect(existsSync(sabotagedPath)).toBe(true)

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    let result: Awaited<ReturnType<typeof purgeRecordByType>>
    let captured: unknown[][]
    try {
      result = await purgeRecordByType("organization", ORG)
    } finally {
      // COPY THE CALLS OUT BEFORE RESTORING, and this is a defect this cell had and this comment
      // exists so it does not come back. `mockRestore()` in Vitest is `mockReset()` plus restoring
      // the original implementation, and `mockReset()` CLEARS `mock.calls`. Reading
      // `errorSpy.mock.calls` after the restore therefore reads an EMPTY array — measured: this
      // cell reported `expected [] to have a length of 1 but got +0` against a CORRECT
      // implementation that had logged the mismatch. A gate that can only ever be red is as useless
      // as one that can only ever be green, and it would have been "fixed" by weakening the
      // assertion if the cause had not been found.
      captured = errorSpy.mock.calls.map((call) => [...call])
      errorSpy.mockRestore()
    }

    // THE CRITERION, FIRST. The purge stays COMMITTED under a storage failure: the returned value
    // reports success with an unchanged shape, and the row is gone from the database. Asserting the
    // log before this would let a test pass on a purge that rolled back but logged nicely.
    expect(result).toEqual({ success: true, detached: ORG_DETACHED })
    expect(
      await countById("organizations", ORG),
      "SC-2's criterion: a storage failure must not roll back, block or misreport a committed " +
        "purge. If this row is still here, a blob nobody can delete has made a record " +
        "un-purgeable forever.",
    ).toBe(0)

    // THE MISMATCH LOG, with BOTH numbers, and it comes BEFORE the barrier deliberately.
    //
    // Both reddened before the fix — no deletion ran at all — but they redden with different
    // messages, and the ORDER decides which message the reader sees first. "No mismatch line was
    // logged" names the absent post-commit block directly; "the loop abandoned every ref after the
    // first failure" describes a subsidiary property of a block that exists. Putting the direct
    // statement first is the same discipline `trigger-owner-scope.db.test.ts:780-829` measured the
    // absence of: a cell that fails on a later assertion than the one describing the defect sends
    // the next reader to the wrong place.
    //
    // `expect(spy).toHaveBeenCalled()` would be satisfied by any log line at all, including the
    // purge failing and logging its own catch, which is why the NUMBERS are asserted.
    const lines = parseCapturedLines(captured)
    const mismatches = lines.filter(
      (line) =>
        line.fields.scope === "mutations/organizations" &&
        line.fields.expected !== undefined &&
        line.fields.deleted !== undefined,
    )

    expect(
      mismatches,
      "no mismatch line was logged. The count going short is the ONLY evidence a blob survived " +
        "a committed purge; without this line the failure is silent.",
    ).toHaveLength(1)

    const mismatch = mismatches[0]
    expect(mismatch.fields.level).toBe("error")
    expect(mismatch.fields.scope).toBe("mutations/organizations")
    expect(mismatch.fields.entityType).toBe("organization")
    expect(mismatch.fields.id).toBe(ORG)
    expect(mismatch.fields.expected).toBe(ORG_REF_COUNT)
    expect(mismatch.fields.deleted).toBe(ORG_DELETED_UNDER_SABOTAGE)
    expect(ORG_REF_COUNT - Number(mismatch.fields.deleted)).toBe(SABOTAGED_REF_COUNT)

    // T-37-30 / T-49-07-05: identifiers and counts only. NO FILENAME, asserted rather than trusted.
    expect(mismatch.raw).not.toContain(STORED_ORG_MAIN)
    expect(mismatch.raw).not.toContain(STORED_ORG_SECOND)
    expect(mismatch.raw).not.toContain("original name.pdf")

    // THE WHOLE FIELD SET, EXHAUSTIVELY. The three `not.toContain` checks above rule out the two
    // filenames this fixture happens to use; this rules out EVERY other key. A future edit that
    // added `storedNames` or `paths` to the payload would slip past a substring search for two
    // specific strings and is caught here instead.
    expect(mismatch.fields).toEqual({
      level: "error",
      scope: "mutations/organizations",
      msg: "Purged record's blobs were not all deleted",
      ts: expect.any(String),
      entityType: "organization",
      id: ORG,
      expected: ORG_REF_COUNT,
      deleted: ORG_DELETED_UNDER_SABOTAGE,
    })

    // BARRIER: the OTHER ref on the SAME record, deleted by the SAME purge. Not a second purge and
    // not the neighbour's blob — `trigger-owner-scope.db.test.ts:780-829` measured what happens
    // when a barrier is taken from the wrong row. This is what proves the deletion loop CONTINUED
    // past the failure instead of aborting on the first undeletable ref.
    expect(
      existsSync(barrierPath),
      "the loop abandoned every ref after the first failure — the shape of failure this phase " +
        "exists to remove, arriving one level down.",
    ).toBe(false)

    // And the sabotaged one is, honestly, still there. That is what the mismatch log is FOR.
    expect(existsSync(sabotagedPath)).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * CR-01 — a restore that lands between the pre-fetch and the row DELETE
 * ------------------------------------------------------------------------ */

/**
 * THE RACE, INJECTED AT THE EXACT SEAM THE REVIEW NAMES.
 *
 * Every one of the four purge mutations does two things in this order: it pre-fetches the row with
 * `db.query.<table>.findFirst({ where: and(eq(id), isNotNull(deletedAt)) })`, and then it opens a
 * transaction. The window between those two statements is real and is reachable twice over — from
 * two browser tabs (Restore and Purge Forever sit side by side in `/trash`) and from the unattended
 * daily pruner working through a batch of up to 200 ids one record at a time.
 *
 * So the injection is a spy on THAT method which lets the real pre-fetch run, then commits a
 * RESTORE by direct SQL, then hands the mutation the trashed row it legitimately read. Nothing
 * about the mutation's own behaviour is substituted: the transaction that follows is real, the
 * `DELETE ... WHERE deleted_at IS NOT NULL` is real, and it matches zero rows for the honest reason
 * that the record is no longer in the trash.
 *
 * `mockImplementationOnce` is deliberate over `mockImplementation`: the restore must land in the
 * window ONCE. A spy that restored on every call would also fire for any later read and would make
 * the cell's own assertions read a state the spy created rather than the state the purge left.
 */
type PreFetchTarget = {
  readonly findFirst: (...args: never[]) => Promise<unknown>
}

/** The `db.query` namespace each purge mutation pre-fetches through, per entity type. */
const PRE_FETCH_FOR: Record<EntityType, PreFetchTarget> = {
  organization: db.query.organizations as unknown as PreFetchTarget,
  person: db.query.people as unknown as PreFetchTarget,
  deal: db.query.deals as unknown as PreFetchTarget,
  activity: db.query.activities as unknown as PreFetchTarget,
}

/** `deleted_at = NULL` on this row, by direct SQL. The restore the racing tab commits. */
async function restoreByDirectSql(table: string, id: string): Promise<void> {
  await db.execute(
    sql`update ${sql.identifier(table)} set deleted_at = null where id = ${id}`,
  )
}

/** How many `__purge` audit rows name this id. The purge's own claim that it happened. */
async function countPurgeAuditRows(id: string): Promise<number> {
  const rows = (await db.execute(
    sql`select count(*)::int as n from audit_log
        where entity_id = ${id} and action = 'deleted' and changes ? '__purge'`,
  )) as unknown as { n: number }[]

  return Number(rows[0].n)
}

/** How many LIVE notes are attached to this record. */
async function countNotesFor(entityType: EntityType, id: string): Promise<number> {
  const rows = (await db.execute(
    sql`select count(*)::int as n from notes where entity_type = ${entityType} and entity_id = ${id}`,
  )) as unknown as { n: number }[]

  return Number(rows[0].n)
}

/** The child column a purge of this entity type NULLS, and the child row it nulls it on. */
const DETACH_PROBE: Record<EntityType, { table: string; column: string; childId: string } | null> = {
  organization: { table: "people", column: "organization_id", childId: PERSON_NEIGHBOUR },
  person: { table: "deals", column: "person_id", childId: DEAL_NEIGHBOUR },
  deal: { table: "activities", column: "deal_id", childId: ACTIVITY_NEIGHBOUR },
  // `activities` is a true leaf — it detaches nothing, which is why `ACTIVITY_DETACHED` is 0.
  activity: null,
}

async function readChildLink(probe: { table: string; column: string; childId: string }): Promise<
  string | null
> {
  const rows = (await db.execute(
    sql`select ${sql.identifier(probe.column)} as link from ${sql.identifier(probe.table)}
        where id = ${probe.childId}`,
  )) as unknown as { link: string | null }[]

  return rows.length === 0 ? null : rows[0].link
}

/** The note this cell attaches to its subject, so "the notes survived" is not about zero rows. */
const RACE_NOTE_CONTENT = `${PREFIX}note that a rolled-back purge must not destroy`
/**
 * A named-integer floor for the notes. Without it, "the notes survived" is satisfied by a record
 * that never had any — which is the state `restoreFixtureRows` leaves, so the floor is the only
 * thing making the assertion about something.
 */
const RACE_NOTE_COUNT = 1

describe("CR-01 — a restore between the pre-fetch and the DELETE must not destroy a LIVE record", () => {
  it.each(SUBJECTS.map((s) => [s.entityType, s] as const))(
    "leaves a restored %s alive with its bytes, its notes and its children intact",
    async (entityType, subject) => {
      const table = TABLE_FOR[entityType]
      const subjectPaths = subject.storedNames.map((stored) =>
        blobPath(subject.id, subject.fieldName, stored),
      )
      const probe = DETACH_PROBE[entityType]

      // A note on the subject, so the "notes survived" assertion is not about an empty set.
      await db.insert(notes).values({
        entityType,
        entityId: subject.id,
        content: RACE_NOTE_CONTENT,
        authorId: USER,
        source: "user",
      })

      // POSITIVE ANCHORS, all four of them. Every one of these is a state the unfixed code
      // destroys, so each is a claim this cell has to establish before the purge runs.
      expect(
        collectFileFieldRefs(subject.id, subject.customFields).length,
        "an empty ref list makes 'the bytes survived' vacuously true",
      ).toBeGreaterThanOrEqual(subject.refCount)
      for (const target of subjectPaths) {
        expect(existsSync(target), `positive anchor: ${target} must exist BEFORE the purge`).toBe(
          true,
        )
      }
      expect(await countNotesFor(entityType, subject.id)).toBeGreaterThanOrEqual(RACE_NOTE_COUNT)
      // A DELTA, not an absolute zero, and the difference is a red this cell already produced:
      // `restoreFixtureRows` re-inserts a purged subject row but deliberately does NOT delete
      // `audit_log` (the whole design of a purge is that the record's audit history outlives it),
      // so by the time this describe runs the earlier SC-2 cells have left 1-3 `__purge` rows
      // against every subject id. An absolute `toBe(0)` therefore failed on the ANCHOR against
      // both the unfixed and the fixed code — a gate that could only ever be red, which is as
      // useless as one that can only ever be green. What this cell is entitled to claim is that
      // THIS invocation wrote no new one.
      const purgeRowsBefore = await countPurgeAuditRows(subject.id)
      if (probe !== null) {
        expect(
          await readChildLink(probe),
          `positive anchor: ${probe.childId}.${probe.column} must point at the subject BEFORE ` +
            "the purge, or the 'children stayed attached' assertion below is about a null that " +
            "was always null",
        ).toBe(subject.id)
      }

      // THE INJECTION. Real pre-fetch, then a real committed restore, then the mutation carries on
      // with the row it read — exactly the interleaving the review describes.
      //
      // The real method is captured and BOUND before the spy replaces it, so the call-through is
      // the genuine drizzle query rather than a fabricated row. A stubbed row would make this cell
      // a test of the stub: the whole point is that the mutation legitimately read a trashed record
      // and then the world changed underneath it.
      const target = PRE_FETCH_FOR[entityType]
      const realFindFirst = target.findFirst.bind(target)
      const spy = vi.spyOn(target, "findFirst")
      let restored = false
      spy.mockImplementationOnce(async (...args: never[]) => {
        const row = await realFindFirst(...args)

        await restoreByDirectSql(table, subject.id)
        restored = true

        return row
      })

      let result: Awaited<ReturnType<typeof purgeRecordByType>>
      try {
        result = await purgeRecordByType(entityType, subject.id)
      } finally {
        spy.mockRestore()
      }

      // THE INJECTION TOOK. Asserted before anything relies on it: a spy that never fired would
      // make every assertion below describe an ordinary refusal rather than the race.
      expect(
        restored,
        "the pre-fetch spy never fired, so no restore landed in the window and this cell is not " +
          "exercising the race at all",
      ).toBe(true)
      expect(
        await readDeletedAt(table, subject.id),
        "the restore did not commit — the injected UPDATE must have left this row LIVE",
      ).toBeNull()

      // THE CRITERION, IRREVERSIBLE HALF FIRST. The assertion order is the reading order of the
      // failure: `unlink` cannot be undone, so "a live record's bytes are gone" is the sentence a
      // reader must see before "and it was reported as a success". Putting the result `toEqual`
      // first would have made every red in this describe read as a return-shape disagreement.
      for (const path of subjectPaths) {
        expect(
          existsSync(path),
          `CR-01: ${subject.id} is LIVE and visible, and the purge unlinked its bytes anyway. ` +
            "`unlink` is irreversible; this attachment is gone forever.",
        ).toBe(true)
      }

      expect(
        await countById(table, subject.id),
        "the restored record was hard-deleted anyway",
      ).toBe(1)

      expect(
        await countNotesFor(entityType, subject.id),
        "the transaction's notes DELETE survived a purge that did not happen",
      ).toBeGreaterThanOrEqual(RACE_NOTE_COUNT)

      expect(
        await countPurgeAuditRows(subject.id),
        "a NEW audit row claims this record was purged. It is alive, and its timeline now says " +
          "otherwise.",
      ).toBe(purgeRowsBefore)

      if (probe !== null) {
        expect(
          await readChildLink(probe),
          `${probe.childId} was silently detached from a LIVE ${entityType} the caller never ` +
            "selected — the widest blast radius in the whole failure",
        ).toBe(subject.id)
      }

      // AND THE RETURN VALUE, LAST. `PurgeResult` is NOT widened — this is the existing
      // `{ success: false, error: "NOT_IN_TRASH" }` arm, which the mutations already return when
      // the pre-fetch itself misses. The eleven `toEqual({ success: true, detached: N })`
      // assertions across the four mutation test files are untouched by construction.
      expect(result).toEqual({ success: false, error: "NOT_IN_TRASH" })
    },
  )
})

/* ---------------------------------------------------------------------------
 * WR-03 — a descriptor written to the trashed row after the pre-fetch
 * ------------------------------------------------------------------------ */

/** The blob added in the pre-fetch window. A THIRD descriptor, so nothing here is about a pair. */
const STORED_LATE_ARRIVAL = "3f1c0d4e-6b21-4f77-a0aa-000000000401.pdf"
/**
 * A named-integer floor for the post-window ref list. The purge must collect THREE refs from the
 * organization once the late arrival lands (its two seeded blobs plus this one), and asserting the
 * literal is what makes "both are gone" a claim about a set the window actually grew.
 */
const REFS_AFTER_LATE_ARRIVAL = ORG_REF_COUNT + 1

describe("WR-03 — a blob written to the trashed row after the pre-fetch is still collected", () => {
  it("unlinks a descriptor that arrived between the pre-fetch and the transaction", async () => {
    const seededPaths = [STORED_ORG_MAIN, STORED_ORG_SECOND].map((stored) =>
      blobPath(ORG, FIELD_ORG, stored),
    )
    const latePath = blobPath(ORG, FIELD_ORG, STORED_LATE_ARRIVAL)

    // The late arrival's bytes, written by hand: this is a real file the record will really
    // reference, so an orphan here is a real orphan.
    mkdirSync(path.dirname(latePath), { recursive: true })
    writeFileSync(latePath, bytesFor("LATE-ARRIVAL"))

    // POSITIVE ANCHORS.
    for (const target of [...seededPaths, latePath]) {
      expect(existsSync(target), `positive anchor: ${target} must exist BEFORE the purge`).toBe(true)
    }
    expect(await countById("organizations", ORG)).toBe(1)

    // THE INJECTION: after the real pre-fetch resolves, a client's
    // `POST /api/custom-fields/save` lands on the still-existing trashed row and appends a
    // descriptor. Written by direct SQL so the subject is the PURGE's ref collection and not
    // `saveFieldValues`' own behaviour, which has its own cells in `src/lib/custom-fields.test.ts`.
    const target = PRE_FETCH_FOR.organization
    const realFindFirst = target.findFirst.bind(target)
    const spy = vi.spyOn(target, "findFirst")
    let appended = false
    spy.mockImplementationOnce(async (...args: never[]) => {
      const row = await realFindFirst(...args)

      const grown = {
        [FIELD_ORG]: [
          ...(CUSTOM_FIELDS_ORG[FIELD_ORG] as unknown[]),
          descriptor(ORG, FIELD_ORG, STORED_LATE_ARRIVAL, bytesFor("LATE-ARRIVAL")),
        ],
      }
      await db
        .update(organizations)
        .set({ customFields: grown })
        .where(sql`${organizations.id} = ${ORG}`)
      appended = true

      return row
    })

    let result: Awaited<ReturnType<typeof purgeRecordByType>>
    try {
      result = await purgeRecordByType("organization", ORG)
    } finally {
      spy.mockRestore()
    }

    // THE INJECTION TOOK, and the row really did grow by one ref. Without the FLOOR this cell
    // could pass on a blob the window never changed.
    expect(
      appended,
      "the pre-fetch spy never fired, so no descriptor landed in the window and this cell is not " +
        "exercising WR-03 at all",
    ).toBe(true)

    expect(result).toEqual({ success: true, detached: ORG_DETACHED })
    expect(await countById("organizations", ORG)).toBe(0)

    // THE CRITERION. Every blob the row referenced AT THE MOMENT THE ROW DIED is gone, not just
    // the ones it referenced when the function started.
    expect(
      existsSync(latePath),
      "WR-03: the descriptor that arrived after the pre-fetch was never collected. Its bytes are " +
        "an orphan nothing will ever name again — no route can serve it, no verb can delete it, " +
        "and `deleted === expected` held so nothing was logged.",
    ).toBe(false)

    for (const seeded of seededPaths) {
      expect(existsSync(seeded), `the originally-collected blob survived: ${seeded}`).toBe(false)
    }
  })

  it("FLOOR: the injected window really does grow the ref list, so the cell above is not about a pair", () => {
    // The arithmetic, pinned. Stated as a named integer rather than left implicit in the cell
    // above, because "all three are gone" and "both are gone" are different claims and only a
    // literal tells them apart.
    const grown = {
      [FIELD_ORG]: [
        ...(CUSTOM_FIELDS_ORG[FIELD_ORG] as unknown[]),
        descriptor(ORG, FIELD_ORG, STORED_LATE_ARRIVAL, bytesFor("LATE-ARRIVAL")),
      ],
    }

    expect(collectFileFieldRefs(ORG, CUSTOM_FIELDS_ORG)).toHaveLength(ORG_REF_COUNT)
    expect(collectFileFieldRefs(ORG, grown)).toHaveLength(REFS_AFTER_LATE_ARRIVAL)
    expect(REFS_AFTER_LATE_ARRIVAL).toBeGreaterThan(ORG_REF_COUNT)
  })
})

/* ---------------------------------------------------------------------------
 * CR-02 — a merge must not re-home a file descriptor without its bytes
 * ------------------------------------------------------------------------ */

/** The `customFields` blob a record currently holds, read by direct SQL. */
async function readCustomFields(id: string): Promise<Record<string, unknown>> {
  const rows = (await db.execute(
    sql`select custom_fields from organizations where id = ${id}`,
  )) as unknown as { custom_fields: Record<string, unknown> | null }[]

  expect(rows.length, `no organizations row for ${id}`).toBe(1)
  return rows[0].custom_fields ?? {}
}

/** The `website` column, read by direct SQL. The non-file anchor for the merge. */
async function readWebsite(id: string): Promise<string | null> {
  const rows = (await db.execute(
    sql`select website from organizations where id = ${id}`,
  )) as unknown as { website: string | null }[]

  return rows.length === 0 ? null : rows[0].website
}

/** Every `storedName` a record's blob names, through the SAME walk a purge uses. */
async function referencedStoredNames(id: string): Promise<string[]> {
  return collectFileFieldRefs(id, await readCustomFields(id))
    .map((ref) => ref.storedName)
    .sort()
}

describe("CR-02 — a merge must not hand the survivor a descriptor whose bytes it does not own", () => {
  /**
   * A blob's on-disk location is `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}`, where
   * `entityId` is the record it was uploaded AGAINST. The merge copied the descriptor object —
   * `storedName`, `path` and `publicUrl` all naming the LOSER — onto the survivor, and touched
   * neither the bytes nor the loser's own blob. Two live records then referenced one file, and the
   * purge collects refs blindly from the row it is destroying (by design) with no notion that
   * another row holds the same `storedName`.
   *
   * `mergeRecordsMutation` is called with `choices: {}` in the first cell, which is the whole
   * point: `buildMergeFieldGroups` puts a survivor-empty / loser-populated key in `filledOnly`,
   * whose default is the LOSER, so the user does not have to click anything for this to happen.
   *
   * `pairId: null` skips the V-9 membership control, which is what lets a test merge two records
   * that were never scanned into `duplicate_pairs` — and it is why this file's `afterAll` count
   * assertions still hold: no pair row is written.
   */
  it("leaves the loser's file on the loser when the picker's own default would adopt it", async () => {
    const loserPath = blobPath(MERGE_LOSER, FIELD_ORG, STORED_MERGE_LOSER)

    // FLOORS AND ANCHORS, before anything is merged.
    expect(
      await referencedStoredNames(MERGE_LOSER),
      "the loser holds no descriptor, so 'the survivor did not adopt it' is vacuously true",
    ).toEqual([STORED_MERGE_LOSER])
    expect(
      collectFileFieldRefs(MERGE_LOSER, await readCustomFields(MERGE_LOSER)).length,
    ).toBeGreaterThanOrEqual(MERGE_LOSER_REF_COUNT)
    expect(await referencedStoredNames(MERGE_SURVIVOR)).toEqual([])
    expect(existsSync(loserPath)).toBe(true)
    expect(await readWebsite(MERGE_SURVIVOR)).toBeNull()
    expect(await readWebsite(MERGE_LOSER)).toBe(MERGE_LOSER_WEBSITE)

    const merged = await mergeRecordsMutation({
      entityType: "organization",
      pairId: null,
      survivorId: MERGE_SURVIVOR,
      loserId: MERGE_LOSER,
      // NOT A SINGLE ANSWER. Every value that moves below moves because the SERVER decided it
      // should, which is the failure mode: an unattended default that destroys data.
      choices: {},
    })

    expect(merged.success, "the merge itself failed, so nothing below is about the merge").toBe(true)

    // THE ANCHOR, AND IT COMES FIRST. `website` is survivor-empty / loser-populated, in the SAME
    // `filledOnly` group with the SAME loser default and the SAME write path as the file key. If
    // this is null, the exclusion is not what stopped the file — the merge simply moved nothing,
    // and the criterion below would be passing for the wrong reason.
    expect(
      await readWebsite(MERGE_SURVIVOR),
      "the merge adopted NOTHING from the loser, so this cell cannot distinguish a working " +
        "exclusion from a broken fixture",
    ).toBe(MERGE_LOSER_WEBSITE)

    // THE CRITERION. The survivor must not name a blob that lives under another record's id.
    expect(
      await referencedStoredNames(MERGE_SURVIVOR),
      `CR-02: the survivor now references ${STORED_MERGE_LOSER}, whose bytes are under ` +
        `${MERGE_LOSER}'s directory. Two live records reference one file, and the loser's own ` +
        "purge will unlink it 30 days from now, unattended, with no mismatch log.",
    ).toEqual([])

    // And the loser kept it, so the bytes are still owned by exactly one row.
    expect(await referencedStoredNames(MERGE_LOSER)).toEqual([STORED_MERGE_LOSER])
    expect(existsSync(loserPath)).toBe(true)
  })

  /**
   * The same claim under an EXPLICIT choice, which is the stronger form: both sides populated, and
   * the caller asks for the loser's value by name.
   *
   * This is also the T-39-04 property applied to the excluded key — `applyMergeChoices` writes
   * exactly the keys the server computed, so a choice naming a key the picker never offered writes
   * nothing. And it is the cell with the non-vacuous end-state assertion: after purging the loser,
   * the survivor references EXACTLY ONE blob, it is the survivor's own, and its bytes are byte-for-
   * byte intact.
   */
  it("keeps the survivor on its own bytes even when the caller explicitly picks the loser's file, and those bytes survive the loser's purge", async () => {
    // The survivor gets its OWN descriptor for this cell. Direct SQL, never a mutation: the
    // mutation is what is under test.
    await db
      .update(organizations)
      .set({ customFields: CUSTOM_FIELDS_MERGE_SURVIVOR })
      .where(sql`${organizations.id} = ${MERGE_SURVIVOR}`)

    const survivorPath = blobPath(MERGE_SURVIVOR, FIELD_ORG, STORED_MERGE_SURVIVOR)
    const loserPath = blobPath(MERGE_LOSER, FIELD_ORG, STORED_MERGE_LOSER)

    // FLOORS: one descriptor per side, and both files really on disk.
    expect(
      collectFileFieldRefs(MERGE_SURVIVOR, await readCustomFields(MERGE_SURVIVOR)).length,
    ).toBeGreaterThanOrEqual(MERGE_SURVIVOR_REF_COUNT)
    expect(
      collectFileFieldRefs(MERGE_LOSER, await readCustomFields(MERGE_LOSER)).length,
    ).toBeGreaterThanOrEqual(MERGE_LOSER_REF_COUNT)
    expect(existsSync(survivorPath)).toBe(true)
    expect(existsSync(loserPath)).toBe(true)

    const merged = await mergeRecordsMutation({
      entityType: "organization",
      pairId: null,
      survivorId: MERGE_SURVIVOR,
      loserId: MERGE_LOSER,
      // ASKED FOR BY NAME. The prefixed key is exactly the spelling `applyMergeChoices` reads.
      choices: { [`customFields.${FIELD_ORG}`]: "loser" },
    })

    expect(merged.success).toBe(true)

    // The anchor again: a value the merge DID take from the loser, in the same group and by the
    // same default, so "the file stayed put" is not "nothing happened".
    expect(await readWebsite(MERGE_SURVIVOR)).toBe(MERGE_LOSER_WEBSITE)

    // THE CRITERION, HALF ONE: the survivor holds its OWN descriptor and only its own.
    expect(
      await referencedStoredNames(MERGE_SURVIVOR),
      "the explicitly-requested loser descriptor was written onto the survivor. A crafted or " +
        "even an honest choice must not be able to point a record at bytes it does not own.",
    ).toEqual([STORED_MERGE_SURVIVOR])

    // The loser still holds its own, so the merge did not silently clear it either.
    expect(await referencedStoredNames(MERGE_LOSER)).toEqual([STORED_MERGE_LOSER])

    // THE CRITERION, HALF TWO — and this is the half that makes CR-02 a DATA-LOSS finding rather
    // than a tidiness one. The merge soft-deleted the loser, so 30 days later the retention pruner
    // purges it, unattended. Run that purge now.
    expect(
      await readDeletedAt("organizations", MERGE_LOSER),
      "the merge did not put the loser in the trash, so the purge below will refuse and this " +
        "half of the cell would prove nothing",
    ).not.toBeNull()

    const purge = await purgeRecordByType("organization", MERGE_LOSER)
    expect(purge).toEqual({ success: true, detached: MERGE_LOSER_DETACHED })

    // The loser's own bytes are gone, correctly — it owned them.
    expect(existsSync(loserPath)).toBe(false)

    // AND THE SURVIVOR'S ARE NOT. Byte equality, not mere existence: a truncated-but-present file
    // would pass the weaker form.
    expect(
      existsSync(survivorPath),
      `CR-02: purging ${MERGE_LOSER} destroyed bytes that the LIVE ${MERGE_SURVIVOR} is still ` +
        "showing. `deleted === expected` held, so nothing was logged.",
    ).toBe(true)
    expect(readFileSync(survivorPath).equals(bytesFor("MERGE-SURVIVOR"))).toBe(true)

    // And every blob the live survivor still NAMES is still on disk — the property SC-2 is about,
    // asserted over a non-empty set because of the floor above.
    const survivingRefs = collectFileFieldRefs(
      MERGE_SURVIVOR,
      await readCustomFields(MERGE_SURVIVOR),
    )
    expect(survivingRefs.length).toBeGreaterThanOrEqual(MERGE_SURVIVOR_REF_COUNT)
    for (const ref of survivingRefs) {
      expect(
        existsSync(blobPath(ref.entityId, ref.fieldName, ref.storedName)),
        `the live survivor names ${ref.storedName} and the bytes are gone`,
      ).toBe(true)
    }
  })
})
