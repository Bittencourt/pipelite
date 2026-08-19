/**
 * DEDUP-01 — the two `app_settings` keys phase 39 owns.
 *
 * These cases pin down a FAILURE DIRECTION and an ASYMMETRY, not merely a parse.
 *
 *   - `readOrgIdentityFields` failing to `null` means organizations have NO certain tier and NO
 *     create-time warning. Every `null` case below is asserting exactly that, because the only
 *     other option — treating an equal name alone as certain — was measured at 1,030,436 pairs
 *     (39-RESEARCH B1). An unset key, a tampered row, an over-long array and a database outage
 *     must all land on that same safe side.
 *   - `readSimilarityThreshold` failing to `DEFAULT_SIMILARITY_THRESHOLD` is the OPPOSITE
 *     direction, and that is deliberate: a threshold has a measured safe default, an identity
 *     field name does not. The two functions live in one file so the asymmetry is visible; these
 *     tests exist so it cannot be "tidied up" into consistency.
 *
 * NO DEPLOYMENT-SPECIFIC FIELD LABEL APPEARS IN THIS FILE. The live install configures Portuguese
 * labels created by a Pipedrive import; naming them even in a fixture invites the next reader to
 * treat them as the product's field names. `Tax ID` / `Contact Email` are stand-ins, and the
 * ordering contract they prove is label-agnostic by construction.
 *
 * `@/db` is mocked down to the minimum surface this module is allowed to touch — one `findFirst`
 * and one `insert`. A query the implementation grows later surfaces as a TypeError rather than
 * being silently absorbed by a permissive mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/db", () => ({
  db: {
    query: { appSettings: { findFirst: vi.fn() } },
    insert: vi.fn(),
  },
}))

import { db } from "@/db"
import { appSettings } from "@/db/schema/app-settings"
import { DEFAULT_SIMILARITY_THRESHOLD } from "./constants"
import {
  ORG_IDENTITY_FIELDS_KEY,
  ORG_IDENTITY_FIELDS_MAX,
  DEDUP_SIMILARITY_KEY,
  SIMILARITY_MIN,
  SIMILARITY_MAX,
  readOrgIdentityFields,
  writeOrgIdentityFields,
  readSimilarityThreshold,
} from "./identity-settings"

const mockDb = db as unknown as {
  query: { appSettings: { findFirst: ReturnType<typeof vi.fn> } }
  insert: ReturnType<typeof vi.fn>
}

/** Two deployment-neutral stand-in labels. The contract under test is order, not identity. */
const FIELD_A = "Tax ID"
const FIELD_B = "Contact Email"

/** What the upsert chain was called with, so a round trip can replay the value actually stored. */
interface CapturedUpsert {
  values: Record<string, unknown> | undefined
  set: Record<string, unknown> | undefined
  target: unknown
  usedOnConflict: boolean
}

/** Wires `db.insert(...).values(...).onConflictDoUpdate(...)` and records every argument. */
function captureUpsert(behaviour: "resolve" | "reject" = "resolve"): CapturedUpsert {
  const captured: CapturedUpsert = {
    values: undefined,
    set: undefined,
    target: undefined,
    usedOnConflict: false,
  }

  mockDb.insert.mockReturnValue({
    values: (v: Record<string, unknown>) => {
      captured.values = v
      return {
        onConflictDoUpdate: (config: { target: unknown; set: Record<string, unknown> }) => {
          captured.usedOnConflict = true
          captured.target = config.target
          captured.set = config.set
          return behaviour === "resolve"
            ? Promise.resolve(undefined)
            : Promise.reject(new Error("write failed"))
        },
        // A BLIND INSERT MUST NOT TYPECHECK PAST THIS MOCK. `values(...)` returning a thenable
        // would let an implementation that dropped `onConflictDoUpdate` pass every assertion
        // below while raising a duplicate-key error against the real primary key.
        then: () => {
          throw new Error("writeOrgIdentityFields must upsert, never insert blindly")
        },
      }
    },
  })

  return captured
}

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

