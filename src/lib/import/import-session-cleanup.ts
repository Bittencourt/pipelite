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
    if (total > 0) {
      console.log(`Cleaned up ${total} stale import sessions`)
    }
  } catch (error) {
    console.error("[import-cleanup] Failed to clean up stale sessions:", error)
  }
}
