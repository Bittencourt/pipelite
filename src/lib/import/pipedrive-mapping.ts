import type { ImportEntityType } from "./types"

// ---------------------------------------------------------------------------
// Pipedrive field name -> internal field name mapping
// ---------------------------------------------------------------------------

export const PIPEDRIVE_TO_INTERNAL_MAPPING: Record<
  ImportEntityType,
  Record<string, string>
> = {
  organization: {
    name: "name",
    address: "notes",
    website: "website",
    industry: "industry",
    notes: "notes",
    owner_name: "notes",
    label: "industry",
    visible_to: "",
    add_time: "",
    update_time: "",
    people_count: "",
    activities_count: "",
    done_activities_count: "",
    undone_activities_count: "",
  },
  person: {
    name: "_name_combined",
    first_name: "firstName",
    last_name: "lastName",
    email: "email",
    phone: "phone",
    org_name: "organizationName",
    organization: "organizationName",
    notes: "notes",
    label: "",
    owner_name: "",
    visible_to: "",
    add_time: "",
    update_time: "",
  },
  deal: {
    title: "title",
    value: "value",
    currency: "",
    stage_name: "stageName",
    pipeline: "",
    status: "",
    org_name: "organizationName",
    organization: "organizationName",
    person_name: "personEmail",
    person_email: "personEmail",
    expected_close_date: "expectedCloseDate",
    close_date: "expectedCloseDate",
    notes: "notes",
    won_time: "",
    lost_time: "",
    lost_reason: "notes",
    owner_name: "",
    label: "",
    visible_to: "",
    add_time: "",
    update_time: "",
    probability: "",
  },
  activity: {
    subject: "title",
    type: "typeName",
    due_date: "dueDate",
    due_time: "",
    duration: "",
    deal_title: "dealTitle",
    note: "notes",
    org_name: "",
    person_name: "",
    done: "",
    done_time: "",
    add_time: "",
    update_time: "",
    owner_name: "",
    busy_flag: "",
    location: "",
  },
}

// ---------------------------------------------------------------------------
// Fuzzy field matching
// ---------------------------------------------------------------------------

/**
 * Normalize a string for comparison: lowercase, strip underscores/dashes/spaces.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\-\s]+/g, "")
}

/**
 * Suggest field mappings for Pipedrive columns.
 * Returns a mapping from source column name to internal field name.
 * Unmapped columns get empty string.
 */
export function suggestFieldMapping(
  sourceColumns: string[],
  entityType: ImportEntityType
): Record<string, string> {
  const pipedriveMap = PIPEDRIVE_TO_INTERNAL_MAPPING[entityType]
  const mapping: Record<string, string> = {}

  for (const col of sourceColumns) {
    const normalizedCol = normalize(col)

    // 1. Direct match in Pipedrive mapping
    const directKey = Object.keys(pipedriveMap).find(
      (k) => normalize(k) === normalizedCol
    )
    if (directKey && pipedriveMap[directKey]) {
      mapping[col] = pipedriveMap[directKey]
      continue
    }

    // 2. Partial match: source contains known key or vice versa
    const partialKey = Object.keys(pipedriveMap).find(
      (k) =>
        (normalizedCol.includes(normalize(k)) ||
          normalize(k).includes(normalizedCol)) &&
        pipedriveMap[k]
    )
    if (partialKey && pipedriveMap[partialKey]) {
      mapping[col] = pipedriveMap[partialKey]
      continue
    }

    // 3. No match - empty string
    mapping[col] = ""
  }

  return mapping
}

// ---------------------------------------------------------------------------
// Data transformation
// ---------------------------------------------------------------------------

/**
 * Transform a Pipedrive data row into our internal format.
 */
export function transformPipedriveData(
  row: Record<string, unknown>,
  entityType: ImportEntityType
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  // Handle person name splitting
  if (entityType === "person" && row._name_combined) {
    const fullName = String(row._name_combined).trim()
    const parts = fullName.split(/\s+/)
    result.firstName = parts[0] || ""
    result.lastName = parts.slice(1).join(" ") || ""
  }

  for (const [key, value] of Object.entries(row)) {
    if (key === "_name_combined") continue // Already handled above

    // Convert date formats
    let transformed = value
    if (
      (key === "expectedCloseDate" || key === "dueDate") &&
      typeof value === "string" &&
      value
    ) {
      transformed = normalizeDateString(value)
    }

    // Convert currency values (strip symbols, commas)
    if (key === "value" && typeof value === "string" && value) {
      transformed = value.replace(/[^0-9.\-]/g, "")
    }

    if (transformed !== undefined && transformed !== null) {
      result[key] = transformed
    }
  }

  return result
}

/**
 * Normalize various date string formats to ISO format (YYYY-MM-DD).
 */
function normalizeDateString(dateStr: string): string {
  // Already ISO-like
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10)
  }
  // MM/DD/YYYY
  const mdyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdyMatch) {
    return `${mdyMatch[3]}-${mdyMatch[1].padStart(2, "0")}-${mdyMatch[2].padStart(2, "0")}`
  }
  // DD.MM.YYYY
  const dmyMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`
  }
  // Fall through - return as-is
  return dateStr
}

/**
 * Transform an array of Pipedrive data rows into internal format.
 * Applies field mapping and data transformations.
 */
export function transformPipedriveDataBatch(
  data: Record<string, string>[],
  fieldMapping: Record<string, string>,
  entityType: ImportEntityType
): Record<string, unknown>[] {
  return data.map((row) => {
    // First apply field mapping
    const mapped: Record<string, unknown> = {}
    for (const [sourceCol, targetField] of Object.entries(fieldMapping)) {
      if (targetField && row[sourceCol] !== undefined) {
        mapped[targetField] = row[sourceCol]
      }
    }

    // Then apply transformations
    return transformPipedriveData(mapped, entityType)
  })
}
