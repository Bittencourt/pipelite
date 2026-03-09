"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { searchEntities, getEntityById } from "@/lib/fetch-entities"
import type { EntityType } from "@/db/schema"

interface EntityComboboxProps {
  entityType: EntityType
  value: string | null | undefined
  onChange: (value: string | null) => void
  placeholder?: string
  clearLabel?: string
  disabled?: boolean
  className?: string
}

export function EntityCombobox({
  entityType,
  value,
  onChange,
  placeholder,
  clearLabel = "None",
  disabled = false,
  className,
}: EntityComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resolve name for an existing value
  useEffect(() => {
    if (!value) {
      setSelectedName(null)
      return
    }
    getEntityById(entityType, value).then((entity) => {
      setSelectedName(entity ? entity.name : null)
    })
  }, [value, entityType])

  // Load initial results when popover opens, or search on input change
  const runSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        setIsSearching(true)
        try {
          const entities = await searchEntities(entityType, query)
          setResults(entities)
        } catch {
          setResults([])
        } finally {
          setIsSearching(false)
        }
      }, query === "" ? 0 : 300)
    },
    [entityType]
  )

  // When popover opens, load initial results immediately
  useEffect(() => {
    if (open) {
      setSearch("")
      runSearch("")
    } else {
      setSearch("")
      setResults([])
    }
  }, [open, runSearch])

  // When search changes (after initial open), debounce the search
  useEffect(() => {
    if (!open) return
    // Skip the initial load (handled by the open effect above)
    if (search === "" && results.length > 0) return
    runSearch(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const handleSelect = (id: string, name: string) => {
    onChange(id)
    setSelectedName(name)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
    setSelectedName(null)
  }

  const displayText = selectedName ?? placeholder ?? `Select ${entityType}...`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selectedName && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{displayText}</span>
          <span className="ml-2 flex items-center gap-1 shrink-0">
            {selectedName && !disabled && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Search ${entityType}...`}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isSearching ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>No {entityType}s found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__none__"
                    onSelect={() => {
                      onChange(null)
                      setSelectedName(null)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")}
                    />
                    {clearLabel}
                  </CommandItem>
                  {results.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={result.id}
                      onSelect={() => handleSelect(result.id, result.name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === result.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {result.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
