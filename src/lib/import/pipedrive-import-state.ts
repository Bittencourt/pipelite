/**
 * DB-backed import state tracking for progress and cancellation.
 *
 * All state is persisted in the import_sessions table via Drizzle ORM.
 * This replaces the previous in-memory Map implementation to ensure
 * import progress survives container restarts.
 */

import { db } from "@/db"
import { importSessions } from "@/db/schema"
import { eq } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportProgressState {
  importId: string
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error'
  currentEntity: string | null
  currentProgress: number
  totalEntities: number
  completedEntities: number
  imported: {
    pipelines: number
    stages: number
    customFields: number
    organizations: number
    people: number
    deals: number
    activities: number
  }
  errors: Array<{ entity: string; message: string; details?: unknown }>
  reviewItems: Array<{ type: string; id: string; reason: string }>
  cancelled: boolean
  startedAt: Date
  completedAt?: Date
}

// ---------------------------------------------------------------------------
// Internal JSONB shape (stored in import_sessions.progress column)
// ---------------------------------------------------------------------------

interface ImportProgressData {
  imported: {
    pipelines: number
    stages: number
    customFields: number
    organizations: number
    people: number
    deals: number
    activities: number
  }
  currentEntity: string | null
  completedEntities: number
  totalEntities: number
  errors: Array<{ entity: string; message: string }>
  reviewItems: Array<{ type: string; id: string; reason: string }>
}

const DEFAULT_IMPORTED = {
  pipelines: 0,
  stages: 0,
  customFields: 0,
  organizations: 0,
  people: 0,
  deals: 0,
  activities: 0,
}

