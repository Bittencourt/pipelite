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
const SEEDED_BLOB_TOTAL = 9
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
    expect(SEEDED_SUBJECT_BLOBS + SEEDED_NEIGHBOUR_BLOBS).toBe(SEEDED_BLOB_TOTAL)

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
      expect(readFileSync(neighbourPath).byteLength).toBeGreaterThan(0)

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
    try {
      result = await purgeRecordByType("organization", ORG)
    } finally {
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
    const lines = parseCapturedLines(errorSpy.mock.calls)
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
