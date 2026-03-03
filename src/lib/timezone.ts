import { commonTimezones as configTimezones } from '@/i18n/config'

// Re-export from config for backward compatibility
export const commonTimezones = configTimezones

/**
 * Detect the browser's timezone using the Intl API
 * Returns UTC as fallback if detection fails or in SSR context
 */
export function detectBrowserTimezone(): string {
  if (typeof window === 'undefined') return 'UTC'
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Format a timezone's current offset for display
 * E.g., "America/New_York" -> "EST" or "EDT" depending on season
 */
export function formatTimezoneOffset(timezone: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset'
    })
    const parts = formatter.formatToParts(now)
    const offset = parts.find(p => p.type === 'timeZoneName')
    return offset?.value || timezone
  } catch {
    return timezone
  }
}

/**
 * Get timezone options formatted for a Select component
 * Returns array of { value, label } with timezone and offset
 */
export function getTimezoneOptions(): Array<{ value: string; label: string }> {
  return commonTimezones.map(tz => ({
    value: tz,
    label: `${tz} (${formatTimezoneOffset(tz)})`
  }))
}
