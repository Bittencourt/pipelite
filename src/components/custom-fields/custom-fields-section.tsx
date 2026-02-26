'use client'

import { useState, useCallback, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FieldRenderer } from './field-renderer'
import type { CustomFieldDefinition, EntityType } from '@/db/schema'

// Server action for saving custom field values
async function saveCustomFields(
  entityType: EntityType,
  entityId: string,
  values: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch('/api/custom-fields/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, entityId, values }),
  })
  return response.json()
}

interface CustomFieldsSectionProps {
  entityType: EntityType
  entityId: string
  definitions: CustomFieldDefinition[]
  values: Record<string, unknown>
  /** Native entity attributes accessible by formulas (e.g., deal value, organization name) */
  entityAttributes?: Record<string, unknown>
  relatedEntities?: Record<string, Record<string, unknown>>
  onValuesChange?: (values: Record<string, unknown>) => void
  disabled?: boolean
}

export function CustomFieldsSection({
  entityType,
  entityId,
  definitions,
  values,
  entityAttributes,
  relatedEntities,
  onValuesChange,
  disabled,
}: CustomFieldsSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [localValues, setLocalValues] = useState(values)
  
  // Merge custom field values with entity attributes for formula evaluation
  const allFieldValues = useMemo(() => ({
    ...entityAttributes,
    ...localValues,
  }), [entityAttributes, localValues])
  
  const handleSave = useCallback(async (fieldName: string, value: unknown) => {
    const newValues = { ...localValues, [fieldName]: value }
    setLocalValues(newValues)
    
    try {
      const result = await saveCustomFields(entityType, entityId, newValues)
      if (result.success) {
        onValuesChange?.(newValues)
      } else {
        console.error('Failed to save field:', result.error)
        // Revert on error
        setLocalValues(values)
      }
    } catch (error) {
      console.error('Failed to save field:', error)
      // Revert on error
      setLocalValues(values)
    }
  }, [entityType, entityId, localValues, values, onValuesChange])
  
  if (definitions.length === 0) {
    return null
  }
  
  // Separate formula fields from others (they need all values)
  const formulaFields = definitions.filter(d => d.type === 'formula')
  const otherFields = definitions.filter(d => d.type !== 'formula')
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-6">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2 p-0 h-auto py-2 hover:bg-transparent">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-semibold">Custom Fields</span>
          <span className="text-muted-foreground text-sm">
            ({definitions.length})
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-1 mt-2 md:grid-cols-2">
          {otherFields.map(definition => (
            <FieldRenderer
              key={definition.id}
              definition={definition}
              value={localValues[definition.name] ?? null}
              onSave={(value) => handleSave(definition.name, value)}
              disabled={disabled}
              entityId={entityId}
              allFieldValues={allFieldValues}
              relatedEntities={relatedEntities}
            />
          ))}
        </div>
        
        {/* Formula fields at the bottom (read-only display) */}
        {formulaFields.length > 0 && (
          <div className="grid gap-1 mt-4 pt-4 border-t md:grid-cols-2">
            {formulaFields.map(definition => (
              <FieldRenderer
                key={definition.id}
                definition={definition}
                value={localValues[definition.name] ?? null}
                onSave={() => Promise.resolve()} // Formulas are read-only
                disabled={true}
                allFieldValues={allFieldValues}
                relatedEntities={relatedEntities}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
