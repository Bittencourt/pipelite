# Code Style Guide
  2
  3 This document establishes coding conventions and patterns used throughout the Pipelite codebase.
  4
  5
  6
  7 ## Overview
  8
  9 Consistency is enforced through automated tools (ESLint, Prettier) and code review. This guide documents the conventions all contributors should follow.
  10
  11
  12
  13 ## TypeScript
  14
  15 - **Strict mode enabled**: All code must pass TypeScript strict checks
  16    - **Explicit return types**: Always declare return types for functions
  17    - **Avoid `any`**: Use `unknown` when type is uncertain, then narrow with type guards
  18    - **Interfaces for objects**: Prefer `interface` for object shapes that can be extended
  19    - **Types for unions**: Use `type` for unions, primitives, and utility types
  20
  21    Example:
  22    ```typescript
  23    // Good: Interface for extensible objects
  24    interface User {
  25      id: string
  26      name: string
  27      email: string
  28    }
  29    
  30    // Good: Type for unions
  31    type Status = 'pending' | 'approved' | 'rejected'
  32    
  33    // Good: Explicit return type
  34    export async function getUser(id: string): Promise<User | null> {
  35      // Implementation
  36    }
  37    ```
  38
  39
  40
  41 ## Naming Conventions
  42
  43
  44
  45 | Element | Convention | Example |
  46    |--------|------------|---------|
    47    | **Files** | kebab-case | `deal-dialog.tsx`, `user-settings.ts` |
    48    | **Components** | PascalCase | `DealDialog`, `UserSettings` |
    49    | **Functions** | camelCase | `createDeal`, `getUserSettings` |
    50    | **Constants** | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE`, `DEFAULT_PAGE_SIZE` |
    51    | **Database tables** | snake_case (plural) | `users`, `organizations`, `deals` |
  52
  53
  54
  55
  56
  57 ## React Components
  58
  59
  60
  61 ### Server Components vs Client Components
  62
  63
  64
  65 - **Server Components by default**: Use for data fetching and static content
  66    - **Client Components only when needed**: Interactive elements requiring hooks or browser APIs
  67    - **'use client' directive**: Always at the top of client component files
  68    - **One component per file**: Keep components focused and maintainable
  69    - **Export default for pages, named for components**: Follow Next.js conventions
  70
  71
  72    Example:
  73
  74    ```typescript
  75    // Server Component (default)
  76    // src/app/deals/page.tsx
  77    export default async function DealsPage() {
  78      const deals = await getDeals()
  79      return <DealsList deals={deals} />
  80    }
    81    
    82    // Client Component (interactive)
    83    // src/components/deal-dialog.tsx
    84    "use client"
    85    
    86    export function DealDialog({ deal }: { deal?: Deal }) {
  87      const [open, setOpen] = useState(false)
  88      // Component implementation
  89    }
    90    ```
    91
    92
    93
  94
  95 ### Component Patterns
  96
  97
  98
  99 - **Shadcn/ui components**: Use the component library for consistency
   100    - **Composition over inheritance**: Build small, focused components
   101    - **Props interface**: Define clear TypeScript interfaces for component props
   102    - **Conditional rendering**: Use ternary operators or early returns
   103
   104
   105
   106 ## Server Actions
   107
   108
   109
   110 All data mutations use server actions following this pattern:
   111
   112
   113
   114
   115
   116
   117    ```typescript
   118    "use server"
   120    
   121    export async function createEntity(formData: FormData) {
   122      // 1. Validate input
   123      const name = formData.get("name") as string
   124      if (!name?.trim()) {
   125        return { success: false, error: "Name is required" }
   126      }
   127
   128      // 2. Get current user
   129      const user = await getCurrentUser()
   130      if (!user) {
   131        return { success: false, error: "Unauthorized" }
   132      }
   133
   134      // 3. Perform database operation
   135      const [entity] = await db.insert(entities)
   136        .values({ name: name.trim(), ownerId: user.id })
   137        .returning()
   138
   139
   140      // 4. Revalidate cache
   141      revalidatePath("/entities")
   142
   143
   144      // 5. Return success with ID or error
   145      return { success: true, id: entity.id }
   146      // OR
   147      return { success: false, error: "Database error" }
   148    }
   149    ```
   150
   151
   152
   153 **Return object pattern**: Always return `{ success: boolean, error?: string, id?: string }`
   154
   155
   156
   157
   158
   159 ## Imports
   160
   161
   162
   163 Organize imports in this order:
   164
   165
   166
   167
   168
   169
   170
   171    ```typescript
   172    // 1. External dependencies
   173    import { useState, useEffect } from 'react'
   174    import { useRouter } from 'next/navigation'
   175    import { useTranslations } from 'next-intl/server'
   176    
   177    // 2. Internal modules (using path aliases)
   178    import { db } from '@/lib/db'
   179    import { Button } from '@/components/ui/button'
   180    import { getCurrentUser } from '@/lib/auth'
   181    
   182    // 3. Relative imports
   183    import { DealCard } from './deal-card'
   184    import { formatDate } from '../utils/date'
   185    ```
   186
   187
   188
   189 **Path aliases**: Use `@/` prefix for `src/` directory imports
   190
   191
   192
   193
   194
   195 ## Error Handling
   196
   197
   198
   199 - **Result pattern**: Use `{ success, error?, id? }` for action results
   200    - **User-friendly messages**: Provide actionable error messages
   201    - **Throw for unexpected errors**: Only throw for truly exceptional situations
   202    - **Log with context**: Include relevant information in error logs
   203
   204
   205
   206
   207
   208    ```typescript
   209    // Good: Result pattern
   210    export async function updateDeal(formData: FormData) {
   211      try {
   212        const result = await updateDealInDatabase(formData)
   213        if (!result.success) {
   214          return { success: false, error: result.error }
   215        }
   216        return { success: true, id: result.id }
   217      } catch (error) {
   218        console.error('Update deal failed:', error)
   219        return { success: false, error: "Failed to update deal" }
   220      }
   221    }
    222    ```
    223
   224
   225
   226
   227
   228
   229 ## Database Queries
   230
   231
   232
   233 - **Use Drizzle ORM**: Prefer query builder methods over raw SQL
   234    - **Handle nullable results**: Always check for null/undefined
   235    - **Use transactions**: Wrap multi-step operations in transactions
   236    - **Optimize queries**: Use select() to fetch only needed columns
   237
   238
   239
   240
   241
   242
   243
   244    ```typescript
   245    // Good: Using Drizzle ORM with null handling
   246    const deal = await db.query.deals.findFirst({
   247      where: eq(deals.id, id),
   248      with: {
   249        organization: true,
   250        person: true,
   251        stage: true,
   252      },
   253    })
   254
   255    if (!deal) {
   256      return { success: false, error: "Deal not found" }
   257    }
   258
   259        // Use specific columns
   260        const users = await db.select({
   261          id: users.id,
   262          name: users.name,
   263          email: users.email,
   264        })
   265        .from(users)
   266        .where(eq(users.deletedAt, null))
   267    }
    268    ```
    269
   270
   271
   272
   273
   274 ## CSS & Styling
   275
   276
   277
   278 - **Tailwind utility classes**: Use utility classes for styling
   279    - **shadcn/ui components**: Use library components for consistency
   280    - **Avoid custom CSS**: Only create custom styles when absolutely necessary
   281    - **Responsive design**: Mobile-first with `sm`, `md`, `lg`, `xl` breakpoints
   282    - **Dark mode**: Support light and dark themes
   283
   284
   285
   286
   287
   288    ```typescript
   289    // Good: Using Tailwind utilities
   290    <div className="flex items-center gap-4 p-4 rounded-lg hover:bg-gray-100">
   291      <span className="text-sm font-medium">{title}</span>
   292      <Button variant="default">Click me</Button>
   293    </div>
   294    ```
    295
   296
   297
   298
   299 ## Comments
   300
   301
   302
   303 - **Self-documenting code**: Write clear code that doesn't need extensive comments
   304    - **Comment why, not what**: Explain reasoning, not mechanics
   305    - **JSDoc for public APIs**: Document exported functions and interfaces
   306    - **TODO format**: Use `// TODO: description` for future improvements
   307
   308
   309
   310
   311
   312
   313    ```typescript
   314    // Good: Comment explaining why
   315    // Rate limit is fail-open to allow requests when Redis is unavailable
   316    const rateLimited = await checkRateLimit(apiKey)
   317
   318    // Good: JSDoc for public API
   319    /**
   320     * Validates API key and checks rate limits
   321     * @param apiKey - The API key to validate
   322     * @returns User ID if valid, null otherwise
   323     */
   324    export async function validateApiKey(apiKey: string): Promise<string | null> {
   325      // Implementation
   326    }
    327
   328    // Good: TODO for future work
   329    // TODO: Add support for API key rotation
   330    ```
    331
   332
   333
   334
   335
   336 ## ESLint Rules
   337
   338
   339
   340 Key rules enforced by ESLint:
   341
   342
   343
   344 - `@typescript-eslint/no-explicit-any`: Disallow explicit `any` type
   345    - `@typescript-eslint/no-unused-vars`: No unused variables
   346    - `@typescript-eslint/no-floating-promises`: Promises must be handled
   347    - `react-hooks/exhaustive-deps`: All dependencies must be declared
   348    - `@next/next/no-html-link-for-pages`: Use Next.js Link component
   349
   350
   351
   352
   353 **Running linting**:
   354
   355
   356
   357    ```bash
   358    # Check for issues
   359    npm run lint
   360
   361    # Auto-fix issues
   362    npm run lint -- --fix
   363    ```
    364
   365
   366
   367
   368
   369 ## Formatting
   370
   371
   372
   373 - **Prettier configuration**: Code formatting enforced via `.prettierrc`
   374    - **Run format**: `npm run format` (if configured)
   375    - **Format on save**: Recommended in editor settings
   376    - **Consistent style**: Maintains consistent code style across the codebase
   377
   378
   379
   380
   381
   382 ## Best Practices
   383
   384
   385
   386 ### Keep Functions Small
   387
   388
   389
   390 - Single responsibility: Each function does one thing well
   391    - Under 50 lines: Functions longer than 50 lines should be refactored
   392    - Pure functions: Prefer functions without side effects
   393    - Testable: Write functions that are easy to test
   394
   395
   396
   397 ### Use TypeScript Features
   398
   399
   400
   401 - **Enums for constants**: Use TypeScript enums for fixed sets of values
   402    - **Generics**: Use generics for reusable components
   403    - **Type guards**: Use type guards for runtime type checking
   404    - **Utility types**: Create utility types for common patterns
   405
   406
   407
   408
   409
   410
   411
   412
   413
   414
   415 ### Follow Existing Patterns
   416
   417
   418
   419 - **Check similar code**: Look for patterns in the codebase before creating new features
   420    - **Copy with modification**: Use existing patterns as templates
   421    - **Ask questions**: When unsure, ask in issues or PRs
   422    - **Maintain consistency**: Keep patterns consistent across modules
   423
   424
   425
   426
   427
   428 ## Common Anti-Patterns
   429
   430
   431
   432 ❌ **Avoid these patterns**:
   433
   434
   435
   436 - **Prop drilling**: Pass data through context or prop drilling
   437    - **Giant components**: Components over 300 lines
   438    - **Magic numbers**: Use constants for all fixed values
   439    - **Uncaught promises**: Always handle promise rejections
   440    - **Direct DOM manipulation**: Use React state instead
   441    - **Inline styles**: Extract styles to utility classes
   442    - **Mutation in render**: Perform mutations in event handlers, not render functions
   443
   444
   445
   446
   447
   448
   449
   450
   451 ---
   452
   453 *Last updated: 2026-03-04*
   454
   455    See also:
   456    - [Architecture Overview](./architecture.md) - System architecture
   457    - [Testing Guide](./testing.md) - Testing procedures
   458    - [Contributing Guide](./contributing.md) - Contribution workflow
