"use server"

import { auth } from "@/auth"
import { fetchFilteredData } from "@/lib/export/formatters"
import type { ExportOptions, ExportResult } from "@/lib/export/types"

export async function getExportData(
  options: ExportOptions
): Promise<ExportResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  if (session.user.role !== "admin") {
    return { success: false, error: "Not authorized" }
  }

  return fetchFilteredData(options)
}
