# Phase 3: People - Research

**Researched:** 2026-02-22
**Domain:** Contact management with organization linking (CRM entity)
**Confidence:** HIGH

## Summary

Phase 3 adds a "people" (contacts) entity to the CRM. This is structurally very similar to Phase 2 (Organizations) but with one key addition: a foreign key relationship linking a person to an organization. The codebase already has all the patterns, libraries, and UI components needed -- no new dependencies are required beyond potentially a Select UI component from shadcn for the organization dropdown.

The people table follows the exact same schema patterns as organizations: text UUIDs, soft delete via `deletedAt`, ownership via `ownerId`, timestamps. The UI follows the same file structure: server actions with Zod validation, a list page with `@tanstack/react-table`, a detail page with server/client component split, and dialog components for create/edit/delete.

**Primary recommendation:** Mirror the organizations implementation exactly (schema, actions, pages, components) and add a Select or simple dropdown for the organization linking. No new libraries needed -- shadcn's Select component uses `radix-ui` which is already installed.

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 | Database ORM and schema definition | Already used for all tables |
| zod | 4.3.6 | Server action input validation | Already used in organizations actions |
| @tanstack/react-table | 8.21.3 | Data table for people list | Already used for organizations and admin/users lists |
| react-hook-form | 7.71.2 | Form state management in dialogs | Already used in organization-dialog.tsx |
| @hookform/resolvers | 5.2.2 | Zod resolver for react-hook-form | Already used in organization-dialog.tsx |
| radix-ui | 1.4.3 | UI primitives (Select, Dialog, etc.) | Already installed, includes Select primitive |
| sonner | 2.0.7 | Toast notifications | Already used for success/error feedback |
| lucide-react | 0.575.0 | Icons | Already used throughout |

### Supporting (may need to add)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn select component | N/A (codegen) | Organization dropdown in person form | `npx shadcn@latest add select` to generate the component file |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn Select | Plain HTML select | Less consistent styling, but zero install; shadcn Select is preferred for UX consistency |
| shadcn Combobox (cmdk) | shadcn Select | Combobox adds search/filter but requires installing `cmdk` package; unnecessary for MVP with modest org counts |

**Installation:**
```bash
# Only new component needed (no npm install required):
npx shadcn@latest add select
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   ├── people.ts              # People table definition
│   ├── _relations.ts          # Updated with people relations
│   └── index.ts               # Updated export
├── app/people/
│   ├── page.tsx               # Server component: list page
│   ├── columns.tsx            # Table column definitions
│   ├── data-table.tsx         # Client: table + dialog state
│   ├── person-dialog.tsx      # Client: create/edit form dialog
│   ├── delete-dialog.tsx      # Client: delete confirmation
│   └── [id]/
│       ├── page.tsx           # Server component: detail page
│       └── person-detail-client.tsx  # Client: action buttons + dialogs
├── components/
│   ├── nav-header.tsx         # Updated: add People nav link
│   └── ui/select.tsx          # New: shadcn Select component
└── app/page.tsx               # Updated: People card becomes link
```

### Pattern 1: Schema with Foreign Key to Organizations
**What:** People table with optional `organizationId` foreign key
**When to use:** Any entity that can be linked to an organization
**Confidence:** HIGH (follows exact pattern from organizations.ownerId -> users.id)
```typescript
// Source: Extrapolated from src/db/schema/organizations.ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"
import { organizations } from "./organizations"

export const people = pgTable('people', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  notes: text('notes'),
  organizationId: text('organization_id').references(() => organizations.id),
  ownerId: text('owner_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
```

### Pattern 2: Relations with Multiple Foreign Keys
**What:** People has relations to both organizations and users
**When to use:** Entity with multiple parent references
**Confidence:** HIGH (follows existing _relations.ts pattern)
```typescript
// Source: Extrapolated from src/db/schema/_relations.ts
export const peopleRelations = relations(people, ({ one }) => ({
  organization: one(organizations, {
    fields: [people.organizationId],
    references: [organizations.id],
  }),
  owner: one(users, {
    fields: [people.ownerId],
    references: [users.id],
  }),
}))

// Update organizationsRelations to include people:
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, {
    fields: [organizations.ownerId],
    references: [users.id],
  }),
  people: many(people),
}))
```

