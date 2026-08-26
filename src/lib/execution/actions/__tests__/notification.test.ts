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

// Mock notification template.
// Hoisted to a module-level vi.fn so the reference survives the beforeEach
// vi.resetModules() — the dry-run cases assert the template builder still ran
// with the INTERPOLATED message, which needs a stable handle on the mock.
const mockGetWorkflowNotificationTemplate = vi.fn((message: string) => ({
  subject: "Workflow Notification",
  html: `<html>${message}</html>`,
  text: `Workflow Notification\n\n${message}`,
}))
vi.mock("@/lib/email/templates", () => ({
  getWorkflowNotificationTemplate: (message: string) =>
    mockGetWorkflowNotificationTemplate(message),
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

  // Amendment A1: notification is the FIFTH side-effecting handler. CONTEXT's
  // dry-run decision enumerated four. `.env` points SMTP at a real relay on port
  // 465, NOT mailhog's localhost:1025, so without the gate below a dry run of a
  // workflow containing a notification node sends real mail from the production
  // sending domain to real addresses read from the `users` table.
  describe("dry run (amendment A1 — the fifth side-effecting handler)", () => {
    it("sends nothing for a THREE-user config, while looking users up for real", async () => {
      mockWhere.mockResolvedValue([
        { email: "alice@team.com" },
        { email: "bob@team.com" },
        { email: "carol@team.com" },
      ])
      mockSafeSend.mockResolvedValue(undefined)

      const result = await executeAction(
        "notification",
        {
          actionType: "notification",
          userIds: ["user-alice", "user-bob", "user-carol"],
          message: "Deal {{trigger.data.dealTitle}} created",
        },
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      // Zero calls asserted for THREE users: a partial gate that skipped only the
      // first row and mailed the rest would pass a single-user test.
      expect(mockSafeSend).toHaveBeenCalledTimes(0)
      // The users SELECT still ran.
      expect(mockFrom).toHaveBeenCalled()
      expect(result.output.sent).toBe(false)
      expect(result.output.simulated).toBe(true)
      expect(result.output.recipientCount).toBe(3)
      expect(result.output.recipients).toEqual([
        "alice@team.com",
        "bob@team.com",
        "carol@team.com",
      ])
    })

    it("STILL throws \"No notification recipients specified\" for empty userIds", async () => {
      await expect(
        executeAction(
          "notification",
          { actionType: "notification", userIds: [], message: "Test" },
          makeContext({ _dryRun: true }),
          "run-dry"
        )
      ).rejects.toThrow("No notification recipients specified")
    })

    it("STILL throws \"No valid users found for notification\" when the SELECT is empty", async () => {
      mockWhere.mockResolvedValue([])

      await expect(
        executeAction(
          "notification",
          {
            actionType: "notification",
            userIds: ["user-ghost"],
            message: "Test",
          },
          makeContext({ _dryRun: true }),
          "run-dry"
        )
      ).rejects.toThrow("No valid users found for notification")
    })

    it("still interpolates the message into the template builder", async () => {
      mockWhere.mockResolvedValue([{ email: "alice@team.com" }])
      mockSafeSend.mockResolvedValue(undefined)

      await executeAction(
        "notification",
        {
          actionType: "notification",
          userIds: ["user-alice"],
          message: "New deal: {{trigger.data.dealTitle}} for {{trigger.data.personName}}",
        },
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      expect(mockGetWorkflowNotificationTemplate).toHaveBeenCalledWith(
        "New deal: Big Deal for John"
      )
      expect(mockSafeSend).toHaveBeenCalledTimes(0)
    })

    it("reports REAL recipients: three rows, one with a null email, counts 2", async () => {
      mockWhere.mockResolvedValue([
        { email: "alice@team.com" },
        { email: null },
        { email: "carol@team.com" },
      ])
      mockSafeSend.mockResolvedValue(undefined)

      const result = await executeAction(
        "notification",
        {
          actionType: "notification",
          userIds: ["user-alice", "user-null", "user-carol"],
          message: "Test",
        },
        makeContext({ _dryRun: true }),
        "run-dry"
      )

      // emails.push must stay OUTSIDE the gate — a dry run must report who WOULD
      // have been notified, and a row with a null email is still excluded.
      expect(result.output.recipientCount).toBe(2)
      expect(result.output.recipients).toEqual([
        "alice@team.com",
        "carol@team.com",
      ])
      expect(mockSafeSend).toHaveBeenCalledTimes(0)
    })

    it("output key set equals the real output's key set plus exactly `simulated`, and the real half proves the mock is wired", async () => {
      mockWhere.mockResolvedValue([
        { email: "alice@team.com" },
        { email: "bob@team.com" },
      ])
      mockSafeSend.mockResolvedValue(undefined)

      const config = {
        actionType: "notification",
        userIds: ["user-alice", "user-bob"],
        message: "Shared config",
      }

      const dry = await executeAction(
        "notification",
        config,
        makeContext({ _dryRun: true }),
        "run-dry"
      )
      const dryCallCount = mockSafeSend.mock.calls.length

      const real = await executeAction(
        "notification",
        config,
        makeContext(),
        "run-real"
      )
      const realCallCount = mockSafeSend.mock.calls.length - dryCallCount

      // ANTI-VACUITY, load-bearing: both halves observe THE SAME mock. A test where
      // the mock was never wired would report zero calls under dry run and prove
      // nothing at all — so the real half must see a NON-zero count on that same mock.
      expect(
        dryCallCount,
        "dry run must not call safeSend (this is the gate under test)"
      ).toBe(0)
      expect(
        realCallCount,
        "the real run must call the SAME safeSend mock a non-zero number of times — " +
          "otherwise the dry-run zero-count above is vacuous, because an unwired mock " +
          "also reports zero"
      ).toBe(2)

      // Computed, not listed twice: a downstream transform/condition node reads
      // fields off the previous node's output.
      const realKeys = Object.keys(real.output).sort()
      const dryKeys = Object.keys(dry.output).sort()
      expect(dryKeys).toEqual([...realKeys, "simulated"].sort())
    })

    it("with _dryRun false, sends once per row with an email and unchanged arguments", async () => {
      mockWhere.mockResolvedValue([
        { email: "alice@team.com" },
        { email: null },
        { email: "carol@team.com" },
      ])
      mockSafeSend.mockResolvedValue(undefined)

      const result = await executeAction(
        "notification",
        {
          actionType: "notification",
          userIds: ["user-alice", "user-null", "user-carol"],
          message: "Test",
        },
        makeContext({ _dryRun: false }),
        "run-real"
      )

      expect(mockSafeSend).toHaveBeenCalledTimes(2)
      expect(mockSafeSend).toHaveBeenNthCalledWith(
        1,
        "alice@team.com",
        expect.objectContaining({ subject: "Workflow Notification" })
      )
      expect(mockSafeSend).toHaveBeenNthCalledWith(
        2,
        "carol@team.com",
        expect.objectContaining({ subject: "Workflow Notification" })
      )
      expect(result.output.sent).toBe(true)
      expect(result.output.simulated).toBeUndefined()
    })
  })

  /* -------------------------------------------------------------------------
   * SEC-48-D (split) — the identical unscoped `users` read this handler had
   * ---------------------------------------------------------------------- */

  describe("SEC-48-D — a soft-deleted user cannot be resolved to an address", () => {
    /*
     * `notification.ts` carried the SAME `select email from users where id in (…)` as `email.ts`
     * with the same missing `deletedAt` predicate, so it gets the same fix and the same cells. The
     * full reasoning — including why NO owner or self predicate was added, and the `/team` page that
     * makes the review's directory-disclosure premise false in this product — is written above
     * `resolveRecipientEmails` in `../email.ts` and referenced from this handler's own comment.
     *
     * MEASURED RED with the rest: before `and`/`isNull` were added to this file's `drizzle-orm`
     * mock, nine of its eleven cells failed with
     * `[vitest] No "and" export is defined on the "drizzle-orm" mock`.
     */

    it("carries BOTH terms on the statement: the id set AND the soft-delete guard", async () => {
      mockWhere.mockResolvedValue([{ email: "alice@team.com" }])
      mockSafeSend.mockResolvedValue(undefined)

      await executeAction(
        "notification",
        { actionType: "notification", userIds: ["user-alice"], message: "hi" },
        makeContext(),
        "run-scope"
      )

      expect(mockWhere).toHaveBeenCalledTimes(1)
      expect(mockWhere.mock.calls[0][0]).toEqual({
        _type: "and",
        terms: [
          { _type: "inArray", col: "users.id", vals: ["user-alice"] },
          { _type: "isNull", col: "users.deletedAt" },
        ],
      })
    })

    it("throws for the real reason, and sends nothing, when the scoped SELECT is empty", async () => {
      mockWhere.mockResolvedValue([])

      await expect(
        executeAction(
          "notification",
          { actionType: "notification", userIds: ["user-departed"], message: "hi" },
          makeContext(),
          "run-scope"
        )
      ).rejects.toThrow("No valid users found for notification")

      expect(mockSafeSend).not.toHaveBeenCalled()
    })

    it("THE ANTI-VACUITY ANCHOR: a live user still resolves and is still mailed", async () => {
      mockWhere.mockResolvedValue([{ email: "alice@team.com" }])
      mockSafeSend.mockResolvedValue(undefined)

      const result = await executeAction(
        "notification",
        { actionType: "notification", userIds: ["user-alice"], message: "hi" },
        makeContext(),
        "run-scope"
      )

      expect(mockSafeSend).toHaveBeenCalledWith("alice@team.com", expect.anything())
      expect(result.output.recipients).toEqual(["alice@team.com"])
    })

    it("under _dryRun the scoped SELECT still runs and STILL sends no mail", async () => {
      // The half of the review's account that IS correct and worth pinning: the addresses come back
      // in the output with no mail sent, which is why the two halves of SEC-48-D are separable at
      // all. The predicate applies on this path too — a dry run must not be able to read what a
      // real run cannot.
      mockWhere.mockResolvedValue([{ email: "alice@team.com" }])

      const result = await executeAction(
        "notification",
        { actionType: "notification", userIds: ["user-alice"], message: "hi" },
        makeContext({ _dryRun: true }),
        "run-scope"
      )

      expect(mockWhere.mock.calls[0][0]).toMatchObject({ _type: "and" })
      expect(mockSafeSend).not.toHaveBeenCalled()
      expect(result.output).toMatchObject({ sent: false, simulated: true })
    })
  })
})
