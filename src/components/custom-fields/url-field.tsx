"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { ExternalLink, Loader2, Pencil } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { CustomFieldDefinition } from "@/db/schema"

interface UrlFieldProps {
  definition: CustomFieldDefinition
  value: string | null | undefined
  onSave: (value: string | null) => Promise<void>
  disabled?: boolean
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function formatUrl(url: string | null | undefined): string {
  if (!url) return ""
  // Truncate for display
  try {
    const parsed = new URL(url)
    const display = parsed.hostname + parsed.pathname
    return display.length > 40 ? display.slice(0, 40) + "..." : display
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "..." : url
  }
}

export function UrlField({ definition, value, onSave, disabled }: UrlFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editValue, setEditValue] = useState(value ?? "")
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset edit value when external value changes
  useEffect(() => {
    setEditValue(value ?? "")
  }, [value])

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = useCallback(() => {
    if (disabled || isSaving) return
    setError(null)
    setEditValue(value ?? "")
    setIsEditing(true)
  }, [disabled, isSaving, value])

  const handleCancel = useCallback(() => {
    setEditValue(value ?? "")
    setError(null)
    setIsEditing(false)
  }, [value])

  const handleSave = useCallback(async () => {
    if (isSaving) return
    
    setError(null)
    const trimmedValue = editValue.trim()
    
    if (trimmedValue && !isValidUrl(trimmedValue)) {
      // Try adding https://
      const withProtocol = `https://${trimmedValue}`
      if (isValidUrl(withProtocol)) {
        setIsSaving(true)
        try {
          await onSave(withProtocol)
          setIsEditing(false)
        } catch {
          setError("Failed to save")
        } finally {
          setIsSaving(false)
        }
        return
      }
      
      setError("Please enter a valid URL")
      return
    }
    
    setIsSaving(true)
    try {
      await onSave(trimmedValue || null)
      setIsEditing(false)
    } catch {
      setError("Failed to save")
    } finally {
      setIsSaving(false)
    }
  }, [editValue, isSaving, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      e.preventDefault()
      handleCancel()
    }
  }, [handleSave, handleCancel])

  // Handle click outside to cancel
  useEffect(() => {
    if (!isEditing) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleCancel()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isEditing, handleCancel])

  if (isEditing) {
    return (
      <div ref={containerRef} className="relative">
        <Input
          ref={inputRef}
          type="url"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          placeholder="https://example.com"
          className="h-8"
        />
        {isSaving && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <p className="text-xs text-destructive mt-1">{error}</p>
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
        !disabled && "cursor-pointer"
      )}
    >
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-blue-600 hover:underline flex-1 truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {formatUrl(value)}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <span className="text-muted-foreground flex-1">
          {definition.required ? `${definition.name} *` : `Enter ${definition.name.toLowerCase()}`}
        </span>
      )}
      {!disabled && (
        <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
      )}
    </button>
  )
}
