import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getTableConfig } from "drizzle-orm/pg-core"
import { createTableRelationsHelpers } from "drizzle-orm"
import { savedViews, savedViewDefaults, type SavedView, type SavedViewDefault } from "./saved-views"
import * as schema from "./index"
import { savedViewsRelations, savedViewDefaultsRelations, usersRelations } from "./_relations"
import { users } from "./users"
import type { EntityType } from "./custom-fields"

/**
 * The storage contract for saved views, asserted against the PARSED Drizzle table
 * definitions rather than against the text of `saved-views.ts`.
 *
 * That distinction is the whole point of this file. Phase 39 was bitten five separate
 * times by assertions written as raw-token greps: the comment explaining a rule tripped
 * the grep gate that enforced the rule, and deleting the comment "fixed" it — which is
 * the wrong fix, passing for the wrong reason. `getTableConfig` gives the real column,
 * index, foreign-key and primary-key structure, so an assertion here can only be
 * satisfied by changing the schema, never by editing prose.
 */

// ---------------------------------------------------------------------------------------
// Type-level contracts. These are checked by `tsc`, not by vitest, and they are the
// reason `saved-views.ts` may not restate the entity-type union: mutual assignability
// below holds only if the column's type IS `EntityType`, so renaming a member of that
// union is a compile error in this file.
// ---------------------------------------------------------------------------------------
const _entityTypeWidensToEntityType: EntityType = "organization" as SavedView["entityType"]
const _entityTypeNarrowsFromEntityType: SavedView["entityType"] = "organization" as EntityType
const _defaultsEntityTypeIsEntityType: EntityType = "deal" as SavedViewDefault["entityType"]
const _filtersIsAStringMap: Record<string, string> = {} as SavedView["filters"]

/**
 * The owner-attribution read, expressed once so `tsc` proves it is expressible.
 *
 * V-5 renders "shared by X" as `user.name || user.email`, and BOTH halves of that are
 * load-bearing against this deployment's real user table: two of the three live users
 * have `name = NULL`, and six more users are soft-deleted (`users.deletedAt`). Without
 * the `owner` relation this is a second query per view; with it, the whole attribution
 * is one `findMany`. Never called — its value is that it must typecheck.
 */
async function _ownerAttributionTypechecks() {
  const { db } = await import("../index")
  const rows = await db.query.savedViews.findMany({ with: { owner: true } })
  return rows.map((row) => ({
    id: row.id,
    // `name` may be NULL; `email` is notNull, so this never yields undefined for a
    // live owner. `owner` itself is non-null (ownerId is notNull with an FK), but the
    // soft-delete check is what decides whether the name is shown at all.
    attribution: row.owner.name ?? row.owner.email,
    ownerIsSoftDeleted: row.owner.deletedAt !== null,
  }))
}

type ColumnFacts = { type: string; notNull: boolean; hasDefault: boolean; primary: boolean }

function columnFacts(table: Parameters<typeof getTableConfig>[0]): Record<string, ColumnFacts> {
  const out: Record<string, ColumnFacts> = {}
  for (const column of getTableConfig(table).columns) {
    out[column.name] = {
      type: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      primary: column.primary,
    }
  }
  return out
}

function indexFacts(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).indexes.map((idx) => ({
    name: idx.config.name,
    unique: idx.config.unique === true,
    columns: idx.config.columns.map((c) => (c as { name: string }).name),
  }))
}

function foreignKeyFacts(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).foreignKeys.map((fk) => {
    const ref = fk.reference()
    return {
      columns: ref.columns.map((c) => c.name),
      foreignTable: getTableConfig(ref.foreignTable).name,
      foreignColumns: ref.foreignColumns.map((c) => c.name),
      // Drizzle normalises an unspecified action to the literal it emits in SQL.
      onDelete: fk.onDelete ?? "no action",
    }
  })
}

describe("savedViews table", () => {
  it("is one table for all four entity types, discriminated by entity_type", () => {
    expect(getTableConfig(savedViews).name).toBe("saved_views")
    expect(columnFacts(savedViews)["entity_type"]).toEqual({
      type: "text",
      notNull: true,
      hasDefault: false,
      primary: false,
    })
  })

  it("has exactly the eight columns the phase needs, and no others", () => {
    // An EXACT column set, so this fails if a column is added as well as if one is
    // removed. That is what makes the two negative rules below structural.
    expect(columnFacts(savedViews)).toEqual({
      id: { type: "text", notNull: true, hasDefault: true, primary: true },
      owner_id: { type: "text", notNull: true, hasDefault: false, primary: false },
      entity_type: { type: "text", notNull: true, hasDefault: false, primary: false },
      name: { type: "text", notNull: true, hasDefault: false, primary: false },
      filters: { type: "jsonb", notNull: true, hasDefault: true, primary: false },
      is_shared: { type: "boolean", notNull: true, hasDefault: true, primary: false },
      created_at: { type: "timestamp", notNull: true, hasDefault: true, primary: false },
      updated_at: { type: "timestamp", notNull: true, hasDefault: true, primary: false },
    })
  })

  it("carries NO is_default column, because a per-user default cannot live on the view row", () => {
    // UI-SPEC G-7: a user may set someone ELSE'S shared view as their own default. A
    // boolean here would make it the owner's default too. See saved_view_defaults.
    expect(Object.keys(columnFacts(savedViews))).not.toContain("is_default")
  })

  it("carries NO deleted_at column, because deleting a view removes it for everyone", () => {
    // UI-SPEC D-2. A soft-deleted view is a filter set nobody can see and nobody can
    // purge, and /trash has four tabs that do not include views.
    expect(Object.keys(columnFacts(savedViews))).not.toContain("deleted_at")
  })

  it("declares name uniqueness per (owner, entityType) as a database invariant", () => {
    const unique = indexFacts(savedViews).filter((i) => i.unique)
    expect(unique).toEqual([
      {
        name: "saved_views_owner_type_name_uniq",
        unique: true,
        // Scoped to the owner: two users may each have a view called "Mine" for the
        // same entity type; one user may not.
        columns: ["owner_id", "entity_type", "name"],
      },
    ])
  })

  it("indexes both halves of the picker read", () => {
    const plain = indexFacts(savedViews).filter((i) => !i.unique)
    expect(plain).toEqual([
      { name: "saved_views_owner_idx", unique: false, columns: ["entity_type", "owner_id"] },
      { name: "saved_views_shared_idx", unique: false, columns: ["entity_type", "is_shared"] },
    ])
  })

  it("does NOT cascade on owner deletion, so a soft-deleted owner's shared view survives", () => {
    // V-5: a shared view owned by a soft-deleted user stays visible and stays
    // functional. It is a filter set, not a record.
    expect(foreignKeyFacts(savedViews)).toEqual([
      {
        columns: ["owner_id"],
        foreignTable: "users",
        foreignColumns: ["id"],
        onDelete: "no action",
      },
    ])
  })

  it("keys on a single id column, not a composite", () => {
    expect(getTableConfig(savedViews).primaryKeys).toEqual([])
  })
})

