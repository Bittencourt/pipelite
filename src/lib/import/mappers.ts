import type { ImportEntityType, FieldDefinition, FieldMapping } from "./types"

// --- Target field definitions per entity type ---

const ORGANIZATION_FIELDS: FieldDefinition[] = [
  { name: "name", label: "Name", required: true, type: "string" },
  { name: "website", label: "Website", required: false, type: "url" },
  { name: "industry", label: "Industry", required: false, type: "string" },
  { name: "notes", label: "Notes", required: false, type: "text" },
]

const PERSON_FIELDS: FieldDefinition[] = [
  { name: "firstName", label: "First Name", required: true, type: "string" },
  { name: "lastName", label: "Last Name", required: true, type: "string" },
  { name: "email", label: "Email", required: false, type: "email" },
  { name: "phone", label: "Phone", required: false, type: "string" },
  { name: "notes", label: "Notes", required: false, type: "text" },
  { name: "organizationName", label: "Organization Name", required: false, type: "string" },
]

const DEAL_FIELDS: FieldDefinition[] = [
  { name: "title", label: "Title", required: true, type: "string" },
  { name: "value", label: "Value", required: false, type: "number" },
  { name: "stageName", label: "Stage Name", required: false, type: "string" },
  { name: "organizationName", label: "Organization Name", required: false, type: "string" },
  { name: "personEmail", label: "Person Email", required: false, type: "email" },
  { name: "expectedCloseDate", label: "Expected Close Date", required: false, type: "date" },
  { name: "notes", label: "Notes", required: false, type: "text" },
]

const ACTIVITY_FIELDS: FieldDefinition[] = [
  { name: "title", label: "Title", required: true, type: "string" },
  { name: "typeName", label: "Activity Type", required: false, type: "string" },
  { name: "dueDate", label: "Due Date", required: true, type: "date" },
  { name: "dealTitle", label: "Deal Title", required: false, type: "string" },
  { name: "notes", label: "Notes", required: false, type: "text" },
]

/**
 * All target fields indexed by entity type.
 */
export const TARGET_FIELDS: Record<ImportEntityType, FieldDefinition[]> = {
  organization: ORGANIZATION_FIELDS,
  person: PERSON_FIELDS,
  deal: DEAL_FIELDS,
  activity: ACTIVITY_FIELDS,
}

/**
 * Get the target field definitions for an entity type.
 */
export function getTargetFields(entityType: ImportEntityType): FieldDefinition[] {
  return TARGET_FIELDS[entityType]
}

/**
 * Auto-suggest field mappings based on column name similarity.
 * Returns a mapping from source column -> target field name or null.
 */
export function autoSuggestMapping(
  sourceColumns: string[],
  entityType: ImportEntityType
): FieldMapping {
  const targets = TARGET_FIELDS[entityType]
  const mapping: FieldMapping = {}

  for (const col of sourceColumns) {
    const normalized = col.toLowerCase().replace(/[_\-\s]+/g, "")

    // Try exact match on field name
    const exactMatch = targets.find(
      (t) => t.name.toLowerCase() === normalized
    )
    if (exactMatch) {
      mapping[col] = exactMatch.name
      continue
    }

    // Try matching on label
    const labelMatch = targets.find(
      (t) => t.label.toLowerCase().replace(/\s+/g, "") === normalized
    )
    if (labelMatch) {
      mapping[col] = labelMatch.name
      continue
    }

    // Try partial/contains matching
    const partialMatch = targets.find(
      (t) =>
        normalized.includes(t.name.toLowerCase()) ||
        t.name.toLowerCase().includes(normalized)
    )
    if (partialMatch) {
      mapping[col] = partialMatch.name
      continue
    }

    // No match found
    mapping[col] = null
  }

  return mapping
}

/**
 * Apply a field mapping to a raw CSV row.
 * Maps source columns to target field names, skipping unmapped (null) fields.
 */
export function applyFieldMapping(
  row: Record<string, string>,
  mapping: FieldMapping
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [sourceCol, targetField] of Object.entries(mapping)) {
    if (targetField && row[sourceCol] !== undefined) {
      result[targetField] = row[sourceCol]
    }
  }

  return result
}
