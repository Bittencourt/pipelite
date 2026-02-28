'use client'

import { useState } from 'react'
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { reorderFieldDefinitions, deleteFieldDefinition } from '@/app/admin/fields/actions'
import { FieldDialog } from './field-dialog'
import type { CustomFieldDefinition, EntityType } from '@/db/schema'

interface FieldsListProps {
  fields: CustomFieldDefinition[]
  entityType: EntityType
}

function SortableField({ field, entityType, allFields }: { field: CustomFieldDefinition; entityType: EntityType; allFields: CustomFieldDefinition[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  
  const typeLabels: Record<string, string> = {
    text: 'Text',
    number: 'Number',
    date: 'Date',
    boolean: 'Checkbox',
    single_select: 'Single Select',
    multi_select: 'Multi Select',
    file: 'File Upload',
    url: 'URL',
    lookup: 'Lookup',
    formula: 'Formula',
  }
  
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 border rounded bg-background">
      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" {...attributes} {...listeners} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{field.name}</span>
          {field.required && <Badge variant="secondary">Required</Badge>}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{typeLabels[field.type] || field.type}</span>
          <div className="flex items-center gap-1">
            <Checkbox checked={field.showInList} disabled className="h-3 w-3" />
            <span>Show in list</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-1">
        <FieldDialog field={field} entityType={entityType} availableFields={allFields}>
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        </FieldDialog>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={async () => {
            if (confirm(`Archive field "${field.name}"?`)) {
              await deleteFieldDefinition(field.id)
              window.location.reload()
            }
          }}
        >
          <Archive className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function FieldsList({ fields, entityType }: FieldsListProps) {
  const [items, setItems] = useState(fields)

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex(f => f.id === active.id)
      const newIndex = items.findIndex(f => f.id === over.id)
      const reordered = arrayMove(items, oldIndex, newIndex)
      setItems(reordered)

      await reorderFieldDefinitions(entityType, reordered.map(f => f.id))
    }
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(f => f.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map(field => (
            <SortableField key={field.id} field={field} entityType={entityType} allFields={items} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
