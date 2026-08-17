/**
 * THE AUTHORIZATION MATRIX FOR RESTORE AND PURGE (TRASH-02, TRASH-03).
 *
 * SCAFFOLD NOTE — `src/app/notes/actions.test.ts:1-30` is the only other suite in this repo that
 * mocks `@/auth`, and this suite is built on its scaffold for the same reason: the whole point is
 * to swap the SESSION per test (absent / member-owner / member-non-owner / admin), which the
 * `vi.mock("@/lib/api/auth")` auto-approve bypass used by the `/api/v1` route tests cannot do.
 * `auth` is therefore a bare `vi.fn()` and every test drives `mockResolvedValue` itself.
 *
 * WHAT IS MOCKED AND WHY
 *   - `@/auth`                    — the session under test.
 *   - `next/cache`                — `revalidatePath` is an assertion target.
 *   - `@/lib/trash/dispatch`      — the mutation layer. Its own behaviour is plan 37-06's suite;
 *                                   here the interesting assertion is frequently that it was
 *                                   NOT called.
 *   - `@/lib/trash/queries`       — the lookups. Plan 37-07's suite owns their SQL.
 *   - `@/lib/audit/actor-context` — `runWithActor` is replaced by a spy that RECORDS its actor and
 *                                   still invokes the callback, so both the wrapping and the
 *                                   identity inside it are assertable (T-37-08).
 *
 * WHAT IS DELIBERATELY NOT MOCKED
 *   - `@/lib/trash/entity-types`. The REAL `parseTrashTab` and `TRASH_TAB_TO_ENTITY` run, so the
 *     hostile-tab tests below prove the narrowing actually happens rather than proving a stub was
 *     called (T-37-03).
 *   - The authorization predicate itself. There is no `isOwnerOrAdmin` helper to stub: the
 *     comparison lives inline in the action exactly as it does in `src/app/deals/actions.ts:83`,
 *     and it is the subject of this file.
 *
 * THE ASSERTION THAT MATTERS MOST IS AN ABSENCE. A refusal returned AFTER the write was issued
 * would satisfy any test that only inspects the return value, so every denial case below asserts
 * the dispatch was never called.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/trash/dispatch", () => ({
  restoreRecordByType: vi.fn(),
  purgeRecordByType: vi.fn(),
}))

vi.mock("@/lib/trash/queries", () => ({
  findTrashedRecord: vi.fn(),
  findTrashedParents: vi.fn(),
}))

vi.mock("@/lib/audit/actor-context", () => ({
  runWithActor: vi.fn((_actor: unknown, fn: () => unknown) => fn()),
}))

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { runWithActor } from "@/lib/audit/actor-context"
import { purgeRecordByType, restoreRecordByType } from "@/lib/trash/dispatch"
import { findTrashedParents, findTrashedRecord } from "@/lib/trash/queries"

import { purgeRecord, restoreRecord, restoreWithLinked } from "./actions"

const mockAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockRestore = vi.mocked(restoreRecordByType)
const mockPurge = vi.mocked(purgeRecordByType)
const mockFindRecord = vi.mocked(findTrashedRecord)
const mockFindParents = vi.mocked(findTrashedParents)
const mockRunWithActor = vi.mocked(runWithActor)

const OWNER = "u1"
const OTHER = "u2"
const ADMIN = "u3"

function sessionFor(id: string, role: "admin" | "member" = "member"): Session {
  return {
    user: { id, role, name: `User ${id}`, email: `${id}@example.com` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as Session
}

/** The trashed deal every test acts on, owned by `u1`. */
const DEAL = { id: "d1", ownerId: OWNER, name: "Acme renewal" }

function parent(entityType: "organization" | "person" | "deal", id: string, ownerId: string) {
  return { entityType, id, name: `Parent ${id}`, ownerId } as const
}

/** Calls of a mock paired with their global invocation order, sorted as they actually ran. */
function orderedCalls(mock: { mock: { calls: unknown[][]; invocationCallOrder: number[] } }) {
  return mock.mock.calls
    .map((args, index) => ({ args, order: mock.mock.invocationCallOrder[index] }))
    .sort((a, b) => a.order - b.order)
}

