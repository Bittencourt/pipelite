"use client"

/**
 * Typed hotkey hook wrapper with scope support.
 *
 * Re-exports the core hooks from react-hotkeys-hook and exposes the
 * centralised SHORTCUTS / SCOPES configuration so consumers have a
 * single import for everything keyboard-related.
 */

export { useHotkeys, useHotkeysContext } from "react-hotkeys-hook"
export type { Options as HotkeyOptions } from "react-hotkeys-hook"

export { SHORTCUTS, SCOPES, getAllShortcuts, getShortcut } from "@/lib/hotkey-config"
export type { Shortcut, ShortcutCategory, Scope } from "@/lib/hotkey-config"
