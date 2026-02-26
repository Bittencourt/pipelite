"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { X, Search, Loader2, Pencil } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { searchEntities, getEntityById } from "@/lib/fetch-entities"
import type { CustomFieldDefinition, LookupConfig, EntityType } from "@/db/schema"

interface LookupFieldProps {
  definition: CustomFieldDefinition
  value: string | null | undefined
  onSave: (value: string | null) => Promise<void>
  disabled?: boolean
}

export function LookupField({ definition, value, onSave, disabled }: LookupFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const config = definition.config as LookupConfig | null
  const targetEntity = config?.targetEntity || "organization"

  // Load selected entity name on mount
  useEffect(() => {
    if (value && !selectedName) {
      getEntityById(targetEntity, value).then((entity) => {
        if (entity) setSelectedName(entity.name)
      })
    }
  }, [value, targetEntity, selectedName])

  // Reset selected name when value becomes null
  useEffect(() => {
    if (!value) {
      setSelectedName(null)
    }
  }, [value])

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  // Search on input with debounce
  useEffect(() => {
    if (!isEditing || search.length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const entities = await searchEntities(targetEntity, search)
        setResults(entities)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search, isEditing, targetEntity])

  // Handle click outside to close
  useEffect(() => {
    if (!isEditing) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsEditing(false)
        setSearch("")
        setResults([])
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isEditing])

  const handleSelect = useCallback(async (id: string, name: string) => {
    setIsSaving(true)
    try {
      await onSave(id)
      setSelectedName(name)
      setIsEditing(false)
      setSearch("")
      setResults([])
    } finally {
      setIsSaving(false)
    }
  }, [onSave])

  const handleClear = useCallback(async () => {
    setIsSaving(true)
    try {
      await onSave(null)
      setSelectedName(null)
    } finally {
      setIsSaving(false)
    }
  }, [onSave])

  const handleStartEdit = useCallback(() => {
    if (disabled || isSaving) return
    setIsEditing(true)
    setSearch("")
    setResults([])
  }, [disabled, isSaving])

  const entityLabels: Record<EntityType, string> = {
    organization: "Organization",
    person: "Person",
    deal: "Deal",
    activity: "Activity",
  }

  if (isEditing) {
    return (
      <div ref={containerRef} className="relative py-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${entityLabels[targetEntity].toLowerCase()}...`}
            className="pl-9 h-8"
            autoFocus
            disabled={isSaving}
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {results.length > 0 && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 border rounded-md bg-popover shadow-md max-h-40 overflow-auto">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                onClick={() => handleSelect(result.id, result.name)}
              >
                {result.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsEditing(false)
              setSearch("")
              setResults([])
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (selectedName) {
    return (
      <div className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/50">
        <span className="text-sm font-medium flex-1 truncate">{selectedName}</span>
        <span className="text-xs text-muted-foreground">({entityLabels[targetEntity]})</span>
        {!disabled && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={handleStartEdit}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={handleClear}
              disabled={isSaving}
            >
              <X className="h-3 w-3" />
            </Button>
          </>
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
      <Search className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground flex-1">
        Link {entityLabels[targetEntity]}
      </span>
      {!disabled && (
        <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
      )}
    </button>
  )
}
