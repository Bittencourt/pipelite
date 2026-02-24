# Phase 5: Deals & Kanban - Research

**Researched:** 2026-02-24
**Domain:** Kanban board with drag-drop, deal management with entity relationships
**Confidence:** HIGH

## Summary

This phase implements a kanban board for deal management with drag-and-drop between pipeline stages. The project already has @dnd-kit/core (^6.3.1), @dnd-kit/sortable (^10.0.0), and @dnd-kit/utilities (^3.2.2) installed and used in Phase 4 for stage reordering. The key technical challenge is extending the existing single-list sortable pattern to multi-column kanban with cross-column drag-drop.

**Primary recommendation:** Use existing @dnd-kit packages with `closestCorners` collision detection (explicitly recommended in @dnd-kit docs for kanban), wrap each column with `useDroppable` for empty column support, and use gap-based positioning for deal ordering within stages (same pattern as stages).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.3.1 | Core drag-drop primitives | Already installed, Phase 4 |
| @dnd-kit/sortable | ^10.0.0 | Sortable list functionality | Already installed, extends core |
| @dnd-kit/utilities | ^3.2.2 | CSS transform utilities | Already installed |
| Intl.NumberFormat | Native | Currency formatting | Browser-native, locale-aware |
| Drizzle ORM | ^0.45.1 | Database operations | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | ^4.3.6 | Validation schemas | All server actions |
| shadcn/ui Dialog | Existing | Deal form dialog | Create/edit deal |
| shadcn/ui AlertDialog | Existing | Delete confirmation | Destructive actions |

### Already Installed (from package.json)
```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2"
```

## Architecture Patterns

### Database Schema: Deals Table

Based on existing patterns from `people.ts` and `pipelines.ts`:

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
  
  // Position for ordering within stage (gap-based, same as stages)
  position: integer('position').notNull(),
  
  // Timestamps (consistent with existing tables)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
```

**Schema decisions (from CONTEXT.md + existing patterns):**
- Both `organizationId` and `personId` nullable — at least one required (validation in action)
- `value` nullable integer for "No Value" deals
- `position` uses gap-based ordering (pattern from `reorderStages` action)
- Soft delete with `deletedAt` (consistent with organizations, pipelines)

### Relations Addition (add to _relations.ts)

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

// Update stagesRelations to include deals:
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
│   └── (main)/                    # or appropriate layout group
│       └── deals/
│           ├── page.tsx           # Kanban board page (server component)
│           ├── kanban-board.tsx   # Client component for DndContext
│           ├── kanban-column.tsx  # Single column with useDroppable
│           ├── deal-card.tsx      # Deal card with useSortable + inline expansion
│           ├── deal-dialog.tsx    # Create/edit dialog (form)
│           ├── delete-deal-dialog.tsx  # Delete confirmation
│           └── actions.ts         # Server actions for deals
├── db/schema/
│   ├── deals.ts                   # Deals table definition (NEW)
│   └── _relations.ts              # Updated with deals relations
└── lib/
    └── currency.ts                # Currency formatting utilities
```

### Pattern 1: Kanban Board with @dnd-kit (Multi-Column)

**CRITICAL: Use `closestCorners` for kanban, NOT `closestCenter`**

From official @dnd-kit docs:
> "When building interfaces where droppable containers are stacked on top of one another, for example, when building a Kanban, the closest center algorithm can sometimes return the underlying droppable of the entire Kanban column rather than the droppable areas within that column. In those situations, the **closest corners** algorithm is preferred."

**Source:** https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms

```typescript
// kanban-board.tsx
"use client"

import { useState } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,  // IMPORTANT: Use closestCorners for kanban
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

export function KanbanBoard({ stages, deals, onDealMove }) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }, // Prevent accidental drags
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    const grouped: Record<string, Deal[]> = {}
    for (const stage of stages) {
      grouped[stage.id] = deals
        .filter(d => d.stageId === stage.id)
        .sort((a, b) => a.position - b.position)
    }
    return grouped
  }, [stages, deals])

  const handleDragStart = (event: DragStartEvent) => {
    const deal = deals.find(d => d.id === event.active.id)
    setActiveDeal(deal || null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    // When dragging over a different column, update optimistically
    const { active, over } = event
    if (!over) return

    // Determine if over a column or a deal card
    const overId = over.id as string
    const overStageId = over.data.current?.type === 'column' 
      ? overId 
      : deals.find(d => d.id === overId)?.stageId

    const activeDeal = deals.find(d => d.id === active.id)
    if (activeDeal && activeDeal.stageId !== overStageId) {
      // Optimistic update - move deal to new stage
      onDealMove(active.id as string, overStageId, null)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDeal(null)

    if (!over) return

    // Calculate final position and persist
    // ... persist to server action
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}  // MUST be closestCorners for kanban
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <KanbanColumn key={stage.id} stage={stage} deals={dealsByStage[stage.id]}>
            <SortableContext
              items={dealsByStage[stage.id]?.map(d => d.id) || []}
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
        {activeDeal && <DealCardOverlay deal={activeDeal} />}
      </DragOverlay>
    </DndContext>
  )
}
```

