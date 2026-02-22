# Phase 1: Foundation & Authentication - Research

**Researched:** 2026-02-22
**Domain:** Authentication & Authorization with Next.js App Router
**Confidence:** HIGH

## Summary

This phase implements a complete authentication system with email verification, admin approval workflow, role-based access control, and API key management. The stack centers on Auth.js v5 (formerly NextAuth.js) with the Drizzle adapter for PostgreSQL, Nodemailer for email sending via SMTP, and Redis for session caching.

The key complexity is the custom auth flow: **signup → email verification → admin approval → login**. This requires extending Auth.js's standard models and implementing custom callbacks beyond the typical OAuth flow.

**Primary recommendation:** Use Auth.js v5 with database sessions (not JWT) to support admin approval state, extend the User model with role/approval fields, and implement custom signup routes separate from Auth.js's built-in flows.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-auth | 5.x (beta) | Authentication framework | Official Next.js auth solution, v5 supports App Router natively |
| @auth/drizzle-adapter | 1.x | Auth.js ↔ Drizzle bridge | Official adapter, maintains Auth.js schema expectations |
| drizzle-orm | 1.0+ | Database ORM | TypeScript-native, SQL-like API, zero dependencies |
| drizzle-kit | 0.28+ | Migrations tooling | Generates migrations from schema |
| nodemailer | 6.9+ | Email sending | Self-hosted SMTP support, works with any provider |
| ioredis | 5.x | Redis client | Production-ready, supports clustering |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bcrypt | 5.1+ | Password hashing | Credentials provider - use argon2 for new projects |
| argon2 | 0.41+ | Password hashing | Better than bcrypt, resistant to GPU attacks |
| zod | 3.x | Schema validation | Form validation, API input validation |
| @tanstack/react-table | 8.x | Data tables | Admin panel user list |
| react-hook-form | 7.x | Form handling | Login, signup, settings forms |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Auth.js | Clerk/Lucia/Auth0 | More opinionated, less self-hosted control |
| argon2 | bcrypt | bcrypt is more battle-tested, argon2 is more secure |
| nodemailer | Resend/SendGrid | External dependency vs self-hosted control |

**Installation:**
```bash
# Core auth
npm install next-auth@beta @auth/drizzle-adapter

# Database
npm install drizzle-orm drizzle-kit postgres
npm install ioredis

# Password hashing
npm install argon2

# Email
npm install nodemailer
npm install @types/nodemailer -D

# Validation
npm install zod

# UI components
npx shadcn@latest add button input label card dialog table form
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (auth)/                    # Auth route group
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx
│   │   ├── verify-email/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   └── reset-password/
│   │       └── page.tsx
│   ├── admin/
│   │   ├── users/
│   │   │   └── page.tsx           # Pending approvals
│   │   └── layout.tsx             # Admin-only layout
│   ├── settings/
│   │   └── api-keys/
│   │       └── page.tsx
│   └── api/auth/[...nextauth]/
│       └── route.ts               # Auth.js handler
├── auth.ts                        # Auth.js configuration
├── db/
│   ├── schema/
│   │   ├── users.ts
│   │   ├── sessions.ts
│   │   ├── accounts.ts
│   │   ├── verification-tokens.ts
│   │   ├── api-keys.ts
│   │   ├── domain-whitelist.ts
│   │   └── rejected-signups.ts
│   ├── index.ts                   # Drizzle client
│   └── migrate.ts
├── lib/
│   ├── email/
│   │   ├── client.ts              # Nodemailer transport
│   │   ├── templates/
│   │   │   ├── verify-email.tsx
│   │   │   ├── approved.tsx
│   │   │   └── password-reset.tsx
│   │   └── send.ts
│   ├── password.ts                # Hashing utilities
│   ├── api-keys.ts                # Generation/validation
│   └── redis.ts                   # Redis client
└── components/
    └── ui/                        # shadcn components
```

### Pattern 1: Auth.js v5 Configuration with Custom User Model

**What:** Configure Auth.js with extended user model for admin approval flow
**When to use:** This project's signup → verify → approve → login flow

