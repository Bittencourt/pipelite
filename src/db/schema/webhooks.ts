import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core"
import { users } from "./users"

export const webhooks = pgTable(
  "webhooks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    url: text("url").notNull(), // HTTPS URL for webhook delivery
    secret: text("secret").notNull(), // HMAC signing secret
    events: text("events").notNull().array(), // e.g., ['deal.updated', 'activity.created']
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("webhooks_user_id_idx").on(table.userId),
  })
)

export type Webhook = typeof webhooks.$inferSelect
export type NewWebhook = typeof webhooks.$inferInsert
