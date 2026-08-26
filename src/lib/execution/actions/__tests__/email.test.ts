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

// `and` and `isNull` are here for SEC-48-D's `isNull(users.deletedAt)` term. They were ABSENT, and
// their absence is how the predicate's arrival was noticed rather than assumed: without them every
// user-id resolution in this file died with
// `[vitest] No "and" export is defined on the "drizzle-orm" mock`. Same mechanism
// `crm.test.ts` records for CR-02's `and`/`isNull`.
vi.mock("drizzle-orm", () => ({
  inArray: vi.fn((col, vals) => ({ _type: "inArray", col, vals })),
  eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
  ilike: vi.fn((col, val) => ({ _type: "ilike", col, val })),
  and: vi.fn((...terms: unknown[]) => ({ _type: "and", terms })),
  isNull: vi.fn((col) => ({ _type: "isNull", col })),
}))

// `users.deletedAt` is SEC-48-D's new column; the string is what the predicate assertions read back
// out of the captured `where` argument.
vi.mock("@/db/schema", () => ({
  users: { id: "users.id", email: "users.email", deletedAt: "users.deletedAt" },
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

  /* -------------------------------------------------------------------------
   * SEC-48-D (split) — the `users` read is no wider than the already-public directory
   * ---------------------------------------------------------------------- */

  describe("SEC-48-D — a soft-deleted user cannot be resolved to an address", () => {
    /*
     * MEASURED RED, and the mechanism is the one `crm.test.ts` records for CR-02: before
     * `and`/`isNull` were added to this file's `drizzle-orm` mock, every user-id resolution here
     * failed with
     *
     *     Error: [vitest] No "and" export is defined on the "drizzle-orm" mock.
     *      ❯ resolveRecipientEmails src/lib/execution/actions/email.ts:80:14
     *      Test Files  2 failed (2)
     *           Tests  14 failed | 8 passed (22)
     *
     * across email.test.ts and notification.test.ts together. That is a real measurement of the
     * predicate's ARRIVAL, but it is not a measurement of its CONTENT — so the first cell below
     * reads the captured `where` argument rather than trusting that the mock stopped complaining.
     *
     * WHAT IS DELIBERATELY NOT ASSERTED HERE: an owner or self predicate. The review asked for
     * `eq(users.id, context._workflowUserId)` on the grounds that returning the resolved address in
     * the node output is a directory-disclosure oracle. It is not one in this product —
     * `src/app/team/page.tsx` already serves every non-deleted user's `email` to every signed-in
     * principal, with no role gate — so the reasoning, and the refusal to apply it, live in the
     * block above `resolveRecipientEmails`. A cell asserting a self-predicate would be asserting a
     * decision that was not taken.
     */

    it("carries BOTH terms on the statement: the id set AND the soft-delete guard", async () => {
      mockWhere.mockResolvedValue([{ email: "alice@team.com" }])
      mockSafeSend.mockResolvedValue(undefined)

      await executeAction(
        "email",
        {
          actionType: "email",
          recipients: [{ type: "user", value: "user-alice" }],
          subject: "FYI",
          body: "Body",
        },
        makeContext(),
        "run-scope"
      )

      // Read out of the captured argument, not out of the source. A filter applied AFTER the query
      // would satisfy a source grep and would still have read the departed employee's address.
      expect(mockWhere).toHaveBeenCalledTimes(1)
      expect(mockWhere.mock.calls[0][0]).toEqual({
        _type: "and",
        terms: [
          { _type: "inArray", col: "users.id", vals: ["user-alice"] },
          { _type: "isNull", col: "users.deletedAt" },
        ],
      })
    })

    it("resolves nothing, and sends nothing, when the scoped SELECT comes back empty", async () => {
      // What the predicate produces for a soft-deleted recipient: the row is filtered by the
      // statement, so there is no address to send to and the node fails for the real reason.
      mockWhere.mockResolvedValue([])

      await expect(
        executeAction(
          "email",
          {
            actionType: "email",
            recipients: [{ type: "user", value: "user-departed" }],
            subject: "FYI",
            body: "Body",
          },
          makeContext(),
          "run-scope"
        )
      ).rejects.toThrow("No valid recipients resolved for email action")

      expect(mockSafeSend).not.toHaveBeenCalled()
    })

    it("THE ANTI-VACUITY ANCHOR: a live user still resolves and is still mailed", async () => {
      // Without this, both cells above are satisfied by a predicate that matches nobody.
      mockWhere.mockResolvedValue([{ email: "alice@team.com" }])
      mockSafeSend.mockResolvedValue(undefined)

      const result = await executeAction(
        "email",
        {
          actionType: "email",
          recipients: [{ type: "user", value: "user-alice" }],
          subject: "FYI",
          body: "Body",
        },
        makeContext(),
        "run-scope"
      )

      expect(mockSafeSend).toHaveBeenCalledWith("alice@team.com", expect.anything())
      expect(result.output.recipients).toEqual(["alice@team.com"])
    })

    it("a `dynamic` recipient never touches the `users` table at all", async () => {
      // The relay half of SEC-48-D is untouched by this change, and asserting that is better than
      // saying it in prose: `dynamic` still reaches `safeSend` with no SELECT at all.
      mockSafeSend.mockResolvedValue(undefined)

      await executeAction(
        "email",
        {
          actionType: "email",
          recipients: [{ type: "dynamic", value: "someone@elsewhere.test" }],
          subject: "FYI",
          body: "Body",
        },
        makeContext(),
        "run-scope"
      )

      expect(mockWhere).not.toHaveBeenCalled()
      expect(mockSafeSend).toHaveBeenCalledWith("someone@elsewhere.test", expect.anything())
    })
  })
})
