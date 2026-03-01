"use client"

import { HotkeysProvider as RHHProvider } from "react-hotkeys-hook"

export function HotkeysProvider({ children }: { children: React.ReactNode }) {
  return (
    <RHHProvider initiallyActiveScopes={["global"]}>
      {children}
    </RHHProvider>
  )
}
