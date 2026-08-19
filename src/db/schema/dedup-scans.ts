import { pgTable, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core"
import { users } from "./users"
import type { MergeableEntityType } from "../../lib/dedup/types"

/**
 * A duplicate scan is a background job, not a request. Scanning this deployment's 46,054
 * organizations cannot finish inside an HTTP request, so the scan writes its progress here and
 * the client polls it — the same shape `import_sessions` already uses, deliberately copied
 * rather than reinvented (`src/db/schema/import-sessions.ts` is the 1:1 analog, and
 * `src/lib/import/pipedrive-import-state.ts` is the CRUD layer to mirror).
 */
export type DedupScanStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error'

export const dedupScans = pgTable("dedup_scans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id),
  // The one column `import_sessions` has no equivalent of. A scan covers exactly one entity
  // type (39-CONTEXT: "scan scope is a whole entity type, one type at a time"), which is also
  // what makes the running-scan guard per-type rather than global: `createImportState` refuses
  // when ANY session is running, and copying that verbatim would let an organization scan block
  // a person scan for no reason.
  //
  // The union is IMPORTED, never restated (S-8). `MergeableEntityType` is itself
  // `Extract<EntityType, ...>`, so removing or renaming a member of `EntityType` is a compile
  // error here rather than a silent divergence.
  entityType: text("entity_type").notNull().$type<MergeableEntityType>(),
  status: text("status").notNull().$type<DedupScanStatus>().default("idle"),
  progress: jsonb("progress").notNull().default({}),
  cancelled: boolean("cancelled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // What the per-entity-type running-scan guard queries: "is there already a scan of THIS type
  // that is running?". Not partial — `status` is compared to several values across the job's
  // lifetime (the boot reaper looks for stale `running` rows too), and a partial index on one
  // literal would serve only one of those callers.
  activeIdx: index("dedup_scans_active_idx").on(table.entityType, table.status),
}))

export type DedupScan = typeof dedupScans.$inferSelect
export type NewDedupScan = typeof dedupScans.$inferInsert
