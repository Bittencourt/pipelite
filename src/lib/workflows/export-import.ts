import { z } from "zod"

// Secret detection: match header KEYS (not values) that typically hold secrets
const SECRET_HEADER_KEYS =
  /^(authorization|bearer|token|api[-_]?key|secret|x-api[-_]?key|x-token|password|x-secret)/i

export const workflowExportSchema = z.object({
  schemaVersion: z.literal("pipelite/v1"),
  name: z.string().min(1),
  description: z.string().nullable(),
  triggers: z.array(z.record(z.string(), z.unknown())),
  nodes: z.array(z.record(z.string(), z.unknown())),
})

export type WorkflowExport = z.infer<typeof workflowExportSchema>

/**
 * Replace values of secret-bearing header keys with a placeholder.
 * Does not mutate the input object.
 */
export function stripSecrets(
  headers: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    result[key] = SECRET_HEADER_KEYS.test(key) ? "{{PLACEHOLDER}}" : value
  }
  return result
}

/**
 * Serialize a workflow for export, stripping secrets from HTTP node headers.
 */
export function serializeWorkflowForExport(workflow: {
  name: string
  description: string | null
  triggers: Record<string, unknown>[]
  nodes: Record<string, unknown>[]
}): WorkflowExport {
  // Deep-clone nodes to avoid mutating originals
  const cleanedNodes: Record<string, unknown>[] = JSON.parse(
    JSON.stringify(workflow.nodes)
  )

  // Walk each node: if it has config.headers, strip secrets
  for (const node of cleanedNodes) {
    const config = node.config as Record<string, unknown> | undefined
    if (config && typeof config === "object" && config.headers) {
      const headers = config.headers as Record<string, string>
      if (typeof headers === "object" && headers !== null) {
        config.headers = stripSecrets(headers)
      }
    }
  }

  return {
    schemaVersion: "pipelite/v1",
    name: workflow.name,
    description: workflow.description,
    triggers: workflow.triggers,
    nodes: cleanedNodes,
  }
}

const KNOWN_NODE_TYPES = new Set(["action", "condition", "delay"])
const KNOWN_ACTION_TYPES = new Set([
  "http",
  "crm",
  "email",
  "notification",
  "transform",
  "webhook-response",
])

/**
 * Validate imported workflow data against the pipelite/v1 schema.
 */
export function validateWorkflowImport(
  data: unknown
): { valid: true; data: WorkflowExport } | { valid: false; error: string } {
  if (typeof data !== "object" || data === null) {
    return {
      valid: false,
      error: "Invalid file: The selected file is not valid JSON.",
    }
  }

  const parsed = workflowExportSchema.safeParse(data)
  if (!parsed.success) {
    return {
      valid: false,
      error:
        "Incompatible workflow: This file was not exported from Pipelite or uses an unsupported version.",
    }
  }

  // Validate node types
  for (const node of parsed.data.nodes) {
    const nodeType = node.type as string | undefined
    if (nodeType && !KNOWN_NODE_TYPES.has(nodeType)) {
      return {
        valid: false,
        error:
          "Incompatible workflow: This file contains unsupported node types.",
      }
    }

    // Validate action types for action nodes
    if (nodeType === "action") {
      const actionType = node.actionType as string | undefined
      if (actionType && !KNOWN_ACTION_TYPES.has(actionType)) {
        return {
          valid: false,
          error:
            "Incompatible workflow: This file contains unsupported node types.",
        }
      }
    }
  }

  return { valid: true, data: parsed.data }
}

/**
 * Slugify a name for use as a filename.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}
