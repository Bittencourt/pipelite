import Papa from "papaparse"
import type { ParseResult, ImportProgress, ImportEntityType } from "./types"

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

/**
 * Detect file type based on extension and MIME type.
 */
export function detectFileType(file: File): "csv" | "json" {
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (ext === "json") return "json"
  if (ext === "csv") return "csv"

  // Fallback to MIME type
  if (file.type === "application/json" || file.type.includes("json")) return "json"
  if (file.type === "text/csv" || file.type.includes("csv")) return "csv"

  // Default to csv if ambiguous
  return "csv"
}

/**
 * Parse a JSON file with progress reporting.
 * Handles both array format and export format (with entityType, version, data).
 * Returns the same ParseResult structure as parseCSV for consistency.
 */
export async function parseJSON(
  file: File,
  onProgress?: (progress: ImportProgress) => void
): Promise<ParseResult<Record<string, unknown>> & { detectedEntityType?: ImportEntityType }> {
  return new Promise((resolve) => {
    onProgress?.({
      phase: "parsing",
      current: 0,
      total: file.size,
      percentage: 0,
    })

    const reader = new FileReader()

    reader.onload = () => {
      try {
        onProgress?.({
          phase: "parsing",
          current: file.size / 2,
          total: file.size,
          percentage: 50,
        })

        const text = reader.result as string
        let parsed = JSON.parse(text)
        let detectedEntityType: ImportEntityType | undefined

        // Handle export format: { entityType, version, data: [...] }
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          "data" in parsed &&
          Array.isArray(parsed.data)
        ) {
          if (parsed.entityType) {
            detectedEntityType = parsed.entityType as ImportEntityType
          }
          parsed = parsed.data
        }

        // Handle single object: wrap in array
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsed = [parsed]
        }

        if (!Array.isArray(parsed)) {
          resolve({
            data: [],
            errors: [{ row: 0, message: "JSON file must contain an array or export format object" }],
            meta: { fields: [], rowCount: 0 },
          })
          return
        }

        // Convert all values to strings to match CSV behavior
        const data: Record<string, string>[] = parsed.map(
          (row: Record<string, unknown>) => {
            const stringRow: Record<string, string> = {}
            for (const [key, value] of Object.entries(row)) {
              if (value === null || value === undefined) {
                stringRow[key] = ""
              } else if (typeof value === "object") {
                stringRow[key] = JSON.stringify(value)
              } else {
                stringRow[key] = String(value)
              }
            }
            return stringRow
          }
        )

        // Extract fields from first row
        const firstRow = data[0] ?? {}
        const fields = Object.keys(firstRow)

        onProgress?.({
          phase: "parsing",
          current: file.size,
          total: file.size,
          percentage: 100,
        })

        resolve({
          data,
          errors: [],
          meta: {
            fields,
            rowCount: data.length,
          },
          detectedEntityType,
        })
      } catch (err) {
        resolve({
          data: [],
          errors: [
            {
              row: 0,
              message: `Invalid JSON: ${err instanceof Error ? err.message : "Parse error"}`,
            },
          ],
          meta: { fields: [], rowCount: 0 },
        })
      }
    }

    reader.onerror = () => {
      resolve({
        data: [],
        errors: [{ row: 0, message: "Failed to read file" }],
        meta: { fields: [], rowCount: 0 },
      })
    }

    reader.readAsText(file, "UTF-8")
  })
}

/**
 * Parse a file (CSV or JSON) with automatic type detection.
 * Returns the parse result with the detected file type.
 */
export async function parseFile(
  file: File,
  onProgress?: (progress: ImportProgress) => void
): Promise<ParseResult<Record<string, string>> & { fileType: "csv" | "json"; detectedEntityType?: ImportEntityType }> {
  const fileType = detectFileType(file)

  if (fileType === "json") {
    const result = await parseJSON(file, onProgress)
    return {
      data: result.data as Record<string, string>[],
      errors: result.errors,
      meta: result.meta,
      fileType: "json",
      detectedEntityType: result.detectedEntityType,
    }
  }

  const result = await parseCSV<Record<string, string>>(file, onProgress)
  return {
    ...result,
    fileType: "csv",
  }
}