function warnLines(): string[] {
  return warnSpy.mock.calls.map((call: unknown[]) =>
    call.map((part: unknown) => String(part)).join(" ")
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the settings keys and their bounds", () => {
  it("pins both key strings as literals", () => {
    // Nothing else links these strings to the rows an operator writes by hand during the
    // 39-VALIDATION threshold sweep. A rename must be a failing test, not a silently
    // unreadable setting.
    expect(ORG_IDENTITY_FIELDS_KEY).toBe("dedup.organization_identity_fields")
    expect(DEDUP_SIMILARITY_KEY).toBe("dedup.similarity_threshold")
  })

  it("pins the identity-field cap and the threshold bounds as literals", () => {
    expect(ORG_IDENTITY_FIELDS_MAX).toBe(2)
    expect(SIMILARITY_MIN).toBe(0.1)
    expect(SIMILARITY_MAX).toBe(1)
  })
})

describe("readOrgIdentityFields", () => {
  it("Test 1 — returns null, NOT an empty array, when no row exists for the key", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue(undefined)

    const result = await readOrgIdentityFields()

    // THE TWO VALUES MEAN DIFFERENT THINGS AND ONLY `null` MEANS "UNCONFIGURED".
    // `findCertainMatches` branches on this exact value to decide whether to issue a query at
    // all; `[]` would reach `classifyOrganizationMatch` as "configured with nothing", and the
    // round trip that produces would be pure cost for a guaranteed empty answer.
    expect(result).toBeNull()
    expect(result).not.toEqual([])
  })

  it("returns the stored labels in the stored order — order is the contract", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({
      key: ORG_IDENTITY_FIELDS_KEY,
      value: [FIELD_A, FIELD_B],
      updatedAt: new Date(),
    })

    // First-populated-on-both wins and no later field is consulted (`scoring.ts`
    // `firstSharedIdentity`), so a reordered read silently changes which field decides.
    await expect(readOrgIdentityFields()).resolves.toEqual([FIELD_A, FIELD_B])
  })

  it("queries app_settings exactly once, on the identity key constant", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: [FIELD_A] })

    await readOrgIdentityFields()

    expect(mockDb.query.appSettings.findFirst).toHaveBeenCalledTimes(1)
  })

  it("returns null and warns for a bare string, naming the key but never the stored value", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: FIELD_A })

    await expect(readOrgIdentityFields()).resolves.toBeNull()

    const lines = warnLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(ORG_IDENTITY_FIELDS_KEY)
    // T-39-10: identifiers and bounds only. The stored value is admin-supplied content and has
    // no business in a log line.
    expect(lines[0]).not.toContain(FIELD_A)
  })

  it("returns null for an empty array without warning — cleared is a legal state", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: [] })

    await expect(readOrgIdentityFields()).resolves.toBeNull()
    // An admin who cleared the setting did nothing wrong; warning here would train operators to
    // ignore the log line that matters.
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it("returns null and warns above the cap of two entries", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: [FIELD_A, FIELD_B, "Third"] })

    // The control offers two. A longer array means something wrote this row out of band, and
    // widening the certain check from outside the UI is precisely T-39-11.
    await expect(readOrgIdentityFields()).resolves.toBeNull()
    expect(warnLines()).toHaveLength(1)
    expect(warnLines()[0]).toContain(ORG_IDENTITY_FIELDS_KEY)
  })

  it("returns null and warns when an entry is not a string", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: [FIELD_A, 42] })

    await expect(readOrgIdentityFields()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it("returns null and warns when the stored value is JSON null", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: null })

    await expect(readOrgIdentityFields()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it("returns null and never throws when the query rejects", async () => {
    mockDb.query.appSettings.findFirst.mockRejectedValue(new Error("relation unavailable"))

    // A duplicate check must never be the reason a create fails, so the failure has to arrive
    // as a value rather than as a rejection the create path would have to catch.
    await expect(readOrgIdentityFields()).resolves.toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe("writeOrgIdentityFields", () => {
  it("stores an empty array successfully, and that value reads back as null", async () => {
    const captured = captureUpsert()

    await expect(writeOrgIdentityFields([])).resolves.toEqual({ success: true })
    expect(captured.values?.value).toEqual([])

    // THE ROUND TRIP IS THE POINT: clearing the setting is legal on the write side and means
    // "unconfigured" on the read side. Replay the exact value that landed.
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: captured.values?.value })
    await expect(readOrgIdentityFields()).resolves.toBeNull()
  })

  it("stores the labels trimmed, in the given order", async () => {
    const captured = captureUpsert()

    await expect(writeOrgIdentityFields([`  ${FIELD_A}  `, FIELD_B])).resolves.toEqual({
      success: true,
    })
    expect(captured.values?.value).toEqual([FIELD_A, FIELD_B])
  })

  it("rejects a non-string entry BEFORE any database call", async () => {
    const captured = captureUpsert()

    const result = await writeOrgIdentityFields([FIELD_A, 7 as unknown as string])

    expect(result.success).toBe(false)
    // A `false` result alone would not prove the value never landed — an out-of-range value in
    // storage is something every later read would have to defend against (T-39-11).
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(captured.values).toBeUndefined()
  })

  it("rejects a blank / whitespace-only entry BEFORE any database call", async () => {
    await expect(writeOrgIdentityFields([FIELD_A, "   "])).resolves.toMatchObject({
      success: false,
    })
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects more than the cap BEFORE any database call", async () => {
    await expect(writeOrgIdentityFields([FIELD_A, FIELD_B, "Third"])).resolves.toMatchObject({
      success: false,
    })
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("upserts with onConflictDoUpdate on the key, never a blind insert", async () => {
    const captured = captureUpsert()

    await writeOrgIdentityFields([FIELD_A])

    expect(captured.usedOnConflict).toBe(true)
    expect(captured.target).toBe(appSettings.key)
    expect(captured.values?.key).toBe(ORG_IDENTITY_FIELDS_KEY)
    expect(captured.set?.value).toEqual([FIELD_A])
    expect(captured.values?.updatedAt).toBeInstanceOf(Date)
  })

  it("returns a failure result rather than propagating a rejected write", async () => {
    captureUpsert("reject")

    await expect(writeOrgIdentityFields([FIELD_A])).resolves.toMatchObject({ success: false })
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe("readSimilarityThreshold", () => {
  it("falls back to DEFAULT_SIMILARITY_THRESHOLD when no row exists", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue(undefined)

    // THE ASYMMETRY WITH THE IDENTITY KEY IS THE POINT. A threshold has a measured safe default
    // (0.85); a custom-field label does not, which is why one falls back and the other does not.
    await expect(readSimilarityThreshold()).resolves.toBe(DEFAULT_SIMILARITY_THRESHOLD)
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBe(0.85)
  })

  it("returns the stored threshold when it is in range", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: 0.92 })

    await expect(readSimilarityThreshold()).resolves.toBe(0.92)
  })

  it("falls back and warns above SIMILARITY_MAX", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: 1.5 })

    await expect(readSimilarityThreshold()).resolves.toBe(DEFAULT_SIMILARITY_THRESHOLD)

    const lines = warnLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(DEDUP_SIMILARITY_KEY)
    // Bounds are safe to log; they are the product's own numbers.
    expect(lines[0]).toContain(String(SIMILARITY_MIN))
    expect(lines[0]).toContain(String(SIMILARITY_MAX))
    expect(lines[0]).not.toContain("1.5")
  })

  it("falls back and warns for a negative value", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: -1 })

    await expect(readSimilarityThreshold()).resolves.toBe(DEFAULT_SIMILARITY_THRESHOLD)
    expect(warnSpy).toHaveBeenCalled()
  })

  it("falls back and warns for a numeric string — jsonb will happily hold \"0.9\"", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: "0.9" })

    await expect(readSimilarityThreshold()).resolves.toBe(DEFAULT_SIMILARITY_THRESHOLD)
    expect(warnSpy).toHaveBeenCalled()
  })

  it("falls back and warns for JSON null", async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValue({ value: null })

    await expect(readSimilarityThreshold()).resolves.toBe(DEFAULT_SIMILARITY_THRESHOLD)
    expect(warnSpy).toHaveBeenCalled()
  })

  it("falls back and never throws when the query rejects", async () => {
    mockDb.query.appSettings.findFirst.mockRejectedValue(new Error("relation unavailable"))

    await expect(readSimilarityThreshold()).resolves.toBe(DEFAULT_SIMILARITY_THRESHOLD)
    expect(errorSpy).toHaveBeenCalled()
  })
})
