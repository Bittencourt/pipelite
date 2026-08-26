/**
 * SEC-04 / ROADMAP SC-1 — the file download route's ownership guard, containment, and both verbs.
 *
 * ## What was wrong, and what this file proves
 *
 * `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` authenticated and then stopped.
 * Both handlers were `const session = await auth(); if (!session?.user) return 401` and then
 * nothing — no record read, no ownership term, no containment. `GET` served the bytes and `DELETE`
 * unlinked them, for ANY signed-in caller holding ANY file's URL. The cells below invoke those two
 * exported handlers directly and assert, behaviourally, that a caller who does not own the record
 * gets a 404 and that `readFile` / `unlink` were never reached.
 *
 * ## Why the handlers are invoked DIRECTLY rather than through a URL
 *
 * A handler must be safe against its own inputs. Beyond that, `49-RESEARCH.md`'s Assumptions Log
 * A3 could not determine whether Next.js normalises `%2e%2e%2f` into `..` before a handler sees
 * `params` — the shipped 401 fired first, so it was never observable. Invoking the handler with a
 * crafted `params` promise removes the dependency on that answer entirely: whatever routing does or
 * does not normalise, the handler is asserted safe against BOTH spellings.
 *
 * ## Why there is not one source-text assertion in this file
 *
 * A `toContain` over the route's own text would be satisfied by the COMMENT that explains the rule:
 * a comment naming `../../../etc/passwd` contains `../../../etc/passwd`. Fifteen gates in this
 * project have gone green by matching their own prose. Nothing here reads a file from disk. The
 * proof is a handler invocation plus a spy, and every "was never called" assertion below is paired
 * with a positive-anchor cell in which the same spy IS called exactly once — otherwise a handler
 * that reads nothing at all would satisfy the whole file.
 *
 * ## Why the database mock EVALUATES the predicate instead of resolving `undefined`
 *
 * This is the load-bearing decision of the file. `findFirst.mockResolvedValue(undefined)` for the
 * foreign record would encode the CONCLUSION ("the scoped query finds nothing") as the PREMISE, and
 * the foreign cells would then pass identically against a resolver with no owner term at all. Plan
 * 49-03 measured exactly that failure: dropping the owner term from its predicate was caught by
 * nothing, 30/30 green. So `evaluateFindFirst` below compiles the `where` the resolver actually
 * built with a real `PgDialect` and answers the way PostgreSQL would — a lookup scoped by `id`
 * alone is handed the FOREIGN row. The refusal can therefore only come from the resolver's own
 * predicate. Both polarities are asserted in the self-test describe at the bottom, and the
 * ownership cells are parameterised over all four CRM tables so that dropping the owner term from
 * ANY ONE of the four reddens a cell that names that table.
 *
 * ## Scope: `FILE_STORAGE=local` only
 *
 * Under `FILE_STORAGE=s3` the stored `publicUrl` is `${S3_PUBLIC_URL}/${key}`
 * (`src/app/api/upload/route.ts:89`), so reads never traverse this route and the guard has no
 * traffic to protect there. That gap is **SEC-49-A** and is not this plan's work. `FILE_STORAGE` is
 * unset in this deployment, so `'local'` is the configuration under test and the only one asserted.
 * No cell in this file may be read as evidence about S3.
 *
 * ## Placement
 *
 * `src/app/api/files/` had no test file and no test directory, so either choice was new here.
 * `__tests__/` was chosen because it matches the `src/app/api/v1/**\/__tests__/` convention
 * immediately next door. Stated rather than decided silently.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import path from "path"

/**
 * The session, mutable so one cell can switch identity. Restored in `beforeEach` — a cell that
 * changes identity and does not put it back is how Phase 48 got five cascaded reds from one defect.
 */
const authState = vi.hoisted(() => ({
  session: { user: { id: "user-1" } } as unknown,
}))

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => authState.session),
}))

const readFileMock = vi.hoisted(() => vi.fn())
const unlinkMock = vi.hoisted(() => vi.fn())
const existsSyncMock = vi.hoisted(() => vi.fn(() => true))

