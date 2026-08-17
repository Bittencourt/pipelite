/**
 * THE AUTHORIZATION AND PRE-FLIGHT MATRIX FOR THE ORGANIZATIONS BULK ACTIONS (BULK-02/03/04).
 *
 * SCAFFOLD NOTE — built on `src/app/trash/actions.test.ts:1-60`, which is the only scaffold in this
 * repo that swaps the SESSION per test (absent / member-owner / member-non-owner / admin). That is
 * exactly what these tests need: the `vi.mock("@/lib/api/auth")` auto-approve bypass used by the
 * `/api/v1` route suites cannot express "an admin who does not own the row". `auth` is therefore a
 * bare `vi.fn()` and every test drives `mockResolvedValue` itself.
 *
 * WHAT IS MOCKED AND WHY
 *   - `@/auth`                    — the session under test.
 *   - `next/cache`                — `revalidatePath` is a CALL-COUNT assertion target: once after the
 *                                   loop, never once per record.
 *   - `@/lib/bulk/dispatch`       — the mutation routing. Its own behaviour is plan 38-06's suite;
 *                                   here the interesting assertion is usually that it was NOT called.
 *   - `@/lib/export/formatters`   — `fetchFilteredData`. The assertion is the exact options object the
 *                                   action builds, plus the absence of a call on every refusal.
 *   - `@/lib/audit/actor-context` — the actor scope is replaced by a spy that RECORDS its actor and
 *                                   still invokes the callback, so both the wrapping (once, around the
 *                                   whole loop) and the identity inside it are assertable (T-38-04).
 *   - `@/db`                      — the per-record read and the reassign target lookup.
 *
 * WHAT IS DELIBERATELY NOT MOCKED
 *   - The ownership predicate. There is no `isOwnerOrAdmin` helper to stub: the comparison lives
 *     inline in the action, and it is the subject of this file. Organizations have NO admin bypass
 *     (only deals do), and the asymmetry test below is what fails if someone unifies the four.
 *
 * THE ASSERTION THAT MATTERS MOST IS AN ABSENCE. A refusal returned AFTER the write was issued would
 * satisfy any test that only inspects the return value, so every denial case below asserts the
 * dispatch was never called.
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
      organizations: { findFirst: vi.fn() },
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

import { bulkDeleteOrganizations, bulkReassignOrganizationOwner } from "./actions"

const mockAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockRunWithActor = vi.mocked(runWithActor)
const mockDeleteRecord = vi.mocked(deleteRecordByType)
const mockUpdateOwner = vi.mocked(updateRecordOwnerByType)
const mockOrgFindFirst = vi.mocked(db.query.organizations.findFirst)
const mockUserFindFirst = vi.mocked(db.query.users.findFirst)

const OWNER = "u1"
const OTHER = "u2"
const NEW_OWNER = "u9"

function sessionFor(id: string, role: "admin" | "member" = "member"): Session {
  return {
    user: { id, role, name: `User ${id}`, email: `${id}@example.com` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as Session
}

/** One organization row as the per-record read returns it. */
function org(id: string, ownerId: string) {
  return { id, ownerId, name: `Org ${id}` }
}

/** An approved, non-deleted target for the reassign path. */
const APPROVED_TARGET = { id: NEW_OWNER, status: "approved", deletedAt: null }

/**
 * Queue the per-record reads IN LOOP ORDER.
 *
 * The loop reads one row per id, sequentially, so `mockResolvedValueOnce` in id order is exact and
 * needs no inspection of the drizzle `where` object (which is a SQL chunk tree, not data).
 */
function queueRows(rows: Array<ReturnType<typeof org> | undefined>) {
  for (const row of rows) mockOrgFindFirst.mockResolvedValueOnce(row as never)
}

/** `count` ids, `owned` of which belong to `OWNER` and the rest to `OTHER`. */
function mixedIds(count: number) {
  return Array.from({ length: count }, (_, index) => `o${index + 1}`)
}

