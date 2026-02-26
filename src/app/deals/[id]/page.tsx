import { auth } from "@/auth"
import { db } from "@/db"
import { deals, stages, pipelines, organizations, people, users, customFieldDefinitions } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, DollarSign, Building2, Users, Calendar, FileText, Pencil } from "lucide-react"
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section"
import type { CustomFieldDefinition } from "@/db/schema"

interface PageProps {
  params: Promise<{ id: string }>
}

async function getDeal(id: string) {
  const result = await db
    .select({
      id: deals.id,
      title: deals.title,
      value: deals.value,
      notes: deals.notes,
      expectedCloseDate: deals.expectedCloseDate,
      customFields: deals.customFields,
      createdAt: deals.createdAt,
      stageId: deals.stageId,
      stageName: stages.name,
      stageColor: stages.color,
      pipelineId: pipelines.id,
      pipelineName: pipelines.name,
      organizationId: deals.organizationId,
      organizationName: organizations.name,
      personId: deals.personId,
      personFirstName: people.firstName,
      personLastName: people.lastName,
      ownerName: users.name,
    })
    .from(deals)
    .innerJoin(stages, eq(deals.stageId, stages.id))
    .innerJoin(pipelines, eq(stages.pipelineId, pipelines.id))
    .leftJoin(organizations, and(eq(deals.organizationId, organizations.id), isNull(organizations.deletedAt)))
    .leftJoin(people, and(eq(deals.personId, people.id), isNull(people.deletedAt)))
    .leftJoin(users, eq(deals.ownerId, users.id))
    .where(and(eq(deals.id, id), isNull(deals.deletedAt)))
    .limit(1)

  if (result.length === 0) {
    return null
  }

  return {
    ...result[0],
    organizationName: result[0].organizationName || null,
    personFirstName: result[0].personFirstName || null,
    personLastName: result[0].personLastName || null,
    ownerName: result[0].ownerName || null,
  }
}

async function getCustomFieldDefinitions() {
  return db.select()
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.entityType, 'deal'),
      isNull(customFieldDefinitions.deletedAt)
    ))
    .orderBy(customFieldDefinitions.position)
}

const stageColors: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-800',
  blue: 'bg-blue-100 text-blue-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-800',
  violet: 'bg-violet-100 text-violet-800',
  cyan: 'bg-cyan-100 text-cyan-800',
  orange: 'bg-orange-100 text-orange-800',
}

export default async function DealDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const { id } = await params
  const [deal, customFieldDefs] = await Promise.all([
    getDeal(id),
    getCustomFieldDefinitions(),
  ])

  if (!deal) {
    notFound()
  }

  const formatCurrency = (value: string | null) => {
    if (!value) return null
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(value))
  }

  return (
    <div className="container py-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/deals">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Deals
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{deal.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge className={stageColors[deal.stageColor || 'slate'] || stageColors.slate}>
              {deal.stageName}
            </Badge>
            <span className="text-muted-foreground text-sm">in {deal.pipelineName}</span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Deal Details
          </CardTitle>
          <CardDescription>
            View and manage deal information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  Value
                </div>
                <p className="font-medium">
                  {formatCurrency(deal.value) || <span className="text-muted-foreground">No value</span>}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  Organization
                </div>
                {deal.organizationId && deal.organizationName ? (
                  <Link
                    href={`/organizations/${deal.organizationId}`}
                    className="text-primary hover:underline"
                  >
                    {deal.organizationName}
                  </Link>
                ) : (
                  <p className="text-muted-foreground">No organization</p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Contact
                </div>
                {deal.personId && deal.personFirstName ? (
                  <Link
                    href={`/people/${deal.personId}`}
                    className="text-primary hover:underline"
                  >
                    {deal.personFirstName} {deal.personLastName}
                  </Link>
                ) : (
                  <p className="text-muted-foreground">No contact</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Expected Close Date
                </div>
                <p className="font-medium">
                  {deal.expectedCloseDate
                    ? new Date(deal.expectedCloseDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : <span className="text-muted-foreground">Not set</span>}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Owner
                </div>
                <p className="font-medium">{deal.ownerName || "Unknown"}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Created
                </div>
                <p className="font-medium">
                  {new Date(deal.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>

          {deal.notes && (
            <div className="mt-6 pt-6 border-t">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Notes
                </div>
                <p className="text-sm whitespace-pre-wrap">{deal.notes}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CustomFieldsSection
        entityType="deal"
        entityId={deal.id}
        definitions={customFieldDefs as CustomFieldDefinition[]}
        values={(deal.customFields as Record<string, unknown>) || {}}
      />
    </div>
  )
}
