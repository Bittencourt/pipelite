"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { X, Search, Loader2, Pencil } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const inputWrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const config = definition.config as LookupConfig | null
  const targetEntity = config?.targetEntity || "organization"

  // Load selected entity name when value changes
  useEffect(() => {
    if (value) {
      getEntityById(targetEntity, value).then((entity) => {
        if (entity) setSelectedName(entity.name)
      })
    } else {
      setSelectedName(null)
    }
  }, [value, targetEntity])

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  // Update dropdown position on scroll/resize
  useEffect(() => {
    if (!isEditing || !inputWrapperRef.current) return

    const updatePosition = () => {
      if (inputWrapperRef.current) {
        const rect = inputWrapperRef.current.getBoundingClientRect()
        setDropdownPosition({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        })
      }
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
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
      } catch (error) {
        console.error('Search failed:', error)
        setResults([])
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
      const target = e.target as Node
      // Check if click is outside both the container and the dropdown portal
      if (containerRef.current && !containerRef.current.contains(target)) {
        // Also check if clicking on the dropdown (which is in a portal)
        const dropdown = document.getElementById(`lookup-dropdown-${definition.id}`)
        if (dropdown && !dropdown.contains(target)) {
          setIsEditing(false)
          setSearch("")
          setResults([])
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isEditing, definition.id])

  const handleSelect = useCallback(async (id: string, name: string) => {
    setIsSaving(true)
    try {
      await onSave(id)
      setSelectedName(name)
      setIsEditing(false)
      setSearch("")
      setResults([])
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setIsSaving(false)
    }
  }, [onSave])

  const handleClear = useCallback(async () => {
    setIsSaving(true)
    try {
      await onSave(null)
      setSelectedName(null)
    } catch (error) {
      console.error('Failed to clear:', error)
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

  // Dropdown component rendered via portal
  const dropdownContent = isEditing && (results.length > 0 || (search.length >= 2 && !isSearching && results.length === 0)) ? (
    <div
      id={`lookup-dropdown-${definition.id}`}
      className="fixed z-[9999] border rounded-md bg-popover shadow-lg max-h-40 overflow-auto"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
      }}
    >
      {results.length > 0 ? (
        results.map((result) => (
          <button
            key={result.id}
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
            onClick={() => handleSelect(result.id, result.name)}
          >
            {result.name}
          </button>
        ))
      ) : (
        <div className="px-3 py-2 text-sm text-muted-foreground">
          No {entityLabels[targetEntity].toLowerCase()}s found
        </div>
      )}
    </div>
  ) : null

  return (
    <div className="py-2">
      <Label className="text-sm text-muted-foreground">
        {definition.name}
        {definition.required && " *"}
      </Label>
      
      {isEditing ? (
        <div ref={containerRef}>
          <div ref={inputWrapperRef} className="relative">
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
      ) : selectedName ? (
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
      ) : (
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
      )}
      
      {/* Render dropdown via portal to avoid clipping issues */}
      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  )
}
