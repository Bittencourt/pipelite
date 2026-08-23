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

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
  ilike: vi.fn((col, val) => ({ _type: "ilike", col, val })),
}))

// Mock schema tables
vi.mock("@/db/schema", () => ({
  deals: { id: "deals.id", title: "deals.title" },
  people: { id: "people.id", email: "people.email", firstName: "people.firstName" },
  organizations: { id: "organizations.id", name: "organizations.name" },
  activities: { id: "activities.id", title: "activities.title" },
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
})
