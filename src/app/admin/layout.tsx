import { auth } from "@/auth"
import { redirect } from "next/navigation"
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
      <AdminSidebar />
      <main className="flex-1 p-6 bg-muted/30">
        {children}
      </main>
    </div>
  )
}
