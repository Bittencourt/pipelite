import { pgTable, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core"
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
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workflowIdIdx: index("workflow_runs_workflow_id_idx").on(table.workflowId),
    statusIdx: index("workflow_runs_status_idx").on(table.status),
  })
)

export type WorkflowRunStepStatus = "pending" | "running" | "completed" | "failed" | "skipped"

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
