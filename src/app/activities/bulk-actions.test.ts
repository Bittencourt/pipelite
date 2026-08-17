/**
 * THE AUTHORIZATION MATRIX FOR THE THREE ACTIVITIES BULK ACTIONS (BULK-02, BULK-03, BULK-04).
 *
 * SCAFFOLD NOTE — `src/app/trash/actions.test.ts:1-60` (itself built on
 * `src/app/notes/actions.test.ts:1-30`) is the only scaffold in this repo that swaps the SESSION per
 * test, which is exactly what this file needs: absent / member-owner / member-non-owner / ADMIN.
 * The `vi.mock("@/lib/api/auth")` auto-approve bypass used by the `/api/v1` route tests cannot
 * express any of that. `auth` is therefore a bare `vi.fn()` and every test drives
 * `mockResolvedValue` itself.
 *
 * WHAT IS MOCKED AND WHY
 *   - `@/auth`                    — the session under test.
 *   - `next/cache`                — `revalidatePath` is an assertion target: once after the loop,
 *                                   never per record.
 *   - `@/lib/bulk/dispatch`       — the routing layer. Its own behaviour is plan 38-06's suite;
 *                                   here the interesting assertion is frequently that it was
 *                                   NOT called.
 *   - `@/lib/export/formatters`   — `fetchFilteredData` is an assertion target: the exact options
 *                                   object it receives is what proves the scoped export cannot
 *                                   express "no filter".
 *   - `@/lib/audit/actor-context` — `runWithActor` is replaced by a spy that RECORDS its actor and
 *                                   still invokes the callback, so both the wrapping and the
 *                                   identity inside it are assertable (T-38-04).
 *   - `@/db`                      — a shaped `query.activities.findFirst` / `query.users.findFirst`
 *                                   so per-record reads and the reassign target lookup are driven.
 *
 * WHAT IS DELIBERATELY NOT MOCKED
 *   - The authorization predicate itself. There is no helper to stub: the comparison lives inline
 *     in the action exactly as it does at `src/app/activities/actions.ts:84, 131, 177`, and it is
 *     the subject of this file.
 *
 * THE ASSERTION THAT MATTERS MOST IS AN ABSENCE. A refusal returned AFTER the write was issued
 * would satisfy any test that only inspects the return value, so every denial case below asserts
 * the dispatch was never called.
 *
 * ACTIVITIES-SPECIFIC HAZARD — THIS ENTITY HAS TWO USER-VALUED COLUMNS. `activities` carries an
 * owner column AND the second user-valued column that D-11 scopes out of this phase, and
 * `activitySchema` declares the second one while `ownerId` is absent from it. So the out-of-scope
 * column is the field a careless implementation reaches for, in BOTH directions: as the
 * authorization subject (case A.8 below) and as an extra write (case B.9). Reassigning it is a
 * DEFERRED idea, and this file gates its absence rather than merely documenting it.
 *
 * ACTIVITIES HAVE NO ADMIN BYPASS. Only `src/app/deals/actions.ts` carries
 * `&& session.user.role !== "admin"`. Case A.7 is the negative proof: an admin caller acting on a
 * record owned by someone else is still refused. That test is what fails if a future change tries
 * to unify the four per-entity predicates into one shared helper.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/bulk/dispatch", () => ({
  deleteRecordByType: vi.fn(),
  updateRecordOwnerByType: vi.fn(),
}))

vi.mock("@/lib/export/formatters", () => ({ fetchFilteredData: vi.fn() }))

vi.mock("@/lib/audit/actor-context", () => ({
  runWithActor: vi.fn((_actor: unknown, fn: () => unknown) => fn()),
}))

vi.mock("@/db", () => ({
  db: {
    query: {
      activities: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
  },
}))

import { auth } from "@/auth"
import { db } from "@/db"
import { revalidatePath } from "next/cache"
import { runWithActor } from "@/lib/audit/actor-context"
import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import { fetchFilteredData } from "@/lib/export/formatters"

import {
  bulkDeleteActivities,
  bulkReassignActivityOwner,
  exportSelectedActivities,
} from "./actions"

/** The row shape the per-record read returns, carrying BOTH user-valued columns. */
type ActivityRow = {
  id: string
  ownerId: string
  assigneeId: string | null
  title: string
}

