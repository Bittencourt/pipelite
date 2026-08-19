import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "./users"

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  // The normalized name every duplicate-detection query compares against.
  //
  // `public.dedup_norm_org` is created by migration 0016 and MUST exist before this column
  // can be added — the generated expression is resolved at ALTER TABLE time, not lazily.
  //
  // STORED, which on PostgreSQL is the only kind of generated column there is (there are no
  // VIRTUAL ones, which is why Drizzle's Postgres `generatedAlwaysAs` takes no mode option).
  // The DATABASE maintains this value on every insert and update: NOTHING in the application
  // ever writes `normName`, and Drizzle's inferred insert type excludes it.
  //
  // Why a stored column rather than an expression index on `dedup_norm_org(name)`: measured on
  // this deployment, an expression index re-evaluates the function once per row during the
  // bitmap recheck, costing 207,765 heap blocks on a 500-row self-join against 6,472 for the
  // column — 32x. The column is also the only form that cannot drift: a query that references
  // `norm_name` is referencing the indexed thing by name, whereas a query that spells the
  // expression slightly differently from the index silently gets a sequential scan.
  normName: text('norm_name').generatedAlwaysAs(sql`public.dedup_norm_org(name)`),
  website: text('website'),
  industry: text('industry'),
  notes: text('notes'),
  ownerId: text('owner_id').notNull().references(() => users.id),
  defaultCurrency: text('default_currency').default('USD').notNull(),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  deletedAtIdx: index('organizations_deleted_at_idx').on(table.deletedAt),
  // The fuzzy (`likely`) tier: `norm_name % <normalized probe>` served by a trigram GIN index.
  // Partial on `deleted_at is null` because every scan and every create-time check filters it;
  // the index does NOT enforce the filter, so each read path must still carry the predicate.
  normTrgmIdx: index('org_norm_trgm_idx')
    .using('gin', table.normName.op('gin_trgm_ops'))
    .where(sql`${table.deletedAt} is null`),
  // The exact-match (`certain`) tier and the create-time equality check. A GIN trigram index
  // cannot serve `=`, so the btree is not redundant with the one above.
  normBtreeIdx: index('org_norm_btree_idx')
    .on(table.normName)
    .where(sql`${table.deletedAt} is null`),
}))
