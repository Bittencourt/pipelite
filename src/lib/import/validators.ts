import { z } from "zod"
import type { ImportEntityType, ImportError, ImportWarning, ValidationResult } from "./types"

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

// ---------------------------------------------------------------------------
// Data normalization for JSON import
// ---------------------------------------------------------------------------

/**
 * Convert common snake_case and variant field names to the expected camelCase.
 */
const FIELD_NAME_ALIASES: Record<string, Record<string, string>> = {
  organization: {
    org_name: "name",
    organization_name: "name",
    web_site: "website",
  },
  person: {
    first_name: "firstName",
    firstname: "firstName",
    last_name: "lastName",
    lastname: "lastName",
    organization_name: "organizationName",
    org_name: "organizationName",
    email_address: "email",
    phone_number: "phone",
  },
  deal: {
    deal_title: "title",
    stage_name: "stageName",
    organization_name: "organizationName",
    org_name: "organizationName",
    person_email: "personEmail",
    expected_close_date: "expectedCloseDate",
    close_date: "expectedCloseDate",
  },
  activity: {
    type_name: "typeName",
    activity_type: "typeName",
    due_date: "dueDate",
    deal_title: "dealTitle",
  },
}

/**
 * Normalize import data field names and values.
 * Handles snake_case to camelCase, custom_ prefix stripping, and name splitting for people.
 */
export function normalizeImportData(
  data: Record<string, unknown>[],
  entityType: ImportEntityType
): Record<string, unknown>[] {
  const aliases = FIELD_NAME_ALIASES[entityType] ?? {}

  return data.map((row) => {
    const normalized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(row)) {
      // Strip custom_ prefix
      const cleanKey = key.startsWith("custom_") ? key : key

      // Convert snake_case to camelCase
      const camelKey = cleanKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

      // Check aliases first, then use camelCase version
      const resolvedKey = aliases[key.toLowerCase()] ?? aliases[camelKey.toLowerCase()] ?? camelKey

      // Normalize date values
      let normalizedValue = value
      if (value instanceof Date) {
        normalizedValue = value.toISOString()
      }
      // Convert null/undefined to empty string for consistency
      if (normalizedValue === null || normalizedValue === undefined) {
        normalizedValue = ""
      }

      normalized[resolvedKey] = normalizedValue
    }

    // Handle combined "name" field for people (split into firstName/lastName)
    if (
      entityType === "person" &&
      normalized.name &&
      typeof normalized.name === "string" &&
      !normalized.firstName
    ) {
      const parts = (normalized.name as string).trim().split(/\s+/)
      normalized.firstName = parts[0] || ""
      normalized.lastName = parts.slice(1).join(" ") || ""
      delete normalized.name
    }

    return normalized
  })
}
