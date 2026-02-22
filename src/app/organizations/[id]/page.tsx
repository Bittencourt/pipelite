import { db } from "@/db"
import { organizations, users } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { notFound } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Calendar, User, Globe, Building2, FileText } from "lucide-react"
import { OrganizationDetailClient } from "./organization-detail-client"

interface PageProps {
  params: Promise<{ id: string }>
}

async function getOrganization(id: string) {
  const result = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      website: organizations.website,
      industry: organizations.industry,
      notes: organizations.notes,
      createdAt: organizations.createdAt,
      ownerName: users.name,
    })
    .from(organizations)
    .leftJoin(users, eq(organizations.ownerId, users.id))
    .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
    .limit(1)

  if (result.length === 0) {
    return null
  }

  return {
    ...result[0],
    ownerName: result[0].ownerName || null,
  }
}

export default async function OrganizationDetailPage({ params }: PageProps) {
  const { id } = await params
  const organization = await getOrganization(id)

  if (!organization) {
    notFound()
  }

  return (
    <div className="container py-8">
      <OrganizationDetailClient organization={organization} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Details
          </CardTitle>
          <CardDescription>
            View and manage organization information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  Name
                </div>
                <p className="font-medium">{organization.name}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  Website
                </div>
                {organization.website ? (
                  <a
                    href={organization.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {organization.website}
                  </a>
                ) : (
                  <p className="text-muted-foreground">Not specified</p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  Industry
                </div>
                {organization.industry ? (
                  <Badge variant="secondary">{organization.industry}</Badge>
                ) : (
                  <p className="text-muted-foreground">Not specified</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  Owner
                </div>
                <p className="font-medium">
                  {organization.ownerName || "Unknown"}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Created
                </div>
                <p className="font-medium">
                  {new Date(organization.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>

          {organization.notes && (
            <div className="mt-6 pt-6 border-t">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Notes
                </div>
                <p className="text-sm whitespace-pre-wrap">{organization.notes}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
