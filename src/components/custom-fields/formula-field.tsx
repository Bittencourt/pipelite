'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Calculator } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { evaluateFormula } from '@/lib/formula-engine'
import type { CustomFieldDefinition, FormulaConfig } from '@/db/schema'

interface FormulaFieldProps {
  definition: CustomFieldDefinition
  value: unknown // Could be cached result or { formula: true, value, error }
  allFieldValues: Record<string, unknown>
  relatedEntities?: Record<string, Record<string, unknown>>
  disabled?: boolean
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return value.toLocaleString()
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value)
}

export function FormulaField({ 
  definition, 
  value, 
  allFieldValues,
  relatedEntities,
}: FormulaFieldProps) {
  const [calculatedValue, setCalculatedValue] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const config = definition.config as FormulaConfig | null
  const expression = config?.expression || ''
  
  // Check if value is a cached formula result
  const isCachedResult = typeof value === 'object' && value !== null && 'formula' in value
  
  useEffect(() => {
    // Use cached result if available
    if (isCachedResult) {
      const cached = value as { formula: true; value: unknown; error: string | null }
      setCalculatedValue(cached.value)
      setError(cached.error)
      setIsLoading(false)
      return
    }
    
    // Otherwise calculate
    const calculate = async () => {
      setIsLoading(true)
      try {
        const result = await evaluateFormula(expression, allFieldValues, relatedEntities)
        setCalculatedValue(result.value)
        setError(result.error)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Calculation failed')
      } finally {
        setIsLoading(false)
      }
    }
    
    calculate()
  }, [expression, allFieldValues, relatedEntities, value, isCachedResult])
  
  return (
    <div className="py-2">
      <Label className="text-sm text-muted-foreground flex items-center gap-1">
        <Calculator className="h-3 w-3" />
        {definition.name}
      </Label>
      
      {isLoading ? (
        <div className="text-sm text-muted-foreground mt-1">Calculating...</div>
      ) : error ? (
        <div className="flex items-start gap-1 text-destructive mt-1">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">#ERROR</span>
            <span className="text-xs opacity-80">{error}</span>
          </div>
        </div>
      ) : (
        <div className="text-sm font-medium mt-1">
          {formatValue(calculatedValue) || <span className="text-muted-foreground italic">Empty</span>}
        </div>
      )}
    </div>
  )
}
