import { db } from "@/db"
import { organizations, users, people, customFieldDefinitions } from "@/db/schema"
import { eq, and, isNull, desc } from "drizzle-orm"
import { notFound } from "next/navigation"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Calendar, User, Globe, Building2, FileText, Users, Mail } from "lucide-react"
import { OrganizationDetailClient } from "./organization-detail-client"
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section"
import type { EntityType, CustomFieldDefinition } from "@/db/schema"
import { getFormatter, getTranslations } from 'next-intl/server'

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
      customFields: organizations.customFields,
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

async function getCustomFieldDefinitions() {
  return db.select()
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.entityType, 'organization'),
      isNull(customFieldDefinitions.deletedAt)
    ))
    .orderBy(customFieldDefinitions.position)
}

async function getLinkedPeople(organizationId: string) {
  return db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phone: people.phone,
    })
    .from(people)
    .where(and(eq(people.organizationId, organizationId), isNull(people.deletedAt)))
    .orderBy(desc(people.createdAt))
}

export default async function OrganizationDetailPage({ params }: PageProps) {
  const { id } = await params
  const format = await getFormatter()
  const t = await getTranslations('organizations')
  
  const [organization, linkedPeople, customFieldDefs] = await Promise.all([
    getOrganization(id),
    getLinkedPeople(id),
    getCustomFieldDefinitions(),
  ])

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
            {t('organizationDetails')}
          </CardTitle>
          <CardDescription>
            {t('viewOrgInfo')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  {t('name')}
                </div>
                <p className="font-medium">{organization.name}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  {t('website')}
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
                  <p className="text-muted-foreground">{t('notSpecified')}</p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  {t('industry')}
                </div>
                {organization.industry ? (
                  <Badge variant="secondary">{organization.industry}</Badge>
                ) : (
                  <p className="text-muted-foreground">{t('notSpecified')}</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  {t('owner')}
                </div>
                <p className="font-medium">
                  {organization.ownerName || t('unknown')}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {t('created')}
                </div>
                <p className="font-medium">
                  {format.dateTime(new Date(organization.createdAt), {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
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
                  {t('notes')}
                </div>
                <p className="text-sm whitespace-pre-wrap">{organization.notes}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CustomFieldsSection
        entityType="organization"
        entityId={organization.id}
        definitions={customFieldDefs as CustomFieldDefinition[]}
        values={(organization.customFields as Record<string, unknown>) || {}}
        entityAttributes={{
          Name: organization.name,
          Website: organization.website,
          Industry: organization.industry,
          Notes: organization.notes,
        }}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('people')}
          </CardTitle>
          <CardDescription>
            {t('contactsLinked')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkedPeople.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('noPeopleLinked')}
            </p>
          ) : (
            <div className="space-y-3">
              {linkedPeople.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Link
                        href={`/people/${person.id}`}
                        className="font-medium hover:underline"
                      >
                        {person.firstName} {person.lastName}
                      </Link>
                      {person.email && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {person.email}
                        </div>
                      )}
                    </div>
                  </div>
                  {person.phone && (
                    <span className="text-sm text-muted-foreground">
                      {person.phone}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
