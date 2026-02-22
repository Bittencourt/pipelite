import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"

export const rejectedSignups = pgTable('rejected_signups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  rejectedBy: text('rejected_by').references(() => users.id),
  rejectedAt: timestamp('rejected_at').defaultNow().notNull(),
  reason: text('reason'),
})
