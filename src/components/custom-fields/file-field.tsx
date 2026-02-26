'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, X, Download, GripVertical, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CustomFieldDefinition, FileConfig } from '@/db/schema'

export interface FileItem {
  id: string
  filename: string
  storedName: string
  path: string
  publicUrl: string
  size: number
  mimeType: string
}

interface FileFieldProps {
  definition: CustomFieldDefinition
  value: FileItem[] | null
  entityId: string
  onSave: (value: FileItem[] | null) => Promise<void>
  disabled?: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️'
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.includes('document') || mimeType.includes('word')) return '📝'
  return '📎'
}

function SortableFile({ 
  file, 
  onDownload, 
  onDelete,
  disabled 
}: { 
  file: FileItem
  onDownload: () => void
  onDelete: () => void
  disabled?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.id })
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-2 border rounded bg-background">
      {!disabled && (
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" {...attributes} {...listeners} />
      )}
      <span className="text-lg">{getFileIcon(file.mimeType)}</span>
      <div className="flex-1 min-w-0">
        <button 
          onClick={onDownload}
          className="text-sm font-medium text-blue-600 hover:underline truncate block text-left"
        >
          {file.filename}
        </button>
        <div className="text-xs text-muted-foreground">{formatSize(file.size)}</div>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDownload}>
        <Download className="h-3.5 w-3.5" />
      </Button>
      {!disabled && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

export function FileField({ definition, value, entityId, onSave, disabled }: FileFieldProps) {
  const [files, setFiles] = useState<FileItem[]>(value || [])
  const [uploading, setUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const config = definition.config as FileConfig | null
  const maxFiles = config?.maxFiles || 5
  const maxSize = config?.maxSize || 10485760 // 10MB
  
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (files.length >= maxFiles) {
      alert(`Maximum ${maxFiles} files allowed`)
      return
    }
    
    if (file.size > maxSize) {
      alert(`File too large. Max: ${formatSize(maxSize)}`)
      return
    }
    
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('entityId', entityId)
      formData.append('fieldName', definition.name)
      
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(errorData.error || `Upload failed with status ${res.status}`)
      }
      
      const data = await res.json()
      
      if (data.success) {
        const newFiles = [...files, data.file]
        setFiles(newFiles)
        await onSave(newFiles)
      } else {
        throw new Error(data.error || 'Upload failed')
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [files, maxFiles, maxSize, entityId, definition.name, onSave])
  
  const handleDelete = async (fileId: string) => {
    const file = files.find(f => f.id === fileId)
    if (!file) return
    
    if (!confirm(`Delete "${file.filename}"?`)) return
    
    setIsSaving(true)
    try {
      // Delete from storage
      await fetch(file.publicUrl, { method: 'DELETE' })
      
      // Update local state
      const newFiles = files.filter(f => f.id !== fileId)
      setFiles(newFiles)
      await onSave(newFiles.length > 0 ? newFiles : null)
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleDownload = (file: FileItem) => {
    window.open(file.publicUrl, '_blank')
  }
  
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = files.findIndex(f => f.id === active.id)
      const newIndex = files.findIndex(f => f.id === over.id)
      const reordered = [...files]
      const [removed] = reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, removed)
      setFiles(reordered)
      await onSave(reordered)
    }
  }
  
  return (
    <div className="py-2 space-y-3">
      <Label className="text-sm text-muted-foreground">{definition.name}</Label>
      
      {files.length > 0 && (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={files.map(f => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {files.map(file => (
                <SortableFile
                  key={file.id}
                  file={file}
                  disabled={disabled || isSaving}
                  onDownload={() => handleDownload(file)}
                  onDelete={() => handleDelete(file.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      
      {files.length < maxFiles && !disabled && (
        <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded cursor-pointer hover:bg-muted/50 transition-colors">
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              <span className="text-sm">Upload file</span>
            </>
          )}
          <input 
            ref={fileInputRef}
            type="file" 
            className="hidden" 
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      )}
      
      {files.length === 0 && !disabled && (
        <div className="text-sm text-muted-foreground italic">No files uploaded</div>
      )}
    </div>
  )
}
