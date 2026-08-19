/**
 * DEDUP-01 / SC-1 — `createPerson` REPORTING CERTAIN MATCHES INSTEAD OF CREATING THE RECORD.
 *
 * The person twin of `src/app/organizations/actions.test.ts`; read that file's header for why every
 * assertion here is an ordering or an absence rather than a return value.
 *
 * ONE DIFFERENCE FROM THE ORGANIZATION FILE IS LOAD-BEARING. The person certain rule is decided by
 * the e-mail address alone, but `findCertainMatches` still needs `firstName` and `lastName` — they
 * build the draft's normalized name, which `classifyPersonMatch` consults. So the assertion on the
 * lookup's argument is not decoration: dropping either name field from the call would silently
 * reduce the person branch to an e-mail equality with no classifier agreement, and no result-shaped
 * test could see it.
 *
 * The second difference is the revalidation count. `createPerson` revalidates `/people` always and
 * the organization detail page as well when the draft names one, so the count assertions below are
 * written against a draft with NO organization and a second test covers the two-path case.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/audit/actor-context", () => ({
  runWithActor: vi.fn((_actor: unknown, fn: () => unknown) => fn()),
}))

vi.mock("@/lib/dedup/matching", () => ({ findCertainMatches: vi.fn() }))

vi.mock("@/lib/mutations/people", () => ({
  createPersonMutation: vi.fn(),
  updatePersonMutation: vi.fn(),
  deletePersonMutation: vi.fn(),
  personSchema: {},
  updatePersonSchema: {},
}))

vi.mock("@/db", () => ({
  db: { query: { people: { findFirst: vi.fn() }, users: { findFirst: vi.fn() } } },
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
import { createPersonMutation } from "@/lib/mutations/people"

import { createPerson } from "./actions"

const mockAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)
const mockRevalidatePath = vi.mocked(revalidatePath)
const mockRunWithActor = vi.mocked(runWithActor)
const mockFindCertainMatches = vi.mocked(findCertainMatches)
const mockCreateMutation = vi.mocked(createPersonMutation)

const USER = "u1"

/**
 * The mutation's real success member also carries the inserted ROW, which the action never reads —
 * it forwards `result.id` and nothing else. See the same note in
 * `src/app/organizations/actions.test.ts`.
 */
type CreateMutationResult = Awaited<ReturnType<typeof createPersonMutation>>

function created(id: string): CreateMutationResult {
  return { success: true, id } as unknown as CreateMutationResult
}

function session(userId: string | null): Session | null {
  if (userId === null) return null
  return { user: { id: userId }, expires: "2099-01-01T00:00:00.000Z" } as unknown as Session
}

const DRAFT = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+55 11 99999-0000",
  organizationId: "",
}

function match(id: string, name: string): CertainMatch {
  return { id, name, distinguishingValue: "ada@example.com", reason: "email" }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(session(USER))
  mockFindCertainMatches.mockResolvedValue([])
  mockCreateMutation.mockResolvedValue(created("person-new"))
})

describe("createPerson — the create-time certain-match gate", () => {
  it("Test 1 — with no matches it behaves exactly as before: creates, revalidates once, actor after auth", async () => {
    const result = await createPerson(DRAFT)

    expect(result).toEqual({ success: true, id: "person-new" })
    expect(mockCreateMutation).toHaveBeenCalledTimes(1)
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/people")

    expect(mockRunWithActor).toHaveBeenCalledTimes(1)
    expect(mockRunWithActor.mock.calls[0][0]).toEqual({ kind: "user", userId: USER })
  })

  it("Test 1b — the lookup is handed both name parts and the e-mail, as a person", async () => {
    await createPerson(DRAFT)

    expect(mockFindCertainMatches).toHaveBeenCalledTimes(1)
    // No `customFields`, deliberately: the person certain rule is decided by the e-mail address
    // alone, and the organization identity custom field has no person counterpart.
    expect(mockFindCertainMatches).toHaveBeenCalledWith({
      entityType: "person",
      firstName: DRAFT.firstName,
      lastName: DRAFT.lastName,
      email: DRAFT.email,
    })
  })

  it("Test 1c — a draft naming an organization still revalidates that record's page", async () => {
    await createPerson({ ...DRAFT, organizationId: "org-7" })

    expect(mockRevalidatePath).toHaveBeenCalledTimes(2)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/people")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/organizations/org-7")
  })

  it("Test 2 — with two certain matches it returns them and NEVER calls the mutation", async () => {
    const matches = [match("p-a", "Ada Lovelace"), match("p-b", "A. Lovelace")]
    mockFindCertainMatches.mockResolvedValue(matches)

    const result = await createPerson(DRAFT)

    expect(result).toEqual({ success: false, duplicates: matches })
    expect(mockCreateMutation).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("Test 3 — confirmDuplicate: true does NOT run the check, and creates the record", async () => {
    mockFindCertainMatches.mockResolvedValue([match("p-a", "Ada Lovelace")])

    const result = await createPerson(DRAFT, { confirmDuplicate: true })

    expect(mockFindCertainMatches).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, id: "person-new" })
    expect(mockCreateMutation).toHaveBeenCalledTimes(1)
  })

  it("Test 4 — an unauthenticated call looks nothing up and creates nothing", async () => {
    mockAuth.mockResolvedValue(session(null))

    const result = await createPerson(DRAFT)

    expect(result).toEqual({ success: false, error: "Not authenticated" })
    expect(mockFindCertainMatches).not.toHaveBeenCalled()
    expect(mockCreateMutation).not.toHaveBeenCalled()
    expect(mockRunWithActor).not.toHaveBeenCalled()
  })

  it("Test 5 — a rejecting lookup does not fail the create; it logs and falls through", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mockFindCertainMatches.mockRejectedValue(new Error("connection terminated"))

    const result = await createPerson(DRAFT)

    expect(result).toEqual({ success: true, id: "person-new" })
    expect(mockCreateMutation).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)

    warn.mockRestore()
  })

  it("Test 5b — a lookup that returns an empty array creates the record without warning", async () => {
    mockFindCertainMatches.mockResolvedValue([])

    const result = await createPerson(DRAFT)

    expect(result).toEqual({ success: true, id: "person-new" })
  })

  it("Test 6 — the three result members stay mutually distinguishable at the type level", () => {
    type Result = Awaited<ReturnType<typeof createPerson>>
    type Failure = Extract<Result, { success: false }>

    type ErrorMember = Exclude<Failure, { duplicates: unknown }>
    type DuplicatesMember = Exclude<Failure, { error: unknown }>

    const errorMemberExists: [ErrorMember] extends [never] ? never : true = true
    const duplicatesMemberExists: [DuplicatesMember] extends [never] ? never : true = true
    const errorMemberHasNoDuplicates: ErrorMember extends { duplicates: unknown } ? never : true =
      true
    const duplicatesMemberHasNoError: DuplicatesMember extends { error: unknown } ? never : true =
      true
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
    type Result = Awaited<ReturnType<typeof createPerson>>
    type DuplicatesMember = Exclude<Extract<Result, { success: false }>, { error: unknown }>

    const carriesCertainMatches: DuplicatesMember extends { duplicates: CertainMatch[] }
      ? true
      : never = true

    expect(carriesCertainMatches).toBe(true)
  })
})
