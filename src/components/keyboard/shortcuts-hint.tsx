"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "pipelite_shortcuts_hint_dismissed"

export function ShortcutsHint() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (!dismissed) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
      }, 10000)
      return () => clearTimeout(timer)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
      <div className="container flex items-center justify-between py-2 px-4">
        <p className="text-sm text-muted-foreground">
          Press{" "}
          <kbd className="inline-flex items-center justify-center rounded bg-background px-1.5 py-0.5 font-mono text-xs border border-border">
            ?
          </kbd>{" "}
          to see all keyboard shortcuts
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={dismiss}
          aria-label="Dismiss keyboard shortcuts hint"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