**Example:**
```typescript
// auth.ts
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import { verifyPassword } from "@/lib/password"
import { users } from "@/db/schema/users"
import { eq } from "drizzle-orm"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { 
    strategy: "database",  // Required for admin approval state checks
    maxAge: 7 * 24 * 60 * 60, // 7 days default
    updateAge: 24 * 60 * 60   // Update session once per day
  },
  providers: [
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
        rememberMe: { type: "checkbox" },
      },
      authorize: async (credentials) => {
        const { email, password, rememberMe } = credentials as {
          email: string
          password: string
          rememberMe?: string
        }
        
        const user = await db.query.users.findFirst({
          where: eq(users.email, email)
        })
        
        if (!user || !user.passwordHash) return null
        
        // Check approval status BEFORE password verification
        if (user.status !== 'approved') {
          throw new Error("Account pending approval")
        }
        
        // Check email verified
        if (!user.emailVerified) {
          throw new Error("Email not verified")
        }
        
        const valid = await verifyPassword(password, user.passwordHash)
        if (!valid) return null
        
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          rememberMe: rememberMe === 'on'
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }
      return token
    },
    async session({ session, user }) {
      session.user.role = user.role
      session.user.id = user.id
      return session
    }
  },
  pages: {
    signIn: '/login',
    error: '/login',
  }
})
```
*Source: https://authjs.dev/getting-started/authentication/credentials*

### Pattern 2: Custom Signup Route (Not Using Auth.js Built-in)

**What:** Handle signup outside Auth.js to support verification → approval flow
**When to use:** Any custom auth flow that doesn't fit OAuth or magic-link patterns

**Example:**
```typescript
// app/api/signup/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { users } from "@/db/schema/users"
import { hashPassword } from "@/lib/password"
import { sendVerificationEmail } from "@/lib/email/send"
import { z } from "zod"

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email, password } = signupSchema.parse(body)
  
  // Check domain whitelist
  const domain = email.split('@')[1]
  const isAllowed = await checkDomainWhitelist(domain)
  if (!isAllowed) {
    return NextResponse.json(
      { error: "Email domain not allowed" },
      { status: 400 }
    )
  }
  
  // Check existing user
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email)
  })
  if (existing) {
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 400 }
    )
  }
  
  // Create pending user
  const hashedPassword = await hashPassword(password)
  const [user] = await db.insert(users).values({
    email,
    passwordHash: hashedPassword,
    status: 'pending_verification',
    role: 'member',
  }).returning()
  
  // Send verification email
  const token = crypto.randomUUID()
  await db.insert(verificationTokens).values({
    identifier: email,
    token: await hashToken(token),
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })
  
  await sendVerificationEmail(email, token)
  
  return NextResponse.json({ 
    message: "Check your email to verify your account" 
  })
}
```

### Pattern 3: Extended Drizzle Schema for Auth.js

**What:** Drizzle schema that supports Auth.js + custom fields
**When to use:** Always - Auth.js requires specific tables

**Example:**
```typescript
// db/schema/users.ts
import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

export const userRoleEnum = pgEnum('user_role', ['admin', 'member'])
export const userStatusEnum = pgEnum('user_status', [
  'pending_verification',
  'pending_approval', 
  'approved',
  'rejected'
])

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  name: text('name'),
  image: text('image'),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').default('member').notNull(),
  status: userStatusEnum('status').default('pending_verification').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'), // Soft delete pattern
})

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  apiKeys: many(apiKeys),
}))

// db/schema/api-keys.ts
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(), // First 8 chars for display
  keyHash: text('key_hash').notNull(),     // SHA-256 hash of full key
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at'),
  deletedAt: timestamp('deleted_at'),
})

// db/schema/domain-whitelist.ts
export const domainWhitelist = pgTable('domain_whitelist', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text('domain').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// db/schema/rejected-signups.ts (audit log)
export const rejectedSignups = pgTable('rejected_signups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  rejectedBy: text('rejected_by').references(() => users.id),
  rejectedAt: timestamp('rejected_at').defaultNow().notNull(),
  reason: text('reason'),
})
```
*Source: https://orm.drizzle.team/docs/sql-schema-declaration*

### Pattern 4: API Key Generation and Validation

**What:** Secure API key generation with one-time display and hash storage
**When to use:** External API access for users

**Example:**
```typescript
// lib/api-keys.ts
import { randomBytes, createHash } from 'crypto'
import { db } from '@/db'
import { apiKeys } from '@/db/schema/api-keys'

const KEY_PREFIX = 'pk_live_' // Identifiable prefix

export async function generateApiKey(userId: string, name: string) {
  // Generate 32 random bytes, base64url encode
  const randomPart = randomBytes(32).toString('base64url')
  const fullKey = `${KEY_PREFIX}${randomPart}`
  
  // Store hash only - never store full key
  const keyHash = createHash('sha256').update(fullKey).digest('hex')
  const keyPrefix = fullKey.slice(0, 12) // pk_live_abc1
  
  await db.insert(apiKeys).values({
    userId,
    name,
    keyPrefix,
    keyHash,
  })
  
  // Return full key ONCE - cannot be retrieved again
  return { fullKey, keyPrefix }
}

export async function validateApiKey(key: string) {
  const keyHash = createHash('sha256').update(key).digest('hex')
  
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, keyHash),
    with: { user: true },
  })
  
  if (!apiKey || apiKey.deletedAt) return null
  
  // Update last used
  await db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
  
  return apiKey.user
}

export function maskKey(key: string): string {
  // pk_live_abc1****xyz9
  return key.slice(0, 12) + '****' + key.slice(-4)
}
```

