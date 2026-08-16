/**
 * The one map from an `EntityType` to its restore and purge mutation.
 *
 * WHAT IS MOCKED AND WHY
 *   - `@/lib/mutations/{deals,people,organizations,activities}` — all four. This suite is about
 *     WHICH function gets called and whether its result comes back untouched; what those functions
 *     do to the database is plans 37-04 and 37-05's suites. Each factory exposes ONLY the two
 *     functions that module contributes to the dispatch, so if `dispatch.ts` ever reaches for a
 *     third export (a `deleteDealMutation`, a schema, a helper) the import surfaces as a TypeError
 *     here instead of quietly widening this module's coupling.
 *
 * Mocking the mutation modules also keeps `@/db` out of the process: it throws at import time
 * without `DATABASE_URL`, and nothing here should touch Postgres.
 *
 * WHAT THIS SUITE PROVES THAT THE TYPE CHECKER CANNOT
 * The `Record<EntityType, …>` annotation in `dispatch.ts` makes a missing key and an extra key both
 * compile errors, which is the module's whole reason to exist. What it does NOT catch is a map
 * whose four keys are all present but WIRED TO THE WRONG FUNCTION — `person: restorePersonMutation`
 * and `person: restoreOrganizationMutation` typecheck identically, because all eight mutations share
 * one signature. Every test below therefore asserts both that the expected spy was called and that
 * the other seven were not.
 *
 * ON "the maps have exactly four keys, and the same four"
 * The plan asks for `Object.keys(map).sort()`, but the same plan requires the maps to be
 * module-private (the exported surface is the two functions plus the two result types, nothing
 * else). The two instructions cannot both be followed literally, so the key sets are asserted
 * BEHAVIOURALLY instead — every one of the four types is driven through both functions and the set
 * of types that actually reached a mutation is compared, and a fifth type is shown to have no entry
 * in either map. That is the same fact, observed from outside, without widening the module's
 * exports to make a test convenient.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { EntityType } from "@/db/schema/custom-fields"

vi.mock("@/lib/mutations/deals", () => ({
  restoreDealMutation: vi.fn(),
  purgeDealMutation: vi.fn(),
}))

vi.mock("@/lib/mutations/people", () => ({
  restorePersonMutation: vi.fn(),
  purgePersonMutation: vi.fn(),
}))

vi.mock("@/lib/mutations/organizations", () => ({
  restoreOrganizationMutation: vi.fn(),
  purgeOrganizationMutation: vi.fn(),
}))

vi.mock("@/lib/mutations/activities", () => ({
  restoreActivityMutation: vi.fn(),
  purgeActivityMutation: vi.fn(),
}))

import { purgeDealMutation, restoreDealMutation } from "@/lib/mutations/deals"
import { purgePersonMutation, restorePersonMutation } from "@/lib/mutations/people"
import {
  purgeOrganizationMutation,
  restoreOrganizationMutation,
} from "@/lib/mutations/organizations"
import { purgeActivityMutation, restoreActivityMutation } from "@/lib/mutations/activities"

import { purgeRecordByType, restoreRecordByType } from "./dispatch"
import type { PurgeResult, RestoreResult } from "./dispatch"

/**
 * The expected wiring, written out once. `satisfies Record<EntityType, unknown>` makes THIS FILE
 * fail to compile if a fifth entity type is ever added — the test table cannot silently stop
 * covering the union it claims to cover.
 */
const restoreSpies = {
  deal: vi.mocked(restoreDealMutation),
  person: vi.mocked(restorePersonMutation),
  organization: vi.mocked(restoreOrganizationMutation),
  activity: vi.mocked(restoreActivityMutation),
} satisfies Record<EntityType, unknown>

const purgeSpies = {
  deal: vi.mocked(purgeDealMutation),
  person: vi.mocked(purgePersonMutation),
  organization: vi.mocked(purgeOrganizationMutation),
  activity: vi.mocked(purgeActivityMutation),
} satisfies Record<EntityType, unknown>

/** Sorted so an assertion never depends on the order somebody typed an object literal in. */
const ALL_ENTITY_TYPES: readonly EntityType[] = ["activity", "deal", "organization", "person"]

const ALL_SPIES = [...Object.values(restoreSpies), ...Object.values(purgeSpies)]

/**
 * Dispatching one type must not touch any of the other seven mutations. Asserted as "everything
 * except this one is untouched" rather than as a handful of spot checks, because the failure mode
 * being guarded against — a copy-pasted map entry pointing at the neighbouring entity — is exactly
 * the one a spot check would miss.
 */
