import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core"
import { users } from "./users"

export const httpTemplates = pgTable("http_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export type HttpTemplateRecord = typeof httpTemplates.$inferSelect
export type NewHttpTemplate = typeof httpTemplates.$inferInsert