### Pattern 2: Droppable Column (Empty Column Support)

**What:** Each column must be a droppable zone to handle empty stages.
**Why:** Without this, you can't drag deals back into empty columns.

From @dnd-kit Sortable docs:
> "If you move all sortable items from one column into the other, you will need a droppable zone for the empty column so that you may drag sortable items back into that empty column."

```typescript
// kanban-column.tsx
import { useDroppable } from "@dnd-kit/core"

interface KanbanColumnProps {
  stage: Stage
  deals: Deal[]
  children: React.ReactNode
}

export function KanbanColumn({ stage, deals, children }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: 'column', stage },
  })

  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-[280px] min-w-[280px] flex flex-col bg-muted/50 rounded-lg",
        isOver && "ring-2 ring-primary"
      )}
    >
      {/* Stage header - shows count and total */}
      <div className="p-3 border-b">
        <div className="font-medium">{stage.name}</div>
        <div className="text-sm text-muted-foreground">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} · {formatCurrency(totalValue)}
        </div>
      </div>
      
      {/* Deal cards container - must have min-height for empty columns */}
      <div className="flex-1 p-2 space-y-2 min-h-[200px]">
        {children}
      </div>
    </div>
  )
}
```

### Pattern 3: Deal Card with useSortable

**What:** Card uses `useSortable` (combines draggable + droppable)
**Why:** Cards can be dragged and also act as drop targets for reordering

