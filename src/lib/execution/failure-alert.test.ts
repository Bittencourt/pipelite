import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock header copied from `execution-processor.test.ts:1-33` — the raw-SQL shape this module
// shares with `reclaimStaleRuns`. The `drizzle-orm` mock captures the tagged template so the
// throttle's SQL can be asserted as text and as VALUES, which is the only way to prove the
// guard lives in the write rather than in a preceding read.
//
// The module under test is loaded with `await import(...)` inside each case, exactly as
// execution-processor.test.ts does it: a static import is hoisted ABOVE these const
// declarations, so the `@/db` mock factory would run before `mockDb` exists.
const mockExecute = vi.fn()
const mockSelect = vi.fn()
const mockDb = {
  execute: mockExecute,
  select: mockSelect,
  update: vi.fn(),
}

vi.mock("@/db", () => ({ db: mockDb }))

vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    _tag: "sql",
    strings,
    values,
  }),
  eq: vi.fn((a, b) => ({ _tag: "eq", a, b })),
  and: vi.fn((...args) => ({ _tag: "and", args })),
}))

vi.mock("@/db/schema/workflows", () => ({
  workflows: { id: "workflows.id", name: "workflows.name", createdBy: "workflows.createdBy" },
  workflowRuns: {
    id: "workflowRuns.id",
    status: "workflowRuns.status",
    dryRun: "workflowRuns.dryRun",
    error: "workflowRuns.error",
    workflowId: "workflowRuns.workflowId",
  },
}))

vi.mock("@/db/schema/users", () => ({
  users: { id: "users.id", email: "users.email", locale: "users.locale" },
}))

vi.mock("@/db/schema/notification-preferences", () => ({
  notificationPreferences: {
    userId: "notificationPreferences.userId",
    emailWorkflowFailed: "notificationPreferences.emailWorkflowFailed",
  },
}))

const mockSafeSend = vi.fn()
vi.mock("@/lib/email/send", () => ({
  safeSend: (...args: unknown[]) => mockSafeSend(...args),
}))

const mockGetTemplate = vi.fn()
vi.mock("@/lib/email/templates/workflow-failed", () => ({
  getWorkflowFailedTemplate: (...args: unknown[]) => mockGetTemplate(...args),
}))

/** The mocked `sql` tag's captured shape. */
type CapturedSql = { _tag: string; strings: TemplateStringsArray; values: unknown[] }

function capturedSql(): CapturedSql {
  const captured = mockExecute.mock.calls[0]?.[0] as CapturedSql | undefined
  // ANTI-VACUITY: every assertion below reads `strings`, and `Array.from(undefined)` would
  // yield `[]`, whose `.indexOf()` is a silent -1 that passes ordering comparisons.
  expect(captured, "db.execute was never called with a sql template").toBeTruthy()
  expect(Array.from(captured!.strings).length).toBeGreaterThan(0)
  return captured!
}

function capturedSqlText(): string {
  return Array.from(capturedSql().strings).join(" ")
}

describe("FAILURE_ALERT_WINDOW_MINUTES", () => {
  it("is an exported number equal to 60", async () => {
    const { FAILURE_ALERT_WINDOW_MINUTES } = await import("./failure-alert")
    expect(typeof FAILURE_ALERT_WINDOW_MINUTES).toBe("number")
    expect(FAILURE_ALERT_WINDOW_MINUTES).toBe(60)
  })
})

