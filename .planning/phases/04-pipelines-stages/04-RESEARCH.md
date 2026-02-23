# Phase 4: Pipelines & Stages - Research

**Researched:** 2026-02-22
**Domain:** Sales pipeline configuration with drag-and-drop stage ordering
**Confidence:** HIGH

## Summary

This phase requires implementing CRUD for pipelines and stages with drag-and-drop reordering. The research covers:
1. **dnd-kit** - the modern React drag-and-drop library (replacing deprecated react-beautiful-dnd)
2. **Database ordering patterns** - integer position columns with gap-based ordering
3. **Color palette** - predefined stage colors using Tailwind CSS
4. **Per-user visibility** - many-to-many junction table pattern

**Primary recommendation:** Use `@dnd-kit/react` with `@dnd-kit/dom/sortable` for drag-and-drop, integer position columns for stage ordering, and a junction table for pipeline visibility.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/react | latest | React drag-and-drop | Modern, maintained (16.6k stars), React 19 compatible, accessible |
| @dnd-kit/dom | latest | DOM layer for dnd-kit | Framework-agnostic core, used with React adapter |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @dnd-kit/utilities | latest | CSS transform helpers | For converting transform objects |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit/react | react-beautiful-dnd | RBD is deprecated (archive mode since 2023), no React 18+ support |
| @dnd-kit/react | react-dnd | More complex API, requires more boilerplate |

**Installation:**
```bash
npm install @dnd-kit/react @dnd-kit/dom
```

## Architecture Patterns

### Database Schema for Ordered Stages

**Recommended Pattern:** Integer position with gap-based ordering

```typescript
// src/db/schema/pipelines.ts
import { pgTable, text, integer, timestamp, pgEnum, unique } from "drizzle-orm/pg-core"
import { users } from "./users"

export const stageTypeEnum = pgEnum('stage_type', ['open', 'won', 'lost'])

export const pipelines = pgTable('pipelines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  isDefault: integer('is_default').default(0), // 0 = false, 1 = true (simple toggle)
  ownerId: text('owner_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const stages = pgTable('stages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pipelineId: text('pipeline_id').notNull().references(() => pipelines.id),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').notNull().default('blue'), // Predefined color key
  type: stageTypeEnum('type').default('open').notNull(),
  position: integer('position').notNull(), // Gap-based: 10, 20, 30...
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.pipelineId, table.name), // Unique name per pipeline
])

// Per-user visibility junction table
export const pipelineVisibility = pgTable('pipeline_visibility', {
  pipelineId: text('pipeline_id').notNull().references(() => pipelines.id),
  userId: text('user_id').notNull().references(() => users.id),
}, (table) => [
  // Composite primary key
  primaryKey({ columns: [table.pipelineId, table.userId] }),
])
```

**Key Design Decisions:**
- **Position column**: Integer with gap-based ordering (10, 20, 30...) allows insertions without renumbering all items
- **Unique constraint**: Stage names unique within pipeline
- **Stage type enum**: 'open', 'won', 'lost' with implicit 'open' as default
- **Soft delete**: Follows existing pattern with `deletedAt`

### Project Structure
```
src/
├── db/schema/
│   ├── pipelines.ts          # Pipeline + stage schemas
│   ├── _relations.ts         # Add pipeline/stage relations
│   └── index.ts              # Export new schemas
├── app/
│   ├── admin/pipelines/
│   │   ├── page.tsx          # Pipeline list
│   │   ├── actions.ts        # Server actions
│   │   └── components/
│   │       ├── pipeline-card.tsx
│   │       ├── pipeline-dialog.tsx
│   │       └── stage-configurator.tsx  # Drag-and-drop stages
│   └── pipelines/
│       └── [id]/
│           └── page.tsx      # Pipeline detail/stages view
└── lib/
    └── stage-colors.ts       # Color palette constants
```

### Pattern 1: Drag-and-Drop Stage Reordering

**What:** Horizontal sortable list of stages within a pipeline configuration UI
**When to use:** Pipeline configuration page where admin reorders stages

```tsx
// Source: https://dndkit.com/react/hooks/use-sortable
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableStage({ id, index, name, color }) {
  const { ref, isDragSource, isDropTarget } = useSortable({
    id,
    index,
  });

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg border cursor-grab",
        isDragSource && "opacity-50 scale-105",
        isDropTarget && "border-primary"
      )}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <div className={cn("w-3 h-3 rounded-full", COLORS[color].bg)} />
      <span>{name}</span>
    </div>
  );
}

function StageConfigurator({ stages, onReorder }) {
  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled) return;
        // With optimistic sorting, get new position from source.index
        const { source } = event.operation;
        if (isSortable(source)) {
          const { initialIndex, index } = source;
          if (initialIndex !== index) {
            onReorder(initialIndex, index);
          }
        }
      }}
    >
      <div className="flex gap-2 overflow-x-auto p-4">
        {stages.map((stage, index) => (
          <SortableStage key={stage.id} {...stage} index={index} />
        ))}
      </div>
    </DragDropProvider>
  );
}
```

