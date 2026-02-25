import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core"

export const activityTypes = pgTable('activity_types', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  icon: text('icon'), // Lucide icon name (e.g., "Phone", "Users", "CheckSquare", "Mail")
  color: text('color'), // Hex color (e.g., "#3B82F6")
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
