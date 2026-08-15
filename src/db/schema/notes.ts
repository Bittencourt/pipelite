import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import type { InferSelectModel } from "drizzle-orm"
import { users } from "./users"
import type { EntityType } from "./custom-fields"

// A migrated note keeps `source: 'migration'` forever, so migrated rows stay countable
// separately from notes a user actually wrote (D-09).
export type NoteSource = 'user' | 'migration'

export const notes = pgTable('notes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Polymorphic key. The union is imported from ./custom-fields — the repo has exactly
  // one definition of it today and a second would drift (D-01).
  entityType: text('entity_type').notNull().$type<EntityType>(),
  // NO foreign key: entityId points at one of four different tables (deals,
  // organizations, people, activities). The database therefore CANNOT catch a dangling
  // reference. The parent-existence check in src/lib/mutations/notes.ts is the only
  // defence (T-35-04) and is mandatory on every write path.
  entityId: text('entity_id').notNull(),
  content: text('content').notNull(),
  // Nullable: a migrated row on a deployment whose source record has no owner renders
  // as "Unknown" (D-09).
  authorId: text('author_id').references(() => users.id),
  source: text('source').notNull().default('user').$type<NoteSource>(),
  // No `mode` option on any timestamp here: Drizzle's default builder yields `Date`,
  // matching createdAt/updatedAt on every existing CRM table. The keyset cursor compares
  // createdAt values, so a string-vs-Date mismatch would be a real bug.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  // The timeline read. Partial on deleted_at IS NULL because every timeline query filters
  // it, which keeps soft-deleted rows out of the index entirely. The index does NOT
  // enforce the filter — every read path must still carry the predicate (T-35-06).
  liveEntityIdx: index('notes_live_idx')
    .on(table.entityType, table.entityId, table.createdAt.desc())
    .where(sql`${table.deletedAt} is null`),
  // NOTE-03 idempotency guard (D-11). This is a permanent database invariant, not a
  // one-shot script guard: it keeps a re-run of the legacy-notes migration from inserting
  // duplicate rows, forever, on every deployment (T-35-11).
  migrationUniq: uniqueIndex('notes_migration_uniq')
    .on(table.entityType, table.entityId)
    .where(sql`${table.source} = 'migration'`),
  authorIdIdx: index('notes_author_id_idx').on(table.authorId),
}))

export type Note = InferSelectModel<typeof notes>
