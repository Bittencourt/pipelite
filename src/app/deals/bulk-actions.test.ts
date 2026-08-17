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

import { readStrippedSource, stripComments } from "@/components/custom-fields/__tests__/source-scan"

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
import { fetchFilteredData } from "@/lib/export/formatters"

import { bulkDeleteDeals, bulkReassignDealOwner, exportSelectedDeals } from "./actions"

const mockAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockDelete = vi.mocked(deleteRecordByType)
const mockReassign = vi.mocked(updateRecordOwnerByType)
const mockRunWithActor = vi.mocked(runWithActor)
const mockEmail = vi.mocked(sendDealAssignedEmail)
const mockFetchFiltered = vi.mocked(fetchFilteredData)

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
  // `count` deliberately differs from every test's input id count, so a filename built from
  // `uniqueIds.length` instead of the fetch result cannot pass.
  mockFetchFiltered.mockResolvedValue({
    success: true,
    data: "id,title\nd1,Acme renewal\n",
    filename: "deals-2026-08-17.csv",
    count: 7,
  })
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

  it("counts the cap AFTER deduping: 101 entries carrying 100 distinct ids is a legal call", async () => {
    // Pins the ORDER of the two guards. If the cap were checked against the raw argument, this call
    // would be refused even though the user selected 100 records — and if dedupe ran after the cap,
    // a caller could smuggle 5,000 entries past a 100-id cap by repeating one id.
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    const distinct = idsOf(100)
    queueDeals(distinct.map(id => row(id)))

    const result = await bulkDeleteDeals([...distinct, distinct[0]])

    expect(result).toEqual({ success: true, succeeded: distinct, failed: [] })
    expect(mockDelete).toHaveBeenCalledTimes(100)
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

    // NINE successes out of twelve, and still ONE call. The two scenarios above are both VACUOUS on
    // their own: a run with exactly one success produces exactly one call whether the revalidation
    // sits after the loop or inside it, so only an N-success batch distinguishes the two placements.
    // Verified by negative proof 3 — moving it into the loop makes this assertion report 9 calls.
    vi.clearAllMocks()
    mockRunWithActor.mockImplementation((_actor, fn) => fn())
    mockAuth.mockResolvedValue(sessionFor(OWNER, "member"))
    const mixed = idsOf(12)
    queueDeals(mixed.map((id, index) => row(id, index < 9 ? OWNER : OTHER)))
    mockDelete.mockResolvedValue({ success: true })

    await bulkDeleteDeals(mixed)
    expect(mockDelete).toHaveBeenCalledTimes(9)
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)

    // And the same for a batch in which every id succeeds.
    vi.clearAllMocks()
    mockRunWithActor.mockImplementation((_actor, fn) => fn())
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    const allOwned = idsOf(12)
    queueDeals(allOwned.map(id => row(id)))
    mockDelete.mockResolvedValue({ success: true })

    await bulkDeleteDeals(allOwned)
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
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

describe("exportSelectedDeals", () => {
  it("refuses an unauthenticated caller without reading a single row", async () => {
    mockAuth.mockResolvedValue(null)

    const result = await exportSelectedDeals(["d1"])

    expect(result.success).toBe(false)
    expect(mockFetchFiltered).not.toHaveBeenCalled()
  })

  it("refuses an empty selection rather than exporting the whole table", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    const result = await exportSelectedDeals([])

    expect(result.success).toBe(false)
    expect(mockFetchFiltered).not.toHaveBeenCalled()
  })

  it("refuses a malformed argument", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    for (const hostile of ["d1", { ids: ["d1"] }, [42], null]) {
      expect((await exportSelectedDeals(hostile as unknown as string[])).success).toBe(false)
    }

    expect(mockFetchFiltered).not.toHaveBeenCalled()
  })

  it("refuses more than BULK_MAX_IDS ids", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    const result = await exportSelectedDeals(idsOf(101))

    expect(result.success).toBe(false)
    expect(mockFetchFiltered).not.toHaveBeenCalled()
  })

  it("builds the export options ENTIRELY server-side, with no stage filter", async () => {
    // The deep-equal is the T-38-01 gate: it fails on an EXTRA key too, which is what proves no
    // `stage` filter leaked in even though `/deals` is a kanban organised by stage and the filter
    // type has a slot for one. The selection already determines the rows.
    mockAuth.mockResolvedValue(sessionFor(OWNER, "member"))

    await exportSelectedDeals(["d1", "d2", "d1"])

    expect(mockFetchFiltered).toHaveBeenCalledTimes(1)
    expect(mockFetchFiltered).toHaveBeenCalledWith({
      entityType: "deal",
      format: "csv",
      includeCustomFields: true,
      filters: { ids: ["d1", "d2"] },
    })
  })

  it("names the file deals-selected-<count>-<date>.csv, counting from the fetch RESULT", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    const result = await exportSelectedDeals(["d1", "d2"])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.filename).toMatch(/^deals-selected-\d+-\d{4}-\d{2}-\d{2}\.csv$/)
    // 7 is the mocked `count`; the input carried 2 ids, so a filename built from the argument
    // would read `deals-selected-2-…`.
    expect(result.filename.split("-")[2]).toBe("7")
    expect(result.data).toBe("id,title\nd1,Acme renewal\n")
    expect(result.count).toBe(7)
  })

  it("passes a fetch failure through unchanged", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockFetchFiltered.mockResolvedValue({ success: false, error: "Unknown entity type" })

    expect(await exportSelectedDeals(["d1"])).toEqual({
      success: false,
      error: "Unknown entity type",
    })
  })

  it("exports for a NON-ADMIN too: the scoped export carries no admin gate", async () => {
    // `getExportData` in the admin export action IS admin-gated, and that is exactly why this
    // action exists with its own narrow signature rather than reusing it.
    mockAuth.mockResolvedValue(sessionFor(OTHER, "member"))

    expect((await exportSelectedDeals(["d1"])).success).toBe(true)
  })
})

