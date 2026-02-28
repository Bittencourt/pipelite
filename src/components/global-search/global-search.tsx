"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
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
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

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

  const hasResults =
    results &&
    (results.organizations.length > 0 ||
      results.people.length > 0 ||
      results.deals.length > 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            value={query}
            onChange={handleInputChange}
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
        <Command shouldFilter={false}>
          <CommandList>
            {hasResults ? (
              <>
                {results!.organizations.length > 0 && (
                  <CommandGroup heading="Organizations">
                    {results!.organizations.map((org) => (
                      <CommandItem
                        key={org.id}
                        value={org.id}
                        onSelect={() => handleSelect(`/organizations/${org.id}`)}
                      >
                        <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SearchResultItem
                          label={org.name}
                          detail="Organization"
                          query={query}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {results!.people.length > 0 && (
                  <CommandGroup heading="People">
                    {results!.people.map((person) => (
                      <CommandItem
                        key={person.id}
                        value={person.id}
                        onSelect={() => handleSelect(`/people/${person.id}`)}
                      >
                        <User className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SearchResultItem
                          label={`${person.firstName} ${person.lastName}`}
                          detail={person.organizationName || "No organization"}
                          query={query}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {results!.deals.length > 0 && (
                  <CommandGroup heading="Deals">
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
                No results for &quot;{query}&quot;
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
