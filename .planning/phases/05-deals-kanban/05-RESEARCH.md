# Phase 5: Deals & Kanban - Research

**Researched:** 2026-02-23
**Domain:** Kanban board with drag-drop, deal management with entity relationships
**Confidence:** HIGH

## Summary

This phase implements a kanban board for deal management with drag-and-drop between pipeline stages. The project already has @dnd-kit/core and @dnd-kit/sortable installed and uses them in Phase 4 for stage reordering. The key challenge is extending this to multi-column kanban with cross-column drag-drop.

**Primary recommendation:** Use the existing @dnd-kit packages with `closestCorners` collision detection for kanban, wrap each column with `useDroppable` for empty column support, and use gap-based positioning for deal ordering within stages.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.3.1 | Core drag-drop primitives | Already installed, used in Phase 4 |
| @dnd-kit/sortable | ^10.0.0 | Sortable list functionality | Already installed, extends core |
| @dnd-kit/utilities | ^3.2.2 | CSS transform utilities | Already installed |
| Intl.NumberFormat | Native | Currency formatting | Browser-native, locale-aware |
| Drizzle ORM | ^0.45.1 | Database operations | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | ^4.3.6 | Validation schemas | All server actions |
| shadcn/ui Dialog | Existing | Deal form dialog | Create/edit deal |

### Already Installed (Phase 4)
```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2"
```

## Architecture Patterns

### Database Schema: Deals Table

```typescript
// src/db/schema/deals.ts
import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core"
import { users } from "./users"
import { organizations } from "./organizations"
import { people } from "./people"
import { stages } from "./pipelines"

export const deals = pgTable('deals', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  value: integer('value'), // nullable for "No Value" deals
  expectedCloseDate: timestamp('expected_close_date'),
  notes: text('notes'),
  
  // Foreign keys
  stageId: text('stage_id').notNull().references(() => stages.id),
  organizationId: text('organization_id').references(() => organizations.id),
  personId: text('person_id').references(() => people.id),
  ownerId: text('owner_id').notNull().references(() => users.id),
  
  // Position for ordering within stage (gap-based)
  position: integer('position').notNull(),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
```

**Key schema decisions:**
- Both `organizationId` and `personId` are nullable, but at least one must be set (enforced in action validation)
- `value` is nullable integer (cents or base currency units) for "No Value" deals
- `position` uses gap-based ordering (same pattern as stages)
- Soft delete with `deletedAt` (consistent with organizations, people)

### Relations Addition

```typescript
// Add to src/db/schema/_relations.ts
import { deals } from "./deals"

export const dealsRelations = relations(deals, ({ one }) => ({
  stage: one(stages, {
    fields: [deals.stageId],
    references: [stages.id],
  }),
  organization: one(organizations, {
    fields: [deals.organizationId],
    references: [organizations.id],
  }),
  person: one(people, {
    fields: [deals.personId],
    references: [people.id],
  }),
  owner: one(users, {
    fields: [deals.ownerId],
    references: [users.id],
  }),
}))

// Also add to stagesRelations:
export const stagesRelations = relations(stages, ({ one, many }) => ({
  pipeline: one(pipelines, {
    fields: [stages.pipelineId],
    references: [pipelines.id],
  }),
  deals: many(deals), // Add this
}))
```

### Recommended Project Structure

```
src/
├── app/
│   └── deals/
│       ├── page.tsx           # Kanban board page (server component)
│       ├── kanban-board.tsx   # Client component for board
│       ├── kanban-column.tsx  # Single column component
│       ├── deal-card.tsx      # Deal card with inline expansion
│       ├── deal-dialog.tsx    # Create/edit dialog
│       └── actions.ts         # Server actions for deals
├── db/schema/
│   ├── deals.ts               # Deals table definition
│   └── _relations.ts          # Updated with deals relations
└── lib/
    └── currency.ts            # Currency formatting utilities
```

### Pattern 1: Kanban Board with @dnd-kit

**What:** Multi-column kanban with drag-drop between stages
**When to use:** This is the core UI for deals

**Key @dnd-kit setup for kanban:**

