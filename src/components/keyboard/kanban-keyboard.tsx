"use client"

import { useState, useCallback, useMemo, useRef } from "react"
import { useHotkeys } from "react-hotkeys-hook"

interface KanbanColumn<T> {
  id: string
  items: T[]
}

interface UseKanbanKeyboardProps<T> {
  columns: KanbanColumn<T>[]
  onEdit?: (item: T) => void
  onCreate?: (columnId?: string) => void
  getId?: (item: T) => string
  scope?: string
}

interface KanbanSelection {
  columnIndex: number
  itemIndex: number
}

interface UseKanbanKeyboardReturn<T> {
  selection: KanbanSelection | null
  selectedItem: T | null
  containerProps: {
    ref: (node: HTMLElement | null) => void
    tabIndex: number
  }
  getItemProps: (columnIndex: number, itemIndex: number) => {
    "data-selected": boolean
  }
  getColumnProps: (columnIndex: number) => {
    "data-column-selected": boolean
  }
}

function isFormFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  )
}

export function useKanbanKeyboard<T>({
  columns,
  onEdit,
  onCreate,
  scope = "kanban",
}: UseKanbanKeyboardProps<T>): UseKanbanKeyboardReturn<T> {
  const [selection, setSelection] = useState<KanbanSelection | null>(null)
  const containerElRef = useRef<HTMLElement | null>(null)

  // Get currently selected item
  const selectedItem = useMemo(() => {
    if (!selection) return null
    const column = columns[selection.columnIndex]
    if (!column) return null
    return column.items[selection.itemIndex] ?? null
  }, [selection, columns])

  // Initialize selection to first available item if not set
  const ensureSelection = useCallback((): KanbanSelection | null => {
    if (selection) return selection
    for (let ci = 0; ci < columns.length; ci++) {
      if (columns[ci].items.length > 0) {
        const newSel = { columnIndex: ci, itemIndex: 0 }
        setSelection(newSel)
        return newSel
      }
    }
    return null
  }, [selection, columns])

  // Scroll selected card into view
  const scrollToSelected = useCallback((colIdx: number, itemIdx: number) => {
    if (!containerElRef.current) return
    const card = containerElRef.current.querySelector(
      `[data-kanban-col="${colIdx}"][data-kanban-item="${itemIdx}"]`
    )
    if (card) {
      card.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
  }, [])

  // Navigation handlers
  const moveUp = useCallback(() => {
    if (isFormFocused()) return
    const sel = ensureSelection()
    if (!sel) return
    const column = columns[sel.columnIndex]
    if (!column) return
    const newItemIndex = Math.max(0, sel.itemIndex - 1)
    setSelection({ ...sel, itemIndex: newItemIndex })
    scrollToSelected(sel.columnIndex, newItemIndex)
  }, [columns, ensureSelection, scrollToSelected])

  const moveDown = useCallback(() => {
    if (isFormFocused()) return
    const sel = ensureSelection()
    if (!sel) return
    const column = columns[sel.columnIndex]
    if (!column) return
    const newItemIndex = Math.min(column.items.length - 1, sel.itemIndex + 1)
    setSelection({ ...sel, itemIndex: newItemIndex })
    scrollToSelected(sel.columnIndex, newItemIndex)
  }, [columns, ensureSelection, scrollToSelected])

  const moveLeft = useCallback(() => {
    if (isFormFocused()) return
    const sel = ensureSelection()
    if (!sel) return
    if (sel.columnIndex <= 0) return
    const newColumnIndex = sel.columnIndex - 1
    const newColumn = columns[newColumnIndex]
    if (!newColumn || newColumn.items.length === 0) return
    const newItemIndex = Math.min(sel.itemIndex, newColumn.items.length - 1)
    setSelection({ columnIndex: newColumnIndex, itemIndex: Math.max(0, newItemIndex) })
    scrollToSelected(newColumnIndex, Math.max(0, newItemIndex))
  }, [columns, ensureSelection, scrollToSelected])

  const moveRight = useCallback(() => {
    if (isFormFocused()) return
    const sel = ensureSelection()
    if (!sel) return
    if (sel.columnIndex >= columns.length - 1) return
    const newColumnIndex = sel.columnIndex + 1
    const newColumn = columns[newColumnIndex]
    if (!newColumn || newColumn.items.length === 0) return
    const newItemIndex = Math.min(sel.itemIndex, newColumn.items.length - 1)
    setSelection({ columnIndex: newColumnIndex, itemIndex: Math.max(0, newItemIndex) })
    scrollToSelected(newColumnIndex, Math.max(0, newItemIndex))
  }, [columns, ensureSelection, scrollToSelected])

  // Hotkey registrations -- ref-based so they only fire when container is in DOM
  const hotkeysRef = useHotkeys<HTMLElement>(
    "k, up",
    (e) => { e.preventDefault(); moveUp() },
    { scopes: [scope], enableOnFormTags: false }
  )

  useHotkeys(
    "j, down",
    (e) => { e.preventDefault(); moveDown() },
    { scopes: [scope], enableOnFormTags: false }
  )

  useHotkeys(
    "h, left",
    (e) => { e.preventDefault(); moveLeft() },
    { scopes: [scope], enableOnFormTags: false }
  )

  useHotkeys(
    "l, right",
    (e) => { e.preventDefault(); moveRight() },
    { scopes: [scope], enableOnFormTags: false }
  )

  useHotkeys(
    "enter",
    (e) => {
      if (isFormFocused()) return
      e.preventDefault()
      if (selectedItem) onEdit?.(selectedItem)
    },
    { scopes: [scope], enableOnFormTags: false }
  )

  useHotkeys(
    "n",
    (e) => {
      if (isFormFocused()) return
      e.preventDefault()
      if (selection) {
        onCreate?.(columns[selection.columnIndex]?.id)
      } else {
        onCreate?.()
      }
    },
    { scopes: [scope], enableOnFormTags: false }
  )

  // Merge refs: hotkeys ref + our container ref
  const setContainerRef = useCallback(
    (node: HTMLElement | null) => {
      containerElRef.current = node
      // Assign to hotkeys ref (MutableRefObject)
      const hRef = hotkeysRef as React.MutableRefObject<HTMLElement | null>
      hRef.current = node
    },
    [hotkeysRef]
  )

  return {
    selection,
    selectedItem,
    containerProps: {
      ref: setContainerRef,
      tabIndex: -1,
    },
    getItemProps: (columnIndex: number, itemIndex: number) => ({
      "data-selected":
        selection?.columnIndex === columnIndex &&
        selection?.itemIndex === itemIndex,
    }),
    getColumnProps: (columnIndex: number) => ({
      "data-column-selected": selection?.columnIndex === columnIndex,
    }),
  }
}
