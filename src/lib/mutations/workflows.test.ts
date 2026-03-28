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
      from: vi.fn().mockReturnValue([{ total: 2 }]),
    })

    const result = await listWorkflows({ offset: 0, limit: 50 })

    expect(result).toEqual({
      workflows: mockWorkflows,
      total: 2,
    })
  })
})