function expectOnlySpyCalled(expected: (typeof ALL_SPIES)[number]): void {
  for (const spy of ALL_SPIES) {
    if (spy === expected) continue
    expect(spy).not.toHaveBeenCalled()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("restoreRecordByType", () => {
  it.each(ALL_ENTITY_TYPES)("routes %s to its own restore mutation", async (entityType) => {
    const spy = restoreSpies[entityType]
    // A distinct object per test: `toBe` below is an IDENTITY check, so a dispatch that rebuilt
    // an equal-looking result would still fail.
    const result: RestoreResult = { success: true }
    spy.mockResolvedValue(result)

    const returned = await restoreRecordByType(entityType, `${entityType}-1`)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(`${entityType}-1`)
    expect(returned).toBe(result)
    expectOnlySpyCalled(spy)
  })

  it("returns the mutation's own promise, adding no wrapper", async () => {
    // Identity of the RESULT proves nothing was reshaped; identity of the PROMISE proves nothing
    // was awaited and re-wrapped on the way out, which is what an added try/catch would look like.
    restoreSpies.deal.mockResolvedValue({ success: true })

    const returned = restoreRecordByType("deal", "d1")

    expect(returned).toBe(restoreSpies.deal.mock.results[0].value)
    await returned
  })

  it("forwards a NOT_IN_TRASH failure verbatim", async () => {
    // The client switches on this code rather than string-matching prose (37-PATTERNS § Result
    // shape). A dispatch that flattened it into a generic failure would break that switch while
    // still returning a perfectly well-typed `{ success: false }`.
    const failure: RestoreResult = { success: false, error: "NOT_IN_TRASH" }
    restoreSpies.person.mockResolvedValue(failure)

    const returned = await restoreRecordByType("person", "p1")

    expect(returned).toBe(failure)
    expect(returned).toEqual({ success: false, error: "NOT_IN_TRASH" })
    expectOnlySpyCalled(restoreSpies.person)
  })

  it("propagates a rejected mutation instead of swallowing it", async () => {
    // Each mutation already contains its own catch, so anything that escapes one is a genuine
    // programming error. Catching it here would convert it into a silent `{ success: false }`.
    const boom = new Error("connection terminated")
    restoreSpies.activity.mockRejectedValue(boom)

    await expect(restoreRecordByType("activity", "a1")).rejects.toBe(boom)
  })
})

describe("purgeRecordByType", () => {
  it.each(ALL_ENTITY_TYPES)("routes %s to its own purge mutation", async (entityType) => {
    const spy = purgeSpies[entityType]
    const result: PurgeResult = { success: true, detached: 0 }
    spy.mockResolvedValue(result)

    const returned = await purgeRecordByType(entityType, `${entityType}-1`)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(`${entityType}-1`)
    expect(returned).toBe(result)
    expectOnlySpyCalled(spy)
  })

  it("forwards the detached count unchanged", async () => {
    // An organization purge detaches two child tables and returns their sum; the UI reports that
    // number to the admin. A dispatch that defaulted or recomputed it would under-report unlinks.
    const result: PurgeResult = { success: true, detached: 7 }
    purgeSpies.organization.mockResolvedValue(result)

    const returned = await purgeRecordByType("organization", "o1")

    expect(returned).toBe(result)
    expect(returned).toEqual({ success: true, detached: 7 })
  })

  it("forwards a NOT_IN_TRASH failure verbatim", async () => {
    const failure: PurgeResult = { success: false, error: "NOT_IN_TRASH" }
    purgeSpies.deal.mockResolvedValue(failure)

    const returned = await purgeRecordByType("deal", "d1")

    expect(returned).toBe(failure)
    expect(returned).toEqual({ success: false, error: "NOT_IN_TRASH" })
    expectOnlySpyCalled(purgeSpies.deal)
  })

  it("propagates a rejected mutation instead of swallowing it", async () => {
    const boom = new Error("deadlock detected")
    purgeSpies.person.mockRejectedValue(boom)

    await expect(purgeRecordByType("person", "p1")).rejects.toBe(boom)
  })
})

describe("the dispatch maps", () => {
  it("cover exactly the four entity types, and the same four in both", async () => {
    for (const entityType of ALL_ENTITY_TYPES) {
      restoreSpies[entityType].mockResolvedValue({ success: true })
      purgeSpies[entityType].mockResolvedValue({ success: true, detached: 0 })
    }

    for (const entityType of ALL_ENTITY_TYPES) {
      await restoreRecordByType(entityType, "x")
      await purgeRecordByType(entityType, "x")
    }

    const restoreReached = ALL_ENTITY_TYPES.filter(
      (entityType) => restoreSpies[entityType].mock.calls.length === 1,
    )
    const purgeReached = ALL_ENTITY_TYPES.filter(
      (entityType) => purgeSpies[entityType].mock.calls.length === 1,
    )

    expect([...restoreReached].sort()).toEqual(["activity", "deal", "organization", "person"])
    expect([...purgeReached].sort()).toEqual([...restoreReached].sort())
    // Eight distinct functions, one call each: no map entry doubles up on another's mutation.
    expect(ALL_SPIES.filter((spy) => spy.mock.calls.length === 1)).toHaveLength(8)
  })

  it("hold no entry for a type outside the union, and add no runtime fallback", () => {
    // `entityType` is the closed `EntityType` union and every untrusted caller narrows through
    // `parseTrashTab` or `isTrashEntityType` first, so a fifth string can only arrive here through
    // a cast. Deliberately NOT softened with an `if (!fn) throw new Error(...)`: a runtime fallback
    // would make the compile-time exhaustiveness look optional, and a caller that reached this
    // point has already bypassed the narrowing that is the real control (T-37-03).
    const rogue = "workflow" as unknown as EntityType

    expect(() => restoreRecordByType(rogue, "x")).toThrow(TypeError)
    expect(() => purgeRecordByType(rogue, "x")).toThrow(TypeError)
    expect(ALL_SPIES.every((spy) => spy.mock.calls.length === 0)).toBe(true)
  })
})