### Pattern 3: Server Action with Return Object Pattern
**What:** All mutations return `{ success: true, id? } | { success: false, error }`
**When to use:** Every server action (create, update, delete)
**Confidence:** HIGH (established in Phase 2, decision [02-01])
```typescript
// Source: src/app/organizations/actions.ts
export async function createPerson(
  data: z.infer<typeof personSchema>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  // auth check, validate, insert, revalidatePath, return
}
```

### Pattern 4: List Page with Left Join for Related Names
**What:** Server component fetches data with joins to show related entity names
**When to use:** List page where you need to display related entity info
**Confidence:** HIGH (exact pattern from organizations page.tsx)
```typescript
// Source: src/app/organizations/page.tsx
const result = await db
  .select({
    id: people.id,
    firstName: people.firstName,
    lastName: people.lastName,
    email: people.email,
    phone: people.phone,
    organizationName: organizations.name,
    ownerName: users.name,
    createdAt: people.createdAt,
  })
  .from(people)
  .leftJoin(organizations, eq(people.organizationId, organizations.id))
  .leftJoin(users, eq(people.ownerId, users.id))
  .where(isNull(people.deletedAt))
  .orderBy(desc(people.createdAt))
```

### Pattern 5: Detail Page with Server + Client Component Split
**What:** Server component fetches data; client component handles dialog state for edit/delete
**When to use:** Detail pages that need both server-side data fetching and client-side interactivity
**Confidence:** HIGH (established pattern in organizations/[id]/, decision [02-03])
```
[id]/page.tsx (server)     -> Fetches person + org data, renders detail card
[id]/person-detail-client.tsx (client) -> Back button, edit/delete buttons, dialog state
```

### Pattern 6: Organization Select in Person Dialog
**What:** Dropdown to select an organization when creating/editing a person
**When to use:** Any form that needs to link to an existing entity
**Confidence:** HIGH (standard pattern, shadcn Select uses radix-ui already in project)

The person dialog needs a list of organizations to populate the select. Two approaches:
1. **Pass organizations as a prop** from the data-table component (which gets them from the server page) - simpler, fewer queries
2. **Fetch organizations inside the dialog** via a server action - more encapsulated

Recommendation: **Pass as prop from page**. The organizations list page already demonstrates fetching data in a server component and passing to client components. The data-table already receives data from the server page component.

### Anti-Patterns to Avoid
- **Circular imports in schema files:** Always define relations in `_relations.ts`, never in the table file itself (decision [01-01])
- **Hard delete instead of soft delete:** Always use `deletedAt` timestamp (decision [02-01])
- **Missing ownership check in update/delete:** Always verify `ownerId === session.user.id` before mutations (pattern from organizations actions)
- **Blocking on non-critical writes:** Keep the fire-and-forget pattern for non-critical operations (decision [01-02])

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation | Manual validation | Zod + react-hook-form + zodResolver | Already used, consistent error handling |
| Data table | Custom table with state | @tanstack/react-table + shadcn Table | Sorting, pagination built-in; already used |
| Select/dropdown | Custom dropdown | shadcn Select (uses radix-ui) | Accessibility, keyboard nav, consistent styling |
| Toast notifications | Custom notification system | sonner | Already configured with Toaster in layout |
| Loading states | Custom spinners | Loader2 from lucide-react | Consistent with existing dialogs |

**Key insight:** Phase 3 requires zero custom solutions. Every pattern is established and every library is installed. This is a pure "follow the blueprint" implementation.

## Common Pitfalls

### Pitfall 1: Nullable vs Optional Organization Link
**What goes wrong:** Making `organizationId` required when it should be optional
**Why it happens:** CRM contacts don't always belong to an organization (freelancers, individual contacts)
**How to avoid:** Make `organizationId` nullable in the schema (no `.notNull()`) and optional in the Zod schema
**Warning signs:** Form requires organization selection before saving; error when clearing organization link

