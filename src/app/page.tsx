import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function HomePage() {
  const session = await auth()

  if (!session) {
    return (
      <div className="container py-12">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h1 className="text-4xl font-bold">Welcome to Pipelite</h1>
          <p className="text-xl text-muted-foreground">
            A lightweight, self-hostable CRM for sales teams.
          </p>
          <div className="flex justify-center gap-4">
            <a href="/signup">
              <Button size="lg">Get Started</Button>
            </a>
            <a href="/login">
              <Button size="lg" variant="outline">Sign In</Button>
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">
          Welcome back{session.user?.email ? `, ${session.user.email.split("@")[0]}` : ""}!
        </h1>
        <p className="text-muted-foreground">
          You are logged in as <span className="capitalize font-medium">{session.user?.role}</span>.
        </p>
        {session.user?.role === "admin" && (
          <div className="flex gap-4">
            <a href="/admin/users">
              <Button>Manage Users</Button>
            </a>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/organizations"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">Organizations</h3>
            <p className="text-sm text-muted-foreground">Manage your organizations</p>
          </Link>
          <Link
            href="/people"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">People</h3>
            <p className="text-sm text-muted-foreground">Manage your contacts</p>
          </Link>
          <Link
            href="/deals"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">Deals</h3>
            <p className="text-sm text-muted-foreground">View and manage your sales pipeline</p>
          </Link>
          <Link
            href="/activities"
            className="p-6 border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-semibold">Activities</h3>
            <p className="text-sm text-muted-foreground">Manage tasks, calls, meetings, and emails</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
