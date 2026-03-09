/**
 * In-memory import state tracking for progress and cancellation.
 *
 * NOTE: This uses a Map for single-instance deployment. For production with
 * multiple instances, this would need Redis or database backing.
 *
 * This module provides helper functions for state management that are called
 * by server actions, not directly by the client.
 */

/**
 * In-memory import state tracking for progress and cancellation.
 *
 * NOTE: This uses a Map for single-instance deployment. For production with
 * multiple instances, this would need Redis or database backing.
 */

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
// State Storage (In-Memory)
// ---------------------------------------------------------------------------

const importStates = new Map<string, ImportProgressState>()

// ---------------------------------------------------------------------------
// State Management Functions
// ---------------------------------------------------------------------------

/**
 * Create a new import state with default values.
 */
export function createImportState(importId: string): ImportProgressState {
  const state: ImportProgressState = {
    importId,
    status: 'idle',
    currentEntity: null,
    currentProgress: 0,
    totalEntities: 0,
    completedEntities: 0,
    imported: {
      pipelines: 0,
      stages: 0,
      customFields: 0,
      organizations: 0,
      people: 0,
      deals: 0,
      activities: 0
    },
    errors: [],
    reviewItems: [],
    cancelled: false,
    startedAt: new Date()
  }
  importStates.set(importId, state)
  return state
}

/**
 * Get the current import state by ID.
 */
export function getImportState(importId: string): ImportProgressState | undefined {
  return importStates.get(importId)
}

/**
 * Update the import state with partial updates.
 */
export function updateImportState(importId: string, updates: Partial<ImportProgressState>): void {
  const state = importStates.get(importId)
  if (state) {
    importStates.set(importId, { ...state, ...updates })
  }
}

/**
 * Mark an import as cancelled.
 */
export function cancelImport(importId: string): void {
  const state = importStates.get(importId)
  if (state && state.status === 'running') {
    state.cancelled = true
    updateImportState(importId, { cancelled: true })
  }
}

/**
 * Check if an import has been cancelled.
 */
export function isImportCancelled(importId: string): boolean {
  return importStates.get(importId)?.cancelled ?? false
}

/**
 * Clear the import state from memory.
 * Call this after import completion or when state is no longer needed.
 */
export function clearImportState(importId: string): void {
  importStates.delete(importId)
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
export function incrementImportedCount(
  importId: string,
  entityType: keyof ImportProgressState['imported'],
  count: number = 1
): void {
  const state = importStates.get(importId)
  if (state) {
    state.imported[entityType] += count
    importStates.set(importId, { ...state })
  }
}

/**
 * Add an error to the import state.
 */
export function addImportError(
  importId: string,
  entity: string,
  message: string,
  details?: unknown
): void {
  const state = importStates.get(importId)
  if (state) {
    state.errors.push({ entity, message, details })
    importStates.set(importId, { ...state })
  }
}

/**
 * Add a review item (e.g., orphan stub created) to the import state.
 */
export function addReviewItem(
  importId: string,
  type: string,
  id: string,
  reason: string
): void {
  const state = importStates.get(importId)
  if (state) {
    state.reviewItems.push({ type, id, reason })
    importStates.set(importId, { ...state })
  }
}
