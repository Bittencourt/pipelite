# Phase 15: Multi-user Collaboration - Research

**Researched:** 2026-03-07
**Domain:** CRM multi-user assignment — Drizzle ORM many-to-many, multi-select UI, team filtering
**Confidence:** HIGH

---

## Summary

Phase 15 adds assignees to deals (many-to-many) and activities (single FK), plus a "team view" filter on the existing kanban. No external packages are required — all needed primitives are already in the project: `Avatar`/`AvatarGroup`/`AvatarGroupCount` in `src/components/ui/avatar.tsx`, `Command`/`CommandInput`/`CommandItem` in `src/components/ui/command.tsx` (backed by `cmdk` v1.1.1), and Drizzle ORM 0.45.1 with its join-table many-to-many pattern.

The primary authorization concern is that all deal and activity mutations currently guard with `ownerId !== session.user.id`, rejecting non-owners. This must be relaxed: assignees need at least read access to records they're assigned to, and the business logic must decide whether assignees can also edit (likely yes for activities, debatable for deals). The simplest safe default is: owner OR admin can mutate; assignees get read access. Since the phase goal is "teams can collaborate", the planner should choose: owner/admin can edit, assignees can view. This keeps authorization simple.

The "team view" is not a new page — it is a new filter option added to the existing deals kanban (`?assignee=me`) and the existing activities list. This re-uses `DealFilters` and `ActivityFilters`, which already support URL-param-driven filtering. The kanban board server component already accepts `owners` and `activeFilters` props; adding an `assignee` filter follows the exact same pattern as the existing `owner` filter.

**Primary recommendation:** Use a join-table many-to-many for deal assignees, a single FK (`assigneeId`) for activity assignees, `AvatarGroup` for kanban card display, and `Command`+`CommandInput` inside a Popover for the multi-select picker. Add `?assignee=me` as a new URL filter param on the existing kanban and activity list — no new page needed.

---

## Standard Stack

### Core (all already installed — zero new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 | Join table schema + queries | Already used for all DB operations |
| radix-ui (Avatar) | 1.4.3 | `AvatarGroup`, `AvatarGroupCount` | Already in `src/components/ui/avatar.tsx` |
| cmdk | 1.1.1 | Multi-select combobox for assignee picker | Already in `src/components/ui/command.tsx` |
| react-hook-form | 7.71.2 | Form state for dialogs | Existing pattern in all dialogs |
| zod | 4.3.6 | Server-side validation of assignee arrays | Existing pattern in all actions |

### No New Packages Required
The entire feature can be built with what is already installed. The `Command`+`CommandInput`+`CommandItem` pattern from `cmdk` is the standard approach for searchable multi-select within shadcn/ui ecosystems.

---

## Architecture Patterns

### Recommended New Files
```
src/db/schema/
├── deal-assignees.ts        # New join table: deal_assignees
└── _relations.ts            # Updated: add dealAssigneesRelations

src/app/deals/
├── actions.ts               # Updated: addDealAssignees, removeDealAssignee helpers
├── deal-dialog.tsx          # Updated: add assignees multi-select field
├── deal-card.tsx            # Updated: show AvatarGroup of assignees
└── page.tsx                 # Updated: assignee filter query param support

src/app/activities/
├── actions.ts               # Updated: accept assigneeId in create/update
└── activity-dialog.tsx      # Updated: add single assignee Select field

src/components/
└── assignee-picker.tsx      # New: reusable multi-select combobox for users
```

### Pattern 1: Join Table Schema (Deal Assignees)
**What:** A standard Drizzle many-to-many join table with composite primary key.
**When to use:** Deals need multiple assignees; relation needs to be queryable from both sides.

```typescript
// src/db/schema/deal-assignees.ts
// Source: Drizzle docs https://orm.drizzle.team/docs/relations
import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core"
import { users } from "./users"
import { deals } from "./deals"

export const dealAssignees = pgTable(
  'deal_assignees',
  {
    dealId: text('deal_id').notNull().references(() => deals.id),
    userId: text('user_id').notNull().references(() => users.id),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.userId] })]
)
```

### Pattern 2: Relations Registration (in _relations.ts)
**What:** Both sides of the many-to-many declared in the central relations file to avoid circular imports.
**When to use:** Required — this project keeps all relations in `_relations.ts`.

