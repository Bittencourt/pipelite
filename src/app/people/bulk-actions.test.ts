/**
 * THE AUTHORIZATION MATRIX FOR THE THREE PEOPLE BULK ACTIONS (BULK-02, BULK-03, BULK-04).
 *
 * SCAFFOLD NOTE — built on `src/app/trash/actions.test.ts:1-60`, which is the only scaffold in this
 * repo that swaps the SESSION per test (absent / member-owner / member-non-owner / admin). The
 * `vi.mock("@/lib/api/auth")` auto-approve bypass used by the `/api/v1` route tests cannot do that,
 * so `auth` is a bare `vi.fn()` here and every test drives `mockResolvedValue` itself.
 *
 * WHAT IS MOCKED AND WHY
 *   - `@/auth`                    — the session under test.
 *   - `@/db`                      — throws at import time without DATABASE_URL, and this suite must
 *                                   not touch Postgres. Shaped down to the two reads the actions do.
 *   - `next/cache`                — `revalidatePath` is an assertion target, by CALL COUNT.
 *   - `@/lib/bulk/dispatch`       — the mutation routing. Its own behaviour is plan 38-06's suite;
 *                                   here the interesting assertion is usually that it was NOT called.
 *   - `@/lib/export/formatters`   — `fetchFilteredData`. The exact options object handed to it is the
 *                                   subject of the scoped-export cases.
 *   - `@/lib/mutations/people`    — never reached by a bulk action, and mocked so that a regression
 *                                   which routed a reassign through `updatePersonMutation({ ownerId })`
 *                                   could not quietly succeed against a real schema.
 *   - `@/lib/audit/actor-context` — `runWithActor` is replaced by a spy that RECORDS its actor and
 *                                   still invokes the callback, so both the wrapping and the identity
 *                                   inside it are assertable (T-38-04).
 *
 * WHAT IS DELIBERATELY NOT MOCKED
 *   - The authorization predicate. There is no helper to stub: `person.ownerId !== session.user.id`
 *     lives inline in the action exactly as it does in `deletePerson`, and it is the subject of this
 *     file. PEOPLE HAVE NO ADMIN BYPASS — only `src/app/deals/actions.ts` carries
 *     `&& session.user.role !== "admin"`. The admin-non-owner case below is what fails if someone
 *     "unifies" the four per-entity predicates.
 *
 * THE ASSERTION THAT MATTERS MOST IS AN ABSENCE. A refusal returned AFTER the write was issued would
 * satisfy any test that only inspects the return value, so every denial case asserts the dispatch was
 * never called — and the pre-flight refusals additionally assert no actor scope ever opened.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/db", () => ({
  db: {
    query: {
      people: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
  },
}))

vi.mock("@/lib/bulk/dispatch", () => ({
  deleteRecordByType: vi.fn(),
  updateRecordOwnerByType: vi.fn(),
}))

vi.mock("@/lib/export/formatters", () => ({ fetchFilteredData: vi.fn() }))

vi.mock("@/lib/mutations/people", () => ({
  createPersonMutation: vi.fn(),
  updatePersonMutation: vi.fn(),
  deletePersonMutation: vi.fn(),
  updatePersonOwnerMutation: vi.fn(),
  personSchema: {},
  updatePersonSchema: {},
}))

vi.mock("@/lib/audit/actor-context", () => ({
  runWithActor: vi.fn((_actor: unknown, fn: () => unknown) => fn()),
  getCurrentActor: vi.fn(),
}))

import { auth } from "@/auth"
import { db } from "@/db"
import { revalidatePath } from "next/cache"
import {
  callArguments,
  readStrippedSource,
  stripComments,
} from "@/components/custom-fields/__tests__/source-scan"
import { runWithActor } from "@/lib/audit/actor-context"
import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import { fetchFilteredData } from "@/lib/export/formatters"
import { updatePersonMutation } from "@/lib/mutations/people"

import { bulkDeletePeople, bulkReassignPersonOwner, exportSelectedPeople } from "./actions"

type AnyMock = ReturnType<typeof vi.fn>

const mockAuth = auth as unknown as AnyMock
const mockRevalidatePath = revalidatePath as unknown as AnyMock
const mockRunWithActor = runWithActor as unknown as AnyMock
const mockDelete = deleteRecordByType as unknown as AnyMock
const mockReassign = updateRecordOwnerByType as unknown as AnyMock
const mockFetchFiltered = fetchFilteredData as unknown as AnyMock
const mockUpdatePerson = updatePersonMutation as unknown as AnyMock
const mockPersonFindFirst = db.query.people.findFirst as unknown as AnyMock
const mockUserFindFirst = db.query.users.findFirst as unknown as AnyMock

const OWNER = "u1"
const OTHER = "u2"
const ADMIN = "u3"
const NEW_OWNER = "u9"

function sessionFor(id: string, role: "admin" | "member" = "member"): Session {
  return {
    user: { id, role, name: `User ${id}`, email: `${id}@example.com` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as Session
}

/** One person row as the action's own `findFirst` would return it. */
function personRow(id: string, ownerId: string) {
  return { id, ownerId, firstName: "A", lastName: "B", organizationId: null }
}

