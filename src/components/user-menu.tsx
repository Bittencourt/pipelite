"use client"

import { signOut } from "next-auth/react"
import { LogOut, User, Key, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-red-600 focus:text-red-600"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{tAuth("logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
