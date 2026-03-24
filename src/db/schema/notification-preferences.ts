import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"

export const notificationPreferences = pgTable('notification_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  emailDealAssigned: boolean('email_deal_assigned').default(true).notNull(),
  emailActivityReminder: boolean('email_activity_reminder').default(true).notNull(),
  emailWeeklyDigest: boolean('email_weekly_digest').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
