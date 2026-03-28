import { describe, it, expect } from "vitest"
import { serializeRun, serializeRunStep } from "../serialize"

const mockRun = {
  id: "run-1",
  workflowId: "wf-1",
  status: "completed" as const,
  triggerData: { type: "manual" },
  error: null,
  depth: 0,
  context: {},
  currentNodeId: null,
  startedAt: new Date("2026-01-01T10:00:00Z"),
  completedAt: new Date("2026-01-01T10:00:05Z"),
  createdAt: new Date("2026-01-01T10:00:00Z"),
}

const mockStep = {
  id: "step-1",
  runId: "run-1",
  nodeId: "node-1",
  status: "completed" as const,
  input: { deal: { name: "Test" } },
  output: { result: "ok" },
  error: null,
  resumeAt: null,
  startedAt: new Date("2026-01-01T10:00:01Z"),
  completedAt: new Date("2026-01-01T10:00:02Z"),
  createdAt: new Date("2026-01-01T10:00:01Z"),
}

describe("serializeRun", () => {
  it("converts camelCase fields to snake_case", () => {
    const result = serializeRun(mockRun)
    expect(result).toHaveProperty("workflow_id", "wf-1")
    expect(result).toHaveProperty("trigger_data")
    expect(result).toHaveProperty("current_node_id")
    expect(result).toHaveProperty("started_at")
    expect(result).toHaveProperty("completed_at")
    expect(result).toHaveProperty("created_at")
  })

  it("converts Date fields to ISO strings", () => {
    const result = serializeRun(mockRun)
    expect(typeof result.started_at).toBe("string")
    expect(result.started_at).toBe("2026-01-01T10:00:00.000Z")
    expect(result.completed_at).toBe("2026-01-01T10:00:05.000Z")
    expect(result.created_at).toBe("2026-01-01T10:00:00.000Z")
  })

  it("handles null dates", () => {
    const runWithNulls = {
      ...mockRun,
      startedAt: null,
      completedAt: null,
    }
    const result = serializeRun(runWithNulls)
    expect(result.started_at).toBeNull()
    expect(result.completed_at).toBeNull()
  })
})

describe("serializeRunStep", () => {
  it("converts step camelCase fields to snake_case", () => {
    const result = serializeRunStep(mockStep)
    expect(result).toHaveProperty("run_id", "run-1")
    expect(result).toHaveProperty("node_id", "node-1")
    expect(result).toHaveProperty("resume_at")
    expect(result).toHaveProperty("started_at")
    expect(result).toHaveProperty("completed_at")
    expect(result).toHaveProperty("created_at")
  })

  it("preserves input and output as-is", () => {
    const result = serializeRunStep(mockStep)
    expect(result.input).toEqual(mockStep.input)
    expect(result.output).toEqual(mockStep.output)
  })
})
