import { pgTable, text, timestamp, boolean, jsonb, index, integer } from "drizzle-orm/pg-core"
import { users } from "./users"

export const workflows = pgTable(
  "workflows",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    triggers: jsonb("triggers").$type<Record<string, unknown>[]>().notNull().default([]),
    nodes: jsonb("nodes").$type<Record<string, unknown>[]>().notNull().default([]),
    active: boolean("active").notNull().default(false),
    nextRunAt: timestamp("next_run_at"),
    webhookSecret: text("webhook_secret"),
    // WFOPS-03 throttle. NULL means "never alerted", which plan 41-08's guarded UPDATE
    // reads as claimable. Shape copied from activities.reminderSentAt; its writer is NOT
    // copied — that one is a read-then-write race. No index: only ever read by primary key.
    failureAlertSentAt: timestamp("failure_alert_sent_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    activeIdx: index("workflows_active_idx").on(table.active),
    createdByIdx: index("workflows_created_by_idx").on(table.createdBy),
  })
)

export type WorkflowStatus = "pending" | "running" | "completed" | "failed" | "waiting"

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id),
    status: text("status").notNull().$type<WorkflowStatus>().default("pending"),
    triggerData: jsonb("trigger_data").$type<Record<string, unknown>>(),
    error: text("error"),
    depth: integer("depth").notNull().default(0),
    context: jsonb("context").$type<Record<string, unknown>>().default({}),
    currentNodeId: text("current_node_id"),
    // WFOPS-02. NOT NULL with DEFAULT false is load-bearing, not stylistic: a nullable
    // column makes eq(dryRun, false) evaluate to NULL for every pre-existing run row, so
    // the runs list would render "No runs yet" for every workflow in the database.
    dryRun: boolean("dry_run").notNull().default(false),
    // Diagnostic provenance for a replay. Deliberately NO .references(): runs are prunable
    // (see src/lib/audit/prune.ts and src/lib/trash/prune.ts), and an FK would either block
    // pruning the origin run or cascade-delete the replay with it.
    replayedFromRunId: text("replayed_from_run_id"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workflowIdIdx: index("workflow_runs_workflow_id_idx").on(table.workflowId),
    statusIdx: index("workflow_runs_status_idx").on(table.status),
  })
)

export type WorkflowRunStepStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "waiting"

export const workflowRunSteps = pgTable(
  "workflow_run_steps",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull().$type<WorkflowRunStepStatus>().default("pending"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    resumeAt: timestamp("resume_at"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    runIdIdx: index("workflow_run_steps_run_id_idx").on(table.runId),
    runNodeIdx: index("workflow_run_steps_run_node_idx").on(table.runId, table.nodeId),
  })
)

export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    trigger: jsonb("trigger").$type<Record<string, unknown>>().notNull(),
    nodes: jsonb("nodes").$type<Record<string, unknown>[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
)

export type Workflow = typeof workflows.$inferSelect
export type NewWorkflow = typeof workflows.$inferInsert
export type WorkflowRun = typeof workflowRuns.$inferSelect
export type WorkflowRunStep = typeof workflowRunSteps.$inferSelect
export type WorkflowTemplate = typeof workflowTemplates.$inferSelect
