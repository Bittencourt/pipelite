/**
 * DB-backed state for the duplicate-scan background job: progress, cancellation and the
 * one-scan-per-entity-type guard.
 *
 * `src/lib/import/pipedrive-import-state.ts` is the 1:1 analog and this module is deliberately a
 * rename of it — same table shape, same JSONB read-merge-write idiom, same "the row survives a
 * container restart" reason for being DB-backed rather than an in-memory Map. Two things are
 * corrected rather than copied, and both are commented where they happen:
 *
 *   1. the running-job guard is scoped to `entityType` (see `createScanState`);
 *   2. the row is inserted as `running`, not `idle` (see `createScanState`).
 *
 * WHAT THIS MODULE DOES NOT DO — authorization. It never resolves the caller's identity: no
 * authentication helper is invoked and no signed-in user is read anywhere in this file, which is
 * gated by a grep for either in the plan's acceptance criteria.
 * UI-SPEC P-6 forbids one user cancelling another user's scan, and
 * `cancelPipedriveImport` (the analog) checks authentication but never ownership — it never
 * compares `state.userId` to the caller. The fix is NOT to bury that comparison here: authorization
 * is a boundary decision, so this module merely EXPOSES `userId` on every state it returns and the
 * server action (plan 39-11) compares it. The split is stated at both ends so neither side assumes
 * the other did it (T-39-08).
 *
 * FAIL-CLOSED (S-5): every read returns a value the page can render — `null` or `false` — and never
 * throws, because `/duplicates` has no `error.tsx` above it. The progress writers swallow too: a
 * failed progress write must not kill a four-minute scan. `createScanState` is the single exception
 * and the only function here that throws: it refuses a concurrent scan with a documented sentinel,
 * and it lets an insert failure propagate because it cannot fabricate a row the poller will read.
 *
 * Logs carry scan ids, entity types and counts only — never record contents (T-37-09).
 */

import { db } from "@/db"
import { dedupScans, type DedupScanStatus } from "@/db/schema"
import { and, desc, eq } from "drizzle-orm"
import type { MergeableEntityType } from "./types"

const LOG = "[dedup-scan-state]"

/** The sentinel `createScanState` throws on a concurrent scan of the same entity type. */
export const SCAN_ALREADY_RUNNING = "A scan is already running for this entity type"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The entire contents of the `progress` JSONB — two numbers, nothing else.
 *
 * UI-SPEC P-1 renders `dedup.scan.progress` = "{current} of {total} records compared", and P-8
 * forbids stat tiles and any per-phase breakdown. A JSONB shape richer than what the UI can render
 * is a shape that drifts, so the storage is held to exactly what is displayed. Contrast the analog,
 * whose `progress` carries seven per-entity counters, a current-entity label, an error array and a
 * review-item array — all of which the import wizard actually renders.
 */
export interface DedupScanProgress {
  current: number
  total: number
}

/** A scan row as every caller of this module sees it. */
export interface DedupScanState {
  scanId: string
  entityType: MergeableEntityType
  /** The user who started the scan. Exposed for the server action's P-6 ownership comparison. */
  userId: string | null
  status: DedupScanStatus
  progress: DedupScanProgress
  cancelled: boolean
  startedAt: Date
  updatedAt: Date
}

/** What a caller may change. `progress` keys are merged; unsupplied keys are preserved. */
export interface DedupScanUpdate {
  current?: number
  total?: number
  status?: DedupScanStatus
  cancelled?: boolean
}