function errorLines(): string[] {
  const spy = console.error as unknown as ReturnType<typeof vi.fn>
  return spy.mock.calls.map((call: unknown[]) => call.map(String).join(" "))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})

  mockRunWithActor.mockImplementation((_actor, fn) => fn())
  mockFindRecord.mockResolvedValue(DEAL)
  mockFindParents.mockResolvedValue([])
  mockRestore.mockResolvedValue({ success: true })
  mockPurge.mockResolvedValue({ success: true, detached: 0 })
})

describe("restoreRecord", () => {
  it("refuses an unauthenticated caller without reading or writing anything", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await restoreRecord("deals", "d1")).toEqual({
      success: false,
      code: "NOT_AUTHENTICATED",
    })

    // No lookup either: an unauthenticated caller must not be able to probe for existence.
    expect(mockFindRecord).not.toHaveBeenCalled()
    expect(mockRestore).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
  })

  it("restores the caller's own record, dispatching the entity type the tab maps to", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    const result = await restoreRecord("deals", "d1")

    expect(result).toEqual({ success: true, name: "Acme renewal", tab: "deals" })
    // The SINGULAR entity type reaches the dispatch, never the plural tab.
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(mockRestore).toHaveBeenCalledWith("deal", "d1")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trash")
  })

  it("refuses a member who does not own the record, and ISSUES NO WRITE", async () => {
    mockAuth.mockResolvedValue(sessionFor(OTHER))

    expect(await restoreRecord("deals", "d1")).toEqual({ success: false, code: "NOT_AUTHORIZED" })

    // The absence IS the assertion: a refusal returned after the write would pass a test that
    // only inspected the return value, and the record would still have come back (T-37-02).
    expect(mockRestore).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("lets an admin restore another user's record", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))

    expect(await restoreRecord("deals", "d1")).toEqual({
      success: true,
      name: "Acme renewal",
      tab: "deals",
    })
    expect(mockRestore).toHaveBeenCalledWith("deal", "d1")
  })

  it("reports NOT_IN_TRASH for a record the lookup cannot find, without dispatching", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockFindRecord.mockResolvedValue(null)

    expect(await restoreRecord("deals", "d1")).toEqual({ success: false, code: "NOT_IN_TRASH" })
    expect(mockRestore).not.toHaveBeenCalled()
  })

  it("forwards the mutation's NOT_IN_TRASH instead of flattening it into a generic failure", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockRestore.mockResolvedValue({ success: false, error: "NOT_IN_TRASH" })

    // This is the difference between "this was permanently deleted" and telling a user to retry
    // a record that no longer exists, forever (37-RESEARCH Pitfall 7).
    expect(await restoreRecord("deals", "d1")).toEqual({ success: false, code: "NOT_IN_TRASH" })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("maps any other mutation failure to FAILED", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockRestore.mockResolvedValue({ success: false, error: "Database unavailable" })

    const result = await restoreRecord("deals", "d1")

    expect(result).toEqual({ success: false, code: "FAILED" })
    // The driver's prose never reaches the client.
    expect(JSON.stringify(result)).not.toContain("Database unavailable")
  })

  it("establishes the actor from the SESSION and from no argument", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    await restoreRecord("deals", "d1")

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: OWNER })
    // The scope opens AFTER the session check and wraps the write (T-37-08, Pitfall 9).
    expect(mockRunWithActor.mock.invocationCallOrder[0]).toBeLessThan(
      mockRestore.mock.invocationCallOrder[0]
    )
  })

  it("narrows a hostile tab to the default instead of letting it reach the dispatch", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    const result = await restoreRecord(
      "organizations; drop table deals" as unknown as "organizations",
      "d1"
    )

    // The real `parseTrashTab` runs here: anything that is not one of the four literals becomes
    // `deals`, so no arbitrary string ever indexes the entity map (T-37-03).
    expect(mockFindRecord).toHaveBeenCalledWith("deal", "d1")
    expect(mockRestore).toHaveBeenCalledWith("deal", "d1")
    expect(result).toEqual({ success: true, name: "Acme renewal", tab: "deals" })
  })
})

