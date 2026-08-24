/**
 * THE ONE SHARED `TableMeta` DECLARATION (POLISH-01 criterion 2).
 *
 * Read this before adding a table, because it is the only file that describes the contract.
 *
 * WHY THIS FILE EXISTS. `@tanstack/table-core` declares `TableMeta<TData>` as an EMPTY interface
 * (`node_modules/@tanstack/table-core/build/lib/types.d.ts:31`) specifically so that applications
 * can augment it — an empty exported interface in a type-definition file exists for no other
 * reason. Until this file landed, that emptiness meant two things: `table.options.meta?.onEdit` had
 * no property to resolve against (14 `TS2339`s, papered over by 14 standing suppressions), and
 * TypeScript ran no excess-property check against the empty object type, so EVERY `meta:` literal
 * in the app was completely unchecked in both directions. The suppressions were the visible
 * symptom; the unchecked producer was the actual defect.
 *
 * THE AUGMENTATION IS GLOBAL. Every `useReactTable` call site in the app now shares this one
 * declaration, with no import anywhere. That cuts both ways and both ways are wanted: a columns
 * file gets `meta.onEdit` correctly typed as `(row: TData) => void` with no cast, and a data-table
 * passing a key that is not declared here gets `TS2353`. That is the feature — it is what closes
 * the rename-a-callback-in-one-file-and-silently-read-undefined bug class.
 * SO: ADD A MEMBER HERE. DO NOT REACH FOR A CAST AT THE CALL SITE.
 *
 * NO MEMBER MAY BE REQUIRED, AND THIS IS NOT NEGOTIABLE HERE. A single interface shared by every
 * table in the app cannot have required members: `src/app/admin/users/data-table.tsx:41` passes
 * only `meta: { refresh }`, so making `onEdit` required breaks that table with `TS2741` — in a file
 * that a change to this one would never make you open. Per-consumer enforcement is the right place
 * for required members, and it uses this same declaration rather than a competing one:
 *
 *     type OrganizationTableMeta = Required<Pick<TableMeta<Organization>, "onEdit" | "onDelete" | "refresh">>
 *
 * See plan 43-02. `src/types/__tests__/no-standing-suppressions.test.ts` asserts every member below
 * is declared with `?:`, so a well-meant tightening here goes red immediately instead of at a
 * distant call site.
 *
 * WHY `renderActions?` IS HERE. It is for `src/app/trash/trash-table.tsx:355`, which this phase
 * deliberately does not touch. A non-empty interface whose every member is optional is a WEAK TYPE,
 * so an object literal sharing NO member with it is rejected outright — without `renderActions?`,
 * `TrashTableMeta` (`{ renderActions }`) fails with `TS2559: has no properties in common`. With it,
 * Phase 37's trash surface compiles unchanged, cast at `trash-columns.tsx:305` included, which
 * makes `TrashTableMeta` a NARROWING of this shared declaration rather than a competing one.
 *
 * GENERIC, NOT FLAT. `(row: TData) => void` is what makes a `Table<Pipeline>`'s `meta.onEdit`
 * resolve to `(row: Pipeline) => void` automatically. A flat `(row: unknown)` variant would compile
 * and hand every consumer an unusable parameter.
 */
import type { ReactNode } from "react"

import type { RowData } from "@tanstack/react-table"

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends RowData> {
    /** Row edit callback. Read by all five tables' action cells. */
    onEdit?: (row: TData) => void
    /** Row delete callback. Read by all five tables' action cells. */
    onDelete?: (row: TData) => void
    /** Pipelines only — `src/app/admin/pipelines/data-table.tsx:114`. */
    onSetDefault?: (row: TData) => void
    /** Pipelines only. A value, not a callback: passed at :114, never read by the columns file. */
    settingDefaultId?: string | null
    /** Organizations, people and admin/users data-tables. */
    refresh?: () => void
    /** Trash only — `src/app/trash/trash-table.tsx:355`. See the weak-type note above. */
    renderActions?: (row: TData) => ReactNode
  }
}
