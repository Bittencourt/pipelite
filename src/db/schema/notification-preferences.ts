import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"

export const notificationPreferences = pgTable('notification_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  emailDealAssigned: boolean('email_deal_assigned').default(true).notNull(),
  emailActivityReminder: boolean('email_activity_reminder').default(true).notNull(),
  emailWeeklyDigest: boolean('email_weekly_digest').default(true).notNull(),
  // WFOPS-03. Opt-OUT like its three siblings: an absent-or-false default would silently
  // disable failure alerting for every user who has never opened the settings page.
  emailWorkflowFailed: boolean('email_workflow_failed').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
