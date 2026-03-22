import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getWebhookWithDeliveries } from "../actions"
import { DeliveryTable } from "./delivery-table"

export default async function WebhookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const t = await getTranslations("admin.webhooks")

  const result = await getWebhookWithDeliveries(id)

  if (!result) {
    redirect("/admin/webhooks")
  }

  const { webhook, allDeliveries, dlqDeliveries, dlqCount } = result

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/webhooks"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToWebhooks")}
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">{t("webhookDetail")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{webhook.url}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t("owner")}</span>
              <p className="font-medium">{webhook.ownerEmail}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("active")}</span>
              <p>
                <Badge
                  variant={webhook.active ? "default" : "secondary"}
                  className={webhook.active ? "bg-green-500" : ""}
                >
                  {webhook.active ? t("statusActive") : t("statusInactive")}
                </Badge>
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("events")}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {webhook.events.map((event) => (
                  <Badge key={event} variant="secondary" className="text-xs">
                    {event}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">{t("createdAt")}</span>
              <p className="font-medium">
                {webhook.createdAt.toLocaleDateString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("deliveryHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">{t("allDeliveries")}</TabsTrigger>
              <TabsTrigger value="dlq">
                {t("deadLetter", { count: dlqCount })}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              <DeliveryTable data={allDeliveries} />
            </TabsContent>
            <TabsContent value="dlq" className="mt-4">
              <DeliveryTable data={dlqDeliveries} showReplay />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
