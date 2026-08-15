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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Trash2, Phone, Users, CheckSquare, Mail } from "lucide-react"
import { createActivity, updateActivity, deleteActivity } from "./actions"
import { addNote } from "@/app/notes/actions"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

const activitySchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  typeId: z.string().min(1, "Activity type is required"),
  dueDate: z.string().min(1, "Due date is required"),
  dueTime: z.string().optional(),
  dealId: z.string().optional(),
  assigneeId: z.string().optional(),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional(),
})

type ActivityFormData = z.infer<typeof activitySchema>

// Activity type with icon info
interface ActivityType {
  id: string
  name: string
  icon: string | null
  color: string | null
}

// Deal for dropdown
interface Deal {
  id: string
  title: string
  stageId?: string
  stage?: { name: string; pipelineId: string } | null
  pipeline?: { name: string } | null
}

// Activity for edit mode
interface Activity {
  id: string
  title: string
  typeId: string
  dealId: string | null
  assigneeId?: string | null
  dueDate: Date
  notes: string | null
}

interface ActivityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activity?: Activity | null // null = create mode, object = edit mode
  activityTypes: ActivityType[]
  deals: Deal[]
  users?: { id: string; name: string | null; email: string }[]
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
  onRecordSaved?: () => void
}

// Icon mapping for activity types
const iconMap: Record<string, React.ReactNode> = {
  Phone: <Phone className="h-4 w-4" />,
  Users: <Users className="h-4 w-4" />,
  CheckSquare: <CheckSquare className="h-4 w-4" />,
  Mail: <Mail className="h-4 w-4" />,
}

