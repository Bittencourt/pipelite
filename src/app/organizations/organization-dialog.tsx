"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"
import { createOrganization, updateOrganization } from "./actions"
import { addNote } from "@/app/notes/actions"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

const organizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  industry: z.string().max(50, "Industry must be 50 characters or less").optional().or(z.literal("")),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().or(z.literal("")),
})

type OrganizationFormData = z.infer<typeof organizationSchema>

interface Organization {
  id: string
  name: string
  website: string | null
  industry: string | null
  notes: string | null
}

interface OrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organization?: Organization | null
  onSuccess: () => void
}

export function OrganizationDialog({
  open,
  onOpenChange,
  organization,
  onSuccess,
}: OrganizationDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const isEditMode = !!organization
  const tNotes = useTranslations("notes")

  /**
   * THE TYPED TEXT IS SACRED (T-35-31), AND THE RECORD MUST NOT BE CREATED TWICE.
   *
   * The create path writes the record first and its first note second. When the record
   * lands and the note does not, this holds the id of the record that already exists. Its
   * presence turns the next submit into an UPDATE of that record rather than a second
   * CREATE, which is what lets the dialog stay open — and staying open is the only thing
   * that keeps the user's typed note, which may be an arbitrarily long paste, recoverable.
   * `notes.error.saveFailed` promises the text is still in the box; closing the dialog and
   * resetting the form on that path broke that promise while claiming success.
   */
  const [createdPendingNoteId, setCreatedPendingNoteId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: "",
      website: "",
      industry: "",
      notes: "",
    },
  })

  // Reset form when organization prop changes or dialog opens
  useEffect(() => {
    if (open) {
      // A fresh open is a fresh create: never carry a previous session's half-finished
      // record forward into it.
      setCreatedPendingNoteId(null)
      if (organization) {
        // No notes value is seeded here: the edit dialog has no Notes field, and the
        // legacy column is dormant. Notes are written and edited in the record timeline.
        reset({
          name: organization.name,
          website: organization.website || "",
          industry: organization.industry || "",
        })
      } else {
        reset({
          name: "",
          website: "",
          industry: "",
          notes: "",
        })
      }
    }
  }, [open, organization, reset])

  const onSubmit = async (data: OrganizationFormData) => {
    setIsLoading(true)
    try {
      // The legacy notes column is never part of this payload, on either path.
      const record = {
        name: data.name,
        website: data.website,
        industry: data.industry,
      }

      if (isEditMode) {
        const result = await updateOrganization(organization.id, record)
        if (!result.success) {
          toast.error(result.error)
          return
        }
      } else {
        // A retry after a failed note updates the record that already exists instead of
        // creating a second one, so any field the user changed while the dialog stayed
        // open is still saved.
        let recordId = createdPendingNoteId
        if (recordId) {
          const result = await updateOrganization(recordId, record)
          if (!result.success) {
            toast.error(result.error)
            return
          }
        } else {
          const result = await createOrganization(record)
          if (!result.success) {
            toast.error(result.error)
            return
          }
          recordId = result.id
        }

        // The record already exists. A failed note is surfaced, never rolled back.
        const draft = (data.notes ?? "").trim()
        if (draft) {
          let noteSaved = false
          try {
            const noteResult = await addNote("organization", recordId, draft)
            noteSaved = noteResult.success
          } catch {
            noteSaved = false
          }

          if (!noteSaved) {
            // Do NOT close, do NOT reset, and do NOT claim success: the note is the one
            // thing that did not happen, and the draft is the thing being protected.
            // `onSuccess` still runs because the record itself did land, so the list
            // behind the dialog must not go stale.
            setCreatedPendingNoteId(recordId)
            toast.error(tNotes("error.recordCreatedNoteFailed"))
            onSuccess()
            return
          }
        }
      }

      toast.success(isEditMode ? "Organization updated!" : "Organization created!")
      onSuccess()
      handleClose()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    setCreatedPendingNoteId(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Organization" : "Add Organization"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the organization details below."
              : "Enter the details for the new organization."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Acme Corporation"
              {...register("name")}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              placeholder="https://example.com"
              {...register("website")}
              disabled={isLoading}
            />
            {errors.website && (
              <p className="text-sm text-destructive">{errors.website.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              placeholder="Technology"
              {...register("industry")}
              disabled={isLoading}
            />
            {errors.industry && (
              <p className="text-sm text-destructive">{errors.industry.message}</p>
            )}
          </div>

          {/* Create only. The text becomes the record's first timeline note, never a
              legacy column value. Editing happens in the timeline on the detail page. */}
          {!isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about this organization..."
                {...register("notes")}
                disabled={isLoading}
                rows={4}
              />
              {errors.notes && (
                <p className="text-sm text-destructive">{errors.notes.message}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditMode ? "Save Changes" : "Create Organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
