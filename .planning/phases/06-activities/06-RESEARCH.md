# Phase 6: Activities - Research

**Researched:** 2026-02-24
**Domain:** Activity tracking with calendar view, React calendar components, date handling
**Confidence:** HIGH

## Summary

This phase implements activity tracking with a week-view calendar. The research focused on three key areas: (1) calendar component libraries compatible with the existing Next.js 16 / React 19 / shadcn/ui stack, (2) date utility libraries for handling date operations, and (3) data modeling patterns consistent with the existing codebase.

The recommended approach uses **react-big-calendar** with the **date-fns** localizer for the calendar view, leveraging the existing @tanstack/react-table for the activity list. The data model follows established patterns from the deals schema (text IDs, soft delete, owner foreign key).

**Primary recommendation:** Use react-big-calendar with date-fns for calendar view; build activity schema following existing deal patterns.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-big-calendar | ^1.19.x | Calendar component with week view | MIT licensed, 8.7k stars, actively maintained, supports date-fns localizer, Google Calendar-like UX |
| date-fns | ^4.x | Date manipulation and formatting | Tree-shakeable, modern, widely adopted, excellent TypeScript support, works with react-big-calendar |
| @tanstack/react-table | ^8.21.x | Activity list table | Already in stack, consistent with existing data tables |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-day-picker | (via shadcn) | Date picker in dialogs | Already available via shadcn/ui Calendar component for due date selection |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-big-calendar | FullCalendar | FullCalendar has premium features but requires license for advanced; react-big-calendar is fully MIT |
| react-big-calendar | Custom week view | Hand-rolling calendar is complex; react-big-calendar handles edge cases (timezone, i18n, overflow) |
| date-fns | dayjs | dayjs is smaller (2kB) but date-fns has better tree-shaking and more comprehensive API |

**Installation:**
```bash
npm install react-big-calendar date-fns
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/activities/
│   ├── page.tsx           # Main activities page with tabs (list/calendar)
│   ├── actions.ts         # Server actions for CRUD operations
│   ├── activity-dialog.tsx # Create/edit dialog
│   ├── activity-list.tsx  # Data table view
│   └── activity-calendar.tsx # Calendar week view
├── db/schema/
│   ├── activities.ts      # Activities table
│   └── activity-types.ts  # Custom activity types (admin-configurable)
└── components/ui/
    └── calendar.tsx       # shadcn calendar for date picker (already exists via add)
```

### Pattern 1: Activity Data Model
**What:** Activity schema following existing deal patterns
**When to use:** All activity storage
**Example:**
```typescript
// Source: Based on existing deals.ts pattern
import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core"
import { users } from "./users"
import { deals } from "./deals"

export const activities = pgTable('activities', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  typeId: text('type_id').notNull().references(() => activityTypes.id),
  dealId: text('deal_id').references(() => deals.id), // Optional link to deal
  ownerId: text('owner_id').notNull().references(() => users.id),
  dueDate: timestamp('due_date').notNull(),
  completedAt: timestamp('completed_at'), // null = not done, set timestamp = done
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const activityTypes = pgTable('activity_types', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(), // "Call", "Meeting", "Task", "Email"
  icon: text('icon'), // Lucide icon name
  color: text('color'), // Optional hex color
  isDefault: boolean('is_default').default(false), // System default types
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

### Pattern 2: Calendar Week View with react-big-calendar
**What:** Google Calendar-like week view for activities
**When to use:** Calendar tab in activities page
**Example:**
```typescript
// Source: react-big-calendar docs with date-fns localizer
'use client'

