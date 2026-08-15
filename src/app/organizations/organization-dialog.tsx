"use client"

import { useState, useEffect, useRef } from "react"
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
  /**
   * REFRESH ONLY — THIS CALLBACK MUST NEVER CLOSE THE DIALOG.
   *
   * It means "the record behind this dialog changed, re-read your data", not "we are
   * done". The dialog decides for itself when it is done and closes through
   * `onOpenChange(false)`. A call site that also flips its `open` state here defeats the
   * one path that must stay open: a create whose record landed but whose note did not
   * (T-35-31 — see `createdRecordIdRef` below). The prop is deliberately no longer named
   * for success alone: a name that said only "it worked" is what invited the close.
   */
  onRecordSaved: () => void
}

export function OrganizationDialog({
  open,
  onOpenChange,
  organization,
  onRecordSaved,
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
   *
   * A ref and not state, deliberately: the reset-on-open effect below has to read it, and
   * a state value would have to be an effect dependency, so setting it would re-run the
   * effect and `reset()` away the very draft it exists to protect.
   *
   * Lifecycle — a create must never silently become an update of an unrelated record:
   *   set    on the create branch, the moment the record exists — before the note is
 *          even attempted, because the create action's own `revalidatePath` refresh
 *          reaches the client tree within milliseconds and has to find it armed (WR-12)
   *   read   only on the create branch of `onSubmit`
   *   clear  on close (handleClose), on `open` going false by any other route, on a fresh
   *          open, and whenever the dialog is pointed at an edit target
   */
  const createdRecordIdRef = useRef<string | null>(null)

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
    if (!open) {
      // Any close ends the pending create, including a parent that flips `open` directly
      // instead of going through handleClose.
      createdRecordIdRef.current = null
      return
    }

    if (organization) {
      // An edit target can never inherit a create's half-finished record id.
      createdRecordIdRef.current = null
      // No notes value is seeded here: the edit dialog has no Notes field, and the
      // legacy column is dormant. Notes are written and edited in the record timeline.
      reset({
        name: organization.name,
        website: organization.website || "",
        industry: organization.industry || "",
      })
      return
    }

    // A create whose record already landed: the dialog is deliberately still open and
    // the textarea still holds the draft. TWO refreshes re-render the parent while it is.
    // The first is fired by the create action itself — `revalidatePath` runs before the
    // action returns, and the resulting server render reaches the client tree within
    // milliseconds of the `await`, i.e. while the note round trip is still in flight
    // (measured, WR-12). The second is the one the failure branch fires afterwards. A
    // changed prop identity from either must not wipe the form out from under the user
    // (T-35-31). Cleared on close, so the next open still starts clean.
    if (createdRecordIdRef.current) return

    reset({
      name: "",
      website: "",
      industry: "",
      notes: "",
    })
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
        let recordId = createdRecordIdRef.current
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
          // Arm the reset guard the instant the record exists, and not one await later.
          // `createOrganization` calls `revalidatePath` before it returns, and that refresh
          // lands on the client a few milliseconds after this await resolves — well
          // inside the `addNote` round trip below. Every effect whose dependency list
          // holds a freshly built prop re-runs then; `activity-dialog` depends on the
          // `activityTypes` array that its page rebuilds on every server render. An
          // unarmed guard at that moment resets the form and destroys the draft this
          // whole path exists to protect (T-35-31, WR-12).
          createdRecordIdRef.current = recordId
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
            // `onRecordSaved` still runs because the record itself did land, so the list
            // behind the dialog must not go stale — and it is contractually forbidden
            // from closing this dialog, which is what makes the draft survive.
            //
            // The guard is NOT armed here. It was armed the moment the record existed,
            // on the create branch above, because the refresh that action fires does not
            // wait for this branch to be reached (WR-12).
            toast.error(tNotes("error.recordCreatedNoteFailed"))
            onRecordSaved()
            return
          }
        }
      }

      toast.success(isEditMode ? "Organization updated!" : "Organization created!")
      onRecordSaved()
      handleClose()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    createdRecordIdRef.current = null
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