```typescript
// Add to _relations.ts — import dealAssignees
// Source: Drizzle docs + codebase _relations.ts pattern

// Update dealsRelations:
export const dealsRelations = relations(deals, ({ one, many }) => ({
  // ...existing relations...
  assignees: many(dealAssignees),
}))

// Update usersRelations:
export const usersRelations = relations(users, ({ many }) => ({
  // ...existing relations...
  dealAssignments: many(dealAssignees),
}))

// New:
export const dealAssigneesRelations = relations(dealAssignees, ({ one }) => ({
  deal: one(deals, {
    fields: [dealAssignees.dealId],
    references: [deals.id],
  }),
  user: one(users, {
    fields: [dealAssignees.userId],
    references: [users.id],
  }),
}))
```

### Pattern 3: Activity Assignee (Single FK)
**What:** Add `assigneeId` nullable FK column directly to the `activities` table.
**When to use:** Activities have at most one assignee — simpler than a join table.

```typescript
// In src/db/schema/activities.ts — add one column:
assigneeId: text('assignee_id').references(() => users.id),
```

Then add to `_relations.ts` `activitiesRelations`:
```typescript
assignee: one(users, {
  fields: [activities.assigneeId],
  references: [users.id],
  relationName: 'assignedActivities',  // avoids ambiguity with owner relation
})
```

And add to `usersRelations`:
```typescript
assignedActivities: many(activities, { relationName: 'assignedActivities' }),
```

### Pattern 4: Querying Deals with Assignees
**What:** Use Drizzle `with` to eagerly load assignees alongside deals.

```typescript
// Source: Drizzle docs — nested with
const deal = await db.query.deals.findFirst({
  where: eq(deals.id, id),
  with: {
    assignees: {
      with: {
        user: {
          columns: { id: true, name: true, email: true },
        },
      },
    },
  },
})
```

### Pattern 5: Saving Assignees (Replace Strategy)
**What:** On deal create/update, replace all assignees atomically: delete existing rows then bulk-insert new ones.
**When to use:** Simpler than diffing — UI sends full new list, server replaces.

```typescript
// Source: Drizzle docs insert + Drizzle docs delete
// Inside a server action:
await db.delete(dealAssignees).where(eq(dealAssignees.dealId, dealId))
if (assigneeIds.length > 0) {
  await db.insert(dealAssignees).values(
    assigneeIds.map(userId => ({ dealId, userId }))
  )
}
```

### Pattern 6: Filtering Deals by Assignee
**What:** Add `?assignee=me` (or `?assignee={userId}`) URL param to the deals page. In the server component, join through `dealAssignees` to filter.

```typescript
// Source: existing deal filter pattern in src/app/deals/page.tsx
// Add to filterConditions array:
params.assignee
  ? sql`${deals.id} IN (
      SELECT deal_id FROM deal_assignees WHERE user_id = ${params.assignee}
    )`
  : undefined,
```

Or with Drizzle's `inArray` + subquery approach:
```typescript
import { inArray } from "drizzle-orm"

const assignedDealIds = params.assignee
  ? await db
      .select({ dealId: dealAssignees.dealId })
      .from(dealAssignees)
      .where(eq(dealAssignees.userId, params.assignee))
  : null

// Then in filterConditions:
assignedDealIds
  ? inArray(deals.id, assignedDealIds.map(r => r.dealId))
  : undefined,
```

### Pattern 7: Multi-select Assignee Picker Component
**What:** A Popover containing a `Command`+`CommandInput`+`CommandList` from the existing `cmdk`-backed component. Renders selected users as `AvatarGroup`.
**When to use:** Deal create/edit dialog — replaces a plain `Select` for multi-user selection.

```typescript
// Uses: src/components/ui/command.tsx + src/components/ui/avatar.tsx
// Pattern: controlled array in react-hook-form via watch/setValue
// (mirrors existing watch/setValue pattern in deal-dialog.tsx)

const assigneeIds = watch("assigneeIds") ?? []

// Popover trigger shows AvatarGroup of selected users
// Command inside Popover shows searchable user list with Check marks
// Clicking a user toggles their ID in the assigneeIds array
```

### Pattern 8: Avatar Group on Deal Cards
**What:** Show up to 3 assignee avatars with overflow count using `AvatarGroup` and `AvatarGroupCount`.

```typescript
// Source: src/components/ui/avatar.tsx — AvatarGroup, AvatarGroupCount already exist
<AvatarGroup>
  {assignees.slice(0, 3).map(a => (
    <Avatar key={a.userId} size="sm">
      <AvatarFallback>{getInitials(a.user.name)}</AvatarFallback>
    </Avatar>
  ))}
  {assignees.length > 3 && (
    <AvatarGroupCount>+{assignees.length - 3}</AvatarGroupCount>
  )}
</AvatarGroup>
```