import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import format from 'date-fns/format'
import parse from 'date-fns/parse'
import startOfWeek from 'date-fns/startOfWeek'
import getDay from 'date-fns/getDay'
import enUS from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const locales = {
  'en-US': enUS,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

interface ActivityEvent {
  id: string
  title: string
  start: Date
  end: Date
  type: string
  dealId?: string
  dealTitle?: string
}

export function ActivityCalendar({ activities }: { activities: ActivityEvent[] }) {
  return (
    <Calendar
      localizer={localizer}
      events={activities}
      startAccessor="start"
      endAccessor="end"
      defaultView="week"
      views={['week', 'month']}
      style={{ height: 600 }}
      onSelectEvent={(event) => {/* Open edit dialog */}}
      eventPropGetter={(event) => ({
        className: `activity-type-${event.type}`,
      })}
    />
  )
}
```

### Pattern 3: Activity List with Overdue Handling
**What:** Data table with overdue section at top
**When to use:** List view in activities page
**Example:**
```typescript
// Source: Based on existing @tanstack/react-table pattern
// Separate overdue activities and show at top with red/amber highlighting

const columns: ColumnDef<Activity>[] = [
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'dueDate', header: 'Due Date', 
    cell: ({ row }) => format(new Date(row.original.dueDate), 'MMM d, yyyy h:mm a')
  },
  { accessorKey: 'deal.title', header: 'Deal' },
  { accessorKey: 'completedAt', header: 'Status',
    cell: ({ row }) => row.original.completedAt ? 'Done' : 'Not Done'
  },
]

// Overdue check: !completedAt && dueDate < new Date()
```

### Anti-Patterns to Avoid
- **Storing activity type as enum in activities table:** Use separate activityTypes table for admin-configurable types
- **Using completed boolean instead of completedAt timestamp:** Timestamp enables audit trail and filtering by completion date
- **Ignoring timezone in due dates:** Store as timestamp, display in user's timezone using date-fns
- **Not setting height on calendar container:** react-big-calendar requires explicit height to render

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Week view calendar | Custom grid component | react-big-calendar | Handles timezone, overflow, i18n, accessibility |
| Date manipulation | Native Date methods | date-fns | Edge cases (DST, leap years, locale formatting) |
| Date picker in dialog | Custom calendar | shadcn Calendar | Accessible, consistent with design system |
| Activity list table | Custom table | @tanstack/react-table | Sorting, filtering, pagination already solved |

**Key insight:** Calendar views are notoriously complex due to timezone handling, overflow scrolling, and edge cases. react-big-calendar has solved these problems over 8+ years of development.

## Common Pitfalls

### Pitfall 1: react-big-calendar Container Height
**What goes wrong:** Calendar appears blank or with 0 height
**Why it happens:** react-big-calendar requires explicit height on container
**How to avoid:** Always set `style={{ height: '600px' }}` or use Tailwind `h-[600px]`
**Warning signs:** Calendar renders but shows no grid

### Pitfall 2: Timezone Drift
**What goes wrong:** Activities show on wrong day/time
**Why it happens:** Database stores UTC, browser shows local time without conversion
**How to avoid:** 
- Store due dates as timestamp (UTC in Postgres)
- Convert to local timezone for display using date-fns
- Use `tz` option in timestamp column if needed
**Warning signs:** Activities appear on previous/next day for some users

### Pitfall 3: Missing Activity Type Seeding
**What goes wrong:** No activity types exist, users can't create activities
**Why it happens:** activityTypes table is empty on fresh install
**How to avoid:** Seed default types (Call, Meeting, Task, Email) on first run or migration
**Warning signs:** Type dropdown is empty in create dialog

### Pitfall 4: Orphaned Activities on Deal Delete
**What goes wrong:** Activities linked to deleted deals have broken references
**Why it happens:** dealId foreign key doesn't handle soft delete
**How to avoid:** 
- Keep dealId nullable
- Handle null deal gracefully in UI (show "No deal linked")
- Consider cascading soft delete or keeping reference
**Warning signs:** Activity shows deal name but clicking throws error

### Pitfall 5: Overdue Calculation Performance
**What goes wrong:** Slow list rendering with many activities
**Why it happens:** Computing `dueDate < now && !completedAt` for each row client-side
**How to avoid:** 
- Compute overdue status server-side
- Or use memoized selector
- Consider database computed column
**Warning signs:** List feels sluggish with 100+ activities

## Code Examples

### Server Action: Create Activity
```typescript
// Source: Based on existing deals/actions.ts pattern
"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { activities, activityTypes, deals } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const activitySchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  typeId: z.string().min(1, "Type is required"),
  dealId: z.string().optional().nullable(),
  dueDate: z.date(),
  notes: z.string().max(2000).optional().nullable(),
})

