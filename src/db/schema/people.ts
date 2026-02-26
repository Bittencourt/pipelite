import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core"
import { users } from "./users"
import { organizations } from "./organizations"

export const people = pgTable('people', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  notes: text('notes'),
  organizationId: text('organization_id').references(() => organizations.id),
  ownerId: text('owner_id').notNull().references(() => users.id),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
