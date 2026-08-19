/**
 * DEDUP-01 / SC-1 — `createOrganization` REPORTING CERTAIN MATCHES INSTEAD OF CREATING THE RECORD.
 *
 * The create-time duplicate warning is locked to fire **server-side on submit, before the insert
 * commits** (39-UI-SPEC Surface 1). That decision is what this file exists to hold in place, and
 * every assertion below is about an ORDERING or an ABSENCE rather than about a return value:
 *
 *   1. The record is NOT created when certain matches come back. A return value alone cannot tell
 *      "warned instead of creating" from "created and then warned", so the mutation mock being
 *      un-called is the assertion that matters.
 *   2. The check runs AFTER the session guard. An unauthenticated call must perform no lookup at
 *      all — a duplicate check reachable without a session is a read oracle (T-39-05 keeps the
 *      lookup at the same visibility as the list pages, which is only sound for a caller who has
 *      already passed `auth()`).
 *   3. A CONFIRMED second submit does not check again. If it did, the warning would re-appear and
 *      the user could never get past it — "advisory, never blocking" would be a lie (W-4).
 *   4. A FAILING check never fails the create (T-39-36). A duplicate check must not be the reason a
 *      record cannot be saved.
 *
 * SCAFFOLD NOTE — the mock set is `src/app/organizations/bulk-actions.test.ts:33-58`: `@/auth` is a
 * bare `vi.fn()` so each test drives its own session, `next/cache` is a call-count target, and
 * `@/lib/audit/actor-context` records its actor while still invoking the callback so the T-36-02
 * ordering stays assertable. `@/lib/dedup/matching` is added to that set as the subject.
 *
 * The mutation layer is mocked whole: `createOrganizationMutation`'s own behaviour is plan 33's
 * suite, and what is interesting here is only whether it ran.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/audit/actor-context", () => ({
  runWithActor: vi.fn((_actor: unknown, fn: () => unknown) => fn()),
}))

vi.mock("@/lib/dedup/matching", () => ({ findCertainMatches: vi.fn() }))

vi.mock("@/lib/mutations/organizations", () => ({
  createOrganizationMutation: vi.fn(),
  updateOrganizationMutation: vi.fn(),
  deleteOrganizationMutation: vi.fn(),
  organizationSchema: {},
  updateOrganizationSchema: {},
}))

vi.mock("@/db", () => ({
  db: { query: { organizations: { findFirst: vi.fn() }, users: { findFirst: vi.fn() } } },
}))

vi.mock("@/lib/bulk/dispatch", () => ({
  deleteRecordByType: vi.fn(),
  updateRecordOwnerByType: vi.fn(),
}))

vi.mock("@/lib/export/formatters", () => ({ fetchFilteredData: vi.fn() }))

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { runWithActor } from "@/lib/audit/actor-context"
import { findCertainMatches } from "@/lib/dedup/matching"
import type { CertainMatch } from "@/lib/dedup/matching"
import { createOrganizationMutation } from "@/lib/mutations/organizations"

import { createOrganization } from "./actions"

const mockAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockRunWithActor = vi.mocked(runWithActor)
const mockFindCertainMatches = vi.mocked(findCertainMatches)
const mockCreateMutation = vi.mocked(createOrganizationMutation)

const USER = "u1"

/**
 * The mutation's real success member also carries the inserted ROW, which the action never reads —
 * it forwards `result.id` and nothing else. Building a full `organizations` row here would add a
 * dozen fields that no assertion in this file touches, so the fixture is narrowed once, here, with
 * the reason written down rather than repeated at every `mockResolvedValue`.
 */
type CreateMutationResult = Awaited<ReturnType<typeof createOrganizationMutation>>

function created(id: string): CreateMutationResult {
  return { success: true, id } as unknown as CreateMutationResult
}

function session(userId: string | null): Session | null {
  if (userId === null) return null
  return { user: { id: userId }, expires: "2099-01-01T00:00:00.000Z" } as unknown as Session
}

const DRAFT = {
  name: "Acme Holdings",
  website: "https://acme.example",
  industry: "Technology",
  customFields: { "Tax ID": "11.222.333/0001-44" },
}

function match(id: string, name: string): CertainMatch {
  return { id, name, distinguishingValue: "11.222.333/0001-44", reason: "nameIdentity" }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(session(USER))
  mockFindCertainMatches.mockResolvedValue([])
  mockCreateMutation.mockResolvedValue(created("org-new"))
})

