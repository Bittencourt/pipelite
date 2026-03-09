import { db } from "@/db"
import { people, organizations, users, customFieldDefinitions } from "@/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { notFound } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Users, Mail, Phone, Building2, Calendar, User, FileText } from "lucide-react"
import Link from "next/link"
import { PersonDetailClient } from "./person-detail-client"
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section"
import type { EntityType, CustomFieldDefinition } from "@/db/schema"
import { getFormatter, getTranslations } from 'next-intl/server'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getPerson(id: string) {
  const result = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phone: people.phone,
      notes: people.notes,
      customFields: people.customFields,
      organizationId: people.organizationId,
      organizationName: organizations.name,
      ownerName: users.name,
      createdAt: people.createdAt,
    })
    .from(people)
    .leftJoin(
      organizations,
      and(eq(people.organizationId, organizations.id), isNull(organizations.deletedAt))
    )
    .leftJoin(users, eq(people.ownerId, users.id))
    .where(and(eq(people.id, id), isNull(people.deletedAt)))
    .limit(1)

  if (result.length === 0) {
    return null
  }

  return {
    ...result[0],
    organizationName: result[0].organizationName || null,
    ownerName: result[0].ownerName || null,
  }
}

async function getCustomFieldDefinitions() {
  return db.select()
    .from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.entityType, 'person'),
      isNull(customFieldDefinitions.deletedAt)
    ))
    .orderBy(customFieldDefinitions.position)
}

export default async function PersonDetailPage({ params }: PageProps) {
  const { id } = await params
  const format = await getFormatter()
  const t = await getTranslations('people')
  
  const [person, customFieldDefs] = await Promise.all([
    getPerson(id),
    getCustomFieldDefinitions(),
  ])

  if (!person) {
    notFound()
  }

  return (
    <div className="container py-8">
      <PersonDetailClient person={person} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('personDetails')}
          </CardTitle>
          <CardDescription>
            {t('viewContactInfo')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {t('name')}
                </div>
                <p className="font-medium">
                  {person.firstName} {person.lastName}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {t('email')}
                </div>
                {person.email ? (
                  <a
                    href={`mailto:${person.email}`}
                    className="text-primary hover:underline"
                  >
                    {person.email}
                  </a>
                ) : (
                  <p className="text-muted-foreground">{t('notSpecified')}</p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  {t('phone')}
                </div>
                <p className="font-medium">
                  {person.phone || <span className="text-muted-foreground font-normal">{t('notSpecified')}</span>}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  {t('organization')}
                </div>
                {person.organizationId && person.organizationName ? (
                  <Link
                    href={`/organizations/${person.organizationId}`}
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <Building2 className="h-4 w-4" />
                    {person.organizationName}
                  </Link>
                ) : (
                  <p className="text-muted-foreground">{t('noOrganization')}</p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  {t('owner')}
                </div>
                <p className="font-medium">
                  {person.ownerName || t('unknown')}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {t('created')}
                </div>
                <p className="font-medium">
                  {format.dateTime(new Date(person.createdAt), {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  })}
                </p>
              </div>
            </div>
          </div>

          {person.notes && (
            <div className="mt-6 pt-6 border-t">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {t('notes')}
                </div>
                <p className="text-sm whitespace-pre-wrap">{person.notes}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CustomFieldsSection
        entityType="person"
        entityId={person.id}
        definitions={customFieldDefs as CustomFieldDefinition[]}
        values={(person.customFields as Record<string, unknown>) || {}}
        entityAttributes={{
          FirstName: person.firstName,
          LastName: person.lastName,
          Email: person.email,
          Phone: person.phone,
          Notes: person.notes,
        }}
      />
    </div>
  )
}