/** An approved, non-deleted reassign target. */
const APPROVED_TARGET = { id: NEW_OWNER, status: "approved", deletedAt: null }

/**
 * Queue the per-record reads in loop order. The loop is sequential over the deduped id list, so
 * `mockResolvedValueOnce` in submit order is deterministic — that sequencing is itself part of what
 * "the loop continued past a failure" means.
 */
function queuePeople(rows: Array<ReturnType<typeof personRow> | undefined>) {
  for (const row of rows) mockPersonFindFirst.mockResolvedValueOnce(row)
}

function ids(count: number, prefix = "p"): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`)
}

/**
 * Every column name mentioned anywhere inside a drizzle condition, found by walking the SQL chunk
 * tree. Used to prove the reassign target query really carries BOTH predicates rather than trusting
 * that the mock was called at all.
 */
function referencedColumns(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (!node || typeof node !== "object") return out
  const candidate = node as { name?: unknown; queryChunks?: unknown; value?: unknown }
  if (typeof candidate.name === "string") out.add(candidate.name)
  if (Array.isArray(candidate.queryChunks)) {
    for (const chunk of candidate.queryChunks) referencedColumns(chunk, out)
  }
  if (Array.isArray(candidate.value)) {
    for (const chunk of candidate.value) referencedColumns(chunk, out)
  }
  return out
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRunWithActor.mockImplementation((_actor: unknown, fn: () => unknown) => fn())
  mockAuth.mockResolvedValue(sessionFor(OWNER))
  mockDelete.mockResolvedValue({ success: true })
  mockReassign.mockResolvedValue({ success: true })
  mockUserFindFirst.mockResolvedValue(APPROVED_TARGET)
  mockPersonFindFirst.mockResolvedValue(undefined)
})

describe("bulkDeletePeople", () => {
  it("refuses an unauthenticated caller before any read, any actor scope and any write", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await bulkDeletePeople(["p1"])).toEqual({
      success: false,
      error: "not_authenticated",
    })

    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockPersonFindFirst).not.toHaveBeenCalled()
  })

  it("refuses more ids than the cap, naming the cap, without dispatching or revalidating", async () => {
    const overCap = ids(BULK_MAX_IDS + 1)

    expect(await bulkDeletePeople(overCap)).toEqual({
      success: false,
      error: "too_many",
      max: BULK_MAX_IDS,
    })

    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("refuses an empty selection rather than treating it as every record", async () => {
    expect(await bulkDeletePeople([])).toEqual({ success: false, error: "no_selection" })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("refuses a malformed argument, because a server action is a POST endpoint", async () => {
    // `ids: string[]` is an annotation, not a control (the `parseRecordId` reasoning from
    // src/app/trash/actions.ts). A caller can send anything.
    expect(await bulkDeletePeople({ length: 1 } as unknown as string[])).toEqual({
      success: false,
      error: "no_selection",
    })
    expect(await bulkDeletePeople([1, 2] as unknown as string[])).toEqual({
      success: false,
      error: "no_selection",
    })
    expect(await bulkDeletePeople([""])).toEqual({ success: false, error: "no_selection" })

    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("collapses duplicate ids to one dispatch call", async () => {
    queuePeople([personRow("p1", OWNER)])

    const result = await bulkDeletePeople(["p1", "p1", "p1"])

    expect(result).toEqual({ success: true, succeeded: ["p1"], failed: [] })
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockPersonFindFirst).toHaveBeenCalledTimes(1)
  })

  it("reports a missing or already-trashed row as notFound and never dispatches it", async () => {
    queuePeople([undefined])

    const result = await bulkDeletePeople(["p1"])

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "p1", reason: "notFound" }],
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("refuses a person the caller does not own — THE CENTRAL ABSENCE", async () => {
    queuePeople([personRow("p1", OTHER)])

    const result = await bulkDeletePeople(["p1"])

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "p1", reason: "notPermitted" }],
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("AUTHORIZATION ASYMMETRY: an admin still gets notPermitted on a person they do not own", async () => {
    // People carry NO admin bypass — only src/app/deals/actions.ts does. This case is what fails
    // if someone unifies the four per-entity predicates into one shared helper.
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    queuePeople([personRow("p1", OTHER)])

    const result = await bulkDeletePeople(["p1"])

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "p1", reason: "notPermitted" }],
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("maps a dispatch refusal to unknown and CONTINUES the loop past it", async () => {
    queuePeople([personRow("p1", OWNER), personRow("p2", OWNER), personRow("p3", OWNER)])
    mockDelete
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: "constraint 23503 on deal_person_id" })
      .mockResolvedValueOnce({ success: true })

    const result = await bulkDeletePeople(["p1", "p2", "p3"])

    expect(result).toEqual({
      success: true,
      succeeded: ["p1", "p3"],
      failed: [{ id: "p2", reason: "unknown" }],
    })
    // The third id was still read and still dispatched: no break, no throw.
    expect(mockPersonFindFirst).toHaveBeenCalledTimes(3)
    expect(mockDelete).toHaveBeenCalledTimes(3)
    // And the mutation's own prose never crossed the boundary (T-38-07).
    expect(JSON.stringify(result)).not.toContain("23503")
  })

  it("returns nine successes and three named failures for a mixed twelve-id call", async () => {
    queuePeople([
      ...ids(9).map(id => personRow(id, OWNER)),
      ...ids(3, "x").map(id => personRow(id, OTHER)),
    ])

    const result = await bulkDeletePeople([...ids(9), ...ids(3, "x")])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.succeeded).toHaveLength(9)
    expect(result.failed).toHaveLength(3)
    expect(result.failed.every(failure => failure.reason === "notPermitted")).toBe(true)
    expect(mockDelete).toHaveBeenCalledTimes(9)
  })

  it("opens exactly one actor scope for the whole loop, built only from the session", async () => {
    queuePeople(ids(12).map(id => personRow(id, OWNER)))

    await bulkDeletePeople(ids(12))

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: OWNER })
  })

  it("revalidates once after the loop when at least one record succeeded", async () => {
    // NINE successes, not one. With a single success a per-record `revalidatePath` inside the loop
    // ALSO produces exactly one call, so a small batch cannot tell the two shapes apart and the
    // assertion passes on defective code. Measured, not assumed: moving the call into the loop was
    // green at 1 success, failed with "called 1 times, but got 3" at 3, and reads 9 here. The same
    // reasoning is why the actor-scope case above uses twelve ids rather than one.
    queuePeople([
      ...ids(9).map(id => personRow(id, OWNER)),
      ...ids(3, "x").map(id => personRow(id, OTHER)),
    ])

    await bulkDeletePeople([...ids(9), ...ids(3, "x")])

    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/people")
  })

  it("does not revalidate when nothing succeeded", async () => {
    queuePeople([personRow("p1", OTHER), personRow("p2", OTHER)])

    await bulkDeletePeople(["p1", "p2"])

    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

describe("bulkReassignPersonOwner", () => {
  it("refuses an unauthenticated caller before any actor scope and any write", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await bulkReassignPersonOwner(["p1"], NEW_OWNER)).toEqual({
      success: false,
      error: "not_authenticated",
    })

    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockReassign).not.toHaveBeenCalled()
    expect(mockUserFindFirst).not.toHaveBeenCalled()
  })

  it("refuses an over-cap call before it even looks the target user up", async () => {
    expect(await bulkReassignPersonOwner(ids(BULK_MAX_IDS + 1), NEW_OWNER)).toEqual({
      success: false,
      error: "too_many",
      max: BULK_MAX_IDS,
    })

    expect(mockUserFindFirst).not.toHaveBeenCalled()
    expect(mockReassign).not.toHaveBeenCalled()
  })

  it("refuses a target user that does not exist, without opening an actor scope", async () => {
    mockUserFindFirst.mockResolvedValue(undefined)

    expect(await bulkReassignPersonOwner(["p1"], "ghost")).toEqual({
      success: false,
      error: "invalid_owner",
    })

    expect(mockReassign).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
  })

  it("validates the target exactly once, against BOTH not-deleted and approved", async () => {
    // Handing 100 records to a `rejected` or `pending_verification` user is a data defect that no
    // per-record failure would ever report, because the write itself succeeds (T-38-06). A
    // `deletedAt`-only predicate — the shape of src/app/deals/page.tsx's `allUsers` — is not enough.
    mockUserFindFirst.mockResolvedValue(undefined)

    expect(await bulkReassignPersonOwner(ids(3), NEW_OWNER)).toEqual({
      success: false,
      error: "invalid_owner",
    })

    expect(mockUserFindFirst).toHaveBeenCalledTimes(1)
    const columns = referencedColumns(mockUserFindFirst.mock.calls[0][0]?.where)
    expect(columns.has("status"), `target query columns: ${[...columns].join(", ")}`).toBe(true)
    expect(columns.has("deleted_at"), `target query columns: ${[...columns].join(", ")}`).toBe(true)
    expect(mockReassign).not.toHaveBeenCalled()
  })

  it("refuses a soft-deleted target user", async () => {
    // The action's own query filters `deletedAt`, so a deleted user simply does not match.
    mockUserFindFirst.mockResolvedValue(undefined)

    expect(await bulkReassignPersonOwner(["p1"], NEW_OWNER)).toEqual({
      success: false,
      error: "invalid_owner",
    })
    expect(mockReassign).not.toHaveBeenCalled()
  })

  it("refuses a person the caller does not own, target validity notwithstanding", async () => {
    queuePeople([personRow("p1", OTHER)])

    const result = await bulkReassignPersonOwner(["p1"], NEW_OWNER)

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "p1", reason: "notPermitted" }],
    })
    expect(mockReassign).not.toHaveBeenCalled()
  })

  it("gives an admin no bypass on the reassign path either", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    queuePeople([personRow("p1", OTHER)])

    const result = await bulkReassignPersonOwner(["p1"], NEW_OWNER)

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "p1", reason: "notPermitted" }],
    })
    expect(mockReassign).not.toHaveBeenCalled()
  })

  it("returns nine successes and three notPermitted failures for a mixed twelve-id call", async () => {
    queuePeople([
      ...ids(9).map(id => personRow(id, OWNER)),
      ...ids(3, "x").map(id => personRow(id, OTHER)),
    ])

    const result = await bulkReassignPersonOwner([...ids(9), ...ids(3, "x")], NEW_OWNER)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.succeeded).toHaveLength(9)
    expect(result.failed).toHaveLength(3)
    expect(result.failed.every(failure => failure.reason === "notPermitted")).toBe(true)
  })

  it("opens one actor scope and revalidates once after the loop", async () => {
    // Twelve successes, so a per-record scope or a per-record revalidation would read as 12.
    queuePeople(ids(12).map(id => personRow(id, OWNER)))

    await bulkReassignPersonOwner(ids(12), NEW_OWNER)

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: OWNER })
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
  })

  it("hands the dispatch its four arguments in the one order types cannot check", async () => {
    // entityType, record id, NEW owner, ACTOR. All four are strings, so a swapped ownerId/userId
    // pair typechecks perfectly and would attribute the audit row to the new owner.
    queuePeople([personRow("p1", OWNER)])

    await bulkReassignPersonOwner(["p1"], NEW_OWNER)

    expect(mockReassign).toHaveBeenCalledTimes(1)
    expect(mockReassign).toHaveBeenCalledWith("person", "p1", NEW_OWNER, OWNER)
  })

  it("never routes an owner change through the person update mutation", async () => {
    // `ownerId` is absent from `personSchema`; Zod strips unknown keys, so that call would write
    // only `updatedAt`, emit an empty diff and produce no audit row — a silent success no-op.
    queuePeople(ids(3).map(id => personRow(id, OWNER)))

    await bulkReassignPersonOwner(ids(3), NEW_OWNER)

    expect(mockUpdatePerson).not.toHaveBeenCalled()
    expect(mockFetchFiltered).not.toHaveBeenCalled()
  })
})

describe("exportSelectedPeople", () => {
  /** A fetch result whose row count deliberately DISAGREES with the number of ids submitted. */
  const FETCHED = {
    success: true as const,
    data: "First Name,Last Name\nA,B\n",
    filename: "people-2026-01-01.csv",
    count: 7,
  }

  beforeEach(() => {
    mockFetchFiltered.mockResolvedValue(FETCHED)
  })

  it("refuses an unauthenticated caller without fetching anything", async () => {
    mockAuth.mockResolvedValue(null)

    const result = await exportSelectedPeople(["p1"])

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.length).toBeGreaterThan(0)
    expect(mockFetchFiltered).not.toHaveBeenCalled()
  })

  it("refuses an empty selection rather than exporting the whole table", async () => {
    // THE POINT OF THE WHOLE SIGNATURE. The only other export action is admin-gated; a non-admin
    // action that could express "no filter" would return every person in the database (T-38-01).
    const result = await exportSelectedPeople([])

    expect(result.success).toBe(false)
    expect(mockFetchFiltered).not.toHaveBeenCalled()
  })

  it("refuses an over-cap selection without fetching", async () => {
    const result = await exportSelectedPeople(ids(BULK_MAX_IDS + 1))

    expect(result.success).toBe(false)
    expect(mockFetchFiltered).not.toHaveBeenCalled()
  })

  it("builds every field of the export options server-side, from no parameter but the ids", async () => {
    await exportSelectedPeople(["p1", "p2", "p2"])

    expect(mockFetchFiltered).toHaveBeenCalledTimes(1)
    expect(mockFetchFiltered).toHaveBeenCalledWith({
      entityType: "person",
      format: "csv",
      includeCustomFields: true,
      filters: { ids: ["p1", "p2"] },
    })
  })

  it("names the file from the FETCHED count, so the name and the row count cannot disagree", async () => {
    const result = await exportSelectedPeople(["p1", "p2", "p3"])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.filename).toMatch(/^people-selected-\d+-\d{4}-\d{2}-\d{2}\.csv$/)
    // 7, from the fetch result — not 3, the number of ids submitted.
    expect(result.filename).toContain(`people-selected-${FETCHED.count}-`)
    expect(result.filename).not.toContain("people-selected-3-")
    // The slug is the untranslated English plural from the formatter's own mapping.
    expect(result.filename.startsWith("people-")).toBe(true)
    expect(result.data).toBe(FETCHED.data)
    expect(result.count).toBe(FETCHED.count)
  })

  it("passes a fetch failure straight through", async () => {
    mockFetchFiltered.mockResolvedValue({ success: false, error: "Unknown entity type" })

    expect(await exportSelectedPeople(["p1"])).toEqual({
      success: false,
      error: "Unknown entity type",
    })
  })
})

/**
 * THE SOURCE GATE — COMMENT-BLIND BY CONSTRUCTION.
 *
 * Every assertion below reads `readStrippedSource`, never raw file text. Phase 37 shipped a
 * grep-based acceptance gate that collided with an explanatory COMMENT nine times in one phase —
 * once with the plan's own suggested wording — and Phase 35 hit the same thing three times. This
 * gate is unusually exposed to it, because the rules it enforces are NEGATIVES ABOUT IDENTIFIERS
 * (`ExportOptions` must not be a parameter; `updatePersonMutation` must not be called) which the
 * source explains in prose right beside the code — `actions.ts` carries a tombstone comment naming
 * each. Nothing here reads raw file text — this file contains no direct filesystem read at all, and
 * the plan's own acceptance gate counts that to zero — so the collision cannot be reintroduced one
 * careless assertion at a time. (That gate tripped on THIS paragraph's first draft, which named the
 * `node:fs` function out loud. The comment was reworded; the gate was not weakened. Twelfth
 * occurrence across phases 37-38.)
 *
 * ANTI-VACUITY, per `no-mutation-coupling.test.ts:38-50`: prove the file was read, prove the three
 * declarations were found, and assert POSITIVE markers before any negative. A slicing helper handed
 * a missing anchor is the specific failure mode WR-13 records — `indexOf(x, -1)` behaves as
 * `indexOf(x, 0)`, so the slice silently widens to the enclosing module and every negative assertion
 * becomes meaningless. Hence the named `> -1` assertion inside the helper's callers. The
 * detector-vocabulary case below is the gate for the gate: it pins that the stripper really removes
 * a forbidden identifier written in a comment while leaving the same identifier in code alone, so a
 * regression that lost the stripping fails HERE rather than silently passing everything.
 */
const ACTIONS_PATH = "src/app/people/actions.ts"
const STRIPPED = readStrippedSource(ACTIONS_PATH)

const BULK_DECLARATIONS = [
  "export async function bulkDeletePeople",
  "export async function bulkReassignPersonOwner",
  "export async function exportSelectedPeople",
] as const

/**
 * One exported declaration's source, from its own `export async function …` to the next top-level
 * `export`. Returns `""` when the anchor is absent; every caller asserts the anchor by name FIRST.
 */
function sliceDeclaration(source: string, declaration: string): string {
  const start = source.indexOf(declaration)
  if (start === -1) return ""
  const end = source.indexOf("\nexport ", start + 1)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

function slice(source: string, declaration: string): string {
  expect(
    source.indexOf(declaration),
    `${ACTIONS_PATH} no longer declares \`${declaration}\` — the slicing anchor is gone, so every negative assertion below would silently widen to the whole module (WR-13)`
  ).toBeGreaterThan(-1)
  return sliceDeclaration(source, declaration)
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const WRITE_DECLARATIONS = [
  "export async function bulkDeletePeople",
  "export async function bulkReassignPersonOwner",
] as const

