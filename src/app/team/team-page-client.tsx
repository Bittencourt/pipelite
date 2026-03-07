"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Kanban, CheckCircle2 } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"

interface TeamUser {
  id: string
  name: string | null
  email: string
  assignedDeals: Array<{ id: string; title: string; value: string | null; deletedAt?: Date | null; stage: { id: string; name: string } }>
  upcomingActivities: Array<{ id: string; title: string; dueDate: Date; type: { id: string; name: string; icon: string | null } | null }>
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export function TeamPageClient({ users }: { users: TeamUser[] }) {
  const t = useTranslations("team")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (users.length === 0) {
    return <div className="text-center py-12 text-muted-foreground border rounded-lg">{t("noUsers")}</div>
  }

  return (
    <div className="space-y-2">
      {users.map((user) => {
        const isExpanded = expandedIds.has(user.id)

        return (
          <div key={user.id} className="border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
              onClick={() => toggle(user.id)}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <Avatar>
                <AvatarFallback>{getInitials(user.name, user.email)}</AvatarFallback>
              </Avatar>
              <span className="font-medium flex-1">{user.name || user.email}</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Kanban className="h-3.5 w-3.5" />
                  {user.assignedDeals.length}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {user.upcomingActivities.length}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t px-4 py-3 space-y-4 bg-muted/20">
                {/* Assigned Deals */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {t("assignedDeals")}
                  </h3>
                  {user.assignedDeals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("noDeals")}</p>
                  ) : (
                    <div className="space-y-1">
                      {user.assignedDeals.map((deal) => (
                        <a
                          key={deal.id}
                          href={`/deals/${deal.id}`}
                          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors text-sm"
                        >
                          <span>{deal.title}</span>
                          <Badge variant="secondary" className="text-xs">{deal.stage.name}</Badge>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Upcoming Activities */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {t("upcomingActivities")}
                  </h3>
                  {user.upcomingActivities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("noActivities")}</p>
                  ) : (
                    <div className="space-y-1">
                      {user.upcomingActivities.map((activity) => (
                        <div key={activity.id} className="flex items-center justify-between py-1.5 px-2 rounded text-sm">
                          <span>{activity.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(activity.dueDate).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
