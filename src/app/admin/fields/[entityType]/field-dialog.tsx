'use client'

import { useState, useEffect } from 'react'
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

interface FieldDialogProps {
  entityType: EntityType
  field?: CustomFieldDefinition
  children: React.ReactNode
}

export function FieldDialog({ entityType, field, children }: FieldDialogProps) {
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
  
  const isRestore = !!field?.deletedAt
  const isEdit = !!field && !field.deletedAt
  
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FieldFormData>({
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
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder='e.g., {{Annual Revenue}} * 0.1'
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{{Field Name}}'} to reference other fields. Functions: MATH, TEXT, DATE, LOGIC
                </p>
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
                <Checkbox id="required" {...register('required')} />
                <Label htmlFor="required">Required field</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="showInList" {...register('showInList')} />
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
