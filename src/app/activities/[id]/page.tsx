import { auth } from "@/auth"
import { db } from "@/db"
import { activities, activityTypes, deals, stages, pipelines, users, customFieldDefinitions } from "@/db/schema"
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
import { ArrowLeft, Calendar, CheckCircle2, Clock, FileText, Users, DollarSign } from "lucide-react"
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section"
import type { CustomFieldDefinition } from "@/db/schema"

interface PageProps {
  params: Promise<{ id: string }>
}

async function getActivity(id: string) {
  const result = await db
    .select({
      id: activities.id,
      title: activities.title,
      notes: activities.notes,
      dueDate: activities.dueDate,
      completedAt: activities.completedAt,
      customFields: activities.customFields,
      createdAt: activities.createdAt,
      typeId: activities.typeId,
      typeName: activityTypes.name,
      typeIcon: activityTypes.icon,
      typeColor: activityTypes.color,
      dealId: activities.dealId,
      dealTitle: deals.title,
      stageId: deals.stageId,
      stageName: stages.name,
      pipelineId: pipelines.id,
      pipelineName: pipelines.name,
      ownerName: users.name,
    })
    .from(activities)
    .innerJoin(activityTypes, eq(activities.typeId, activityTypes.id))
    .leftJoin(deals, and(eq(activities.dealId, deals.id), isNull(deals.deletedAt)))
    .leftJoin(stages, eq(deals.stageId, stages.id))
    .leftJoin(pipelines, eq(stages.pipelineId, pipelines.id))
    .leftJoin(users, eq(activities.ownerId, users.id))
    .where(and(eq(activities.id, id), isNull(activities.deletedAt)))
    .limit(1)

  if (result.length === 0) {
    return null
  }

  return {
    ...result[0],
    dealTitle: result[0].dealTitle || null,
    stageName: result[0].stageName || null,
    pipelineName: result[0].pipelineName || null,
    ownerName: result[0].ownerName || null,
  }
}

async function getCustomFieldDefinitions() {
  return db.select()
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.entityType, 'activity'),
      isNull(customFieldDefinitions.deletedAt)
    ))
    .orderBy(customFieldDefinitions.position)
}

const typeColors: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-800',
  blue: 'bg-blue-100 text-blue-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-800',
  violet: 'bg-violet-100 text-violet-800',
  cyan: 'bg-cyan-100 text-cyan-800',
  orange: 'bg-orange-100 text-orange-800',
}

export default async function ActivityDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const { id } = await params
  const [activity, customFieldDefs] = await Promise.all([
    getActivity(id),
    getCustomFieldDefinitions(),
  ])

  if (!activity) {
    notFound()
  }

  const isOverdue = !activity.completedAt && new Date(activity.dueDate) < new Date()
  const isCompleted = activity.completedAt !== null

  return (
    <div className="container py-8">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/activities">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Activities
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{activity.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge className={typeColors[activity.typeColor || 'slate'] || typeColors.slate}>
              {activity.typeName}
            </Badge>
            {isCompleted && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Completed
              </Badge>
            )}
            {isOverdue && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                Overdue
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Activity Details
          </CardTitle>
          <CardDescription>
            View and manage activity information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Due Date
                </div>
                <p className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>
                  {new Date(activity.dueDate).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  Status
                </div>
                <p className="font-medium">
                  {isCompleted
                    ? `Completed ${activity.completedAt ? new Date(activity.completedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : ''}`
                    : "Pending"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  Deal
                </div>
                {activity.dealId && activity.dealTitle ? (
                  <div>
                    <Link
                      href={`/deals/${activity.dealId}`}
                      className="text-primary hover:underline"
                    >
                      {activity.dealTitle}
                    </Link>
                    {activity.stageName && activity.pipelineName && (
                      <p className="text-sm text-muted-foreground">
                        {activity.stageName} in {activity.pipelineName}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No deal linked</p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Owner
                </div>
                <p className="font-medium">{activity.ownerName || "Unknown"}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Created
                </div>
                <p className="font-medium">
                  {new Date(activity.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>

          {activity.notes && (
            <div className="mt-6 pt-6 border-t">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Notes
                </div>
                <p className="text-sm whitespace-pre-wrap">{activity.notes}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CustomFieldsSection
        entityType="activity"
        entityId={activity.id}
        definitions={customFieldDefs as CustomFieldDefinition[]}
        values={(activity.customFields as Record<string, unknown>) || {}}
      />
    </div>
  )
}
