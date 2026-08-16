import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core"
import type { InferSelectModel } from "drizzle-orm"

// NEW TABLE SHAPE for this codebase: no key/value settings table existed before this
// phase. The near-miss is src/db/schema/notification-preferences.ts — typed boolean
// columns keyed by user — which is precisely the shape 36-CONTEXT rejected: it needs a
// migration for every new setting and cannot hold a non-boolean.
//
// 36-CONTEXT scopes this deliberately: Phase 40 (saved views) and Phase 42
// (observability) will both want a shared settings table, which is why it stops being
// speculative here — but this phase introduces the table and EXACTLY ONE key,
// `audit.retention_days`, seeded as data by migration 0014.
//
// Unlike audit_log, this table IS mutable — it is the one place in this phase where an
// updated-at column is the correct choice.
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  // JSONB rather than text so a later setting can hold an object or an array without a
  // migration. `unknown` forces every read path to narrow and validate before use — which
  // is what lets 36-08's readRetentionDays fail closed on a corrupted or tampered row
  // (T-36-44) instead of coercing garbage into a number.
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type AppSettingRow = InferSelectModel<typeof appSettings>
