import Papa from "papaparse"
import type { ExportEntityType } from "./types"

// ---------------------------------------------------------------------------
// Pipedrive field mappings (our field name -> Pipedrive field name)
// ---------------------------------------------------------------------------

export const PIPEDRIVE_FIELD_MAPPING: Record<
  ExportEntityType,
  Record<string, string>
> = {
  organization: {
    name: "name",
    website: "website",
    industry: "industry",
    notes: "notes",
    ownerName: "owner_name",
  },
  person: {
    // firstName + lastName are combined into "name"
    email: "email",
    phone: "phone",
    organizationName: "org_name",
    notes: "notes",
    ownerName: "owner_name",
  },
  deal: {
    title: "title",
    value: "value",
    stageName: "stage_name",
    organizationName: "org_name",
    personName: "person_name",
    expectedCloseDate: "expected_close_date",
    notes: "notes",
    ownerName: "owner_name",
  },
  activity: {
    title: "subject",
    typeName: "type",
    dueDate: "due_date",
    completedAt: "done_time",
    dealTitle: "deal_title",
    notes: "note",
    ownerName: "owner_name",
  },
}

// Fields to remove from Pipedrive export (internal fields that Pipedrive reassigns)
const INTERNAL_FIELDS = new Set([
  "id",
  "ownerId",
  "createdAt",
  "updatedAt",
  "stageId",
  "organizationId",
  "personId",
  "typeId",
  "dealId",
  "firstName",
  "lastName",
])

// ---------------------------------------------------------------------------
// Format conversion
// ---------------------------------------------------------------------------

function formatDateForPipedrive(value: unknown): string {
  if (!value || value === "") return ""
  const str = String(value)
  // Already ISO or similar -- extract YYYY-MM-DD
  if (str.length >= 10) {
    return str.slice(0, 10)
  }
  return str
}

export function toPipedriveFormat(
  data: Record<string, unknown>[],
  entityType: ExportEntityType
): Record<string, unknown>[] {
  const mapping = PIPEDRIVE_FIELD_MAPPING[entityType]

  return data.map((row) => {
    const result: Record<string, unknown> = {}

    // For people, combine firstName + lastName into "name"
    if (entityType === "person") {
      const first = row.firstName ?? ""
      const last = row.lastName ?? ""
      result.name = `${first} ${last}`.trim()
    }

    // Apply field mapping
    for (const [ourField, pipedriveField] of Object.entries(mapping)) {
      if (ourField in row) {
        let value = row[ourField]

        // Format date fields for Pipedrive (YYYY-MM-DD)
        if (
          ourField === "expectedCloseDate" ||
          ourField === "dueDate" ||
          ourField === "completedAt"
        ) {
          value = formatDateForPipedrive(value)
        }

        result[pipedriveField] = value
      }
    }

    // Include custom fields (custom_ prefixed fields pass through)
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith("custom_")) {
        result[key] = value
      }
    }

    return result
  })
}

// ---------------------------------------------------------------------------
// Pipedrive CSV export
// ---------------------------------------------------------------------------

export function exportToPipedriveCSV(
  data: Record<string, unknown>[],
  entityType: ExportEntityType
): string {
  const pipedriveData = toPipedriveFormat(data, entityType)
  return Papa.unparse(pipedriveData, { header: true })
}
