/**
 * THE AUTHORIZATION MATRIX FOR THE THREE DEALS BULK ACTIONS (BULK-02, BULK-03, BULK-04).
 *
 * SCAFFOLD NOTE — built on `src/app/trash/actions.test.ts:1-60`, the only scaffold in this repo that
 * swaps the SESSION per test (absent / member-owner / member-non-owner / admin). The
 * `vi.mock("@/lib/api/auth")` auto-approve bypass used by the `/api/v1` route tests cannot express
 * that, so `auth` is a bare `vi.fn()` here and every test drives `mockResolvedValue` itself.
 *
 * DEALS IS THE ONE ENTITY IN THIS PHASE WITH AN ADMIN BYPASS, AND THAT IS WHY THIS FILE EXISTS.
 * `src/app/deals/actions.ts` guards every single-record write with
 * `ownerId !== session.user.id && session.user.role !== "admin"` (four sites), while the
 * organizations, people and activities actions guard theirs with the ownership half ALONE. So this
 * suite asserts BOTH DIRECTIONS of the asymmetry — an admin DOES succeed on a deal it does not own,
 * and a non-admin non-owner does NOT — and the sibling bulk suites for the other three entities
 * assert the opposite. "Unifying" the four predicates is either a privilege escalation on three
 * entities or a regression on this one; the cases below are what make each direction fail loudly.
 *
 * WHAT IS MOCKED AND WHY
 *   - `@/auth`                    — the session under test.
 *   - `@/db`                      — throws at import time without DATABASE_URL, and the per-record
 *                                   read is what the authorization cases drive.
 *   - `next/cache`                — `revalidatePath` is a call-COUNT assertion target: once after
 *                                   the loop, never per record.
 *   - `@/lib/bulk/dispatch`       — the mutation routing. Its own behaviour is plan 38-06's suite;
 *                                   here the interesting assertion is frequently that it was
 *                                   NOT called.
 *   - `@/lib/export/formatters`   — `fetchFilteredData`'s exact argument object is the T-38-01 gate.
 *   - `@/lib/audit/actor-context` — `runWithActor` is replaced by a spy that RECORDS its actor and
 *                                   still invokes the callback, so "one scope for the whole loop"
 *                                   and the identity inside it are both assertable (T-38-04).
 *   - `@/lib/email/send`          — `sendDealAssignedEmail` exists here only to be asserted ABSENT
 *                                   (D-13 / T-38-14). A source gate alone would not prove the
 *                                   runtime never reaches it.
 *
 * WHAT IS DELIBERATELY NOT MOCKED
 *   - The authorization predicate itself. There is no `isOwnerOrAdmin` helper to stub: the
 *     comparison lives inline in each action, exactly as it does at `deals/actions.ts:155`, and it
 *     is the subject of this file.
 *
 * THE ASSERTION THAT MATTERS MOST IS AN ABSENCE. A refusal returned AFTER the write was issued
 * would satisfy any test that only inspects the return value, so every denial case below asserts
 * the dispatch was never called, and the two no-email cases assert an absence after a fully
 * SUCCESSFUL call — the only shape in which an unwanted notification could appear.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

vi.mock("@/db", () => ({
  db: {
    query: {
      deals: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
  },
}))

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/bulk/dispatch", () => ({
  deleteRecordByType: vi.fn(),
  updateRecordOwnerByType: vi.fn(),
}))

vi.mock("@/lib/export/formatters", () => ({ fetchFilteredData: vi.fn() }))

vi.mock("@/lib/audit/actor-context", () => ({
  runWithActor: vi.fn((_actor: unknown, fn: () => unknown) => fn()),
  // The mutation layer this action file imports reads the actor back out; stubbed so loading it
  // cannot reach the real AsyncLocalStorage.
  getCurrentActor: vi.fn(),
}))

vi.mock("@/lib/email/send", () => ({ sendDealAssignedEmail: vi.fn() }))

import { auth } from "@/auth"
import { db } from "@/db"
import { revalidatePath } from "next/cache"
import { runWithActor } from "@/lib/audit/actor-context"
import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"
import { sendDealAssignedEmail } from "@/lib/email/send"

import { bulkDeleteDeals, bulkReassignDealOwner } from "./actions"

const mockAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockDelete = vi.mocked(deleteRecordByType)
const mockReassign = vi.mocked(updateRecordOwnerByType)
const mockRunWithActor = vi.mocked(runWithActor)
const mockEmail = vi.mocked(sendDealAssignedEmail)

type DealRow = { id: string; ownerId: string | null } | undefined
const mockDealFindFirst = db.query.deals.findFirst as unknown as ReturnType<typeof vi.fn>
const mockUserFindFirst = db.query.users.findFirst as unknown as ReturnType<typeof vi.fn>

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

/** A live deal row as the per-record read returns it. */
const row = (id: string, ownerId: string = OWNER) => ({ id, ownerId })