```typescript
// deal-card.tsx
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useState } from "react"

interface DealCardProps {
  deal: Deal
}

export function DealCard({ deal }: DealCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

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
        <span className="text-muted-foreground truncate">
          {deal.organization?.name || deal.person?.firstName || "No contact"}
        </span>
        <span className="font-medium shrink-0 ml-2">
          {deal.value ? formatCurrency(deal.value) : "—"}
        </span>
      </div>
      
      {/* Inline expansion - from CONTEXT.md: click expands inline */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-sm text-muted-foreground space-y-1">
            {deal.expectedCloseDate && (
              <div>Close: {formatDate(deal.expectedCloseDate)}</div>
            )}
            {deal.notes && (
              <div className="line-clamp-2">{deal.notes}</div>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={(e) => {
              e.stopPropagation()
              // Open edit dialog
            }}>
              Edit
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={(e) => {
                e.stopPropagation()
                // Open delete confirmation
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

### Pattern 4: DragOverlay Component (CRITICAL)

**What:** Separate presentational component for DragOverlay
**Why:** Using the same component that calls `useSortable` in DragOverlay causes ID collision

From @dnd-kit Sortable docs:
> "A common pitfall when using the DragOverlay component is rendering the same component that calls useSortable inside the DragOverlay. This will lead to unexpected results, since there will be an id collision."

```typescript
// DealCardOverlay - presentational only, NO useSortable
export function DealCardOverlay({ deal }: { deal: Deal }) {
  return (
    <div className="bg-card border rounded-lg p-3 shadow-lg w-[260px]">
      <div className="font-medium truncate">{deal.title}</div>
      <div className="flex justify-between items-center mt-2 text-sm">
        <span className="text-muted-foreground truncate">
          {deal.organization?.name || deal.person?.firstName || "No contact"}
        </span>
        <span className="font-medium">
          {deal.value ? formatCurrency(deal.value) : "—"}
        </span>
      </div>
    </div>
  )
}
```

### Pattern 5: Won/Lost Footer Row (from CONTEXT.md)

**What:** Won/Lost stages in collapsed footer, not regular columns

```typescript
// kanban-board.tsx (partial)
export function KanbanBoard({ stages, deals }) {
  // Separate open stages from won/lost
  const openStages = stages.filter(s => s.type === 'open')
  const wonStage = stages.find(s => s.type === 'won')
  const lostStage = stages.find(s => s.type === 'lost')

  return (
    <div className="flex flex-col h-full">
      {/* Main kanban area - only open stages */}
      <div className="flex gap-4 overflow-x-auto flex-1 pb-4">
        {openStages.map((stage) => (
          <KanbanColumn key={stage.id} stage={stage} deals={dealsByStage[stage.id]}>
            {/* SortableContext + DealCards */}
          </KanbanColumn>
        ))}
      </div>

      {/* Won/Lost footer row - collapsed view */}
      {(wonStage || lostStage) && (
        <div className="border-t pt-4 mt-4">
          <div className="flex gap-4">
            {wonStage && (
              <WonLostColumn 
                type="won" 
                stage={wonStage} 
                deals={dealsByStage[wonStage.id]} 
              />
            )}
            {lostStage && (
              <WonLostColumn 
                type="lost" 
                stage={lostStage} 
                deals={dealsByStage[lostStage.id]} 
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

### Pattern 6: Mobile Single Column View

**What:** On mobile, show one column at a time with swipe navigation

```typescript
// kanban-board.tsx (mobile section)
import { useMediaQuery } from "@/hooks/use-media-query"

export function KanbanBoard({ stages, deals }) {
  const [activeStageIndex, setActiveStageIndex] = useState(0)
  const isMobile = useMediaQuery("(max-width: 768px)")
  
  const openStages = stages.filter(s => s.type === 'open')

  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        {/* Stage indicator */}
        <div className="flex justify-center gap-2 py-2">
          {openStages.map((stage, i) => (
            <button
              key={stage.id}
              onClick={() => setActiveStageIndex(i)}
              className={cn(
                "px-3 py-1 rounded-full text-sm",
                i === activeStageIndex 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground"
              )}
            >
              {stage.name}
            </button>
          ))}
        </div>
        
        {/* Single column view */}
        <div className="flex-1">
          <KanbanColumn 
            stage={openStages[activeStageIndex]} 
            deals={dealsByStage[openStages[activeStageIndex].id]}
          >
            {/* DealCards */}
          </KanbanColumn>
        </div>
      </div>
    )
  }

  // Desktop: full kanban board
  return <DesktopKanbanBoard ... />
}
```

### Pattern 7: Currency Formatting

```typescript
// src/lib/currency.ts
export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'USD'
): string {
  if (value === null || value === undefined) return '—'
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Usage: formatCurrency(123456) → "$123,456"
```

### Anti-Patterns to Avoid

- **DON'T use `closestCenter` for kanban:** Causes wrong drop target with stacked columns. Use `closestCorners`.
- **DON'T skip DragOverlay:** Without it, dragged item disappears.
- **DON'T skip `useDroppable` on columns:** Can't drop into empty stages.
- **DON'T reuse sortable component in DragOverlay:** Creates ID collision. Create separate presentational component.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-drop between columns | Custom drag logic | @dnd-kit with DndContext | Handles collisions, accessibility, touch |
| Empty column drop zones | Custom drop detection | `useDroppable` hook | Handles edge cases |
| Currency formatting | String concatenation | `Intl.NumberFormat` | Locale-aware, handles edge cases |
| Card inline expansion | Complex state management | Simple `useState` per card | Cards are independent |
| Mobile swipe navigation | Custom touch handling | Stage indicator buttons + click | Avoids drag/swipe conflict |

## Common Pitfalls

### Pitfall 1: Wrong Collision Detection for Kanban
**What goes wrong:** Dragging a deal to another column triggers the wrong drop target
**Why it happens:** `closestCenter` returns underlying column droppable instead of items
**How to avoid:** Use `closestCorners` for kanban boards (official @dnd-kit recommendation)
**Warning signs:** Dragged item snaps to wrong column, or column highlight is erratic
**Source:** https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms

### Pitfall 2: Can't Drop Into Empty Columns
**What goes wrong:** Dragging a deal into an empty stage doesn't register
**Why it happens:** `SortableContext` only tracks sortable items, not the container
**How to avoid:** Wrap each column with `useDroppable` to create a drop zone
**Warning signs:** Empty columns don't highlight when dragging over them

### Pitfall 3: DragOverlay Component Reuse
**What goes wrong:** Console errors about duplicate IDs, overlay doesn't render correctly
**Why it happens:** Same component calling `useSortable` twice with same ID
**How to avoid:** Create separate presentational component for `DragOverlay`
**Warning signs:** "Duplicate ID" errors, overlay behaves unexpectedly

### Pitfall 4: Gap-Based Position Overflow
**What goes wrong:** After many reorderings, positions become too close
**Why it happens:** Gap-based positioning eventually runs out of precision
**How to avoid:** When position gap < 0.01, trigger a renumbering of all positions
**Warning signs:** Deals stop moving to correct positions

### Pitfall 5: Deal Without Org or Person
**What goes wrong:** Creating deal without linking to organization or person
**Why it happens:** Both fields are nullable in schema
**How to avoid:** Add Zod validation: `refine(data => data.organizationId || data.personId)`
**Warning signs:** Orphan deals in database

### Pitfall 6: Mobile Drag vs Navigation Conflict
**What goes wrong:** Trying to drag on mobile triggers stage navigation
**Why it happens:** Both touch gestures compete
**How to avoid:** On mobile, use stage indicator buttons instead of swipe; disable drag or use "Move to" dropdown
**Warning signs:** Users accidentally change stages while trying to drag

## Code Examples

### Server Action: Create Deal (with gap-based position)

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
    // Get max position in stage for gap-based ordering (same pattern as stages)
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

### Server Action: Move Deal Between Stages

```typescript
export async function moveDeal(
  dealId: string,
  targetStageId: string,
  targetIndex?: number
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

    // Calculate new position using gap-based approach
    const targetDeals = await db.query.deals.findMany({
      where: and(
        eq(deals.stageId, targetStageId),
        isNull(deals.deletedAt)
      ),
      orderBy: [sql`${deals.position} ASC`],
    })

    let newPosition: number
    
    if (targetIndex === undefined || targetIndex >= targetDeals.length) {
      // Move to end
      const lastPos = targetDeals[targetDeals.length - 1]?.position ?? 0
      newPosition = lastPos + 10
    } else if (targetIndex <= 0) {
      // Move to start
      newPosition = (targetDeals[0]?.position ?? 10) / 2
    } else {
      // Move between neighbors
      const prevPos = targetDeals[targetIndex - 1]?.position ?? 0
      const nextPos = targetDeals[targetIndex]?.position ?? prevPos + 10
      newPosition = (prevPos + nextPos) / 2
    }

    await db
      .update(deals)
      .set({
        stageId: targetStageId,
        position: newPosition,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, dealId))

    revalidatePath("/deals")

    return { success: true }
  } catch (error) {
    console.error("Failed to move deal:", error)
    return { success: false, error: "Failed to move deal" }
  }
}
```

### Server Action: Reorder Deals Within Stage

```typescript
export async function reorderDeal(
  stageId: string,
  dealId: string,
  newIndex: number
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    // Same pattern as reorderStages from Phase 4
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

    // Gap-based positioning (same as stages)
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
    console.error("Failed to reorder deal:", error)
    return { success: false, error: "Failed to reorder deal" }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @dnd-kit | Phase 4 (2026-02-23) | Accessible, maintained, touch-friendly |
| Integer renumbering | Gap-based positioning | Phase 4 (2026-02-23) | No full-table updates |

**Deprecated/outdated:**
- react-beautiful-dnd: No longer maintained, use @dnd-kit instead

## Open Questions

1. **Currency Storage Format**
   - What we know: Using `integer` for value field
   - What's unclear: Store as cents (multiply by 100) or base currency units?
   - Recommendation: Store as base currency units (e.g., 1234 for $1,234). Cents adds complexity for multi-currency. Keep it simple.

2. **Mobile Drag Alternative**
   - What we know: Touch drag can conflict with swipe navigation
   - What's unclear: Best UX for mobile deal movement
   - Recommendation: Use stage indicator buttons (clickable pills) on mobile instead of swipe. Disable drag on mobile or use "Move to stage" dropdown in expanded card.

## Sources

### Primary (HIGH confidence)
- @dnd-kit Sortable docs: https://docs.dndkit.com/presets/sortable - Multiple containers pattern, DragOverlay pitfall
- @dnd-kit Collision Detection: https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms - closestCorners for kanban
- @dnd-kit Droppable docs: https://docs.dndkit.com/api-documentation/droppable - useDroppable hook

### Secondary (MEDIUM confidence)
- Project existing code: `src/app/admin/pipelines/[id]/stage-configurator.tsx` - @dnd-kit patterns used in Phase 4
- Project actions: `src/app/admin/pipelines/actions.ts` - Gap-based positioning implementation
- Project schema patterns: `src/db/schema/people.ts`, `src/db/schema/pipelines.ts`

### Tertiary (LOW confidence)
- None needed - all core patterns verified with official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @dnd-kit already installed, verified versions from package.json
- Architecture: HIGH - Based on official @dnd-kit documentation with explicit kanban guidance
- Patterns: HIGH - Verified with @dnd-kit official docs, existing project code
- Database schema: HIGH - Follows existing patterns from people/organizations/pipelines tables
- Pitfalls: HIGH - Drawn from official @dnd-kit documentation warnings

**Research date:** 2026-02-24
**Valid until:** 30 days (stable patterns, @dnd-kit API stable)
