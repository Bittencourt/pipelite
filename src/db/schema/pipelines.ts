import { pgTable, text, timestamp, integer, pgEnum, unique, primaryKey } from "drizzle-orm/pg-core"
import { users } from "./users"

export const stageTypeEnum = pgEnum('stage_type', ['open', 'won', 'lost'])

export const pipelines = pgTable('pipelines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  isDefault: integer('is_default').default(0),
  ownerId: text('owner_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export const stages = pgTable('stages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pipelineId: text('pipeline_id').notNull().references(() => pipelines.id),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').notNull().default('blue'),
  type: stageTypeEnum('type').default('open').notNull(),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  pipelineNameUnique: unique('pipeline_name_unique').on(table.pipelineId, table.name),
}))

export const pipelineVisibility = pgTable('pipeline_visibility', {
  pipelineId: text('pipeline_id').notNull().references(() => pipelines.id),
  userId: text('user_id').notNull().references(() => users.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.pipelineId, table.userId] }),
}))
