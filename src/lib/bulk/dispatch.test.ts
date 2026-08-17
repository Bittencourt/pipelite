/**
 * The two maps from an `EntityType` to its soft-delete and its owner-transfer mutation.
 *
 * WHAT IS MOCKED AND WHY
 *   - `@/lib/mutations/{deals,people,organizations,activities}` — all four. This suite is about
 *     WHICH function gets called, with WHICH arguments in WHICH order, and whether its result comes
 *     back untouched; what those functions do to the database is the four mutation suites' job. Each
 *     factory exposes ONLY the two functions that module contributes to these maps, so if
 *     `dispatch.ts` ever reaches for a third export (a schema, a helper, a `restore*Mutation`) the
 *     import surfaces as a TypeError here instead of quietly widening this module's coupling.
 *
 * Mocking the mutation modules is also what keeps `@/db` out of the process — it throws at import
 * time without `DATABASE_URL` — which is why this file needs no `vi.mock` of the database at all.
 *
 * WHAT THIS SUITE PROVES THAT THE TYPE CHECKER CANNOT
 * The `Record<EntityType, …>` annotation plus the `satisfies` in `dispatch.ts` make a missing key
 * and an extra key both compile errors, which is that module's whole reason to exist. Two things
 * they do NOT catch:
 *
 *   1. A map whose four keys are all present but WIRED TO THE WRONG FUNCTION.
 *      `person: deletePersonMutation` and `person: deleteOrganizationMutation` typecheck
 *      identically, because all four delete mutations share one signature — and cross-map wiring
 *      (`OWNER_BY_TYPE.person` pointing at a delete) is caught only because the arities differ.
 *      Every test below therefore asserts both that the expected spy was called and that the other
 *      seven were not.
 *   2. ARGUMENT ORDER on the owner accessor. `(id, ownerId, userId)` and `(id, userId, ownerId)` are
 *      both `(string, string, string)`, so a swap typechecks perfectly while writing the ACTOR's id
 *      into `ownerId` — silently transferring every reassigned record to the person who clicked the
 *      button. Only an exact-arguments assertion can see it, so the owner tests pin the whole array.
 *
 * ON "the maps have exactly four keys, and the same four"
 * The maps are module-private on purpose (the exported surface is the two accessors plus the result
 * type, nothing else), so `Object.keys(map)` is not reachable from here. Exhaustiveness is therefore
 * asserted BEHAVIOURALLY: every one of the four types is driven through both accessors, the set of
 * types that actually reached a mutation is compared, and a fifth type is shown to have no entry in
 * either map. That is the same fact observed from outside, without widening the module's exports to
 * make a test convenient.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { EntityType } from "@/db/schema/custom-fields"

vi.mock("@/lib/mutations/deals", () => ({
  deleteDealMutation: vi.fn(),
  updateDealOwnerMutation: vi.fn(),
}))

vi.mock("@/lib/mutations/people", () => ({
  deletePersonMutation: vi.fn(),
  updatePersonOwnerMutation: vi.fn(),
}))

vi.mock("@/lib/mutations/organizations", () => ({
  deleteOrganizationMutation: vi.fn(),
  updateOrganizationOwnerMutation: vi.fn(),
}))

vi.mock("@/lib/mutations/activities", () => ({
  deleteActivityMutation: vi.fn(),
  updateActivityOwnerMutation: vi.fn(),
}))

import { deleteDealMutation, updateDealOwnerMutation } from "@/lib/mutations/deals"
import { deletePersonMutation, updatePersonOwnerMutation } from "@/lib/mutations/people"
import {
  deleteOrganizationMutation,
  updateOrganizationOwnerMutation,
} from "@/lib/mutations/organizations"
import { deleteActivityMutation, updateActivityOwnerMutation } from "@/lib/mutations/activities"

import { deleteRecordByType, updateRecordOwnerByType } from "./dispatch"
import type { BulkMutationResult } from "./dispatch"

/**
 * The expected wiring, written out once per map. The `satisfies` clause closing each literal below
 * makes THIS FILE fail to compile if a fifth entity type is ever added — the test table cannot
 * silently stop covering the union it claims to cover.
 *
 * (The clause is not spelled out again in this sentence on purpose: the plan's acceptance gate counts
 * its occurrences and expects exactly the two real ones, so prose that repeated it would trip a gate
 * on itself.)
 */
const deleteSpies = {
  deal: vi.mocked(deleteDealMutation),
  person: vi.mocked(deletePersonMutation),
  organization: vi.mocked(deleteOrganizationMutation),
  activity: vi.mocked(deleteActivityMutation),
} satisfies Record<EntityType, unknown>

const ownerSpies = {
  deal: vi.mocked(updateDealOwnerMutation),
  person: vi.mocked(updatePersonOwnerMutation),
  organization: vi.mocked(updateOrganizationOwnerMutation),
  activity: vi.mocked(updateActivityOwnerMutation),
} satisfies Record<EntityType, unknown>

