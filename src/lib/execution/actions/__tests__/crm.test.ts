import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ExecutionContext } from "../../types"

// Mock mutations
const mockCreateDeal = vi.fn()
const mockUpdateDeal = vi.fn()
const mockDeleteDeal = vi.fn()
const mockCreatePerson = vi.fn()
const mockUpdatePerson = vi.fn()
const mockDeletePerson = vi.fn()
const mockCreateOrganization = vi.fn()
const mockUpdateOrganization = vi.fn()
const mockDeleteOrganization = vi.fn()
const mockCreateActivity = vi.fn()
const mockUpdateActivity = vi.fn()
const mockDeleteActivity = vi.fn()

vi.mock("@/lib/mutations", () => ({
  createDealMutation: (...args: unknown[]) => mockCreateDeal(...args),
  updateDealMutation: (...args: unknown[]) => mockUpdateDeal(...args),
  deleteDealMutation: (...args: unknown[]) => mockDeleteDeal(...args),
  createPersonMutation: (...args: unknown[]) => mockCreatePerson(...args),
  updatePersonMutation: (...args: unknown[]) => mockUpdatePerson(...args),
  deletePersonMutation: (...args: unknown[]) => mockDeletePerson(...args),
  createOrganizationMutation: (...args: unknown[]) => mockCreateOrganization(...args),
  updateOrganizationMutation: (...args: unknown[]) => mockUpdateOrganization(...args),
  deleteOrganizationMutation: (...args: unknown[]) => mockDeleteOrganization(...args),
  createActivityMutation: (...args: unknown[]) => mockCreateActivity(...args),
  updateActivityMutation: (...args: unknown[]) => mockUpdateActivity(...args),
  deleteActivityMutation: (...args: unknown[]) => mockDeleteActivity(...args),
}))

// Mock DB for field lookups
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockWhere = vi.fn()
const mockLimit = vi.fn()

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
  },
}))

// Setup chain: select -> from -> where -> limit
beforeEach(() => {
  mockFrom.mockReturnValue({ where: mockWhere })
  mockWhere.mockReturnValue({ limit: mockLimit })
})

// Mock drizzle-orm operators. `and`/`isNull` are here because CR-02's caller scope is built from
// them: without the two entries every target resolution in this file dies with
// `No "and" export is defined on the "drizzle-orm" mock`, which is how the guard's arrival was
// noticed rather than assumed.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
  ilike: vi.fn((col, val) => ({ _type: "ilike", col, val })),
  and: vi.fn((...terms: unknown[]) => ({ _type: "and", terms })),
  isNull: vi.fn((col) => ({ _type: "isNull", col })),
}))

// Mock schema tables. `ownerId`/`deletedAt` are CR-02's two new `LookupDef` columns; the strings
// are what the predicate assertions below read back out of the captured `where` argument.
vi.mock("@/db/schema", () => ({
  deals: {
    id: "deals.id",
    title: "deals.title",
    ownerId: "deals.ownerId",
    deletedAt: "deals.deletedAt",
  },
  people: {
    id: "people.id",
    email: "people.email",
    firstName: "people.firstName",
    ownerId: "people.ownerId",
    deletedAt: "people.deletedAt",
  },
  organizations: {
    id: "organizations.id",
    name: "organizations.name",
    ownerId: "organizations.ownerId",
    deletedAt: "organizations.deletedAt",
  },
  activities: {
    id: "activities.id",
    title: "activities.title",
    ownerId: "activities.ownerId",
    deletedAt: "activities.deletedAt",
  },
}))

// Mock recursion
vi.mock("../../recursion", () => ({
  getCurrentExecutionDepth: vi.fn(() => 0),
  runWithExecutionDepth: vi.fn((_depth: number, fn: () => unknown) => fn()),
}))

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    trigger: {
      type: "deal.created",
      data: {
        personId: "person-123",
        email: "john@example.com",
        title: "New Deal",
      },
    },
    nodes: {},
    _workflowUserId: "user-abc",
    ...overrides,
  }
}

// Import after mocks
let executeAction: typeof import("../index").executeAction

