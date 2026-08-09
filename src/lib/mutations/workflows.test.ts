import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the db module before importing the module under test
vi.mock("@/db", () => {
  const mockDb = {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    query: {
      workflows: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
  }
  return { db: mockDb }
})

import { db } from "@/db"
import {
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getWorkflow,
  listWorkflows,
} from "./workflows"

const mockDb = db as unknown as {
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  query: {
    workflows: {
      findFirst: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createWorkflow", () => {
  it("creates workflow with valid input and returns success", async () => {
    const mockWorkflow = {
      id: "wf-1",
      name: "Test Workflow",
      description: null,
      triggers: [],
      nodes: [],
      active: false,
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockWorkflow]),
      }),
    })

    const result = await createWorkflow({
      name: "Test Workflow",
      createdBy: "user-1",
    })

    expect(result).toEqual({
      success: true,
      id: "wf-1",
      workflow: mockWorkflow,
    })
  })

  it("returns error when name is empty", async () => {
    const result = await createWorkflow({
      name: "",
      createdBy: "user-1",
    })

    expect(result.success).toBe(false)
    expect(result).toHaveProperty("error")
  })

  it("returns error when name exceeds 200 chars", async () => {
    const result = await createWorkflow({
      name: "x".repeat(201),
      createdBy: "user-1",
    })

    expect(result.success).toBe(false)
    expect(result).toHaveProperty("error")
  })

  it("rejects action node with structurally invalid config", async () => {
    const result = await createWorkflow({
      name: "Bad Workflow",
      createdBy: "user-1",
      nodes: [
        {
          id: "node-1",
          type: "action",
          label: "call api",
          // No method/url keys at all — the old bare default shape
          config: { actionType: "http_request" },
          nextNodeId: null,
        },
      ],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("node-1")
      expect(result.error).toContain("call api")
    }
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects action node with unknown action type", async () => {
    const result = await createWorkflow({
      name: "Bad Workflow",
      createdBy: "user-1",
      nodes: [
        {
          id: "node-1",
          type: "action",
          label: "mystery",
          config: { actionType: "does_not_exist" },
          nextNodeId: null,
        },
      ],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("Unknown action type")
    }
  })

  it("saves workflow with fully configured action node", async () => {
    const nodes = [
      {
        id: "node-1",
        type: "action",
        label: "call api",
        config: {
          actionType: "http_request",
          method: "POST",
          url: "https://example.com/hook",
          timeout: 30,
          retryCount: 1,
        },
        nextNodeId: null,
      },
    ]
    const mockWorkflow = { id: "wf-1", name: "Good Workflow", nodes }

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockWorkflow]),
      }),
    })

    const result = await createWorkflow({
      name: "Good Workflow",
      createdBy: "user-1",
      nodes,
    })

    expect(result.success).toBe(true)
  })

  it("saves unconfigured draft node with structurally valid empty defaults", async () => {
    // Matches the default config createNewNode now produces: keys present,
    // values safe-empty. Save must not be blocked for a brand-new node.
    const nodes = [
      {
        id: "node-1",
        type: "action",
        label: "http request",
        config: {
          actionType: "http_request",
          method: "GET",
          url: "",
          timeout: 30,
          retryCount: 0,
        },
        nextNodeId: null,
      },
    ]
    const mockWorkflow = { id: "wf-1", name: "Draft", nodes }

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockWorkflow]),
      }),
    })

    const result = await createWorkflow({
      name: "Draft",
      createdBy: "user-1",
      nodes,
    })

    expect(result.success).toBe(true)
  })

  it("ignores non-action node types during config validation", async () => {
    const nodes = [
      {
        id: "node-1",
        type: "condition",
        label: "check",
        config: { groups: [], logicOperator: "and" },
        nextNodeId: null,
        trueBranch: null,
        falseBranch: null,
      },
      {
        id: "node-2",
        type: "split",
        label: "Split",
        config: {},
        nextNodeId: null,
        branchA: null,
        branchB: null,
      },
    ]
    const mockWorkflow = { id: "wf-1", name: "No Actions", nodes }

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockWorkflow]),
      }),
    })

    const result = await createWorkflow({
      name: "No Actions",
      createdBy: "user-1",
      nodes,
    })

    expect(result.success).toBe(true)
  })
})