### Pattern 5: Nodemailer Email Configuration

**What:** Self-hosted email via SMTP with template support
**When to use:** Docker deployments without external email service

**Example:**
```typescript
// lib/email/client.ts
import { createTransport, Transporter } from 'nodemailer'

let transporter: Transporter | null = null

export function getEmailTransporter() {
  if (transporter) return transporter
  
  transporter = createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })
  
  return transporter
}

// lib/email/templates/verify-email.ts
export function getVerifyEmailTemplate(url: string, host: string) {
  return {
    subject: `Verify your email for ${host}`,
    html: `
      <body style="background: #f9f9f9;">
        <table width="100%" style="max-width: 600px; margin: auto;">
          <tr>
            <td align="center" style="padding: 20px;">
              <h2>Verify your email address</h2>
              <p>Click the button below to verify your email and complete your registration.</p>
              <a href="${url}" style="background: #346df1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                Verify Email
              </a>
              <p style="color: #666; font-size: 12px;">
                If you did not request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </body>
    `,
    text: `Verify your email: ${url}`,
  }
}
```
*Source: https://authjs.dev/getting-started/providers/nodemailer*

### Anti-Patterns to Avoid
- **Using JWT sessions with admin approval:** JWT is stateless; can't check approval status on each request without DB lookup. Use database sessions.
- **Storing API keys in plaintext:** Always hash with SHA-256. Only show full key once.
- **Skipping domain whitelist check:** Check whitelist BEFORE sending verification email to avoid leaking that signup exists.
- **Not handling race conditions in signup:** Use database transactions and unique constraints.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom crypto | argon2 | Timing attacks, memory hardness, salt handling |
| Session tokens | Random strings | Auth.js sessionToken | Cryptographically secure, proper length |
| CSRF protection | Custom tokens | Auth.js built-in | Double-submit cookie pattern implemented |
| Email verification tokens | Custom expiry | Auth.js verificationTokens | Handles expiry, cleanup, one-time use |
| API key format | UUID or random | Prefixed + encoded | Identifiable, no ambiguity with other tokens |

**Key insight:** Auth.js handles most auth edge cases. Custom flows should extend, not replace, its patterns.

## Common Pitfalls

### Pitfall 1: Forgetting AUTH_SECRET Environment Variable
**What goes wrong:** Auth.js fails silently or throws cryptic encryption errors
**Why it happens:** AUTH_SECRET is required but not validated at startup
**How to avoid:** Add to .env and validate in startup script
**Warning signs:** "JWE invalid" errors, session not persisting

```bash
# Generate with Auth.js CLI
npx auth secret
# Or manually
openssl rand -base64 32
```

### Pitfall 2: Session Strategy Mismatch
**What goes wrong:** User approved but still can't log in
**Why it happens:** JWT sessions cache user state at login; approval changes DB but not JWT
**How to avoid:** Use database sessions (`strategy: "database"`) when user state can change
**Warning signs:** Users need to clear cookies to see state changes

### Pitfall 3: Missing deleted_at on All Tables
**What goes wrong:** Can't recover accidentally deleted data; foreign key issues
**Why it happens:** Phase 1 sets pattern; later phases copy pattern
**How to avoid:** Add `deletedAt: timestamp('deleted_at')` to EVERY table from the start
**Warning signs:** Hard deletes cascade unexpectedly

### Pitfall 4: API Key in URLs or Logs
**What goes wrong:** Keys leak via server logs, analytics, browser history
**Why it happens:** Developers put keys in query params or log full requests
**How to avoid:** 
- Only accept keys via `Authorization: Bearer` header
- Log `keyPrefix` only, never full key
- Mask in UI: `pk_live_abc1****xyz9`
**Warning signs:** API calls with `?api_key=` in query string

### Pitfall 5: Email Verification After Admin Approval
**What goes wrong:** User gets approved before verifying email, confusion in flow
**Why it happens:** Not checking verification status before showing in admin panel
**How to avoid:** Only show users with `status: 'pending_approval'` in admin panel (not `pending_verification`)
**Warning signs:** Admin sees users who haven't clicked email link yet

