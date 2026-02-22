import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const domainWhitelist = pgTable('domain_whitelist', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text('domain').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
