/**
 * Format a numeric value as currency (server-side or non-hook version)
 * - Returns formatted "0" for null/undefined/0
 * - Returns locale-formatted currency with no decimals (whole dollars only)
 * - Currency symbol placement based on locale
 * 
 * @param value - The numeric value to format
 * @param currency - Currency code (USD, BRL, EUR, etc.) - defaults to USD
 * @param locale - Locale string (en-US, pt-BR, etc.) - defaults to en-US
 * @returns Formatted currency string
 * 
 * @example
 * formatCurrency(1234567, 'USD', 'en-US') // => "$1,234,567"
 * formatCurrency(1234567, 'BRL', 'pt-BR') // => "R$ 1.234.567"
 * formatCurrency(0, 'USD', 'en-US') // => "$0"
 * formatCurrency(null, 'USD', 'en-US') // => "$0"
 */
export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  // Handle null, undefined, or 0
  if (value === null || value === undefined || value === 0) {
    return new Intl.NumberFormat(locale, { 
      style: 'currency', 
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(0)
  }

  // Round to whole dollars and format with locale-appropriate separators
  const wholeDollars = Math.round(value)
  return new Intl.NumberFormat(locale, { 
    style: 'currency', 
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(wholeDollars)
}

/**
 * React hook for currency formatting in client components
 * Uses next-intl's useFormatter for reactive locale-aware formatting
 * 
 * @returns Object with format function
 * 
 * @example
 * const { format } = useCurrency()
 * format(1234567, 'USD') // => "$1,234,567" (en-US) or "US$ 1.234.567" (pt-BR)
 * 
 * @deprecated Use useCurrency from '@/lib/use-currency' instead
 * This file is server-safe. Import the hook from the dedicated file.
 */
export function useCurrency() {
  throw new Error('useCurrency must be imported from @/lib/use-currency in client components')
}

/**
 * Sum the values of an array of deals
 * - Treats null values as 0
 * - Returns 0 for empty arrays
 * 
 * @param deals - Array of deal objects with value field
 * @returns Sum of all deal values
 * 
 * @example
 * sumDealValues([{ value: 1000 }, { value: 2000 }, { value: null }]) // => 3000
 */
export function sumDealValues(deals: Array<{ value: string | null }>): number {
  return deals.reduce((sum, deal) => {
    const value = deal.value ? parseFloat(deal.value) : 0
    return sum + (isNaN(value) ? 0 : value)
  }, 0)
}

/**
 * Server-side helper to format currency with organization's default currency
 * 
 * @param value - The numeric value to format
 * @param orgCurrency - Organization's default currency (or null for USD fallback)
 * @param locale - User's locale string
 * @returns Formatted currency string
 * 
 * @example
 * await formatCurrencyWithOrg(1234567, 'BRL', 'pt-BR') // => "R$ 1.234.567"
 * await formatCurrencyWithOrg(1234567, null, 'en-US') // => "$1,234,567" (USD fallback)
 */
export async function formatCurrencyWithOrg(
  value: number | null | undefined,
  orgCurrency: string | null,
  locale: string
): Promise<string> {
  const currency = orgCurrency || 'USD'
  return formatCurrency(value, currency, locale)
}