// `fs` and `fs/promises` are spread from the real modules rather than replaced: this graph pulls in
// `next/server`, and a bare `{ existsSync }` factory would remove every other export those modules
// legitimately provide.
vi.mock("fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("fs/promises")>()
  return { ...actual, readFile: readFileMock, unlink: unlinkMock }
})

vi.mock("fs", async importOriginal => {
  const actual = await importOriginal<typeof import("fs")>()
  return { ...actual, existsSync: existsSyncMock }
})

vi.mock("@/db", () => ({
  db: {
    query: {
      deals: { findFirst: vi.fn() },
      people: { findFirst: vi.fn() },
      organizations: { findFirst: vi.fn() },
      activities: { findFirst: vi.fn() },
    },
  },
}))

import { PgDialect } from "drizzle-orm/pg-core"
import { and, eq, isNull, type SQL } from "drizzle-orm"
// A RUNTIME import: `@/db/schema` is NOT mocked, and the self-test below needs the real column
// objects to build the same expressions the resolver builds.
import { organizations } from "@/db/schema"
import type { EntityType } from "@/db/schema/custom-fields"
import { db } from "@/db"

import { resolveContainedPath } from "@/lib/api/file-access"
import {
  GET,
  DELETE,
} from "@/app/api/files/[entityId]/[fieldName]/[filename]/route"

/* ------------------------------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------------------------------ */

/**
 * The same expression the route reads at module scope. The route's `UPLOAD_DIR` is module-level and
 * pinned by `compose-uploads-persistence.test.ts`, so this file does NOT try to change it — it
 * mirrors it, and every path assertion is relative so it holds whatever the ambient value is.
 */
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/uploads"

/**
 * A file field name with a space and a non-ASCII character, because the live deployment's field
 * names are Portuguese, and with NO forward slash, because a field name containing `/` cannot
 * round-trip through a three-segment route at all.
 */
const FILE_FIELD = "Anexos Ação"
/** A SECOND file field on the same record, so "the match is per field" has something to fail on. */
const OTHER_FIELD = "Contrato Assinado"

const OWNED_STORED = "9f1c0d4e-6b21-4f77-a0aa-000000000001.pdf"
const OTHER_FIELD_STORED = "c3d40000-6b21-4f77-a0aa-000000000002.pdf"
const FOREIGN_STORED = "5a2b7e10-6b21-4f77-a0aa-000000000003.pdf"

const CALLER = "user-1"
const OTHER_USER = "user-9"

/** The bytes the owner's own file contains, so the positive anchor asserts a real payload. */
const OWNED_BYTES = "the owner's own contract"

type Row = {
  id: string
  ownerId: string
  deletedAt: Date | null
  customFields: Record<string, unknown> | null
}

/** One descriptor exactly as `src/app/api/upload/route.ts:59-102` mints them. */
function descriptor(storedName: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `desc-${storedName}`,
    filename: "Contrato.pdf",
    storedName,
    path: `${UPLOAD_DIR}/x/y/${storedName}`,
    publicUrl: `/api/files/x/y/${storedName}`,
    size: 1234,
    mimeType: "application/pdf",
    ...overrides,
  }
}

/** One mocked `findFirst` return value; every cell overrides one field, in `present.test.ts`'s style. */
function ownedRecord(overrides: Partial<Row> = {}): Row {
  return {
    id: "record-owned",
    ownerId: CALLER,
    deletedAt: null,
    customFields: {
      [FILE_FIELD]: [descriptor(OWNED_STORED)],
      [OTHER_FIELD]: [descriptor(OTHER_FIELD_STORED)],
    },
    ...overrides,
  }
}

const ENTITY_TYPES: readonly EntityType[] = ["deal", "person", "organization", "activity"]

/** The SQL table name each entity type's rows live in, and the relational query key. */
const TABLE_NAME: Readonly<Record<EntityType, string>> = Object.freeze({
  deal: "deals",
  person: "people",
  organization: "organizations",
  activity: "activities",
} satisfies Record<EntityType, string>)

