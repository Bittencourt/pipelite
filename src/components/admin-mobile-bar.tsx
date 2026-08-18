"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Menu } from "lucide-react"

import { AdminBackToApp, AdminNavItems } from "@/components/admin-sidebar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

/**
 * The admin shell below `md`: a 48px bar carrying a hamburger and the panel heading, and the drawer
 * it opens.
 *
 * `"use client"` is required, not stylistic — Sheet is a Radix Dialog, so it holds open state,
 * portals into the body and traps focus, none of which a server component can do.
 *
 * The bar is deliberately shorter than the 56px global header above it, so the two stacked bars cost
 * 104px rather than 112px of a 640px-tall phone viewport.
 *
 * The open state below is USER-INTERACTION state, never breakpoint state. The collapse itself is
 * pure CSS — `md:hidden` here, `hidden md:flex` on the rail — because a hook that reads the viewport
 * returns false on the server and the truth only after an effect, which is either a hydration
 * mismatch or a `react-hooks/set-state-in-effect` error, severity 2 in this repo.
 *
 * Escape, the overlay tap, the scroll lock and the return of focus to the trigger on close are all
 * Radix defaults and are deliberately not overridden. Hand-rolling any of them is where this class
 * of component goes wrong.
 */
export function AdminMobileBar() {
  const [open, setOpen] = useState(false)
  const t = useTranslations("admin.nav")

  const close = () => setOpen(false)

  return (
    <div className="h-12 border-b px-4 flex items-center gap-2 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-lg" aria-label={t("openMenu")}>
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        {/*
          `w-64` is 256px, byte-identical to the desktop rail: one sidebar design, not two. It
          overrides the block default `w-3/4` through tailwind-merge (same `w-` group), and that
          default is why it is overridden at all — `w-3/4` renders 240px at a 320px viewport and
          575px at 767px. `gap-0 p-0` hands spacing to the header and nav below, which reuse the
          rail's own `p-4`.

          `aria-describedby={undefined}` is the sanctioned suppression for Radix Dialog's
          missing-description warning, and costs no new string in three locales for a menu that
          describes itself.
        */}
        <SheetContent side="left" className="w-64 gap-0 p-0" aria-describedby={undefined}>
          <div className="p-4 border-b">
            {/*
              Rendered VISIBLY, not sr-only: it is the same heading the rail shows, so the drawer
              reads as the rail rather than as a new surface. No `leading-none` — pt-BR renders
              "Painel de Administração" into 256px minus 32px of padding, so it may wrap.
            */}
            <SheetTitle className="text-lg font-semibold">{t("title")}</SheetTitle>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {/* The SAME eleven entries the rail renders, from the same array. */}
            <AdminNavItems onNavigate={close} />
          </nav>
          <div className="p-4 border-t">
            <AdminBackToApp onNavigate={close} />
          </div>
        </SheetContent>
      </Sheet>
      <span className="text-lg font-semibold">{t("title")}</span>
    </div>
  )
}