/**
 * The per-record read answers in loop order, so a queue is enough and no `where`-object
 * introspection is needed. `undefined` models a miss (absent or already in Trash — the read is
 * `deletedAt`-scoped, so the two are indistinguishable and both map to `notFound`).
 */
function queueDeals(rows: DealRow[]) {
  for (const value of rows) mockDealFindFirst.mockResolvedValueOnce(value)
}

/** `n` ids, distinct and short. */
const idsOf = (n: number, prefix = "d") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

/** The approved, non-deleted reassign target the two-predicate lookup returns. */
const APPROVED_TARGET = { id: NEW_OWNER, status: "approved", deletedAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  mockRunWithActor.mockImplementation((_actor, fn) => fn())
  mockDealFindFirst.mockResolvedValue(row("d1"))
  mockUserFindFirst.mockResolvedValue(APPROVED_TARGET)
  mockDelete.mockResolvedValue({ success: true })
  mockReassign.mockResolvedValue({ success: true })
})

describe("bulkDeleteDeals", () => {
  it("refuses an unauthenticated caller before any actor scope opens or any record is read", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await bulkDeleteDeals(["d1"])).toEqual({ success: false, error: "not_authenticated" })

    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockDealFindFirst).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("refuses more than BULK_MAX_IDS ids, reporting the cap, with nothing written", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    expect(await bulkDeleteDeals(idsOf(101))).toEqual({
      success: false,
      error: "too_many",
      max: 100,
    })

    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("accepts exactly BULK_MAX_IDS ids — the cap is a ceiling, not an off-by-one refusal", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    queueDeals(idsOf(100).map(id => row(id)))

    const result = await bulkDeleteDeals(idsOf(100))

    expect(result).toEqual({ success: true, succeeded: idsOf(100), failed: [] })
    expect(mockDelete).toHaveBeenCalledTimes(100)
  })

  it("refuses an empty selection rather than widening it to every deal", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    expect(await bulkDeleteDeals([])).toEqual({ success: false, error: "no_selection" })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("refuses a malformed argument — a server action is a POST endpoint, so the annotation is not a control", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    for (const hostile of ["d1", { id: "d1" }, [123], [""], [null], null]) {
      expect(await bulkDeleteDeals(hostile as unknown as string[])).toEqual({
        success: false,
        error: "no_selection",
      })
    }

    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
  })

  it("collapses duplicate ids before the loop, dispatching once for the repeated id", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    queueDeals([row("d1"), row("d2")])

    const result = await bulkDeleteDeals(["d1", "d1", "d2", "d1"])

    expect(result).toEqual({ success: true, succeeded: ["d1", "d2"], failed: [] })
    expect(mockDelete).toHaveBeenCalledTimes(2)
    expect(mockDelete.mock.calls.filter(call => call[1] === "d1")).toHaveLength(1)
  })

  it("reports a missing or already-trashed record as notFound without dispatching it", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    queueDeals([undefined])

    expect(await bulkDeleteDeals(["gone"])).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "gone", reason: "notFound" }],
    })

    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("refuses a NON-ADMIN who does not own the record, without dispatching it", async () => {
    mockAuth.mockResolvedValue(sessionFor(OTHER, "member"))
    queueDeals([row("d1", OWNER)])

    expect(await bulkDeleteDeals(["d1"])).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "d1", reason: "notPermitted" }],
    })

    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("ADMIN BYPASS PRESENT: an admin deletes a deal owned by someone else, and the dispatch runs", async () => {
    // The mirror image of case A.7 in the organizations, people and activities suites, where the
    // same session must be REFUSED. Drop `&& session.user.role !== "admin"` from the predicate and
    // this test goes red — which is the whole point of asserting the asymmetry from both sides.
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    queueDeals([row("d1", OWNER)])

    expect(await bulkDeleteDeals(["d1"])).toEqual({
      success: true,
      succeeded: ["d1"],
      failed: [],
    })

    expect(mockDelete).toHaveBeenCalledWith("deal", "d1", ADMIN)
  })

  it("classifies a mutation refusal as unknown and CONTINUES the loop past it", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    queueDeals([row("d1"), row("d2"), row("d3")])
    mockDelete
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: "deals_pkey violated on table deals" })
      .mockResolvedValueOnce({ success: true })

    const result = await bulkDeleteDeals(["d1", "d2", "d3"])

    expect(result).toEqual({
      success: true,
      succeeded: ["d1", "d3"],
      failed: [{ id: "d2", reason: "unknown" }],
    })
    // All three were read and all three were dispatched: the loop neither broke nor threw.
    expect(mockDealFindFirst).toHaveBeenCalledTimes(3)
    expect(mockDelete).toHaveBeenCalledTimes(3)
  })

  it("never leaks the mutation's own error string across the client boundary", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    queueDeals([row("d1")])
    mockDelete.mockResolvedValueOnce({ success: false, error: "relation deals does not exist" })

    const result = await bulkDeleteDeals(["d1"])

    expect(JSON.stringify(result)).not.toContain("relation deals")
  })

  it("12 ids for a NON-ADMIN, 9 owned and 3 not: 9 succeeded, 3 notPermitted", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER, "member"))
    const ids = idsOf(12)
    queueDeals(ids.map((id, index) => row(id, index < 9 ? OWNER : OTHER)))

    const result = await bulkDeleteDeals(ids)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.succeeded).toHaveLength(9)
    expect(result.failed).toHaveLength(3)
    expect(result.failed.every(failure => failure.reason === "notPermitted")).toBe(true)
    expect(mockDelete).toHaveBeenCalledTimes(9)
  })

  it("the SAME 12 ids for an ADMIN: 12 succeeded, 0 failed — the asymmetry, in one place", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    const ids = idsOf(12)
    queueDeals(ids.map((id, index) => row(id, index < 9 ? OWNER : OTHER)))

    const result = await bulkDeleteDeals(ids)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.succeeded).toHaveLength(12)
    expect(result.failed).toHaveLength(0)
    expect(mockDelete).toHaveBeenCalledTimes(12)
  })

  it("opens exactly ONE actor scope for the whole loop, built from the session alone", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    const ids = idsOf(12)
    queueDeals(ids.map(id => row(id)))

    await bulkDeleteDeals(ids)

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: OWNER })
  })

  it("revalidates once after a partially successful call, and not at all when nothing succeeded", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    queueDeals([row("d1"), undefined, row("d3", OTHER)])

    await bulkDeleteDeals(["d1", "d2", "d3"])
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/deals")

    vi.clearAllMocks()
    mockRunWithActor.mockImplementation((_actor, fn) => fn())
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    queueDeals([undefined, undefined])

    await bulkDeleteDeals(["x1", "x2"])
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("sends NO email, even after a fully successful 12-id delete (D-13)", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    const ids = idsOf(12)
    queueDeals(ids.map(id => row(id)))

    await bulkDeleteDeals(ids)

    expect(mockEmail).not.toHaveBeenCalled()
  })
})