### Anti-Patterns to Avoid
- **PostgreSQL array column for assignees:** `text[]` column would work but doesn't support Drizzle relational queries with user data, can't JOIN efficiently, and breaks the consistent FK/relational pattern of this codebase.
- **Separate "assign to me" action without updating the dialog:** The full assignees list must go through the dialog so the user can see and manage all assignees in one place.
- **Duplicating the team view as a new route:** A new `/team` page is unnecessary overhead. A filter on the existing kanban (`?assignee=me`) and activity list achieves the same goal with no new route, no new layout entry, no new i18n section.
- **Forgetting to pass assignees into the `Deal` interface in deal-card.tsx:** The `Deal` type exported from `deal-card.tsx` is used in multiple places. When adding `assignees` to the `Deal` type, all call sites that construct deals must include the field (even if empty array).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Searchable multi-select | Custom dropdown with filter input | `Command`+`CommandInput`+`CommandItem` from `cmdk` (already installed) | Already handles keyboard nav, search filtering, accessibility |
| User avatars with initials | Custom circle with CSS | `Avatar`+`AvatarFallback`+`AvatarGroup` (already in avatar.tsx) | `AvatarGroup` handles overlap/ring spacing automatically |
| Stacked avatar overflow | Count badge with manual positioning | `AvatarGroupCount` (already in avatar.tsx) | Already handles `size` variants and ring styles |
| DB relation queries | Raw SQL JOIN strings | Drizzle `with` relational queries | Type-safe, consistent with codebase patterns |

**Key insight:** This phase requires zero new dependencies. The hardest part is the replace-strategy for assignees (delete + bulk insert) and updating the authorization logic to allow assignees to view/edit records.

---

## Common Pitfalls

### Pitfall 1: Authorization Breaks Assignee Access
**What goes wrong:** `updateDeal` and `deleteDeal` currently check `deal.ownerId !== session.user.id` and return `"Not authorized"`. An assignee trying to edit a deal they're assigned to will be rejected.
**Why it happens:** The authorization was written when only the owner concept existed.
**How to avoid:** Update the auth check to: `deal.ownerId !== session.user.id && session.user.role !== 'admin'`. For read-only access (viewing assigned deals in the team filter), no change is needed — the kanban query doesn't check ownership. For mutations (update/delete), decide and document the policy: recommend owner + admin can mutate, not mere assignees, to keep it simple.
**Warning signs:** Assignees click "edit" on a deal and get a toast error "Not authorized".

### Pitfall 2: Missing Assignees in DealWithRelations Types
**What goes wrong:** The `DealWithRelations` interface in `src/app/deals/page.tsx` and the `Deal` interface in `deal-card.tsx` don't include `assignees`. Components receive deal objects without the field, `AvatarGroup` renders nothing, TypeScript doesn't catch it at build time if typed as optional.
**Why it happens:** The type is defined in multiple places and the Drizzle query must explicitly use `with: { assignees: { with: { user: ... } } }`.
**How to avoid:** Add `assignees: { userId: string; user: { name: string | null; email: string } }[]` to the `DealWithRelations` interface and the `Deal` type in `deal-card.tsx`. Default to `[]` when the field is absent.
**Warning signs:** Kanban cards show no avatars even after assigning users.

### Pitfall 3: Relation Name Ambiguity for Activity Assignee
**What goes wrong:** `activities` already has an `ownerId → users` relation named `owner`. Adding a second `one(users, ...)` without a `relationName` causes Drizzle to throw an ambiguous relation error at runtime.
**Why it happens:** Drizzle requires `relationName` to disambiguate when two `one()` relations point to the same table.
**How to avoid:** Use `relationName: 'assignedActivities'` on both the `one()` in `activitiesRelations` and the `many()` in `usersRelations`.
**Warning signs:** Runtime error "Relation is not unique" or TypeScript compile error from Drizzle.

### Pitfall 4: Dialog Data Shape Mismatch
**What goes wrong:** The deal dialog receives `deal` prop for edit mode. If `assignees` is not added to the prop interface and to the `reset()` call in `useEffect`, the form won't pre-populate assignees in edit mode.
**Why it happens:** The form uses `reset()` with an explicit object shape; any missing field stays at its `defaultValue`.
**How to avoid:** Add `assigneeIds: deal.assignees?.map(a => a.userId) ?? []` to the `reset()` call and include `assigneeIds: z.array(z.string()).optional()` in the dialog's Zod schema.
**Warning signs:** Edit dialog opens but no assignees are pre-selected even though the deal has assignees.

