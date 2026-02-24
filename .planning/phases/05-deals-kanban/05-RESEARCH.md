# Phase 5: Deals & Kanban - Research

**Researched:** 2026-02-24
**Domain:** Kanban board with drag-drop, deal management with entity relationships
**Confidence:** HIGH

## Summary

This phase implements a kanban board for deal management with drag-and-drop between pipeline stages. The project already has @dnd-kit packages installed (`@dnd-kit/core: ^6.3.1`, `@dnd-kit/sortable: ^10.0.0`, `@dnd-kit/utilities: ^3.2.2`) and used in Phase 4 for single-list stage reordering. The key technical challenge is extending the existing single-list sortable pattern to multi-column kanban with cross-column drag-drop.

**Primary recommendation:** Use `closestCorners` collision detection (official @dnd-kit recommendation for kanban), wrap each column with `useDroppable` for empty column support, use `onDragOver` for cross-column moves, and use gap-based positioning for deal ordering within stages (same pattern as stages).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.3.1 | Core drag-drop primitives | Already installed, used in Phase 4 |
| @dnd-kit/sortable | ^10.0.0 | Sortable list functionality | Already installed, extends core |
| @dnd-kit/utilities | ^3.2.2 | CSS transform utilities | Already installed |
| Intl.NumberFormat | Native | Currency formatting | Browser-native, locale-aware |
| Drizzle ORM | existing | Database operations | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | existing | Validation schemas | All server actions |
| shadcn/ui Dialog | existing | Deal form dialog | Create/edit deal |
| shadcn/ui AlertDialog | existing | Delete confirmation | Destructive actions |

### Verified Versions (from package.json)
```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2"
```

## Architecture Patterns

### Database Schema: Deals Table

Based on existing patterns from `people.ts`, `organizations.ts`, and `pipelines.ts`:

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
- Both `organizationId` and `personId` nullable — at least one required (validation in server action)
- `value` nullable integer for "No Value" deals (CONTEXT.md requirement)
- `position` uses gap-based ordering (pattern from `reorderStages` action in Phase 4)
- Soft delete with `deletedAt` (consistent with organizations, pipelines, stages)

### Relations Addition (update _relations.ts)

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
│   └── (main)/
│       └── deals/
│           ├── page.tsx              # Kanban board page (server component)
│           ├── kanban-board.tsx      # Client component for DndContext
│           ├── kanban-column.tsx     # Single column with useDroppable
│           ├── deal-card.tsx         # Deal card with useSortable + expansion
│           ├── deal-card-overlay.tsx # Presentational overlay (NO hooks)
│           ├── deal-dialog.tsx       # Create/edit dialog (form)
│           ├── delete-deal-dialog.tsx # Delete confirmation
│           ├── won-lost-footer.tsx   # Won/Lost collapsed row
│           └── actions.ts            # Server actions for deals
├── db/schema/
│   ├── deals.ts                      # Deals table definition (NEW)
│   └── _relations.ts                 # Updated with deals relations
└── lib/
    └── currency.ts                   # Currency formatting utilities
```

### Pattern 1: Kanban Board with @dnd-kit (Multi-Column)

**CRITICAL: Use `closestCorners` for kanban, NOT `closestCenter`**

From official @dnd-kit documentation (verified 2026-02-24):
> "When building interfaces where droppable containers are stacked on top of one another, for example, when building a Kanban, the closest center algorithm can sometimes return the underlying droppable of the entire Kanban column rather than the droppable areas within that column. In those situations, the **closest corners** algorithm is preferred."

**Source:** https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms

```typescript
// kanban-board.tsx
"use client"

