import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { parsePagination } from "@/lib/api/pagination"
import { paginatedResponse, createdResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeWorkflowTemplate } from "@/lib/api/serialize"
import {
  createWorkflowTemplate,
  listWorkflowTemplates,
  createWorkflowTemplateSchema,
} from "@/lib/mutations/workflow-templates"

export async function GET(request: NextRequest) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { offset, limit } = parsePagination(req)
    const result = await listWorkflowTemplates({ offset, limit })
    const data = result.templates.map(serializeWorkflowTemplate)
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
    const parseResult = createWorkflowTemplateSchema.safeParse(body)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        code: issue.code,
        message: issue.message,
      }))
      return Problems.validation(errors)
    }
    const result = await createWorkflowTemplate(parseResult.data)
    if (!result.success) {
      return Problems.validation([
        { field: "body", code: "mutation_error", message: result.error },
      ])
    }
    return createdResponse(serializeWorkflowTemplate(result.template))
  })
}
