import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core"

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
  deletedAt: timestamp('deleted_at'),
})
