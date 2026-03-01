"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useHotkeys } from "react-hotkeys-hook"

interface UseDataTableKeyboardProps<T> {
  data: T[]
  onEdit?: (item: T) => void
  onDelete?: (item: T) => void
  onOpen?: (item: T) => void
  onCreate?: () => void
  getId: (item: T) => string
}

interface UseDataTableKeyboardReturn<T> {
  selectedIndex: number
  selectedItem: T | null
  containerProps: {
    ref: React.RefCallback<HTMLElement>
    tabIndex: number
    "data-keyboard-nav": string
  }
  rowProps: (index: number) => {
    "data-selected": boolean
    className?: string
    onClick: () => void
  }
}

export function useDataTableKeyboard<T>({
  data,
  onEdit,
  onDelete,
  onOpen,
  onCreate,
  getId,
}: UseDataTableKeyboardProps<T>): UseDataTableKeyboardReturn<T> {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerElRef = useRef<HTMLElement | null>(null)

  const selectedItem = data[selectedIndex] || null

  // Reset selection if data changes and selection is out of bounds
  useEffect(() => {
    if (selectedIndex >= data.length && data.length > 0) {
      setSelectedIndex(data.length - 1)
    }
  }, [data.length, selectedIndex])

  // Scroll selected row into view
  useEffect(() => {
    if (!containerElRef.current) return
    const selectedRow = containerElRef.current.querySelector(
      '[data-selected="true"]'
    )
    if (selectedRow) {
      selectedRow.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  // Check if focus is inside a form element
  const isFormFocused = useCallback(() => {
    const active = document.activeElement
    if (!active) return false
    const tag = active.tagName
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      active.getAttribute("contenteditable") === "true"
    )
  }, [])

  const containerRef = useHotkeys<HTMLElement>(
    "j, down",
    () => {
      if (isFormFocused()) return
      setSelectedIndex((i) => Math.min(i + 1, data.length - 1))
    },
    { enableOnFormTags: false }
  )

  useHotkeys(
    "k, up",
    () => {
      if (isFormFocused()) return
      setSelectedIndex((i) => Math.max(i - 1, 0))
    },
    { enableOnFormTags: false }
  )

  useHotkeys(
    "enter",
    () => {
      if (isFormFocused()) return
      if (selectedItem && onOpen) onOpen(selectedItem)
    },
    { enableOnFormTags: false }
  )

  useHotkeys(
    "e",
    () => {
      if (isFormFocused()) return
      if (selectedItem && onEdit) onEdit(selectedItem)
    },
    { enableOnFormTags: false }
  )

  useHotkeys(
    "d",
    () => {
      if (isFormFocused()) return
      if (selectedItem && onDelete) onDelete(selectedItem)
    },
    { enableOnFormTags: false }
  )

  useHotkeys(
    "n",
    () => {
      if (isFormFocused()) return
      onCreate?.()
    },
    { enableOnFormTags: false }
  )

  // Merge refs: containerRef from useHotkeys + our local ref for scroll tracking
  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      containerElRef.current = node
      // useHotkeys ref is a RefObject, assign the node to it
      if (typeof containerRef === "function") {
        containerRef(node)
      } else if (containerRef) {
        ;(containerRef as React.MutableRefObject<HTMLElement | null>).current =
          node
      }
    },
    [containerRef]
  )

  return {
    selectedIndex,
    selectedItem,
    containerProps: {
      ref: mergedRef,
      tabIndex: -1,
      "data-keyboard-nav": "true",
    },
    rowProps: (index: number) => ({
      "data-selected": index === selectedIndex,
      className: index === selectedIndex ? "bg-muted/50" : undefined,
      onClick: () => setSelectedIndex(index),
    }),
  }
}