/**
 * SOURCE GATE — READS COMMENT-STRIPPED SOURCE, AND THAT IS NOT OPTIONAL.
 *
 * A grep-based acceptance gate that searched RAW file text collided with an explanatory COMMENT nine
 * times in Phase 37 alone (three more in Phase 35), including once with a plan's own suggested
 * wording. THIS FILE IS THE MOST EXPOSED CASE IN THE PHASE, because its single most important rule
 * is a NEGATIVE ABOUT A FUNCTION NAME — the general deal update must never be reached with a partial
 * owner payload, since its schema is a `.partial()` that preserves the assignee list's `.default([])`
 * and therefore clears every join row, unaudited — and that rule is exactly the kind of thing a
 * maintainer will explain in a comment right beside the call site. A raw-text gate would then fail on
 * the WARNING against the bug rather than on the bug. If a gate below ever trips on a comment, reword
 * the comment; never weaken the gate.
 *
 * The stripper is the shared string-aware one, so `href="https://…"` and any `//` inside a string
 * literal cannot swallow the rest of a line.
 *
 * THE POSITIVE ASSERTIONS COME FIRST, deliberately. A gate made only of absences passes perfectly
 * when its anchor moves and its slice collapses to nothing — so each slice is proven non-empty and
 * proven to contain the markers it must contain before anything is asserted missing.
 */
const ACTIONS_PATH = "src/app/deals/actions.ts"
const ACTIONS = readStrippedSource(ACTIONS_PATH)

/** A word that exists ONLY inside a comment in the action file, so stripping is provable. */
const COMMENT_ONLY_SENTINEL = "T-38-01"

/**
 * The source of one exported action: its declaration up to the next top-level `export`.
 *
 * The anchor assertion is WR-13 discipline and it is load-bearing: `indexOf(x, -1)` silently behaves
 * as `indexOf(x, 0)`, so a helper handed a missing anchor widens to the enclosing module and every
 * negative assertion below quietly stops detecting anything.
 */
