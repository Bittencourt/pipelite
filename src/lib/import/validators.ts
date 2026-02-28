import { z } from "zod"
import type { ImportError, ImportWarning, ValidationResult } from "./types"

// --- Zod schemas for each entity type ---

export const organizationImportSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  website: z
    .string()
    .url("Invalid website URL")
    .optional()
    .or(z.literal("")),
  industry: z
    .string()
    .max(50, "Industry must be 50 characters or less")
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .max(2000, "Notes must be 2000 characters or less")
    .optional()
    .or(z.literal("")),
})

export const personImportSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z
    .string()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .max(30, "Phone must be 30 characters or less")
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .max(2000, "Notes must be 2000 characters or less")
    .optional()
    .or(z.literal("")),
  organizationName: z.string().optional().or(z.literal("")),
})

export const dealImportSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be 100 characters or less"),
  value: z.string().optional().or(z.literal("")),
  stageName: z.string().optional().or(z.literal("")),
  organizationName: z.string().optional().or(z.literal("")),
  personEmail: z.string().optional().or(z.literal("")),
  expectedCloseDate: z.string().optional().or(z.literal("")),
  notes: z
    .string()
    .max(2000, "Notes must be 2000 characters or less")
    .optional()
    .or(z.literal("")),
})

export const activityImportSchema = z.object({
  title: z.string().min(1, "Title is required"),
  typeName: z.string().optional().or(z.literal("")),
  dueDate: z.string().min(1, "Due date is required"),
  dealTitle: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
})

// Map entity types to their schemas
const schemaMap = {
  organization: organizationImportSchema,
  person: personImportSchema,
  deal: dealImportSchema,
  activity: activityImportSchema,
} as const

export type ImportEntitySchemaType = keyof typeof schemaMap

/**
 * Validate an array of import rows against a Zod schema.
 *
 * Returns all valid rows plus collected errors and warnings.
 * Rows are 1-indexed for user-facing display.
 */
export function validateImportData<T>(
  entityType: ImportEntitySchemaType,
  rows: Record<string, unknown>[],
  options?: {
    onProgress?: (current: number, total: number) => void
  }
): ValidationResult<T> {
  const schema = schemaMap[entityType]
  const errors: ImportError[] = []
  const warnings: ImportWarning[] = []
  const validData: T[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const result = schema.safeParse(row)

    // Report progress
    options?.onProgress?.(i + 1, rows.length)

    if (result.success) {
      validData.push(result.data as T)
    } else {
      // Collect all field-level errors for this row
      for (const issue of result.error.issues) {
        errors.push({
          row: i + 1, // 1-indexed
          field: issue.path.join(".") || "unknown",
          message: issue.message,
        })
      }
      // Still add raw data with null marker so preview can show it
      validData.push(row as T)
    }
  }

  return {
    valid: errors.length === 0,
    data: validData,
    errors,
    warnings,
  }
}