/** Vocabulary the scoped export's declaration must never contain. */
const FORBIDDEN_IN_EXPORT = [
  "ExportFilters",
  "ExportOptions",
  "ExportFormat",
  "pipedrive",
  "getExportData",
  "role",
] as const

/** Vocabulary either bulk write must never contain. */
const FORBIDDEN_IN_WRITES = [
  "Promise.all",
  "db.transaction",
  "session.user.role",
  "updatePersonMutation",
  "auditLog",
] as const

describe("source gate — the three bulk declarations in src/app/people/actions.ts", () => {
  it("read the file and found all three declarations, with their positive markers", () => {
    // Requirement 1 and 2: without this, a rename turns every negative below into a scan of "".
    expect(STRIPPED.length, `${ACTIONS_PATH} is empty`).toBeGreaterThan(0)

    for (const declaration of BULK_DECLARATIONS) {
      const body = slice(STRIPPED, declaration)
      expect(body.length, `${declaration} sliced to nothing`).toBeGreaterThan(0)
    }

    // Positive markers, asserted BEFORE any absence.
    const deleteSlice = slice(STRIPPED, WRITE_DECLARATIONS[0])
    const reassignSlice = slice(STRIPPED, WRITE_DECLARATIONS[1])
    const exportSlice = slice(STRIPPED, BULK_DECLARATIONS[2])

    expect(deleteSlice).toContain("runWithActor")
    expect(deleteSlice).toContain('deleteRecordByType("person"')
    expect(reassignSlice).toContain("runWithActor")
    expect(reassignSlice).toContain('updateRecordOwnerByType("person"')
    expect(exportSlice).toContain("fetchFilteredData")
    expect(exportSlice).toContain("people-selected-")
  })

  it("GATE FOR THE GATE: the stripper removes a forbidden word from prose and keeps it in code", () => {
    // `actions.ts` carries a tombstone comment naming `ExportOptions` and another naming
    // `updatePersonMutation`, precisely because a raw-text grep would collide with the prose that
    // explains the rule. This case pins that the detector below is blind to prose and NOT blind to
    // code — without it, "stripping happens" is an assumption rather than a measurement.
    const fixture = [
      "// never reintroduce an ExportOptions parameter, and never call updatePersonMutation",
      "/* auditLog and db.transaction are also forbidden here */",
      'const real = ExportOptions.name + "updatePersonMutation"',
    ].join("\n")

    const stripped = stripComments(fixture)

    expect(occurrences(stripped, "ExportOptions"), "prose mention survived stripping").toBe(1)
    expect(stripped).not.toContain("never reintroduce")
    expect(stripped).not.toContain("auditLog")
    expect(stripped).not.toContain("db.transaction")
    // The code occurrence is untouched, including inside a string literal.
    expect(stripped).toContain('ExportOptions.name + "updatePersonMutation"')

    // And the tombstones really are prose: the stripped slices carry neither identifier.
    expect(slice(STRIPPED, WRITE_DECLARATIONS[0])).not.toContain("updatePersonMutation")
    expect(slice(STRIPPED, BULK_DECLARATIONS[2])).not.toContain("ExportOptions")
  })

  it("declares the scoped export with a single ids parameter and nothing else", () => {
    // THE SOURCE GATE PLAN 38-04 DEFERRED TO THIS PLAN. In wave 1 it would have matched zero
    // functions, and a gate over zero matches is a vacuous pass.
    //
    // ANTI-VACUOUS BY CONSTRUCTION, not by a token ban alone. The banned-vocabulary case below can
    // only ever say "these words are absent", which is also true of a declaration that was renamed
    // or deleted. This one reads the parameter list itself, so it fails if the function is missing,
    // renamed, or grows a second parameter of ANY name — including one nobody thought to ban.
    const [parameterList, ...extra] = callArguments(
      STRIPPED,
      "export async function exportSelectedPeople"
    )

    expect(
      parameterList,
      "exportSelectedPeople is not declared, so every negative assertion about its signature would be vacuous"
    ).toBeDefined()
    expect(extra).toHaveLength(0)
    expect(parameterList.trim()).toBe("ids: string[]")
    expect(parameterList).not.toContain(",")

    expect(STRIPPED).toMatch(
      /export async function exportSelectedPeople\(\s*ids:\s*string\[\]\s*\)\s*:\s*Promise<ExportResult>/
    )
  })

  it("keeps every options, format and admin-gate word out of the scoped export", () => {
    const exportSlice = slice(STRIPPED, BULK_DECLARATIONS[2])

    for (const token of FORBIDDEN_IN_EXPORT) {
      expect(
        exportSlice,
        `exportSelectedPeople must not mention \`${token}\`: the only other export action is admin-gated, so an action that could accept a filter object and receive {} would return every person in the table (T-38-01)`
      ).not.toContain(token)
    }
  })

  it("keeps batching, transactions, role checks and hand-rolled audit writes out of both bulk writes", () => {
    for (const declaration of WRITE_DECLARATIONS) {
      const body = slice(STRIPPED, declaration)
      for (const token of FORBIDDEN_IN_WRITES) {
        expect(
          body,
          `${declaration} must not mention \`${token}\`: an aborting transaction cannot name which record failed, and people carry no admin bypass`
        ).not.toContain(token)
      }
    }
  })

  it("opens exactly one actor scope per bulk write, built from the session", () => {
    for (const declaration of WRITE_DECLARATIONS) {
      const body = slice(STRIPPED, declaration)
      expect(occurrences(body, "runWithActor"), `${declaration} actor scopes`).toBe(1)

      const [scopeArgs, ...extra] = callArguments(body, "runWithActor")
      expect(extra).toHaveLength(0)
      expect(scopeArgs).toContain('kind: "user"')
    }
  })

  it("revalidates once per bulk write, outside the actor scope rather than per record", () => {
    for (const declaration of WRITE_DECLARATIONS) {
      const body = slice(STRIPPED, declaration)
      expect(occurrences(body, "revalidatePath"), `${declaration} revalidations`).toBe(1)

      // Not merely "later in the file": the call must be OUTSIDE the scope callback, which
      // string-aware brace matching over the call's own arguments is what proves.
      const [scopeArgs] = callArguments(body, "runWithActor")
      expect(
        scopeArgs,
        `${declaration} calls revalidatePath inside the runWithActor callback, so it would fire once per record`
      ).not.toContain("revalidatePath")
      expect(body.indexOf("revalidatePath")).toBeGreaterThan(body.indexOf("runWithActor"))
    }
  })

  it("validates the reassign target before the loop, on both predicates", () => {
    const body = slice(STRIPPED, WRITE_DECLARATIONS[1])
    const targetCheck = body.indexOf('eq(users.status, "approved")')

    expect(
      targetCheck,
      "bulkReassignPersonOwner must filter the target on approved status, not just on deletion (T-38-06)"
    ).toBeGreaterThan(-1)
    expect(body).toContain("isNull(users.deletedAt)")
    expect(
      targetCheck,
      "the target must be validated BEFORE the actor scope opens, so an invalid target establishes no actor and writes nothing"
    ).toBeLessThan(body.indexOf("runWithActor"))
  })
})
