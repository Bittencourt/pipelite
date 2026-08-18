"use client"

import { useTranslations } from "next-intl"
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command"
import { Building2, User, DollarSign } from "lucide-react"
import { SearchResultItem } from "./search-result-item"

/**
 * The shape of the `/api/search` payload, and of the results state each search surface holds.
 *
 * It lives here rather than beside the popover because this module is the only place that reads it
 * structurally; both surfaces just hold it and hand it over.
 */
export interface SearchResultsData {
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

interface SearchResultsProps {
  results: SearchResultsData | null
  hasResults: boolean
  query: string
  onSelect: (href: string) => void
}

/**
 * The three result groups and the no-results fallback, shared by every search surface.
 *
 * ONE TREE, TWO SURFACES. This is deliberately the only copy: a second one is how the desktop
 * popover and the mobile dialog drift apart, silently, one bug fix at a time. So this module is
 * purely presentational — it holds no state, fetches nothing, and never touches the router.
 *
 * `onSelect` is a prop for exactly that reason: each surface has its own idea of what selecting a
 * result means. The popover closes the popover and navigates; the dialog closes the dialog and
 * navigates. Two behaviours, one tree.
 *
 * The list wrapper is NOT part of this unit. Each surface renders its own, because the dialog puts
 * its input and list directly inside `CommandDialog` while the popover keeps its own outer
 * `<Command>`.
 *
 * Every item's `value` is a UUID, which only works because each surface's `<Command>` turns cmdk's
 * client-side filter off — cmdk filters against that `value`, so with the filter on, typing a name
 * would match nothing at all.
 */
export function SearchResults({
  results,
  hasResults,
  query,
  onSelect,
}: SearchResultsProps) {
  const t = useTranslations("common")
  const tNav = useTranslations("nav")

  return hasResults ? (
    <>
      {results!.organizations.length > 0 && (
        <CommandGroup heading={tNav("organizations")}>
          {results!.organizations.map((org) => (
            <CommandItem
              key={org.id}
              value={org.id}
              onSelect={() => onSelect(`/organizations/${org.id}`)}
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
              onSelect={() => onSelect(`/people/${person.id}`)}
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
              onSelect={() => onSelect(`/deals/${deal.id}`)}
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
  )
}
