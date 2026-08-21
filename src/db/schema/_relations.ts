import { relations } from "drizzle-orm"
import { users } from "./users"
import { dealAssignees } from "./deal-assignees"
import { sessions } from "./sessions"
import { accounts } from "./accounts"
import { apiKeys } from "./api-keys"
import { rejectedSignups } from "./rejected-signups"
import { organizations } from "./organizations"
import { people } from "./people"
import { pipelines } from "./pipelines"
import { stages } from "./pipelines"
import { deals } from "./deals"
import { activityTypes } from "./activity-types"
import { activities } from "./activities"
import { customFieldDefinitions } from "./custom-fields"
import { webhooks } from "./webhooks"
import { webhookDeliveries } from "./webhook-deliveries"
import { importSessions } from "./import-sessions"
import { notificationPreferences } from "./notification-preferences"
import { userInvites } from "./user-invites"
import { workflows } from "./workflows"
import { workflowRuns } from "./workflows"
import { workflowRunSteps } from "./workflows"
import { httpTemplates } from "./http-templates"
import { notes } from "./notes"
import { dealStageHistory } from "./deal-stage-history"
import { auditLog } from "./audit-log"
import { savedViews } from "./saved-views"
import { savedViewDefaults } from "./saved-views"

export const usersRelations = relations(users, ({ one, many }) => ({
  notificationPreferences: one(notificationPreferences, {
    fields: [users.id],
    references: [notificationPreferences.userId],
  }),
  sessions: many(sessions),
  accounts: many(accounts),
  apiKeys: many(apiKeys),
  rejectedSignups: many(rejectedSignups),
  organizations: many(organizations),
  people: many(people),
  deals: many(deals),
  activities: many(activities),
  webhooks: many(webhooks),
  dealAssignments: many(dealAssignees),
  assignedActivities: many(activities, { relationName: 'assignedActivities' }),
  importSessions: many(importSessions),
  workflows: many(workflows),
  savedViews: many(savedViews),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}))

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}))

export const rejectedSignupsRelations = relations(rejectedSignups, ({ one }) => ({
  rejectedByUser: one(users, {
    fields: [rejectedSignups.rejectedBy],
    references: [users.id],
  }),
}))

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, {
    fields: [organizations.ownerId],
    references: [users.id],
  }),
  people: many(people),
  deals: many(deals),
}))

export const peopleRelations = relations(people, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [people.organizationId],
    references: [organizations.id],
  }),
  owner: one(users, {
    fields: [people.ownerId],
    references: [users.id],
  }),
  deals: many(deals),
}))

export const pipelinesRelations = relations(pipelines, ({ one, many }) => ({
  owner: one(users, {
    fields: [pipelines.ownerId],
    references: [users.id],
  }),
  stages: many(stages),
}))

export const stagesRelations = relations(stages, ({ one, many }) => ({
  pipeline: one(pipelines, {
    fields: [stages.pipelineId],
    references: [pipelines.id],
  }),
  deals: many(deals),
}))

export const dealsRelations = relations(deals, ({ one, many }) => ({
  stage: one(stages, {
    fields: [deals.stageId],
    references: [stages.id],
  }),
  organization: one(organizations, {
    fields: [deals.organizationId],
    references: [organizations.id],
  }),
  person: one(people, {
    fields: [deals.personId],
    references: [people.id],
  }),
  owner: one(users, {
    fields: [deals.ownerId],
    references: [users.id],
  }),
  activities: many(activities),
  assignees: many(dealAssignees),
}))

export const activityTypesRelations = relations(activityTypes, ({ many }) => ({
  activities: many(activities),
}))

export const activitiesRelations = relations(activities, ({ one }) => ({
  type: one(activityTypes, {
    fields: [activities.typeId],
    references: [activityTypes.id],
  }),
  deal: one(deals, {
    fields: [activities.dealId],
    references: [deals.id],
  }),
  owner: one(users, {
    fields: [activities.ownerId],
    references: [users.id],
  }),
  assignee: one(users, {
    fields: [activities.assigneeId],
    references: [users.id],
    relationName: 'assignedActivities',
  }),
}))

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  user: one(users, {
    fields: [webhooks.userId],
    references: [users.id],
  }),
  deliveries: many(webhookDeliveries),
}))

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  webhook: one(webhooks, {
    fields: [webhookDeliveries.webhookId],
    references: [webhooks.id],
  }),
}))

