/**
 * =============================================================================
 * files-route-ownership.db.test.ts — SEC-04 / ROADMAP SC-1, PROVEN BEHAVIOURALLY
 * =============================================================================
 *
 * Two real users, three real records, real bytes on a real filesystem, and a request that has to
 * come back carrying none of them.
 *
 * ## Why this file exists when plan 49-04 already proved the same guard
 *
 * 49-04's `route-containment.test.ts` is a 52-cell UNIT proof of this route. It is a real proof —
 * it drove the shipped handler and watched `readFile` reach another user's file — but it mocks
 * `@/db`. What it can therefore establish is that the handler CALLS a resolver which compiles a
 * predicate of a particular shape. What it cannot establish is that PostgreSQL, handed that
 * predicate, returns only the caller's rows. Those are different claims, and this repository has
 * measured the gap twice:
 *
 *   - `src/lib/api/db-errors.ts`'s first version had 24 green unit assertions and answered 500
 *     where 409 was expected the moment a real database was involved.
 *   - SEC-48-B: three ownership predicates deleted from `organizations/[id]/route.ts`, 5,237 tests
 *     still green.
 *
 * So every predicate below is exercised against real PostgreSQL, and every byte assertion below is
 * made against a real file on a real disk.
 *
 * ## Why `mintApiKey` is not used and is not imported
 *
 * This route authenticates with `auth()`, not `withApiAuth`. There is no `/api/v1` file route, and
 * `49-CONTEXT.md` forbids inventing a `withApiAuth` twin for files. The correct harness is
 * therefore the session-auth one at `src/app/import/import-owner-scope.db.test.ts:69-81`:
 * `vi.hoisted` + `vi.mock("@/auth")` + a real `db`. A minted API key would authenticate against a
 * surface this route does not have.
 *
 * ## What is mocked, and why it is the minimum
 *
 * `@/auth`, and nothing else. `auth()` reads an Auth.js JWT out of request headers and an in-process
 * handler call has none, so supplying the session is what makes the caller's identity a KNOWN INPUT
 * rather than an accident. It is not the thing under test: `session.user.id` is the value the
 * resolver's owner term binds, and every assertion here is about which ROW and which BYTES come
 * back for it.
 *
 * `next/cache` is NOT mocked, because this route does not import it — `GET` and `DELETE` never
 * revalidate. `@/db` is NOT mocked. `fs` is NOT mocked: the reads and the unlink are real, which is
 * the point of the DELETE cells. Nothing that decides the outcome under test is substituted.
 *
 * ## The mechanical trap that decides whether this file works at all
 *
 * `route.ts:14` is `const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads'` — a MODULE-LEVEL
 * read. A test that assigns `process.env.UPLOAD_DIR` after importing the route has no effect
 * whatsoever, and the host test process cannot see the container's `/app/uploads` volume. So the
 * assignment happens inside `vi.hoisted`, which runs before the static imports are evaluated, and
 * the pre-flight describe then ASSERTS that the route really resolved that directory instead of
 * trusting it. Without that cell the entire file could be exercising `/tmp/uploads`, finding nothing
 * there, and reporting 404 for every refusal — passing completely, and proving nothing.
 *
 * ## Scope: `FILE_STORAGE=local`, and no claim beyond it
 *
 * Under `FILE_STORAGE=s3` the stored `publicUrl` is `${S3_PUBLIC_URL}/${key}`
 * (`src/app/api/upload/route.ts:89`), so no read ever traverses this route and the guard has no
 * traffic to protect there. That gap is **SEC-49-A**, it is owned separately, and nothing in this
 * file may be cited as evidence about it. `FILE_STORAGE` is unset in this deployment, which is why
 * `'local'` is the configuration under test — asserted in the pre-flight describe rather than
 * assumed, because under `s3` every refusal below would pass for the wrong reason.
 *
 * ## Why there is not one source-text assertion here
 *
 * No `toContain` over any file read from disk. A comment that explains a rule contains the rule;
 * fifteen gates in this project have gone green by matching their own explanatory prose. The proof
 * is a handler invocation, a status, a response body compared BYTE-WISE against the victim's real
 * file, and `existsSync` on a real path.
 *
 * ## HOW TO RUN IT
 *   docker compose up -d
 *   bash scripts/dedup-db-test-setup.sh
 *   ./node_modules/.bin/vitest run --config vitest.db.config.ts \
 *     src/app/api/files/__tests__/files-route-ownership.db.test.ts
 *
 * It runs against `pipelite_dedup_test`, never `pipelite`. The guard below re-derives the host AND
 * the database name from the connection string and throws at MODULE SCOPE, so a wrong target aborts
 * collection before a single statement is sent. That matters here more than in most of these files:
 * this one hard-deletes rows AND unlinks real files.
 * =============================================================================
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import path from "path"

import { like, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * The session each request runs as. Declared through `vi.hoisted` so the `@/auth` factory below can
 * reach it and so a single cell can switch identity — which every symmetry cell does.
 */
