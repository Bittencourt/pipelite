/**
 * Boot-time reaper for duplicate scans stranded by a container restart.
 *
 * Called once from `instrumentation.ts` `register()`. `src/lib/import/import-session-cleanup.ts` is
 * the 1:1 analog and the three statements below are its three statements, renamed:
 *
 *   1. every `running` row becomes `error` — crash recovery. A scan is a background job whose
 *      progress lives in a table, so a restart mid-scan leaves a row claiming to be running with no
 *      process behind it. UI-SPEC P-7 disables the scan CTA "while a scan of that entity type is
 *      running", so without this statement one unlucky restart disables that button PERMANENTLY,
 *      and `createScanState`'s guard refuses every new scan of that type forever. This is T-39-22.
 *   2. `idle` rows older than one hour are deleted. `createScanState` inserts `running`, not `idle`,
 *      so nothing this codebase writes today lands here — but `dedup_scans.status` DEFAULTS to
 *      `idle`, so any insert that omits the column (a future writer, a manual row) still gets
 *      collected instead of accumulating invisibly.
 *   3. any row older than thirty days is deleted, whatever its status — plain retention.
 *
 * ONE DELIBERATE DIVERGENCE FROM THE ANALOG: the logging.
 *
 * `cleanupStaleImportSessions` logs a single line, and only when the three counts sum to something
 * non-zero. It prints nothing at all on startup. Its conditional-logging shape is deliberately NOT
 * copied here, and a grep for that condition in this file returns nothing (the plan's acceptance
 * criteria gate it). That shape makes a behavioural verification IMPOSSIBLE — a silent log is
 * indistinguishable from a function that never ran — and a behavioural verification is the only
 * kind `instrumentation.ts` accepts. Its own closing comment says why: `Dockerfile:24` copies the
 * built `instrumentation.js` into `.next/standalone/` with a step ending in `2>/dev/null || true`,
 * so a build whose chunk layout changes fails silently and `register()` never runs. That is exactly
 * what killed all four background processors in production on 2026-08-08 while every unit test
 * passed. So this reaper logs UNCONDITIONALLY and twice — a fixed-prefix startup line before the
 * work and a result line after it — and the gate is
 * `rtk proxy docker compose logs app | grep -F '[dedup-scan-cleanup] Starting'`, exactly as
 * `[trash-prune] Starting` is gated. Do not "tidy" this back into the analog's conditional form.
 *
 * The startup line is OUTSIDE the try/catch on purpose: if it sat after the first query, a DB
 * hiccup at boot would make the gate report that the reaper never ran.
 *
 * Logs carry counts only, never row contents (T-37-09).
 */

import { db } from "@/db"
import { dedupScans } from "@/db/schema"
import { eq, and, lt } from "drizzle-orm"

const LOG = "[dedup-scan-cleanup]"

export async function cleanupStaleDedupScans(): Promise<void> {
  console.log(`${LOG} Starting`)

  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // 1. Crash recovery: a `running` row with no process behind it.
    const staleRunning = await db
      .update(dedupScans)
      .set({ status: "error", updatedAt: now })
      .where(eq(dedupScans.status, "running"))
      .returning({ id: dedupScans.id })

    // 2. Abandoned `idle` rows.
    const staleIdle = await db
      .delete(dedupScans)
      .where(and(eq(dedupScans.status, "idle"), lt(dedupScans.createdAt, oneHourAgo)))
      .returning({ id: dedupScans.id })

    // 3. Retention.
    const old = await db
      .delete(dedupScans)
      .where(lt(dedupScans.createdAt, thirtyDaysAgo))
      .returning({ id: dedupScans.id })

    console.log(
      `${LOG} Done: ${staleRunning.length} stranded scan(s) marked error, ` +
        `${staleIdle.length} idle deleted, ${old.length} expired deleted`
    )
  } catch (error) {
    console.error(`${LOG} Failed to clean up stale scans:`, error)
  }
}