describe("CRM action handler", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ where: mockWhere })
    mockWhere.mockReturnValue({ limit: mockLimit })
    // CR-02: a `targetId` update/delete now runs an owner-scoped existence SELECT before the
    // mutation, so the default has to be "the caller owns it" or every pre-existing cell here
    // would be asserting the refusal path by accident. Cells that want the refusal override this
    // with `[]`, and `crm-ownership.db.test.ts` is what proves the predicate against real rows —
    // this default is a HARNESS decision, and it is exactly why the behavioural proof cannot live
    // in this file.
    mockLimit.mockResolvedValue([{ id: "target-owned-by-caller" }])
    vi.resetModules()
    const mod = await import("../index")
    executeAction = mod.executeAction
  })

  it("creates a deal with interpolated field mapping", async () => {
    mockCreateDeal.mockResolvedValue({
      success: true,
      id: "deal-new",
      deal: { id: "deal-new", title: "New Deal" },
    })

    const result = await executeAction(
      "crm_action",
      {
        actionType: "crm_action",
        entity: "deal",
        operation: "create",
        fieldMapping: {
          title: "{{trigger.data.title}}",
          stageId: "stage-1",
        },
      },
      makeContext(),
      "run-1"
    )

    expect(mockCreateDeal).toHaveBeenCalledWith({
      title: "New Deal",
      stageId: "stage-1",
      userId: "user-abc",
    })
    expect(result.output).toMatchObject({ success: true, id: "deal-new" })
  })

  it("updates a person by ID", async () => {
    mockUpdatePerson.mockResolvedValue({ success: true })

    await executeAction(
      "crm_action",
      {
        actionType: "crm_action",
        entity: "person",
        operation: "update",
        fieldMapping: { email: "updated@example.com" },
        targetId: "{{trigger.data.personId}}",
      },
      makeContext(),
      "run-1"
    )

    expect(mockUpdatePerson).toHaveBeenCalledWith(
      "person-123",
      { email: "updated@example.com" },
      "user-abc"
    )
  })

  it("updates by field lookup", async () => {
    mockLimit.mockResolvedValue([{ id: "person-found" }])
    mockUpdatePerson.mockResolvedValue({ success: true })

    await executeAction(
      "crm_action",
      {
        actionType: "crm_action",
        entity: "person",
        operation: "update",
        fieldMapping: { phone: "555-1234" },
        lookupField: "email",
        lookupValue: "{{trigger.data.email}}",
      },
      makeContext(),
      "run-1"
    )

    expect(mockUpdatePerson).toHaveBeenCalledWith(
      "person-found",
      { phone: "555-1234" },
      "user-abc"
    )
  })

  it("deletes an organization", async () => {
    mockDeleteOrganization.mockResolvedValue({ success: true })

    await executeAction(
      "crm_action",
      {
        actionType: "crm_action",
        entity: "organization",
        operation: "delete",
        fieldMapping: {},
        targetId: "org-123",
      },
      makeContext(),
      "run-1"
    )

    expect(mockDeleteOrganization).toHaveBeenCalledWith("org-123", "user-abc")
  })

  it("creates an activity with interpolated fields", async () => {
    mockCreateActivity.mockResolvedValue({
      success: true,
      id: "act-new",
      activity: { id: "act-new" },
    })

    const result = await executeAction(
      "crm_action",
      {
        actionType: "crm_action",
        entity: "activity",
        operation: "create",
        fieldMapping: {
          title: "Follow up on {{trigger.data.title}}",
          typeId: "type-1",
          dueDate: "2026-04-01",
        },
      },
      makeContext(),
      "run-1"
    )

    expect(mockCreateActivity).toHaveBeenCalledWith({
      title: "Follow up on New Deal",
      typeId: "type-1",
      // dueDate is coerced from string to Date (activitySchema expects z.date())
      dueDate: new Date("2026-04-01"),
      userId: "user-abc",
    })
    expect(result.output).toMatchObject({ success: true, id: "act-new" })
  })

  describe("fieldMapping type coercion", () => {
    it("coerces numeric string to number for deal value on create", async () => {
      mockCreateDeal.mockResolvedValue({ success: true, id: "d1", deal: {} })

      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "create",
          fieldMapping: {
            title: "Big Deal",
            stageId: "stage-1",
            value: "9999",
          },
        },
        makeContext(),
        "run-1"
      )

      expect(mockCreateDeal).toHaveBeenCalledWith({
        title: "Big Deal",
        stageId: "stage-1",
        value: 9999,
        userId: "user-abc",
      })
    })

    it("coerces numeric string to number for deal value on update", async () => {
      mockUpdateDeal.mockResolvedValue({ success: true })

      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "update",
          fieldMapping: { value: "9999" },
          targetId: "deal-1",
        },
        makeContext(),
        "run-1"
      )

      expect(mockUpdateDeal).toHaveBeenCalledWith(
        "deal-1",
        { value: 9999 },
        "user-abc"
      )
    })

    it("coerces interpolated numeric value", async () => {
      mockUpdateDeal.mockResolvedValue({ success: true })

      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "update",
          fieldMapping: { value: "{{trigger.data.amount}}" },
          targetId: "deal-1",
        },
        makeContext({
          trigger: { type: "deal.created", data: { amount: 1234.5 } },
        }),
        "run-1"
      )

      expect(mockUpdateDeal).toHaveBeenCalledWith(
        "deal-1",
        { value: 1234.5 },
        "user-abc"
      )
    })

    it("coerces date string to Date for deal expectedCloseDate", async () => {
      mockUpdateDeal.mockResolvedValue({ success: true })

      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "update",
          fieldMapping: { expectedCloseDate: "2026-09-01" },
          targetId: "deal-1",
        },
        makeContext(),
        "run-1"
      )

      expect(mockUpdateDeal).toHaveBeenCalledWith(
        "deal-1",
        { expectedCloseDate: new Date("2026-09-01") },
        "user-abc"
      )
    })

    it("does not coerce string fields (title stays string)", async () => {
      mockUpdateDeal.mockResolvedValue({ success: true })

      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "update",
          fieldMapping: { title: "9999" },
          targetId: "deal-1",
        },
        makeContext(),
        "run-1"
      )

      expect(mockUpdateDeal).toHaveBeenCalledWith(
        "deal-1",
        { title: "9999" },
        "user-abc"
      )
    })

    it("omits empty-string values for typed fields", async () => {
      mockUpdateDeal.mockResolvedValue({ success: true })

      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "update",
          fieldMapping: { value: "", title: "Kept" },
          targetId: "deal-1",
        },
        makeContext(),
        "run-1"
      )

      expect(mockUpdateDeal).toHaveBeenCalledWith(
        "deal-1",
        { title: "Kept" },
        "user-abc"
      )
    })

    it("leaves non-numeric strings unchanged so validation reports them", async () => {
      mockUpdateDeal.mockResolvedValue({
        success: false,
        error: "Invalid input",
      })

      await expect(
        executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity: "deal",
            operation: "update",
            fieldMapping: { value: "not-a-number" },
            targetId: "deal-1",
          },
          makeContext(),
          "run-1"
        )
      ).rejects.toThrow("Invalid input")

      expect(mockUpdateDeal).toHaveBeenCalledWith(
        "deal-1",
        { value: "not-a-number" },
        "user-abc"
      )
    })
  })

  it("throws on mutation failure", async () => {
    mockCreateDeal.mockResolvedValue({
      success: false,
      error: "Title is required",
    })

    await expect(
      executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "create",
          fieldMapping: { stageId: "stage-1" },
        },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow("Title is required")
  })

  it("throws on unknown entity type", async () => {
    await expect(
      executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "invoice",
          operation: "create",
          fieldMapping: {},
        },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow(/unknown.*entity.*invoice/i)
  })

  it("throws on unknown operation", async () => {
    await expect(
      executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "archive",
          fieldMapping: {},
        },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow(/unknown.*operation.*archive/i)
  })

  it("uses runWithExecutionDepth around mutation calls", async () => {
    const { runWithExecutionDepth, getCurrentExecutionDepth } = await import("../../recursion")
    vi.mocked(getCurrentExecutionDepth).mockReturnValue(2)
    mockCreateDeal.mockResolvedValue({ success: true, id: "d1", deal: {} })

    await executeAction(
      "crm_action",
      {
        actionType: "crm_action",
        entity: "deal",
        operation: "create",
        fieldMapping: { title: "Test", stageId: "s1" },
      },
      makeContext(),
      "run-1"
    )

    expect(runWithExecutionDepth).toHaveBeenCalledWith(3, expect.any(Function))
  })

  it("throws when no userId in context", async () => {
    await expect(
      executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "create",
          fieldMapping: { title: "Test" },
        },
        makeContext({ _workflowUserId: undefined }),
        "run-1"
      )
    ).rejects.toThrow(/userId/i)
  })

  // ---- Dry run (WFOPS-02) ----
  //
  // The governing rule is "simulate the side effect, never the resolution": under `_dryRun` the
  // three `mutations.*` calls are skipped, and EVERY line above them still runs for real —
  // entity/operation validation, the userId check, interpolateDeep, coerceFieldMapping and
  // resolveTargetId's `ilike` lookup. Each test below therefore asserts two things: that the
  // mutation was not called, and that the resolution still happened.
  describe("dry run", () => {
    const dryContext = (overrides?: Partial<ExecutionContext>) =>
      makeContext({ _dryRun: true, ...overrides })

    /**
     * Assert the simulated output carries the SAME keys as its real counterpart plus exactly
     * `simulated`. Computed from the real output rather than listed twice, so a real output that
     * grows a key makes the simulated one fail until it grows the same key. Shape fidelity is the
     * point: a downstream transform reading a field off this node's output must not get
     * `undefined` in a dry run when it would get a value in a real one.
     */
    function expectSimulatedKeyParity(
      realOutput: Record<string, unknown>,
      dryOutput: Record<string, unknown>
    ) {
      const realKeys = new Set(Object.keys(realOutput))
      expect(realKeys.has("simulated")).toBe(false)
      expect(new Set(Object.keys(dryOutput))).toEqual(
        new Set([...realKeys, "simulated"])
      )
    }

    const allMutationMocks = [
      mockCreateDeal,
      mockUpdateDeal,
      mockDeleteDeal,
      mockCreatePerson,
      mockUpdatePerson,
      mockDeletePerson,
      mockCreateOrganization,
      mockUpdateOrganization,
      mockDeleteOrganization,
      mockCreateActivity,
      mockUpdateActivity,
      mockDeleteActivity,
    ]

    describe("create", () => {
      const createConfig = {
        actionType: "crm_action",
        entity: "deal",
        operation: "create",
        fieldMapping: {
          title: "{{trigger.data.title}}",
          stageId: "stage-1",
          value: "9999",
        },
      }

      it("does not call mutations.create and returns a simulated output", async () => {
        const result = await executeAction(
          "crm_action",
          createConfig,
          dryContext(),
          "run-dry"
        )

        expect(mockCreateDeal).not.toHaveBeenCalled()
        expect(result.output.success).toBe(true)
        expect(result.output.simulated).toBe(true)
        expect(typeof result.output.id).toBe("string")
        expect(result.output.id as string).toMatch(/^dryrun-/)
      })

      it("carries the INTERPOLATED and coerced field values, not the raw templates", async () => {
        const result = await executeAction(
          "crm_action",
          createConfig,
          dryContext(),
          "run-dry"
        )

        const deal = result.output.deal as Record<string, unknown>
        // interpolateDeep ran: the template resolved against trigger data.
        expect(deal.title).toBe("New Deal")
        expect(deal.title).not.toBe("{{trigger.data.title}}")
        // coerceFieldMapping ran: the numeric string became a number.
        expect(deal.value).toBe(9999)
        expect(deal.stageId).toBe("stage-1")
        expect(deal.id).toBe(result.output.id)
      })

      it("matches the real create output's key set plus `simulated`", async () => {
        mockCreateDeal.mockResolvedValue({
          success: true,
          id: "deal-new",
          deal: { id: "deal-new", title: "New Deal" },
        })

        const real = await executeAction(
          "crm_action",
          createConfig,
          makeContext(),
          "run-real"
        )
        const dry = await executeAction(
          "crm_action",
          createConfig,
          dryContext(),
          "run-dry"
        )

        expectSimulatedKeyParity(real.output, dry.output)
      })

      it("still throws on an unknown entity type", async () => {
        await expect(
          executeAction(
            "crm_action",
            {
              actionType: "crm_action",
              entity: "invoice",
              operation: "create",
              fieldMapping: {},
            },
            dryContext(),
            "run-dry"
          )
        ).rejects.toThrow(/unknown.*entity.*invoice/i)
      })

      it("still throws when no userId is in context", async () => {
        await expect(
          executeAction(
            "crm_action",
            createConfig,
            dryContext({ _workflowUserId: undefined }),
            "run-dry"
          )
        ).rejects.toThrow(/userId/i)
      })

      it("does not enter runWithExecutionDepth for a skipped mutation", async () => {
        const { runWithExecutionDepth } = await import("../../recursion")

        await executeAction("crm_action", createConfig, dryContext(), "run-dry")

        // Entering the depth wrapper without mutating would bump the ambient depth for
        // nothing and could spuriously trip the recursion guard for a sibling node.
        expect(runWithExecutionDepth).not.toHaveBeenCalled()
      })
    })

    describe("update", () => {
      it("does not call mutations.update but still runs the ilike target lookup", async () => {
        mockLimit.mockResolvedValue([{ id: "person-found" }])
        const { ilike } = await import("drizzle-orm")

        const result = await executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity: "person",
            operation: "update",
            fieldMapping: { phone: "555-1234" },
            lookupField: "email",
            lookupValue: "{{trigger.data.email}}",
          },
          dryContext(),
          "run-dry"
        )

        expect(mockUpdatePerson).not.toHaveBeenCalled()
        // resolveTargetId still ran, against the INTERPOLATED lookup value.
        expect(ilike).toHaveBeenCalledWith("people.email", "john@example.com")
        expect(mockLimit).toHaveBeenCalled()
        expect(result.output).toEqual({ success: true, simulated: true })
      })

      it("still THROWS when the target record does not exist", async () => {
        // The single most valuable thing a dry run tells an operator: this update is aimed at
        // nothing. An early return above resolveTargetId would make it pass.
        mockLimit.mockResolvedValue([])

        await expect(
          executeAction(
            "crm_action",
            {
              actionType: "crm_action",
              entity: "person",
              operation: "update",
              fieldMapping: { phone: "555-1234" },
              lookupField: "email",
              lookupValue: "{{trigger.data.email}}",
            },
            dryContext(),
            "run-dry"
          )
        ).rejects.toThrow(/no person found/i)

        expect(mockUpdatePerson).not.toHaveBeenCalled()
      })

      it("still throws when neither targetId nor lookupField is configured", async () => {
        await expect(
          executeAction(
            "crm_action",
            {
              actionType: "crm_action",
              entity: "person",
              operation: "update",
              fieldMapping: { phone: "555-1234" },
            },
            dryContext(),
            "run-dry"
          )
        ).rejects.toThrow(/requires targetId or lookupField/i)
      })

      it("simulates a deal update with the real output's keys plus `simulated`", async () => {
        const config = {
          actionType: "crm_action",
          entity: "deal",
          operation: "update",
          fieldMapping: { title: "{{trigger.data.title}}" },
          targetId: "deal-1",
        }
        mockUpdateDeal.mockResolvedValue({
          success: true,
          newAssigneeUserIds: ["user-1"],
          dealTitle: "Old Title",
        })

        const real = await executeAction(
          "crm_action",
          config,
          makeContext(),
          "run-real"
        )
        const dry = await executeAction(
          "crm_action",
          config,
          dryContext(),
          "run-dry"
        )

        expect(mockUpdateDeal).toHaveBeenCalledTimes(1) // the real run only
        expectSimulatedKeyParity(real.output, dry.output)
        expect(dry.output.newAssigneeUserIds).toEqual([])
        // dealTitle comes from the interpolated fields, so a downstream transform reading
        // `input.nodes.crm1.dealTitle` gets a string rather than undefined.
        expect(dry.output.dealTitle).toBe("New Deal")
        expect(dry.output.simulated).toBe(true)
      })

      it("falls back to an empty dealTitle when the mapping sets no title", async () => {
        const result = await executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity: "deal",
            operation: "update",
            fieldMapping: { value: "500" },
            targetId: "deal-1",
          },
          dryContext(),
          "run-dry"
        )

        expect(mockUpdateDeal).not.toHaveBeenCalled()
        expect(result.output.dealTitle).toBe("")
        expect(result.output.newAssigneeUserIds).toEqual([])
      })

      it("simulates a non-deal update with the real output's keys plus `simulated`", async () => {
        const config = {
          actionType: "crm_action",
          entity: "person",
          operation: "update",
          fieldMapping: { email: "updated@example.com" },
          targetId: "{{trigger.data.personId}}",
        }
        mockUpdatePerson.mockResolvedValue({ success: true })

        const real = await executeAction(
          "crm_action",
          config,
          makeContext(),
          "run-real"
        )
        const dry = await executeAction(
          "crm_action",
          config,
          dryContext(),
          "run-dry"
        )

        expect(mockUpdatePerson).toHaveBeenCalledTimes(1) // the real run only
        expectSimulatedKeyParity(real.output, dry.output)
        expect(dry.output).toEqual({ success: true, simulated: true })
      })
    })

    describe("delete", () => {
      it("does not call mutations.delete but still resolves the target", async () => {
        mockLimit.mockResolvedValue([{ id: "org-found" }])
        const { ilike } = await import("drizzle-orm")

        const result = await executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity: "organization",
            operation: "delete",
            fieldMapping: {},
            lookupField: "name",
            lookupValue: "{{trigger.data.title}}",
          },
          dryContext(),
          "run-dry"
        )

        expect(mockDeleteOrganization).not.toHaveBeenCalled()
        expect(ilike).toHaveBeenCalledWith("organizations.name", "New Deal")
        expect(mockLimit).toHaveBeenCalled()
        expect(result.output).toEqual({ success: true, simulated: true })
      })

      it("matches the real delete output's key set plus `simulated`", async () => {
        const config = {
          actionType: "crm_action",
          entity: "organization",
          operation: "delete",
          fieldMapping: {},
          targetId: "org-123",
        }
        mockDeleteOrganization.mockResolvedValue({ success: true })

        const real = await executeAction(
          "crm_action",
          config,
          makeContext(),
          "run-real"
        )
        const dry = await executeAction(
          "crm_action",
          config,
          dryContext(),
          "run-dry"
        )

        expect(mockDeleteOrganization).toHaveBeenCalledTimes(1) // the real run only
        expectSimulatedKeyParity(real.output, dry.output)
      })
    })

    // ANTI-VACUITY: a collective zero-call assertion, so a fourth operation added to the switch
    // later without its own gate fails here rather than mutating during a dry run.
    it("calls NO crm mutation at all across dry runs of every operation", async () => {
      mockLimit.mockResolvedValue([{ id: "person-found" }])

      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "create",
          fieldMapping: { title: "T", stageId: "s1" },
        },
        dryContext(),
        "run-dry"
      )
      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "person",
          operation: "update",
          fieldMapping: { phone: "1" },
          targetId: "person-1",
        },
        dryContext(),
        "run-dry"
      )
      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "activity",
          operation: "delete",
          fieldMapping: {},
          targetId: "act-1",
        },
        dryContext(),
        "run-dry"
      )

      const totalCalls = allMutationMocks.reduce(
        (n, mock) => n + mock.mock.calls.length,
        0
      )
      expect(totalCalls).toBe(0)
    })

    // ---- The regression half: a real run is byte-identical to before this phase ----

    it("performs the real create with unchanged arguments when _dryRun is false", async () => {
      mockCreateDeal.mockResolvedValue({
        success: true,
        id: "deal-new",
        deal: { id: "deal-new" },
      })

      const result = await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "create",
          fieldMapping: { title: "{{trigger.data.title}}", stageId: "stage-1" },
        },
        makeContext({ _dryRun: false }),
        "run-real"
      )

      expect(mockCreateDeal).toHaveBeenCalledTimes(1)
      expect(mockCreateDeal).toHaveBeenCalledWith({
        title: "New Deal",
        stageId: "stage-1",
        userId: "user-abc",
      })
      expect(result.output).toEqual({
        success: true,
        id: "deal-new",
        deal: { id: "deal-new" },
      })
    })

    it("performs the real update with unchanged arguments when _dryRun is false", async () => {
      mockUpdatePerson.mockResolvedValue({ success: true })

      const result = await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "person",
          operation: "update",
          fieldMapping: { email: "updated@example.com" },
          targetId: "{{trigger.data.personId}}",
        },
        makeContext({ _dryRun: false }),
        "run-real"
      )

      expect(mockUpdatePerson).toHaveBeenCalledTimes(1)
      expect(mockUpdatePerson).toHaveBeenCalledWith(
        "person-123",
        { email: "updated@example.com" },
        "user-abc"
      )
      expect(result.output).toEqual({ success: true })
    })

    it("performs the real delete with unchanged arguments when _dryRun is false", async () => {
      mockDeleteOrganization.mockResolvedValue({ success: true })

      const result = await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "organization",
          operation: "delete",
          fieldMapping: {},
          targetId: "org-123",
        },
        makeContext({ _dryRun: false }),
        "run-real"
      )

      expect(mockDeleteOrganization).toHaveBeenCalledTimes(1)
      expect(mockDeleteOrganization).toHaveBeenCalledWith(
        "org-123",
        "user-abc"
      )
      expect(result.output).toEqual({ success: true })
    })
  })

  /**
   * CR-02 — the STRUCTURE of the caller scope. The BEHAVIOUR is proven against real rows in
   * `src/lib/execution/actions/crm-ownership.db.test.ts`; what these cells add is the claim that
   * the scope is in the STATEMENT rather than applied afterwards in JavaScript, which is the
   * difference between "a foreign record cannot be written" and "a foreign record cannot even be
   * shown to exist".
   *
   * These are falsifiable in both directions: deleting `callerScope(...)` from either query reds
   * the two predicate cells, and deleting `assertCallerOwnsTarget`'s throw reds the two refusal
   * cells while the positive anchor keeps a route that refused everything from satisfying them.
   */
  describe("CR-02 — the owner scope on target resolution", () => {
    /** The mocked `and`/`eq`/`isNull` combinators build plain objects; this flattens them. */
    function flatten(node: unknown): unknown[] {
      if (node && typeof node === "object" && (node as { _type?: string })._type === "and") {
        return (node as { terms: unknown[] }).terms.flatMap(flatten)
      }
      return [node]
    }

    function capturedWhereTerms(): unknown[] {
      expect(mockWhere).toHaveBeenCalled()
      return flatten(mockWhere.mock.calls[0]?.[0])
    }

    it("the targetId branch SELECTs on (id, owner_id, deleted_at is null) before the mutation runs", async () => {
      mockUpdateActivity.mockResolvedValue({ success: true })

      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "activity",
          operation: "update",
          fieldMapping: { title: "renamed" },
          targetId: "act-1",
        },
        makeContext(),
        "run-scope"
      )

      const terms = capturedWhereTerms()

      expect(terms).toEqual(
        expect.arrayContaining([
          { _type: "eq", col: "activities.id", val: "act-1" },
          // THE LOAD-BEARING TERM. `user-abc` is `_workflowUserId`, i.e. `workflow.createdBy`.
          { _type: "eq", col: "activities.ownerId", val: "user-abc" },
          { _type: "isNull", col: "activities.deletedAt" },
        ])
      )
      // FLOOR: exactly the three terms, so a fourth predicate silently widening the scope
      // (or the owner term being replaced by a second id term) is caught.
      expect(terms).toHaveLength(3)
    })

    it("the lookup branch carries the SAME owner terms alongside the ilike", async () => {
      mockLimit.mockResolvedValue([{ id: "act-found" }])
      mockUpdateActivity.mockResolvedValue({ success: true })

      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "activity",
          operation: "update",
          fieldMapping: { title: "renamed" },
          lookupField: "title",
          lookupValue: "%",
        },
        makeContext(),
        "run-scope"
      )

      const terms = capturedWhereTerms()

      expect(terms).toEqual(
        expect.arrayContaining([
          { _type: "ilike", col: "activities.title", val: "%" },
          { _type: "eq", col: "activities.ownerId", val: "user-abc" },
          { _type: "isNull", col: "activities.deletedAt" },
        ])
      )
      expect(terms).toHaveLength(3)
    })

    it("a targetId whose scoped SELECT returns nothing is refused, and the mutation is NEVER called", async () => {
      // The scoped SELECT finding no row is the only signal the guard has: it cannot tell
      // "does not exist" from "belongs to somebody else", by design.
      mockLimit.mockResolvedValue([])

      await expect(
        executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity: "activity",
            operation: "update",
            fieldMapping: { title: "pwned" },
            targetId: "someone-elses-activity",
          },
          makeContext(),
          "run-scope"
        )
      ).rejects.toThrow(/No activity found with id 'someone-elses-activity'/)

      expect(mockUpdateActivity).not.toHaveBeenCalled()
    })

    it("the refusal message names no field of the row — it is not an existence oracle", async () => {
      mockLimit.mockResolvedValue([])

      // The two refusals must be INDISTINGUISHABLE. This asserts the message is derived only from
      // the entity name and the id the caller already supplied.
      await expect(
        executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity: "deal",
            operation: "delete",
            fieldMapping: {},
            targetId: "deal-x",
          },
          makeContext(),
          "run-scope"
        )
      ).rejects.toThrow("No deal found with id 'deal-x'")

      expect(mockDeleteDeal).not.toHaveBeenCalled()
    })

    it("THE POSITIVE ANCHOR: a targetId the scoped SELECT does return reaches the mutation", async () => {
      // Without this, all four cells above are satisfied by a handler that refuses everything.
      mockLimit.mockResolvedValue([{ id: "act-1" }])
      mockUpdateActivity.mockResolvedValue({ success: true })

      const result = await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "activity",
          operation: "update",
          fieldMapping: { title: "renamed" },
          targetId: "act-1",
        },
        makeContext(),
        "run-scope"
      )

      expect(mockUpdateActivity).toHaveBeenCalledWith("act-1", { title: "renamed" }, "user-abc")
      expect(result.output).toEqual({ success: true })
    })

    it("every entity in the lookup table declares both scope columns — a fifth entity cannot be added unscoped", async () => {
      // `LookupDef` requires `ownerColumn` and `deletedAtColumn`, so this is enforced by the
      // compiler for a new entry. Asserted here as well because the compile error is invisible in
      // a test report, and because the SOURCE is what a reader checks.
      const source = readFileSync(
        path.join(process.cwd(), "src/lib/execution/actions/crm.ts"),
        "utf-8"
      )

      // Spelled out rather than pluralized: `person` -> `people` and `activity` -> `activities`
      // are both irregular, and a naive `${entity}s` produced `activitys` and a RED cell on the
      // first run — which is at least a demonstration that this assertion reads the real file.
      const TABLE_OF: Record<string, string> = {
        deal: "deals",
        person: "people",
        organization: "organizations",
        activity: "activities",
      }

      for (const [, table] of Object.entries(TABLE_OF)) {
        expect(source).toContain(`ownerColumn: ${table}.ownerId`)
        expect(source).toContain(`deletedAtColumn: ${table}.deletedAt`)
      }

      // And the four mutationMap entries are the four lookupDefs entries: a mutation reachable
      // without a lookup def would resolve its target through a `Cannot look up entity type`
      // throw, not through an unscoped query — but the counts drifting is worth catching here.
      // `ownerColumn: <table>.ownerId`, i.e. the ASSIGNMENTS. A bare /ownerColumn:/ counts 5,
      // because the `LookupDef` interface declares the field too — measured, and the reason this
      // pattern is narrowed rather than left loose.
      expect(source.match(/ownerColumn: \w+\.ownerId/g) ?? []).toHaveLength(4)
    })
  })

  /* -----------------------------------------------------------------------
   * WR-12 — the three `if (!x) throw` guards the CR-02 design leans on as its
   * backstop for an unregistered entity, which were not the guards the header said
   * they were.
   * -------------------------------------------------------------------- */

  describe("WR-12 — the runtime backstop is not satisfied by a prototype key", () => {
    /*
     * `mutationMap` and `lookupDefs` were object literals, so `mutationMap[entity]` and
     * `lookupDefs[entity]` walked `Object.prototype`. With `entity: "constructor"`:
     *
     *   - `mutationMap["constructor"]` was the `Object` constructor — truthy, so
     *     `if (!mutations) throw` did NOT fire;
     *   - `mutations["create"]` was then `Object.create` — truthy, so the operation guard did not
     *     fire either, and the handler CALLED it. `res.success` on a fresh object is `undefined`,
     *     so the caller got the generic "CRM create failed";
     *   - `def.fields["constructor"]` was `Object.prototype.constructor` — truthy, so the
     *     "Unsupported lookup field" throw did not fire and an arbitrary string became a lookup
     *     column.
     *
     * No authorization impact: every branch still failed closed, which is why this was a WARNING.
     * What was wrong was the CLAIM that these three `if (!x) throw` guards are the backstop the
     * CR-02 header says they are. All three reads are now `Map.get`, and `operation` is checked
     * against a closed list rather than used as an index.
     *
     * MEASURED RED against the object-literal version, and ONE OF THE REVIEW'S OWN CLAIMS IS
     * CORRECTED BY THE MEASUREMENT — recorded here rather than quietly matched to whatever passed:
     *
     *     ❯ src/lib/execution/actions/__tests__/crm.test.ts (46 tests | 3 failed)
     *         × `entity: "constructor"` on CREATE …
     *             expected … 'Unknown CRM entity type: constructor' but got 'CRM create failed'
     *         × `entity: "constructor"` on UPDATE …
     *             expected … 'Unknown CRM entity type: constructor' but got 'Unknown CRM operation: update'
     *         × `lookupField: "constructor"` …
     *             promise resolved "{ output: { success: true, …(2) } }" instead of rejecting
     *
     * WR-12 states that `entity: "constructor", operation: "update"` reached
     * `db.select({id: undefined}).from(undefined)` and surfaced an unmapped driver TypeError. IT
     * DID NOT. `typeof Object.update === "undefined"` (and so is `Object.delete`), so the operation
     * guard fired first and produced `Unknown CRM operation: update` — a MAPPED error, just one
     * that blames the wrong field: the operation was valid and the entity was not. Only `create`
     * slipped both guards, because `Object.create` is the one of the three that exists. The finding
     * is real and the third cell is the strongest of them — a truthy prototype value became a
     * lookup column and the update SUCCEEDED — but the update-path stack trace it describes is not
     * reproducible and is not claimed here.
     */

    it("`entity: \"constructor\"` on CREATE fails closed with the INTENDED message, not a generic one", async () => {
      await expect(
        executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity: "constructor",
            operation: "create",
            fieldMapping: { title: "x" },
          },
          makeContext(),
          "run-proto"
        )
      ).rejects.toThrow("Unknown CRM entity type: constructor")

      // And it never reached the mutation layer, which is the half a message assertion alone
      // would not cover.
      expect(mockCreateDeal).not.toHaveBeenCalled()
      expect(mockCreateActivity).not.toHaveBeenCalled()
    })

    it("`entity: \"constructor\"` on UPDATE names the ENTITY, not the operation", async () => {
      await expect(
        executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity: "constructor",
            operation: "update",
            fieldMapping: {},
            targetId: "x",
          },
          makeContext(),
          "run-proto"
        )
      ).rejects.toThrow("Unknown CRM entity type: constructor")

      expect(mockUpdateDeal).not.toHaveBeenCalled()
    })

    it("`operation: \"constructor\"` is refused rather than resolving to `Object.create`", async () => {
      await expect(
        executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity: "deal",
            operation: "constructor",
            fieldMapping: { title: "x" },
          },
          makeContext(),
          "run-proto"
        )
      ).rejects.toThrow("Unknown CRM operation: constructor")

      expect(mockCreateDeal).not.toHaveBeenCalled()
    })

    it("`lookupField: \"constructor\"` is refused rather than resolving off the prototype", async () => {
      await expect(
        executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity: "deal",
            operation: "update",
            fieldMapping: {},
            lookupField: "constructor",
            lookupValue: "%",
          },
          makeContext(),
          "run-proto"
        )
      ).rejects.toThrow("Unsupported lookup field 'constructor' for entity 'deal'")

      expect(mockUpdateDeal).not.toHaveBeenCalled()
    })

    it("THE ANTI-VACUITY ANCHOR: the four real entities and three real operations still dispatch", async () => {
      // Without this, every cell above is satisfied by a handler that refuses every entity and
      // every operation — which is what a `Map` built from the wrong source would produce.
      mockUpdateDeal.mockResolvedValue({ success: true })
      mockUpdatePerson.mockResolvedValue({ success: true })
      mockUpdateOrganization.mockResolvedValue({ success: true })
      mockUpdateActivity.mockResolvedValue({ success: true })

      for (const entity of ["deal", "person", "organization", "activity"]) {
        const result = await executeAction(
          "crm_action",
          {
            actionType: "crm_action",
            entity,
            operation: "update",
            fieldMapping: { notes: "ok" },
            targetId: "target-owned-by-caller",
          },
          makeContext(),
          "run-proto"
        )
        expect(result.output).toMatchObject({ success: true })
      }

      expect(mockUpdateDeal).toHaveBeenCalledOnce()
      expect(mockUpdatePerson).toHaveBeenCalledOnce()
      expect(mockUpdateOrganization).toHaveBeenCalledOnce()
      expect(mockUpdateActivity).toHaveBeenCalledOnce()

      // And the lookup field map still resolves its real keys off the `Map`.
      mockLimit.mockResolvedValue([{ id: "deal-found" }])
      await executeAction(
        "crm_action",
        {
          actionType: "crm_action",
          entity: "deal",
          operation: "update",
          fieldMapping: { notes: "ok" },
          lookupField: "title",
          lookupValue: "Acme",
        },
        makeContext(),
        "run-proto"
      )
      expect(mockUpdateDeal).toHaveBeenCalledWith("deal-found", { notes: "ok" }, "user-abc")
    })
  })
})
