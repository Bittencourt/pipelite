import { pgTable, text, timestamp, numeric, jsonb, index } from "drizzle-orm/pg-core"
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
  expectedCloseDate: timestamp('expected_close_date'),
  notes: text('notes'),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  stageIdIdx: index('deals_stage_id_idx').on(table.stageId),
  organizationIdIdx: index('deals_organization_id_idx').on(table.organizationId),
  personIdIdx: index('deals_person_id_idx').on(table.personId),
  ownerIdIdx: index('deals_owner_id_idx').on(table.ownerId),
  deletedAtIdx: index('deals_deleted_at_idx').on(table.deletedAt),
}))
