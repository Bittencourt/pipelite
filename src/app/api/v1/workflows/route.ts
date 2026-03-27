import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeWorkflow } from "@/lib/api/serialize"
import { createWorkflow, listWorkflows } from "@/lib/mutations/workflows"
import { z } from "zod"

const createWorkflowApiSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  trigger: z.record(z.string(), z.unknown()).optional().default({}),
  nodes: z.array(z.record(z.string(), z.unknown())).optional().default([]),
})

export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)

    const result = await listWorkflows({ offset, limit })

    const data = result.workflows.map(serializeWorkflow)

    return paginatedResponse(data, result.total, offset, limit)
  })
}

export async function POST(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    let body
    try {
      body = await req.json()
    } catch {
      return Problems.validation([
        { field: "body", code: "invalid_json", message: "Invalid JSON body" },
      ])
    }

    const parseResult = createWorkflowApiSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }

    const { name, description, trigger, nodes } = parseResult.data

    const result = await createWorkflow({
      name,
      description: description ?? undefined,
      trigger,
      nodes,
      createdBy: context.userId,
    })

    if (!result.success) {
      return Problems.validation([
        { field: "body", code: "mutation_error", message: result.error },
      ])
    }

    return createdResponse(serializeWorkflow(result.workflow))
  })
}
