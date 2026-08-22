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