/** The `db.query.*` relational key, narrowed so a typo cannot address a table that does not exist. */
type QueryKey = "deals" | "people" | "organizations" | "activities"

const QUERY_KEY: Readonly<Record<EntityType, QueryKey>> = Object.freeze({
  deal: "deals",
  person: "people",
  organization: "organizations",
  activity: "activities",
} satisfies Record<EntityType, QueryKey>)

const OWNED_ID: Readonly<Record<EntityType, string>> = Object.freeze({
  deal: "deal-owned",
  person: "person-owned",
  organization: "org-owned",
  activity: "activity-owned",
} satisfies Record<EntityType, string>)

const FOREIGN_ID: Readonly<Record<EntityType, string>> = Object.freeze({
  deal: "deal-foreign",
  person: "person-foreign",
  organization: "org-foreign",
  activity: "activity-foreign",
} satisfies Record<EntityType, string>)

/** A record the caller owns but has TRASHED. Its file is refused by decision — see the route. */
const TRASHED_ID = "org-trashed"
const TRASHED_STORED = "aaaa0000-6b21-4f77-a0aa-000000000004.pdf"

/** Every row the fake database holds, keyed by SQL table name. */
function buildRows(): Record<string, Row[]> {
  const rows: Record<string, Row[]> = {
    deals: [],
    people: [],
    organizations: [],
    activities: [],
  }

  for (const type of ENTITY_TYPES) {
    rows[TABLE_NAME[type]].push(ownedRecord({ id: OWNED_ID[type] }))
    rows[TABLE_NAME[type]].push(
      ownedRecord({
        id: FOREIGN_ID[type],
        ownerId: OTHER_USER,
        customFields: { [FILE_FIELD]: [descriptor(FOREIGN_STORED)] },
      })
    )
  }

  rows.organizations.push(
    ownedRecord({
      id: TRASHED_ID,
      deletedAt: new Date("2026-08-01T00:00:00Z"),
      customFields: { [FILE_FIELD]: [descriptor(TRASHED_STORED)] },
    })
  )

  return rows
}

/* ------------------------------------------------------------------------------------------ *
 * The predicate-evaluating database
 * ------------------------------------------------------------------------------------------ */

const COLUMN_TO_KEY: Record<string, keyof Row> = {
  id: "id",
  owner_id: "ownerId",
  deleted_at: "deletedAt",
}

/**
 * Answer a `findFirst` the way PostgreSQL would, from the compiled predicate.
 *
 * A predicate with NO recognised constraint is modelled as an unfiltered read and returns the FIRST
 * row of the table, because that is what `.where(undefined)` actually does in drizzle. So a
 * resolver that lost its scope does not get a convenient `undefined` here.
 */
function evaluateFindFirst(
  tableName: string,
  rows: readonly Row[],
  args?: { where?: unknown }
): Row | undefined {
  if (args?.where === undefined) return rows[0]

  const compiled = new PgDialect().sqlToQuery(args.where as SQL)
  const params = compiled.params as unknown[]

  const equality = new RegExp(`"${tableName}"\\."(\\w+)" = \\$(\\d+)`, "g")
  const isNullTerm = new RegExp(`"${tableName}"\\."(\\w+)" is null`, "g")

  const constraints: Array<(row: Row) => boolean> = []

  for (const [, column, index] of compiled.sql.matchAll(equality)) {
    const key = COLUMN_TO_KEY[column]
    if (key === undefined) continue
    const bound = params[Number(index) - 1]
    constraints.push(row => row[key] === bound)
  }

  for (const [, column] of compiled.sql.matchAll(isNullTerm)) {
    const key = COLUMN_TO_KEY[column]
    if (key === undefined) continue
    constraints.push(row => row[key] === null)
  }

  return rows.find(row => constraints.every(holds => holds(row)))
}

const mockDb = db as unknown as {
  query: Record<string, { findFirst: ReturnType<typeof vi.fn> }>
}

