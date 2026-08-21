import { pgTable, text, timestamp, boolean, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core"
import { users } from "./users"
import type { EntityType } from "./custom-fields"

/**
 * A saved view is a NAMED FILTER SET, not record data. Every rule below follows from that
 * one sentence, so it is worth stating plainly before the columns: the rows here resolve to
 * records, they never contain any, and the records they resolve to stay governed by the
 * existing per-record visibility rules no matter who can see the view.
 *
 * ONE TABLE FOR ALL FOUR ENTITY TYPES, discriminated by `entityType` — the same shape
 * `dedup_scans` uses, deliberately copied rather than reinvented. Four tables were the
 * alternative and were rejected in 40-CONTEXT: the four surfaces differ only in which URL
 * params they carry, and that difference is already absorbed by `filters` being JSONB.
 *
 * WHY `filters` IS JSONB AND NOT TYPED COLUMNS: the four surfaces have disjoint param sets
 * (`/organizations` and `/people` carry `search` alone; `/deals` carries `pipeline`, `stage`,
 * `owner`, `assignee`, `dateFrom`, `dateTo`; `/activities` carries `type`, `owner`,
 * `assignee`, `status`, `dateFrom`, `dateTo`, `search`), so typed columns would mean about
 * twelve nullable ones, eleven of them NULL in any given row. Validation lives in the parser
 * module instead, and the READ side is authoritative and non-throwing: a stale `stage` or
 * `owner` id must degrade to the unfiltered list, never 500 (40-CONTEXT, failure posture).
 */
export const savedViews = pgTable("saved_views", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

  // NOT `onDelete: 'cascade'`, and this is a decision rather than an omission. A shared view
  // whose owner has been soft-deleted stays visible and stays functional (V-5) — six users in
  // this deployment are already soft-deleted, and their teammates' saved filter sets must not
  // evaporate. Cascading would also be unreachable in practice, since this app soft-deletes
  // users (`users.deletedAt`) and never issues the DELETE that a cascade would need.
  ownerId: text("owner_id").notNull().references(() => users.id),

  // The discriminator. The union is IMPORTED, never restated (S-8 / Phase 35 D-01: the repo
  // keeps exactly one definition of each union, and a second copy drifts). Renaming a member
  // of `EntityType` is therefore a compile error here, exactly as `dedup_scans` arranges for
  // `MergeableEntityType`.
  entityType: text("entity_type").notNull().$type<EntityType>(),

  name: text("name").notNull(),

  // The URL param map, verbatim. `Record<string, string>` and not a richer type because that
  // is precisely what `searchParams` yields and what the client writer pushes back — every
  // one of the four pages is a server component reading `await searchParams`, so the URL stays
  // the single source of truth and this column is only its persisted form.
  filters: jsonb("filters").notNull().default({}).$type<Record<string, string>>(),

  // A single boolean, not per-user share rows: the requirement is "a teammate sees it", and
  // per-user grants were explicitly deferred (40-CONTEXT, sharing). Private means invisible to
  // EVERYONE else including admins — a departure from the app's `owner || role === "admin"`
  // idiom, taken deliberately, because "private" an admin can read is not private.
  isShared: boolean("is_shared").notNull().default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  // ---------------------------------------------------------------------------------------
  // TWO COLUMNS THAT ARE DELIBERATELY ABSENT. Both are the kind of thing a later reader adds
  // back in good faith, so the reasoning is recorded here rather than in a commit message.
  //
  // NO `deletedAt`. UI-SPEC D-2 and the locked decision: deleting a view removes it for
  // everyone immediately and the records behind it are untouched. A soft-deleted saved view
  // would be a filter set nobody can see and nobody can purge, and `/trash` has four tabs
  // that do not include views. There is nothing to restore and nowhere to restore it from.
  //
  // NO `isDefault`. See the rationale block above `savedViewDefaults` below — this is the one
  // place where this file departs from 40-CONTEXT.md, and it does so to keep a locked
  // UI-SPEC rule that the CONTEXT wording could not express.
  // ---------------------------------------------------------------------------------------
}, (table) => ({
  // S-6's refusal, as a DATABASE invariant rather than an application check.
  //
  // Scoped to (owner, entityType): two users may each own a view called "Mine" for
  // organizations, and one user may not. The save action catches SQLSTATE `23505` and returns
  // `name_taken` — it does NOT pre-check with a SELECT. That is not a style preference:
  // BACKLOG.md already records the Phase 39 dedup scan-guard as a defect precisely because it
  // was a read-then-write guard, which is advisory under concurrency and lets two
  // simultaneous saves both pass their own check. This index cannot be raced.
  ownerTypeNameUniq: uniqueIndex("saved_views_owner_type_name_uniq")
    .on(table.ownerId, table.entityType, table.name),

  // The "my views" half of the picker read: everything I own for THIS entity type.
  ownerIdx: index("saved_views_owner_idx").on(table.entityType, table.ownerId),

  // The "shared with me" half. Not a partial index on `is_shared = true`: the manage dialog
  // toggles sharing both ways (UI-SPEC G-4, a Switch that commits on toggle) and both values
  // are queried — the owner's own list shows private views too. A partial index on one
  // literal would serve one caller and leave the other on a sequential scan.
  sharedIdx: index("saved_views_shared_idx").on(table.entityType, table.isShared),
}))