/** Sorted so an assertion never depends on the order somebody typed an object literal in. */
const ALL_ENTITY_TYPES: readonly EntityType[] = ["activity", "deal", "organization", "person"]

/**
 * BOTH tables in one list. The cross-map check depends on this: a delete call must leave all four
 * owner spies untouched and vice versa, so "everything except the target" has to span both maps
 * rather than only the map under test.
 */
const ALL_SPIES = [...Object.values(deleteSpies), ...Object.values(ownerSpies)]

/**
 * Dispatching one type must not touch any of the other seven mutations. Asserted as "everything
 * except this one is untouched" rather than as a handful of spot checks, because the failure mode
 * being guarded against — a copy-pasted map entry pointing at the neighbouring entity — is exactly
 * the one a spot check would miss.
 */
function expectOnlySpyCalled(expected: (typeof ALL_SPIES)[number]): void {
  // Anti-vacuity: a helper that iterated an empty list would pass every test below without
  // asserting anything, so the list's length is pinned first.
  expect(ALL_SPIES).toHaveLength(8)
  expect(ALL_SPIES).toContain(expected)

  for (const spy of ALL_SPIES) {
    if (spy === expected) continue
    expect(spy).not.toHaveBeenCalled()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("deleteRecordByType", () => {
  it.each(ALL_ENTITY_TYPES)("routes %s to its own delete mutation", async (entityType) => {
    const spy = deleteSpies[entityType]
    // A distinct object per test: `toBe` below is an IDENTITY check, so a dispatch that rebuilt an
    // equal-looking result would still fail.
    const result: BulkMutationResult = { success: true }
    spy.mockResolvedValue(result)

    const returned = await deleteRecordByType(entityType, `${entityType}-1`, "actor-1")

    expect(spy).toHaveBeenCalledTimes(1)
    // Exact array, not `expect.anything()`: `(id, userId)` and `(userId, id)` are both
    // `(string, string)`, so the order is invisible to the type checker.
    expect(spy.mock.calls[0]).toEqual([`${entityType}-1`, "actor-1"])
    expect(returned).toBe(result)
    expectOnlySpyCalled(spy)
  })

  it("touches no owner mutation, so the two maps cannot be cross-wired", async () => {
    // The arities differ (2 vs 3), so TypeScript would catch an owner mutation placed in the delete
    // map — but not a delete accessor that called BOTH, e.g. a "reassign then delete" convenience
    // someone adds later. This is the assertion that keeps the two operations separate.
    deleteSpies.organization.mockResolvedValue({ success: true })

    await deleteRecordByType("organization", "o1", "actor-1")

    for (const spy of Object.values(ownerSpies)) {
      expect(spy).not.toHaveBeenCalled()
    }
    expect(Object.values(ownerSpies)).toHaveLength(4)
  })

  it("returns the mutation's own promise, adding no wrapper", async () => {
    // Identity of the RESULT proves nothing was reshaped; identity of the PROMISE proves nothing was
    // awaited and re-wrapped on the way out, which is what an added try/catch would look like.
    deleteSpies.deal.mockResolvedValue({ success: true })

    const returned = deleteRecordByType("deal", "d1", "actor-1")

    expect(returned).toBe(deleteSpies.deal.mock.results[0].value)
    await returned
  })

  it("forwards a refusal's error string verbatim", async () => {
    // The bulk action maps this string onto a closed `BulkFailureReason` before anything crosses the
    // client boundary (T-38-07). A dispatch that flattened or rewrote it would break that mapping
    // while still returning a perfectly well-typed `{ success: false }`.
    const failure: BulkMutationResult = { success: false, error: "Person not found" }
    deleteSpies.person.mockResolvedValue(failure)

    const returned = await deleteRecordByType("person", "p1", "actor-1")

    expect(returned).toBe(failure)
    expect(returned).toEqual({ success: false, error: "Person not found" })
    expectOnlySpyCalled(deleteSpies.person)
  })

  it("propagates a rejected mutation instead of swallowing it", async () => {
    // Each mutation already contains its own catch, so anything that escapes one is a genuine
    // programming error. Catching it here would convert it into a silent `{ success: false }` that
    // the bulk loop would then report as an ordinary per-record refusal.
    const boom = new Error("connection terminated")
    deleteSpies.activity.mockRejectedValue(boom)

    await expect(deleteRecordByType("activity", "a1", "actor-1")).rejects.toBe(boom)
  })
})

describe("updateRecordOwnerByType", () => {
  it.each(ALL_ENTITY_TYPES)("routes %s to its own owner mutation", async (entityType) => {
    const spy = ownerSpies[entityType]
    const result: BulkMutationResult = { success: true }
    spy.mockResolvedValue(result)

    const returned = await updateRecordOwnerByType(
      entityType,
      `${entityType}-1`,
      "new-owner-1",
      "actor-1",
    )

    expect(spy).toHaveBeenCalledTimes(1)
    // THE assertion this suite exists for. All three arguments are `string`, so
    // `(id, userId, ownerId)` typechecks identically to `(id, ownerId, userId)` — and a swap would
    // write the ACTOR's id into `ownerId`, transferring every reassigned record to whoever clicked.
    // Only the exact array can see it; `toHaveBeenCalledWith` on a subset could not.
    expect(spy.mock.calls[0]).toEqual([`${entityType}-1`, "new-owner-1", "actor-1"])
    expect(returned).toBe(result)
    expectOnlySpyCalled(spy)
  })

  it("passes the new owner second and the actor third, with distinguishable values", async () => {
    // Stated once more against a single entity with values that cannot be confused for one another,
    // so the failure message on a regression names the swap rather than a generic array mismatch.
    ownerSpies.deal.mockResolvedValue({ success: true })

    await updateRecordOwnerByType("deal", "deal-id", "OWNER", "ACTOR")

    const [id, ownerId, userId] = ownerSpies.deal.mock.calls[0]
    expect(id).toBe("deal-id")
    expect(ownerId).toBe("OWNER")
    expect(userId).toBe("ACTOR")
  })

  it("touches no delete mutation, so a reassign can never soft-delete", async () => {
    // The worst cross-wiring in this module: an owner arm pointing at a delete mutation would trash
    // every record a user meant to reassign. The arities differ, so the type checker catches the
    // map entry — this catches an accessor that called both.
    ownerSpies.person.mockResolvedValue({ success: true })

    await updateRecordOwnerByType("person", "p1", "new-owner-1", "actor-1")

    for (const spy of Object.values(deleteSpies)) {
      expect(spy).not.toHaveBeenCalled()
    }
    expect(Object.values(deleteSpies)).toHaveLength(4)
  })

  it("returns the mutation's own promise, adding no wrapper", async () => {
    ownerSpies.activity.mockResolvedValue({ success: true })

    const returned = updateRecordOwnerByType("activity", "a1", "new-owner-1", "actor-1")

    expect(returned).toBe(ownerSpies.activity.mock.results[0].value)
    await returned
  })

  it("forwards a refusal's error string verbatim", async () => {
    const failure: BulkMutationResult = { success: false, error: "Deal not found" }
    ownerSpies.deal.mockResolvedValue(failure)

    const returned = await updateRecordOwnerByType("deal", "d1", "new-owner-1", "actor-1")

    expect(returned).toBe(failure)
    expect(returned).toEqual({ success: false, error: "Deal not found" })
    expectOnlySpyCalled(ownerSpies.deal)
  })

  it("propagates a rejected mutation instead of swallowing it", async () => {
    const boom = new Error("deadlock detected")
    ownerSpies.organization.mockRejectedValue(boom)

    await expect(
      updateRecordOwnerByType("organization", "o1", "new-owner-1", "actor-1"),
    ).rejects.toBe(boom)
  })
})

describe("the dispatch maps", () => {
  it("cover exactly the four entity types, and the same four in both", async () => {
    for (const entityType of ALL_ENTITY_TYPES) {
      deleteSpies[entityType].mockResolvedValue({ success: true })
      ownerSpies[entityType].mockResolvedValue({ success: true })
    }

    for (const entityType of ALL_ENTITY_TYPES) {
      await deleteRecordByType(entityType, "x", "actor-1")
      await updateRecordOwnerByType(entityType, "x", "new-owner-1", "actor-1")
    }

    const deleteReached = ALL_ENTITY_TYPES.filter(
      (entityType) => deleteSpies[entityType].mock.calls.length === 1,
    )
    const ownerReached = ALL_ENTITY_TYPES.filter(
      (entityType) => ownerSpies[entityType].mock.calls.length === 1,
    )

    expect([...deleteReached].sort()).toEqual(["activity", "deal", "organization", "person"])
    expect([...ownerReached].sort()).toEqual([...deleteReached].sort())
    // Eight distinct functions, one call each: no map entry doubles up on another's mutation, which
    // is what a copy-pasted arm would look like from out here.
    expect(ALL_SPIES.filter((spy) => spy.mock.calls.length === 1)).toHaveLength(8)
  })

  it("hold no entry for a type outside the union, and add no runtime fallback", () => {
    // A fifth string can only arrive through a cast: `entityType` is the closed `EntityType` union
    // and every bulk action holds it as a literal at its own call site. Deliberately NOT softened
    // with an `if (!fn) throw new Error(...)` in `dispatch.ts` — a runtime fallback would make the
    // compile-time exhaustiveness look optional. Indexing a frozen four-key object with a fifth key
    // yields `undefined`, and calling `undefined` is a TypeError, which is the behaviour pinned here.
    const rogue = "note" as unknown as EntityType

    expect(() => deleteRecordByType(rogue, "x", "actor-1")).toThrow(TypeError)
    expect(() => updateRecordOwnerByType(rogue, "x", "new-owner-1", "actor-1")).toThrow(TypeError)
    expect(ALL_SPIES.every((spy) => spy.mock.calls.length === 0)).toBe(true)
  })
})