describe("claimFailureAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns true when the guarded UPDATE returns a row", async () => {
    const { claimFailureAlert } = await import("./failure-alert")
    mockExecute.mockResolvedValue([{ id: "wf-1" }])
    await expect(claimFailureAlert("wf-1")).resolves.toBe(true)
  })

  it("returns false when the UPDATE matches nothing (already alerted inside the window)", async () => {
    const { claimFailureAlert } = await import("./failure-alert")
    mockExecute.mockResolvedValue([])
    await expect(claimFailureAlert("wf-1")).resolves.toBe(false)
  })

  it("returns false rather than throwing for an undefined result", async () => {
    // postgres-js does not always hand back an array; the
    // `(x as unknown as unknown[])?.length ?? 0` idiom in reclaimStaleRuns exists for this.
    const { claimFailureAlert } = await import("./failure-alert")
    mockExecute.mockResolvedValue(undefined)
    await expect(claimFailureAlert("wf-1")).resolves.toBe(false)
  })

  it("returns false rather than throwing for a null result", async () => {
    const { claimFailureAlert } = await import("./failure-alert")
    mockExecute.mockResolvedValue(null)
    await expect(claimFailureAlert("wf-1")).resolves.toBe(false)
  })

  it("builds a guarded UPDATE ... RETURNING against workflows.failure_alert_sent_at", async () => {
    const { claimFailureAlert } = await import("./failure-alert")
    mockExecute.mockResolvedValue([{ id: "wf-1" }])
    await claimFailureAlert("wf-1")

    const text = capturedSqlText()
    expect(text).toMatch(/UPDATE/)
    expect(text).toMatch(/workflows/)
    expect(text).toMatch(/failure_alert_sent_at/)
    expect(text).toMatch(/IS NULL/)
    expect(text).toMatch(/make_interval/)
    expect(text).toMatch(/RETURNING/)

    // ANTI-VACUITY: both offsets must exist before they are ordered. A bare `toBeLessThan`
    // on two `indexOf` results passes vacuously at -1 — the trap measured on a real RED run
    // in `src/app/organizations/__tests__/views-page-wiring.test.ts:161-174`.
    const updateAt = text.indexOf("UPDATE")
    const returningAt = text.indexOf("RETURNING")
    expect(updateAt).toBeGreaterThan(-1)
    expect(returningAt).toBeGreaterThan(-1)
    expect(updateAt).toBeLessThan(returningAt)
  })

  it("passes the workflow id and the window as parameterised VALUES, never as literals", async () => {
    const { claimFailureAlert, FAILURE_ALERT_WINDOW_MINUTES } = await import("./failure-alert")
    mockExecute.mockResolvedValue([{ id: "wf-1" }])
    await claimFailureAlert("wf-1")

    const { values } = capturedSql()
    expect(values).toContain("wf-1")
    // Asserted through the imported constant, so changing the window is one line and the
    // test follows it. 60 is never written into this assertion.
    expect(values).toContain(FAILURE_ALERT_WINDOW_MINUTES)

    // A concatenated interval literal would put the window inside `strings`, not `values`.
    const text = capturedSqlText()
    expect(text).not.toContain("INTERVAL '")
    expect(text).not.toContain(String(FAILURE_ALERT_WINDOW_MINUTES))
  })

  it("contains NO SELECT — the guard is IN the UPDATE, not in a preceding read", async () => {
    const { claimFailureAlert } = await import("./failure-alert")
    mockExecute.mockResolvedValue([{ id: "wf-1" }])
    await claimFailureAlert("wf-1")

    const text = capturedSqlText()
    expect(
      /\bSELECT\b/i.test(text),
      "the throttle must be a single guarded UPDATE. With a read-then-write check, two " +
        "replicas running the same processor tick would EACH pass the read and EACH send an " +
        "email — the precise defect class WFOPS-04 documents. It is also the race in the " +
        "activities.reminderSentAt writer at src/app/api/internal/email/process/route.ts:75-79, " +
        "whose SHAPE this copies but whose writer it must not."
    ).toBe(false)

    // The builder API is the other way to smuggle in a read; assert it is unused too.
    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it("does NOT touch workflows.updated_at", async () => {
    const { claimFailureAlert } = await import("./failure-alert")
    mockExecute.mockResolvedValue([{ id: "wf-1" }])
    await claimFailureAlert("wf-1")

    expect(
      capturedSqlText(),
      "failure_alert_sent_at is runtime state, not a definition change. Moving updated_at " +
        "would make the workflow editor's 'last modified' reading jump every time a run failed."
    ).not.toContain("updated_at")
  })
})

/**
 * Queue the results of the module's sequential `db.select(...).from(...).where(...).limit(1)`
 * reads, in call order: the run row, the workflow row, the author row, the preference row.
 * An exhausted queue yields `[]`, which every read treats as "missing".
 */
