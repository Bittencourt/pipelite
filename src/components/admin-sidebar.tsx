"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { Users, Home, Layers, SlidersHorizontal, Database, Key, Radio, ScrollText, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * The admin navigation, declared ONCE and rendered by two surfaces: the desktop rail below and the
 * mobile drawer in `admin-mobile-bar.tsx`. Exported for that reason — two copies of this array is
 * how one surface silently loses a menu entry the other one gained.
 *
 * `labelKey` is a key into the `admin.nav` message namespace, never copy. Every entry used to hold
 * an English string, which rendered untranslated to pt-BR and es-ES operators on the one surface
 * they use most; the whole array moved into the catalog at once, so no reader has to wonder which
 * half is which. `icon` stays a capital-letter component reference, which is what keeps the list
 * data-driven rather than eleven hand-written blocks.
 */
export const adminNavItems = [
  { labelKey: "dashboard", href: "/admin", icon: Home },
  { labelKey: "users", href: "/admin/users", icon: Users },
  { labelKey: "pipelines", href: "/admin/pipelines", icon: Layers },
  { labelKey: "customFields", href: "/admin/fields", icon: SlidersHorizontal },
  { labelKey: "webhooks", href: "/admin/webhooks", icon: Radio },
  { labelKey: "auditLog", href: "/admin/audit", icon: ScrollText },
  // Placed immediately after the audit entry: the two are the app's data-lifecycle settings and
  // belong together.
  { labelKey: "trash", href: "/admin/trash", icon: Trash2 },
  { labelKey: "exportData", href: "/admin/export", icon: Database },
  { labelKey: "pipedriveImport", href: "/admin/import/pipedrive-api", icon: Key },
] as const

/**
 * The nav body, shared by the rail and the drawer.
 *
 * `onNavigate` is how the drawer closes itself when a destination is picked — the rail passes
 * nothing, because it has nothing to close. A drawer still sitting open over the page it just
 * navigated to reads as a failed tap rather than as a successful one.
 */
export function AdminNavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const t = useTranslations("admin.nav")

  return (
    <>
      {adminNavItems.map((item) => {
        // "/admin" is a prefix of all ten siblings, so it is the one entry that must match exactly;
        // a startsWith test for it would light the dashboard row on every admin page in the app.
        const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate}>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start",
                isActive && "bg-secondary"
              )}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {t(item.labelKey)}
            </Button>
          </Link>
        )
      })}
    </>
  )
}

/** The "leave the admin area" control, shared by the rail and the drawer for the same reason. */
export function AdminBackToApp({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("admin.nav")

  return (
    <Link href="/" onClick={onNavigate}>
      <Button variant="outline" className="w-full">
        <Home className="mr-2 h-4 w-4" />
        {t("backToApp")}
      </Button>
    </Link>
  )
}

/**
 * The desktop rail's body. `md` (768px) is the single collapse point the whole responsive contract
 * pins to — below it this 256px block takes almost the entire client width of a phone viewport,
 * which is what pushed /admin/audit past its own scroll width in all three locales.
 *
 * `md:flex` is load-bearing here: the column needs a flex context for its `flex-1` nav to push the
 * footer down. The `hidden` half repeats what the `<aside>` wrapper in `app/admin/layout.tsx`
 * already says, and it is kept deliberately — this is a fixed-width block, so it must never render
 * below md no matter which caller mounts it.
 */
export function AdminSidebar() {
  const t = useTranslations("admin.nav")

  return (
    <div className="hidden md:flex w-64 flex-col">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        <AdminNavItems />
      </nav>
      <div className="p-4 border-t">
        <AdminBackToApp />
      </div>
    </div>
  )
}
