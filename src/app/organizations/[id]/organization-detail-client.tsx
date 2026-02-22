"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Pencil, Trash2, ArrowLeft } from "lucide-react"
import { OrganizationDialog } from "../organization-dialog"
import { DeleteDialog } from "../delete-dialog"
import { deleteOrganization } from "../actions"
import { toast } from "sonner"

interface Organization {
  id: string
  name: string
  website: string | null
  industry: string | null
  notes: string | null
  ownerName: string | null
  createdAt: Date
}

interface OrganizationDetailClientProps {
  organization: Organization
}

export function OrganizationDetailClient({
  organization,
}: OrganizationDetailClientProps) {
  const router = useRouter()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteOrganization(organization.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Organization deleted")
      router.push("/organizations")
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
          onClick={() => router.push("/organizations")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Organizations
        </Button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{organization.name}</h1>
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

      <OrganizationDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        organization={organization}
        onSuccess={handleEditSuccess}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        organizationName={organization.name}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </>
  )
}
