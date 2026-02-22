import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Key } from "lucide-react"
import { cn } from "@/lib/utils"

const settingsNav = [
  {
    title: "API Keys",
    href: "/settings/api-keys",
    icon: Key,
  },
]

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect("/login?callbackUrl=/settings")
  }

  return (
    <div className="container py-8">
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-64 shrink-0">
          <div className="space-y-1">
            {settingsNav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium",
                  "bg-muted text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </a>
            ))}
          </div>
        </aside>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
