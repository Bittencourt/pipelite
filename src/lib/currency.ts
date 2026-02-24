/**
 * Format a numeric value as currency
 * - Returns "$0" for null/undefined/0
 * - Returns "$X,XXX" format with commas for thousands
 * - No decimals (whole dollars only)
 * 
 * @param value - The numeric value to format
 * @returns Formatted currency string
 * 
 * @example
 * formatCurrency(1234567) // => "$1,234,567"
 * formatCurrency(0) // => "$0"
 * formatCurrency(null) // => "$0"
 * formatCurrency(undefined) // => "$0"
 */
export function formatCurrency(value: number | null | undefined): string {
  // Handle null, undefined, or 0
  if (value === null || value === undefined || value === 0) {
    return "$0"
  }

  // Round to whole dollars and format with commas
  const wholeDollars = Math.round(value)
  return `$${wholeDollars.toLocaleString('en-US')}`
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
