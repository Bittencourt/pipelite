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
