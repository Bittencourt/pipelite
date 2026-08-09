import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeWorkflow } from "@/lib/api/serialize"
import { getWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/mutations/workflows"
import { triggersArraySchema } from "@/lib/triggers/types"
import { z } from "zod"

const updateWorkflowApiSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  triggers: triggersArraySchema.optional(),
  nodes: z.array(z.record(z.string(), z.unknown())).optional(),
  active: z.boolean().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      const { id } = await params

      // Scope by owner: a non-owner gets 404 (not another user's workflow).
      const workflow = await getWorkflow(id, context.userId)

      if (!workflow) {
        return Problems.notFound("Workflow")
      }

      return singleResponse(serializeWorkflow(workflow))
    } catch (error) {
      console.error("GET /api/v1/workflows/[id] failed:", error)
      return Problems.internalError()
    }
  })
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      const { id } = await params

      let body
      try {
        body = await req.json()
      } catch {
        return Problems.validation([
          { field: "body", code: "invalid_json", message: "Invalid JSON body" },
        ])
      }

      const parseResult = updateWorkflowApiSchema.safeParse(body)
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
          message: issue.message,
        }))
        return Problems.validation(errors)
      }

      // Ownership gate: reject updates to workflows the caller doesn't own.
      const owned = await getWorkflow(id, context.userId)
      if (!owned) {
        return Problems.notFound("Workflow")
      }

      const result = await updateWorkflow(id, parseResult.data)

      if (!result.success) {
        return Problems.notFound("Workflow")
      }

      return singleResponse(serializeWorkflow(result.workflow))
    } catch (error) {
      console.error("PUT /api/v1/workflows/[id] failed:", error)
      return Problems.internalError()
    }
  })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    try {
      const { id } = await params

      // Ownership gate: reject deletes of workflows the caller doesn't own.
      const owned = await getWorkflow(id, context.userId)
      if (!owned) {
        return Problems.notFound("Workflow")
      }

      const result = await deleteWorkflow(id)

      if (!result.success) {
        return Problems.notFound("Workflow")
      }

      return noContentResponse()
    } catch (error) {
      console.error("DELETE /api/v1/workflows/[id] failed:", error)
      return Problems.internalError()
    }
  })
}
