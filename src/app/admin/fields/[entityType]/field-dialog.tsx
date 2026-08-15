'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createFieldDefinition, updateFieldDefinition, restoreFieldDefinition } from '@/app/admin/fields/actions'
import { warnIfInvalidTriggerChild } from './trigger-child-guard'
import type { CustomFieldDefinition, EntityType, FieldType, FieldConfig } from '@/db/schema'

const fieldTypes: { value: FieldType; label: string; needsConfig: boolean }[] = [
  { value: 'text', label: 'Text', needsConfig: false },
  { value: 'number', label: 'Number', needsConfig: false },
  { value: 'date', label: 'Date', needsConfig: false },
  { value: 'boolean', label: 'Checkbox', needsConfig: false },
  { value: 'single_select', label: 'Single Select', needsConfig: true },
  { value: 'multi_select', label: 'Multi Select', needsConfig: true },
  { value: 'file', label: 'File Upload', needsConfig: true },
  { value: 'url', label: 'URL', needsConfig: false },
  { value: 'lookup', label: 'Lookup', needsConfig: true },
  { value: 'formula', label: 'Formula', needsConfig: true },
]

const fieldSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['text', 'number', 'date', 'boolean', 'single_select', 'multi_select', 'file', 'url', 'lookup', 'formula']),
  required: z.boolean(),
  showInList: z.boolean(),
  config: z.any().nullable(),
})

type FieldFormData = z.infer<typeof fieldSchema>

/**
 * D-44-02 — every key this route's client code reads from a definition row, and no other.
 *
 * `createdAt`, `updatedAt`, `deletedAt` and `position` are absent on purpose: nothing in
 * this route reads them (the server has already split active from archived, and reordering
 * posts ids only), so shipping them across the RSC boundary is pure payload. `config`
 * stays, because the edit form below reads select options, lookup targets and formula
 * expressions out of it.
 *
 * Declared here rather than in a types module because this is the file that defines the
 * dialog's contract. `page.tsx` imports it as `import type`, which is erased at compile
 * time - no client reference is created by a server component importing it.
 */
export type AdminFieldRow = Pick<
  CustomFieldDefinition,
  'id' | 'name' | 'type' | 'config' | 'required' | 'showInList'
>

/**
 * The three keys the formula editor's field chips read (see the `availableFields` block
 * below). Narrower than `AdminFieldRow` so the prop states what it actually consumes;
 * `AdminFieldRow` is structurally assignable to it, so callers pass the shared array
 * directly and no second array is ever built.
 */
export type AvailableField = Pick<CustomFieldDefinition, 'id' | 'name' | 'type'>

interface FieldDialogProps {
  entityType: EntityType
  field?: AdminFieldRow
  /**
   * Whether `field` is archived - i.e. whether this dialog restores rather than edits.
   * Was derived from `field.deletedAt`, which `AdminFieldRow` deliberately drops; the
   * caller knows the answer already, and passing it keeps the timestamp off the wire.
   */
  archived?: boolean
  availableFields?: AvailableField[]
  children: React.ReactNode
}

