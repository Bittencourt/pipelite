import React from "react"

/**
 * Highlights matching text with a yellow background.
 * Case-insensitive matching.
 */
export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) {
    return text
  }

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const matchIndex = lowerText.indexOf(lowerQuery)

  if (matchIndex === -1) {
    return text
  }

  const before = text.slice(0, matchIndex)
  const match = text.slice(matchIndex, matchIndex + query.length)
  const after = text.slice(matchIndex + query.length)

  return (
    <>
      {before}
      <mark className="bg-yellow-100 text-foreground font-semibold rounded-sm px-0.5">
        {match}
      </mark>
      {after}
    </>
  )
}

interface SearchResultItemProps {
  label: string
  detail: string
  query: string
}

export function SearchResultItem({ label, detail, query }: SearchResultItemProps) {
  return (
    <div className="flex flex-col py-0.5">
      <span className="text-sm">{highlightMatch(label, query)}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  )
}
