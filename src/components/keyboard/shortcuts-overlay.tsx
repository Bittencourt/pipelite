"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useTranslations } from "next-intl"
import { SHORTCUTS } from "@/lib/hotkey-config"

interface ShortcutsOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground border border-border min-w-[1.5rem]">
      {children}
    </kbd>
  )
}

function formatKey(key: string): string {
  const map: Record<string, string> = {
    "alt+1": "Alt + 1",
    "alt+2": "Alt + 2",
    "alt+3": "Alt + 3",
    "alt+4": "Alt + 4",
    "shift+/": "?",
    ArrowDown: "\u2193",
    ArrowUp: "\u2191",
    ArrowLeft: "\u2190",
    ArrowRight: "\u2192",
    Escape: "Esc",
    Enter: "Enter",
  }
  return map[key] ?? key
}

export function ShortcutsOverlay({ open, onOpenChange }: ShortcutsOverlayProps) {
  const t = useTranslations("shortcuts")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {Object.entries(SHORTCUTS).map(([categoryKey, category]) => (
            <div key={categoryKey}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {t(`categories.${categoryKey}`)}
              </h3>
              <div className="space-y-2">
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between py-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{t(`actions.${shortcut.id}`)}</span>
                      {shortcut.context && (
                        <span className="text-xs text-muted-foreground">
                          ({t(`contexts.${shortcut.context}`)})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={key} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-xs text-muted-foreground">/</span>
                          )}
                          <Kbd>{formatKey(key)}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