/** Every `findFirst` call this test observed, across all four tables. */
function totalFindFirstCalls(): number {
  return ENTITY_TYPES.reduce(
    (sum, type) => sum + mockDb.query[QUERY_KEY[type]].findFirst.mock.calls.length,
    0
  )
}

/* ------------------------------------------------------------------------------------------ *
 * Invocation helpers
 * ------------------------------------------------------------------------------------------ */

function invoke(
  handler: typeof GET | typeof DELETE,
  entityId: string,
  fieldName: string,
  filename: string
) {
  const request = new NextRequest("http://localhost:3000/api/files/e/f/n")
  return handler(request, { params: Promise.resolve({ entityId, fieldName, filename }) })
}

/** The refusal body every new 404 must carry — byte-identical to the missing-file answer. */
const NOT_FOUND_BODY = { error: "File not found" }

/**
 * ASSERTION ORDER IS DELIBERATE THROUGHOUT THIS FILE: in every refusal cell the FILESYSTEM spy is
 * checked BEFORE the status code.
 *
 * A `expect(status).toBe(404)` placed first fires first and MASKS the barrier — the red then says
 * "expected 200 to be 404" and never reveals whether the handler actually read or unlinked the
 * file. 49-02's RED 7 records that exact masking, where a count assertion hid whether the escape
 * target was really unlinked and the barrier had to be re-checked under a relaxed assertion to know.
 * Ordering the spy first makes every red name the dangerous call and its resolved path.
 */
function expectNoFilesystemTouch(): void {
  expect(readFileMock).not.toHaveBeenCalled()
  expect(unlinkMock).not.toHaveBeenCalled()
  expect(existsSyncMock).not.toHaveBeenCalled()
}

beforeEach(() => {
  authState.session = { user: { id: CALLER } }

  readFileMock.mockReset()
  readFileMock.mockResolvedValue(Buffer.from(OWNED_BYTES))
  unlinkMock.mockReset()
  unlinkMock.mockResolvedValue(undefined)
  existsSyncMock.mockReset()
  existsSyncMock.mockReturnValue(true)

  const rows = buildRows()
  for (const type of ENTITY_TYPES) {
    const table = TABLE_NAME[type]
    const findFirst = mockDb.query[QUERY_KEY[type]].findFirst
    findFirst.mockReset()
    findFirst.mockImplementation(async (args?: { where?: unknown }) =>
      evaluateFindFirst(table, rows[table], args)
    )
  }
})

/* ------------------------------------------------------------------------------------------ *
 * Ownership, per table, both verbs
 *
 * Parameterised over all four CRM tables ON PURPOSE. 49-03's finding was that a single rendered
 * predicate assertion covered one route out of several, so dropping the owner term elsewhere was
 * caught by nothing. Here, dropping `eq(table.ownerId, userId)` from any ONE of the four entries
 * reddens the two foreign cells that name that table and nothing else.
 * ------------------------------------------------------------------------------------------ */

describe.each(ENTITY_TYPES)("ownership on %s", type => {
  it("serves the caller's OWN referenced file, and reads it exactly once", async () => {
    const response = await invoke(GET, OWNED_ID[type], FILE_FIELD, OWNED_STORED)

    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe(OWNED_BYTES)
    expect(readFileMock).toHaveBeenCalledTimes(1)
    expect(readFileMock.mock.calls[0][0]).toBe(
      path.resolve(UPLOAD_DIR, OWNED_ID[type], FILE_FIELD, OWNED_STORED)
    )
  })

  it("unlinks the caller's OWN referenced file exactly once on DELETE", async () => {
    const response = await invoke(DELETE, OWNED_ID[type], FILE_FIELD, OWNED_STORED)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(unlinkMock).toHaveBeenCalledTimes(1)
    expect(unlinkMock.mock.calls[0][0]).toBe(
      path.resolve(UPLOAD_DIR, OWNED_ID[type], FILE_FIELD, OWNED_STORED)
    )
  })

  it("refuses another user's file with a 404 and never reads it", async () => {
    const response = await invoke(GET, FOREIGN_ID[type], FILE_FIELD, FOREIGN_STORED)

    // The FILESYSTEM assertion goes FIRST, deliberately. A status assertion above it fires first
    // and MASKS the barrier — 49-02's RED 7 records exactly that, where a count assertion hid
    // whether the escape target was really unlinked. Here the red must name the foreign path.
    expect(readFileMock).not.toHaveBeenCalled()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(NOT_FOUND_BODY)
  })

  it("refuses to DELETE another user's file, so the blob survives", async () => {
    const response = await invoke(DELETE, FOREIGN_ID[type], FILE_FIELD, FOREIGN_STORED)

    // Same ordering, same reason: the destructive call is the fact worth naming in a red.
    expect(unlinkMock).not.toHaveBeenCalled()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(NOT_FOUND_BODY)
  })
})

