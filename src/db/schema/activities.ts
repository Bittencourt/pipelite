import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"
import { deals } from "./deals"
import { activityTypes } from "./activity-types"

export const activities = pgTable('activities', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  typeId: text('type_id').notNull().references(() => activityTypes.id),
  dealId: text('deal_id').references(() => deals.id),
  ownerId: text('owner_id').notNull().references(() => users.id),
  dueDate: timestamp('due_date', { mode: 'date' }).notNull(),
  completedAt: timestamp('completed_at', { mode: 'date' }), // null = not done, timestamp = done
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }), // Soft delete
})
