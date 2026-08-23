import { describe, it, expect } from "vitest"
import { serializeRun, serializeRunStep } from "../serialize"

describe("serializeRun", () => {
  it("converts WorkflowRun to snake_case with ISO timestamps", () => {
    const run = {
      id: "run-1",
      workflowId: "wf-1",
      status: "completed" as const,
      triggerData: { event: "deal.created" },
      error: null,
      depth: 0,
      context: {},
      currentNodeId: null,
      // `dry_run` IS emitted (WR-02): without it a test run is indistinguishable from a production
      // run to a machine consumer, which cannot even filter it out client-side.
      // `replayedFromRunId` is still deliberately NOT emitted — a diagnostic link with no API
      // consumer — which is why the exact-object expectation below is still exact.
      dryRun: false,
      replayedFromRunId: null,
      startedAt: new Date("2026-03-28T10:00:00Z"),
      completedAt: new Date("2026-03-28T10:00:02Z"),
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    const result = serializeRun(run)

    expect(result).toEqual({
      id: "run-1",
      workflow_id: "wf-1",
      status: "completed",
      trigger_data: { event: "deal.created" },
      error: null,
      depth: 0,
      dry_run: false,
      current_node_id: null,
      started_at: "2026-03-28T10:00:00.000Z",
      completed_at: "2026-03-28T10:00:02.000Z",
      created_at: "2026-03-28T10:00:00.000Z",
    })
  })

  it("marks a test run, so an integration can tell one from a production run", () => {
    const run = {
      id: "run-dry",
      workflowId: "wf-1",
      status: "failed" as const,
      triggerData: { trigger_type: "manual", trigger_id: "dry_run" },
      error: "HTTP 500",
      depth: 0,
      context: {},
      currentNodeId: null,
      dryRun: true,
      replayedFromRunId: null,
      startedAt: new Date("2026-03-28T10:00:00Z"),
      completedAt: new Date("2026-03-28T10:00:02Z"),
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    expect(
      serializeRun(run).dry_run,
      "A monitoring integration polling `?status=failed` counts an unmarked failed test run as a " +
        "production failure and pages someone. The flag is the only way it can tell."
    ).toBe(true)
  })

  it("does not expose replayed_from_run_id", () => {
    const run = {
      id: "run-replay",
      workflowId: "wf-1",
      status: "completed" as const,
      triggerData: null,
      error: null,
      depth: 0,
      context: {},
      currentNodeId: null,
      dryRun: false,
      replayedFromRunId: "run-origin",
      startedAt: null,
      completedAt: null,
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    expect(
      serializeRun(run),
      "The replay link is diagnostic and has no API consumer. WR-02 is about test runs being " +
        "indistinguishable from real ones; widening the public contract further is not part of it."
    ).not.toHaveProperty("replayed_from_run_id")
  })

  it("returns null for null timestamps", () => {
    const run = {
      id: "run-2",
      workflowId: "wf-1",
      status: "pending" as const,
      triggerData: null,
      error: null,
      depth: 0,
      context: {},
      currentNodeId: null,
      dryRun: false,
      replayedFromRunId: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    const result = serializeRun(run)

    expect(result.started_at).toBeNull()
    expect(result.completed_at).toBeNull()
    expect(result.created_at).toBe("2026-03-28T10:00:00.000Z")
  })
})

describe("serializeRunStep", () => {
  it("converts WorkflowRunStep to snake_case with ISO timestamps", () => {
    const step = {
      id: "step-1",
      runId: "run-1",
      nodeId: "node-abc",
      status: "completed" as const,
      input: { url: "https://example.com" },
      output: { status: 200 },
      error: null,
      resumeAt: null,
      startedAt: new Date("2026-03-28T10:00:00Z"),
      completedAt: new Date("2026-03-28T10:00:01Z"),
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    const result = serializeRunStep(step)

    expect(result).toEqual({
      id: "step-1",
      run_id: "run-1",
      node_id: "node-abc",
      status: "completed",
      input: { url: "https://example.com" },
      output: { status: 200 },
      error: null,
      resume_at: null,
      started_at: "2026-03-28T10:00:00.000Z",
      completed_at: "2026-03-28T10:00:01.000Z",
      created_at: "2026-03-28T10:00:00.000Z",
    })
  })

  it("serializes failed step with error message", () => {
    const step = {
      id: "step-2",
      runId: "run-1",
      nodeId: "node-xyz",
      status: "failed" as const,
      input: { url: "https://fail.com" },
      output: null,
      error: "HTTP 500: Internal Server Error",
      resumeAt: null,
      startedAt: new Date("2026-03-28T10:00:00Z"),
      completedAt: new Date("2026-03-28T10:00:00.500Z"),
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    const result = serializeRunStep(step)

    expect(result.error).toBe("HTTP 500: Internal Server Error")
    expect(result.status).toBe("failed")
  })

  it("serializes step with resume_at for delay nodes", () => {
    const step = {
      id: "step-3",
      runId: "run-1",
      nodeId: "delay-1",
      status: "waiting" as const,
      input: { delay: 300 },
      output: null,
      error: null,
      resumeAt: new Date("2026-03-28T10:05:00Z"),
      startedAt: new Date("2026-03-28T10:00:00Z"),
      completedAt: null,
      createdAt: new Date("2026-03-28T10:00:00Z"),
    }

    const result = serializeRunStep(step)

    expect(result.resume_at).toBe("2026-03-28T10:05:00.000Z")
    expect(result.completed_at).toBeNull()
  })
})