describe("createOrganization — the create-time certain-match gate", () => {
  it("Test 1 — with no matches it behaves exactly as before: creates, revalidates once, actor after auth", async () => {
    const result = await createOrganization(DRAFT)

    expect(result).toEqual({ success: true, id: "org-new" })
    expect(mockCreateMutation).toHaveBeenCalledTimes(1)
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/organizations")

    // The actor scope is opened, once, with the SESSION's id and nothing else (T-36-02).
    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: USER })
  })

  it("Test 1b — the lookup is handed the draft it was given, as an organization", async () => {
    await createOrganization(DRAFT)

    expect(mockFindCertainMatches).toHaveBeenCalledTimes(1)
    expect(mockFindCertainMatches).toHaveBeenCalledWith({
      entityType: "organization",
      name: DRAFT.name,
      customFields: DRAFT.customFields,
    })
  })

  it("Test 2 — with two certain matches it returns them and NEVER calls the mutation", async () => {
    const matches = [match("org-a", "Acme Holdings Ltd"), match("org-b", "ACME  HOLDINGS")]
    mockFindCertainMatches.mockResolvedValue(matches)

    const result = await createOrganization(DRAFT)

    expect(result).toEqual({ success: false, duplicates: matches })

    // THE ASSERTION THAT MATTERS: nothing was created. A warning returned after the insert would
    // satisfy the return-value check above and still have written the duplicate row.
    expect(mockCreateMutation).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("Test 3 — confirmDuplicate: true does NOT run the check, and creates the record", async () => {
    mockFindCertainMatches.mockResolvedValue([match("org-a", "Acme Holdings Ltd")])

    const result = await createOrganization(DRAFT, { confirmDuplicate: true })

    // A second check would re-produce the warning and the user could never get past it (W-4).
    expect(mockFindCertainMatches).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, id: "org-new" })
    expect(mockCreateMutation).toHaveBeenCalledTimes(1)
  })

  it("Test 4 — an unauthenticated call looks nothing up and creates nothing", async () => {
    mockAuth.mockResolvedValue(session(null))

    const result = await createOrganization(DRAFT)

    expect(result).toEqual({ success: false, error: "Not authenticated" })

    // The check sits AFTER the session guard, never before it.
    expect(mockFindCertainMatches).not.toHaveBeenCalled()
    expect(mockCreateMutation).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
  })

  it("Test 5 — a rejecting lookup does not fail the create; it logs and falls through", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mockFindCertainMatches.mockRejectedValue(new Error("connection terminated"))

    const result = await createOrganization(DRAFT)

    expect(result).toEqual({ success: true, id: "org-new" })
    expect(mockCreateMutation).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)

    warn.mockRestore()
  })

  it("Test 5b — a lookup that returns an empty array creates the record without warning", async () => {
    mockFindCertainMatches.mockResolvedValue([])

    const result = await createOrganization(DRAFT)

    expect(result).toEqual({ success: true, id: "org-new" })
  })

  it("Test 6 — the three result members stay mutually distinguishable at the type level", () => {
    type Result = Awaited<ReturnType<typeof createOrganization>>
    type Failure = Extract<Result, { success: false }>

    /**
     * The two failure members, each isolated by the field the OTHER one carries.
     *
     * If the union is ever collapsed into one optional-field member — the tempting
     * `{ success: false; error?: string; duplicates?: CertainMatch[] }` — both `Exclude`s below
     * evaluate to `never`, both `[T] extends [never]` branches pick `never`, and the two
     * assignments stop compiling. A consumer narrowing on `success === false` must still be forced
     * to distinguish "it failed" from "it might be a duplicate": those two need opposite UI.
     */
    type ErrorMember = Exclude<Failure, { duplicates: unknown }>
    type DuplicatesMember = Exclude<Failure, { error: unknown }>

    const errorMemberExists: [ErrorMember] extends [never] ? never : true = true
    const duplicatesMemberExists: [DuplicatesMember] extends [never] ? never : true = true

    // Neither member may carry the other's field.
    const errorMemberHasNoDuplicates: ErrorMember extends { duplicates: unknown } ? never : true =
      true
    const duplicatesMemberHasNoError: DuplicatesMember extends { error: unknown } ? never : true =
      true

    // And the success member still carries the id the dialogs read.
    const successCarriesId: Extract<Result, { success: true }> extends { id: string }
      ? true
      : never = true

    expect([
      errorMemberExists,
      duplicatesMemberExists,
      errorMemberHasNoDuplicates,
      duplicatesMemberHasNoError,
      successCarriesId,
    ]).toEqual([true, true, true, true, true])
  })

  it("Test 6b — the duplicates member carries CertainMatch rows, not a bare string", () => {
    type Result = Awaited<ReturnType<typeof createOrganization>>
    type DuplicatesMember = Exclude<Extract<Result, { success: false }>, { error: unknown }>

    const carriesCertainMatches: DuplicatesMember extends { duplicates: CertainMatch[] }
      ? true
      : never = true

    expect(carriesCertainMatches).toBe(true)
  })
})
