'use client'

import { useState, useEffect, useCallback } from 'react'
import { HelpCircle, Play, AlertCircle, Check } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { evaluateFormula } from '@/lib/formula-engine'
import { FORMULA_FUNCTIONS, FORMULA_EXAMPLES, validateFormula } from '@/lib/formula-helpers'
import type { CustomFieldDefinition, FormulaConfig } from '@/db/schema'

interface FormulaEditorProps {
  definition: CustomFieldDefinition
  existingFields: string[]
  onSave: (config: FormulaConfig) => Promise<void>
  onCancel: () => void
}

export function FormulaEditor({ definition, existingFields, onSave, onCancel }: FormulaEditorProps) {
  const config = definition.config as FormulaConfig | null
  const [expression, setExpression] = useState(config?.expression || '')
  const [previewResult, setPreviewResult] = useState<{ value: unknown; error: string | null } | null>(null)
  const [validation, setValidation] = useState<{ valid: boolean; error?: string }>({ valid: true })
  const [isSaving, setIsSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  
  // Sample values for preview
  const sampleValues: Record<string, unknown> = {
    'Annual Revenue': 100000,
    'Score': 75,
    'Name': 'Sample Name',
    'Start Date': '2024-01-01',
    'First Name': 'John',
    'Last Name': 'Doe',
  }
  
  // Validate on change
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!expression.trim()) {
        setValidation({ valid: true })
        setPreviewResult(null)
        return
      }
      
      const result = await validateFormula(expression, existingFields, definition.name)
      setValidation(result)
    }, 300)
    
    return () => clearTimeout(timer)
  }, [expression, existingFields, definition.name])
  
  // Run preview
  const runPreview = useCallback(async () => {
    if (!expression.trim() || !validation.valid) {
      setPreviewResult(null)
      return
    }
    
    try {
      const result = await evaluateFormula(expression, sampleValues)
      setPreviewResult(result)
    } catch (e) {
      setPreviewResult({ value: null, error: e instanceof Error ? e.message : 'Preview failed' })
    }
  }, [expression, validation.valid, sampleValues])
  
  const handleSave = async () => {
    if (!validation.valid) return
    
    setIsSaving(true)
    try {
      await onSave({ expression, resultType: 'number' }) // Could auto-detect
    } finally {
      setIsSaving(false)
    }
  }
  
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Formula Expression</label>
        <Textarea
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder='e.g., {{Annual Revenue}} * 0.1'
          rows={3}
          className={validation.valid ? '' : 'border-destructive'}
        />
        {!validation.valid && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {validation.error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Use {"{{Field Name}}"} to reference other fields. Use dot notation for related entities: {"{{Organization.Revenue}}"}
        </p>
      </div>
      
      {/* Available Fields */}
      {existingFields.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Available Fields</CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-3">
            <p className="text-xs text-muted-foreground mb-2">
              Click a field to insert it into the formula:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {existingFields.map((field) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => {
                    const fieldRef = `{{${field}}}`
                    setExpression(prev => prev + fieldRef)
                  }}
                  className="inline-flex items-center px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-xs font-medium transition-colors"
                >
                  {field}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Preview Panel */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm flex items-center justify-between">
            Preview
            <Button variant="ghost" size="sm" onClick={runPreview}>
              <Play className="h-3 w-3 mr-1" />
              Test
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-3">
          {previewResult ? (
            previewResult.error ? (
              <div className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Error: {previewResult.error}
              </div>
            ) : (
              <div className="text-sm">
                Result: <span className="font-medium">{String(previewResult.value)}</span>
              </div>
            )
          ) : (
            <div className="text-sm text-muted-foreground">
              Click "Test" to preview the result with sample values
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Help Panel */}
      <Collapsible open={showHelp} onOpenChange={setShowHelp}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full">
            <HelpCircle className="h-4 w-4 mr-2" />
            {showHelp ? 'Hide' : 'Show'} Function Reference
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="py-3 px-3">
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(FORMULA_FUNCTIONS).map(([category, info]) => (
                  <div key={category}>
                    <h4 className="font-medium text-sm mb-2">{category} - {info.description}</h4>
                    <ul className="space-y-1 text-xs">
                      {info.functions.slice(0, 4).map(fn => (
                        <li key={fn.name} className="flex gap-2">
                          <code className="text-blue-600">{fn.name}</code>
                          <span className="text-muted-foreground">{fn.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-medium text-sm mb-2">Examples</h4>
                <ul className="space-y-1 text-xs">
                  {FORMULA_EXAMPLES.map((ex, i) => (
                    <li key={i} className="flex gap-2">
                      <code className="text-blue-600">{ex.expression}</code>
                      <span className="text-muted-foreground">→ {ex.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
      
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={!validation.valid || isSaving}>
          <Check className="h-4 w-4 mr-2" />
          Save Formula
        </Button>
      </div>
    </div>
  )
}
