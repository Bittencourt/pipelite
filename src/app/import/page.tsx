import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import type { FieldDefinition, ImportEntityType } from "@/lib/import/types"
import { ImportWizard } from "./import-wizard"

const ENTITY_TYPES: ImportEntityType[] = ["organization", "person", "deal", "activity"]

// Field types that can be meaningfully imported via CSV/JSON
const IMPORTABLE_FIELD_TYPES = new Set([
  "text", "number", "date", "boolean", "select", "multi_select", "url",
])

export default async function ImportPage() {
  // Fetch custom field definitions for all entity types so the mapping step
  // can offer them as target options.
  const customFieldsByEntity: Record<ImportEntityType, FieldDefinition[]> = {
    organization: [],
    person: [],
    deal: [],
    activity: [],
  }

  await Promise.all(
    ENTITY_TYPES.map(async (entityType) => {
      const defs = await getActiveFieldDefinitions(entityType)
      customFieldsByEntity[entityType] = defs
        .filter((d) => IMPORTABLE_FIELD_TYPES.has(d.type))
        .map((d) => ({
          // Prefix with "custom_" so the wizard/actions can distinguish them
          name: `custom_${d.name}`,
          label: d.name,
          required: d.required,
          type: "string" as const, // treat all custom fields as strings during import
          group: "custom" as const,
          fieldType: d.type, // carry actual DB type so wizard can coerce (e.g. multi_select → array)
        }))
    })
  )

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Import Data</h1>
        <p className="text-muted-foreground mt-1">
          Import organizations, people, deals, or activities from a CSV or JSON file.
        </p>
      </div>

      <ImportWizard customFieldsByEntity={customFieldsByEntity} />
    </div>
  )
}
