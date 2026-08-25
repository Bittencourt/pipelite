/**
 * CR-01 — A REPLAY OF A TEST RUN MUST STAY A TEST RUN.
 *
 * The harm this file exists to prevent, reachable in two clicks from a page badged "Test run":
 * the operator starts a dry run from the editor, a node fails, `DryRunDialog` navigates them to
 * `/workflows/{id}/runs/{runId}`, that page renders `Failed` + the dashed "Test run" badge + a
 * "Replay run" button — and the replay executes FOR REAL, because `replayWorkflowRun` never read the
 * origin's `dry_run` column, so `createWorkflowRun` omitted the key and the `NOT NULL DEFAULT false`
 * applied. Real mail through the production relay (`.env` sets `SMTP_PORT=465`, not mailhog), real
 * CRM writes with real `crmBus` events, real outbound HTTP. That is amendment A1's highest-severity
 * harm reached by a different route.
 *
 * WHY THE FIX IS ASSERTED HERE AND NOT AT THE RENDER SITE OR IN `replay.ts`:
 *   - the render site must stay written literally `{run.status === "failed" && ( … )}`, because
 *     UI-SPEC gate G-6 was reshaped into a source scan for exactly that shape (this repo has no
 *     jsdom), so `&& !run.dryRun` there would break the only gate on it;
 *   - `src/lib/workflows/replay.ts` is frozen by 41-02's tests, which assert `buildReplayRunInput`
 *     returns the trigger envelope BY THE SAME REFERENCE and neither accepts nor returns a flag.
 * So the flag is carried in the server action, and this is the test of that.
 *
 * THE MOCK PROJECTS THE SELECT LIST, DELIBERATELY. `mockSelect` returns only the aliases the action
 * actually asked drizzle for, exactly as a real `db.select({ … })` would. Without that, a fixture
 * that always carries `dryRun` would let a change to the `createWorkflowRun` call alone pass while
 * the column was still never selected — the bug would survive its own test.
 *
 * The recorded decision "a replay is never a dry run" is about replaying a REAL run: it exists so a
 * replay does not skip the CRM writes the operator is trying to re-run. A dry origin has no such
 * writes to skip.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockAuth, mockSelect, mockRevalidatePath, mockCreateWorkflowRun, originRow } = vi.hoisted(
  () => {
    /** The FULL origin row as it exists in postgres, before any projection. */
    const originRow: Record<string, unknown> = {
      id: "run-origin",
      workflowId: "wf-1",
      status: "failed",
      triggerData: { trigger_type: "manual", trigger_id: "dry_run", data: {} },
      dryRun: true,
    }

    /** Records the aliases the action asked for, and projects the row down to exactly those. */
    const selectedAliases: string[][] = []
    const mockSelect = vi.fn((fields: Record<string, unknown>) => {
      const aliases = Object.keys(fields)
      selectedAliases.push(aliases)
      const projected = Object.fromEntries(aliases.map((alias) => [alias, originRow[alias]]))
      return {
        from: () => ({
          where: () => ({
            limit: async () => [projected],
          }),
        }),
      }
    })

    return {
      mockAuth: vi.fn(),
      mockSelect,
      mockRevalidatePath: vi.fn(),
      mockCreateWorkflowRun: vi.fn(),
      originRow,
      selectedAliases,
    }
  },
)

vi.mock("@/auth", () => ({ auth: mockAuth }))
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }))
vi.mock("@/db", () => ({
  db: { select: (fields: Record<string, unknown>) => mockSelect(fields) },
}))
vi.mock("@/lib/triggers/create-run", () => ({
  createWorkflowRun: (
    workflowId: string,
    envelope: unknown,
    depth: number,
    options?: Record<string, unknown>,
  ) => mockCreateWorkflowRun(workflowId, envelope, depth, options),
}))

/**
 * THE ACTION IS IMPORTED STATICALLY, AT MODULE SCOPE, AND THAT IS LOAD-BEARING.
 *
 * Each of the five tests below used to open with `await import("../actions")`. Every `vi.mock` call
 * above is hoisted over this import by vitest's transform, so the static form sees exactly the same
 * mocks — and this file calls no `vi.resetModules()`, so the module was cached after the first test
 * anyway: four of the five loads were already no-ops and only the first one cost anything.
 *
 * What it cost is the point. 47-06 measured this file's first test at **5934 ms against a 5000 ms
 * `testTimeout` — 118.7% of budget, a 0.84x margin** — at a sampled 2.50x-9.00x CPU
 * oversubscription, failing in 3 of 6 full-suite runs; even at idle it consumed 23.1-34.0% of its
 * budget. The cost is module-graph import work, and at module scope it is paid in vitest's
 * collect/import phase, which carries no per-test budget at all.
 *
 * `src/lib/__tests__/suite-hook-hygiene.test.ts` is the suite-wide gate that keeps this true.
 */
import { replayWorkflowRun } from "../actions"

/** The options bag `createWorkflowRun` was handed, or `undefined` if it was omitted entirely. */
function optionsPassed(): Record<string, unknown> | undefined {
  return mockCreateWorkflowRun.mock.calls[0]?.[3] as Record<string, unknown> | undefined
}

describe("replayWorkflowRun — the origin's dry-run flag is carried into the replay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: "user-1" } })
    mockCreateWorkflowRun.mockResolvedValue({ id: "run-replay" })
  })

  it("replaying a run whose dryRun is true produces a new run with dryRun also true", async () => {
    originRow.dryRun = true
    const result = await replayWorkflowRun("wf-1", "run-origin")

    expect(result).toEqual({ success: true, runId: "run-replay" })
    expect(
      optionsPassed()?.dryRun,
      "A replay of a TEST run must stay a TEST run. `createWorkflowRun` omitting the key lets the " +
        "`NOT NULL DEFAULT false` column promote a simulated run into a production one, from a page " +
        "the operator is reading as 'Test run'.",
    ).toBe(true)
  })

  it("still selects the dry_run column, so the flag cannot be read as undefined", async () => {
    originRow.dryRun = true
    await replayWorkflowRun("wf-1", "run-origin")

    expect(
      mockSelect.mock.calls[0]?.[0],
      "The projection is what the action can see. If `dryRun` is not in the select list the flag is " +
        "`undefined` at the call site whatever the row holds.",
    ).toHaveProperty("dryRun")
  })

  it("replaying a REAL run stays real — the flag is carried, not hardcoded", async () => {
    originRow.dryRun = false
    await replayWorkflowRun("wf-1", "run-origin")

    expect(
      optionsPassed()?.dryRun,
      "The recorded decision — a replay of a real run is a real run — must survive this fix.",
    ).toBe(false)
  })

  it("carries the origin id as replayedFromRunId alongside the flag", async () => {
    originRow.dryRun = true
    await replayWorkflowRun("wf-1", "run-origin")

    expect(optionsPassed()).toEqual({ dryRun: true, replayedFromRunId: "run-origin" })
  })

  it("refuses a non-failed origin before it builds anything, whatever its dryRun value", async () => {
    originRow.status = "completed"
    originRow.dryRun = true
    const result = await replayWorkflowRun("wf-1", "run-origin")

    expect(result).toEqual({ success: false, error: "Only failed runs can be replayed" })
    expect(mockCreateWorkflowRun).not.toHaveBeenCalled()
    originRow.status = "failed"
  })
})
