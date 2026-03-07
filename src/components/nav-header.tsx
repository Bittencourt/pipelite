"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useHotkeys } from "react-hotkeys-hook"
import { useTranslations } from "next-intl"
import { UserMenu } from "./user-menu"
import { Button } from "@/components/ui/button"
import { Building2, Users, Kanban, BarChart3, CheckCircle2, Users2 } from "lucide-react"
import Link from "next/link"
import { GlobalSearch } from "./global-search"
import { ShortcutsOverlay } from "@/components/keyboard"

interface NavHeaderProps {
  user: { email: string; role: string } | null
}

export function NavHeader({ user }: NavHeaderProps) {
  const router = useRouter()
  const t = useTranslations("nav")
  const tAuth = useTranslations("auth")
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useHotkeys("alt+1", () => router.push("/deals"), { scopes: ["global"] })
  useHotkeys("alt+2", () => router.push("/people"), { scopes: ["global"] })
  useHotkeys("alt+3", () => router.push("/organizations"), { scopes: ["global"] })
  useHotkeys("alt+4", () => router.push("/activities"), { scopes: ["global"] })
  useHotkeys("?", () => setShortcutsOpen(true), { scopes: ["global"], useKey: true })

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold text-xl">
              Pipelite
            </Link>
            {user && (
              <nav className="hidden md:flex items-center gap-4">
                <Link
                  href="/organizations"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Building2 className="h-4 w-4" />
                  {t("organizations")}
                </Link>
                <Link
                  href="/people"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Users className="h-4 w-4" />
                  {t("people")}
                </Link>
                <Link
                  href="/deals"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Kanban className="h-4 w-4" />
                  {t("deals")}
                </Link>
                <Link
                  href="/analytics"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <BarChart3 className="h-4 w-4" />
                  {t("analytics")}
                </Link>
                <Link
                  href="/activities"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {t("activities")}
                </Link>
                <Link
                  href="/team"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Users2 className="h-4 w-4" />
                  {t("team")}
                </Link>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-4">
            {user && <GlobalSearch />}
            {user ? (
              <UserMenu user={user} />
            ) : (
              <div className="flex items-center gap-2">
                <a href="/login">
                  <Button variant="ghost">{tAuth("login")}</Button>
                </a>
                <a href="/signup">
                  <Button>{tAuth("login")}</Button>
                </a>
              </div>
            )}
          </div>
        </div>
      </header>
      <ShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  )
}
