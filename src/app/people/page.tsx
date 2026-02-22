import { db } from "@/db"
import { people, organizations, users } from "@/db/schema"
import { isNull, desc, eq, and } from "drizzle-orm"
import { DataTable } from "./data-table"
import { columns } from "./columns"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Users } from "lucide-react"

async function getOrganizationsForSelect() {
  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(isNull(organizations.deletedAt))
    .orderBy(organizations.name)
}

async function getPeople() {
  const result = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phone: people.phone,
      notes: people.notes,
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
    .where(isNull(people.deletedAt))
    .orderBy(desc(people.createdAt))

  return result.map((person) => ({
    ...person,
    organizationName: person.organizationName || null,
    ownerName: person.ownerName || null,
  }))
}

export default async function PeoplePage() {
  const [peopleData, orgsForSelect] = await Promise.all([
    getPeople(),
    getOrganizationsForSelect(),
  ])

  return (
    <div className="container py-8">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">People</h1>
            <p className="text-muted-foreground">
              Manage your contacts and their details
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="sr-only">
            <CardTitle>People List</CardTitle>
            <CardDescription>
              A table of all people in your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={peopleData} organizations={orgsForSelect} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
