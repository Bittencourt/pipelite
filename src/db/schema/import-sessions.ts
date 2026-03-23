import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core"
import { users } from "./users"

export type ImportSessionStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error'

export const importSessions = pgTable("import_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id),
  status: text("status").notNull().$type<ImportSessionStatus>().default("idle"),
  progress: jsonb("progress").notNull().default({}),
  cancelled: boolean("cancelled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export type ImportSession = typeof importSessions.$inferSelect
export type NewImportSession = typeof importSessions.$inferInsert