const DEFAULT_PROGRESS: ImportProgressData = {
  imported: { ...DEFAULT_IMPORTED },
  currentEntity: null,
  completedEntities: 0,
  totalEntities: 0,
  errors: [],
  reviewItems: [],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toProgressState(
  session: { id: string; status: string; progress: unknown; cancelled: boolean; createdAt: Date; updatedAt: Date }
): ImportProgressState {
  const progress = (session.progress ?? DEFAULT_PROGRESS) as ImportProgressData
  return {
    importId: session.id,
    status: session.status as ImportProgressState['status'],
    currentEntity: progress.currentEntity ?? null,
    currentProgress: (progress.totalEntities ?? 0) > 0
      ? Math.round(((progress.completedEntities ?? 0) / progress.totalEntities) * 100)
      : 0,
    totalEntities: progress.totalEntities ?? 0,
    completedEntities: progress.completedEntities ?? 0,
    imported: progress.imported ?? { ...DEFAULT_IMPORTED },
    errors: progress.errors ?? [],
    reviewItems: progress.reviewItems ?? [],
    cancelled: session.cancelled,
    startedAt: session.createdAt,
    completedAt: session.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// State Management Functions
// ---------------------------------------------------------------------------

/**
 * Create a new import state with default values.
 * Rejects if a running session already exists.
 */
export async function createImportState(importId: string, userId: string): Promise<ImportProgressState> {
  // Check for existing running session
  const existing = await db.query.importSessions.findFirst({
    where: eq(importSessions.status, 'running'),
  })
  if (existing) {
    throw new Error("An import is already in progress")
  }

  const now = new Date()
  await db.insert(importSessions).values({
    id: importId,
    userId,
    status: 'idle',
    progress: { ...DEFAULT_PROGRESS },
    cancelled: false,
    createdAt: now,
    updatedAt: now,
  })

  return {
    importId,
    status: 'idle',
    currentEntity: null,
    currentProgress: 0,
    totalEntities: 0,
    completedEntities: 0,
    imported: { ...DEFAULT_IMPORTED },
    errors: [],
    reviewItems: [],
    cancelled: false,
    startedAt: now,
  }
}

/**
 * Get the current import state by ID.
 */
export async function getImportState(importId: string): Promise<ImportProgressState | undefined> {
  const session = await db.query.importSessions.findFirst({
    where: eq(importSessions.id, importId),
  })
  if (!session) return undefined

  return toProgressState(session)
}

/**
 * Update the import state with partial updates.
 */
export async function updateImportState(importId: string, updates: Partial<ImportProgressState>): Promise<void> {
  const session = await db.query.importSessions.findFirst({
    where: eq(importSessions.id, importId),
  })
  if (!session) return

  const currentProgress = (session.progress ?? DEFAULT_PROGRESS) as ImportProgressData

  // Merge updates into progress JSONB
  const newProgress: ImportProgressData = {
    ...currentProgress,
    ...(updates.currentEntity !== undefined && { currentEntity: updates.currentEntity }),
    ...(updates.completedEntities !== undefined && { completedEntities: updates.completedEntities }),
    ...(updates.totalEntities !== undefined && { totalEntities: updates.totalEntities }),
    ...(updates.imported && { imported: updates.imported }),
    ...(updates.errors && { errors: updates.errors.slice(0, 50).map(e => ({ entity: e.entity, message: e.message })) }),
    ...(updates.reviewItems && { reviewItems: updates.reviewItems }),
  }

  await db
    .update(importSessions)
    .set({
      ...(updates.status && { status: updates.status }),
      ...(updates.cancelled !== undefined && { cancelled: updates.cancelled }),
      progress: newProgress,
      updatedAt: new Date(),
    })
    .where(eq(importSessions.id, importId))
}

/**
 * Mark an import as cancelled.
 */
export async function cancelImport(importId: string): Promise<void> {
  await db
    .update(importSessions)
    .set({ cancelled: true, updatedAt: new Date() })
    .where(eq(importSessions.id, importId))
}

/**
 * Check if an import has been cancelled.
 */
export async function isImportCancelled(importId: string): Promise<boolean> {
  const session = await db.query.importSessions.findFirst({
    where: eq(importSessions.id, importId),
    columns: { cancelled: true },
  })
  return session?.cancelled ?? false
}

/**
 * Clear the import state.
 * No-op: sessions are kept for audit trail.
 */
export async function clearImportState(_importId: string): Promise<void> {
  // Sessions kept for audit trail -- no-op
}

// ---------------------------------------------------------------------------
// Progress Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the progress percentage for an import.
 */
export function calculateProgress(state: ImportProgressState): number {
  if (state.totalEntities === 0) return 0
  return Math.round((state.completedEntities / state.totalEntities) * 100)
}

/**
 * Increment the count for an imported entity type.
 */
export async function incrementImportedCount(
  importId: string,
  entityType: keyof ImportProgressState['imported'],
  count: number = 1
): Promise<void> {
  const session = await db.query.importSessions.findFirst({
    where: eq(importSessions.id, importId),
  })
  if (!session) return

  const progress = (session.progress ?? DEFAULT_PROGRESS) as ImportProgressData
  const imported = { ...progress.imported }
  imported[entityType] = (imported[entityType] ?? 0) + count

  await db
    .update(importSessions)
    .set({
      progress: { ...progress, imported },
      updatedAt: new Date(),
    })
    .where(eq(importSessions.id, importId))
}

/**
 * Add an error to the import state (capped at 50 entries).
 */
export async function addImportError(
  importId: string,
  entity: string,
  message: string,
  _details?: unknown
): Promise<void> {
  const session = await db.query.importSessions.findFirst({
    where: eq(importSessions.id, importId),
  })
  if (!session) return

  const progress = (session.progress ?? DEFAULT_PROGRESS) as ImportProgressData
  const errors = [...(progress.errors ?? [])]

  if (errors.length < 50) {
    errors.push({ entity, message })
  }

  await db
    .update(importSessions)
    .set({
      progress: { ...progress, errors },
      updatedAt: new Date(),
    })
    .where(eq(importSessions.id, importId))
}

/**
 * Add a review item (e.g., orphan stub created) to the import state.
 */
export async function addReviewItem(
  importId: string,
  type: string,
  id: string,
  reason: string
): Promise<void> {
  const session = await db.query.importSessions.findFirst({
    where: eq(importSessions.id, importId),
  })
  if (!session) return

  const progress = (session.progress ?? DEFAULT_PROGRESS) as ImportProgressData
  const reviewItems = [...(progress.reviewItems ?? [])]
  reviewItems.push({ type, id, reason })

  await db
    .update(importSessions)
    .set({
      progress: { ...progress, reviewItems },
      updatedAt: new Date(),
    })
    .where(eq(importSessions.id, importId))
}