```typescript
// kanban-board.tsx
"use client"

import { useState } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"

export function KanbanBoard({ stages, dealsByStage }) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)

  // Use closestCorners for kanban (better than closestCenter for stacked columns)
  // See: https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }, // Prevent accidental drags
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    const deal = findDealById(event.active.id)
    setActiveDeal(deal)
  }

  const handleDragOver = (event: DragOverEvent) => {
    // When dragging over a different column, optimistically update
    const { active, over } = event
    if (!over) return

    const activeStageId = getStageId(active.id)
    const overStageId = getStageId(over.id)

    if (activeStageId !== overStageId) {
      // Move deal to new stage optimistically
      setDealsByStage((prev) => moveDealBetweenStages(prev, active, over))
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDeal(null)

    if (!over || active.id === over.id) return

    // Persist the change to server
    const result = await updateDealStage(active.id as string, {
      stageId: overStageId,
      position: newPosition,
    })

    if (!result.success) {
      // Revert optimistic update
      toast.error(result.error)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <KanbanColumn key={stage.id} stage={stage}>
            <SortableContext
              items={dealsByStage[stage.id] || []}
              strategy={verticalListSortingStrategy}
            >
              {dealsByStage[stage.id]?.map((deal) => (
                <DealCard key={deal.id} deal={deal} />
              ))}
            </SortableContext>
          </KanbanColumn>
        ))}
      </div>
      <DragOverlay>
        {activeDeal && <DealCard deal={activeDeal} isOverlay />}
      </DragOverlay>
    </DndContext>
  )
}
```

### Pattern 2: Droppable Column (Empty Column Support)

**What:** Each column is a droppable zone to handle empty stages
**Why:** Without this, you can't drag deals back into empty columns

```typescript
// kanban-column.tsx
import { useDroppable } from "@dnd-kit/core"

export function KanbanColumn({ stage, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: 'column', stage },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-[280px] min-w-[280px] flex flex-col bg-muted/50 rounded-lg",
        isOver && "ring-2 ring-primary"
      )}
    >
      {/* Stage header */}
      <div className="p-3 border-b">
        <div className="font-medium">{stage.name}</div>
        <div className="text-sm text-muted-foreground">
          {dealCount} deals · {formatCurrency(totalValue)}
        </div>
      </div>
      
      {/* Deal cards container */}
      <div className="flex-1 p-2 space-y-2 min-h-[200px]">
        {children}
      </div>
    </div>
  )
}
```

### Pattern 3: Inline Card Expansion

**What:** Clicking a card shows inline quick view, with edit button opening form
**Implementation:**

```typescript
// deal-card.tsx
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useState } from "react"

export function DealCard({ deal, isOverlay = false }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "bg-card border rounded-lg p-3 cursor-pointer",
          isDragging && "opacity-50",
          isExpanded && "ring-2 ring-primary"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        {...attributes}
        {...listeners}
      >
        <div className="font-medium truncate">{deal.title}</div>
        <div className="flex justify-between items-center mt-2 text-sm">
          <span className="text-muted-foreground">
            {deal.organization?.name || deal.person?.firstName || "No contact"}
          </span>
          <span className="font-medium">
            {deal.value ? formatCurrency(deal.value) : "No Value"}
          </span>
        </div>
        
        {/* Inline expansion */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-sm text-muted-foreground space-y-1">
              {deal.expectedCloseDate && (
                <div>Close: {formatDate(deal.expectedCloseDate)}</div>
              )}
              {deal.notes && <div className="line-clamp-2">{deal.notes}</div>}
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={(e) => {
                e.stopPropagation()
                setEditDialogOpen(true)
              }}>
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={(e) => {
                e.stopPropagation()
                // Delete confirmation
              }}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>

      <DealDialog
        deal={deal}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={() => {
          setEditDialogOpen(false)
          setIsExpanded(false)
        }}
      />
    </>
  )
}
```

### Pattern 4: Mobile Swipe Navigation

**What:** On mobile, show single column with horizontal swipe
**Implementation:**

