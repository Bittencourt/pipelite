import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core"
import { users } from "./users"
import { deals } from "./deals"

export const dealAssignees = pgTable(
  'deal_assignees',
  {
    dealId: text('deal_id').notNull().references(() => deals.id),
    userId: text('user_id').notNull().references(() => users.id),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.userId] })]
)
