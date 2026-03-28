"use server"

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { eq, and } from "drizzle-orm"
import { workflows, workflowRuns } from "@/db/schema/workflows"
import {
  createWorkflow as createWorkflowMutation,
  updateWorkflow as updateWorkflowMutation,
  deleteWorkflow as deleteWorkflowMutation,
} from "@/lib/mutations/workflows"

export async function createWorkflow(data: {
  name: string
  description?: string | null
  trigger?: Record<string, unknown>
  nodes?: Record<string, unknown>[]
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await createWorkflowMutation({
    ...data,
    createdBy: session.user.id,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  revalidatePath("/workflows")
  return { success: true, id: result.id }
}

export async function updateWorkflow(
  id: string,
  data: {
    name?: string
    description?: string | null
    trigger?: Record<string, unknown>
    nodes?: Record<string, unknown>[]
    active?: boolean
  }
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await updateWorkflowMutation(id, data)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  revalidatePath("/workflows")
  return { success: true }
}

export async function deleteWorkflow(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const result = await deleteWorkflowMutation(id)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  revalidatePath("/workflows")
  return { success: true }
}

export async function toggleWorkflow(
  id: string,
  active: boolean
): Promise<{ success: true; cancelledRuns: number } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  // Verify workflow exists
  const existing = await db.select().from(workflows).where(eq(workflows.id, id))
  if (existing.length === 0) {
    return { success: false, error: "Workflow not found" }
  }

  // Update active flag
  await db
    .update(workflows)
    .set({ active, updatedAt: new Date() })
    .where(eq(workflows.id, id))

  let cancelledRuns = 0

  // If disabling, cancel all waiting runs
  if (!active) {
    const cancelled = await db
      .update(workflowRuns)
      .set({
        status: "failed",
        error: "Workflow disabled while waiting",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(workflowRuns.workflowId, id),
          eq(workflowRuns.status, "waiting")
        )
      )
      .returning()

    cancelledRuns = cancelled.length
  }

  revalidatePath("/workflows")
  return { success: true, cancelledRuns }
}