/* ------------------------------------------------------------------------------------------ *
 * A record that does not exist at all
 * ------------------------------------------------------------------------------------------ */

describe("a record id that exists in no table", () => {
  it("answers GET with the same 404 a missing file gets", async () => {
    const response = await invoke(GET, "no-such-record", FILE_FIELD, OWNED_STORED)

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(NOT_FOUND_BODY)
  })

  it("answers DELETE with a 404 and unlinks nothing", async () => {
    const response = await invoke(DELETE, "no-such-record", FILE_FIELD, OWNED_STORED)

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
  })
})

/* ------------------------------------------------------------------------------------------ *
 * The JSONB reference match — the LOAD-BEARING check
 *
 * The filename must already be a value the server wrote into this record's own `customFields`.
 * That is what makes traversal structurally impossible rather than merely filtered, and what makes
 * the ownership check non-bypassable via a guessed field name.
 * ------------------------------------------------------------------------------------------ */

describe("the JSONB reference match", () => {
  it("refuses a filename that appears nowhere in the record, on GET", async () => {
    const response = await invoke(GET, OWNED_ID.organization, FILE_FIELD, "not-in-the-record.pdf")

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(NOT_FOUND_BODY)
  })

  it("refuses a filename that appears nowhere in the record, on DELETE", async () => {
    const response = await invoke(
      DELETE,
      OWNED_ID.organization,
      FILE_FIELD,
      "not-in-the-record.pdf"
    )

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
  })

  it("refuses a real storedName requested under the WRONG field — the match is per field", async () => {
    // OTHER_FIELD_STORED is a genuine descriptor on this very record, but under OTHER_FIELD.
    const response = await invoke(GET, OWNED_ID.organization, FILE_FIELD, OTHER_FIELD_STORED)

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
  })

  it("refuses a field name that is not a key on the record at all", async () => {
    const response = await invoke(GET, OWNED_ID.organization, "Campo Inexistente", OWNED_STORED)

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(NOT_FOUND_BODY)
  })
})

/* ------------------------------------------------------------------------------------------ *
 * Traversal, at the handler
 *
 * Research proved by execution that BOTH `filename` and `entityId` escape
 * `path.resolve(UPLOAD_DIR, entityId, fieldName, filename)`. The cells assert the ORDERING as well
 * as the refusal: a traversal `filename` is refused by the reference match, which means the
 * resolver WAS consulted first — the refusal is a decision, not an early bail on a syntactic test.
 * ------------------------------------------------------------------------------------------ */

