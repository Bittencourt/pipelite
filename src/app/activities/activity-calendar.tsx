"use client"

import { useMemo } from "react"
import { Calendar, dateFnsLocalizer, Views, type Event } from "react-big-calendar"
import { format, parse, startOfWeek, getDay, addHours } from "date-fns"
import { enUS } from "date-fns/locale/en-US"
import "react-big-calendar/lib/css/react-big-calendar.css"

import { Activity } from "./activity-list"

// Setup date-fns localizer for react-big-calendar
const locales = {
  "en-US": enUS,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

// Activity type info
interface ActivityType {
  id: string
  name: string
  icon: string | null
  color: string | null
}

// Event format for react-big-calendar
interface ActivityEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: {
    activity: Activity
    typeId: string
    typeName: string
    typeColor: string | null
    dealId?: string | null
    dealTitle?: string | null
    completedAt?: Date | null
  }
}

interface ActivityCalendarProps {
  activities: Activity[]
  activityTypes: ActivityType[]
  onSelectActivity: (activity: Activity) => void
}

// Activity type color mapping for event styling
const typeColorMap: Record<string, string> = {
  Call: "#3b82f6", // blue
  Meeting: "#8b5cf6", // purple
  Task: "#22c55e", // green
  Email: "#f59e0b", // amber
}

// Default color for unknown types
const defaultColor = "#6b7280" // gray

export function ActivityCalendar({
  activities,
  activityTypes,
  onSelectActivity,
}: ActivityCalendarProps) {
  // Create type lookup for color mapping
  const typeLookup = useMemo(() => {
    const map = new Map<string, ActivityType>()
    activityTypes.forEach((type) => map.set(type.id, type))
    return map
  }, [activityTypes])

  // Transform activities to calendar events
  const events: ActivityEvent[] = useMemo(() => {
    return activities
      .filter((activity) => activity.dueDate) // Only show activities with due dates
      .map((activity) => {
        const type = typeLookup.get(activity.typeId)
        const typeName = type?.name || "Unknown"
        const typeColor = type?.color || typeColorMap[typeName] || defaultColor

        // Use dueDate for start, add 1 hour for end (point-in-time events)
        const startDate = new Date(activity.dueDate)
        const endDate = addHours(startDate, 1)

        return {
          id: activity.id,
          title: activity.title,
          start: startDate,
          end: endDate,
          resource: {
            activity,
            typeId: activity.typeId,
            typeName,
            typeColor,
            dealId: activity.deal?.id,
            dealTitle: activity.deal?.title,
            completedAt: activity.completedAt,
          },
        }
      })
  }, [activities, typeLookup])

  // Handle event click
  const handleSelectEvent = (event: ActivityEvent) => {
    onSelectActivity(event.resource.activity)
  }

  // Style events based on activity type
  const eventPropGetter = (event: ActivityEvent) => {
    const { typeColor, completedAt } = event.resource
    const isCompleted = !!completedAt

    return {
      style: {
        backgroundColor: typeColor || defaultColor,
        borderColor: typeColor || defaultColor,
        opacity: isCompleted ? 0.6 : 1,
        textDecoration: isCompleted ? "line-through" : "none",
        borderRadius: "4px",
        color: "#ffffff",
        border: "none",
      },
    }
  }

  // Custom event component to show type badge and deal info
  const EventComponent = ({ event }: { event: ActivityEvent }) => {
    const { typeName, dealTitle, completedAt } = event.resource
    const isCompleted = !!completedAt

    return (
      <div className="px-1 py-0.5 text-xs overflow-hidden">
        <div className="font-medium truncate">{event.title}</div>
        <div className="opacity-80 truncate flex items-center gap-1">
          <span className="truncate">{typeName}</span>
          {dealTitle && (
            <>
              <span>|</span>
              <span className="truncate">{dealTitle}</span>
            </>
          )}
        </div>
        {isCompleted && (
          <div className="opacity-80 truncate">Completed</div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Custom styles to override react-big-calendar defaults */}
      <style jsx global>{`
        .rbc-calendar {
          font-family: inherit;
        }
        .rbc-toolbar {
          padding: 12px 16px;
          border-bottom: 1px solid hsl(var(--border));
          flex-wrap: wrap;
          gap: 8px;
        }
        .rbc-toolbar button {
          color: hsl(var(--foreground));
          border-color: hsl(var(--border));
          background: hsl(var(--background));
        }
        .rbc-toolbar button:hover {
          background: hsl(var(--accent));
        }
        .rbc-toolbar button.rbc-active {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          border-color: hsl(var(--primary));
        }
        .rbc-header {
          padding: 12px 8px;
          font-weight: 600;
          color: hsl(var(--foreground));
          border-bottom: 1px solid hsl(var(--border));
        }
        .rbc-time-header {
          border-bottom: 1px solid hsl(var(--border));
        }
        .rbc-time-content {
          border-top: none;
        }
        .rbc-time-slot {
          border-top-color: hsl(var(--border));
        }
        .rbc-time-gutter {
          background: hsl(var(--muted));
        }
        .rbc-time-gutter .rbc-time-slot {
          color: hsl(var(--muted-foreground));
        }
        .rbc-agenda-view table.rbc-agenda-table {
          border: 1px solid hsl(var(--border));
        }
        .rbc-agenda-view table.rbc-agenda-table tbody > tr > td {
          border-top: 1px solid hsl(var(--border));
        }
        .rbc-agenda-view table.rbc-agenda-table .rbc-agenda-time-cell {
          color: hsl(var(--muted-foreground));
        }
        .rbc-month-view {
          border: 1px solid hsl(var(--border));
        }
        .rbc-month-header {
          border-bottom: 1px solid hsl(var(--border));
        }
        .rbc-month-row {
          border-bottom: 1px solid hsl(var(--border));
        }
        .rbc-month-row:last-child {
          border-bottom: none;
        }
        .rbc-day-bg {
          background: hsl(var(--background));
        }
        .rbc-off-range-bg {
          background: hsl(var(--muted));
        }
        .rbc-today {
          background: hsl(var(--accent) / 0.3);
        }
        .rbc-event {
          cursor: pointer;
        }
        .rbc-event:hover {
          filter: brightness(1.1);
        }
        .rbc-show-more {
          color: hsl(var(--primary));
          font-weight: 500;
        }
        .rbc-show-more:hover {
          text-decoration: underline;
        }
      `}</style>
      
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        defaultView={Views.WEEK}
        views={[Views.WEEK, Views.MONTH]}
        style={{ height: 600 }}
        onSelectEvent={handleSelectEvent}
        eventPropGetter={eventPropGetter}
        components={{
          event: EventComponent,
        }}
        popup
        tooltipAccessor={(event: Event) => {
          const { typeName, dealTitle, completedAt } = (event as ActivityEvent).resource
          const status = completedAt ? " (Completed)" : ""
          const deal = dealTitle ? ` - Deal: ${dealTitle}` : ""
          return `${event.title} [${typeName}]${deal}${status}`
        }}
      />
    </div>
  )
}