describe("restoreWithLinked", () => {
  beforeEach(() => {
    mockFindParents.mockResolvedValue([
      parent("organization", "o1", OWNER),
      parent("person", "p1", OWNER),
    ])
  })

  it("restores the PARENTS FIRST and the record last, and reports how many came back", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    const result = await restoreWithLinked("deals", "d1")

    expect(result).toEqual({
      success: true,
      name: "Acme renewal",
      tab: "deals",
      count: 3,
      // Nothing fell short, so the client renders no second toast.
      unrestoredParents: 0,
    })

    // Order is load-bearing, not incidental: `cascadeToChildren` filters on the child relation's
    // null `deleted_at`, so a parent restored AFTER its child means the child's formula cascade
    // ran while the parent was still trashed.
    expect(orderedCalls(mockRestore).map((call) => call.args)).toEqual([
      ["organization", "o1"],
      ["person", "p1"],
      ["deal", "d1"],
    ])
  })

  it("wraps every restore in ONE actor scope opened before the first write", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    await restoreWithLinked("deals", "d1")

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: OWNER })
    expect(mockRunWithActor.mock.invocationCallOrder[0]).toBeLessThan(
      Math.min(...mockRestore.mock.invocationCallOrder)
    )
  })

  it("skips a parent the caller may not touch and still restores the record they clicked", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockFindParents.mockResolvedValue([
      parent("organization", "o1", OTHER),
      parent("person", "p1", OWNER),
    ])

    const result = await restoreWithLinked("deals", "d1")

    // The count reports what ACTUALLY came back — never what was attempted (T-37-28) — and the
    // shortfall is REPORTED rather than merely excluded (WR-07 companion): a silent omission left
    // the user with "1 record restored." and no account of the parent they asked for, next to a
    // badge that was still on screen. A count only, never which parent.
    expect(result).toEqual({
      success: true,
      name: "Acme renewal",
      tab: "deals",
      count: 2,
      unrestoredParents: 1,
    })
    expect(orderedCalls(mockRestore).map((call) => call.args)).toEqual([
      ["person", "p1"],
      ["deal", "d1"],
    ])
    // A linked restore must not become a way to reach another user's record.
    expect(mockRestore).not.toHaveBeenCalledWith("organization", "o1")
  })

  it("lets an admin restore parents owned by other users", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    mockFindParents.mockResolvedValue([
      parent("organization", "o1", OTHER),
      parent("person", "p1", OTHER),
    ])

    expect(await restoreWithLinked("deals", "d1")).toEqual({
      success: true,
      name: "Acme renewal",
      tab: "deals",
      count: 3,
      unrestoredParents: 0,
    })
  })

  it("counts only the successes when a parent restore fails, and still succeeds", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockRestore.mockImplementation(async (entityType: string) =>
      entityType === "organization"
        ? { success: false as const, error: "NOT_IN_TRASH" }
        : { success: true as const }
    )

    const result = await restoreWithLinked("deals", "d1")

    // Claiming a total failure would be a lie about the record that DID come back — and a failed
    // parent counts toward the shortfall exactly as a refused one does. The user does not need to
    // know which of the two it was; they need to know it did not come back.
    expect(result).toEqual({
      success: true,
      name: "Acme renewal",
      tab: "deals",
      count: 2,
      unrestoredParents: 1,
    })
    expect(errorLines().some((line) => line.includes("[trash-actions]"))).toBe(true)
  })

  it("behaves exactly like restoreRecord when nothing linked is in trash", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockFindParents.mockResolvedValue([])

    expect(await restoreWithLinked("deals", "d1")).toEqual({
      success: true,
      name: "Acme renewal",
      tab: "deals",
      count: 1,
      unrestoredParents: 0,
    })
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(mockRestore).toHaveBeenCalledWith("deal", "d1")
  })

  it("refuses an unauthenticated caller without looking anything up", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await restoreWithLinked("deals", "d1")).toEqual({
      success: false,
      code: "NOT_AUTHENTICATED",
    })
    expect(mockFindRecord).not.toHaveBeenCalled()
    expect(mockFindParents).not.toHaveBeenCalled()
    expect(mockRestore).not.toHaveBeenCalled()
  })

  it("refuses a member who does not own the record, and never reaches the parents", async () => {
    mockAuth.mockResolvedValue(sessionFor(OTHER))

    expect(await restoreWithLinked("deals", "d1")).toEqual({
      success: false,
      code: "NOT_AUTHORIZED",
    })
    // Resolving the parents at all would leak that this record has trashed ancestors.
    expect(mockFindParents).not.toHaveBeenCalled()
    expect(mockRestore).not.toHaveBeenCalled()
  })

  it("reports NOT_IN_TRASH when the record itself was purged in the meantime", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))
    mockRestore.mockImplementation(async (entityType: string) =>
      entityType === "deal"
        ? { success: false as const, error: "NOT_IN_TRASH" }
        : { success: true as const }
    )

    expect(await restoreWithLinked("deals", "d1")).toEqual({
      success: false,
      code: "NOT_IN_TRASH",
    })
  })

  it("narrows a hostile tab before it reaches the parent lookup", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    await restoreWithLinked("__proto__" as unknown as "deals", "d1")

    expect(mockFindParents).toHaveBeenCalledWith("deal", "d1")
  })
})

