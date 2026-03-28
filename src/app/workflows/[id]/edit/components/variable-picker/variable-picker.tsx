"use client"

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react"
import type { VariableEntry } from "../../lib/variable-schema"

interface Props {
  variables: VariableEntry[]
  filter: string
  onSelect: (path: string) => void
  position: { top: number; left: number }
}

export interface VariablePickerHandle {
  handleKeyDown: (e: React.KeyboardEvent) => boolean
}

export const VariablePicker = forwardRef<VariablePickerHandle, Props>(
  function VariablePicker({ variables, filter, onSelect, position }, ref) {
    const [highlightedIndex, setHighlightedIndex] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)

    // Filter variables by filter string (case-insensitive match on path or label)
    const filtered = variables.filter((v) => {
      if (!filter) return true
      const lower = filter.toLowerCase()
      return (
        v.path.toLowerCase().includes(lower) ||
        v.label.toLowerCase().includes(lower)
      )
    })

    // Group filtered variables by group
    const groups: { group: string; entries: VariableEntry[] }[] = []
    const seen = new Set<string>()
    for (const entry of filtered) {
      if (!seen.has(entry.group)) {
        seen.add(entry.group)
        groups.push({ group: entry.group, entries: [] })
      }
      groups.find((g) => g.group === entry.group)!.entries.push(entry)
    }

    // Reset highlight when filter changes
    useEffect(() => {
      setHighlightedIndex(0)
    }, [filter])

    // Scroll highlighted item into view
    useEffect(() => {
      const el = listRef.current?.querySelector(`[data-index="${highlightedIndex}"]`)
      el?.scrollIntoView({ block: "nearest" })
    }, [highlightedIndex])

    // Expose keyboard handler to parent via imperative handle
    useImperativeHandle(ref, () => ({
      handleKeyDown(e: React.KeyboardEvent): boolean {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setHighlightedIndex((prev) => (prev + 1) % Math.max(filtered.length, 1))
          return true
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setHighlightedIndex((prev) =>
            prev <= 0 ? Math.max(filtered.length - 1, 0) : prev - 1,
          )
          return true
        }
        if (e.key === "Enter") {
          e.preventDefault()
          if (filtered[highlightedIndex]) {
            onSelect(filtered[highlightedIndex].path)
          }
          return true
        }
        return false
      },
    }))

    let flatIndex = 0

    return (
      <div
        ref={listRef}
        className="absolute z-50 max-h-60 w-72 overflow-y-auto rounded-md border bg-popover shadow-lg"
        style={{ top: position.top, left: position.left }}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No matching variables
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.group}>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                {group.group}
              </div>
              {group.entries.map((entry) => {
                const idx = flatIndex++
                return (
                  <div
                    key={entry.path}
                    data-index={idx}
                    className={`cursor-pointer px-3 py-1.5 ${
                      idx === highlightedIndex
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50"
                    }`}
                    // Use onMouseDown to prevent blur-before-click issue
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onSelect(entry.path)
                    }}
                  >
                    <div className="text-sm">{entry.label}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {`{{${entry.path}}}`}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    )
  },
)