const DEFAULT_PROGRESS: DedupScanProgress = { current: 0, total: 0 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toProgress(raw: unknown): DedupScanProgress {
  const value = (raw ?? {}) as Partial<DedupScanProgress>
  return {
    current: typeof value.current === "number" ? value.current : 0,
    total: typeof value.total === "number" ? value.total : 0,
  }
}

function toScanState(row: {
  id: string
  userId: string | null
  entityType: MergeableEntityType
  status: DedupScanStatus
  progress: unknown
  cancelled: boolean
  createdAt: Date
  updatedAt: Date
}): DedupScanState {
  return {
    scanId: row.id,
    entityType: row.entityType,
    userId: row.userId,
    status: row.status,
    progress: toProgress(row.progress),
    cancelled: row.cancelled,
    startedAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Create the scan row, refusing when a scan of the SAME entity type is already running.
 *
 * TWO DELIBERATE DIVERGENCES FROM `createImportState`:
 *
 * 1. THE GUARD IS PER ENTITY TYPE. The analog's predicate is
 *    `eq(importSessions.status, 'running')` with no entity scope — it refuses when ANY session is
 *    running, which is correct for a Pipedrive import (there is only ever one). Copying it verbatim
 *    would let a running organization scan disable the person scan CTA for no reason, contradicting
 *    UI-SPEC P-7, which disables the CTA only "while a scan of that entity type is running". Hence
 *    the `and(status, entityType)` conjunct below. This is also T-39-07's control: one running scan
 *    per entity type means a user cannot queue arbitrary passes over 46,054 organizations.
 *
 * 2. THE ROW IS INSERTED AS `running`, NOT `idle`. The analog inserts `idle` and lets the runner
 *    flip it, which leaves a window in which two callers both see no running session and both
 *    insert. Inserting `running` closes the window as far as a read-then-write can (the guard is
 *    advisory, not atomic — `dedup_scans_active_idx` makes the check cheap, and the boot reaper in
 *    `scan-cleanup.ts` is what recovers a row this leaves stranded).
 *
 * Throws `SCAN_ALREADY_RUNNING` on refusal. Fail-closed: a failing guard query propagates rather
 * than being swallowed into "no scan is running", because swallowing it would ALLOW the concurrent
 * scan this guard exists to refuse.
 */
export async function createScanState(
  scanId: string,
  entityType: MergeableEntityType,
  userId: string
): Promise<DedupScanState> {
  const existing = await db.query.dedupScans.findFirst({
    where: and(eq(dedupScans.status, "running"), eq(dedupScans.entityType, entityType)),
  })
  if (existing) {
    throw new Error(SCAN_ALREADY_RUNNING)
  }

  const now = new Date()
  await db.insert(dedupScans).values({
    id: scanId,
    userId,
    entityType,
    status: "running",
    progress: { ...DEFAULT_PROGRESS },
    cancelled: false,
    createdAt: now,
    updatedAt: now,
  })

  console.log(`${LOG} started scan ${scanId} (${entityType})`)

  return {
    scanId,
    entityType,
    userId,
    status: "running",
    progress: { ...DEFAULT_PROGRESS },
    cancelled: false,
    startedAt: now,
    updatedAt: now,
  }
}

/**
 * Apply a partial update. `current`/`total` are merged into the existing `progress` JSONB — an
 * unsupplied key keeps its stored value — which is the read-merge-write idiom `updateImportState`
 * uses and the reason the scan loop can report `current` every batch without knowing `total`.
 *
 * No-ops when the row is gone (the reaper may have deleted it) and never throws: this is called
 * once per batch from inside the scan loop, and a transient write failure must not abort the scan.
 */
export async function updateScanState(scanId: string, updates: DedupScanUpdate): Promise<void> {
  try {
    const row = await db.query.dedupScans.findFirst({
      where: eq(dedupScans.id, scanId),
    })
    if (!row) return

    const current = toProgress(row.progress)
    const progress: DedupScanProgress = {
      ...current,
      ...(updates.current !== undefined && { current: updates.current }),
      ...(updates.total !== undefined && { total: updates.total }),
    }

    await db
      .update(dedupScans)
      .set({
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.cancelled !== undefined && { cancelled: updates.cancelled }),
        progress,
        updatedAt: new Date(),
      })
      .where(eq(dedupScans.id, scanId))
  } catch (error) {
    console.error(`${LOG} failed to update scan ${scanId}:`, error)
  }
}

/**
 * Raise the cancellation flag — and ONLY the flag.
 *
 * The terminal `status: 'cancelled'` is written by the scan loop itself, which polls
 * `isScanCancelled` between batches and stops. Setting the status here instead would mean a cancel
 * arriving a moment after a scan finished would rewrite `completed` as `cancelled`, i.e. the user
 * would be told their finished scan never ran. Same split as `cancelImport`.
 *
 * NO OWNERSHIP CHECK HERE, ON PURPOSE — see the module header. The server action compares
 * `getScanState(scanId).userId` to the caller before invoking this (UI-SPEC P-6, T-39-08).
 */
export async function cancelScan(scanId: string): Promise<void> {
  try {
    await db
      .update(dedupScans)
      .set({ cancelled: true, updatedAt: new Date() })
      .where(eq(dedupScans.id, scanId))
    console.log(`${LOG} cancellation requested for scan ${scanId}`)
  } catch (error) {
    console.error(`${LOG} failed to cancel scan ${scanId}:`, error)
  }
}

// ---------------------------------------------------------------------------
// Reads — every one of these fails into a renderable value (S-5)
// ---------------------------------------------------------------------------

/** The scan by id, or `null` when it is missing or unreadable. */
export async function getScanState(scanId: string): Promise<DedupScanState | null> {
  try {
    const row = await db.query.dedupScans.findFirst({
      where: eq(dedupScans.id, scanId),
    })
    return row ? toScanState(row) : null
  } catch (error) {
    console.error(`${LOG} failed to read scan ${scanId}:`, error)
    return null
  }
}

/**
 * The most recent scan of one entity type, or `null`.
 *
 * This is what the page loads on mount: it drives P-4's four renderings and P-7's disabled CTA, and
 * because it is scoped by `entityType` rather than by user it also satisfies P-6's "a running scan
 * is visible to whoever opens the page".
 */
export async function getLatestScan(
  entityType: MergeableEntityType
): Promise<DedupScanState | null> {
  try {
    const row = await db.query.dedupScans.findFirst({
      where: eq(dedupScans.entityType, entityType),
      orderBy: [desc(dedupScans.createdAt)],
    })
    return row ? toScanState(row) : null
  } catch (error) {
    console.error(`${LOG} failed to read the latest ${entityType} scan:`, error)
    return null
  }
}

/**
 * The cancellation flag, polled by the scan loop between batches.
 *
 * Returns `false` for a missing row and for a failed query. That is the fail-OPEN direction for
 * this one predicate and it is the right one: a read failure here must not abort a running scan,
 * and the user can always press cancel again.
 */
export async function isScanCancelled(scanId: string): Promise<boolean> {
  try {
    const row = await db.query.dedupScans.findFirst({
      where: eq(dedupScans.id, scanId),
      columns: { cancelled: true },
    })
    return row?.cancelled ?? false
  } catch (error) {
    console.error(`${LOG} failed to read the cancel flag for scan ${scanId}:`, error)
    return false
  }
}

// ---------------------------------------------------------------------------
// Progress helper
// ---------------------------------------------------------------------------

/**
 * A 0-100 integer for UI-SPEC P-1's determinate progress bar.
 *
 * Clamped at both ends: `total === 0` yields 0 instead of `NaN` (the state the bar is in for the
 * first moment of every scan, before the count query returns), and an over-count yields 100 instead
 * of overflowing the track.
 */
export function calculateScanProgress(progress: DedupScanProgress): number {
  if (!progress.total || progress.total <= 0) return 0
  const percentage = Math.round((progress.current / progress.total) * 100)
  return Math.min(100, Math.max(0, percentage))
}
