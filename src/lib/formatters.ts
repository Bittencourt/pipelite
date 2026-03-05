// Server-side formatters (use in server components)
// Client components should use useFormatter() from 'next-intl' directly

/**
 * Format a date in the user's locale
 * 
 * @param date - Date object or ISO string
 * @param locale - User's locale (en-US, pt-BR, etc.)
 * @param options - Intl.DateTimeFormatOptions overrides
 * @returns Formatted date string
 * 
 * @example
 * formatDate(new Date(), 'en-US') // => "Mar 3, 2026"
 * formatDate(new Date(), 'pt-BR') // => "3 de mar. de 2026"
 */
export function formatDate(
  date: Date | string | null,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  }).format(d)
}

/**
 * Format a date and time with timezone in the user's locale
 * 
 * @param date - Date object or ISO string
 * @param locale - User's locale (en-US, pt-BR, etc.)
 * @param timezone - User's timezone (America/New_York, etc.)
 * @param options - Intl.DateTimeFormatOptions overrides
 * @returns Formatted date/time string with timezone abbreviation
 * 
 * @example
 * formatDateTime(new Date(), 'en-US', 'America/New_York')
 * // => "Mar 3, 2026, 10:30 AM EST"
 * formatDateTime(new Date(), 'pt-BR', 'America/Sao_Paulo')
 * // => "3 de mar. de 2026 13:30 BRT"
 */
export function formatDateTime(
  date: Date | string | null,
  locale: string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
    ...options
  }).format(d)
}

/**
 * Format a number with locale-appropriate separators
 * 
 * @param value - Numeric value
 * @param locale - User's locale (en-US, pt-BR, etc.)
 * @param options - Intl.NumberFormatOptions overrides
 * @returns Formatted number string
 * 
 * @example
 * formatNumber(1234567.89, 'en-US') // => "1,234,567.89"
 * formatNumber(1234567.89, 'pt-BR') // => "1.234.567,89"
 * formatNumber(0.5, 'en-US', { style: 'percent' }) // => "50%"
 */
export function formatNumber(
  value: number | null | undefined,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  if (value === null || value === undefined) return '0'
  return new Intl.NumberFormat(locale, options).format(value)
}

/**
 * Check if a date is within the last N hours
 * Useful for determining whether to show relative vs absolute time
 * 
 * @param date - Date object or ISO string
 * @param hoursAgo - Number of hours threshold (default 24)
 * @returns true if date is within the threshold
 * 
 * @example
 * isRecent(new Date(Date.now() - 3600000), 24) // => true (1 hour ago)
 * isRecent(new Date(Date.now() - 86400000 * 2), 24) // => false (2 days ago)
 */
export function isRecent(date: Date | string, hoursAgo: number = 24): boolean {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  return diffMs < hoursAgo * 60 * 60 * 1000
}

/**
 * Format a relative time string (for client components)
 * Use next-intl's useFormatter().relativeTime() in components instead
 * This is a server-side fallback
 * 
 * @param date - Date object or ISO string
 * @param locale - User's locale
 * @returns Relative time string like "yesterday", "3 hours ago" (in locale)
 */
export function formatRelativeTimeServer(
  date: Date | string | null,
  locale: string
): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  
  if (diffDays > 0) {
    return rtf.format(-diffDays, 'day')
  } else if (diffHours > 0) {
    return rtf.format(-diffHours, 'hour')
  } else if (diffMinutes > 0) {
    return rtf.format(-diffMinutes, 'minute')
  } else {
    return rtf.format(-diffSeconds, 'second')
  }
}

/**
 * Client components should use useFormatter() from next-intl directly
 * for reactive formatting. This file provides server-side utilities.
 * 
 * @example Client component usage:
 * ```tsx
 * "use client"
 * import { useFormatter, useNow } from 'next-intl'
 * 
 * function MyComponent({ date }: { date: Date }) {
 *   const format = useFormatter()
 *   const now = useNow()
 *   
 *   return (
 *     <span>
 *       {format.relativeTime(date, now)}
 *     </span>
 *   )
 * }
 * ```
 */
