# Code Style Guide

This document establishes coding conventions and patterns used throughout the Pipelite codebase.

## Overview

Consistency is enforced through automated tools (ESLint, Prettier) and code review. This guide documents the conventions all contributors should follow.

## TypeScript

- **Strict mode enabled**: All code must pass TypeScript strict checks
- **Explicit return types**: Always declare return types for functions
- **Avoid `any`**: Use `unknown` when type is uncertain, then narrow with type guards
- **Interfaces for objects**: Prefer `interface` for object shapes that can be extended
- **Types for unions**: Use `type` for unions, primitives, and utility types

Example:

```typescript
// Good: Interface for extensible objects
interface User {
  id: string
  name: string
  email: string
}

// Good: Type for unions
type Status = 'pending' | 'approved' | 'rejected'

// Good: Explicit return type
export async function getUser(id: string): Promise<User | null> {
  // Implementation
}
```

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| **Files** | kebab-case | `deal-dialog.tsx`, `user-settings.ts` |
| **Components** | PascalCase | `DealDialog`, `UserSettings` |
| **Functions** | camelCase | `createDeal`, `getUserSettings` |
| **Constants** | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE`, `DEFAULT_PAGE_SIZE` |
| **Database tables** | snake_case (plural) | `users`, `organizations`, `deals` |

## React Components

### Server Components vs Client Components

- **Server Components by default**: Use for data fetching and static content
- **Client Components only when needed**: Interactive elements requiring hooks or browser APIs
- **'use client' directive**: Always at the top of client component files
- **One component per file**: Keep components focused and maintainable
- **Export default for pages, named for components**: Follow Next.js conventions

Example:

```typescript
// Server Component (default)
// src/app/deals/page.tsx
export default async function DealsPage() {
  const deals = await getDeals()
  return <DealsList deals={deals} />
}

// Client Component (interactive)
// src/components/deal-dialog.tsx
"use client"

export function DealDialog({ deal }: { deal?: Deal }) {
  const [open, setOpen] = useState(false)
  // Component implementation
}
```

### Component Patterns

- **Shadcn/ui components**: Use the component library for consistency
- **Composition over inheritance**: Build small, focused components
- **Props interface**: Define clear TypeScript interfaces for component props
- **Conditional rendering**: Use ternary operators or early returns

## Server Actions

All data mutations use server actions following this pattern:

```typescript
"use server"

export async function createEntity(formData: FormData) {
  // 1. Validate input
  const name = formData.get("name") as string
  if (!name?.trim()) {
    return { success: false, error: "Name is required" }
  }

  // 2. Get current user
  const user = await getCurrentUser()
  if (!user) {
    return { success: false, error: "Unauthorized" }
  }

  // 3. Perform database operation
  const [entity] = await db.insert(entities)
    .values({ name: name.trim(), ownerId: user.id })
    .returning()

  // 4. Revalidate cache
  revalidatePath("/entities")

  // 5. Return success with ID or error
  return { success: true, id: entity.id }
}
```

**Return object pattern**: Always return `{ success: boolean, error?: string, id?: string }`

## Imports

Organize imports in this order:

```typescript
// 1. External dependencies
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

// 2. Internal modules (using path aliases)
import { db } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { getCurrentUser } from '@/lib/auth'

// 3. Relative imports
import { DealCard } from './deal-card'
import { formatDate } from '../utils/date'
```

**Path aliases**: Use `@/` prefix for `src/` directory imports

## Error Handling

- **Result pattern**: Use `{ success, error?, id? }` for action results
- **User-friendly messages**: Provide actionable error messages
- **Throw for unexpected errors**: Only throw for truly exceptional situations
- **Log with context**: Include relevant information in error logs

```typescript
// Good: Result pattern
export async function updateDeal(formData: FormData) {
  try {
    const result = await updateDealInDatabase(formData)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, id: result.id }
  } catch (error) {
    console.error('Update deal failed:', error)
    return { success: false, error: "Failed to update deal" }
  }
}
```

## Database Queries

- **Use Drizzle ORM**: Prefer query builder methods over raw SQL
- **Handle nullable results**: Always check for null/undefined
- **Use transactions**: Wrap multi-step operations in transactions
- **Optimize queries**: Use select() to fetch only needed columns

```typescript
// Good: Using Drizzle ORM with null handling
const deal = await db.query.deals.findFirst({
  where: eq(deals.id, id),
  with: {
    organization: true,
    person: true,
    stage: true,
  },
})

