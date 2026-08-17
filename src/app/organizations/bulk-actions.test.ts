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

import {
  callArguments,
  readStrippedSource,
} from "@/components/custom-fields/__tests__/source-scan"

import { auth } from "@/auth"
import { db } from "@/db"
import { revalidatePath } from "next/cache"
import { runWithActor } from "@/lib/audit/actor-context"
import { deleteRecordByType, updateRecordOwnerByType } from "@/lib/bulk/dispatch"
import { BULK_MAX_IDS } from "@/lib/bulk/limits"
import { fetchFilteredData } from "@/lib/export/formatters"

import {
  bulkDeleteOrganizations,
  bulkReassignOrganizationOwner,
  exportSelectedOrganizations,
} from "./actions"

const mockAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockRunWithActor = vi.mocked(runWithActor)
const mockDeleteRecord = vi.mocked(deleteRecordByType)
const mockUpdateOwner = vi.mocked(updateRecordOwnerByType)
const mockOrgFindFirst = vi.mocked(db.query.organizations.findFirst)
const mockUserFindFirst = vi.mocked(db.query.users.findFirst)
const mockFetchFilteredData = vi.mocked(fetchFilteredData)

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
  mockFetchFilteredData.mockReset()

  mockRunWithActor.mockImplementation((_actor, fn) => fn())
  mockAuth.mockResolvedValue(sessionFor(OWNER))
  mockOrgFindFirst.mockResolvedValue(org("o1", OWNER) as never)
  mockUserFindFirst.mockResolvedValue(APPROVED_TARGET as never)
  mockDeleteRecord.mockResolvedValue({ success: true })
  mockUpdateOwner.mockResolvedValue({ success: true })
  mockFetchFilteredData.mockResolvedValue({
    success: true,
    data: "id,name\r\no1,Org o1\r\n",
    filename: "organizations-2026-08-17.csv",
    count: 7,
  })
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
    // NINE successes, not one: a revalidation moved inside the loop would be invisible to a
    // single-success batch, so the count assertion is only load-bearing above one.
    const ids = mixedIds(12)
    queueRows(ids.map((id, index) => org(id, index < 9 ? OWNER : OTHER)))

    await bulkDeleteOrganizations(ids)
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

