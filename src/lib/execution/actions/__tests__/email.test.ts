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

// Mock email templates
vi.mock("@/lib/email/templates", () => ({
  getWorkflowEmailTemplate: vi.fn((subject: string, body: string) => ({
    subject,
    html: `<html>${body}</html>`,
    text: `${subject}\n\n${body}`,
  })),
}))

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    trigger: {
      type: "deal.created",
      data: {
        person: { email: "john@example.com", name: "John" },
        dealTitle: "Big Deal",
      },
    },
    nodes: {},
    _workflowUserId: "user-abc",
    ...overrides,
  }
}

let executeAction: typeof import("../index").executeAction

describe("Email action handler", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ where: mockWhere })
    vi.resetModules()
    const mod = await import("../index")
    executeAction = mod.executeAction
  })

  it("sends to dynamic recipient with interpolated email", async () => {
    mockSafeSend.mockResolvedValue(undefined)

    const result = await executeAction(
      "email",
      {
        actionType: "email",
        recipients: [{ type: "dynamic", value: "{{trigger.data.person.email}}" }],
        subject: "About {{trigger.data.dealTitle}}",
        body: "Hi {{trigger.data.person.name}}, your deal is ready.",
      },
      makeContext(),
      "run-1"
    )

    expect(mockSafeSend).toHaveBeenCalledWith(
      "john@example.com",
      expect.objectContaining({
        subject: "About Big Deal",
      })
    )
    expect(result.output.sent).toBe(true)
    expect(result.output.recipientCount).toBe(1)
  })

  it("sends to team member by user ID lookup", async () => {
    mockWhere.mockResolvedValue([{ email: "alice@team.com" }])
    mockSafeSend.mockResolvedValue(undefined)

    const result = await executeAction(
      "email",
      {
        actionType: "email",
        recipients: [{ type: "user", value: "user-alice" }],
        subject: "FYI",
        body: "Check this out.",
      },
      makeContext(),
      "run-1"
    )

    expect(mockSafeSend).toHaveBeenCalledWith(
      "alice@team.com",
      expect.objectContaining({ subject: "FYI" })
    )
    expect(result.output.sent).toBe(true)
  })

  it("sends to multiple recipients", async () => {
    mockWhere.mockResolvedValue([{ email: "bob@team.com" }])
    mockSafeSend.mockResolvedValue(undefined)

    const result = await executeAction(
      "email",
      {
        actionType: "email",
        recipients: [
          { type: "dynamic", value: "{{trigger.data.person.email}}" },
          { type: "user", value: "user-bob" },
        ],
        subject: "Update",
        body: "Hello",
      },
      makeContext(),
      "run-1"
    )

    expect(mockSafeSend).toHaveBeenCalledTimes(2)
    expect(result.output.recipientCount).toBe(2)
  })

  it("interpolates subject and body", async () => {
    mockSafeSend.mockResolvedValue(undefined)

    await executeAction(
      "email",
      {
        actionType: "email",
        recipients: [{ type: "dynamic", value: "test@example.com" }],
        subject: "Deal: {{trigger.data.dealTitle}}",
        body: "Hi {{trigger.data.person.name}}, deal {{trigger.data.dealTitle}} is active.",
      },
      makeContext(),
      "run-1"
    )

    const template = mockSafeSend.mock.calls[0][1]
    expect(template.subject).toBe("Deal: Big Deal")
    // Body should contain interpolated values
    expect(template.text).toContain("Hi John")
    expect(template.text).toContain("Big Deal")
  })

  it("throws on safeSend failure", async () => {
    mockSafeSend.mockRejectedValue(new Error("SMTP connection refused"))

    await expect(
      executeAction(
        "email",
        {
          actionType: "email",
          recipients: [{ type: "dynamic", value: "fail@example.com" }],
          subject: "Test",
          body: "Test",
        },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow("SMTP connection refused")
  })

  it("throws when no recipients resolved", async () => {
    await expect(
      executeAction(
        "email",
        {
          actionType: "email",
          recipients: [{ type: "dynamic", value: "{{trigger.data.missing}}" }],
          subject: "Test",
          body: "Test",
        },
        makeContext(),
        "run-1"
      )
    ).rejects.toThrow(/no valid recipients/i)
  })
})