export function ActivityDialog({
  open,
  onOpenChange,
  activity,
  activityTypes,
  deals,
  users = [],
  onRecordSaved,
}: ActivityDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const isEditMode = !!activity
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
   * effect and `reset()` away the very draft it exists to protect. That matters most here:
   * this effect also depends on the `activityTypes` array prop, whose identity changes on
   * every parent refresh.
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
    watch,
    setValue,
    formState: { errors },
  } = useForm<ActivityFormData>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      title: "",
      typeId: "",
      dueDate: "",
      dueTime: "09:00",
      dealId: "",
      assigneeId: "",
      notes: "",
    },
  })

  const typeId = watch("typeId")
  const dealId = watch("dealId")
  const assigneeId = watch("assigneeId")

  // Reset form when dialog opens or activity changes
  useEffect(() => {
    if (!open) {
      // Any close ends the pending create, including a parent that flips `open` directly
      // instead of going through handleClose.
      createdRecordIdRef.current = null
      return
    }

    if (activity) {
      // An edit target can never inherit a create's half-finished record id.
      createdRecordIdRef.current = null
      // Format date for input
      const dueDate = new Date(activity.dueDate)
      const dateStr = dueDate.toISOString().split("T")[0]
      const timeStr = dueDate.toTimeString().slice(0, 5)

      // No notes value is seeded here: the edit dialog has no Notes field, and the
      // legacy column is dormant. Notes are written and edited in the record timeline.
      reset({
        title: activity.title,
        typeId: activity.typeId,
        dueDate: dateStr,
        dueTime: timeStr,
        dealId: activity.dealId || "",
        assigneeId: activity.assigneeId || "",
      })
      return
    }

    // A create whose record already landed: the dialog is deliberately still open and
    // the textarea still holds the draft. TWO refreshes hand this effect a new
    // `activityTypes` array while it is. The first is fired by `createActivity` itself —
    // `revalidatePath` runs before the action returns, and the resulting server render
    // reaches the client tree within milliseconds of the `await`, i.e. while the note
    // round trip is still in flight (measured, WR-12). The second is the one the failure
    // branch fires afterwards. Neither may wipe the form out from under the user
    // (T-35-31). Cleared on close, so the next open still starts clean.
    if (createdRecordIdRef.current) return

    reset({
      title: "",
      typeId: activityTypes[0]?.id || "",
      dueDate: "",
      dueTime: "09:00",
      dealId: "",
      notes: "",
    })
  }, [open, activity, activityTypes, reset])

  const onSubmit = async (data: ActivityFormData) => {
    setIsLoading(true)
    try {
      // Combine date and time into a Date object
      const dateTimeStr = `${data.dueDate}T${data.dueTime || "09:00"}:00`
      const dueDate = new Date(dateTimeStr)

      // The legacy notes column is never part of this payload, on either path.
      const activityData = {
        title: data.title,
        typeId: data.typeId,
        dealId: data.dealId || null,
        assigneeId: data.assigneeId || null,
        dueDate,
      }

      if (isEditMode) {
        const result = await updateActivity(activity.id, activityData)
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
          const result = await updateActivity(recordId, activityData)
          if (!result.success) {
            toast.error(result.error)
            return
          }
        } else {
          const result = await createActivity(activityData)
          if (!result.success) {
            toast.error(result.error)
            return
          }
          recordId = result.id
          // Arm the reset guard the instant the record exists, and not one await later.
          // `createActivity` calls `revalidatePath` before it returns, and that refresh
          // lands on the client a few milliseconds after this await resolves — well
          // inside the `addNote` round trip below. This dialog is the exposed one: its
          // reset effect lists `activityTypes`, and `activities/page.tsx` rebuilds that
          // array on every server render, so the refresh re-runs the effect. An unarmed
          // guard at that moment resets the form and destroys the draft this whole path
          // exists to protect (T-35-31, WR-12).
          createdRecordIdRef.current = recordId
        }

        // The record already exists. A failed note is surfaced, never rolled back.
        const draft = (data.notes ?? "").trim()
        if (draft) {
          let noteSaved = false
          try {
            const noteResult = await addNote("activity", recordId, draft)
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
            onRecordSaved?.()
            return
          }
        }
      }

      toast.success(isEditMode ? "Activity updated!" : "Activity created!")
      onRecordSaved?.()
      handleClose()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!activity) return

    setIsLoading(true)
    try {
      const result = await deleteActivity(activity.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Activity deleted")
      setShowDeleteDialog(false)
      onRecordSaved?.()
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
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "Edit Activity" : "Create Activity"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update the activity details below."
                : "Enter the details for the new activity."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g., Follow-up call with client"
                {...register("title")}
                disabled={isLoading}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="typeId">
                Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={typeId || ""}
                onValueChange={(value) => setValue("typeId", value)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select activity type" />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      <p className="font-medium">No activity types available</p>
                      <p className="mt-1">Run the seed script to add default types:</p>
                      <code className="mt-1 block bg-muted px-2 py-1 rounded text-xs">
                        npm run db:seed-activities
                      </code>
                    </div>
                  ) : (
                    activityTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        <div className="flex items-center gap-2">
                          {type.icon && iconMap[type.icon]}
                          {type.name}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {errors.typeId && (
                <p className="text-sm text-destructive">{errors.typeId.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dueDate">
                  Due Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="dueDate"
                  type="date"
                  {...register("dueDate")}
                  disabled={isLoading}
                />
                {errors.dueDate && (
                  <p className="text-sm text-destructive">{errors.dueDate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueTime">Time</Label>
                <Input
                  id="dueTime"
                  type="time"
                  {...register("dueTime")}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dealId">Deal</Label>
              <Select
                value={dealId || ""}
                onValueChange={(value) => setValue("dealId", value === "none" ? "" : value)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Link to a deal (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No deal</SelectItem>
                  {deals.map((deal) => (
                    <SelectItem key={deal.id} value={deal.id}>
                      {deal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assigneeId">Assignee</Label>
              <Select
                value={assigneeId || "none"}
                onValueChange={(value) => setValue("assigneeId", value === "none" ? "" : value)}
                disabled={isLoading}
              >
                <SelectTrigger id="assigneeId">
                  <SelectValue placeholder="No assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No assignee</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Create only. The text becomes the record's first timeline note, never a
                legacy column value. Editing happens in the timeline on the detail page. */}
            {!isEditMode && (
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about this activity..."
                  {...register("notes")}
                  disabled={isLoading}
                  rows={3}
                />
                {errors.notes && (
                  <p className="text-sm text-destructive">{errors.notes.message}</p>
                )}
              </div>
            )}

            <DialogFooter className={isEditMode ? "sm:justify-between" : ""}>
              {isEditMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isLoading}
                  className="mr-auto"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              )}
              <div className="flex gap-2">
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
                  {isEditMode ? "Save Changes" : "Create Activity"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Activity</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this activity? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
