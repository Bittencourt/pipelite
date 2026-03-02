"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useHotkeys } from "react-hotkeys-hook"

interface UseDataTableKeyboardProps<T> {
  data: T[]
  onEdit?: (item: T) => void
  onDelete?: (item: T) => void
  onOpen?: (item: T) => void
  onCreate?: () => void
  getId?: (item: T) => string
}

interface UseDataTableKeyboardReturn<T> {
  selectedIndex: number
  selectedItem: T | null
  containerProps: {
    ref: React.RefCallback<HTMLElement | null>
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
}: UseDataTableKeyboardProps<T>): UseDataTableKeyboardReturn<T> {
  const [rawSelectedIndex, setSelectedIndex] = useState(0)
  const containerElRef = useRef<HTMLElement | null>(null)

  // Clamp selection index to valid bounds without setState in useEffect
  const selectedIndex =
    data.length > 0
      ? Math.min(rawSelectedIndex, data.length - 1)
      : 0

  const selectedItem = data[selectedIndex] || null

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
    { enableOnFormTags: false, preventDefault: true }
  )

  useHotkeys(
    "e",
    () => {
      if (isFormFocused()) return
      if (selectedItem && onEdit) onEdit(selectedItem)
    },
    { enableOnFormTags: false, preventDefault: true }
  )

  useHotkeys(
    "d",
    () => {
      if (isFormFocused()) return
      if (selectedItem && onDelete) onDelete(selectedItem)
    },
    { enableOnFormTags: false, preventDefault: true }
  )

  useHotkeys(
    "n",
    () => {
      if (isFormFocused()) return
      onCreate?.()
    },
    { enableOnFormTags: false, preventDefault: true }
  )

  // Merge refs: containerRef from useHotkeys (RefObject) + our local ref for scroll tracking
  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      containerElRef.current = node
      // useHotkeys returns a RefObject - assign via mutable cast
      const mutableRef = containerRef as React.MutableRefObject<HTMLElement | null>
      mutableRef.current = node
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
