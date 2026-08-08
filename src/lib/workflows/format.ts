/**
 * Format the duration between two timestamps as a human-readable string.
 *
 * Returns "---" when startedAt is null (run hasn't started).
 * Uses the current time as end when completedAt is null (still running).
 */
export function formatDuration(startedAt: Date | null, completedAt: Date | null): string {
  if (!startedAt) return "---"
  const end = completedAt || new Date()
  const ms = end.getTime() - startedAt.getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}