### Pitfall 5: Drizzle Migration Generation Order
**What goes wrong:** Creating `deal-assignees.ts` with FK references to `deals` and `users` but not exporting it from `index.ts` before running `drizzle-kit migrate` causes the migration to fail or be incomplete.
**Why it happens:** `drizzle-kit` discovers schema from `src/db/schema/index.ts`. If the new file isn't re-exported, the table is invisible to the migration tool.
**How to avoid:** Add `export * from "./deal-assignees"` to `index.ts` before running `npx drizzle-kit migrate`. Run migration inside Docker: `echo "883112" | sudo -S docker compose exec app npx drizzle-kit migrate`.
**Warning signs:** Migration runs successfully but `deal_assignees` table doesn't appear in the database.

### Pitfall 6: The "My Deals" Filter With `?assignee=me`
**What goes wrong:** If the filter value `"me"` is passed literally to the query, it won't match any `userId` UUID.
**Why it happens:** It's tempting to use `"me"` as a shorthand in the URL for the current user.
**How to avoid:** Either resolve `"me"` to `session.user.id` in the server component before querying, or use the actual user ID directly in the URL (as the existing `owner` filter does). The `owner` filter already stores the raw user ID — follow the same pattern for `assignee`.
**Warning signs:** "My Deals" filter shows an empty kanban even when deals are assigned to the current user.

---

## Code Examples

### Zod Schema for Assignee IDs in Server Actions
```typescript
// Source: existing action schema pattern (src/app/deals/actions.ts)
const dealSchema = z.object({
  // ...existing fields...
  assigneeIds: z.array(z.string()).optional().default([]),
})
```

### Bulk Replace Assignees in a Server Action
```typescript
// Source: Drizzle docs pattern verified against installed API (drizzle-orm 0.45.1)
import { eq } from "drizzle-orm"
import { dealAssignees } from "@/db/schema"

// Inside updateDeal server action, after updating the deal row:
await db.delete(dealAssignees).where(eq(dealAssignees.dealId, id))
const newAssignees = validated.data.assigneeIds ?? []
if (newAssignees.length > 0) {
  await db.insert(dealAssignees).values(
    newAssignees.map(userId => ({ dealId: id, userId }))
  )
}
```

### Avatar Group on Deal Card
```typescript
// Source: src/components/ui/avatar.tsx — AvatarGroup + AvatarGroupCount are exported
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar"

function getInitials(name: string | null, email: string): string {
  if (name) return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

// In DealCard, after the value line:
{deal.assignees && deal.assignees.length > 0 && (
  <AvatarGroup className="mt-1">
    {deal.assignees.slice(0, 3).map(a => (
      <Avatar key={a.userId} size="sm">
        <AvatarFallback>{getInitials(a.user.name, a.user.email)}</AvatarFallback>
      </Avatar>
    ))}
    {deal.assignees.length > 3 && (
      <AvatarGroupCount>+{deal.assignees.length - 3}</AvatarGroupCount>
    )}
  </AvatarGroup>
)}
```

### Assignee Picker Component (Popover + Command)
```typescript
// Source: src/components/ui/command.tsx (cmdk-backed), existing watch/setValue pattern
// Controlled via react-hook-form watch/setValue — same as stageId/organizationId in deal-dialog.tsx

"use client"
import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface AssigneePickerProps {
  users: { id: string; name: string | null; email: string }[]
  value: string[]  // selected user IDs
  onChange: (ids: string[]) => void
  disabled?: boolean
}

export function AssigneePicker({ users, value, onChange, disabled }: AssigneePickerProps) {
  const [open, setOpen] = useState(false)

  const toggle = (userId: string) => {
    onChange(
      value.includes(userId)
        ? value.filter(id => id !== userId)
        : [...value, userId]
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} className="w-full justify-between">
          {value.length > 0
            ? `${value.length} assignee${value.length > 1 ? 's' : ''} selected`
            : "Select assignees"}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            {users.map(user => (
              <CommandItem key={user.id} onSelect={() => toggle(user.id)}>
                <Check className={cn("mr-2 h-4 w-4", value.includes(user.id) ? "opacity-100" : "opacity-0")} />
                {user.name || user.email}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

### Activity Assignee — Single Select (reuse existing Select pattern)
```typescript
// Source: existing deal-dialog.tsx Select pattern (watch/setValue)
<Select
  value={watch("assigneeId") || "none"}
  onValueChange={(v) => setValue("assigneeId", v === "none" ? "" : v)}
  disabled={isLoading}
