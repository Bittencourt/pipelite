"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
import { useTranslations } from "next-intl"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover"
import { Search, Loader2, Building2, User, DollarSign } from "lucide-react"
import { SearchResultItem } from "./search-result-item"
import { Input } from "@/components/ui/input"
import { useHotkeys } from "react-hotkeys-hook"

interface SearchResults {
  organizations: Array<{ id: string; name: string }>
  people: Array<{
    id: string
    firstName: string
    lastName: string
    organizationId: string | null
    organizationName: string | null
  }>
  deals: Array<{ id: string; title: string; stageId: string; stageName: string }>
}

export function GlobalSearch() {
  const router = useRouter()
  const t = useTranslations("common")
  const tNav = useTranslations("nav")
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useHotkeys("/", (e) => {
    e.preventDefault()
    inputRef.current?.focus()
  }, { scopes: ["global"], enableOnFormTags: true, useKey: true })

  const fetchResults = useDebouncedCallback(async (term: string) => {
    if (!term.trim()) {
      setResults(null)
      setOpen(false)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`)
      if (res.ok) {
        const data: SearchResults = await res.json()
        setResults(data)
        setOpen(true)
      }
    } catch (error) {
      console.error("Search failed:", error)
    } finally {
      setLoading(false)
    }
  }, 300)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    fetchResults(value)
  }

  const handleSelect = (href: string) => {
    setQuery("")
    setResults(null)
    setOpen(false)
    router.push(href)
  }

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape" && open) {
        e.preventDefault()
        setOpen(false)
        return
      }

      // When the dropdown is closed, prevent arrow/Enter events from reaching
      // the cmdk root (which would call preventDefault on them for no reason).
      if (!open) {
        if (
          e.key === "ArrowDown" ||
          e.key === "ArrowUp" ||
          e.key === "Enter" ||
          e.key === "Home" ||
          e.key === "End"
        ) {
          e.stopPropagation()
        }
      }
    },
    [open]
  )

  const hasResults =
    results &&
    (results.organizations.length > 0 ||
      results.people.length > 0 ||
      results.deals.length > 0)

  return (
    <Command
      shouldFilter={false}
      loop
      className="relative h-auto w-auto flex-none overflow-visible rounded-none border-0 bg-transparent"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="search"
              placeholder={`${t("search")}... (/)`}
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              className="w-64 pl-9 pr-9"
            />
            {loading && (
              <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-80 p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <CommandList>
            {hasResults ? (
              <>
                {results!.organizations.length > 0 && (
                  <CommandGroup heading={tNav("organizations")}>
                    {results!.organizations.map((org) => (
                      <CommandItem
                        key={org.id}
                        value={org.id}
                        onSelect={() => handleSelect(`/organizations/${org.id}`)}
                      >
                        <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SearchResultItem
                          label={org.name}
                          detail={tNav("organizations")}
                          query={query}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {results!.people.length > 0 && (
                  <CommandGroup heading={tNav("people")}>
                    {results!.people.map((person) => (
                      <CommandItem
                        key={person.id}
                        value={person.id}
                        onSelect={() => handleSelect(`/people/${person.id}`)}
                      >
                        <User className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SearchResultItem
                          label={`${person.firstName} ${person.lastName}`}
                          detail={person.organizationName || t("noResults")}
                          query={query}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {results!.deals.length > 0 && (
                  <CommandGroup heading={tNav("deals")}>
                    {results!.deals.map((deal) => (
                      <CommandItem
                        key={deal.id}
                        value={deal.id}
                        onSelect={() => handleSelect(`/deals/${deal.id}`)}
                      >
                        <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SearchResultItem
                          label={deal.title}
                          detail={deal.stageName}
                          query={query}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            ) : (
              <CommandEmpty>
                {t("noResults")}
              </CommandEmpty>
            )}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  )
}