describe("updateWorkflow", () => {
  it("updates provided fields and sets updatedAt", async () => {
    const existing = {
      id: "wf-1",
      name: "Old Name",
      description: null,
      triggers: [],
      nodes: [],
      active: false,
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const updated = { ...existing, name: "New Name", updatedAt: new Date() }

    mockDb.query.workflows.findFirst.mockResolvedValue(existing)
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    })

    const result = await updateWorkflow("wf-1", { name: "New Name" })

    expect(result).toEqual({ success: true, workflow: updated })
  })

  it("returns error for non-existent workflow", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue(undefined)

    const result = await updateWorkflow("wf-nonexistent", { name: "New Name" })

    expect(result.success).toBe(false)
    expect(result).toHaveProperty("error")
  })

  it("rejects update with structurally invalid action node config", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue({
      id: "wf-1",
      name: "Workflow",
      triggers: [],
      nodes: [],
      active: false,
      nextRunAt: null,
    })

    const result = await updateWorkflow("wf-1", {
      nodes: [
        {
          id: "node-9",
          type: "action",
          label: "send mail",
          // recipients has the wrong type entirely
          config: { actionType: "email", recipients: "not-an-array" },
          nextNodeId: null,
        },
      ],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("node-9")
    }
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

describe("updateWorkflow nextRunAt scheduling", () => {
  const intervalTrigger = {
    type: "schedule",
    mode: "interval",
    intervalMinutes: 60,
  }

  function mockUpdateCapture() {
    const setSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "wf-1" }]),
      }),
    })
    mockDb.update.mockReturnValue({ set: setSpy })
    return setSpy
  }

  it("does not reset nextRunAt when triggers are sent but unchanged", async () => {
    const existingNextRun = new Date(Date.now() + 5 * 60_000)
    mockDb.query.workflows.findFirst.mockResolvedValue({
      id: "wf-1",
      name: "Scheduled",
      triggers: [intervalTrigger],
      nodes: [],
      active: true,
      nextRunAt: existingNextRun,
    })
    const setSpy = mockUpdateCapture()

    // Editor-style save: same triggers, same active flag
    const result = await updateWorkflow("wf-1", {
      name: "Scheduled (renamed)",
      triggers: [{ ...intervalTrigger }],
      active: true,
    })

    expect(result.success).toBe(true)
    const updates = setSpy.mock.calls[0][0]
    expect(updates).not.toHaveProperty("nextRunAt")
  })

  it("seeds nextRunAt on activation", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue({
      id: "wf-1",
      name: "Scheduled",
      triggers: [intervalTrigger],
      nodes: [],
      active: false,
      nextRunAt: null,
    })
    const setSpy = mockUpdateCapture()

    const before = Date.now()
    const result = await updateWorkflow("wf-1", { active: true })
    const after = Date.now()

    expect(result.success).toBe(true)
    const updates = setSpy.mock.calls[0][0]
    expect(updates.nextRunAt).toBeInstanceOf(Date)
    expect(updates.nextRunAt.getTime()).toBeGreaterThanOrEqual(before + 60 * 60_000)
    expect(updates.nextRunAt.getTime()).toBeLessThanOrEqual(after + 60 * 60_000)
  })

  it("clears nextRunAt on deactivation", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue({
      id: "wf-1",
      name: "Scheduled",
      triggers: [intervalTrigger],
      nodes: [],
      active: true,
      nextRunAt: new Date(),
    })
    const setSpy = mockUpdateCapture()

    const result = await updateWorkflow("wf-1", { active: false })

    expect(result.success).toBe(true)
    const updates = setSpy.mock.calls[0][0]
    expect(updates).toHaveProperty("nextRunAt", null)
  })

  it("recomputes nextRunAt when the schedule config actually changes", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue({
      id: "wf-1",
      name: "Scheduled",
      triggers: [intervalTrigger],
      nodes: [],
      active: true,
      nextRunAt: new Date(Date.now() + 55 * 60_000),
    })
    const setSpy = mockUpdateCapture()

    const result = await updateWorkflow("wf-1", {
      triggers: [{ type: "schedule", mode: "interval", intervalMinutes: 5 }],
      active: true,
    })

    expect(result.success).toBe(true)
    const updates = setSpy.mock.calls[0][0]
    expect(updates.nextRunAt).toBeInstanceOf(Date)
    // Recomputed from the new 5-minute interval, not the old 60
    expect(updates.nextRunAt.getTime()).toBeLessThanOrEqual(Date.now() + 6 * 60_000)
  })

  it("backfills nextRunAt for an active scheduled workflow missing it", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue({
      id: "wf-1",
      name: "Scheduled",
      triggers: [intervalTrigger],
      nodes: [],
      active: true,
      nextRunAt: null,
    })
    const setSpy = mockUpdateCapture()

    const result = await updateWorkflow("wf-1", { name: "Renamed" })

    expect(result.success).toBe(true)
    const updates = setSpy.mock.calls[0][0]
    expect(updates.nextRunAt).toBeInstanceOf(Date)
  })
})

describe("deleteWorkflow", () => {
  it("deletes existing workflow", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue({ id: "wf-1" })
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    })

    const result = await deleteWorkflow("wf-1")

    expect(result).toEqual({ success: true })
  })

  it("returns error for non-existent workflow", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue(undefined)

    const result = await deleteWorkflow("wf-nonexistent")

    expect(result.success).toBe(false)
    expect(result).toHaveProperty("error")
  })
})

describe("getWorkflow", () => {
  it("returns workflow by ID", async () => {
    const mockWorkflow = { id: "wf-1", name: "Test" }
    mockDb.query.workflows.findFirst.mockResolvedValue(mockWorkflow)

    const result = await getWorkflow("wf-1")

    expect(result).toEqual(mockWorkflow)
  })

  it("returns null for non-existent workflow", async () => {
    mockDb.query.workflows.findFirst.mockResolvedValue(undefined)

    const result = await getWorkflow("wf-nonexistent")

    expect(result).toBeNull()
  })
})

describe("listWorkflows", () => {
  it("returns paginated results", async () => {
    const mockWorkflows = [
      { id: "wf-1", name: "Workflow 1" },
      { id: "wf-2", name: "Workflow 2" },
    ]

    mockDb.query.workflows.findMany.mockResolvedValue(mockWorkflows)
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue([{ total: 2 }]),
      }),
    })

    const result = await listWorkflows({ offset: 0, limit: 50 })

    expect(result).toEqual({
      workflows: mockWorkflows,
      total: 2,
    })
  })

  it("scopes the query to the owner when createdBy is provided", async () => {
    mockDb.query.workflows.findMany.mockResolvedValue([])
    const whereSpy = vi.fn().mockReturnValue([{ total: 0 }])
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: whereSpy }),
    })

    await listWorkflows({ offset: 0, limit: 50, createdBy: "user-1" })

    // Count query filtered by owner...
    expect(whereSpy).toHaveBeenCalledWith(expect.anything())
    // ...and the row query too (a defined `where` means the owner filter applied).
    expect(mockDb.query.workflows.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() })
    )
  })
})
