import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core"
import type { InferSelectModel } from "drizzle-orm"
import { users } from "./users"
import { deals } from "./deals"
import { stages } from "./pipelines"

// Deal-specific by design (resolving 35-CONTEXT.md's discretion item). A generic table
// would either become Phase 36's audit log — explicitly out of scope here — or a
// half-generic shape Phase 36 must migrate anyway. Pluggability lives in the timeline
// assembler's source interface, not in the table shape. The payoff is real foreign keys,
// which the polymorphic `notes` table cannot have.
export const dealStageHistory = pgTable('deal_stage_history', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  dealId: text('deal_id').notNull().references(() => deals.id),
  fromStageId: text('from_stage_id').references(() => stages.id),
  toStageId: text('to_stage_id').notNull().references(() => stages.id),
  changedBy: text('changed_by').references(() => users.id),
  // Deliberate deviation from repo convention: this table has no updated-at and no
  // soft-delete column. History rows are immutable append-only facts. Every other CRM
  // table carries both, so the absence would otherwise read as an oversight.
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  dealIdx: index('deal_stage_history_deal_idx').on(table.dealId, table.createdAt.desc()),
}))

export type DealStageHistoryRow = InferSelectModel<typeof dealStageHistory>