## Code Examples

### Protected Route with Role Check
```typescript
// app/admin/layout.tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  
  if (!session) {
    redirect('/login?callbackUrl=/admin')
  }
  
  if (session.user.role !== 'admin') {
    redirect('/?error=unauthorized')
  }
  
  return (
    <div className="flex">
      <AdminSidebar />
      <main>{children}</main>
    </div>
  )
}
```

### Admin Approval Action
```typescript
// app/admin/users/actions.ts
'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { users, rejectedSignups } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { sendApprovalEmail } from '@/lib/email/send'

export async function approveUser(userId: string) {
  const session = await auth()
  if (session?.user?.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  
  await db.update(users)
    .set({ status: 'approved', updatedAt: new Date() })
    .where(eq(users.id, userId))
  
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  })
  
  if (user?.email) {
    await sendApprovalEmail(user.email)
  }
  
  revalidatePath('/admin/users')
}

export async function rejectUser(userId: string, reason?: string) {
  const session = await auth()
  if (session?.user?.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  })
  
  if (user) {
    // Log rejection
    await db.insert(rejectedSignups).values({
      email: user.email,
      rejectedBy: session.user.id,
      reason,
    })
    
    // Soft delete user
    await db.update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, userId))
  }
  
  revalidatePath('/admin/users')
}
```

### shadcn/ui Data Table for Admin Panel
```typescript
// app/admin/users/columns.tsx
'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { approveUser, rejectUser } from './actions'

export type PendingUser = {
  id: string
  email: string
  createdAt: Date
}

export const columns: ColumnDef<PendingUser>[] = [
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'createdAt',
    header: 'Requested',
    cell: ({ row }) => {
      return new Date(row.getValue('createdAt')).toLocaleDateString()
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const user = row.original
      
      return (
        <div className="flex gap-2">
          <form action={() => approveUser(user.id)}>
            <Button size="sm" variant="default">Approve</Button>
          </form>
          <form action={() => rejectUser(user.id)}>
            <Button size="sm" variant="destructive">Reject</Button>
          </form>
        </div>
      )
    },
  },
]
```
*Source: https://ui.shadcn.com/docs/components/data-table*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt for passwords | argon2 | ~2020 | GPU-resistant, memory-hard hashing |
| JWT-only sessions | Database sessions for mutable state | Auth.js v5 | Can revoke/modify sessions |
| NextAuth.js v4 middleware.ts | v5 proxy.ts | Next.js 16 | Renamed to match new proxy pattern |
| Custom API keys | Prefixed keys with hash storage | ~2022 | Identifiable, secure, revocable |

**Deprecated/outdated:**
- **NextAuth.js v4 patterns:** Use Auth.js v5 patterns; `pages/api/auth/[...nextauth]` → `app/api/auth/[...nextauth]/route.ts`
- **Cookie-based sessions for mutable users:** If user state changes (approval, role), database sessions are required

## Open Questions

Things that couldn't be fully resolved:

1. **Redis Session Caching Strategy**
   - What we know: Auth.js database adapter reads session from DB on every request
   - What's unclear: Whether to cache sessions in Redis for performance or rely on DB connection pooling
   - Recommendation: Start with DB-only sessions; add Redis caching only if performance issues arise. Auth.js adapter doesn't natively support Redis, would need custom adapter.

2. **Email Template Styling**
   - What we know: Email clients have limited CSS support
   - What's unclear: Whether to use react-email, mjml, or inline styles
   - Recommendation: Start with inline styles (as shown in patterns); add react-email if templates become complex

## Sources

### Primary (HIGH confidence)
- https://authjs.dev/getting-started/authentication/credentials - Credentials provider setup
- https://authjs.dev/getting-started/adapters/drizzle - Drizzle adapter configuration
- https://authjs.dev/reference/core/adapters - Adapter interface and models
- https://orm.drizzle.team/docs/sql-schema-declaration - Drizzle schema patterns
- https://ui.shadcn.com/docs/components/data-table - TanStack Table with shadcn

### Secondary (MEDIUM confidence)
- https://authjs.dev/getting-started/providers/nodemailer - Nodemailer provider
- https://authjs.dev/concepts/database-models - User/Session/Account models

### Tertiary (LOW confidence)
- None - all core patterns verified with official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are official Auth.js/Drizzle/shadcn recommendations
- Architecture: HIGH - Based on official Auth.js v5 patterns
- Pitfalls: HIGH - Common issues documented in Auth.js community

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days - Auth.js v5 is stable but still in beta)
