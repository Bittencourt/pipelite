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
import { runWithActor } from "@/lib/audit/actor-context"
import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import { fetchFilteredData } from "@/lib/export/formatters"
import { updatePersonMutation } from "@/lib/mutations/people"

import { bulkDeletePeople, bulkReassignPersonOwner } from "./actions"

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
    queuePeople([personRow("p1", OWNER), personRow("p2", OTHER)])

    await bulkDeletePeople(["p1", "p2"])

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
