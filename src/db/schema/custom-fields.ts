import { pgTable, text, timestamp, numeric, jsonb, boolean } from "drizzle-orm/pg-core"
import type { InferSelectModel } from "drizzle-orm"

// Field types enum (as TypeScript type, not DB enum for flexibility)
export type FieldType = 
  | 'text' | 'number' | 'date' | 'boolean' 
  | 'single_select' | 'multi_select' 
  | 'file' | 'url' 
  | 'lookup' | 'formula'

// Type-specific config types
export type SelectConfig = { options: string[] }
export type LookupConfig = { targetEntity: 'organization' | 'person' | 'deal' | 'activity' }
export type FormulaConfig = { expression: string; resultType?: 'text' | 'number' | 'date' | 'boolean' }
export type FileConfig = { maxFiles?: number; maxSize?: number }

export type FieldConfig = SelectConfig | LookupConfig | FormulaConfig | FileConfig | null

export type EntityType = 'organization' | 'person' | 'deal' | 'activity'

export const customFieldDefinitions = pgTable('custom_field_definitions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityType: text('entity_type').notNull().$type<EntityType>(),
  name: text('name').notNull(),
  type: text('type').notNull().$type<FieldType>(),
  config: jsonb('config').$type<FieldConfig>(),
  required: boolean('required').notNull().default(false),
  position: numeric('position', { precision: 20, scale: 10 }).notNull().default('10000'),
  showInList: boolean('show_in_list').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})

export type CustomFieldDefinition = InferSelectModel<typeof customFieldDefinitions>
