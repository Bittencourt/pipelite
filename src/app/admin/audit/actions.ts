"use server"

/**
 * The one write path for the audit retention window (AUDIT-04).
 *
 * AUTHORIZATION (T-36-30)
 * `src/app/admin/layout.tsx` redirects a non-admin away from every `/admin/*` PAGE
 * RENDER. It does not — and cannot — protect a server action, which is a POST endpoint
 * the browser can invoke directly with no page involved. So the role is re-checked here.
 * The disabled Save button in `retention-form.tsx` is cosmetic and is never the control.
 *
 * VALIDATION
 * Deliberately not re-implemented. `writeRetentionDays` validates with zod BEFORE any
 * database call and returns its own error string; forwarding that result unchanged keeps
 * one source of truth for the range. A second copy of `1..3650` here would be a second
 * thing to keep in sync with `RETENTION_MIN` / `RETENTION_MAX`.
 */

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import { writeRetentionDays, type WriteRetentionResult } from "@/lib/audit/settings"

export async function saveRetention(days: number): Promise<WriteRetentionResult> {
  const session = await auth()

  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized: Admin access required" }
  }

  const result = await writeRetentionDays(days)

  if (result.success) {
    // The page reads the saved window on render, so the next navigation back to
    // /admin/audit must not serve a cached value that disagrees with the input.
    revalidatePath("/admin/audit")
  }

  return result
}