if (!deal) {
  return { success: false, error: "Deal not found" }
}

// Use specific columns
const userList = await db.select({
  id: users.id,
  name: users.name,
  email: users.email,
})
.from(users)
.where(isNull(users.deletedAt))
```

## CSS & Styling

- **Tailwind utility classes**: Use utility classes for styling
- **shadcn/ui components**: Use library components for consistency
- **Avoid custom CSS**: Only create custom styles when absolutely necessary
- **Responsive design**: Mobile-first with `sm`, `md`, `lg`, `xl` breakpoints
- **Dark mode**: Support light and dark themes

```typescript
// Good: Using Tailwind utilities
<div className="flex items-center gap-4 p-4 rounded-lg hover:bg-gray-100">
  <span className="text-sm font-medium">{title}</span>
  <Button variant="default">Click me</Button>
</div>
```

## Comments

- **Self-documenting code**: Write clear code that doesn't need extensive comments
- **Comment why, not what**: Explain reasoning, not mechanics
- **JSDoc for public APIs**: Document exported functions and interfaces
- **TODO format**: Use `// TODO: description` for future improvements

```typescript
// Good: Comment explaining why
// Rate limit is fail-open to allow requests when Redis is unavailable
const rateLimited = await checkRateLimit(apiKey)

// Good: JSDoc for public API
/**
 * Validates API key and checks rate limits
 * @param apiKey - The API key to validate
 * @returns User ID if valid, null otherwise
 */
export async function validateApiKey(apiKey: string): Promise<string | null> {
  // Implementation
}

// Good: TODO for future work
// TODO: Add support for API key rotation
```

## ESLint Rules

Key rules enforced by ESLint:

- `@typescript-eslint/no-explicit-any`: Disallow explicit `any` type
- `@typescript-eslint/no-unused-vars`: No unused variables
- `@typescript-eslint/no-floating-promises`: Promises must be handled
- `react-hooks/exhaustive-deps`: All dependencies must be declared
- `@next/next/no-html-link-for-pages`: Use Next.js Link component

**Running linting**:

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint -- --fix
```

## Formatting

- **Prettier configuration**: Code formatting enforced via `.prettierrc`
- **Run format**: `npm run format` (if configured)
- **Format on save**: Recommended in editor settings
- **Consistent style**: Maintains consistent code style across the codebase

## Best Practices

### Keep Functions Small

- Single responsibility: Each function does one thing well
- Under 50 lines: Functions longer than 50 lines should be refactored
- Pure functions: Prefer functions without side effects
- Testable: Write functions that are easy to test

### Use TypeScript Features

- **Enums for constants**: Use TypeScript enums for fixed sets of values
- **Generics**: Use generics for reusable components
- **Type guards**: Use type guards for runtime type checking
- **Utility types**: Create utility types for common patterns

### Follow Existing Patterns

- **Check similar code**: Look for patterns in the codebase before creating new features
- **Copy with modification**: Use existing patterns as templates
- **Ask questions**: When unsure, ask in issues or PRs
- **Maintain consistency**: Keep patterns consistent across modules

## Common Anti-Patterns

Avoid these patterns:

- **Prop drilling**: Pass data through context instead
- **Giant components**: Components over 300 lines
- **Magic numbers**: Use constants for all fixed values
- **Uncaught promises**: Always handle promise rejections
- **Direct DOM manipulation**: Use React state instead
- **Inline styles**: Extract styles to utility classes
- **Mutation in render**: Perform mutations in event handlers, not render functions

---

*Last updated: 2026-03-04*

See also:
- [Architecture Overview](./architecture.md) - System architecture
- [Testing Guide](./testing.md) - Testing procedures
- [Contributing Guide](./contributing.md) - Contribution workflow