describe("savedViewDefaults table", () => {
  it("is a four-column table keyed by (userId, entityType)", () => {
    expect(getTableConfig(savedViewDefaults).name).toBe("saved_view_defaults")
    expect(columnFacts(savedViewDefaults)).toEqual({
      user_id: { type: "text", notNull: true, hasDefault: false, primary: false },
      entity_type: { type: "text", notNull: true, hasDefault: false, primary: false },
      view_id: { type: "text", notNull: true, hasDefault: false, primary: false },
      updated_at: { type: "timestamp", notNull: true, hasDefault: true, primary: false },
    })
  })

  it("enforces one default per user per entity type with a composite primary key", () => {
    const pks = getTableConfig(savedViewDefaults).primaryKeys
    expect(pks).toHaveLength(1)
    expect(pks[0].columns.map((c) => c.name)).toEqual(["user_id", "entity_type"])
  })

  it("cascades from both the user and the view, so no orphan default can survive", () => {
    const fks = foreignKeyFacts(savedViewDefaults)
    // Order-independent: the substantive rule is that BOTH cascade.
    expect(fks).toHaveLength(2)
    expect(fks).toEqual(
      expect.arrayContaining([
        {
          columns: ["user_id"],
          foreignTable: "users",
          foreignColumns: ["id"],
          onDelete: "cascade",
        },
        {
          columns: ["view_id"],
          foreignTable: "saved_views",
          foreignColumns: ["id"],
          onDelete: "cascade",
        },
      ]),
    )
  })

  it("indexes view_id, so the cascade and the is-this-somebody's-default read are covered", () => {
    expect(indexFacts(savedViewDefaults)).toEqual([
      { name: "saved_view_defaults_view_idx", unique: false, columns: ["view_id"] },
    ])
  })
})

describe("schema registration", () => {
  it("re-exports both tables from the schema barrel", () => {
    // `drizzle.config.ts` points at this barrel, so a table missing from it is a table
    // missing from every generated migration.
    expect(schema.savedViews).toBe(savedViews)
    expect(schema.savedViewDefaults).toBe(savedViewDefaults)
  })

  it("keeps ./_relations as the barrel's last export", () => {
    const barrel = readFileSync(join(__dirname, "index.ts"), "utf8")
    const lastExport = barrel
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("export"))
      .at(-1)
    expect(lastExport).toBe('export * from "./_relations"')
  })

  it("relates a view to its owner and to the defaults pointing at it", () => {
    const config = (
      savedViewsRelations as unknown as { config: (h: unknown) => Record<string, { referencedTableName: string }> }
    ).config(createTableRelationsHelpers(savedViews))
    expect(Object.keys(config).sort()).toEqual(["defaults", "owner"])
    expect(config.owner.referencedTableName).toBe("users")
    expect(config.defaults.referencedTableName).toBe("saved_view_defaults")
  })

  it("relates a default to its view and its user", () => {
    const config = (
      savedViewDefaultsRelations as unknown as { config: (h: unknown) => Record<string, { referencedTableName: string }> }
    ).config(createTableRelationsHelpers(savedViewDefaults))
    expect(Object.keys(config).sort()).toEqual(["user", "view"])
    expect(config.view.referencedTableName).toBe("saved_views")
    expect(config.user.referencedTableName).toBe("users")
  })

  it("adds savedViews to usersRelations", () => {
    const config = (
      usersRelations as unknown as { config: (h: unknown) => Record<string, { referencedTableName: string }> }
    ).config(createTableRelationsHelpers(users))
    expect(config.savedViews?.referencedTableName).toBe("saved_views")
  })
})

// Keep the type-level contracts referenced so lint cannot report them unused; their
// value is entirely in `tsc`, and deleting them would silently drop those guarantees.
describe("type-level contracts are present", () => {
  it("holds the entity-type, filters and attribution contracts", () => {
    expect(_entityTypeWidensToEntityType).toBe("organization")
    expect(_entityTypeNarrowsFromEntityType).toBe("organization")
    expect(_defaultsEntityTypeIsEntityType).toBe("deal")
    expect(_filtersIsAStringMap).toEqual({})
    expect(typeof _ownerAttributionTypechecks).toBe("function")
  })
})