### Pitfall 2: Cascade Delete Considerations
**What goes wrong:** Deleting an organization leaves orphaned `organizationId` references in people
**Why it happens:** Soft delete on organizations doesn't clear the FK in people
**How to avoid:** When displaying a person's organization, always check if the referenced org is deleted (has `deletedAt`). Consider either: (a) showing "(Deleted)" next to the org name, or (b) filtering with `isNull(organizations.deletedAt)` in the join. Option (b) is simpler -- a left join will return null for the org name if the org is deleted, which the UI already handles as "No organization"
**Warning signs:** Person detail page shows organization name for a deleted organization

### Pitfall 3: Name Splitting -- First Name / Last Name vs Single Name
**What goes wrong:** Using a single `name` field like users table, then needing to sort by last name later
**Why it happens:** CRM conventions require first/last name separation for sorting, mail merge, formal addressing
**How to avoid:** Use separate `firstName` and `lastName` fields. Display as combined in the UI. The success criteria says "name, email, and phone" which could mean either approach, but CRM standard practice is split names.
**Warning signs:** Cannot sort by last name; cannot generate "Dear Mr. Smith" style communications

### Pitfall 4: Missing Revalidation of Organization Detail Page
**What goes wrong:** After creating/editing a person linked to an org, the org detail page doesn't reflect the change
**Why it happens:** Only revalidating `/people` path, not `/organizations/[id]`
**How to avoid:** When a person is created/updated/deleted and has an `organizationId`, also call `revalidatePath(\`/organizations/${organizationId}\`)`. This is forward-looking for when the organization detail page shows linked people.
**Warning signs:** Organization detail page shows stale people list (when that feature is added)

### Pitfall 5: Email Uniqueness Trap
**What goes wrong:** Making person email unique at the database level
**Why it happens:** Assuming email should be unique like the users table
**How to avoid:** People (contacts) are NOT users. Multiple contacts can share an email (e.g., info@company.com). Do NOT add a unique constraint on the people email field.
**Warning signs:** Error when adding two contacts with the same email

### Pitfall 6: Next.js 16 params Promise Pattern
**What goes wrong:** Destructuring `params` directly instead of awaiting it
**Why it happens:** Older Next.js patterns used synchronous params
**How to avoid:** Use `const { id } = await params` pattern as in organizations/[id]/page.tsx
**Warning signs:** TypeScript error about params being a Promise

## Code Examples

Verified patterns from the existing codebase:

### Creating the People Schema
```typescript
// Source: Extrapolated from src/db/schema/organizations.ts pattern
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"
import { organizations } from "./organizations"

export const people = pgTable('people', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),        // nullable, NOT unique (contacts can share emails)
  phone: text('phone'),        // nullable
  notes: text('notes'),        // nullable
  organizationId: text('organization_id').references(() => organizations.id), // nullable (optional link)
  ownerId: text('owner_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
```

### Zod Validation Schema for People
```typescript
// Source: Extrapolated from src/app/organizations/actions.ts pattern
const personSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name must be 50 characters or less"),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name must be 50 characters or less"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().max(30, "Phone must be 30 characters or less").optional().or(z.literal("")),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().or(z.literal("")),
  organizationId: z.string().optional().or(z.literal("")),
})
```

### Query with Multiple Left Joins
```typescript
// Source: Extrapolated from src/app/organizations/page.tsx pattern
async function getPeople() {
  const result = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phone: people.phone,
      organizationName: organizations.name,
      ownerName: users.name,
      createdAt: people.createdAt,
    })
    .from(people)
    .leftJoin(organizations, eq(people.organizationId, organizations.id))
    .leftJoin(users, eq(people.ownerId, users.id))
    .where(isNull(people.deletedAt))
    .orderBy(desc(people.createdAt))

  return result
}
```

### Fetching Organizations for Select Dropdown
```typescript
// Source: New, but follows existing query patterns
async function getOrganizationsForSelect() {
  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(isNull(organizations.deletedAt))
    .orderBy(organizations.name)
}
```

