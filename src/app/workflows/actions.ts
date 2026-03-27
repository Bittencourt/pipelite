"use server"

import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
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
