export type ExportEntityType = "organization" | "person" | "deal" | "activity"

export type ExportFormat = "csv" | "json" | "pipedrive-csv" | "pipedrive-json"

export interface ExportFilters {
  stage?: string
  owner?: string
  dateFrom?: string
  dateTo?: string
  /**
   * Selection-scoped filter used by the bulk export actions: restricts the export to exactly
   * these record ids. An empty array yields ZERO rows by design, never the whole table.
   */
  ids?: string[]
}

export interface ExportOptions {
  entityType: ExportEntityType
  format: ExportFormat
  includeCustomFields: boolean
  filters?: ExportFilters
}

export type ExportResult =
  | { success: true; data: string; filename: string; count: number }
  | { success: false; error: string }
