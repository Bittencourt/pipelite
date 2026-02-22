"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Pencil, Trash2, ArrowLeft } from "lucide-react"
import { PersonDialog } from "../person-dialog"
import { DeleteDialog } from "../delete-dialog"
import { deletePerson } from "../actions"
import { toast } from "sonner"

interface Person {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
  organizationId: string | null
  organizationName: string | null
  ownerName: string | null
  createdAt: Date
}

interface PersonDetailClientProps {
  person: Person
  organizations: { id: string; name: string }[]
}

export function PersonDetailClient({
  person,
  organizations,
}: PersonDetailClientProps) {
  const router = useRouter()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deletePerson(person.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Person deleted")
      router.push("/people")
      router.refresh()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  const handleEditSuccess = () => {
    setEditDialogOpen(false)
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/people")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to People
        </Button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">
          {person.firstName} {person.lastName}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditDialogOpen(true)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <PersonDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        person={person}
        organizations={organizations}
        onSuccess={handleEditSuccess}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        personName={`${person.firstName} ${person.lastName}`}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </>
  )
}
