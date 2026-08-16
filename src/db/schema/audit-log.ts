import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import type { InferSelectModel } from "drizzle-orm"
import { users } from "./users"
import { workflowRuns } from "./workflows"
import { importSessions } from "./import-sessions"
import type { EntityType } from "./custom-fields"

// AuditEntityType widens EntityType by ONE literal. The four CRM literals are IMPORTED
// from ./custom-fields and widened by union — never restated (D-01 from Phase 35: the repo
// has exactly one definition of EntityType and a second copy would drift).
//
// Why the fifth literal exists: 36-CONTEXT § Post-Research Addendum locks one summary
// audit row per import session, written by the importer (36-12). That row is about a
// session, not about a single CRM record, so forcing it to claim `entity_type = 'deal'`
// with a session id in `entity_id` would be a lie the schema tells about itself.
//
// The timeline never selects it: `assertEntityType` in src/lib/timeline/assemble.ts:33-41
// validates against the four CRM literals BEFORE any fragment is composed, so an
// `import_session` row is unreachable from every record timeline by construction.
export type AuditEntityType = EntityType | "import_session"

export type AuditAction = "created" | "updated" | "deleted"

// Declared here rather than imported from `@/lib/audit/actor-context` (36-01): that module
// does not exist yet — 36-01 and this plan are wave-1 siblings with no dependency edge, so
// an import would not typecheck. There is no schema→lib cycle in principle, so 36-01's
// `src/lib/audit/actor-context.ts` should IMPORT this type rather than redeclare it, and
// remains the single RUNTIME source (runWithActor / getCurrentActor / AuditActor).
export type AuditActorKind = "user" | "workflow_run" | "api_key" | "import" | "system"

// A per-field before/after map. `{}` is legitimate for a create or a delete, where there is
// no field-level diff to record.
export type AuditChanges = Record<string, { from: unknown; to: unknown }>

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Polymorphic key across the four CRM tables plus import sessions.
  entityType: text('entity_type').notNull().$type<AuditEntityType>(),
  // NO foreign key, and — unlike notes.entityId — deliberately NO parent-existence check
  // either. This is the OPPOSITE posture to src/db/schema/notes.ts:16-20, and the
  // difference is the whole point: an audit row for a DELETED record must survive that
  // record. A referential guard here (a real FK, an ON DELETE CASCADE, or a mutation-layer
  // existence check) would erase exactly the evidence the log exists to keep. Do not
  // "fix" this by copying the notes defence over — its absence is the design.
  entityId: text('entity_id').notNull(),
  action: text('action').notNull().$type<AuditAction>(),
  changes: jsonb('changes').$type<AuditChanges>().notNull().default({}),
  actorKind: text('actor_kind').notNull().$type<AuditActorKind>(),
  // All three actor references are nullable and mutually exclusive in practice: a row has
  // at most one of them set, depending on actorKind. Real foreign keys, so a fabricated
  // run or session id cannot be stored (T-36-13).
  actorUserId: text('actor_user_id').references(() => users.id),
  workflowRunId: text('workflow_run_id').references(() => workflowRuns.id),
  importSessionId: text('import_session_id').references(() => importSessions.id),
  // No `mode` option on the timestamp: Drizzle's default builder yields `Date`, matching
  // created-at on every existing CRM table.
  //
  // Deliberate deviation from repo convention: this table has NO updated-at column and NO
  // soft-delete column. Audit rows are immutable append-only facts, so there is no
  // supported path to amend or soft-delete one (T-36-12), and the ONLY permitted deletion
  // is the retention pruner (36-18). Every other CRM table carries both columns, so the
  // absence would otherwise read as an oversight. scripts/audit-log-checks.sql part 2
  // asserts it against information_schema.columns.
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Read pattern 1 — the record timeline branch: every fragment filters
  // (entity_type, entity_id) and orders by created_at descending.
  entityIdx: index('audit_log_entity_idx').on(table.entityType, table.entityId, table.createdAt.desc()),
  // Read pattern 2 — the workflow run detail page's linked-records list (36-09). Partial,
  // because the overwhelming majority of rows have no run id; the form is copied from
  // notes.ts:42-44.
  workflowRunIdx: index('audit_log_workflow_run_idx').on(table.workflowRunId).where(sql`${table.workflowRunId} is not null`),
  // Read pattern 3 — the retention prune scan (36-18). LOAD-BEARING, not defensive:
  // measured on a 1,000,000-row probe, a 5,000-row batch delete is 17.8 ms WITH this index
  // (Bitmap Index Scan → Tid Scan) and 395.7 ms WITHOUT it (Seq Scan, 1,000,000 rows
  // removed by filter) — 22× slower on the biggest table in the schema (T-36-09).
  createdAtIdx: index('audit_log_created_at_idx').on(table.createdAt),
  // Read pattern 4 — the import summary row's lookup key (36-12). Partial for the same
  // reason as the workflow run index.
  importSessionIdx: index('audit_log_import_session_idx').on(table.importSessionId).where(sql`${table.importSessionId} is not null`),
}))

export type AuditLogRow = InferSelectModel<typeof auditLog>
