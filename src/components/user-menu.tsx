"use client"

import { signOut } from "next-auth/react"
import { LogOut, User, Key, Trash2, Monitor, Moon, Sun } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface UserMenuProps {
  user: {
    email: string
    role: string
  }
}

export function UserMenu({ user }: UserMenuProps) {
  const t = useTranslations("nav")
  const tAuth = useTranslations("auth")
  const tTheme = useTranslations("theme")
  const { theme, setTheme } = useTheme()

  const initials = user.email
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase()

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.email}</p>
            <p className="text-xs leading-none text-muted-foreground capitalize">
              {user.role}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/settings/api-keys" className="flex items-center">
            <Key className="mr-2 h-4 w-4" />
            <span>{t("apiKeys")}</span>
          </a>
        </DropdownMenuItem>
        {/*
          Not role-gated: trash is owner-scoped, not admin-only — only purge is admin-only,
          and /trash scopes its own query. A nav item is never the gate. The icon deliberately
          carries no destructive colour: sign-out stays the only red thing in this menu,
          because a route to a recovery page is not a danger.
        */}
        <DropdownMenuItem asChild>
          <a href="/trash" className="flex items-center">
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{t("trash")}</span>
          </a>
        </DropdownMenuItem>
        {user.role === "admin" && (
          <DropdownMenuItem asChild>
            <a href="/admin/users" className="flex items-center">
              <User className="mr-2 h-4 w-4" />
              <span>{t("userManagement")}</span>
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {/*
          Three flat rows rather than a submenu. This app's headline mobile concern is a 320px
          viewport, and a 224px-wide (w-56) menu spawning a nested panel inside a ~305px client width
          has nowhere to open — Radix flips or clamps it, and nested menus are hostile to touch.

          Three values, not two: defaultTheme="system" makes OS-following the initial state, so a
          light/dark pair would strand the user outside it forever.

          There is deliberately no hydration gate here. The usual recipe guards theme UI behind a
          flag set from an effect, which this repo's lint config rejects outright (severity 2 on
          react-hooks/set-state-in-effect) and which nothing here needs: a closed Radix menu portal
          renders nothing at all, so these rows first mount on a user click, long after next-themes
          has read localStorage. The one thing that IS required is the ?? fallback — next-themes'
          state initializer returns undefined while there is no window, so `theme` is genuinely
          undefined on the server.
        */}
        <DropdownMenuLabel className="font-normal">{tTheme("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 h-4 w-4" />
            <span>{tTheme("light")}</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 h-4 w-4" />
            <span>{tTheme("dark")}</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="mr-2 h-4 w-4" />
            <span>{tTheme("system")}</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {/*
          The sign-out item's colour comes from the destructive token, never a palette utility:
          on the dark popover surface a fixed mid-palette red falls under the 4.5:1 AA threshold,
          while the token carries a lightened dark-mode value so one declaration covers both themes.
        */}
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{tAuth("logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