describe("purgeRecord", () => {
  it("refuses an unauthenticated caller without reading or writing anything", async () => {
    mockAuth.mockResolvedValue(null)

    expect(await purgeRecord("deals", "d1")).toEqual({
      success: false,
      code: "NOT_AUTHENTICATED",
    })
    expect(mockFindRecord).not.toHaveBeenCalled()
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it("refuses the record's OWNER when they are only a member, and NEVER CALLS THE PURGE", async () => {
    mockAuth.mockResolvedValue(sessionFor(OWNER))

    expect(await purgeRecord("deals", "d1")).toEqual({ success: false, code: "NOT_ADMIN" })

    // Hiding the button in `trash-table.tsx` is never the gate: a server action is a POST
    // endpoint the browser can invoke directly with no page involved (T-37-01). The absence of
    // this call is the entire control.
    expect(mockPurge).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("refuses a non-admin BEFORE any lookup, so the action is not an existence oracle", async () => {
    mockAuth.mockResolvedValue(sessionFor(OTHER))

    expect(await purgeRecord("deals", "d1")).toEqual({ success: false, code: "NOT_ADMIN" })
    // A member who could tell a real id from a fake one by the returned code would have a probe.
    expect(mockFindRecord).not.toHaveBeenCalled()
  })

  it("purges for an admin, reporting the detached children and the name for the toast", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    mockPurge.mockResolvedValue({ success: true, detached: 4 })

    expect(await purgeRecord("deals", "d1")).toEqual({
      success: true,
      name: "Acme renewal",
      detached: 4,
    })
    expect(mockPurge).toHaveBeenCalledTimes(1)
    expect(mockPurge).toHaveBeenCalledWith("deal", "d1")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trash")
  })

  it("establishes the actor from the session on the purge path too", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))

    await purgeRecord("deals", "d1")

    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: ADMIN })
    expect(mockRunWithActor.mock.invocationCallOrder[0]).toBeLessThan(
      mockPurge.mock.invocationCallOrder[0]
    )
  })

  it("reports NOT_IN_TRASH for a live or missing record, without purging", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    mockFindRecord.mockResolvedValue(null)

    expect(await purgeRecord("deals", "d1")).toEqual({ success: false, code: "NOT_IN_TRASH" })
    // The `isNotNull(deletedAt)` predicate on the lookup is the first of two layers that stop a
    // guessed id destroying a LIVE record (T-37-15).
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it("forwards the mutation's NOT_IN_TRASH rather than flattening it", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    mockPurge.mockResolvedValue({ success: false, error: "NOT_IN_TRASH" })

    expect(await purgeRecord("deals", "d1")).toEqual({ success: false, code: "NOT_IN_TRASH" })
  })

  it("maps any other purge failure to FAILED", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))
    mockPurge.mockResolvedValue({ success: false, error: "foreign key violation on activities" })

    const result = await purgeRecord("deals", "d1")

    expect(result).toEqual({ success: false, code: "FAILED" })
    expect(JSON.stringify(result)).not.toContain("foreign key")
  })

  it("narrows a hostile tab before it reaches the purge dispatch", async () => {
    mockAuth.mockResolvedValue(sessionFor(ADMIN, "admin"))

    await purgeRecord("people'; --" as unknown as "people", "d1")

    expect(mockPurge).toHaveBeenCalledWith("deal", "d1")
  })
})
