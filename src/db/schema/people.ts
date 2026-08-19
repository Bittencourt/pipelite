import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "./users"
import { organizations } from "./organizations"

export const people = pgTable('people', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  // THE THREE NORMALIZED COLUMNS. All three are STORED generated columns maintained by the
  // database; nothing in the application ever writes them, and Drizzle's inferred insert type
  // excludes them.
  //
  // `normEmail` and `normPhone` are generated COLUMNS rather than expression indexes for
  // exactly the same reason `normName` is: an index built on `lower(btrim(email))` is silently
  // ignored by a query that writes `lower(email)` or `btrim(lower(email))`, with no error and
  // no log line — just a sequential scan. A query that references a column by name cannot
  // drift from the index built on that column.
  //
  // `public.dedup_norm_person` is created by migration 0016 and must exist before these
  // columns can be added. It strips NO legal suffix, unlike the organization normalizer:
  // `Sa` is a Brazilian surname and the org suffix list turns `Jose de Sa` into `jose de`.
  normName: text('norm_name').generatedAlwaysAs(
    sql`public.dedup_norm_person(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))`,
  ),
  // The person `certain` tier is exact e-mail, which is why this is normalized at all: the
  // live data carries mixed case and stray whitespace on both sides of the address.
  normEmail: text('norm_email').generatedAlwaysAs(sql`lower(btrim(coalesce(email, '')))`),
  // Digits only. Brazilian phone numbers arrive as `(11) 98765-4321`, `11987654321` and
  // `+55 11 98765 4321` for the same subscriber; only the digit string compares.
  normPhone: text('norm_phone').generatedAlwaysAs(
    sql`regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')`,
  ),
  notes: text('notes'),
  organizationId: text('organization_id').references(() => organizations.id),
  ownerId: text('owner_id').notNull().references(() => users.id),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  organizationIdIdx: index('people_organization_id_idx').on(table.organizationId),
  deletedAtIdx: index('people_deleted_at_idx').on(table.deletedAt),
  // The fuzzy (`likely`) tier. Partial for the same reason as the organization pair above:
  // the index does not enforce `deleted_at is null`, every read path must still carry it.
  normTrgmIdx: index('people_norm_trgm_idx')
    .using('gin', table.normName.op('gin_trgm_ops'))
    .where(sql`${table.deletedAt} is null`),
  // Exact normalized-name equality, which a trigram GIN index cannot serve.
  normBtreeIdx: index('people_norm_btree_idx')
    .on(table.normName)
    .where(sql`${table.deletedAt} is null`),
  // The person `certain` tier: exact normalized e-mail, checked at create time and during the
  // scan. This is the single highest-value lookup in the person path.
  normEmailIdx: index('people_norm_email_idx')
    .on(table.normEmail)
    .where(sql`${table.deletedAt} is null`),
}))