export const dealAssigneesRelations = relations(dealAssignees, ({ one }) => ({
  deal: one(deals, {
    fields: [dealAssignees.dealId],
    references: [deals.id],
  }),
  user: one(users, {
    fields: [dealAssignees.userId],
    references: [users.id],
  }),
}))

export const importSessionsRelations = relations(importSessions, ({ one }) => ({
  user: one(users, {
    fields: [importSessions.userId],
    references: [users.id],
  }),
}))

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
}))

export const userInvitesRelations = relations(userInvites, ({ one }) => ({
  inviter: one(users, {
    fields: [userInvites.invitedBy],
    references: [users.id],
  }),
}))

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [workflows.createdBy],
    references: [users.id],
  }),
  runs: many(workflowRuns),
}))

export const workflowRunsRelations = relations(workflowRuns, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [workflowRuns.workflowId],
    references: [workflows.id],
  }),
  steps: many(workflowRunSteps),
}))

export const workflowRunStepsRelations = relations(workflowRunSteps, ({ one }) => ({
  run: one(workflowRuns, {
    fields: [workflowRunSteps.runId],
    references: [workflowRuns.id],
  }),
}))

export const httpTemplatesRelations = relations(httpTemplates, ({ one }) => ({
  createdByUser: one(users, {
    fields: [httpTemplates.createdBy],
    references: [users.id],
  }),
}))

// There is deliberately NO `entity` relation here: notes.entityId is polymorphic and
// points at four different tables, so no Drizzle relation is expressible for it. Do not
// attempt one — resolve the parent in the query layer instead.
export const notesRelations = relations(notes, ({ one }) => ({
  author: one(users, {
    fields: [notes.authorId],
    references: [users.id],
  }),
}))

export const dealStageHistoryRelations = relations(dealStageHistory, ({ one }) => ({
  deal: one(deals, {
    fields: [dealStageHistory.dealId],
    references: [deals.id],
  }),
  fromStage: one(stages, {
    fields: [dealStageHistory.fromStageId],
    references: [stages.id],
  }),
  toStage: one(stages, {
    fields: [dealStageHistory.toStageId],
    references: [stages.id],
  }),
  changedByUser: one(users, {
    fields: [dealStageHistory.changedBy],
    references: [users.id],
  }),
}))

// There is deliberately NO `entity` relation here, for the same reason as notes above:
// auditLog.entityId is polymorphic and points at four different tables (five counting
// import_session), so no Drizzle relation is expressible for it. Do not attempt one —
// resolve the parent in the query layer instead.
//
// app_settings gets no relations entry at all: it references nothing and nothing
// references it.
export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actorUser: one(users, {
    fields: [auditLog.actorUserId],
    references: [users.id],
  }),
  workflowRun: one(workflowRuns, {
    fields: [auditLog.workflowRunId],
    references: [workflowRuns.id],
  }),
  importSession: one(importSessions, {
    fields: [auditLog.importSessionId],
    references: [importSessions.id],
  }),
}))

// Registering saved views here is a DELIBERATE choice, not a convention being followed:
// `dedup_scans` and `duplicate_pairs` both reference `users.id` and are absent from this
// file, so a foreign key alone does not earn a relation entry in this repo.
//
// The `owner` relation below is what earns it. V-5's attribution line is
// `user.name || user.email` plus a soft-delete check, rendered once per view in the picker
// and once per row in the manage dialog. Two of the three live users in this deployment
// have `name = NULL` and six more are soft-deleted, so the attribution genuinely needs the
// user row rather than just the id — and without this relation that is one extra query per
// view. `db.query.savedViews.findMany({ with: { owner: true } })` is the read this exists
// for; `src/db/schema/saved-views.test.ts` holds a compile-time proof that it typechecks.
export const savedViewsRelations = relations(savedViews, ({ one, many }) => ({
  owner: one(users, {
    fields: [savedViews.ownerId],
    references: [users.id],
  }),
  // The defaults pointing AT this view, which may belong to users other than the owner —
  // that is the whole reason `saved_view_defaults` is a separate table (UI-SPEC G-7).
  defaults: many(savedViewDefaults),
}))

export const savedViewDefaultsRelations = relations(savedViewDefaults, ({ one }) => ({
  view: one(savedViews, {
    fields: [savedViewDefaults.viewId],
    references: [savedViews.id],
  }),
  user: one(users, {
    fields: [savedViewDefaults.userId],
    references: [users.id],
  }),
}))
