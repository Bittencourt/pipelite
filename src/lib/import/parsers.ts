import Papa from "papaparse"
import type { ParseResult, ImportProgress } from "./types"

/**
 * Parse a CSV file with progress reporting.
 * Uses Papa Parse with header mode and web workers for files > 1MB.
 * No file size limit -- handles whatever browser memory allows.
 */
export async function parseCSV<T extends Record<string, string>>(
  file: File,
  onProgress?: (progress: ImportProgress) => void
): Promise<ParseResult<T>> {
  return new Promise((resolve) => {
    const errors: Array<{ row: number; message: string }> = []
    const useWorker = file.size > 1_000_000

    // Report initial progress
    onProgress?.({
      phase: "parsing",
      current: 0,
      total: file.size,
      percentage: 0,
    })

    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      worker: useWorker,
      // Handle BOM and UTF-8 encoding
      encoding: "UTF-8",
      transformHeader: (header: string) => {
        // Strip BOM character if present
        return header.replace(/^\uFEFF/, "").trim()
      },
      step: useWorker
        ? (results, parser) => {
            // Report progress during streaming parse
            if (results.meta.cursor) {
              const percentage = Math.min(
                Math.round((results.meta.cursor / file.size) * 100),
                99
              )
              onProgress?.({
                phase: "parsing",
                current: results.meta.cursor,
                total: file.size,
                percentage,
              })
            }

            // Collect row-level errors
            if (results.errors.length > 0) {
              for (const err of results.errors) {
                errors.push({
                  row: (err.row ?? 0) + 1, // 1-indexed
                  message: err.message,
                })
              }
            }
          }
        : undefined,
      complete: (results) => {
        // Collect any errors from non-worker parse
        if (!useWorker && results.errors.length > 0) {
          for (const err of results.errors) {
            errors.push({
              row: (err.row ?? 0) + 1,
              message: err.message,
            })
          }
        }

        // Report completion
        onProgress?.({
          phase: "parsing",
          current: file.size,
          total: file.size,
          percentage: 100,
        })

        resolve({
          data: results.data as T[],
          errors,
          meta: {
            fields: results.meta.fields ?? [],
            rowCount: results.data.length,
          },
        })
      },
      error: (error) => {
        // On fatal parse error, resolve with error info
        resolve({
          data: [],
          errors: [{ row: 0, message: error.message }],
          meta: { fields: [], rowCount: 0 },
        })
      },
    })
  })
}