/**
 * A user's default view for one entity type.
 *
 * ------------------------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE TABLE, AND WHY IT MUST NOT BE "SIMPLIFIED" BACK INTO A BOOLEAN.
 *
 * 40-CONTEXT.md's grounded default says the default view is "a per-user, per-entityType flag
 * on the view row". That same file, and UI-SPEC G-7, also require that **a user may set
 * someone else's shared view as their own default** — G-7 calls that asymmetry "the one thing
 * this row must make legible", and 40-CONTEXT's sharing decision gives the reason ("otherwise
 * sharing has little payoff").
 *
 * A boolean on the view row cannot express both. Setting `isDefault` on a view owned by Ana
 * would make it Ana's default too: one row, one flag, two users with different intentions.
 *
 * So the discriminator decision is honoured exactly as written — ONE views table for all four
 * entity types, not four tables — and the default becomes a two-column primary key in this
 * separate four-column table. That is the smaller departure. The alternative is to silently
 * drop G-7, and G-7 is a locked spec rule.
 *
 * Note also what this table is NOT: it is not a preferences table. `notification_preferences`
 * is keyed by `userId` alone because its rows are one-per-user; a default view is
 * one-per-user-PER-ENTITY-TYPE, which is why the primary key is composite.
 * ------------------------------------------------------------------------------------------
 */
export const savedViewDefaults = pgTable("saved_view_defaults", {
  // Cascades, unlike `savedViews.ownerId`. The asymmetry is the point: a view outlives its
  // owner because other people use it, but nobody else's behaviour depends on MY default.
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Imported, never restated — same rule as `savedViews.entityType` above.
  entityType: text("entity_type").notNull().$type<EntityType>(),

  // Cascades: deleting a view removes every default that pointed at it, leaving no orphan
  // row. 40-CONTEXT: "Deleting a shared view that someone had defaulted to falls back to
  // unfiltered, with no error" — the absence of a row IS that fallback, so the cascade is
  // what implements the requirement rather than merely tidying up after it.
  viewId: text("view_id").notNull().references(() => savedViews.id, { onDelete: "cascade" }),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // One default per user per entity type, as a DB invariant for the same reason the name
  // uniqueness above is one: two concurrent "set as default" writes must not both land.
  pk: primaryKey({ columns: [table.userId, table.entityType] }),

  // `view_id` leads no other index — the composite primary key starts at `user_id`. Both the
  // ON DELETE CASCADE probe and the "is this view somebody's default?" read the manage dialog
  // performs would otherwise scan.
  viewIdx: index("saved_view_defaults_view_idx").on(table.viewId),
}))

export type SavedView = typeof savedViews.$inferSelect
export type NewSavedView = typeof savedViews.$inferInsert
export type SavedViewDefault = typeof savedViewDefaults.$inferSelect
export type NewSavedViewDefault = typeof savedViewDefaults.$inferInsert
