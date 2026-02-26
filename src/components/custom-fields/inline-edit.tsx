"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Loader2, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"

interface InlineEditProps<T = string> {
  value: T | null | undefined
  onSave: (value: T) => Promise<void>
  displayFormatter?: (value: T | null | undefined) => string
  renderInput: (props: {
    value: T
    onChange: (value: T) => void
    onKeyDown: (e: React.KeyboardEvent) => void
    disabled: boolean
    inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  }) => React.ReactNode
  disabled?: boolean
  placeholder?: string
  className?: string
  emptyLabel?: string
}

export function InlineEdit<T = string>({
  value,
  onSave,
  displayFormatter,
  renderInput,
  disabled = false,
  placeholder = "Click to edit",
  className,
  emptyLabel = "—",
}: InlineEditProps<T>) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editValue, setEditValue] = useState<T>(value as T)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // Reset edit value when external value changes
  useEffect(() => {
    setEditValue(value as T)
  }, [value])

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      // Select all text for input elements
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select()
      }
    }
  }, [isEditing])

  const handleStartEdit = useCallback(() => {
    if (disabled || isSaving) return
    setEditValue(value as T)
    setIsEditing(true)
  }, [disabled, isSaving, value])

  const handleCancel = useCallback(() => {
    setEditValue(value as T)
    setIsEditing(false)
  }, [value])

  const handleSave = useCallback(async () => {
    if (isSaving) return
    
    setIsSaving(true)
    try {
      await onSave(editValue)
      setIsEditing(false)
    } catch (error) {
      // Reset value on error, let parent handle toast
      setEditValue(value as T)
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [editValue, isSaving, onSave, value])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      e.preventDefault()
      handleCancel()
    }
  }, [handleSave, handleCancel])

  // Display value
  const displayValue = displayFormatter 
    ? displayFormatter(value) 
    : String(value ?? "")

  if (isEditing) {
    return (
      <div className={cn("relative", className)}>
        {renderInput({
          value: editValue,
          onChange: setEditValue,
          onKeyDown: handleKeyDown,
          disabled: isSaving,
          inputRef,
        })}
        {isSaving && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleStartEdit}
      disabled={disabled}
      className={cn(
        "group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors",
        "hover:bg-accent/50",
        disabled && "cursor-not-allowed opacity-50",
        !disabled && "cursor-pointer",
        className
      )}
    >
      <span className={cn(
        "flex-1 truncate",
        !displayValue && "text-muted-foreground"
      )}>
        {displayValue || placeholder}
      </span>
      {!disabled && (
        <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
      )}
    </button>
  )
}

// Specialized version for text input
interface InlineTextEditProps {
  value: string | null | undefined
  onSave: (value: string) => Promise<void>
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function InlineTextEdit({
  value,
  onSave,
  ...props
}: InlineTextEditProps) {
  return (
    <InlineEdit
      value={value}
      onSave={onSave}
      renderInput={({ value: editValue, onChange, onKeyDown, disabled, inputRef }) => (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          onBlur={(e) => {
            // Save on blur unless we're clicking away
            if (!e.relatedTarget) {
              onKeyDown({ key: "Enter", preventDefault: () => {} } as React.KeyboardEvent)
            }
          }}
        />
      )}
      {...props}
    />
  )
}
