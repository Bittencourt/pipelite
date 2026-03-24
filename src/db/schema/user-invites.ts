import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"

export const userInvites = pgTable('user_invites', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  invitedBy: text('invited_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  acceptedAt: timestamp('accepted_at', { mode: 'date' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