function sliceExport(name: string): string {
  const declaration = `export async function ${name}`
  const start = ACTIONS.indexOf(declaration)

  expect(
    start,
    `${declaration} not found in ${ACTIONS_PATH} (comment-stripped). Every assertion in this gate would widen to the whole module and stop detecting anything — WR-13.`
  ).toBeGreaterThan(-1)

  const end = ACTIONS.indexOf("\nexport ", start + 1)
  return end === -1 ? ACTIONS.slice(start) : ACTIONS.slice(start, end)
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1

/** The last statement of the per-record loop's callback: everything after it runs ONCE. */
const LOOP_CALLBACK_END = "return { succeeded, failed }"

/** The admin clause deals carries and the other three entities do not. */
const ADMIN_CLAUSE = 'session.user.role !== "admin"'

const WRITE_ACTIONS = ["bulkDeleteDeals", "bulkReassignDealOwner"] as const

/**
 * Forbidden in either bulk WRITE slice.
 *
 * The first six are the silent-data-destruction family (T-38-05) and the no-notification guarantee
 * (T-38-14): the owner transfer must reach the owner-only mutation and nothing else. The last three
 * are the loop-shape guarantees — a wrapping transaction cannot name WHICH record failed, a parallel
 * fan-out defeats the sequential cap, and the audit row is written by the mutation layer, never here.
 */
const FORBIDDEN_IN_WRITES = [
  "updateDealMutation",
  "dealAssignees",
  "assigneeIds",
  "newAssigneeUserIds",
  "dealTitle",
  "sendDealAssignedEmail",
  "db.transaction",
  "Promise.all",
  "auditLog",
]

/**
 * Forbidden in the scoped export slice (T-38-01).
 *
 * Every one of these would widen the signature past "a list of ids": an options or filter type in the
 * parameter list turns a `{}` from any browser into "export everything", a format parameter re-opens
 * the deferred Pipedrive variants, reaching the admin export action re-imports its gate, and a `role`
 * or `stage` read means the scope came from somewhere other than the selection.
 */
const FORBIDDEN_IN_EXPORT = [
  "ExportFilters",
  "ExportOptions",
  "ExportFormat",
  "pipedrive",
  "getExportData",
  "role",
  "stage",
]

describe("source gate: deals/actions.ts (comment-stripped)", () => {
  it("really read the action file, and really stripped its comments", () => {
    expect(ACTIONS.length, `${ACTIONS_PATH} read as empty`).toBeGreaterThan(0)
    expect(ACTIONS).toContain("export async function bulkDeleteDeals")
    // Present in the raw file, inside a comment. Its absence here is the proof that every negative
    // assertion below is reading code and not prose.
    expect(
      ACTIONS.includes(COMMENT_ONLY_SENTINEL),
      `${COMMENT_ONLY_SENTINEL} survived stripping, so this gate is reading raw text and would trip on comments`
    ).toBe(false)

    // Belt and braces, so the sentinel above cannot go vacuous if that one comment is ever
    // reworded: the stripper demonstrably removes both comment forms, and no doc-comment opener
    // survives in what this gate actually reads.
    expect(stripComments("const a = 1 // T-38-01\n/** T-38-01 */\n")).not.toContain(
      COMMENT_ONLY_SENTINEL
    )
    expect(ACTIONS, "a doc-comment opener survived, so this source was not stripped").not.toContain(
      "/**"
    )
  })

  it("finds all three bulk declarations, each as a non-empty slice narrower than the module", () => {
    for (const name of [...WRITE_ACTIONS, "exportSelectedDeals"]) {
      const slice = sliceExport(name)
      expect(slice.length, `${name} slice is empty`).toBeGreaterThan(0)
      expect(slice.length, `${name} slice widened to the whole module`).toBeLessThan(ACTIONS.length)
      expect(slice).toContain(name)
    }
  })

  it("carries deals' admin clause EXACTLY ONCE in each bulk write — the phase's one asymmetry", () => {
    // POSITIVE, and it is what makes this gate deals-specific rather than a copy of the sibling
    // suites, where the same assertion is an absence.
    for (const name of WRITE_ACTIONS) {
      expect(occurrences(sliceExport(name), ADMIN_CLAUSE), `${name} must carry deals' admin clause exactly once`).toBe(1)
    }
  })

  it("opens exactly one actor scope and revalidates exactly once, after the loop", () => {
    for (const name of WRITE_ACTIONS) {
      const slice = sliceExport(name)

      expect(occurrences(slice, "runWithActor"), `${name} must open exactly one actor scope`).toBe(1)
      expect(occurrences(slice, "revalidatePath"), `${name} must revalidate exactly once`).toBe(1)

      const loopEnd = slice.indexOf(LOOP_CALLBACK_END)
      expect(loopEnd, `${name}: loop-callback anchor "${LOOP_CALLBACK_END}" not found, so the ordering assertion below cannot be trusted`).toBeGreaterThan(-1)
      expect(
        slice.indexOf("revalidatePath"),
        `${name} must revalidate AFTER the loop callback returns, never inside the loop`
      ).toBeGreaterThan(loopEnd)
    }
  })

  it("checks the cap against the shared constant in every bulk action", () => {
    for (const name of [...WRITE_ACTIONS, "exportSelectedDeals"]) {
      expect(sliceExport(name), `${name} must check the shared id cap server-side`).toContain(
        "BULK_MAX_IDS"
      )
    }
  })

  it("checks the cap BEFORE any actor scope opens in both bulk writes", () => {
    for (const name of WRITE_ACTIONS) {
      const slice = sliceExport(name)
      expect(
        slice.indexOf("BULK_MAX_IDS"),
        `${name} must refuse an over-cap call before establishing an actor, so a rejected call leaves no attribution behind`
      ).toBeLessThan(slice.indexOf("runWithActor"))
    }
  })

  it("keeps every destructive and notifying identifier out of both bulk writes", () => {
    for (const name of WRITE_ACTIONS) {
      const slice = sliceExport(name)
      for (const token of FORBIDDEN_IN_WRITES) {
        expect(slice, `${name} must not reference ${token}`).not.toContain(token)
      }
    }
  })

  it("validates the reassign target against BOTH predicates, before the actor scope opens", () => {
    const slice = sliceExport("bulkReassignDealOwner")

    for (const predicate of ['eq(users.status, "approved")', "isNull(users.deletedAt)"]) {
      expect(slice, `the reassign target lookup must carry ${predicate}`).toContain(predicate)
      expect(
        slice.indexOf(predicate),
        `${predicate} must be evaluated BEFORE the actor scope opens, so an invalid target establishes no actor`
      ).toBeLessThan(slice.indexOf("runWithActor"))
    }
  })

  it("admits nothing but ids into the scoped export", () => {
    const slice = sliceExport("exportSelectedDeals")

    // ANTI-VACUOUS BY CONSTRUCTION, not by the token ban below. The parameter list is EXTRACTED and
    // compared for equality, so this assertion fails if the declaration is missing, renamed, grows a
    // second parameter, or has its type widened — none of which any ban list could notice. The ban
    // list is the second line of defence, for a widening that keeps the shape.
    const parameterList = slice.slice(
      slice.indexOf("(") + 1,
      slice.indexOf(")", slice.indexOf("("))
    )

    expect(
      parameterList.replace(/\s+/g, " ").trim(),
      "exportSelectedDeals must take a single ids parameter: an options or filter argument handed {} would export every deal in the database (T-38-01)"
    ).toBe("ids: string[]")

    for (const token of FORBIDDEN_IN_EXPORT) {
      expect(slice, `exportSelectedDeals must not reference ${token}`).not.toContain(token)
    }
  })

  it("builds the export options as server-side literals", () => {
    const slice = sliceExport("exportSelectedDeals")

    expect(slice).toContain('entityType: "deal"')
    expect(slice).toContain('format: "csv"')
    expect(slice).toContain("includeCustomFields: true")
    expect(slice).toContain("filters: { ids: uniqueIds }")
  })
})
