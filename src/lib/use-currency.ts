"use client"

import { useFormatter, useLocale } from 'next-intl'

/**
 * React hook for currency formatting in client components
 * Uses next-intl's useFormatter for reactive locale-aware formatting
 * 
 * @returns Object with format function and locale
 * 
 * @example
 * const { format, locale } = useCurrency()
 * format(1234567, 'USD') // => "$1,234,567" (en-US) or "US$ 1.234.567" (pt-BR)
 */
export function useCurrency() {
  const format = useFormatter()
  const locale = useLocale()
  
  return {
    format: (value: number | null | undefined, currency: string = 'USD') => {
      const numValue = value ?? 0
      return format.number(numValue, { 
        style: 'currency', 
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })
    },
    locale
  }
}