>
  <SelectTrigger>
    <SelectValue placeholder="Assign to (optional)" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="none">No assignee</SelectItem>
    {users.map(u => (
      <SelectItem key={u.id} value={u.id}>
        {u.name || u.email}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Assignee Filter in Deals Page
```typescript
// Source: existing filter pattern in src/app/deals/page.tsx
// Add to searchParams type:
// assignee?: string

// Add to filterConditions:
...(params.assignee
  ? [sql`${deals.id} IN (
      SELECT deal_id FROM deal_assignees WHERE user_id = ${params.assignee}
    )`]
  : []),
```

### i18n Keys to Add
```json
// In src/messages/en-US.json, under "deals":
"assignees": "Assignees",
"addAssignee": "Add assignee",
"noAssignees": "No assignees",
"myDeals": "My Deals",

// Under "activities":
"assignee": "Assignee",
"assignedTo": "Assigned to"
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `ownerId` single FK for all ownership | Owner FK + separate join table for assignees | Owner stays as primary responsible party; assignees are additional collaborators |
| Single `Select` for user fields | `Command`+`Popover` multi-select for deals, plain `Select` for activities | Deals get multi-select; activities stay simple single-select |
| No `AvatarGroup` usage in cards | `AvatarGroup` with overlap rings for kanban cards | Visual indication of assignees at a glance |

---

## Open Questions

1. **Can assignees edit deals they're assigned to?**
   - What we know: Current code allows only `ownerId` to mutate deals
   - What's unclear: Phase goal says "collaborate" — does that mean edit rights for assignees?
   - Recommendation: Keep it simple for this phase — only owner + admin can edit/delete. Assignees get visibility (appear in "assigned to me" filter). This avoids complex permission logic and can be expanded later.

2. **Should activities' `ownerId` (creator) be renamed to something clearer now that assignee is added?**
   - What we know: `ownerId` on activities is the creator/responsible user. Adding `assigneeId` adds a second user field.
   - What's unclear: UX labeling — "Owner" vs "Created by" vs "Responsible"
   - Recommendation: Keep `ownerId` as-is for backward compat. Label it "Owner" in the UI (already is). Label new field "Assignee". No DB rename needed.

3. **Should the team view be a separate `/team` route or a filter on the kanban?**
   - What we know: The phase description says "a page or filter showing assigned deals"; existing filter infrastructure supports URL-param-driven filtering with zero new page routing
   - What's unclear: Whether a dedicated page adds UX value
   - Recommendation: Filter on the existing kanban. Add `?assignee=me` and `?assignee={userId}` to both the deals kanban and the activities list. A dedicated route adds no information not available from the filter and requires new i18n, new nav entry, and new layout work.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read — `src/db/schema/deals.ts`, `activities.ts`, `users.ts`, `_relations.ts` — current schema verified
- Codebase direct read — `src/components/ui/avatar.tsx` — `AvatarGroup`, `AvatarGroupCount` confirmed available
- Codebase direct read — `src/components/ui/command.tsx` — `Command`, `CommandInput`, `CommandItem` confirmed available
- Codebase direct read — `src/app/deals/actions.ts`, `deal-dialog.tsx`, `deal-filters.tsx`, `page.tsx` — patterns confirmed
- Codebase direct read — `src/app/activities/actions.ts`, `activity-dialog.tsx` — patterns confirmed
- `package.json` — drizzle-orm 0.45.1, cmdk 1.1.1, radix-ui 1.4.3, react-hook-form 7.71.2, zod 4.3.6 confirmed

### Secondary (MEDIUM confidence)
- Drizzle ORM official docs (https://orm.drizzle.team/docs/relations) — many-to-many join table pattern verified
- Drizzle ORM official docs (https://orm.drizzle.team/docs/insert) — bulk insert `.values([...])` pattern verified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from package.json and codebase reads
- DB schema: HIGH — Drizzle join table pattern verified against official docs and installed version
- Architecture patterns: HIGH — all patterns derived from direct codebase reading, not assumptions
- Authorization concerns: HIGH — verified by reading all mutation actions
- Pitfalls: HIGH — derived from reading actual code that would break

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable stack, no fast-moving dependencies)