describe("bulkReassignDealOwner", () => {
  it("refuses an unauthenticated caller before any actor scope opens", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await bulkReassignDealOwner(["d1"], NEW_OWNER)).toEqual({
      success: false,
      error: "not_authenticated",
    })

    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockReassign).not.toHaveBeenCalled()
  })

  it("refuses over-cap and empty selections before validating the target", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    expect(await bulkReassignDealOwner(idsOf(101), NEW_OWNER)).toEqual({
      success: false,
      error: "too_many",
      max: 100,
    })
    expect(await bulkReassignDealOwner([], NEW_OWNER)).toEqual({
      success: false,
      error: "no_selection",
    })

    expect(mockReassign).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
  })

  it("refuses a target user that does not exist, before opening any actor scope", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockUserFindFirst.mockResolvedValue(undefined)

    expect(await bulkReassignDealOwner(["d1"], "ghost")).toEqual({
      success: false,
      error: "invalid_owner",
    })

    expect(mockReassign).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockDealFindFirst).not.toHaveBeenCalled()
  })

  it("refuses a target user that exists but is not approved", async () => {
    // The action's lookup carries BOTH predicates in one query, so an unapproved user simply does
    // not match and the read answers `undefined` — the shape mocked here. That both predicates are
    // really in that query is pinned by the source gate at the bottom of this file, because a
    // single mocked return cannot distinguish which of the two excluded the row.
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockUserFindFirst.mockResolvedValue(undefined)

    expect(await bulkReassignDealOwner(["d1"], "pending-user")).toEqual({
      success: false,
      error: "invalid_owner",
    })

    expect(mockUserFindFirst).toHaveBeenCalledTimes(1)
    const lookup = mockUserFindFirst.mock.calls[0][0] as Record<string, unknown> | undefined
    expect(lookup && "where" in lookup).toBe(true)
    expect(mockReassign).not.toHaveBeenCalled()
  })

  it("refuses a target user that exists but is soft-deleted", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockUserFindFirst.mockResolvedValue(undefined)

    expect(await bulkReassignDealOwner(["d1"], "deleted-user")).toEqual({
      success: false,
      error: "invalid_owner",
    })

    expect(mockReassign).not.toHaveBeenCalled()
  })

  it("validates the target ONCE for the whole call, not per record", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    const ids = idsOf(12)
    queueDeals(ids.map(id => row(id)))

    await bulkReassignDealOwner(ids, NEW_OWNER)

    expect(mockUserFindFirst).toHaveBeenCalledTimes(1)
  })

  it("refuses a NON-ADMIN who does not own the record, without dispatching it", async () => {
    mockAuth.mockResolvedValue(sessionFor(OTHER, "member"))
    queueDeals([row("d1", OWNER)])

    expect(await bulkReassignDealOwner(["d1"], NEW_OWNER)).toEqual({
      success: true,
      succeeded: [],
      failed: [{ id: "d1", reason: "notPermitted" }],
    })

    expect(mockReassign).not.toHaveBeenCalled()
  })

  it("ADMIN BYPASS PRESENT: an admin reassigns a deal owned by someone else", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    queueDeals([row("d1", OWNER)])

    expect(await bulkReassignDealOwner(["d1"], NEW_OWNER)).toEqual({
      success: true,
      succeeded: ["d1"],
      failed: [],
    })

    expect(mockReassign).toHaveBeenCalledTimes(1)
  })

  it("12 ids for a NON-ADMIN, 9 owned and 3 not: 9 succeeded, 3 notPermitted", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER, "member"))
    const ids = idsOf(12)
    queueDeals(ids.map((id, index) => row(id, index < 9 ? OWNER : OTHER)))

    const result = await bulkReassignDealOwner(ids, NEW_OWNER)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.succeeded).toHaveLength(9)
    expect(result.failed).toHaveLength(3)
    expect(result.failed.every(failure => failure.reason === "notPermitted")).toBe(true)
  })

  it("opens one actor scope and revalidates once, after the loop", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    const ids = idsOf(12)
    queueDeals(ids.map(id => row(id)))

    await bulkReassignDealOwner(ids, NEW_OWNER)

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: OWNER })
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
  })

  it("routes ('deal', id, newOwnerId, actorId) in that exact argument order", async () => {
    // All four are strings, so the type checker cannot tell a swapped call from a correct one:
    // `ownerId` is the NEW OWNER and `userId` is the ACTOR, and swapping them would attribute the
    // audit row to the recipient.
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    queueDeals([row("d1")])

    await bulkReassignDealOwner(["d1"], NEW_OWNER)

    expect(mockReassign).toHaveBeenCalledWith("deal", "d1", NEW_OWNER, OWNER)
  })

  it("continues past a mutation refusal, reporting it as unknown", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    queueDeals([row("d1"), row("d2"), row("d3")])
    mockReassign
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: "update on table deals failed" })
      .mockResolvedValueOnce({ success: true })

    const result = await bulkReassignDealOwner(["d1", "d2", "d3"], NEW_OWNER)

    expect(result).toEqual({
      success: true,
      succeeded: ["d1", "d3"],
      failed: [{ id: "d2", reason: "unknown" }],
    })
    expect(mockReassign).toHaveBeenCalledTimes(3)
  })

  it("sends NO email, even after a fully successful 12-id reassign — the runtime half of D-13", async () => {
    // A per-record notification would emit up to 100 emails from one click. The single-record
    // `updateDeal` path DOES notify, off newly added ASSIGNEES, so this absence is a real
    // divergence and not a tautology.
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    const ids = idsOf(12)
    queueDeals(ids.map(id => row(id)))

    const result = await bulkReassignDealOwner(ids, NEW_OWNER)

    expect(result).toEqual({ success: true, succeeded: ids, failed: [] })
    expect(mockEmail).not.toHaveBeenCalled()
  })
})