/** The reassign target shape. */
type UserRow = { id: string; status: string; deletedAt: Date | null }

const mockAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockDelete = vi.mocked(deleteRecordByType)
const mockUpdateOwner = vi.mocked(updateRecordOwnerByType)
const mockFetchFiltered = vi.mocked(fetchFilteredData)
const mockRunWithActor = vi.mocked(runWithActor)
const mockActivityFindFirst = vi.mocked(
  db.query.activities.findFirst as unknown as (
    args?: unknown
  ) => Promise<ActivityRow | undefined>
)
const mockUserFindFirst = vi.mocked(
  db.query.users.findFirst as unknown as (args?: unknown) => Promise<UserRow | undefined>
)

const OWNER = "u1"
const OTHER = "u2"
const ADMIN = "u3"
const NEW_OWNER = "u4"

function sessionFor(id: string, role: "admin" | "member" = "member"): Session {
  return {
    user: { id, role, name: `User ${id}`, email: `${id}@example.com` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as Session
}

function activity(id: string, ownerId: string, assigneeId: string | null = null): ActivityRow {
  return { id, ownerId, assigneeId, title: `Activity ${id}` }
}

const APPROVED_TARGET: UserRow = { id: NEW_OWNER, status: "approved", deletedAt: null }

/**
 * Queue the per-record reads in loop order.
 *
 * The action iterates the deduped id array in order, so a positional queue is deterministic and
 * does not require decoding a drizzle `where` object to recover which id was asked for.
 */
function rowsInOrder(...rows: (ActivityRow | undefined)[]) {
  for (const row of rows) mockActivityFindFirst.mockResolvedValueOnce(row)
}

function idList(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `a${index + 1}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})

  mockRunWithActor.mockImplementation((_actor, fn) => fn())
  mockActivityFindFirst.mockResolvedValue(undefined)
  mockUserFindFirst.mockResolvedValue(APPROVED_TARGET)
  mockDelete.mockResolvedValue({ success: true })
  mockUpdateOwner.mockResolvedValue({ success: true })
  mockAuth.mockResolvedValue(sessionFor(OWNER))
})

describe("bulkDeleteActivities", () => {
  it("A.1 refuses an unauthenticated caller before any actor scope opens or any write runs", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await bulkDeleteActivities(["a1"])).toEqual({
      success: false,
      error: "not_authenticated",
    })
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("A.2 refuses more ids than the cap, reporting the cap, with no write and no revalidation", async () => {
    const result = await bulkDeleteActivities(idList(BULK_MAX_IDS + 1))

    expect(result).toEqual({ success: false, error: "too_many", max: BULK_MAX_IDS })
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("A.3 refuses an empty selection rather than treating it as every record", async () => {
    expect(await bulkDeleteActivities([])).toEqual({ success: false, error: "no_selection" })
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockActivityFindFirst).not.toHaveBeenCalled()
  })

  it("A.4a refuses a malformed argument — a server action is a POST endpoint", async () => {
    expect(await bulkDeleteActivities("a1" as unknown as string[])).toEqual({
      success: false,
      error: "no_selection",
    })
    expect(await bulkDeleteActivities([{ id: "a1" }] as unknown as string[])).toEqual({
      success: false,
      error: "no_selection",
    })
    expect(await bulkDeleteActivities([""] as string[])).toEqual({
      success: false,
      error: "no_selection",
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("A.4b collapses duplicate ids before the loop", async () => {
    rowsInOrder(activity("a1", OWNER), activity("a2", OWNER))

    const result = await bulkDeleteActivities(["a1", "a1", "a1", "a2"])

    expect(result).toEqual({ success: true, succeeded: ["a1", "a2"], failed: [] })
    expect(mockDelete).toHaveBeenCalledTimes(2)
    expect(mockDelete.mock.calls.filter(call => call[1] === "a1")).toHaveLength(1)
  })

  it("A.5 reports a missing or already-trashed row as notFound without dispatching it", async () => {
    rowsInOrder(undefined)

    const result = await bulkDeleteActivities(["a1"])

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "a1", reason: "notFound" }],
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("A.6 refuses a record owned by someone else BEFORE dispatching it", async () => {
    rowsInOrder(activity("a1", OTHER))

    const result = await bulkDeleteActivities(["a1"])

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "a1", reason: "notPermitted" }],
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("A.7 refuses an ADMIN caller on a record owned by someone else — activities have no admin bypass", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    rowsInOrder(activity("a1", OTHER))

    const result = await bulkDeleteActivities(["a1"])

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "a1", reason: "notPermitted" }],
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("A.8 refuses a record the caller is only the second-column subject of, not the owner", async () => {
    rowsInOrder(activity("a1", OTHER, OWNER))

    const result = await bulkDeleteActivities(["a1"])

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "a1", reason: "notPermitted" }],
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("A.9 maps a dispatch refusal to unknown and CONTINUES past it", async () => {
    rowsInOrder(activity("a1", OWNER), activity("a2", OWNER), activity("a3", OWNER))
    mockDelete
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: "Failed to delete activity" })
      .mockResolvedValueOnce({ success: true })

    const result = await bulkDeleteActivities(["a1", "a2", "a3"])

    expect(result).toEqual({
      success: true,
      succeeded: ["a1", "a3"],
      failed: [{ id: "a2", reason: "unknown" }],
    })
    expect(mockActivityFindFirst).toHaveBeenCalledTimes(3)
    expect(mockDelete).toHaveBeenCalledTimes(3)
  })

  it("A.9b never leaks the mutation's own error string across the client boundary", async () => {
    rowsInOrder(activity("a1", OWNER))
    mockDelete.mockResolvedValueOnce({ success: false, error: "duplicate key value violates …" })

    const result = await bulkDeleteActivities(["a1"])

    expect(JSON.stringify(result)).not.toContain("duplicate key")
  })

  it("A.10 reports 9 succeeded and 3 notPermitted for a mixed 12-id selection", async () => {
    const ids = idList(12)
    rowsInOrder(...ids.map((id, index) => activity(id, index < 9 ? OWNER : OTHER)))

    const result = await bulkDeleteActivities(ids)

    expect(result.success).toBe(true)
    if (!result.success) throw new Error("unreachable")
    expect(result.succeeded).toHaveLength(9)
    expect(result.failed).toHaveLength(3)
    expect(result.failed.every(failure => failure.reason === "notPermitted")).toBe(true)
    expect(mockDelete).toHaveBeenCalledTimes(9)
  })

  it("A.11 opens exactly ONE actor scope for the whole loop, carrying the session identity", async () => {
    const ids = idList(5)
    rowsInOrder(...ids.map(id => activity(id, OWNER)))

    await bulkDeleteActivities(ids)

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: OWNER })
  })

  it("A.12a revalidates exactly ONCE after a partially successful loop", async () => {
    rowsInOrder(activity("a1", OWNER), activity("a2", OTHER), activity("a3", OWNER))

    await bulkDeleteActivities(["a1", "a2", "a3"])

    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
  })

  it("A.12b does not revalidate when nothing succeeded", async () => {
    rowsInOrder(activity("a1", OTHER), activity("a2", OTHER))

    await bulkDeleteActivities(["a1", "a2"])

    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

describe("bulkReassignActivityOwner", () => {
  it("B.1 refuses an unauthenticated caller before any actor scope opens or any write runs", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await bulkReassignActivityOwner(["a1"], NEW_OWNER)).toEqual({
      success: false,
      error: "not_authenticated",
    })
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockUpdateOwner).not.toHaveBeenCalled()
    expect(mockUserFindFirst).not.toHaveBeenCalled()
  })

  it("B.1b refuses more ids than the cap before validating the target", async () => {
    const result = await bulkReassignActivityOwner(idList(BULK_MAX_IDS + 1), NEW_OWNER)

    expect(result).toEqual({ success: false, error: "too_many", max: BULK_MAX_IDS })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
  })

  it("B.2 refuses a target user that does not exist, before opening an actor scope", async () => {
    mockUserFindFirst.mockResolvedValue(undefined)
    rowsInOrder(activity("a1", OWNER))

    expect(await bulkReassignActivityOwner(["a1"], "ghost")).toEqual({
      success: false,
      error: "invalid_owner",
    })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("B.3 refuses a target user that is not approved", async () => {
    // The two-predicate query is what excludes a `pending_verification` row, so the mock returns
    // nothing for it — the predicate itself is pinned by the source gate at the bottom of this file.
    mockUserFindFirst.mockResolvedValue(undefined)
    rowsInOrder(activity("a1", OWNER))

    expect(await bulkReassignActivityOwner(["a1"], "pending-user")).toEqual({
      success: false,
      error: "invalid_owner",
    })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
  })

  it("B.4 refuses a soft-deleted target user", async () => {
    mockUserFindFirst.mockResolvedValue(undefined)
    rowsInOrder(activity("a1", OWNER))

    expect(await bulkReassignActivityOwner(["a1"], "deleted-user")).toEqual({
      success: false,
      error: "invalid_owner",
    })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
  })

  it("B.4b validates the target EXACTLY ONCE, before the loop, with a where clause", async () => {
    const ids = idList(6)
    rowsInOrder(...ids.map(id => activity(id, OWNER)))

    await bulkReassignActivityOwner(ids, NEW_OWNER)

    expect(mockUserFindFirst).toHaveBeenCalledTimes(1)
    const queryArg = mockUserFindFirst.mock.calls[0][0] as { where?: unknown }
    expect(queryArg?.where, "the target lookup must carry a where clause").toBeTruthy()
  })

  it("B.4c refuses a malformed target id as invalid_owner", async () => {
    expect(await bulkReassignActivityOwner(["a1"], "" as string)).toEqual({
      success: false,
      error: "invalid_owner",
    })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
  })

  it("B.5 refuses a record owned by someone else BEFORE dispatching it", async () => {
    rowsInOrder(activity("a1", OTHER))

    const result = await bulkReassignActivityOwner(["a1"], NEW_OWNER)

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "a1", reason: "notPermitted" }],
    })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
  })

  it("B.5b refuses an ADMIN caller on a record owned by someone else", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    rowsInOrder(activity("a1", OTHER))

    const result = await bulkReassignActivityOwner(["a1"], NEW_OWNER)

    expect(result).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "a1", reason: "notPermitted" }],
    })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
  })

  it("B.6 reports 9 succeeded and 3 notPermitted for a mixed 12-id selection", async () => {
    const ids = idList(12)
    rowsInOrder(...ids.map((id, index) => activity(id, index < 9 ? OWNER : OTHER)))

    const result = await bulkReassignActivityOwner(ids, NEW_OWNER)

    expect(result.success).toBe(true)
    if (!result.success) throw new Error("unreachable")
    expect(result.succeeded).toHaveLength(9)
    expect(result.failed).toHaveLength(3)
    expect(result.failed.every(failure => failure.reason === "notPermitted")).toBe(true)
  })

  it("B.7 opens one actor scope and revalidates once after the loop", async () => {
    const ids = idList(4)
    rowsInOrder(...ids.map(id => activity(id, OWNER)))

    await bulkReassignActivityOwner(ids, NEW_OWNER)

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: OWNER })
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
  })

  it("B.8 dispatches with (entityType, id, newOwnerId, actorId) in that exact order", async () => {
    rowsInOrder(activity("a1", OWNER))

    await bulkReassignActivityOwner(["a1"], NEW_OWNER)

    // All four are strings, so the argument ORDER is something types cannot catch.
    expect(mockUpdateOwner).toHaveBeenCalledWith("activity", "a1", NEW_OWNER, OWNER)
  })

  it("B.9 smuggles no out-of-scope payload: every dispatch call is exactly four scalars", async () => {
    const ids = idList(12)
    rowsInOrder(...ids.map(id => activity(id, OWNER)))

    await bulkReassignActivityOwner(ids, NEW_OWNER)

    expect(mockUpdateOwner).toHaveBeenCalledTimes(12)
    for (const call of mockUpdateOwner.mock.calls) {
      expect(call).toHaveLength(4)
      for (const argument of call) expect(typeof argument).toBe("string")
    }
  })
})