/** The id argument of every dispatch call, in call order. */
function dispatchedIds(mock: { mock: { calls: unknown[][] } }) {
  return mock.mock.calls.map((call) => call[1] as string)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOrgFindFirst.mockReset()
  mockUserFindFirst.mockReset()
  mockDeleteRecord.mockReset()
  mockUpdateOwner.mockReset()

  mockRunWithActor.mockImplementation((_actor, fn) => fn())
  mockAuth.mockResolvedValue(sessionFor(OWNER))
  mockOrgFindFirst.mockResolvedValue(org("o1", OWNER) as never)
  mockUserFindFirst.mockResolvedValue(APPROVED_TARGET as never)
  mockDeleteRecord.mockResolvedValue({ success: true })
  mockUpdateOwner.mockResolvedValue({ success: true })
})

describe("bulkDeleteOrganizations", () => {
  it("refuses an unauthenticated caller before any actor scope opens or any dispatch runs", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await bulkDeleteOrganizations(["o1"])).toEqual({
      success: false,
      error: "not_authenticated",
    })
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockDeleteRecord).not.toHaveBeenCalled()
  })

  it("refuses more ids than the cap, naming the cap, without dispatching or revalidating", async () => {
    const ids = Array.from({ length: BULK_MAX_IDS + 1 }, (_, index) => `o${index + 1}`)

    expect(await bulkDeleteOrganizations(ids)).toEqual({
      success: false,
      error: "too_many",
      max: BULK_MAX_IDS,
    })
    expect(mockDeleteRecord).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("refuses an empty selection rather than treating it as every record", async () => {
    expect(await bulkDeleteOrganizations([])).toEqual({ success: false, error: "no_selection" })
    expect(mockDeleteRecord).not.toHaveBeenCalled()
  })

  it("collapses duplicate ids so a repeated id is dispatched exactly once", async () => {
    queueRows([org("o1", OWNER)])

    const result = await bulkDeleteOrganizations(["o1", "o1", "o1"])

    expect(result).toEqual({ success: true, succeeded: ["o1"], failed: [] })
    expect(mockDeleteRecord).toHaveBeenCalledTimes(1)
  })

  it("reports a missing row as notFound and never dispatches for it", async () => {
    queueRows([undefined])

    expect(await bulkDeleteOrganizations(["o1"])).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "o1", reason: "notFound" }],
    })
    expect(mockDeleteRecord).not.toHaveBeenCalled()
  })

  it("reports a row owned by someone else as notPermitted and never dispatches for it", async () => {
    queueRows([org("o1", OTHER)])

    expect(await bulkDeleteOrganizations(["o1"])).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "o1", reason: "notPermitted" }],
    })
    expect(mockDeleteRecord).not.toHaveBeenCalled()
  })

  it("AUTHORIZATION ASYMMETRY: an admin who does not own the row is still refused, with no dispatch", async () => {
    mockAuth.mockResolvedValue(sessionFor("u3", "admin"))
    queueRows([org("o1", OTHER)])

    expect(await bulkDeleteOrganizations(["o1"])).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "o1", reason: "notPermitted" }],
    })
    expect(mockDeleteRecord).not.toHaveBeenCalled()
  })

  it("maps a refused mutation to unknown and CONTINUES to the remaining ids", async () => {
    queueRows([org("o1", OWNER), org("o2", OWNER), org("o3", OWNER)])
    mockDeleteRecord
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: "constraint violation on organizations_pkey" })
      .mockResolvedValueOnce({ success: true })

    const result = await bulkDeleteOrganizations(["o1", "o2", "o3"])

    expect(result).toEqual({
      success: true,
      succeeded: ["o1", "o3"],
      failed: [{ id: "o2", reason: "unknown" }],
    })
    expect(mockOrgFindFirst).toHaveBeenCalledTimes(3)
    expect(dispatchedIds(mockDeleteRecord)).toEqual(["o1", "o2", "o3"])
  })

  it("returns nine successes and three named failures for a twelve-id mixed batch", async () => {
    const ids = mixedIds(12)
    queueRows(ids.map((id, index) => org(id, index < 9 ? OWNER : OTHER)))

    const result = await bulkDeleteOrganizations(ids)

    expect(result.success).toBe(true)
    if (!result.success) throw new Error("expected the call to run")
    expect(result.succeeded).toHaveLength(9)
    expect(result.failed).toHaveLength(3)
    expect(result.failed.every((failure) => failure.reason === "notPermitted")).toBe(true)
    expect(dispatchedIds(mockDeleteRecord)).toEqual(ids.slice(0, 9))
  })

  it("opens exactly one actor scope for the whole loop, built from the session alone", async () => {
    const ids = mixedIds(12)
    queueRows(ids.map((id, index) => org(id, index < 9 ? OWNER : OTHER)))

    await bulkDeleteOrganizations(ids)

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: OWNER })
  })

  it("revalidates once for a partial success and not at all when nothing succeeded", async () => {
    queueRows([org("o1", OWNER), org("o2", OTHER)])

    await bulkDeleteOrganizations(["o1", "o2"])
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/organizations")

    mockRevalidatePath.mockClear()
    mockOrgFindFirst.mockReset()
    queueRows([org("o3", OTHER)])

    await bulkDeleteOrganizations(["o3"])
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

describe("bulkReassignOrganizationOwner", () => {
  it("refuses an unauthenticated caller before any actor scope opens or any dispatch runs", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await bulkReassignOrganizationOwner(["o1"], NEW_OWNER)).toEqual({
      success: false,
      error: "not_authenticated",
    })
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockUpdateOwner).not.toHaveBeenCalled()
  })

  it("refuses a target user that does not resolve, before opening any actor scope", async () => {
    mockUserFindFirst.mockResolvedValue(undefined as never)

    expect(await bulkReassignOrganizationOwner(["o1"], "ghost")).toEqual({
      success: false,
      error: "invalid_owner",
    })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
  })

  it("validates the target exactly once, before the loop, not once per record", async () => {
    const ids = mixedIds(12)
    queueRows(ids.map((id) => org(id, OWNER)))

    await bulkReassignOrganizationOwner(ids, NEW_OWNER)

    expect(mockUserFindFirst).toHaveBeenCalledTimes(1)
    expect(mockUserFindFirst.mock.calls[0][0]).toBeDefined()
  })

  it("refuses an unverified target: the approved predicate matches nothing, so no dispatch runs", async () => {
    mockUserFindFirst.mockResolvedValue(undefined as never)

    expect(await bulkReassignOrganizationOwner(["o1"], "pending-user")).toEqual({
      success: false,
      error: "invalid_owner",
    })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
  })

  it("refuses a soft-deleted target: the not-deleted predicate matches nothing, so no dispatch runs", async () => {
    mockUserFindFirst.mockResolvedValue(undefined as never)

    expect(await bulkReassignOrganizationOwner(["o1"], "deleted-user")).toEqual({
      success: false,
      error: "invalid_owner",
    })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
  })

  it("refuses a row the caller does not own even when the target is valid", async () => {
    queueRows([org("o1", OTHER)])

    expect(await bulkReassignOrganizationOwner(["o1"], NEW_OWNER)).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "o1", reason: "notPermitted" }],
    })
    expect(mockUpdateOwner).not.toHaveBeenCalled()
  })

  it("returns nine successes and three notPermitted failures for a twelve-id mixed batch", async () => {
    const ids = mixedIds(12)
    queueRows(ids.map((id, index) => org(id, index < 9 ? OWNER : OTHER)))

    const result = await bulkReassignOrganizationOwner(ids, NEW_OWNER)

    expect(result.success).toBe(true)
    if (!result.success) throw new Error("expected the call to run")
    expect(result.succeeded).toHaveLength(9)
    expect(result.failed).toHaveLength(3)
    expect(result.failed.every((failure) => failure.reason === "notPermitted")).toBe(true)
  })

  it("opens one actor scope and revalidates once, after the loop", async () => {
    const ids = mixedIds(12)
    queueRows(ids.map((id, index) => org(id, index < 9 ? OWNER : OTHER)))

    await bulkReassignOrganizationOwner(ids, NEW_OWNER)

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
  })

  it("passes the four string arguments in the order types cannot check", async () => {
    queueRows([org("o1", OWNER)])

    await bulkReassignOrganizationOwner(["o1"], NEW_OWNER)

    expect(mockUpdateOwner).toHaveBeenCalledWith("organization", "o1", NEW_OWNER, OWNER)
  })
})