describe("traversal via filename", () => {
  it("refuses a three-level climb on GET, after consulting the resolver", async () => {
    const response = await invoke(GET, OWNED_ID.organization, FILE_FIELD, "../../../etc/passwd")

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(NOT_FOUND_BODY)
    // The refusal came from the reference match, which is downstream of the record read.
    expect(totalFindFirstCalls()).toBeGreaterThan(0)
  })

  it("refuses a three-level climb on DELETE", async () => {
    const response = await invoke(DELETE, OWNED_ID.organization, FILE_FIELD, "../../../etc/passwd")

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
  })

  it("refuses the TWO-level climb, which lands back inside the upload root", async () => {
    // `entityId` and `fieldName` are exactly two segments, so `../../` resolves to
    // `${UPLOAD_DIR}/escape.txt` — inside the root. Plan 49-02 found that a ROOT-level containment
    // check ALLOWS precisely this. Here it is refused by the reference match, upstream of any path
    // test: `escape.txt` is not a storedName on this record. Asserting `findFirst` was consulted is
    // what makes that ordering claim evidence rather than assertion.
    const response = await invoke(GET, OWNED_ID.organization, FILE_FIELD, "../../escape.txt")

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
    expect(totalFindFirstCalls()).toBeGreaterThan(0)
  })

  it("refuses an absolute filename", async () => {
    const response = await invoke(GET, OWNED_ID.organization, FILE_FIELD, "/etc/passwd")

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
  })

  it("refuses the percent-encoded spelling", async () => {
    // A3 could not resolve whether Next.js decodes this before the handler. Both spellings are
    // asserted so the answer does not matter.
    const response = await invoke(GET, OWNED_ID.organization, FILE_FIELD, "%2e%2e%2fetc%2fpasswd")

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
  })

  it("refuses the half-encoded spelling", async () => {
    const response = await invoke(
      GET,
      OWNED_ID.organization,
      FILE_FIELD,
      "..%2f..%2fetc%2fpasswd"
    )

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
  })
})

describe("traversal via entityId", () => {
  it("refuses a climbing entityId on GET, with no filesystem call", async () => {
    // Measured escape vector: `path.resolve('/app/uploads','../../etc','f1','x')` is `/etc/f1/x`.
    // No record carries `../../etc` as its id, so the resolver refuses before a path is built.
    const response = await invoke(GET, "../../etc", FILE_FIELD, OWNED_STORED)

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(NOT_FOUND_BODY)
  })

  it("refuses a climbing entityId on DELETE", async () => {
    const response = await invoke(DELETE, "../../etc", FILE_FIELD, OWNED_STORED)

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
  })
})

/* ------------------------------------------------------------------------------------------ *
 * The trashed-record decision
 * ------------------------------------------------------------------------------------------ */

describe("a record the caller owns but has trashed", () => {
  it("refuses GET, because isNull(deletedAt) is part of the predicate by decision", async () => {
    const response = await invoke(GET, TRASHED_ID, FILE_FIELD, TRASHED_STORED)

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(NOT_FOUND_BODY)
  })

  it("refuses DELETE for the same reason", async () => {
    const response = await invoke(DELETE, TRASHED_ID, FILE_FIELD, TRASHED_STORED)

    expectNoFilesystemTouch()
    expect(response.status).toBe(404)
  })
})

/* ------------------------------------------------------------------------------------------ *
 * Authentication, including the tightened condition
 * ------------------------------------------------------------------------------------------ */

