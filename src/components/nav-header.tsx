import { auth } from "@/auth"
import { UserMenu } from "./user-menu"
import { Button } from "@/components/ui/button"
import { Building2, Users, Kanban, CheckCircle2 } from "lucide-react"
import Link from "next/link"

export async function NavHeader() {
  const session = await auth()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <a href="/" className="font-semibold text-xl">
            Pipelite
          </a>
          {session?.user && (
            <nav className="hidden md:flex items-center gap-4">
              <Link
                href="/organizations"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Building2 className="h-4 w-4" />
                Organizations
              </Link>
              <Link
                href="/people"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Users className="h-4 w-4" />
                People
              </Link>
              <Link
                href="/deals"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Kanban className="h-4 w-4" />
                Deals
              </Link>
              <Link
                href="/activities"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                Activities
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-4">
          {session?.user ? (
            <UserMenu
              user={{
                email: session.user.email || "",
                role: session.user.role,
              }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <a href="/login">
                <Button variant="ghost">Sign In</Button>
              </a>
              <a href="/signup">
                <Button>Sign Up</Button>
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
