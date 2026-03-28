import { NextRequest } from "next/server"
import { withApiAuth, ApiAuthContext } from "@/lib/api/auth"
import { singleResponse, noContentResponse } from "@/lib/api/response"
import { Problems } from "@/lib/api/errors"
import { serializeWorkflowTemplate } from "@/lib/api/serialize"
import {
  getWorkflowTemplate,
  deleteWorkflowTemplate,
} from "@/lib/mutations/workflow-templates"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params
    const template = await getWorkflowTemplate(id)
    if (!template) {
      return Problems.notFound("Workflow template")
    }
    return singleResponse(serializeWorkflowTemplate(template))
  })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {
    const { id } = await params
    const result = await deleteWorkflowTemplate(id)
    if (!result.success) {
      return Problems.notFound("Workflow template")
    }
    return noContentResponse()
  })
}
