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
      dueDate: "2026-04-01",
      userId: "user-abc",
    })
    expect(result.output).toMatchObject({ success: true, id: "act-new" })
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
})