### Pattern 2: Stage Color Palette

**What:** Predefined colors for stage chips, stored as string keys in database

```typescript
// src/lib/stage-colors.ts
export const STAGE_COLORS = {
  slate: {
    bg: 'bg-slate-500',
    text: 'text-slate-500',
    border: 'border-slate-500',
    light: 'bg-slate-100',
  },
  blue: {
    bg: 'bg-blue-500',
    text: 'text-blue-500',
    border: 'border-blue-500',
    light: 'bg-blue-100',
  },
  emerald: {
    bg: 'bg-emerald-500',
    text: 'text-emerald-500',
    border: 'border-emerald-500',
    light: 'bg-emerald-100',
  },
  amber: {
    bg: 'bg-amber-500',
    text: 'text-amber-500',
    border: 'border-amber-500',
    light: 'bg-amber-100',
  },
  rose: {
    bg: 'bg-rose-500',
    text: 'text-rose-500',
    border: 'border-rose-500',
    light: 'bg-rose-100',
  },
  violet: {
    bg: 'bg-violet-500',
    text: 'text-violet-500',
    border: 'border-violet-500',
    light: 'bg-violet-100',
  },
  cyan: {
    bg: 'bg-cyan-500',
    text: 'text-cyan-500',
    border: 'border-cyan-500',
    light: 'bg-cyan-100',
  },
  orange: {
    bg: 'bg-orange-500',
    text: 'text-orange-500',
    border: 'border-orange-500',
    light: 'bg-orange-100',
  },
} as const;

export type StageColor = keyof typeof STAGE_COLORS;

// Auto-assign colors in rotation
export function getNextColor(existingColors: StageColor[]): StageColor {
  const colorKeys = Object.keys(STAGE_COLORS) as StageColor[];
  const colorCounts = new Map<StageColor, number>();
  
  for (const color of colorKeys) {
    colorCounts.set(color, 0);
  }
  for (const color of existingColors) {
    colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
  }
  
  // Return color with lowest count
  return [...colorCounts.entries()]
    .sort((a, b) => a[1] - b[1])[0][0];
}
```

### Pattern 3: Server Action for Stage Reordering

```typescript
// src/app/admin/pipelines/actions.ts
export async function reorderStages(
  pipelineId: string,
  stageId: string,
  newPosition: number
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Get all stages for pipeline, ordered by position
  const stages = await db.query.stages.findMany({
    where: and(
      eq(stages.pipelineId, pipelineId),
      isNull(stages.deletedAt)
    ),
    orderBy: [asc(stages.position)],
  });

  // Calculate new positions using gap approach
  // If moving to position 0, use position / 2
  // If moving to end, use last position + 10
  // Otherwise, use average of neighbors
  const currentIndex = stages.findIndex(s => s.id === stageId);
  const targetStage = stages[newPosition];
  
  let newOrder: number;
  if (newPosition === 0) {
    newOrder = stages[0].position / 2;
  } else if (newPosition >= stages.length - 1) {
    newOrder = stages[stages.length - 1].position + 10;
  } else {
    const prevPos = stages[newPosition - 1].position;
    const nextPos = targetStage.position;
    newOrder = (prevPos + nextPos) / 2;
  }

  // Update stage position
  await db.update(stages)
    .set({ position: newOrder, updatedAt: new Date() })
    .where(eq(stages.id, stageId));

  revalidatePath(`/admin/pipelines/${pipelineId}`);
  return { success: true };
}
```

### Anti-Patterns to Avoid

- **Don't use array index as position:** Causes full renumbering on every reorder. Use gap-based integers instead.
- **Don't store stage order as JSON array in pipeline:** Prevents efficient queries and joins. Use position column.
- **Don't use floats for position:** Can lead to precision issues after many reorderings. Recalculate positions periodically.
- **Don't use @dnd-kit/core (old package):** Use `@dnd-kit/react` and `@dnd-kit/dom/sortable` for the new architecture.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop | Custom mouse/touch handlers | @dnd-kit/react | Handles accessibility, keyboard, collision detection, animations |
| Stage ordering | Array index manipulation | Integer position + gap | Efficient inserts, no full renumbering |
| Color picker | Custom hex input | Predefined palette + select | Consistency, accessibility, no invalid colors |
| Visibility rules | Custom ACL system | Junction table | Simple, queryable, follows existing patterns |

**Key insight:** dnd-kit handles accessibility (keyboard navigation, screen readers) automatically. Custom implementations often miss these.

## Common Pitfalls

### Pitfall 1: Position Column Gaps Exhausted
**What goes wrong:** After many reorderings, gaps between positions become too small (e.g., 1.00001, 1.00002)
**Why it happens:** Gap approach uses averages, which halve the gap each time
**How to avoid:** Periodically renumber all positions (10, 20, 30...) when gaps get too small
**Warning signs:** Positions with many decimal places, floating point comparison issues

