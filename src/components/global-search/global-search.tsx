"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useDebouncedCallback } from "use-debounce"
import { useTranslations } from "next-intl"
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover"
import { Search, Loader2 } from "lucide-react"
import { SearchResults, type SearchResultsData } from "./search-results"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useHotkeys } from "react-hotkeys-hook"

/**
 * Tailwind's `md`. KEEP THIS IN SYNC WITH THE TAILWIND CONFIG — a media-query string cannot read it,
 * so the number is duplicated by necessity. It is the header's ONE collapse point: the main nav in
 * `nav-header.tsx` collapses at the same width via `hidden md:flex`.
 *
 * It is read at EVENT TIME, inside the hotkey handler, and nowhere else. A hook that tracked it in
 * state would report `false` on the server and the truth only after an effect, which is either a
 * hydration mismatch or a lint error at severity 2 in this repo. Reading it in the handler runs
 * neither during render nor in an effect, so it costs neither.
 */
const MD_QUERY = "(min-width: 768px)"

/**
 * One request, shared by both surfaces.
 *
 * A non-OK response returns null rather than throwing, which is what preserves the desktop
 * popover's long-standing behaviour: a failed request leaves the previous results and the previous
 * open state exactly as they were, rather than blanking the list under the user's cursor.
 */
async function runSearch(term: string): Promise<SearchResultsData | null> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`)
    if (!res.ok) return null
    return (await res.json()) as SearchResultsData
  } catch (error) {
    console.error("Search failed:", error)
    return null
  }
}

/** Whether a payload has anything at all to show, across all three entity groups. */
function hasAnyResult(results: SearchResultsData | null): boolean {
  return Boolean(
    results &&
      (results.organizations.length > 0 ||
        results.people.length > 0 ||
        results.deals.length > 0)
  )
}

/**
 * The global search, as two surfaces over one results tree.
 *
 * BOTH ARE ALWAYS RENDERED AND CSS CHOOSES BETWEEN THEM. The inline input's wrapper is
 * `hidden md:block` and the icon trigger is `md:hidden`, so exactly one is in the header's flex row
 * at any width, and neither the server nor the client ever has to know which.
 *
 * Below `md` the inline input is not merely narrower — it is absent from the row. `w-64` is 256px,
 * and at a 320px viewport the document reports a 305px client width of which the container gutter
 * takes 64. A proportionally shrunken input would technically fit and would be unusable; taking the
 * whole wrapper out of the row is what removes the overflow.
 *
 * The two surfaces deliberately keep SEPARATE query state. Sharing it would drive the popover's
 * `open` from text typed into the dialog, and the popover is anchored to a wrapper that is
 * `display: none` at that width — Radix would then position a floating panel against a zero-sized
 * node. Separate state is also what lets the dialog reset itself on every open.
 */
export function GlobalSearch() {
  const router = useRouter()
  const t = useTranslations("common")
  const tNav = useTranslations("nav")
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResultsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogQuery, setDialogQuery] = useState("")
  const [dialogResults, setDialogResults] = useState<SearchResultsData | null>(
    null
  )
  const [dialogLoading, setDialogLoading] = useState(false)

  const fetchResults = useDebouncedCallback(async (term: string) => {
    if (!term.trim()) {
      setResults(null)
      setOpen(false)
      return
    }

    setLoading(true)
    try {
      const data = await runSearch(term)
      if (data) {
        setResults(data)
        setOpen(true)
      }
    } finally {
      setLoading(false)
    }
  }, 300)

  const fetchDialogResults = useDebouncedCallback(async (term: string) => {
    if (!term.trim()) {
      setDialogResults(null)
      return
    }

    setDialogLoading(true)
    try {
      const data = await runSearch(term)
      if (data) setDialogResults(data)
    } finally {
      setDialogLoading(false)
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

  /**
   * Opening and closing both reset the dialog, and both cancel any pending request.
   *
   * The cancel is what keeps a closed dialog from searching: a debounced call scheduled by the last
   * keystroke would otherwise fire after the surface holding its results had gone. Resetting on the
   * way IN matters for the same reason from the other side — a response that landed after the
   * previous close would leave stale results waiting behind an empty query.
   */
  const handleDialogOpenChange = (next: boolean) => {
    fetchDialogResults.cancel()
    setDialogOpen(next)
    setDialogQuery("")
    setDialogResults(null)
    setDialogLoading(false)
  }

  useHotkeys("/", (e) => {
    e.preventDefault()

    if (window.matchMedia(MD_QUERY).matches) {
      inputRef.current?.focus()
      return
    }

    handleDialogOpenChange(true)
  }, { scopes: ["global"], useKey: true })

  const handleDialogQueryChange = (value: string) => {
    setDialogQuery(value)
    fetchDialogResults(value)
  }

  const handleDialogSelect = (href: string) => {
    handleDialogOpenChange(false)
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

  return (
    <>
      <Command
        shouldFilter={false}
        loop
        className="relative h-auto w-auto flex-none overflow-visible rounded-none border-0 bg-transparent"
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div className="relative hidden md:block">
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
              <SearchResults
                results={results}
                hasResults={hasAnyResult(results)}
                query={query}
                onSelect={handleSelect}
              />
            </CommandList>
          </PopoverContent>
        </Popover>
      </Command>

      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="md:hidden"
        aria-label={t("search")}
        onClick={() => handleDialogOpenChange(true)}
      >
        <Search className="h-4 w-4" />
      </Button>

      <CommandDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        title={t("search")}
        description={tNav("searchDescription")}
        showCloseButton={false}
        shouldFilter={false}
        loop
      >
        <CommandInput
          placeholder={`${t("search")}...`}
          value={dialogQuery}
          onValueChange={handleDialogQueryChange}
        />
        <CommandList>
          {dialogLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <SearchResults
              results={dialogResults}
              hasResults={hasAnyResult(dialogResults)}
              query={dialogQuery}
              onSelect={handleDialogSelect}
            />
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