export function FieldDialog({ entityType, field, archived, availableFields, children }: FieldDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<FieldType>(field?.type || 'text')
  const [options, setOptions] = useState<string[]>(
    (field?.config as { options?: string[] })?.options || []
  )
  const [newOption, setNewOption] = useState('')
  const [targetEntity, setTargetEntity] = useState<string>(
    (field?.config as { targetEntity?: string })?.targetEntity || ''
  )
  const [expression, setExpression] = useState<string>(
    (field?.config as { expression?: string })?.expression || ''
  )
  const [maxFiles, setMaxFiles] = useState<number>(
    (field?.config as { maxFiles?: number })?.maxFiles || 5
  )
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertFieldReference = (fieldName: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setExpression(prev => prev + `{{${fieldName}}}`)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = expression.slice(0, start) + `{{${fieldName}}}` + expression.slice(end)
    setExpression(newValue)
    requestAnimationFrame(() => {
      textarea.focus()
      const newPos = start + fieldName.length + 4
      textarea.setSelectionRange(newPos, newPos)
    })
  }

  const isRestore = !!field && !!archived
  const isEdit = !!field && !archived
  
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FieldFormData>({
    resolver: zodResolver(fieldSchema),
    defaultValues: {
      name: field?.name || '',
      type: field?.type || 'text',
      required: field?.required || false,
      showInList: field?.showInList || false,
      config: field?.config || null,
    },
  })
  
  useEffect(() => {
    setValue('type', selectedType)
  }, [selectedType, setValue])
  
  const handleFormSubmit = async (data: FieldFormData) => {
    // Build config based on type
    let config: FieldConfig = null
    if (selectedType === 'single_select' || selectedType === 'multi_select') {
      config = { options }
    } else if (selectedType === 'lookup') {
      config = { targetEntity: targetEntity as EntityType }
    } else if (selectedType === 'formula') {
      config = { expression }
    } else if (selectedType === 'file') {
      config = { maxFiles, maxSize: 10485760 }
    }
    
    const submitData = { ...data, config, entityType }
    
    if (isRestore && field) {
      await restoreFieldDefinition(field.id)
    } else if (isEdit && field) {
      await updateFieldDefinition(field.id, submitData)
    } else {
      await createFieldDefinition(submitData)
    }
    
    setOpen(false)
    window.location.reload()
  }
  
  const handleRestore = async () => {
    if (!field) return
    await restoreFieldDefinition(field.id)
    setOpen(false)
    window.location.reload()
  }
  
  const addOption = () => {
    if (newOption.trim()) {
      setOptions([...options, newOption.trim()])
      setNewOption('')
    }
  }
  
  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index))
  }
  
  // Dev-only alarm: Radix `asChild` renders nothing (silently) when the child is
  // not a valid element. The return value is intentionally ignored - the render
  // path must stay identical, the structural repair lives at the call site.
  warnIfInvalidTriggerChild(children, 'FieldDialog')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isRestore ? `Restore "${field?.name}"` : isEdit ? 'Edit Field' : 'Add Custom Field'}
          </DialogTitle>
        </DialogHeader>
        
        {isRestore ? (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Restore this field? It will become available again on {entityType} records.
            </p>
            <Button onClick={handleRestore} className="w-full">Restore Field</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Field Name</Label>
              <Input id="name" {...register('name')} placeholder="e.g., Annual Revenue" />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="type">Field Type</Label>
              <Select value={selectedType} onValueChange={(v) => setSelectedType(v as FieldType)} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map(ft => (
                    <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Type-specific config */}
            {(selectedType === 'single_select' || selectedType === 'multi_select') && (
              <div className="space-y-2">
                <Label>Options</Label>
                <div className="flex gap-2">
                  <Input 
                    value={newOption} 
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Add option..."
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  />
                  <Button type="button" onClick={addOption} variant="secondary">Add</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm">
                      {opt}
                      <button type="button" onClick={() => removeOption(i)} className="text-muted-foreground hover:text-foreground">&times;</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {selectedType === 'lookup' && (
              <div className="space-y-2">
                <Label>Target Entity</Label>
                <Select value={targetEntity} onValueChange={setTargetEntity}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select entity..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organization">Organization</SelectItem>
                    <SelectItem value="person">Person</SelectItem>
                    <SelectItem value="deal">Deal</SelectItem>
                    <SelectItem value="activity">Activity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {selectedType === 'formula' && (
              <div className="space-y-2">
                <Label>Formula Expression</Label>
                <Textarea
                  ref={textareaRef}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder='e.g., {{Annual Revenue}} * 0.1'
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{{Field Name}}'} to reference other fields. Functions: MATH, TEXT, DATE, LOGIC
                </p>
                {availableFields && availableFields.filter(f => f.type !== 'formula' && f.id !== field?.id).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Available fields — click to insert:</p>
                    <div className="flex flex-wrap gap-1">
                      {availableFields
                        .filter(f => f.type !== 'formula' && f.id !== field?.id)
                        .map(f => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => insertFieldReference(f.name)}
                            className="text-xs px-2 py-0.5 rounded border bg-muted hover:bg-accent transition-colors font-mono"
                          >
                            {`{{${f.name}}}`}
                          </button>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {selectedType === 'file' && (
              <div className="space-y-2">
                <Label htmlFor="maxFiles">Max Files</Label>
                <Input 
                  id="maxFiles"
                  type="number"
                  value={maxFiles}
                  onChange={(e) => setMaxFiles(parseInt(e.target.value) || 5)}
                  min={1}
                  max={20}
                />
              </div>
            )}
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="required"
                  checked={watch('required')}
                  onCheckedChange={(checked) => setValue('required', !!checked)}
                />
                <Label htmlFor="required">Required field</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="showInList"
                  checked={watch('showInList')}
                  onCheckedChange={(checked) => setValue('showInList', !!checked)}
                />
                <Label htmlFor="showInList">Show in list views</Label>
              </div>
            </div>
            
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isEdit ? 'Save Changes' : 'Create Field'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