```typescript
// kanban-board.tsx (mobile section)
import { useState, useRef } from "react"

export function KanbanBoard({ stages, dealsByStage }) {
  const [activeStageIndex, setActiveStageIndex] = useState(0)
  const touchStartX = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX

    if (Math.abs(diff) > 50) { // Minimum swipe distance
      if (diff > 0 && activeStageIndex < stages.length - 1) {
        setActiveStageIndex(activeStageIndex + 1)
      } else if (diff < 0 && activeStageIndex > 0) {
        setActiveStageIndex(activeStageIndex - 1)
      }
    }
  }

  const isMobile = useMediaQuery("(max-width: 768px)")

  if (isMobile) {
    return (
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Stage indicator dots */}
        <div className="flex justify-center gap-2 mb-4">
          {stages.map((stage, i) => (
            <button
              key={stage.id}
              onClick={() => setActiveStageIndex(i)}
              className={cn(
                "w-2 h-2 rounded-full",
                i === activeStageIndex ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
        
        {/* Single column view */}
        <KanbanColumn stage={stages[activeStageIndex]}>
          {/* Deal cards */}
        </KanbanColumn>
      </div>
    )
  }

  // Desktop: full kanban board
  return <DesktopKanbanBoard ... />
}
```

### Pattern 5: Won/Lost Footer Row

**What:** Won and Lost stages shown in collapsed footer, not regular columns
**Implementation:**

```typescript
// kanban-board.tsx
export function KanbanBoard({ stages, dealsByStage }) {
  // Separate open stages from won/lost
  const openStages = stages.filter(s => s.type === 'open')
  const wonStage = stages.find(s => s.type === 'won')
  const lostStage = stages.find(s => s.type === 'lost')

  return (
    <div className="flex flex-col h-full">
      {/* Main kanban area - only open stages */}
      <div className="flex gap-4 overflow-x-auto flex-1 pb-4">
        {openStages.map((stage) => (
          <KanbanColumn key={stage.id} stage={stage}>
            {/* Deal cards */}
          </KanbanColumn>
        ))}
      </div>

      {/* Won/Lost footer row */}
      {(wonStage || lostStage) && (
        <div className="border-t pt-4 mt-4">
          <div className="flex gap-4">
            {wonStage && (
              <div className="w-[280px] min-w-[280px]">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <div className="font-medium text-emerald-700 dark:text-emerald-300">
                    Won ({dealsByStage[wonStage.id]?.length || 0})
                  </div>
                  <div className="text-sm text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(sumValues(dealsByStage[wonStage.id]))}
                  </div>
                </div>
              </div>
            )}
            {lostStage && (
              <div className="w-[280px] min-w-[280px]">
                <div className="p-3 bg-rose-50 dark:bg-rose-950 rounded-lg border border-rose-200 dark:border-rose-800">
                  <div className="font-medium text-rose-700 dark:text-rose-300">
                    Lost ({dealsByStage[lostStage.id]?.length || 0})
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

### Pattern 6: Currency Formatting

**What:** Format deal values as currency
**Implementation:**

```typescript
// src/lib/currency.ts
export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'USD'
): string {
  if (value === null || value === undefined) return 'No Value'
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// If storing as cents:
export function formatCentsToCurrency(cents: number | null): string {
  if (cents === null) return 'No Value'
  return formatCurrency(cents / 100)
}
```

### Anti-Patterns to Avoid

- **Don't use closestCenter for kanban:** Use `closestCorners` instead. With stacked columns, closestCenter can return the underlying column droppable instead of items within the column. See @dnd-kit collision detection docs.
- **Don't forget DragOverlay:** Without DragOverlay, the dragged item disappears during drag. Create a separate presentational component for the overlay.
- **Don't skip empty column handling:** Without `useDroppable` on columns, you can't drag items into empty stages.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-drop between columns | Custom drag logic | @dnd-kit with DndContext | Handles collisions, accessibility, touch |
| Empty column drop zones | Custom drop detection | useDroppable hook | Already handles edge cases |
| Currency formatting | Custom string formatting | Intl.NumberFormat | Locale-aware, handles edge cases |
| Inline expansion state | Complex state management | Simple useState per card | Cards are independent |

**Key insight:** @dnd-kit is already installed and well-documented. Don't try to simplify with a lighter library—it handles many edge cases.

## Common Pitfalls

### Pitfall 1: Wrong Collision Detection for Kanban
**What goes wrong:** Dragging a deal to another column triggers the wrong drop target
**Why it happens:** Default collision detection or closestCenter doesn't work well with stacked/nested droppables
**How to avoid:** Use `closestCorners` for kanban boards
**Warning signs:** Dragged item snaps to wrong column, or column highlight is erratic

### Pitfall 2: Can't Drop Into Empty Columns
**What goes wrong:** Dragging a deal into an empty stage doesn't register
**Why it happens:** SortableContext only tracks sortable items, not the container itself
**How to avoid:** Wrap each column with `useDroppable` to create a drop zone
**Warning signs:** Empty columns don't highlight when dragging over them

### Pitfall 3: Gap-Based Position Overflow
**What goes wrong:** After many reorderings, positions become too close or overflow
**Why it happens:** Gap-based positioning eventually runs out of gaps
**How to avoid:** 
1. When position gap is < 0.01, trigger a full renumbering
2. Or use a "normalize positions" background job
**Warning signs:** Deals stop moving to correct positions

### Pitfall 4: Mobile Drag vs Swipe Conflict
**What goes wrong:** Trying to drag on mobile triggers swipe navigation
**Why it happens:** Both touch gestures compete
**How to avoid:** 
1. Use `activationConstraint: { distance: 5 }` on PointerSensor
2. On mobile, disable drag and show a "move to" dropdown instead
**Warning signs:** Users accidentally swipe while trying to drag

### Pitfall 5: DragOverlay Component Reuse
**What goes wrong:** DragOverlay shows weird behavior or errors
**Why it happens:** Using the same component that calls useSortable in DragOverlay creates ID collision
**How to avoid:** Create a separate presentational component for DragOverlay
**Warning signs:** Console errors about duplicate IDs, overlay doesn't render

### Pitfall 6: Deal Without Org or Person
**What goes wrong:** Creating deal without linking to org or person
**Why it happens:** Both fields are nullable in schema
**How to avoid:** Add validation in server action: require at least one of organizationId or personId
**Warning signs:** Orphan deals in database

## Code Examples

### Server Action: Create Deal

```typescript
// src/app/deals/actions.ts
"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { deals } from "@/db/schema"
import { eq, and, isNull, desc, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const createDealSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  value: z.number().int().min(0).nullable().optional(),
  expectedCloseDate: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  stageId: z.string().min(1, "Stage is required"),
  organizationId: z.string().nullable().optional(),
  personId: z.string().nullable().optional(),
}).refine(
  (data) => data.organizationId || data.personId,
  { message: "At least one of organization or person is required" }
)

