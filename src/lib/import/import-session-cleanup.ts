/**
 * Startup cleanup for stale import sessions.
 *
 * Called once from instrumentation.ts register() on app startup.
 * Handles three cases:
 * 1. Running sessions (crash recovery) -> transition to error
 * 2. Idle sessions older than 1 hour -> delete
 * 3. All sessions older than 30 days -> delete
 */

import { db } from "@/db"
import { importSessions } from "@/db/schema"
import { eq, and, lt } from "drizzle-orm"
import { log } from "@/lib/log"

export async function cleanupStaleImportSessions(): Promise<void> {
  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // 1. Mark running sessions as error (crash recovery)
    const staleRunning = await db
      .update(importSessions)
      .set({ status: "error", updatedAt: now })
      .where(eq(importSessions.status, "running"))
      .returning({ id: importSessions.id })

    // 2. Delete idle sessions older than 1 hour
    const staleIdle = await db
      .delete(importSessions)
      .where(and(eq(importSessions.status, "idle"), lt(importSessions.createdAt, oneHourAgo)))
      .returning({ id: importSessions.id })

    // 3. Delete sessions older than 30 days
    const old = await db
      .delete(importSessions)
      .where(lt(importSessions.createdAt, thirtyDaysAgo))
      .returning({ id: importSessions.id })

    const total = staleRunning.length + staleIdle.length + old.length
    // Deliberately conditional — this module logs only when it actually cleaned something up,
    // and `scan-cleanup.ts`'s header contrasts the two modules on exactly this point. Counts
    // only: `staleRunning`, `staleIdle` and `old` are arrays of returned row ids.
    if (total > 0) {
      // No bracket prefix on this line today, so the scope is path-derived. The line below
      // carries `[import-cleanup]` and keeps it — two scopes in one file, per-site.
      log.info("lib/import/import-session-cleanup", "Cleaned up stale import sessions", { total })
    }
  } catch (error) {
    log.error("import-cleanup", "Failed to clean up stale sessions", { err: error })
  }
}