describe("authentication", () => {
  it("still refuses an unauthenticated caller with a 401", async () => {
    authState.session = null

    const response = await invoke(GET, OWNED_ID.organization, FILE_FIELD, OWNED_STORED)

    expect(response.status).toBe(401)
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it("refuses a session that carries a user with NO id, on GET", async () => {
    // The shipped condition was `!session?.user`, which `{ user: {} }` satisfies — the handler
    // proceeded with `undefined` as the owner. A predicate built around `undefined` either throws
    // or, worse, matches rows whose `owner_id` is null.
    authState.session = { user: {} }

    const response = await invoke(GET, OWNED_ID.organization, FILE_FIELD, OWNED_STORED)

    expect(response.status).toBe(401)
    expect(totalFindFirstCalls()).toBe(0)
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it("refuses a session that carries a user with NO id, on DELETE", async () => {
    authState.session = { user: {} }

    const response = await invoke(DELETE, OWNED_ID.organization, FILE_FIELD, OWNED_STORED)

    expect(response.status).toBe(401)
    expect(totalFindFirstCalls()).toBe(0)
    expect(unlinkMock).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------------------------------ *
 * Self-test: the predicate-evaluating database, in BOTH polarities
 *
 * An unreachable or always-negative evaluator would make every refusal cell above pass vacuously.
 * These two cells are the named floor under the whole file: the evaluator must return the FOREIGN
 * row for an unscoped predicate and `undefined` for a scoped one. If the first of them ever
 * reddens, every foreign cell above has become a gate that cannot fail.
 * ------------------------------------------------------------------------------------------ */

describe("self-test: the fake database answers from the predicate", () => {
  const rows = buildRows()

  it("hands back the FOREIGN row when the predicate is scoped by id ALONE", () => {
    const where = and(eq(organizations.id, FOREIGN_ID.organization))
    const row = evaluateFindFirst("organizations", rows.organizations, { where })

    expect(row?.id).toBe(FOREIGN_ID.organization)
    expect(row?.ownerId).toBe(OTHER_USER)
  })

  it("returns undefined when the same lookup carries the owner term", () => {
    const where = and(
      eq(organizations.id, FOREIGN_ID.organization),
      eq(organizations.ownerId, CALLER),
      isNull(organizations.deletedAt)
    )

    expect(evaluateFindFirst("organizations", rows.organizations, { where })).toBeUndefined()
  })

  it("returns the owned row when the owner term matches", () => {
    const where = and(
      eq(organizations.id, OWNED_ID.organization),
      eq(organizations.ownerId, CALLER),
      isNull(organizations.deletedAt)
    )

    expect(evaluateFindFirst("organizations", rows.organizations, { where })?.id).toBe(
      OWNED_ID.organization
    )
  })

  it("hides a trashed row from a predicate carrying isNull(deletedAt), and shows it without", () => {
    const scoped = and(
      eq(organizations.id, TRASHED_ID),
      eq(organizations.ownerId, CALLER),
      isNull(organizations.deletedAt)
    )
    const unscoped = and(eq(organizations.id, TRASHED_ID), eq(organizations.ownerId, CALLER))

    expect(evaluateFindFirst("organizations", rows.organizations, { where: scoped })).toBeUndefined()
    expect(evaluateFindFirst("organizations", rows.organizations, { where: unscoped })?.id).toBe(
      TRASHED_ID
    )
  })

  it("models a collapsed predicate as an UNFILTERED read, not as a convenient miss", () => {
    // `.where(undefined)` in drizzle renders as no WHERE clause at all. The evaluator answers the
    // way PostgreSQL would so that a resolver which lost its scope cannot look safe here.
    expect(evaluateFindFirst("deals", rows.deals, { where: undefined })?.id).toBe(OWNED_ID.deal)
    expect(evaluateFindFirst("deals", rows.deals, undefined)?.id).toBe(OWNED_ID.deal)
  })

  it("covers all four tables, so no table's cells can be silently absent", () => {
    // A named-integer floor on the parameterisation itself: if a table is dropped from
    // ENTITY_TYPES, the ownership describe above silently loses four cells and nothing else fails.
    const EXPECTED_TABLES = 4
    expect(ENTITY_TYPES.length).toBe(EXPECTED_TABLES)
    for (const type of ENTITY_TYPES) {
      expect(rows[TABLE_NAME[type]].length).toBeGreaterThanOrEqual(2)
    }
  })
})

/* ------------------------------------------------------------------------------------------ *
 * `resolveContainedPath` in isolation — the ONLY cells that test the prefix check on its own
 *
 * In the handler, the JSONB reference match gets there first, so containment can never be reached
 * with a hostile `filename` through that path. These cells reach the exported pure function
 * directly, which is what makes the third check provable at all.
 *
 * THE BOUNDARY IS THE FIELD DIRECTORY, NOT THE UPLOAD ROOT, AND THAT IS THE DECISION THESE CELLS
 * ENCODE. `entityId` and `fieldName` are precisely two path segments, so `../../escape.txt`
 * resolves to `${UPLOAD_DIR}/escape.txt` — INSIDE the root. This plan's RED transcript measured the
 * shipped route reading exactly that path. A root-level `path.relative` check would ALLOW it, which
 * would make the refusal cell below a check that cannot fail against a handler serving a different
 * record's blob. Plan 49-02 found the same thing one module over and tightened to the same boundary;
 * `src/lib/trash/delete-entity-files.ts` is the sibling spelling.
 * ------------------------------------------------------------------------------------------ */

describe("resolveContainedPath", () => {
  const ENTITY = "org-owned"

  it("resolves a legitimate stored name to a direct child of the field directory", () => {
    const resolved = resolveContainedPath(UPLOAD_DIR, ENTITY, FILE_FIELD, OWNED_STORED)

    expect(resolved).toBe(path.resolve(UPLOAD_DIR, ENTITY, FILE_FIELD, OWNED_STORED))
    // The positive anchor for this function: without it, `return null` would satisfy every
    // refusal cell below.
    expect(path.relative(path.resolve(UPLOAD_DIR, ENTITY, FILE_FIELD), resolved as string)).toBe(
      OWNED_STORED
    )
  })

  it("refuses the TWO-segment climb that lands back on the upload root", () => {
    // THE CELL A ROOT-LEVEL CHECK WOULD FAIL. `${UPLOAD_DIR}/escape.txt` is contained by the root
    // and NOT by the field directory, and the field directory is the boundary that matters: the
    // reachable attack is one record reaching another record's blob inside the same tree.
    const escaped = path.resolve(UPLOAD_DIR, ENTITY, FILE_FIELD, "../../escape.txt")
    expect(escaped).toBe(path.resolve(UPLOAD_DIR, "escape.txt"))
    expect(path.relative(path.resolve(UPLOAD_DIR), escaped).startsWith("..")).toBe(false)

    expect(resolveContainedPath(UPLOAD_DIR, ENTITY, FILE_FIELD, "../../escape.txt")).toBeNull()
  })

  it("refuses a ONE-segment climb into a sibling field of the same record", () => {
    // Contained by the root AND by the record's own directory, and still wrong: it is a different
    // field's blob. Only the field-directory boundary sees this.
    expect(
      resolveContainedPath(UPLOAD_DIR, ENTITY, FILE_FIELD, `../${OTHER_FIELD}/${OWNED_STORED}`)
    ).toBeNull()
  })

  it("refuses a climb into a DIFFERENT record's field directory", () => {
    expect(
      resolveContainedPath(UPLOAD_DIR, ENTITY, FILE_FIELD, `../../org-foreign/${FILE_FIELD}/x.pdf`)
    ).toBeNull()
  })

  it("refuses a climb clear out of the upload root", () => {
    expect(
      resolveContainedPath(UPLOAD_DIR, ENTITY, FILE_FIELD, "../../../../etc/passwd")
    ).toBeNull()
  })

  it("refuses an absolute filename", () => {
    expect(resolveContainedPath(UPLOAD_DIR, ENTITY, FILE_FIELD, "/etc/passwd")).toBeNull()
  })

  it("refuses an empty filename, which would resolve to the field directory itself", () => {
    expect(resolveContainedPath(UPLOAD_DIR, ENTITY, FILE_FIELD, "")).toBeNull()
  })

  it("refuses a nested filename that stays inside the field directory", () => {
    // Not an escape, but not a stored name either — every real one is a single segment.
    expect(resolveContainedPath(UPLOAD_DIR, ENTITY, FILE_FIELD, "sub/dir/x.pdf")).toBeNull()
  })

  it("refuses a climbing entityId, the second measured escape vector", () => {
    expect(resolveContainedPath(UPLOAD_DIR, "../../etc", FILE_FIELD, OWNED_STORED)).toBeNull()
  })

  it("refuses a climbing fieldName", () => {
    expect(resolveContainedPath(UPLOAD_DIR, ENTITY, "../..", OWNED_STORED)).toBeNull()
  })

  it("refuses an absolute entityId", () => {
    expect(resolveContainedPath(UPLOAD_DIR, "/etc", FILE_FIELD, OWNED_STORED)).toBeNull()
  })
})
