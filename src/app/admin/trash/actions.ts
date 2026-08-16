"use server"

/**
 * The one write path for the trash retention window (TRASH-03).
 *
 * AUTHORIZATION (T-37-01)
 * `src/app/admin/layout.tsx` redirects a non-admin away from every `/admin/*` PAGE
 * RENDER. It does not — and cannot — protect a server action, which is a POST endpoint
 * the browser can invoke directly with no page involved. So the role is re-checked here.
 * The disabled Save button in `retention-form.tsx` is cosmetic and is never the control.
 *
 * VALIDATION
 * Deliberately not re-implemented. `writeTrashRetentionDays` validates with zod BEFORE any
 * database call and returns its own error string; forwarding that result unchanged keeps
 * one source of truth for the range. A second copy of `1..365` here would be a second
 * thing to keep in sync with `RETENTION_MIN` / `RETENTION_MAX`.
 */

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import {
  writeTrashRetentionDays,
  type WriteTrashRetentionResult,
} from "@/lib/trash/settings"

export async function saveTrashRetention(
  days: number
): Promise<WriteTrashRetentionResult> {
  const session = await auth()

  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  const result = await writeTrashRetentionDays(days)

  if (result.success) {
    // The page reads the saved window on render, so the next navigation back to
    // /admin/trash must not serve a cached value that disagrees with the input.
    revalidatePath("/admin/trash")
  }

  return result
}
