/**
 * Central hotkey definitions for the application.
 *
 * Organized by category. Each shortcut has an id, key combo(s),
 * human-readable description, and optional context hint.
 *
 * NOTE: Customization storage is NOT implemented here.
 * This file provides static defaults only.
 */

export interface Shortcut {
  id: string
  keys: string[]
  description: string
  /** Optional hint shown in the overlay (e.g. "In lists") */
  context?: string
}

export interface ShortcutCategory {
  label: string
  shortcuts: Shortcut[]
}

// ---------------------------------------------------------------------------
// Scope constants
// ---------------------------------------------------------------------------

export const SCOPES = {
  GLOBAL: "global",
  LIST: "list",
  KANBAN: "kanban",
  FORM: "form",
  DETAIL: "detail",
} as const

export type Scope = (typeof SCOPES)[keyof typeof SCOPES]

// ---------------------------------------------------------------------------
// Shortcut definitions by category
// ---------------------------------------------------------------------------

export const SHORTCUTS: Record<string, ShortcutCategory> = {
  navigation: {
    label: "Navigation",
    shortcuts: [
      { id: "nav-deals", keys: ["Alt+1"], description: "Go to Deals" },
      { id: "nav-people", keys: ["Alt+2"], description: "Go to People" },
      { id: "nav-orgs", keys: ["Alt+3"], description: "Go to Organizations" },
      { id: "nav-activities", keys: ["Alt+4"], description: "Go to Activities" },
      { id: "nav-search", keys: ["/"], description: "Focus search" },
    ],
  },
  actions: {
    label: "Actions",
    shortcuts: [
      { id: "action-create", keys: ["n"], description: "Create new item", context: "In lists" },
      { id: "action-edit", keys: ["e"], description: "Edit selected", context: "When item selected" },
      { id: "action-delete", keys: ["d"], description: "Delete selected", context: "When item selected" },
      { id: "action-open", keys: ["Enter"], description: "Open item", context: "When item selected" },
    ],
  },
  list_navigation: {
    label: "List Navigation",
    shortcuts: [
      { id: "list-down", keys: ["j", "ArrowDown"], description: "Move down" },
      { id: "list-up", keys: ["k", "ArrowUp"], description: "Move up" },
      { id: "list-left", keys: ["h", "ArrowLeft"], description: "Previous column", context: "Kanban" },
      { id: "list-right", keys: ["l", "ArrowRight"], description: "Next column", context: "Kanban" },
    ],
  },
  general: {
    label: "General",
    shortcuts: [
      { id: "general-help", keys: ["?"], description: "Show keyboard shortcuts" },
      { id: "general-close", keys: ["Escape"], description: "Close dialog / Cancel" },
    ],
  },
} as const

// ---------------------------------------------------------------------------
// Flat lookup helpers
// ---------------------------------------------------------------------------

/** Get all shortcuts as a flat array */
export function getAllShortcuts(): Shortcut[] {
  return Object.values(SHORTCUTS).flatMap((cat) => cat.shortcuts)
}

/** Find a shortcut by id */
export function getShortcut(id: string): Shortcut | undefined {
  return getAllShortcuts().find((s) => s.id === id)
}
