import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core"
import { users } from "./users"
import { stages } from "./pipelines"
import { organizations } from "./organizations"
import { people } from "./people"

export const deals = pgTable('deals', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  value: numeric('value'), // Nullable for "No Value" deals
  stageId: text('stage_id').notNull().references(() => stages.id),
  organizationId: text('organization_id').references(() => organizations.id),
  personId: text('person_id').references(() => people.id),
  ownerId: text('owner_id').notNull().references(() => users.id),
  position: numeric('position').notNull().default('10000'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
