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
import { toast } from "sonner"

const activitySchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  typeId: z.string().min(1, "Activity type is required"),
  dueDate: z.string().min(1, "Due date is required"),
  dueTime: z.string().optional(),
  dealId: z.string().optional(),
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
  dueDate: Date
  notes: string | null
}

interface ActivityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activity?: Activity | null // null = create mode, object = edit mode
  activityTypes: ActivityType[]
  deals: Deal[]
  onSuccess?: () => void
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
  onSuccess,
}: ActivityDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const isEditMode = !!activity

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
      notes: "",
    },
  })

  const typeId = watch("typeId")
  const dealId = watch("dealId")

  // Reset form when dialog opens or activity changes
  useEffect(() => {
    if (open) {
      if (activity) {
        // Format date for input
        const dueDate = new Date(activity.dueDate)
        const dateStr = dueDate.toISOString().split("T")[0]
        const timeStr = dueDate.toTimeString().slice(0, 5)
        
        reset({
          title: activity.title,
          typeId: activity.typeId,
          dueDate: dateStr,
          dueTime: timeStr,
          dealId: activity.dealId || "",
          notes: activity.notes || "",
        })
      } else {
        reset({
          title: "",
          typeId: activityTypes[0]?.id || "",
          dueDate: "",
          dueTime: "09:00",
          dealId: "",
          notes: "",
        })
      }
    }
  }, [open, activity, activityTypes, reset])

  const onSubmit = async (data: ActivityFormData) => {
    setIsLoading(true)
    try {
      // Combine date and time into a Date object
      const dateTimeStr = `${data.dueDate}T${data.dueTime || "09:00"}:00`
      const dueDate = new Date(dateTimeStr)

      const activityData = {
        title: data.title,
        typeId: data.typeId,
        dealId: data.dealId || null,
        dueDate,
        notes: data.notes || null,
      }

      const result = isEditMode
        ? await updateActivity(activity.id, activityData)
        : await createActivity(activityData)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(isEditMode ? "Activity updated!" : "Activity created!")
      onSuccess?.()
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
      onSuccess?.()
      handleClose()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    reset()
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