describe("exportSelectedOrganizations", () => {
  it("refuses an unauthenticated caller without fetching anything", async () => {
    mockAuth.mockResolvedValue(null)

    const result = await exportSelectedOrganizations(["o1"])

    expect(result.success).toBe(false)
    expect(mockFetchFilteredData).not.toHaveBeenCalled()
  })

  it("refuses an empty selection rather than fetching the whole table", async () => {
    const result = await exportSelectedOrganizations([])

    expect(result.success).toBe(false)
    expect(mockFetchFilteredData).not.toHaveBeenCalled()
  })

  it("refuses more ids than the cap without fetching", async () => {
    const ids = Array.from({ length: BULK_MAX_IDS + 1 }, (_, index) => `o${index + 1}`)

    const result = await exportSelectedOrganizations(ids)

    expect(result.success).toBe(false)
    expect(mockFetchFilteredData).not.toHaveBeenCalled()
  })

  it("builds every export option server-side, taking only the ids from the caller", async () => {
    await exportSelectedOrganizations(["o1", "o2", "o2"])

    expect(mockFetchFilteredData).toHaveBeenCalledTimes(1)
    expect(mockFetchFilteredData.mock.calls[0][0]).toEqual({
      entityType: "organization",
      format: "csv",
      includeCustomFields: true,
      filters: { ids: ["o1", "o2"] },
    })
  })

  it("names the file from the fetch result's own count, never from the input length", async () => {
    // The mocked count (7) differs from the three ids submitted on purpose: a filename built from the
    // input length would silently disagree with the rows actually in the file.
    const result = await exportSelectedOrganizations(["o1", "o2", "o3"])

    expect(result.success).toBe(true)
    if (!result.success) throw new Error("expected the export to succeed")
    expect(result.filename).toMatch(/^organizations-selected-\d+-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(result.filename).toContain("-selected-7-")
    expect(result.count).toBe(7)
    expect(result.data).toBe("id,name\r\no1,Org o1\r\n")
  })

  it("passes a fetch failure through unchanged", async () => {
    mockFetchFilteredData.mockResolvedValue({ success: false, error: "Export failed. Please try again." })

    expect(await exportSelectedOrganizations(["o1"])).toEqual({
      success: false,
      error: "Export failed. Please try again.",
    })
  })
})

/**
 * THE SOURCE GATE — COMMENT-BLIND, AND THAT IS THE WHOLE POINT.
 *
 * Every assertion below goes through `readStrippedSource`, never through a raw file read. Phase 37
 * shipped NINE separate collisions in which a gate matched its own explanatory prose — a header
 * sentence naming the very token the gate banned, satisfying or breaking it without a line of code
 * changing. A gate that can be satisfied by a comment is self-invalidating. The rule that came out of
 * it: when a gate trips on a comment, REWORD THE COMMENT, never weaken the gate. Reading through the
 * shared stripper is what removes the failure mode instead of dodging it.
 *
 * This very header was rewritten once for exactly that reason: it named the unstripped read helper in
 * prose, and the plan's acceptance gate counts occurrences of that name in this file and expects none.
 * The comment moved; the gate did not.
 *
 * POSITIVE MARKERS COME FIRST IN EVERY BLOCK. A gate made only of absences passes triumphantly when
 * handed an empty string — which is exactly what a slicing helper returns when its anchor moves. So
 * each slice is proved to be the real declaration (its own name, a body of real length, the call it is
 * built around) BEFORE anything is asserted absent from it.
 */

/**
 * The text of one top-level declaration, from its `export async function <name>` to the next top-level
 * `export `.
 *
 * WR-13: the anchor index is asserted `> -1` with a named message BEFORE it is used. `indexOf(x, -1)`
 * silently behaves as `indexOf(x, 0)`, so a helper handed a missing anchor does not throw — it widens
 * to the enclosing block, and every absence assertion downstream stops detecting anything.
 */
function declarationSlice(source: string, name: string): string {
  const anchor = `export async function ${name}`
  const start = source.indexOf(anchor)
  expect(start, `declaration anchor not found in actions.ts: ${anchor}`).toBeGreaterThan(-1)

  const end = source.indexOf("\nexport ", start + anchor.length)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

/** Index just past the closing paren of the first `${callee}(` call, matched string-aware. */
function callCloseIndex(slice: string, callee: string): number {
  const marker = `${callee}(`
  const at = slice.indexOf(marker)
  expect(at, `call not found in slice: ${marker}`).toBeGreaterThan(-1)

  let i = at + marker.length
  let depth = 1
  let quote: string | null = null

  while (i < slice.length && depth > 0) {
    const ch = slice[i]

    if (quote) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "(") depth += 1
    else if (ch === ")") depth -= 1

    i += 1
  }

  expect(depth, `unterminated ${marker} call in slice`).toBe(0)
  return i
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const ACTIONS_PATH = "src/app/organizations/actions.ts"

describe("source gate on the organizations bulk actions", () => {
  const stripped = readStrippedSource(ACTIONS_PATH)
  const deleteSlice = declarationSlice(stripped, "bulkDeleteOrganizations")
  const reassignSlice = declarationSlice(stripped, "bulkReassignOrganizationOwner")
  const exportSlice = declarationSlice(stripped, "exportSelectedOrganizations")
  const writeSlices: Array<[string, string]> = [
    ["bulkDeleteOrganizations", deleteSlice],
    ["bulkReassignOrganizationOwner", reassignSlice],
  ]

  it("sliced three real declarations, not empty strings", () => {
    expect(deleteSlice).toContain("bulkDeleteOrganizations")
    expect(reassignSlice).toContain("bulkReassignOrganizationOwner")
    expect(exportSlice).toContain("exportSelectedOrganizations")

    expect(deleteSlice.length).toBeGreaterThan(400)
    expect(reassignSlice.length).toBeGreaterThan(400)
    expect(exportSlice.length).toBeGreaterThan(200)

    expect(deleteSlice).toContain("deleteRecordByType")
    expect(reassignSlice).toContain("updateRecordOwnerByType")
    expect(exportSlice).toContain("fetchFilteredData")

    // The gate below is over-cap on the delete slice unless the two write slices are DISTINCT.
    expect(deleteSlice).not.toContain("updateRecordOwnerByType")
    expect(reassignSlice).not.toContain("deleteRecordByType")
  })

  it("gives the scoped export exactly one ids parameter and no options object", () => {
    const parameterLists = callArguments(stripped, "exportSelectedOrganizations")

    expect(parameterLists).toHaveLength(1)
    expect(parameterLists[0].replace(/\s+/g, " ").trim()).toBe("ids: string[]")
  })

  it("keeps the admin-gated full-export vocabulary out of the scoped export (T-38-01)", () => {
    for (const banned of [
      "ExportFilters",
      "ExportOptions",
      "ExportFormat",
      "pipedrive",
      "getExportData",
      "role",
    ]) {
      expect(exportSlice, `scoped export must not mention ${banned}`).not.toContain(banned)
    }
  })

  it("keeps the two write loops sequential, best effort, and free of an admin bypass", () => {
    for (const [name, slice] of writeSlices) {
      expect(slice).toContain("runWithActor")

      for (const banned of [
        "Promise.all",
        "db.transaction",
        "session.user.role",
        "updateOrganizationMutation",
        "auditLog",
        "sendDeal",
      ]) {
        expect(slice, `${name} must not mention ${banned}`).not.toContain(banned)
      }
    }
  })

  it("opens exactly one actor scope and revalidates exactly once per write action", () => {
    for (const [name, slice] of writeSlices) {
      expect(occurrences(slice, "runWithActor"), `${name} actor scopes`).toBe(1)
      expect(occurrences(slice, "revalidatePath"), `${name} revalidations`).toBe(1)
    }
  })

  it("places the revalidation after the actor scope closes, never inside the loop", () => {
    for (const [name, slice] of writeSlices) {
      const scopeClosedAt = callCloseIndex(slice, "runWithActor")
      const revalidatedAt = slice.indexOf("revalidatePath")

      expect(revalidatedAt, `${name} revalidation position`).toBeGreaterThan(scopeClosedAt)
    }
  })

  it("validates the reassign target against both predicates before any actor scope opens (T-38-06)", () => {
    expect(reassignSlice).toContain('eq(users.status, "approved")')
    expect(reassignSlice).toContain("isNull(users.deletedAt)")

    const targetReadAt = reassignSlice.indexOf("db.query.users.findFirst")
    expect(targetReadAt, "reassign target read").toBeGreaterThan(-1)
    expect(reassignSlice.indexOf("runWithActor")).toBeGreaterThan(targetReadAt)
  })

  it("keeps both write signatures to the documented shape", () => {
    expect(
      callArguments(stripped, "bulkDeleteOrganizations")[0].replace(/\s+/g, " ").trim()
    ).toBe("ids: string[]")
    expect(
      callArguments(stripped, "bulkReassignOrganizationOwner")[0].replace(/\s+/g, " ").trim()
    ).toBe("ids: string[], ownerId: string")
  })
})