export async function createActivity(
  data: z.infer<typeof activitySchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const validated = activitySchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  // Validate activity type exists
  const type = await db.query.activityTypes.findFirst({
    where: eq(activityTypes.id, validated.data.typeId),
  })
  if (!type) {
    return { success: false, error: "Invalid activity type" }
  }

  // Validate deal exists if provided
  if (validated.data.dealId) {
    const deal = await db.query.deals.findFirst({
      where: and(eq(deals.id, validated.data.dealId), isNull(deals.deletedAt)),
    })
    if (!deal) {
      return { success: false, error: "Deal not found" }
    }
  }

  try {
    const [activity] = await db.insert(activities).values({
      title: validated.data.title,
      typeId: validated.data.typeId,
      dealId: validated.data.dealId || null,
      ownerId: session.user.id,
      dueDate: validated.data.dueDate,
      notes: validated.data.notes || null,
    }).returning()

    revalidatePath("/activities")
    return { success: true, id: activity.id }
  } catch (error) {
    console.error("Failed to create activity:", error)
    return { success: false, error: "Failed to create activity" }
  }
}
```

### Toggle Completion Status
```typescript
// Source: Based on existing updateDeal pattern
export async function toggleActivityCompletion(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated" }
  }

  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), isNull(activities.deletedAt)),
  })

  if (!activity || activity.ownerId !== session.user.id) {
    return { success: false, error: "Activity not found or not authorized" }
  }

  try {
    await db.update(activities)
      .set({
        completedAt: activity.completedAt ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(activities.id, id))

    revalidatePath("/activities")
    return { success: true }
  } catch (error) {
    return { success: false, error: "Failed to update activity" }
  }
}
```

### Activity Relations
```typescript
// Source: Based on existing _relations.ts pattern
// Add to src/db/schema/_relations.ts

import { activities } from "./activities"
import { activityTypes } from "./activity-types"

export const activitiesRelations = relations(activities, ({ one }) => ({
  type: one(activityTypes, {
    fields: [activities.typeId],
    references: [activityTypes.id],
  }),
  deal: one(deals, {
    fields: [activities.dealId],
    references: [deals.id],
  }),
  owner: one(users, {
    fields: [activities.ownerId],
    references: [users.id],
  }),
}))

export const activityTypesRelations = relations(activityTypes, ({ many }) => ({
  activities: many(activities),
}))

// Add activities to dealsRelations and usersRelations
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Moment.js for dates | date-fns or dayjs | ~2020 | Smaller bundles, tree-shaking |
| FullCalendar (jQuery) | react-big-calendar | ~2018 | React-native, MIT licensed |
| Boolean completed field | completedAt timestamp | Industry standard | Audit trail, completion analytics |
| Hardcoded activity types | Configurable types table | This project | Admin flexibility |

**Deprecated/outdated:**
- **Moment.js:** Large bundle size, mutable API; use date-fns instead
- **FullCalendar free tier:** Limited views; react-big-calendar offers more for free
- **Storing completed as boolean:** Use completedAt timestamp for audit trail

## Open Questions

Things that couldn't be fully resolved:

1. **Calendar time slot granularity**
   - What we know: react-big-calendar supports configurable slots
   - What's unclear: Whether 15-min, 30-min, or 60-min slots preferred
   - Recommendation: Start with 30-min slots (industry standard), make configurable later

2. **Activity duration handling**
   - What we know: Activities have dueDate (point in time)
   - What's unclear: Should meetings have duration (start + end)?
   - Recommendation: Start with single dueDate; add duration in future if needed

3. **Drag-and-drop in calendar**
   - What we know: react-big-calendar supports DnD via addon
   - What's unclear: Priority for MVP
   - Recommendation: Defer DnD to Phase 8+; use dialog for rescheduling

## Sources

### Primary (HIGH confidence)
- react-big-calendar GitHub - 8.7k stars, actively maintained, MIT licensed
- FullCalendar React docs - React integration patterns
- shadcn/ui Calendar docs - Date picker integration with react-day-picker
- date-fns.org - Official documentation

### Secondary (MEDIUM confidence)
- Existing codebase patterns (deals.ts, actions.ts, _relations.ts) - Verified patterns
- shadcn/ui installation guide - Component usage patterns

### Tertiary (LOW confidence)
- None - All findings verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - react-big-calendar and date-fns are industry standards with active maintenance
- Architecture: HIGH - Follows existing codebase patterns exactly
- Pitfalls: HIGH - Based on documented library requirements and common issues

**Research date:** 2026-02-24
**Valid until:** 90 days (stable libraries, low churn expected)