### Pitfall 2: Deleted Stage Still Referenced by Deals
**What goes wrong:** Stage deleted but deals still reference it (foreign key violation or orphaned deals)
**Why it happens:** Missing check for deal references before deletion
**How to avoid:** 
1. Query deal count before deletion
2. If deals exist, require reassignment first
3. Show confirmation dialog with deal count

### Pitfall 3: Multiple Won/Lost Stages
**What goes wrong:** Pipeline has multiple Won or Lost stages, breaking reporting logic
**Why it happens:** Missing constraint enforcement
**How to avoid:** 
1. Check existing stage types before allowing Won/Lost creation
2. Show warning if Won/Lost already exists
3. Consider database constraint via application logic

### Pitfall 4: dnd-kit Version Mismatch
**What goes wrong:** Import errors or missing exports
**Why it happens:** dnd-kit has new architecture with separate packages
**How to avoid:** 
- Use `@dnd-kit/react` for React components
- Use `@dnd-kit/dom/sortable` for sortable functionality
- Don't mix old `@dnd-kit/core` with new packages

## Code Examples

### Default Stages for New Pipeline

```typescript
const DEFAULT_STAGES = [
  { name: 'Lead', color: 'slate', type: 'open' as const },
  { name: 'Qualified', color: 'blue', type: 'open' as const },
  { name: 'Proposal', color: 'amber', type: 'open' as const },
  { name: 'Negotiation', color: 'emerald', type: 'open' as const },
  { name: 'Won', color: 'emerald', type: 'won' as const },
  { name: 'Lost', color: 'rose', type: 'lost' as const },
];

async function createPipelineWithDefaults(name: string, ownerId: string) {
  return await db.transaction(async (tx) => {
    const [pipeline] = await tx.insert(pipelines).values({
      name,
      ownerId,
    }).returning();

    await tx.insert(stages).values(
      DEFAULT_STAGES.map((stage, index) => ({
        ...stage,
        pipelineId: pipeline.id,
        position: (index + 1) * 10, // 10, 20, 30...
      }))
    );

    return pipeline;
  });
}
```

### Stage Color Picker Component

```tsx
function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {Object.entries(STAGE_COLORS).map(([key, colors]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "w-6 h-6 rounded-full border-2 transition-all",
            colors.bg,
            value === key ? "ring-2 ring-offset-2 ring-primary" : "border-transparent"
          )}
        />
      ))}
    </div>
  );
}
```

### Stage Chip Display

```tsx
function StageChip({ stage }) {
  const colors = STAGE_COLORS[stage.color];
  
  return (
    <Badge 
      variant="outline"
      className={cn("gap-1.5", colors.text, colors.border)}
    >
      <span className={cn("w-2 h-2 rounded-full", colors.bg)} />
      {stage.name}
    </Badge>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @dnd-kit/react | 2023 | Active maintenance, React 18/19 support |
| Array index ordering | Gap-based integer position | Standard practice | Efficient inserts without renumbering |
| Custom color pickers | Predefined palettes | Best practice | Consistency, accessibility |

**Deprecated/outdated:**
- `@dnd-kit/core`: Replaced by `@dnd-kit/react` + `@dnd-kit/dom` architecture
- `react-beautiful-dnd`: Archived, no longer maintained
- Storing order as JSON array: Anti-pattern, prevents efficient queries

## Open Questions

1. **Position Recalculation Threshold**
   - What we know: Gap-based ordering eventually needs recalibration
   - What's unclear: When to trigger (after N reorders? when gap < 0.01?)
   - Recommendation: Implement as background job or after N operations

2. **Won/Lost Stage Constraints**
   - What we know: Exactly one Won and one Lost allowed (optional to have)
   - What's unclear: Should deletion of Won/Lost be blocked if deals exist?
   - Recommendation: Require reassignment, extra confirmation for Won/Lost

## Sources

### Primary (HIGH confidence)
- https://dndkit.com/llms.txt - dnd-kit documentation index
- https://dndkit.com/react/hooks/use-sortable - Sortable API reference
- https://dndkit.com/concepts/sortable - Sortable concept documentation
- https://github.com/clauderic/dnd-kit - 16.6k stars, active maintenance

### Secondary (MEDIUM confidence)
- Drizzle ORM documentation - patterns verified against existing project code
- Existing project patterns (users.ts, organizations.ts, people.ts)

### Tertiary (LOW confidence)
- None - all recommendations based on primary sources or verified patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - dnd-kit is the clear winner, actively maintained, well-documented
- Architecture: HIGH - integer position is standard pattern, verified with Drizzle docs
- Pitfalls: MEDIUM - based on common patterns, may need adjustment during implementation

**Research date:** 2026-02-22
**Valid until:** 30 days (stable patterns, library versions may update)
