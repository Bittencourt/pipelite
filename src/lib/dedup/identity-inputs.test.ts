/**
 * WHICH CONFIGURED ORGANIZATION IDENTITY FIELDS ARE COLLECTABLE AT CREATE TIME — gap D-39-01.
 *
 * These cases pin a FAILURE DIRECTION, exactly as `identity-settings.test.ts` does for the read it
 * builds on. Every case whose expectation is `[]` is asserting the same thing: the create dialog
 * renders no identity input, which reproduces today's behaviour precisely. Unconfigured, renamed,
 * deleted and wrong-typed all land on that one safe side, because the expensive wrong answer here
 * is not a missing input — it is a free-text input writing a bare string under a `multi_select` or
 * `file` blob key, which would corrupt a value the detail page's `FieldRenderer` has to read back.
 *
 * NO DEPLOYMENT-SPECIFIC FIELD LABEL APPEARS IN THIS FILE, for the reason
 * `identity-settings.test.ts` states: the live install's labels were created by a Pipedrive import,
 * and naming them even in a fixture invites the next reader to treat them as the product's field
 * names. `Tax ID` / `Contact Email` / `Segment` are stand-ins, and the contract under test — order,
 * type and collapse — is label-agnostic by construction.
 *
 * BOTH DEPENDENCIES ARE MOCKED DOWN TO THE ONE FUNCTION EACH THIS MODULE MAY TOUCH. Same
 * minimum-surface posture as `identity-settings.test.ts`: a query the implementation grows later
 * surfaces as a TypeError instead of being absorbed by a permissive mock. It is also what keeps
 * `@/db` out of this file's module graph entirely, so the pure half needs no database double.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * `ORG_IDENTITY_FIELDS_MAX` is re-stated here rather than reached through the mock's original: the
 * factory may not load the real module, which imports the database. The constant's own contract —
 * that it is 2, and why — belongs to `identity-settings.test.ts`; what this file tests is that the
 * selector applies whatever cap it is given.
 */
vi.mock("./identity-settings", () => ({
  ORG_IDENTITY_FIELDS_MAX: 2,
  readOrgIdentityFields: vi.fn(),
}))

vi.mock("@/lib/custom-fields", () => ({
  getActiveFieldDefinitions: vi.fn(),
}))

import { readOrgIdentityFields } from "./identity-settings"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import {
  IDENTITY_INPUT_FIELD_TYPE,
  selectIdentityInputFields,
  readOrgIdentityInputFields,
} from "./identity-inputs"

const mockReadFields = vi.mocked(readOrgIdentityFields)
const mockReadDefinitions = vi.mocked(getActiveFieldDefinitions)

/** Three deployment-neutral stand-in labels. */
const FIELD_A = "Tax ID"
const FIELD_B = "Contact Email"
const FIELD_C = "Segment"

/** The shape the selector accepts — deliberately narrower than `CustomFieldDefinition`. */
const text = (name: string) => ({ name, type: "text" })

