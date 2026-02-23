export const STAGE_COLORS = {
  slate: { bg: 'bg-slate-500', text: 'text-slate-500', border: 'border-slate-500', light: 'bg-slate-100' },
  blue: { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500', light: 'bg-blue-100' },
  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500', light: 'bg-emerald-100' },
  amber: { bg: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500', light: 'bg-amber-100' },
  rose: { bg: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-500', light: 'bg-rose-100' },
  violet: { bg: 'bg-violet-500', text: 'text-violet-500', border: 'border-violet-500', light: 'bg-violet-100' },
  cyan: { bg: 'bg-cyan-500', text: 'text-cyan-500', border: 'border-cyan-500', light: 'bg-cyan-100' },
  orange: { bg: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500', light: 'bg-orange-100' },
} as const

export type StageColor = keyof typeof STAGE_COLORS

export function getNextColor(existingColors: StageColor[]): StageColor {
  const colorKeys = Object.keys(STAGE_COLORS) as StageColor[]
  
  if (existingColors.length === 0) {
    return colorKeys[0]
  }
  
  // Count occurrences of each color
  const colorCounts = new Map<StageColor, number>()
  for (const color of colorKeys) {
    colorCounts.set(color, 0)
  }
  
  for (const color of existingColors) {
    const currentCount = colorCounts.get(color) ?? 0
    colorCounts.set(color, currentCount + 1)
  }
  
  // Find the color with the lowest count
  let minCount = Infinity
  let result: StageColor = colorKeys[0]
  
  for (const [color, count] of colorCounts) {
    if (count < minCount) {
      minCount = count
      result = color
    }
  }
  
  return result
}
