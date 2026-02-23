import { relations } from "drizzle-orm"
import { users } from "./users"
import { sessions } from "./sessions"
import { accounts } from "./accounts"
import { apiKeys } from "./api-keys"
import { rejectedSignups } from "./rejected-signups"
import { organizations } from "./organizations"
import { people } from "./people"
import { pipelines } from "./pipelines"
import { stages } from "./pipelines"

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  apiKeys: many(apiKeys),
  rejectedSignups: many(rejectedSignups),
  organizations: many(organizations),
  people: many(people),
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
}))

export const peopleRelations = relations(people, ({ one }) => ({
  organization: one(organizations, {
    fields: [people.organizationId],
    references: [organizations.id],
  }),
  owner: one(users, {
    fields: [people.ownerId],
    references: [users.id],
  }),
}))

export const pipelinesRelations = relations(pipelines, ({ one, many }) => ({
  owner: one(users, {
    fields: [pipelines.ownerId],
    references: [users.id],
  }),
  stages: many(stages),
}))

export const stagesRelations = relations(stages, ({ one }) => ({
  pipeline: one(pipelines, {
    fields: [stages.pipelineId],
    references: [pipelines.id],
  }),
}))
