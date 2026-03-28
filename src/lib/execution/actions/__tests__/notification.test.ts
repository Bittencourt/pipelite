import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ExecutionContext } from "../../types"

// Mock dns (required by http.ts side-effect import via ssrf.ts)
vi.mock("node:dns/promises", () => ({
  resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
}))

// Mock safeSend
const mockSafeSend = vi.fn()
vi.mock("@/lib/email/send", () => ({
  safeSend: (...args: unknown[]) => mockSafeSend(...args),
}))

// Mock DB for user lookup
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockWhere = vi.fn()

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
  },
}))

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn((col, vals) => ({ _type: "inArray", col, vals })),
  eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
  ilike: vi.fn((col, val) => ({ _type: "ilike", col, val })),
}))

vi.mock("@/db/schema", () => ({
  users: { id: "users.id", email: "users.email" },
  deals: { id: "deals.id", title: "deals.title" },
  people: { id: "people.id", email: "people.email", firstName: "people.firstName" },
  organizations: { id: "organizations.id", name: "organizations.name" },
  activities: { id: "activities.id", title: "activities.title" },
}))

// Mock mutations (loaded by crm.ts side-effect import)
vi.mock("@/lib/mutations", () => ({
  createDealMutation: vi.fn(),
  updateDealMutation: vi.fn(),
  deleteDealMutation: vi.fn(),
  createPersonMutation: vi.fn(),
  updatePersonMutation: vi.fn(),
  deletePersonMutation: vi.fn(),
  createOrganizationMutation: vi.fn(),
  updateOrganizationMutation: vi.fn(),
  deleteOrganizationMutation: vi.fn(),
  createActivityMutation: vi.fn(),
  updateActivityMutation: vi.fn(),
  deleteActivityMutation: vi.fn(),
}))

// Mock recursion (loaded by crm.ts side-effect import)
vi.mock("../../recursion", () => ({
  getCurrentExecutionDepth: vi.fn(() => 0),
  runWithExecutionDepth: vi.fn((_depth: number, fn: () => unknown) => fn()),
}))

// Mock notification template
vi.mock("@/lib/email/templates", () => ({
  getWorkflowNotificationTemplate: vi.fn((message: string) => ({
    subject: "Workflow Notification",
    html: `<html>${message}</html>`,
    text: `Workflow Notification\n\n${message}`,
  })),
}))

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    trigger: {
      type: "deal.created",
      data: {
        dealTitle: "Big Deal",
        personName: "John",
      },
    },
    nodes: {},
    _workflowUserId: "user-abc",
    ...overrides,
  }
}

let executeAction: typeof import("../index").executeAction

describe("Notification action handler", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ where: mockWhere })
    vi.resetModules()
    const mod = await import("../index")
    executeAction = mod.executeAction
  })

  it("sends notification to specified user IDs", async () => {
    mockWhere.mockResolvedValue([
      { email: "alice@team.com" },
      { email: "bob@team.com" },
    ])
    mockSafeSend.mockResolvedValue(undefined)

    const result = await executeAction(
      "notification",
      {
        actionType: "notification",
        userIds: ["user-alice", "user-bob"],
        message: "Deal {{trigger.data.dealTitle}} created by {{trigger.data.personName}}",
      },
      makeContext(),
      "run-1"
    )

    expect(mockSafeSend).toHaveBeenCalledTimes(2)
    expect(mockSafeSend).toHaveBeenCalledWith(
      "alice@team.com",
      expect.objectContaining({ subject: "Workflow Notification" })
    )
    expect(mockSafeSend).toHaveBeenCalledWith(
      "bob@team.com",
      expect.objectContaining({ subject: "Workflow Notification" })
    )
    expect(result.output.sent).toBe(true)
    expect(result.output.recipientCount).toBe(2)
  })

  it("interpolates message with variables", async () => {
    mockWhere.mockResolvedValue([{ email: "alice@team.com" }])
    mockSafeSend.mockResolvedValue(undefined)

    await executeAction(
      "notification",
      {
        actionType: "notification",
        userIds: ["user-alice"],
        message: "New deal: {{trigger.data.dealTitle}}",
      },
      makeContext(),
      "run-1"
    )

    const template = mockSafeSend.mock.calls[0][1]
    expect(template.text).toContain("New deal: Big Deal")
  })

  it("throws on safeSend failure", async () => {
    mockWhere.mockResolvedValue([{ email: "alice@team.com" }])
    mockSafeSend.mockRejectedValue(new Error("SMTP timeout"))

    await expect(
      executeAction(
        "notification",
        {
          actionType: "notification",
          userIds: ["user-alice"],
          message: "Test notification",
        },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow("SMTP timeout")
  })

  it("throws on empty userIds", async () => {
    await expect(
      executeAction(
        "notification",
        {
          actionType: "notification",
          userIds: [],
          message: "Test notification",
        },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow(/no notification recipients/i)
  })
})