const authState = vi.hoisted(() => ({ userId: "" }))

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: authState.userId } })),
}))

/**
 * THE UPLOAD DIRECTORY, ASSIGNED BEFORE THE ROUTE MODULE IS EVALUATED.
 *
 * `route.ts:14` reads `process.env.UPLOAD_DIR` at module-evaluation time, so this assignment has to
 * happen before the static imports below run — which is exactly what `vi.hoisted` guarantees and
 * what a `beforeAll` cannot. The host test process also cannot see the container's `/app/uploads`
 * volume, so the directory has to be a host-local one this file owns outright.
 *
 * NOT `mkdtempSync`, deliberately, and this is a departure from the plan text with a reason. Inside
 * a hoisted factory there is no `fs` binding yet: the static imports have not been evaluated, so
 * reaching `mkdtempSync` means a bare `require("fs")`, which this repository's eslint config makes
 * an ERROR (`@typescript-eslint/no-require-imports`) — verified by running it. Suppressing a lint
 * error inside a security proof to obtain a directory name is a worse trade than naming the
 * directory here and creating it below. The property `mkdtempSync` provides is collision-freedom,
 * and that property is PRESERVED rather than assumed: the creation below is a NON-recursive
 * `mkdirSync` on the leaf, so a name that already exists throws `EEXIST` and aborts collection
 * instead of silently sharing a directory with another process.
 */
