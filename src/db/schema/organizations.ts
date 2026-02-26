import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core"
import { users } from "./users"

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  website: text('website'),
  industry: text('industry'),
  notes: text('notes'),
  ownerId: text('owner_id').notNull().references(() => users.id),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
