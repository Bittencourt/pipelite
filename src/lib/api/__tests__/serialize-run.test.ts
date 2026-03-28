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
      current_node_id: null,
      started_at: "2026-03-28T10:00:00.000Z",
      completed_at: "2026-03-28T10:00:02.000Z",
      created_at: "2026-03-28T10:00:00.000Z",
    })
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