import { useState, useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,  // CRITICAL: Use closestCorners for kanban
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  UniqueIdentifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"

interface Deal {
  id: string
  title: string
  value: number | null
  stageId: string
  position: number
  organization: { name: string } | null
  person: { firstName: string; lastName: string } | null
}

interface Stage {
  id: string
  name: string
  type: 'open' | 'won' | 'lost'
  color: string
}

export function KanbanBoard({ 
  stages, 
  deals, 
  onDealMove,
  onDealReorder 
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)

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

  const activeDeal = activeId 
    ? deals.find(d => d.id === activeId) 
    : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Find the active deal
    const activeDeal = deals.find(d => d.id === activeId)
    if (!activeDeal) return

    // Determine target stage - either over a column or over a deal card
    let targetStageId: string
    
    if (over.data.current?.type === 'column') {
      // Dropped on empty column area
      targetStageId = overId
    } else {
      // Dropped on another deal card - get its stage
      const overDeal = deals.find(d => d.id === overId)
      targetStageId = overDeal?.stageId ?? activeDeal.stageId
    }

    // If moving to different stage, trigger move
    if (activeDeal.stageId !== targetStageId) {
      onDealMove(activeId, targetStageId)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    if (activeId === overId) return

    // Handle reordering within same stage
    const activeDeal = deals.find(d => d.id === activeId)
    const overDeal = deals.find(d => d.id === overId)

    if (activeDeal && overDeal && activeDeal.stageId === overDeal.stageId) {
      // Calculate new index within stage
      const stageDeals = dealsByStage[activeDeal.stageId]
      const overIndex = stageDeals.findIndex(d => d.id === overId)
      onDealReorder(activeDeal.stageId, activeId, overIndex)
    }
  }

  // Separate open stages from won/lost
  const openStages = stages.filter(s => s.type === 'open')
  const wonStage = stages.find(s => s.type === 'won')
  const lostStage = stages.find(s => s.type === 'lost')

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}  // MUST be closestCorners for kanban
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        {/* Main kanban area - only open stages */}
        <div className="flex gap-4 overflow-x-auto flex-1 pb-4">
          {openStages.map((stage) => (
            <KanbanColumn 
              key={stage.id} 
              stage={stage} 
              deals={dealsByStage[stage.id] || []}
            />
          ))}
        </div>

        {/* Won/Lost footer row */}
        <WonLostFooter 
          wonStage={wonStage} 
          lostStage={lostStage}
          dealsByStage={dealsByStage}
        />
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
**Why:** Without this, you can't drag deals into empty columns.

From @dnd-kit Sortable docs (verified 2026-02-24):
> "If you move all sortable items from one column into the other, you will need a droppable zone for the empty column so that you may drag sortable items back into that empty column."

**Source:** https://docs.dndkit.com/presets/sortable

```typescript
// kanban-column.tsx
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

interface KanbanColumnProps {
  stage: Stage
  deals: Deal[]
  children?: React.ReactNode
}

export function KanbanColumn({ stage, deals }: KanbanColumnProps) {
  // CRITICAL: useDroppable for empty column support
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
        isOver && "ring-2 ring-primary ring-offset-2"
      )}
    >
      {/* Stage header - shows count and total */}
      <div className="p-3 border-b sticky top-0 bg-inherit rounded-t-lg z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-full", `bg-${stage.color}-500`)} />
            <span className="font-medium truncate">{stage.name}</span>
          </div>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} · {formatCurrency(totalValue)}
        </div>
      </div>
      
      {/* Deal cards container - MUST have min-height for empty columns */}
      <div className="flex-1 p-2 space-y-2 min-h-[200px] overflow-y-auto">
        <SortableContext
          items={deals.map(d => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}
```

### Pattern 3: Deal Card with useSortable + Inline Expansion

```typescript
// deal-card.tsx
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useState } from "react"
import { GripVertical } from "lucide-react"

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

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card border rounded-lg p-3 transition-shadow",
        isDragging && "opacity-50 shadow-lg",
        isExpanded && "ring-2 ring-primary"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        
        {/* Clickable card content */}
        <div 
          className="flex-1 cursor-pointer min-w-0"
          onClick={handleToggleExpand}
        >
          <div className="font-medium truncate">{deal.title}</div>
          <div className="flex justify-between items-center mt-2 text-sm">
            <span className="text-muted-foreground truncate">
              {deal.organization?.name || 
               (deal.person && `${deal.person.firstName} ${deal.person.lastName}`) ||
               "No contact"}
            </span>
            <span className="font-medium shrink-0 ml-2">
              {deal.value != null ? formatCurrency(deal.value) : "—"}
            </span>
          </div>
        </div>
      </div>
      
      {/* Inline expansion - from CONTEXT.md */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t ml-6" onClick={e => e.stopPropagation()}>
          <div className="text-sm text-muted-foreground space-y-1">
            {deal.expectedCloseDate && (
              <div>Close: {formatDate(deal.expectedCloseDate)}</div>
            )}
            {deal.notes && (
              <div className="line-clamp-2">{deal.notes}</div>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <Button 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation()
                // Open edit dialog
              }}
            >
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

### Pattern 4: DealCardOverlay (CRITICAL - Separate Component)

**What:** Separate presentational component for DragOverlay
**Why:** Using the same component that calls `useSortable` causes ID collision

From @dnd-kit Sortable docs (verified 2026-02-24):
> "A common pitfall when using the DragOverlay component is rendering the same component that calls useSortable inside the DragOverlay. This will lead to unexpected results, since there will be an id collision."

**Source:** https://docs.dndkit.com/presets/sortable

```typescript
// deal-card-overlay.tsx
// This component MUST NOT call useSortable or any @dnd-kit hooks

interface DealCardOverlayProps {
  deal: Deal
}

export function DealCardOverlay({ deal }: DealCardOverlayProps) {
  return (
    <div className="bg-card border rounded-lg p-3 shadow-xl w-[260px]">
      <div className="font-medium truncate">{deal.title}</div>
      <div className="flex justify-between items-center mt-2 text-sm">
        <span className="text-muted-foreground truncate">
          {deal.organization?.name || 
           (deal.person && `${deal.person.firstName} ${deal.person.lastName}`) ||
           "No contact"}
        </span>
        <span className="font-medium">
          {deal.value != null ? formatCurrency(deal.value) : "—"}
        </span>
      </div>
    </div>
  )
}
```

### Pattern 5: Won/Lost Footer Row

From CONTEXT.md: "Won and Lost stages appear in a collapsed footer row on the kanban board"

```typescript
// won-lost-footer.tsx
interface WonLostFooterProps {
  wonStage: Stage | undefined
  lostStage: Stage | undefined
  dealsByStage: Record<string, Deal[]>
}

export function WonLostFooter({ wonStage, lostStage, dealsByStage }: WonLostFooterProps) {
  if (!wonStage && !lostStage) return null

  return (
    <div className="border-t pt-4 mt-4">
      <div className="flex gap-4">
        {wonStage && (
          <WonLostColumn 
            type="won"
            stage={wonStage} 
            deals={dealsByStage[wonStage.id] || []}
          />
        )}
        {lostStage && (
          <WonLostColumn 
            type="lost"
            stage={lostStage} 
            deals={dealsByStage[lostStage.id] || []}
          />
        )}
      </div>
    </div>
  )
}

function WonLostColumn({ type, stage, deals }: { 
  type: 'won' | 'lost'
  stage: Stage
  deals: Deal[] 
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0)

  return (
    <div className={cn(
      "w-[280px] min-w-[280px] rounded-lg",
      type === 'won' ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
    )}>
      <button 
        className="w-full p-3 flex items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Badge variant={type === 'won' ? 'default' : 'destructive'} className="text-xs">
            {type === 'won' ? 'Won' : 'Lost'}
          </Badge>
          <span className="text-sm">{deals.length} deal{deals.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="text-sm font-medium">
          {formatCurrency(totalValue)}
        </div>
      </button>
      
      {isExpanded && (
        <div className="p-2 pt-0 space-y-2 max-h-[300px] overflow-y-auto">
          {/* Could use sortable context here if drag-to-won/lost is needed */}
          {deals.map(deal => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  )
}
```

### Pattern 6: Mobile Single Column View

From CONTEXT.md: "Single column view with horizontal swipe on mobile/narrow screens"

```typescript
// kanban-board.tsx (mobile section)
import { useMediaQuery } from "@/hooks/use-media-query"

export function KanbanBoard({ stages, deals }: KanbanBoardProps) {
  const [activeStageIndex, setActiveStageIndex] = useState(0)
  const isMobile = useMediaQuery("(max-width: 768px)")
  
  const openStages = stages.filter(s => s.type === 'open')
  
  // Group deals by stage
  const dealsByStage = useMemo(() => { /* ... */ }, [stages, deals])

  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        {/* Stage indicator - clickable pills */}
        <div className="flex gap-2 p-3 overflow-x-auto no-scrollbar">
          {openStages.map((stage, i) => {
            const stageDeals = dealsByStage[stage.id] || []
            const totalValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
            
            return (
              <button
                key={stage.id}
                onClick={() => setActiveStageIndex(i)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm whitespace-nowrap flex items-center gap-2",
                  i === activeStageIndex 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                <span>{stage.name}</span>
                <span className="text-xs opacity-75">
                  {stageDeals.length}
                </span>
              </button>
            )
          })}
        </div>
        
        {/* Single column view */}
        <div className="flex-1 overflow-hidden">
          <KanbanColumn 
            stage={openStages[activeStageIndex]} 
            deals={dealsByStage[openStages[activeStageIndex].id] || []}
          />
        </div>
        
        {/* Won/Lost summary at bottom */}
        <WonLostSummary stages={stages} dealsByStage={dealsByStage} />
      </div>
    )
  }

  // Desktop: full kanban board
  return <DesktopKanbanBoard {...props} />
}
```

### Pattern 7: Currency Formatting

```typescript
// src/lib/currency.ts
export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  if (value === null || value === undefined) return '—'
  
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Usage examples:
// formatCurrency(123456) → "$123,456"
// formatCurrency(null) → "—"
// formatCurrency(0) → "$0"
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-drop between columns | Custom drag logic | @dnd-kit with DndContext | Handles collisions, accessibility, touch |
| Empty column drop zones | Custom drop detection | `useDroppable` hook | Handles edge cases per docs |
| Currency formatting | String concatenation | `Intl.NumberFormat` | Locale-aware, handles edge cases |
| Card inline expansion | Complex state management | Simple `useState` per card | Cards are independent |
| Mobile navigation | Custom touch swipe | Stage indicator buttons | Avoids drag/swipe conflict |
| Gap-based reordering | Full renumbering | Position averaging | No table-wide updates |

## Common Pitfalls

### Pitfall 1: Wrong Collision Detection for Kanban
**What goes wrong:** Dragging a deal to another column triggers the wrong drop target
**Why it happens:** `closestCenter` returns underlying column droppable instead of items within
**How to avoid:** Use `closestCorners` for kanban boards (official @dnd-kit recommendation)
**Warning signs:** Dragged item snaps to wrong column, or column highlight is erratic
**Source:** https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms

### Pitfall 2: Can't Drop Into Empty Columns
**What goes wrong:** Dragging a deal into an empty stage doesn't register
**Why it happens:** `SortableContext` only tracks sortable items, not the container
**How to avoid:** Wrap each column with `useDroppable` to create a drop zone
**Warning signs:** Empty columns don't highlight when dragging over them
**Source:** https://docs.dndkit.com/presets/sortable

### Pitfall 3: DragOverlay Component Reuse
**What goes wrong:** Console errors about duplicate IDs, overlay doesn't render correctly
**Why it happens:** Same component calling `useSortable` twice with same ID
**How to avoid:** Create separate presentational component for `DragOverlay` (no hooks)
**Warning signs:** "Duplicate ID" errors, overlay behaves unexpectedly
**Source:** https://docs.dndkit.com/presets/sortable

### Pitfall 4: Gap-Based Position Precision Loss
**What goes wrong:** After many reorderings, positions become too close (e.g., 0.0001)
**Why it happens:** Fractional positions eventually lose floating-point precision
**How to avoid:** When position gap < 0.01, trigger renumbering of all positions in stage
**Warning signs:** Deals stop moving to correct positions, sort order becomes unpredictable

### Pitfall 5: Deal Without Org or Person
**What goes wrong:** Creating deal without linking to organization or person
**Why it happens:** Both fields are nullable in schema
**How to avoid:** Add Zod validation: `.refine(data => data.organizationId || data.personId, ...)`
**Warning signs:** Orphan deals in database with no contacts

### Pitfall 6: Mobile Drag vs Navigation Conflict
**What goes wrong:** Trying to drag on mobile triggers stage navigation
**Why it happens:** Both touch gestures compete for the same input
**How to avoid:** On mobile, use stage indicator buttons instead of swipe; drag can still work within column
**Warning signs:** Users accidentally change stages while trying to drag

## Code Examples

### Server Action: Create Deal (with gap-based position)

```typescript
// src/app/deals/actions.ts
"use server"

import { auth } from "@/auth"
import { db } from "@/db"
import { deals } from "@/db/schema/deals"
import { eq, and, isNull, desc, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const createDealSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  value: z.number().int().min(0).nullable().optional(),
  expectedCloseDate: z.coerce.date().nullable().optional(),
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
    const position = maxPosition + 10 // Gap of 10

    const [deal] = await db.insert(deals).values({
      title: validated.data.title,
      value: validated.data.value ?? null,
      expectedCloseDate: validated.data.expectedCloseDate ?? null,
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
    // Verify deal exists
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

    // Check if position gap is too small - trigger renumbering
    if (Math.abs(newPosition) < 0.01) {
      // Renumber all deals in stage with gaps of 10
      await db.transaction(async (tx) => {
        for (let i = 0; i < allDeals.length; i++) {
          const deal = allDeals[i]
          const newPos = (i + 1) * 10
          await tx.update(deals)
            .set({ position: newPos, updatedAt: new Date() })
            .where(eq(deals.id, deal.id))
        }
      })
      // After renumbering, set the moved deal to correct position
      newPosition = (clampedIndex + 1) * 10
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

### Server Action: Delete Deal (Soft Delete)

```typescript
const deleteDealSchema = z.object({
  id: z.string().min(1),
})

export async function deleteDeal(
  data: z.infer<typeof deleteDealSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth()

  if (!session?.user) {
    return { success: false, error: "Unauthorized" }
  }

  const validated = deleteDealSchema.safeParse(data)
  if (!validated.success) {
    return { success: false, error: "Invalid deal ID" }
  }

  try {
    const deal = await db.query.deals.findFirst({
      where: and(
        eq(deals.id, validated.data.id),
        eq(deals.ownerId, session.user.id),
        isNull(deals.deletedAt)
      ),
    })

    if (!deal) {
      return { success: false, error: "Deal not found" }
    }

    // Soft delete
    await db
      .update(deals)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(deals.id, validated.data.id))

    revalidatePath("/deals")

    return { success: true }
  } catch (error) {
    console.error("Failed to delete deal:", error)
    return { success: false, error: "Failed to delete deal" }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @dnd-kit | Phase 4 (2026-02) | Accessible, maintained, touch-friendly |
| Integer renumbering | Gap-based positioning | Phase 4 (2026-02) | No full-table updates |

**Deprecated/outdated:**
- react-beautiful-dnd: No longer maintained, use @dnd-kit instead

## Open Questions

1. **Currency Storage Format**
   - What we know: Using `integer` for value field
   - What's unclear: Store as cents (multiply by 100) or base currency units?
   - Recommendation: Store as base currency units (e.g., 1234 for $1,234). Cents adds complexity for multi-currency. Keep it simple unless multi-currency is a future requirement.

2. **Mobile Drag within Single Column**
   - What we know: Touch drag can conflict with swipe navigation for columns
   - What's unclear: Should drag be disabled on mobile entirely?
   - Recommendation: Keep drag enabled within the visible column (vertical drag works fine). Only the horizontal column navigation uses buttons instead of swipe.

## Sources

### Primary (HIGH confidence)
- @dnd-kit Sortable docs: https://docs.dndkit.com/presets/sortable - Multiple containers pattern, DragOverlay pitfall, useDroppable for empty columns
- @dnd-kit Collision Detection: https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms - closestCorners for kanban (explicit recommendation)

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