export async function createDeal(
  data: z.infer<typeof createDealSchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user) {
    return { success: false, error: "Unauthorized" }
  }

  const validated = createDealSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: validated.error.issues[0]?.message || "Invalid input" }
  }

  try {
    // Get max position in stage for gap-based ordering
    const existingDeals = await db.query.deals.findMany({
      where: and(
        eq(deals.stageId, validated.data.stageId),
        isNull(deals.deletedAt)
      ),
      orderBy: [desc(deals.position)],
    })

    const maxPosition = existingDeals[0]?.position ?? 0
    const position = maxPosition + 10

    const [deal] = await db.insert(deals).values({
      title: validated.data.title,
      value: validated.data.value ?? null,
      expectedCloseDate: validated.data.expectedCloseDate 
        ? new Date(validated.data.expectedCloseDate) 
        : null,
      notes: validated.data.notes || null,
      stageId: validated.data.stageId,
      organizationId: validated.data.organizationId || null,
      personId: validated.data.personId || null,
      ownerId: session.user.id,
      position,
    }).returning()

    revalidatePath("/deals")

    return { success: true, id: deal.id }
  } catch (error) {
    console.error("Failed to create deal:", error)
    return { success: false, error: "Failed to create deal" }
  }
}
```

### Server Action: Update Deal Stage (Drag-Drop)

```typescript
export async function updateDealStage(
  dealId: string,
  data: { stageId: string; position?: number }
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    // Verify deal exists and user owns it
    const deal = await db.query.deals.findFirst({
      where: and(
        eq(deals.id, dealId),
        eq(deals.ownerId, session.user.id),
        isNull(deals.deletedAt)
      ),
    })

    if (!deal) {
      return { success: false, error: "Deal not found" }
    }

    // If position not provided, calculate it
    let position = data.position
    if (position === undefined) {
      const existingDeals = await db.query.deals.findMany({
        where: and(
          eq(deals.stageId, data.stageId),
          isNull(deals.deletedAt)
        ),
        orderBy: [desc(deals.position)],
      })
      position = (existingDeals[0]?.position ?? 0) + 10
    }

    await db
      .update(deals)
      .set({
        stageId: data.stageId,
        position,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, dealId))

    revalidatePath("/deals")

    return { success: true }
  } catch (error) {
    console.error("Failed to update deal stage:", error)
    return { success: false, error: "Failed to update deal" }
  }
}
```

### Server Action: Reorder Deals Within Stage

```typescript
export async function reorderDeals(
  stageId: string,
  dealId: string,
  newIndex: number
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const allDeals = await db.query.deals.findMany({
      where: and(
        eq(deals.stageId, stageId),
        isNull(deals.deletedAt)
      ),
      orderBy: [sql`${deals.position} ASC`],
    })

    const currentIndex = allDeals.findIndex(d => d.id === dealId)
    if (currentIndex === -1) {
      return { success: false, error: "Deal not found in stage" }
    }

    const clampedIndex = Math.max(0, Math.min(newIndex, allDeals.length - 1))
    if (clampedIndex === currentIndex) {
      return { success: true }
    }

    // Gap-based positioning (same pattern as stages)
    let newPosition: number

    if (clampedIndex === 0) {
      newPosition = allDeals[0].position / 2
    } else if (clampedIndex >= allDeals.length - 1) {
      newPosition = allDeals[allDeals.length - 1].position + 10
    } else {
      const prevIndex = clampedIndex > currentIndex ? clampedIndex : clampedIndex - 1
      const nextIndex = clampedIndex > currentIndex ? clampedIndex + 1 : clampedIndex
      
      const prevPos = allDeals[Math.max(0, prevIndex)]?.position ?? 0
      const nextPos = allDeals[Math.min(allDeals.length - 1, nextIndex)]?.position ?? prevPos + 10
      
      newPosition = (prevPos + nextPos) / 2
    }

    await db
      .update(deals)
      .set({
        position: newPosition,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, dealId))

    revalidatePath("/deals")

    return { success: true }
  } catch (error) {
    console.error("Failed to reorder deals:", error)
    return { success: false, error: "Failed to reorder deals" }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom drag-drop | @dnd-kit | Phase 4 (2026-02-23) | Accessible, touch-friendly |
| Integer renumbering | Gap-based positioning | Phase 4 (2026-02-23) | No full-table updates |

**Deprecated/outdated:**
- react-beautiful-dnd: No longer maintained, use @dnd-kit instead

## Open Questions

1. **Currency Storage Format**
   - What we know: Using integer for value
   - What's unclear: Should we store as cents (multiply by 100) or base currency units?
   - Recommendation: Store as base currency units (e.g., 1234 for $1,234). Cents adds complexity for multi-currency scenarios.

2. **Mobile Drag Alternative**
   - What we know: Touch drag can conflict with swipe navigation
   - What's unclear: Best UX for mobile deal movement
   - Recommendation: On mobile, use a "Move to stage" dropdown in the card expansion instead of drag-drop.

## Sources

### Primary (HIGH confidence)
- @dnd-kit docs: https://docs.dndkit.com/presets/sortable - Sortable preset documentation
- @dnd-kit collision detection: https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms - Kanban-specific guidance
- MDN Intl.NumberFormat: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat - Currency formatting

### Secondary (MEDIUM confidence)
- Project existing code: src/app/admin/pipelines/[id]/stage-configurator.tsx - @dnd-kit patterns already used
- Project schema patterns: src/db/schema/people.ts, organizations.ts - Consistent patterns to follow

### Tertiary (LOW confidence)
- None needed - all core patterns verified with official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @dnd-kit already installed and used in Phase 4
- Architecture: HIGH - Based on official @dnd-kit documentation and existing project patterns
- Pitfalls: HIGH - Drawn from official @dnd-kit docs and collision detection guide
- Database schema: HIGH - Follows existing patterns from people/organizations

**Research date:** 2026-02-23
**Valid until:** 30 days (stable patterns)