### Nav Header Update Pattern
```typescript
// Source: src/components/nav-header.tsx (existing pattern to extend)
<nav className="hidden md:flex items-center gap-4">
  <Link href="/organizations" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
    <Building2 className="h-4 w-4" />
    Organizations
  </Link>
  <Link href="/people" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
    <Users className="h-4 w-4" />
    People
  </Link>
</nav>
```

### shadcn Select Component Install
```bash
# This generates src/components/ui/select.tsx using the radix-ui Select primitive
npx shadcn@latest add select -y
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@radix-ui/react-select` (separate) | `radix-ui` (unified package) | radix-ui v1.0+ | Already using unified package; `npx shadcn add select` will use it |
| Next.js sync params `{ params: { id } }` | Async params `{ params: Promise<{ id }> }` | Next.js 15+ | Must await params; already handled in orgs detail page |
| Zod v3 `.error.errors` | Zod v4 `.error.issues` | Zod v4 | Already using v4 pattern in actions |

**Deprecated/outdated:**
- Nothing relevant -- the project is already on current versions of all dependencies

## Open Questions

1. **First/Last name vs single name field**
   - What we know: Success criteria says "name, email, and phone." Organizations use a single `name` field. The users table also uses a single `name` field.
   - What's unclear: Whether the user wants firstName/lastName split or a single name field
   - Recommendation: Use **firstName + lastName** (CRM standard practice). This enables last-name sorting, formal addressing, and is the standard for contact management. Display as combined "First Last" in the UI. This is the more flexible choice -- combining two fields into one for display is trivial, but splitting one field into two later is lossy.

2. **Organization detail page: should it show linked people?**
   - What we know: Phase 3 adds the people-to-organization FK. The organization detail page already exists.
   - What's unclear: Whether to update the organization detail page to show linked people in this phase or defer
   - Recommendation: **Add a linked people section to the org detail page** as part of this phase. It's low effort (a simple query + list), directly demonstrates the relationship, and validates the FK works. The data is there; showing it is cheap. This also partially addresses success criterion #4 ("view person details including their linked organization") from the reverse perspective.

3. **Select vs Combobox for organization linking**
   - What we know: `radix-ui` Select is available; `cmdk` (used by shadcn Combobox) is NOT installed
   - What's unclear: Whether the organization list will be too long for a simple Select
   - Recommendation: Use **shadcn Select** for now. With a simple dropdown, it works well for up to ~50 organizations. If the user has hundreds of orgs, a Combobox with search can be added in a later enhancement. Avoid over-engineering for MVP.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** - Direct reading of all existing schema files, actions, pages, and components
  - `src/db/schema/organizations.ts` - Schema pattern reference
  - `src/db/schema/_relations.ts` - Relations pattern reference
  - `src/app/organizations/actions.ts` - Server action pattern reference
  - `src/app/organizations/page.tsx` - List page pattern reference
  - `src/app/organizations/[id]/page.tsx` - Detail page pattern reference
  - `src/app/organizations/organization-dialog.tsx` - Dialog pattern reference
  - `src/app/organizations/data-table.tsx` - Data table pattern reference
  - `src/app/organizations/columns.tsx` - Column definition pattern reference
  - `src/components/nav-header.tsx` - Navigation pattern reference
  - `src/app/page.tsx` - Home page dashboard cards reference
  - `package.json` - Current dependency versions
  - `components.json` - shadcn configuration (new-york style, radix-ui)
- **Phase 2 planning documents** - All 3 plan files and 3 summary files reviewed for patterns and decisions

### Secondary (MEDIUM confidence)
- **radix-ui runtime check** - Verified Select and Popover primitives are available in the installed radix-ui v1.4.3 package via Node.js require check
- **CRM domain knowledge** - firstName/lastName split is standard CRM practice (Salesforce, HubSpot, Pipedrive all use split names for contacts)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; all patterns verified from existing code
- Architecture: HIGH - Exact mirror of organizations phase; all patterns read directly from codebase
- Pitfalls: HIGH - Based on direct codebase analysis and CRM domain patterns
- Code examples: HIGH - All extrapolated from verified existing code patterns

**Research date:** 2026-02-22
**Valid until:** Indefinite (this is codebase-specific, not dependent on external library changes)
