"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { DataTable } from "./data-table"
import { WebhookDialog } from "./webhook-dialog"
import type { WebhookRow } from "./columns"

interface WebhooksClientProps {
  webhooks: WebhookRow[]
  users: { id: string; email: string }[]
}

export function WebhooksClient({ webhooks, users }: WebhooksClientProps) {
  const t = useTranslations("admin.webhooks")
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("createWebhook")}
        </Button>
      </div>

      <DataTable data={webhooks} users={users} />

      <WebhookDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users}
      />
    </div>
  )
}
