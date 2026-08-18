import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AdminMobileBar } from "@/components/admin-mobile-bar"
import { AdminSidebar } from "@/components/admin-sidebar"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect("/login?callbackUrl=/admin")
  }

  if (session.user.role !== "admin") {
    redirect("/?error=unauthorized")
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* The rail leaves the flex row entirely below md: at 320px it would take 256 of the 305
          available client width, which is what pushed /admin/audit past its own scroll width. */}
      <aside className="hidden md:flex w-64 border-r bg-background">
        <AdminSidebar />
      </aside>
      {/* min-w-0 is mandatory, not tidiness. A flex item defaults to `min-width: auto` and refuses
          to shrink below its own content, which is the mechanism behind the measured document
          scrollWidth of 491 (en-US), 518 (pt-BR) and 537 (es-ES) against a clientWidth of 305.
          Without it this column reproduces the exact overflow hiding the rail just removed. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Above <main> and outside its p-6, so the hamburger aligns to the page edge like the
            global header does. Not in NavHeader — that would couple the app shell to one route
            group. */}
        <AdminMobileBar />
        <main className="flex-1 p-6 bg-muted/30">
          {children}
        </main>
      </div>
    </div>
  )
}
