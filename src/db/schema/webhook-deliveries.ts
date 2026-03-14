import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core"

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed'

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    webhookId: text("webhook_id").notNull(),
    status: text("status").notNull().$type<WebhookDeliveryStatus>().default("pending"),
    payload: jsonb("payload").notNull(),
    httpStatus: integer("http_status"),
    responseBody: text("response_body"),
    retryCount: integer("retry_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusNextAttemptIdx: index("webhook_deliveries_status_next_attempt_idx")
      .on(table.status, table.nextAttemptAt),
  })
)

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert
