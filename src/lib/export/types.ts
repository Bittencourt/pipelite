export type ExportEntityType = "organization" | "person" | "deal" | "activity"

export type ExportFormat = "csv" | "json" | "pipedrive-csv" | "pipedrive-json"

export interface ExportFilters {
  stage?: string
  owner?: string
  dateFrom?: string
  dateTo?: string
  /**
   * THE SAVED-VIEW VOCABULARY (Phase 40 Decision 2).
   *
   * These five exist so a saved view can be REPRODUCED by an export. Before them
   * `ExportFilters` was `{stage, owner, dateFrom, dateTo, ids}`, which cannot express an
   * `/organizations` view (one `search` param) or an `/activities` view (`type`, `status`,
   * `assignee`, `search`) at all — so criterion 4 was unmeetable on two of the four surfaces.
   * Resolving a view to ids instead was not viable either: `BULK_MAX_IDS` caps at 100 and a view
   * can match tens of thousands of rows.
   *
   * **THE AUTHORIZATION FOR USING THEM LIVES IN `hasExportableFilter`, NOT HERE.** This interface
   * is a VOCABULARY, not a gate: it says what an export CAN be narrowed by, never who may ask.
   * `src/lib/views/url-params.ts` owns the question of whether a given filter map may authorize an
   * export at all, and `src/lib/export/view-export-guard.ts` is the control that applies it. Adding
   * a key here therefore grants nothing by itself — but a key added here and then listed in
   * `EXPORTABLE_FILTER_KEYS` without a matching `fetch*` predicate WOULD grant everything, which is
   * what `src/lib/export/__tests__/view-filters.test.ts` gates (T-40-30).
   *
   * `pipeline` is the deliberate asymmetry: it NARROWS a deals export (to one board's stages) but
   * never AUTHORIZES one, because a board selector scoping 25,195 deals is the unbounded export
   * 38-CONTEXT.md:110-116 forbids. See `EXPORTABLE_FILTER_KEYS` and 40-CONTEXT amendment A2.
   */
  search?: string
  type?: string
  status?: string
  assignee?: string
  pipeline?: string
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
  /**
   * When set, the fetchers select `maxRows + 1` rows and `fetchFilteredData` REFUSES rather than
   * returning a truncated file — a partial CSV that looks complete is worse than a refusal, because
   * the user cannot tell the difference. The refusal happens BEFORE any formatting, so a rejected
   * export never serialises the rows it read.
   *
   * `undefined` preserves today's unbounded behaviour, which the ADMIN FULL EXPORT depends on
   * (`src/app/admin/export/actions.ts` passes no filters and no cap, deliberately) and which the
   * `exportSelected*` bulk actions inherit. Nothing in this file changes for a caller that omits it.
   *
   * 40-CONTEXT chose a cap over streaming; `EXPORT_ROW_CAP` in
   * `src/lib/export/view-export-guard.ts` is the value the view export passes.
   */
  maxRows?: number
}

export type ExportResult =
  | { success: true; data: string; filename: string; count: number }
  | { success: false; error: string }