const uploadEnv = vi.hoisted(() => {
  const parent = process.env.TMPDIR ?? "/tmp"
  const dir = `${parent}/filesown-uploads-${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
  process.env.UPLOAD_DIR = dir
  return { dir }
})

import { db } from "@/db"
import { auditLog, organizations, users } from "@/db/schema"

import { DELETE, GET } from "@/app/api/files/[entityId]/[fieldName]/[filename]/route"

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
        "This suite hard-deletes fixture rows AND unlinks real files.",
    )
  }

  const database = url.pathname.replace(/^\//, "")

  if (database !== TEST_DATABASE) {
    throw new Error(
      `refusing to run: connection names database "${database}", not "${TEST_DATABASE}". ` +
        (database === DEV_DATABASE
          ? `"${DEV_DATABASE}" is the DEVELOPMENT database and holds ~46k organizations of real CRM ` +
            "data; no fixture is ever hard-deleted from it. "
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
const PREFIX = "filesown-"
const LIKE_PREFIX = `${PREFIX}%`

const USER_A = `${PREFIX}user-a`
const USER_B = `${PREFIX}user-b`

/** A's live record — the caller's own, and the subject of both positive anchors. */
const ORG_A = `${PREFIX}org-a`
/** B's live record — the victim. */
const ORG_B = `${PREFIX}org-b`
/** A's OWN record, soft-deleted. The trashed-record decision's subject. */
const ORG_T = `${PREFIX}org-trashed`
/** A well-formed id that names no row. Asserted absent, then requested. */
const MISSING_ORG = `${PREFIX}org-nonexistent`

/**
 * Two field names, both with a space and one with an accent, because that is what this deployment's
 * file fields are actually called and the route interpolates them into a filesystem path.
 */
const FIELD_MAIN = "Anexos Ação"
const FIELD_OTHER = "Contrato Assinado"

/**
 * `storedName`s in the shape `src/app/api/upload/route.ts:59-62` mints —
 * `${crypto.randomUUID()}${path.extname(original)}` — because that is what the JSONB reference match
 * compares against. Fixed rather than random so a red transcript names the same file twice.
 */
const STORED_A_MAIN = "9f1c0d4e-6b21-4f77-a0aa-000000000001.pdf"
const STORED_A_OTHER = "9f1c0d4e-6b21-4f77-a0aa-000000000002.pdf"
const STORED_B_MAIN = "5a2b7e10-6b21-4f77-a0aa-000000000003.pdf"
const STORED_T_MAIN = "5a2b7e10-6b21-4f77-a0aa-000000000004.pdf"
/** Real bytes in A's OWN field directory that A's OWN JSONB does not mention. */
const STORED_UNREFERENCED = "5a2b7e10-6b21-4f77-a0aa-000000000005.pdf"

/**
 * Distinct contents per file, so a served body can be attributed to ONE specific record. A body
 * assertion against identical bytes would be satisfied by the wrong file.
 */
const BYTES_A_MAIN = Buffer.from(`${PREFIX}A-MAIN: A's own contract, the GET anchor's body.\n`)
const BYTES_A_OTHER = Buffer.from(`${PREFIX}A-OTHER: A's own second file, the DELETE anchor.\n`)
const BYTES_B_MAIN = Buffer.from(`${PREFIX}B-MAIN: B's private contract. NO REQUEST BY A MAY EVER RETURN THIS.\n`)
const BYTES_T_MAIN = Buffer.from(`${PREFIX}T-MAIN: attached to A's own TRASHED record.\n`)
const BYTES_UNREFERENCED = Buffer.from(
  `${PREFIX}UNREFERENCED: real bytes in A's own field directory, absent from A's JSONB.\n`,
)
const BYTES_CROSSFIELD = Buffer.from(
  `${PREFIX}CROSSFIELD: A's main storedName, sitting under A's OTHER field. Not referenced there.\n`,
)

interface SeededBlob {
  readonly entityId: string
  readonly fieldName: string
  readonly storedName: string
  readonly bytes: Buffer
  /** Whether the owning record's `customFields` names this `storedName` under this field. */
  readonly referenced: boolean
}

/**
 * Every file this suite puts on disk.
 *
 * The two UNREFERENCED entries are what make two cells non-vacuous, and the second one is an
 * addition to the plan's fixture with a reason. Without real bytes at
 * `${ORG_A}/${FIELD_OTHER}/${STORED_A_MAIN}`, the WRONG FIELD NAME cell would answer 404 from
 * `existsSync` — nothing would be there — and it would therefore stay green with the JSONB reference
 * match removed entirely. With the bytes present, that cell can only be refused by the per-field
 * match, which is the thing it claims to test.
 */
const SEEDED_BLOBS: readonly SeededBlob[] = Object.freeze([
  { entityId: ORG_A, fieldName: FIELD_MAIN, storedName: STORED_A_MAIN, bytes: BYTES_A_MAIN, referenced: true },
  { entityId: ORG_A, fieldName: FIELD_OTHER, storedName: STORED_A_OTHER, bytes: BYTES_A_OTHER, referenced: true },
  { entityId: ORG_B, fieldName: FIELD_MAIN, storedName: STORED_B_MAIN, bytes: BYTES_B_MAIN, referenced: true },
  { entityId: ORG_T, fieldName: FIELD_MAIN, storedName: STORED_T_MAIN, bytes: BYTES_T_MAIN, referenced: true },
  {
    entityId: ORG_A,
    fieldName: FIELD_MAIN,
    storedName: STORED_UNREFERENCED,
    bytes: BYTES_UNREFERENCED,
    referenced: false,
  },
  {
    entityId: ORG_A,
    fieldName: FIELD_OTHER,
    storedName: STORED_A_MAIN,
    bytes: BYTES_CROSSFIELD,
    referenced: false,
  },
])

/**
 * THE NUMBERS THIS PROOF TURNS ON, declared once as named literals and consumed by both the seed and
 * the assertions, so the two cannot drift. Each is also asserted non-zero: an assertion whose two
 * sides both derive from the same query passes on an empty database and an empty disk, which is
 * precisely the failure this file exists to rule out.
 */
const REFERENCED_BLOBS = 4
const UNREFERENCED_BLOBS = 2
const SEEDED_BLOB_TOTAL = 6
const SEEDED_ORGANIZATIONS = 3

/** When `ORG_T` was trashed. A fixed instant, restored by direct SQL before every cell. */
const TRASHED_AT = new Date("2026-01-15T12:00:00.000Z")

/** The absolute path the route will resolve for these three segments. */
function blobPath(entityId: string, fieldName: string, storedName: string): string {
  return path.join(UPLOAD_ROOT, entityId, fieldName, storedName)
}

/**
 * A stored descriptor in exactly the shape `src/app/api/upload/route.ts:102-110` writes and
 * `FileItem` (`src/components/custom-fields/file-field.tsx:14-22`) declares. `path` is the ABSOLUTE
 * local path in that shape, and `publicUrl` is the download URL — both faithful, so nothing about
 * this fixture is a convenience.
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

/** A's JSONB: one descriptor under each of two fields. The second field is what makes WRONG FIELD real. */
const CUSTOM_FIELDS_A = {
  [FIELD_MAIN]: [descriptor(ORG_A, FIELD_MAIN, STORED_A_MAIN, BYTES_A_MAIN)],
  [FIELD_OTHER]: [descriptor(ORG_A, FIELD_OTHER, STORED_A_OTHER, BYTES_A_OTHER)],
}
const CUSTOM_FIELDS_B = {
  [FIELD_MAIN]: [descriptor(ORG_B, FIELD_MAIN, STORED_B_MAIN, BYTES_B_MAIN)],
}
const CUSTOM_FIELDS_T = {
  [FIELD_MAIN]: [descriptor(ORG_T, FIELD_MAIN, STORED_T_MAIN, BYTES_T_MAIN)],
}

const TOUCHED_TABLES = ["users", "organizations", "audit_log"] as const

/**
 * How a leftover fixture row is RECOGNISED, per table.
 *
 * `audit_log.id` is a generated UUID, so an id-prefix check on that table would report zero no
 * matter how many rows leaked — a vacuous half of the assertion that exists to catch a leak. It is
 * recognised by its fixture LINKS instead. This route writes no audit row today; the predicate is
 * here so that a future one cannot leak silently.
 */
const LEFTOVER_PREDICATE: Record<(typeof TOUCHED_TABLES)[number], ReturnType<typeof sql>> = {
  users: sql`id like ${LIKE_PREFIX}`,
  organizations: sql`id like ${LIKE_PREFIX} or owner_id like ${LIKE_PREFIX}`,
  audit_log: sql`entity_id like ${LIKE_PREFIX} or actor_user_id like ${LIKE_PREFIX}`,
}

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

async function removeFixtures(): Promise<void> {
  // Foreign-key order: audit rows first, then the records, then the users they point at.
  await db.delete(auditLog).where(like(auditLog.entityId, LIKE_PREFIX))
  await db.delete(auditLog).where(like(auditLog.actorUserId, LIKE_PREFIX))
  await db.delete(organizations).where(like(organizations.ownerId, LIKE_PREFIX))
  await db.delete(organizations).where(like(organizations.id, LIKE_PREFIX))
  await db.delete(users).where(like(users.id, LIKE_PREFIX))
}

/** Put every seeded file back on disk with its original contents, creating directories as needed. */
function writeSeededBlobs(): void {
  for (const blob of SEEDED_BLOBS) {
    const target = blobPath(blob.entityId, blob.fieldName, blob.storedName)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, blob.bytes)
  }
}

/**
 * PUT EVERY FIXTURE ROW AND EVERY BYTE BACK, BEFORE EVERY CELL — and this is not tidiness, it is
 * what stops the file lying about itself.
 *
 * MEASURED, in `src/lib/execution/actions/crm-ownership.db.test.ts:348-395`: a restore that covers
 * the fields a cell WRITES but not the field a cell TRANSFERS is not a restore. CR-04's second cell
 * moved a fixture deal's `ownerId` to another user and SUCCEEDED against the unfixed handler; every
 * subsequent cell then threw "No deal found" — **five cascaded reds for one defect, with the
 * positive anchors reporting the wrong cause.**
 *
 * Phase 49's version of that field is `customFields`, plus `deletedAt` and `ownerId`, and — because
 * this route's `DELETE` unlinks REAL FILES — the bytes on disk. A cell that deletes a blob and does
 * not put it back turns the next cell's "the victim's blob is still there" barrier into a false red
 * naming the wrong defect. The DELETE positive anchor deletes a real file on every run, so this is
 * not hypothetical here: without the rewrite below, the symmetry cells would fail second.
 *
 * Restored by direct SQL, never through a mutation: the route is what is under test.
 */
async function restoreFixtureRows(): Promise<void> {
  await db
    .update(organizations)
    .set({ customFields: CUSTOM_FIELDS_A, deletedAt: null, ownerId: USER_A })
    .where(sql`${organizations.id} = ${ORG_A}`)
  await db
    .update(organizations)
    .set({ customFields: CUSTOM_FIELDS_B, deletedAt: null, ownerId: USER_B })
    .where(sql`${organizations.id} = ${ORG_B}`)
  await db
    .update(organizations)
    .set({ customFields: CUSTOM_FIELDS_T, deletedAt: TRASHED_AT, ownerId: USER_A })
    .where(sql`${organizations.id} = ${ORG_T}`)

  writeSeededBlobs()
}

/* ---------------------------------------------------------------------------
 * Invoking the real handlers
 * ------------------------------------------------------------------------ */

interface HandlerResult {
  readonly status: number
  /** The response body, as BYTES. Every disclosure assertion in this file is made against this. */
  readonly body: Buffer
}

/**
 * One real handler invocation as `userId`.
 *
 * `params` is a promise because that is the Next.js 15+ signature the route destructures. The
 * segments are passed through UNDECODED-BY-ROUTING, exactly as 49-04's unit file does, so the
 * handler is asserted safe against its own inputs regardless of what routing normalises — research
 * Assumption A3 is not depended on either way.
 */
async function requestAs(
  verb: "GET" | "DELETE",
  userId: string,
  entityId: string,
  fieldName: string,
  filename: string,
): Promise<HandlerResult> {
  authState.userId = userId

  const url =
    `http://localhost/api/files/${encodeURIComponent(entityId)}` +
    `/${encodeURIComponent(fieldName)}/${encodeURIComponent(filename)}`
  const request = new NextRequest(url, { method: verb })
  const params = Promise.resolve({ entityId, fieldName, filename })

  const response = verb === "GET" ? await GET(request, { params }) : await DELETE(request, { params })

  return { status: response.status, body: Buffer.from(await response.arrayBuffer()) }
}

/**
 * The one refusal this route gives for every reason a file is not servable.
 *
 * NOTE, and it is a correction to this plan's own text: the plan asks for "a zero-byte body". The
 * shipped route answers every refusal with `NextResponse.json({ error: 'File not found' }, 404)` —
 * by 49-04's deliberate decision, so that a foreign record is byte-indistinguishable from a missing
 * one and the status is not an existence oracle. A literal zero-byte assertion would therefore FAIL
 * against correct code. The claim SC-1 actually needs is that the body carries **zero bytes OF THE
 * VICTIM'S FILE**, and that is what is asserted: byte-equality with this constant, plus a direct
 * `Buffer.includes` search for the victim's real contents.
 */
const REFUSAL_BODY = Buffer.from(JSON.stringify({ error: "File not found" }))

/** A barrier: the row really is there, owned by whom this file thinks, in the state this file thinks. */
async function readOrganizationRow(id: string): Promise<{
  id: string
  owner_id: string
  deleted_at: string | null
} | null> {
  const rows = (await db.execute(
    sql`select id, owner_id, deleted_at from organizations where id = ${id}`,
  )) as unknown as Array<{ id: string; owner_id: string; deleted_at: string | null }>

  return rows.length === 0 ? null : rows[0]
}

/** Asserts a refusal disclosed nothing: the canonical body, and not one byte of the victim's file. */
function expectRefusalDisclosedNothing(result: HandlerResult, victimBytes: Buffer, why: string): void {
  expect(
    result.body.includes(victimBytes),
    `${why} — the response body CONTAINS the victim's file contents. A status-code assertion would ` +
      "not have seen this; the bytes are the claim.",
  ).toBe(false)
  expect(
    result.body.equals(REFUSAL_BODY),
    `${why} — the refusal body is not the canonical one, so this answer is distinguishable from the ` +
      "answer a genuinely absent file gets, which is an existence oracle.",
  ).toBe(true)
  expect(result.status, `${why} — expected the uniform 404 refusal.`).toBe(404)
}

/* ---------------------------------------------------------------------------
 * Setup / teardown
 * ------------------------------------------------------------------------ */

/** Totals before the run, re-asserted afterwards: a prefix query cannot see a MUTATED row. */
const baseline: Record<string, number> = {}

beforeAll(async () => {
  // CLEAN FIRST, THEN MEASURE, and the ORDER is the whole point: `afterAll` compares against
  // `baseline`, so a run killed after `beforeAll` (Ctrl-C, container restart, OOM) would otherwise
  // convert itself into a false RED on the NEXT run.
  await removeFixtures()

  for (const table of TOUCHED_TABLES) baseline[table] = await countAll(table)

  await db.insert(users).values([
    {
      id: USER_A,
      email: `${PREFIX}a@local.test`,
      name: "Files A",
      role: "member",
      status: "approved",
    },
    {
      id: USER_B,
      email: `${PREFIX}b@local.test`,
      name: "Files B",
      role: "member",
      status: "approved",
    },
  ])

  await db.insert(organizations).values([
    { id: ORG_A, name: `${PREFIX}Org A`, ownerId: USER_A, customFields: CUSTOM_FIELDS_A },
    { id: ORG_B, name: `${PREFIX}Org B`, ownerId: USER_B, customFields: CUSTOM_FIELDS_B },
    {
      id: ORG_T,
      name: `${PREFIX}Org Trashed`,
      ownerId: USER_A,
      customFields: CUSTOM_FIELDS_T,
      deletedAt: TRASHED_AT,
    },
  ])

  writeSeededBlobs()
}, 60_000)

beforeEach(async () => {
  await restoreFixtureRows()
})

afterAll(async () => {
  await removeFixtures()

  for (const table of TOUCHED_TABLES) {
    expect(await countLeftovers(table)).toBe(0)
    expect(await countAll(table)).toBe(baseline[table])
  }

  // The bytes are fixtures too. A teardown that removes rows and leaves files behind is half a
  // teardown, and the leftovers would be real documents in a real temp directory.
  rmSync(UPLOAD_ROOT, { recursive: true, force: true })
  expect(existsSync(UPLOAD_ROOT)).toBe(false)
}, 60_000)

/* ---------------------------------------------------------------------------
 * The harness, asserted rather than assumed
 * ------------------------------------------------------------------------ */

describe("the connection guard — the thing that makes hard-deleting rows here safe", () => {
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

  it("accepts the isolated database this run is actually pointed at", () => {
    expect(assertIsolatedConnection(process.env.DATABASE_URL)).toBe(process.env.DATABASE_URL)
  })
})

describe("PRE-FLIGHT: the premises every cell below rests on", () => {
  it("the named integers are non-zero and agree with the seed", () => {
    expect(
      REFERENCED_BLOBS,
      "a floor of zero referenced blobs would make every 'the bytes were really there' barrier in " +
        "this file satisfiable by an empty disk.",
    ).toBeGreaterThan(0)
    expect(UNREFERENCED_BLOBS).toBeGreaterThan(0)
    expect(SEEDED_ORGANIZATIONS).toBeGreaterThan(0)
    expect(REFERENCED_BLOBS + UNREFERENCED_BLOBS).toBe(SEEDED_BLOB_TOTAL)
    expect(SEEDED_BLOBS).toHaveLength(SEEDED_BLOB_TOTAL)
    expect(SEEDED_BLOBS.filter((b) => b.referenced)).toHaveLength(REFERENCED_BLOBS)
    expect(SEEDED_BLOBS.filter((b) => !b.referenced)).toHaveLength(UNREFERENCED_BLOBS)
  })

  it(`every one of the ${SEEDED_BLOB_TOTAL} seeded files is on disk with its own distinct contents`, () => {
    for (const blob of SEEDED_BLOBS) {
      const target = blobPath(blob.entityId, blob.fieldName, blob.storedName)
      expect(existsSync(target), `${target} is missing — the seed did not take.`).toBe(true)
      expect(readFileSync(target).equals(blob.bytes), `${target} holds the wrong bytes.`).toBe(true)
    }

    // Distinctness, asserted rather than eyeballed: a body assertion against duplicated bytes would
    // be satisfied by the WRONG file.
    const distinct = new Set(SEEDED_BLOBS.map((b) => b.bytes.toString("utf8")))
    expect(distinct.size).toBe(SEEDED_BLOB_TOTAL)
  })

  it(`holds exactly ${SEEDED_ORGANIZATIONS} seeded organizations, by direct SQL, in the states the cells assume`, async () => {
    const rows = (await db.execute(
      sql`select id, owner_id, deleted_at from organizations where id like ${LIKE_PREFIX} order by id`,
    )) as unknown as Array<{ id: string; owner_id: string; deleted_at: string | null }>

    expect(rows).toHaveLength(SEEDED_ORGANIZATIONS)
    expect(rows.find((r) => r.id === ORG_A)).toMatchObject({ owner_id: USER_A, deleted_at: null })
    expect(rows.find((r) => r.id === ORG_B)).toMatchObject({ owner_id: USER_B, deleted_at: null })
    expect(rows.find((r) => r.id === ORG_T)?.owner_id).toBe(USER_A)
    expect(
      rows.find((r) => r.id === ORG_T)?.deleted_at,
      "ORG_T must be TRASHED, otherwise the trashed-record cell is testing an ordinary record.",
    ).not.toBeNull()
    expect(await readOrganizationRow(MISSING_ORG)).toBeNull()
  })

  it("runs against LOCAL storage, which is the only configuration SC-1 is claimed for", () => {
    expect(
      process.env.FILE_STORAGE ?? "local",
      "under FILE_STORAGE=s3 nothing reads through this route (SEC-49-A) and every refusal below " +
        "would pass for the wrong reason. This file makes no S3 claim.",
    ).toBe("local")
  })

  it("THE ROUTE RESOLVED THE TEMP UPLOAD_DIR, not the /tmp/uploads default — the cell that stops this whole file passing vacuously", async () => {
    // (1) the env var is still the one `vi.hoisted` set.
    expect(process.env.UPLOAD_DIR).toBe(UPLOAD_ROOT)
    expect(UPLOAD_ROOT).not.toBe(DEFAULT_UPLOAD_DIR)

    // (2) the DEFAULT path holds nothing, so a 200 below cannot have come from it.
    expect(
      existsSync(path.join(DEFAULT_UPLOAD_DIR, ORG_A, FIELD_MAIN, STORED_A_MAIN)),
      "the fallback upload directory already holds this fixture path, so this cell cannot " +
        "distinguish the temp directory from the default. Clear it before trusting this file.",
    ).toBe(false)

    // (3) the TEMP path does.
    expect(existsSync(blobPath(ORG_A, FIELD_MAIN, STORED_A_MAIN))).toBe(true)

    // (4) and the route serves those exact bytes. (2)+(3)+(4) can only hold together if the module
    // -level UPLOAD_DIR read resolved the temp directory.
    const result = await requestAs("GET", USER_A, ORG_A, FIELD_MAIN, STORED_A_MAIN)
    expect(result.status).toBe(200)
    expect(
      result.body.equals(BYTES_A_MAIN),
      "the route served bytes that are not the temp directory's copy. If UPLOAD_DIR had been set " +
        "too late, this would be a 404 and every refusal cell in this file would be vacuous.",
    ).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * The positive anchors — without these, every refusal below is satisfied by a
 * route that serves nothing at all.
 * ------------------------------------------------------------------------ */

describe("POSITIVE ANCHORS: the owner's own file really is served, and really is deleted", () => {
  it("GET: A's own referenced file comes back with its REAL BYTES, not merely a 200", async () => {
    const result = await requestAs("GET", USER_A, ORG_A, FIELD_MAIN, STORED_A_MAIN)

    expect(result.status).toBe(200)
    expect(
      result.body.equals(BYTES_A_MAIN),
      "a 200 carrying zero bytes would satisfy a status-only anchor, and then every 'returns " +
        "nothing' cell below would be satisfied by a route that returns nothing to anybody. The " +
        "anchor asserts CONTENT for that reason.",
    ).toBe(true)
    expect(result.body.byteLength).toBe(BYTES_A_MAIN.byteLength)
  })

  it("DELETE: A's own SECOND referenced file is really unlinked from the real filesystem", async () => {
    const target = blobPath(ORG_A, FIELD_OTHER, STORED_A_OTHER)
    expect(existsSync(target), "barrier: the file must exist before a deletion can mean anything.").toBe(
      true,
    )

    const result = await requestAs("DELETE", USER_A, ORG_A, FIELD_OTHER, STORED_A_OTHER)

    expect(result.status).toBe(200)
    expect(
      existsSync(target),
      "the owner's own DELETE did not remove the file. Every 'the victim's blob survives' assertion " +
        "in this file is satisfied by a DELETE that never unlinks anything; this is what rules that out.",
    ).toBe(false)
    // The SECOND descriptor is used precisely so the GET anchor's file survives for the cells below.
    expect(existsSync(blobPath(ORG_A, FIELD_MAIN, STORED_A_MAIN))).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * THE DEFECT — SC-1 itself, both verbs, both directions.
 * ------------------------------------------------------------------------ */

describe("SC-1: a file belonging to a record the caller may not see returns no bytes", () => {
  it("GET: A is refused B's file, and the response carries none of B's bytes", async () => {
    // BARRIERS, in this cell, because a 404 for something that was not there proves nothing.
    const victim = await readOrganizationRow(ORG_B)
    expect(victim, "barrier: B's record must really exist for the refusal to be about ownership.").not.toBeNull()
    expect(victim?.owner_id).toBe(USER_B)
    expect(victim?.deleted_at, "barrier: B's record must be LIVE, not trashed.").toBeNull()
    const victimPath = blobPath(ORG_B, FIELD_MAIN, STORED_B_MAIN)
    expect(
      existsSync(victimPath) && readFileSync(victimPath).equals(BYTES_B_MAIN),
      "barrier: B's real bytes must be on disk, otherwise a 404 is just a missing file.",
    ).toBe(true)

    const result = await requestAs("GET", USER_A, ORG_B, FIELD_MAIN, STORED_B_MAIN)

    expectRefusalDisclosedNothing(result, BYTES_B_MAIN, "A requested B's file")
  })

  it("DELETE: A is refused B's file, and B's BLOB IS STILL ON DISK afterwards", async () => {
    const victimPath = blobPath(ORG_B, FIELD_MAIN, STORED_B_MAIN)
    expect(existsSync(victimPath), "barrier: the victim's blob must exist before the attempt.").toBe(true)

    const result = await requestAs("DELETE", USER_A, ORG_B, FIELD_MAIN, STORED_B_MAIN)

    // The barrier is the VICTIM's blob, not the attacker's. `trigger-owner-scope.db.test.ts:786-820`
    // measured the alternative: a barrier taken from the attacker's own row fails on a LATER
    // assertion than the one describing the defect, and names the wrong cause.
    expect(
      existsSync(victimPath),
      "A's refused DELETE removed B's file anyway. The status code alone would not have shown this.",
    ).toBe(true)
    expect(readFileSync(victimPath).equals(BYTES_B_MAIN)).toBe(true)
    expect(result.status).toBe(404)
    expect(result.body.equals(REFUSAL_BODY)).toBe(true)
  })

  it("SYMMETRY, GET: B is refused A's file too — the guard is not one-directional", async () => {
    const victim = await readOrganizationRow(ORG_A)
    expect(victim?.owner_id, "barrier: A's record must be owned by A for this to be a crossing.").toBe(USER_A)
    const victimPath = blobPath(ORG_A, FIELD_MAIN, STORED_A_MAIN)
    expect(existsSync(victimPath) && readFileSync(victimPath).equals(BYTES_A_MAIN)).toBe(true)

    const result = await requestAs("GET", USER_B, ORG_A, FIELD_MAIN, STORED_A_MAIN)

    expectRefusalDisclosedNothing(result, BYTES_A_MAIN, "B requested A's file")
  })

  it("SYMMETRY, DELETE: B is refused A's file, and A's blob survives", async () => {
    const victimPath = blobPath(ORG_A, FIELD_MAIN, STORED_A_MAIN)
    expect(existsSync(victimPath)).toBe(true)

    const result = await requestAs("DELETE", USER_B, ORG_A, FIELD_MAIN, STORED_A_MAIN)

    expect(
      existsSync(victimPath),
      "B's refused DELETE removed A's file anyway — the destructive verb is the worse half of this defect.",
    ).toBe(true)
    expect(readFileSync(victimPath).equals(BYTES_A_MAIN)).toBe(true)
    expect(result.status).toBe(404)
  })
})

/* ---------------------------------------------------------------------------
 * The other three terms of the guard, each with its own behavioural cell.
 * ------------------------------------------------------------------------ */

describe("the trashed-record decision, proven behaviourally", () => {
  it("A is refused A's OWN file when the record is soft-deleted, and the row is asserted still present", async () => {
    // BARRIER: the row is still in the table with a non-null `deleted_at`, so the 404 is
    // attributable to the `isNull(deletedAt)` term and NOT to a missing row. Recorded as a decision
    // in `file-access.ts`'s header along with its consequence: a /trash restore-review flow that
    // wants to show a trashed record's attachments now gets a 404 for every one of them. If that
    // ever matters it is a separate, narrower read path — not a widening of this guard — and this
    // cell is what a future change to that decision has to come through.
    const row = await readOrganizationRow(ORG_T)
    expect(row, "barrier: the trashed record must still BE there.").not.toBeNull()
    expect(row?.owner_id, "barrier: and it must be the CALLER's own record.").toBe(USER_A)
    expect(row?.deleted_at, "barrier: and it must be trashed.").not.toBeNull()

    const trashedPath = blobPath(ORG_T, FIELD_MAIN, STORED_T_MAIN)
    expect(existsSync(trashedPath), "barrier: and the bytes must be on disk.").toBe(true)

    const result = await requestAs("GET", USER_A, ORG_T, FIELD_MAIN, STORED_T_MAIN)

    expectRefusalDisclosedNothing(result, BYTES_T_MAIN, "A requested a file on A's own TRASHED record")
    expect(existsSync(trashedPath)).toBe(true)
  })
})

describe("the JSONB reference match, proven behaviourally", () => {
  it("A is refused a file that is really on disk in A's OWN field directory but absent from A's JSONB", async () => {
    const target = blobPath(ORG_A, FIELD_MAIN, STORED_UNREFERENCED)
    expect(
      existsSync(target),
      "barrier: the unreferenced file must really be on disk, in the caller's OWN field directory. " +
        "Otherwise this cell is refusing something that was never there and the reference match is " +
        "not what produced the 404.",
    ).toBe(true)
    expect(readFileSync(target).equals(BYTES_UNREFERENCED)).toBe(true)

    const result = await requestAs("GET", USER_A, ORG_A, FIELD_MAIN, STORED_UNREFERENCED)

    expectRefusalDisclosedNothing(result, BYTES_UNREFERENCED, "A requested an unreferenced file in its own directory")
    expect(existsSync(target), "and the bytes are still there afterwards.").toBe(true)
  })

  it("A is refused its OWN storedName under a DIFFERENT field that also exists on the record — the match is per FIELD", async () => {
    // The cross-field blob exists so that this refusal can only come from the per-field reference
    // match. Without those bytes the route would answer 404 from `existsSync` and this cell would
    // stay green with the reference match removed entirely.
    const crossField = blobPath(ORG_A, FIELD_OTHER, STORED_A_MAIN)
    expect(
      existsSync(crossField) && readFileSync(crossField).equals(BYTES_CROSSFIELD),
      "barrier: real bytes must sit at the wrong-field path, or this cell passes for the wrong reason.",
    ).toBe(true)

    const result = await requestAs("GET", USER_A, ORG_A, FIELD_OTHER, STORED_A_MAIN)

    expectRefusalDisclosedNothing(result, BYTES_CROSSFIELD, "A requested its own storedName under the wrong field")
    expect(existsSync(crossField)).toBe(true)
  })
})

describe("the answer is not an existence oracle", () => {
  it("the missing-record 404 is BYTE-IDENTICAL to the foreign-record 404", async () => {
    expect(
      await readOrganizationRow(MISSING_ORG),
      "barrier: the 'missing' id must really name no row.",
    ).toBeNull()
    expect(await readOrganizationRow(ORG_B), "barrier: the foreign id must really name one.").not.toBeNull()

    const foreign = await requestAs("GET", USER_A, ORG_B, FIELD_MAIN, STORED_B_MAIN)
    const missing = await requestAs("GET", USER_A, MISSING_ORG, FIELD_MAIN, STORED_B_MAIN)

    expect(foreign.status).toBe(missing.status)
    expect(
      missing.body.equals(foreign.body),
      "a caller can distinguish 'exists but is not yours' from 'does not exist', which confirms " +
        "which record ids exist. Phase 48's SEC-48-A settled that this route must not.",
    ).toBe(true)
    expect(foreign.body.equals(REFUSAL_BODY)).toBe(true)
  })
})
