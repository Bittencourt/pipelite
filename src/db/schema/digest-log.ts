import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core"

export const digestLog = pgTable('digest_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  userCount: integer('user_count').notNull(),
  weekStart: timestamp('week_start', { mode: 'date' }).notNull(),
})
