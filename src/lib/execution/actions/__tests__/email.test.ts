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

// Mock email templates.
// Hoisted to a module-level vi.fn so the reference survives the beforeEach
// vi.resetModules() — the dry-run cases assert the template builder still ran
// with INTERPOLATED strings, which needs a stable handle on the mock.
const mockGetWorkflowEmailTemplate = vi.fn((subject: string, body: string) => ({
  subject,
  html: `<html>${body}</html>`,
  text: `${subject}\n\n${body}`,
}))
vi.mock("@/lib/email/templates", () => ({
  getWorkflowEmailTemplate: (subject: string, body: string) =>
    mockGetWorkflowEmailTemplate(subject, body),
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

  describe("dry run", () => {
    it("sends nothing for a MULTI-recipient config, while resolving for real", async () => {
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
          subject: "About {{trigger.data.dealTitle}}",
          body: "Hi {{trigger.data.person.name}}, your deal is ready.",
        },
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      // Zero calls asserted for TWO recipients: a partial gate that skipped only
      // the first recipient and mailed the rest would pass a single-recipient test.
      expect(mockSafeSend).toHaveBeenCalledTimes(0)

      // resolveRecipientEmails still ran for real: the users SELECT was issued...
      expect(mockFrom).toHaveBeenCalled()
      // ...and the "dynamic" recipient was INTERPOLATED, not passed through raw.
      expect(result.output.recipients).toEqual(["john@example.com", "bob@team.com"])
      expect(result.output.recipients).not.toContain(
        "{{trigger.data.person.email}}"
      )
      expect(result.output.recipientCount).toBe(2)
      expect(result.output.sent).toBe(false)
      expect(result.output.simulated).toBe(true)
    })

    it("still interpolates subject and body into the template builder", async () => {
      mockSafeSend.mockResolvedValue(undefined)

      await executeAction(
        "email",
        {
          actionType: "email",
          recipients: [{ type: "dynamic", value: "solo@example.com" }],
          subject: "Deal: {{trigger.data.dealTitle}}",
          body: "Hi {{trigger.data.person.name}}, deal is active.",
        },
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      expect(mockGetWorkflowEmailTemplate).toHaveBeenCalledWith(
        "Deal: Big Deal",
        "Hi John, deal is active."
      )
      expect(mockSafeSend).toHaveBeenCalledTimes(0)
    })

    it("STILL throws when nothing resolves — the gate is not an early return", async () => {
      await expect(
        executeAction(
          "email",
          {
            actionType: "email",
            recipients: [{ type: "dynamic", value: "{{trigger.data.missing}}" }],
            subject: "Test",
            body: "Test",
          },
          makeContext({ _dryRun: true }),
          "run-dry"
        )
      ).rejects.toThrow("No valid recipients resolved for email action")
    })

    it("output key set equals the real output's key set plus exactly `simulated`", async () => {
      mockWhere.mockResolvedValue([{ email: "bob@team.com" }])
      mockSafeSend.mockResolvedValue(undefined)

      const config = {
        actionType: "email",
        recipients: [
          { type: "dynamic", value: "{{trigger.data.person.email}}" },
          { type: "user", value: "user-bob" },
        ],
        subject: "Update",
        body: "Hello",
      }

      const real = await executeAction("email", config, makeContext(), "run-real")
      const dry = await executeAction(
        "email",
        config,
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      // Computed, not listed twice: a downstream transform/condition node reads
      // fields off the previous node's output, so an omitted key makes the dry run
      // fail for a reason unrelated to the workflow under test.
      const realKeys = Object.keys(real.output).sort()
      const dryKeys = Object.keys(dry.output).sort()
      expect(dryKeys).toEqual([...realKeys, "simulated"].sort())

      // ANTI-VACUITY: the same mock the dry-run half saw zero times must be seen
      // a NON-zero number of times by the real half. A never-wired mock would
      // report zero under dry run and prove nothing.
      expect(mockSafeSend).toHaveBeenCalledTimes(2)
    })

    it("with _dryRun false, sends once per address with unchanged arguments", async () => {
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
        makeContext({ _dryRun: false }),
        "run-real"
      )

      expect(mockSafeSend).toHaveBeenCalledTimes(2)
      expect(mockSafeSend).toHaveBeenNthCalledWith(
        1,
        "john@example.com",
        expect.objectContaining({ subject: "Update" })
      )
      expect(mockSafeSend).toHaveBeenNthCalledWith(
        2,
        "bob@team.com",
        expect.objectContaining({ subject: "Update" })
      )
      expect(result.output.sent).toBe(true)
      expect(result.output.simulated).toBeUndefined()
    })
  })
})
