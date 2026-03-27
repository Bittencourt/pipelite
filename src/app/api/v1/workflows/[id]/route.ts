import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeWorkflow } from "@/lib/api/serialize"
import { getWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/mutations/workflows"
import { z } from "zod"

const updateWorkflowApiSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  trigger: z.record(z.string(), z.unknown()).optional(),
  nodes: z.array(z.record(z.string(), z.unknown())).optional(),
  active: z.boolean().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params

    const workflow = await getWorkflow(id)

    if (!workflow) {
      return Problems.notFound("Workflow")
    }

    return singleResponse(serializeWorkflow(workflow))
  })
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
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

    const result = await updateWorkflow(id, parseResult.data)

    if (!result.success) {
      return Problems.notFound("Workflow")
    }

    return singleResponse(serializeWorkflow(result.workflow))
  })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params

    const result = await deleteWorkflow(id)

    if (!result.success) {
      return Problems.notFound("Workflow")
    }

    return noContentResponse()
  })
}