describe("selectIdentityInputFields", () => {
  it("renders nothing when the setting is UNCONFIGURED", () => {
    // `null` is the whole of the graceful degradation: no certain tier, and therefore no input to
    // collect a value for. Absence of configuration is not an error state (39-CONTEXT).
    expect(selectIdentityInputFields(null, [text(FIELD_A)])).toEqual([])
  })

  it("renders nothing for an empty configured list", () => {
    // `readOrgIdentityFields` already maps `[]` to `null`, so this is a belt on a caller that hands
    // the selector a stored value directly.
    expect(selectIdentityInputFields([], [text(FIELD_A)])).toEqual([])
  })

  it("returns the CONFIGURED order, not the definition order", () => {
    // The configured order is the CHECKING order: `firstSharedIdentity` stops at the first field
    // populated on both records, so the render order has to match it or the user sees the fields in
    // an order that does not describe how the decision is made.
    const definitions = [text(FIELD_B), text(FIELD_A)]

    expect(selectIdentityInputFields([FIELD_A, FIELD_B], definitions)).toEqual([FIELD_A, FIELD_B])
  })

  it("drops a configured label that no active definition describes", () => {
    // The admin renamed or deleted the field after configuring it. An input under that label would
    // write a blob key nothing else in the product can read back.
    expect(selectIdentityInputFields([FIELD_A], [text(FIELD_B)])).toEqual([])
  })

  it.each([
    "number",
    "date",
    "boolean",
    "single_select",
    "multi_select",
    "url",
    "lookup",
    "file",
    "formula",
  ])("drops a configured label whose definition is typed %s", (type) => {
    // `identityValue` in `matching.ts` reads a blob value only when `typeof raw === "string"`, so
    // none of these can decide a certain match anyway — and a free-text input writing a bare string
    // under an array-valued or file-valued key would corrupt it. Fail closed to today's behaviour.
    expect(selectIdentityInputFields([FIELD_A], [{ name: FIELD_A, type }])).toEqual([])
  })

  it("collapses TWO ACTIVE DEFINITIONS THAT SHARE A NAME to one entry", () => {
    // This deployment really has two active definition rows with the same name for
    // `entity_type='organization'`. `customFields` is keyed by NAME, so both address ONE blob key
    // and one input is the whole of what can be collected.
    const definitions = [text(FIELD_A), text(FIELD_A)]

    expect(selectIdentityInputFields([FIELD_A], definitions)).toEqual([FIELD_A])
  })

  it("drops a shared name whose definitions DISAGREE about type", () => {
    // One text row and one `multi_select` row under the same label: the single blob key is read back
    // by both, so a free-text input cannot be safe for it. The strict direction is the same one the
    // whole type allowlist takes.
    const definitions = [text(FIELD_A), { name: FIELD_A, type: "multi_select" }]

    expect(selectIdentityInputFields([FIELD_A], definitions)).toEqual([])
  })

  it("collapses a label configured twice", () => {
    expect(selectIdentityInputFields([FIELD_A, FIELD_A], [text(FIELD_A)])).toEqual([FIELD_A])
  })

  it("caps the result at ORG_IDENTITY_FIELDS_MAX", () => {
    // A belt on a value that arrived out of band: the read side rejects an array longer than the cap
    // outright, so a third entry can only reach the selector from a direct caller.
    const definitions = [text(FIELD_A), text(FIELD_B), text(FIELD_C)]

    expect(selectIdentityInputFields([FIELD_A, FIELD_B, FIELD_C], definitions)).toEqual([
      FIELD_A,
      FIELD_B,
    ])
  })

  it("allows exactly the text type", () => {
    expect(IDENTITY_INPUT_FIELD_TYPE).toBe("text")
  })
})

describe("readOrgIdentityInputFields", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it("resolves the configured, collectable labels and ISSUES BOTH READS", async () => {
    mockReadFields.mockResolvedValue([FIELD_A])
    mockReadDefinitions.mockResolvedValue([text(FIELD_A), { name: FIELD_B, type: "file" }] as never)

    await expect(readOrgIdentityInputFields()).resolves.toEqual([FIELD_A])

    // Both reads are asserted so a later short-circuit that skips the definitions read — and with it
    // the whole type allowlist — cannot pass silently.
    expect(mockReadFields).toHaveBeenCalledTimes(1)
    expect(mockReadDefinitions).toHaveBeenCalledTimes(1)
    expect(mockReadDefinitions).toHaveBeenCalledWith("organization")
  })

  it("resolves [] when the setting is unconfigured", async () => {
    mockReadFields.mockResolvedValue(null)
    mockReadDefinitions.mockResolvedValue([text(FIELD_A)] as never)

    await expect(readOrgIdentityInputFields()).resolves.toEqual([])
  })

  it("RESOLVES [] rather than rejecting when the definitions read throws", async () => {
    // `getActiveFieldDefinitions` is a bare `db.select()` with no guard of its own, and
    // `/organizations` has no `error.tsx` above it — an unguarded rejection would take the whole
    // list page down over a settings read.
    mockReadFields.mockResolvedValue([FIELD_A])
    mockReadDefinitions.mockRejectedValue(new Error("connection terminated"))

    await expect(readOrgIdentityInputFields()).resolves.toEqual([])
    expect(errorSpy).toHaveBeenCalled()
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("[dedup-identity-inputs]")
  })

  it("RESOLVES [] rather than rejecting when the settings read throws", async () => {
    // `readOrgIdentityFields` is documented never to throw. The guard covers it anyway: this
    // module's contract is that the page render cannot fail because of it, and that contract must
    // not depend on another module keeping a promise.
    mockReadFields.mockRejectedValue(new Error("connection terminated"))
    mockReadDefinitions.mockResolvedValue([text(FIELD_A)] as never)

    await expect(readOrgIdentityInputFields()).resolves.toEqual([])
  })
})