function queueSelects(...results: unknown[][]) {
  let call = 0
  mockSelect.mockImplementation(() => {
    const result = results[call] ?? []
    call += 1
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(result),
    }
  })
}

const RUN = { status: "failed", dryRun: false, error: "HTTP 500: upstream exploded", workflowId: "wf-1" }
const WORKFLOW = { name: "Nightly sync", createdBy: "user-1" }
const AUTHOR = { email: "author@app.test", locale: "pt-BR" }
const TEMPLATE = { subject: "s", html: "h", text: "t" }

/** Let the fire-and-forget `.catch` callback run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("maybeAlertOnRunFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue([{ id: "wf-1" }])
    mockSafeSend.mockResolvedValue(undefined)
    mockGetTemplate.mockResolvedValue(TEMPLATE)
    queueSelects()
  })

  // --- Detection. `executeRun` signals failure by WRITING a row, not by throwing
  // (`engine.ts:551-562`), so re-reading the terminal status is the only way to know.

  it.each(["completed", "running", "pending", "waiting"])(
    "does nothing for a run in status %s",
    async (status) => {
      const { maybeAlertOnRunFailure } = await import("./failure-alert")
      queueSelects([{ ...RUN, status }], [WORKFLOW], [AUTHOR], [])

      await maybeAlertOnRunFailure("run-1")

      expect(mockGetTemplate).not.toHaveBeenCalled()
      expect(mockSafeSend).not.toHaveBeenCalled()
      expect(mockExecute, "the claim must not be burned on a run that did not fail").not.toHaveBeenCalled()
    }
  )

  it("returns quietly when the run row is gone (pruned between executeRun and this read)", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([])

    await expect(maybeAlertOnRunFailure("run-1")).resolves.toBeUndefined()
    expect(mockSafeSend).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it("alerts on a failed non-dry run", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([RUN], [WORKFLOW], [AUTHOR], [])

    await maybeAlertOnRunFailure("run-1")

    expect(mockSafeSend).toHaveBeenCalledTimes(1)
  })

  // --- Dry-run exclusion (T-41-44).

  it("does not alert on a failed DRY run, and does not burn the claim window", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([{ ...RUN, dryRun: true }], [WORKFLOW], [AUTHOR], [])

    await maybeAlertOnRunFailure("run-1")

    expect(mockSafeSend, "a test run failing is expected and is not an incident").not.toHaveBeenCalled()
    expect(
      mockExecute,
      "the dryRun return must come BEFORE claimFailureAlert. Claiming and then not sending " +
        "would suppress the next REAL failure's alert for an hour, and would let anyone " +
        "silence a workflow's alerts by clicking Test run in a loop."
    ).not.toHaveBeenCalled()
  })

  // --- Preference, whose default is the one that silently disables the feature if inverted.

  it("sends when the author has NO preference row", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([RUN], [WORKFLOW], [AUTHOR], [])

    await maybeAlertOnRunFailure("run-1")

    expect(
      mockSafeSend,
      "getNotificationPreferences returns all-true when the row is absent " +
        "(src/app/settings/notifications/actions.ts:38-40), and notification_preferences is " +
        "only ever written by the settings form. Reading an absent row as 'do not send' " +
        "silently disables failure alerting for every user who never opened that page."
    ).toHaveBeenCalledTimes(1)
  })

  it("does not send when emailWorkflowFailed is false, and does not burn the claim", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([RUN], [WORKFLOW], [AUTHOR], [{ emailWorkflowFailed: false }])

    await maybeAlertOnRunFailure("run-1")

    expect(mockSafeSend).not.toHaveBeenCalled()
    expect(
      mockExecute,
      "the preference check must precede the claim, so a user who opted out never burns the window"
    ).not.toHaveBeenCalled()
  })

  it("sends when emailWorkflowFailed is true", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([RUN], [WORKFLOW], [AUTHOR], [{ emailWorkflowFailed: true }])

    await maybeAlertOnRunFailure("run-1")

    expect(mockSafeSend).toHaveBeenCalledTimes(1)
  })

  // --- Recipient (T-41-46). Exactly one address, the workflow's author.

  it("sends to exactly one address — the workflow's createdBy — in that user's locale", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([RUN], [WORKFLOW], [AUTHOR], [])

    await maybeAlertOnRunFailure("run-1")

    expect(mockSafeSend).toHaveBeenCalledTimes(1)
    expect(mockSafeSend.mock.calls[0]![0]).toBe("author@app.test")
    expect(mockSafeSend.mock.calls[0]![1]).toBe(TEMPLATE)

    expect(mockGetTemplate).toHaveBeenCalledTimes(1)
    const [name, runUrl, errorMessage, locale] = mockGetTemplate.mock.calls[0]!
    expect(name).toBe("Nightly sync")
    expect(runUrl).toContain("/workflows/wf-1/runs/run-1")
    expect(errorMessage).toBe("HTTP 500: upstream exploded")
    expect(locale).toBe("pt-BR")
  })

  it("does not send when the workflow row is gone", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([RUN], [])

    await expect(maybeAlertOnRunFailure("run-1")).resolves.toBeUndefined()
    expect(mockSafeSend).not.toHaveBeenCalled()
  })

  it("does not send when the author was deleted", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([RUN], [WORKFLOW], [])

    await expect(maybeAlertOnRunFailure("run-1")).resolves.toBeUndefined()
    expect(mockSafeSend).not.toHaveBeenCalled()
  })

  it("does not send when the author has no email address", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([RUN], [WORKFLOW], [{ email: null, locale: "en-US" }], [])

    await expect(maybeAlertOnRunFailure("run-1")).resolves.toBeUndefined()
    expect(mockSafeSend).not.toHaveBeenCalled()
  })

  it("passes an empty error string through when the run recorded none", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([{ ...RUN, error: null }], [WORKFLOW], [AUTHOR], [])

    await maybeAlertOnRunFailure("run-1")

    expect(mockGetTemplate.mock.calls[0]![2]).toBe("")
  })

  // --- Throttle integration.

  it("does not send when the claim is lost (already alerted inside the window)", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([RUN], [WORKFLOW], [AUTHOR], [])
    mockExecute.mockResolvedValue([])

    await maybeAlertOnRunFailure("run-1")

    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(mockSafeSend).not.toHaveBeenCalled()
  })

  // --- Fire-and-forget (T-41-45). safeSend RETHROWS on transport failure
  // (`src/lib/email/send.ts:34-37`); awaiting it inside the processor's drain loop would
  // abort a tick and leave pending runs unclaimed.

  it("resolves even when safeSend rejects, and logs the rejection with the [failure-alert] prefix", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    queueSelects([RUN], [WORKFLOW], [AUTHOR], [])
    mockSafeSend.mockRejectedValue(new Error("SMTP 421"))

    await expect(maybeAlertOnRunFailure("run-1")).resolves.toBeUndefined()
    await flush()

    // ANTI-VACUITY: a function that never sends would satisfy "does not reject" trivially.
    expect(mockSafeSend).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls.flat().join(" ")).toContain("[failure-alert]")
    consoleError.mockRestore()
  })

  it("does not await safeSend", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    queueSelects([RUN], [WORKFLOW], [AUTHOR], [])
    // A send that never settles must not hold the processor tick open.
    mockSafeSend.mockReturnValue(new Promise(() => {}))

    await expect(maybeAlertOnRunFailure("run-1")).resolves.toBeUndefined()
    expect(mockSafeSend).toHaveBeenCalledTimes(1)
  })

  it("swallows and logs a throw from the database read rather than propagating it", async () => {
    const { maybeAlertOnRunFailure } = await import("./failure-alert")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    mockSelect.mockImplementation(() => {
      throw new Error("connection terminated unexpectedly")
    })

    await expect(maybeAlertOnRunFailure("run-1")).resolves.toBeUndefined()
    expect(consoleError.mock.calls.flat().join(" ")).toContain("[failure-alert]")
    consoleError.mockRestore()
  })
})
