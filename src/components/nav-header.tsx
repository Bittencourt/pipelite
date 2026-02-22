import { auth } from "@/auth"
import { UserMenu } from "./user-menu"
import { Button } from "@/components/ui/button"

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
              {/* Main nav items will be added in later phases */}
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
