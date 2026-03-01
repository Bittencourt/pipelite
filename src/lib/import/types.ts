// Import wizard step types
export type ImportStep = "upload" | "mapping" | "preview" | "confirm"

// Supported entity types for import
export type ImportEntityType = "organization" | "person" | "deal" | "activity"

// Progress phases during import process
export type ImportPhase = "parsing" | "validating" | "importing"

// Progress indicator for parsing, validating, and importing
export interface ImportProgress {
  phase: ImportPhase
  current: number
  total: number
  percentage: number
}

// Warning types for auto-created entities
export type ImportWarningType =
  | "auto_create_org"
  | "auto_create_person"
  | "stage_fallback"
  | "type_fallback"
  | "deal_not_found"

// Warning for a specific row during import
export interface ImportWarning {
  row: number
  type: ImportWarningType
  message: string
}

// Import validation error for a specific row/field
export interface ImportError {
  row: number
  field: string
  message: string
}

// Result of CSV parsing
export interface ParseResult<T> {
  data: T[]
  errors: Array<{ row: number; message: string }>
  meta: {
    fields: string[]
    rowCount: number
  }
}

// Result of data validation
export interface ValidationResult<T> {
  valid: boolean
  data: T[]
  errors: ImportError[]
  warnings: ImportWarning[]
}

// Field definition for mapping
export interface FieldDefinition {
  name: string
  label: string
  required: boolean
  type: "string" | "number" | "email" | "url" | "date" | "text"
  group?: "custom"
  /** For custom fields: the actual DB field type (e.g. "multi_select") */
  fieldType?: string
}

// Column mapping from source to target
export type FieldMapping = Record<string, string | null>

// Full import wizard state
export interface ImportState {
  step: ImportStep
  entityType: ImportEntityType
  rawData: Record<string, string>[]
  sourceColumns: string[]
  fieldMapping: FieldMapping
  mappedData: Record<string, unknown>[]
  validatedData: Record<string, unknown>[]
  errors: ImportError[]
  warnings: ImportWarning[]
  fileType: "csv" | "json"
}

// Import action result
export interface ImportResult {
  success: true
  count: number
  warnings: string[]
  autoCreated: {
    orgs: string[]
    people: string[]
  }
}

export interface ImportFailure {
  success: false
  error: string
}

export type ImportActionResult = ImportResult | ImportFailure
