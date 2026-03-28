"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { VariablePicker, type VariablePickerHandle } from "./variable-picker"
import { buildVariableTree } from "../../lib/variable-schema"
import { useEditorStore } from "../../lib/editor-store"

interface VariableFieldProps {
  value: string
  onChange: (value: string) => void
  nodeId: string
  placeholder?: string
  className?: string
}

/**
 * Detect if cursor is inside an open {{ expression.
 * Returns { open: true, filter, startIndex } if inside {{ without closing }},
 * or { open: false } otherwise.
 */
function detectVariableContext(
  text: string,
  cursorPos: number,
): { open: false } | { open: true; filter: string; startIndex: number } {
  // Look backwards from cursor for {{
  const before = text.slice(0, cursorPos)
  const lastOpen = before.lastIndexOf("{{")
  if (lastOpen === -1) return { open: false }

  // Check there's no }} between the {{ and cursor
  const between = before.slice(lastOpen + 2)
  if (between.includes("}}")) return { open: false }

  return {
    open: true,
    filter: between,
    startIndex: lastOpen,
  }
}

function useVariableField({ value, onChange, nodeId }: VariableFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 })
  const [startIndex, setStartIndex] = useState(0)
  const pickerRef = useRef<VariablePickerHandle>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  const triggers = useEditorStore((s) => s.triggers)
  const workflowNodes = useEditorStore((s) => s.workflowNodes)

  const variables = useMemo(
    () => buildVariableTree(triggers, workflowNodes, nodeId),
    [triggers, workflowNodes, nodeId],
  )

  const handleChange = useCallback(
    (newValue: string, cursorPos: number) => {
      onChange(newValue)
      const ctx = detectVariableContext(newValue, cursorPos)
      if (ctx.open) {
        setFilter(ctx.filter)
        setStartIndex(ctx.startIndex)
        setPickerOpen(true)

        // Calculate position relative to the input element
        if (inputRef.current) {
          const rect = inputRef.current.getBoundingClientRect()
          const parentRect = inputRef.current.offsetParent?.getBoundingClientRect()
          setPickerPosition({
            top: rect.bottom - (parentRect?.top ?? rect.top) + 4,
            left: 0,
          })
        }
      } else {
        setPickerOpen(false)
      }
    },
    [onChange],
  )

  const handleSelect = useCallback(
    (path: string) => {
      // Replace {{filter with {{path}}
      const before = value.slice(0, startIndex)
      const after = value.slice(
        startIndex + 2 + filter.length, // skip past {{ + filter text
      )
      const newValue = `${before}{{${path}}}${after}`
      onChange(newValue)
      setPickerOpen(false)

      // Refocus and set cursor after the inserted variable
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          const newCursorPos = before.length + path.length + 4 // {{path}}
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      })
    },
    [value, startIndex, filter, onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!pickerOpen) return

      if (e.key === "Escape") {
        e.preventDefault()
        setPickerOpen(false)
        return
      }

      // Forward arrow/enter to picker
      if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
        const handled = pickerRef.current?.handleKeyDown(e)
        if (handled) return
      }
    },
    [pickerOpen],
  )

  return {
    pickerOpen,
    filter,
    pickerPosition,
    pickerRef,
    inputRef,
    variables,
    handleChange,
    handleSelect,
    handleKeyDown,
  }
}

export function VariableInput(props: VariableFieldProps) {
  const {
    pickerOpen,
    filter,
    pickerPosition,
    pickerRef,
    inputRef,
    variables,
    handleChange,
    handleSelect,
    handleKeyDown,
  } = useVariableField(props)

  return (
    <div className="relative">
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={props.value}
        onChange={(e) => {
          handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder}
        className={props.className}
      />
      {pickerOpen && (
        <VariablePicker
          ref={pickerRef}
          variables={variables}
          filter={filter}
          onSelect={handleSelect}
          position={pickerPosition}
        />
      )}
    </div>
  )
}

export function VariableTextarea(props: VariableFieldProps) {
  const {
    pickerOpen,
    filter,
    pickerPosition,
    pickerRef,
    inputRef,
    variables,
    handleChange,
    handleSelect,
    handleKeyDown,
  } = useVariableField(props)

  return (
    <div className="relative">
      <Textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={props.value}
        onChange={(e) => {
          handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder}
        className={props.className}
      />
      {pickerOpen && (
        <VariablePicker
          ref={pickerRef}
          variables={variables}
          filter={filter}
          onSelect={handleSelect}
          position={pickerPosition}
        />
      )}
    </div>
  )
}
