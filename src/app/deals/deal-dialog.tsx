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
import { Loader2, Trash2 } from "lucide-react"
import { createDeal, updateDeal, deleteDeal } from "./actions"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/currency"
import { AssigneePicker } from "@/components/assignee-picker"
import { EntityCombobox } from "@/components/ui/entity-combobox"

const dealSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or less"),
  value: z.string().optional(),
  stageId: z.string().min(1, "Stage is required"),
  ownerId: z.string().optional(),
  organizationId: z.string().optional(),
  personId: z.string().optional(),
  expectedCloseDate: z.string().optional(),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional(),
  assigneeIds: z.array(z.string()).optional(),
})

type DealFormData = z.infer<typeof dealSchema>

interface DealDialogProps {
  mode: "create" | "edit"
  open: boolean
  onOpenChange: (open: boolean) => void
  // For create mode - optional default stage
  defaultStageId?: string
  // For edit mode
  deal?: {
    id: string
    title: string
    value: number | null
    expectedCloseDate: Date | null
    notes: string | null
    stageId: string
    ownerId?: string | null
    organizationId: string | null
    personId: string | null
    assigneeIds?: string[]
  }
  // Dropdown data
  stages: { id: string; name: string; pipelineId: string }[]
  users?: { id: string; name: string | null; email: string }[]
  onSuccess: () => void
}

export function DealDialog({
  mode,
  open,
  onOpenChange,
  defaultStageId,
  deal,
  stages,
  users = [],
  onSuccess,
}: DealDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const isEditMode = mode === "edit"

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DealFormData>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      title: "",
      value: "",
      stageId: "",
      ownerId: "",
      organizationId: "",
      personId: "",
      expectedCloseDate: "",
      notes: "",
      assigneeIds: [],
    },
  })

  const stageId = watch("stageId")
  const ownerId = watch("ownerId")
  const organizationId = watch("organizationId")
  const personId = watch("personId")
  const valueInput = watch("value")
  const assigneeIds = watch("assigneeIds") ?? []

  // Parse value for currency preview
  const numericValue = valueInput ? parseFloat(valueInput) : null
  const formattedValue = numericValue !== null && !isNaN(numericValue)
    ? formatCurrency(numericValue)
    : null

  // Reset form when dialog opens or deal changes
  useEffect(() => {
    if (open) {
      if (deal) {
        reset({
          title: deal.title,
          value: deal.value?.toString() || "",
          stageId: deal.stageId,
          ownerId: deal.ownerId || "",
          organizationId: deal.organizationId || "",
          personId: deal.personId || "",
          expectedCloseDate: deal.expectedCloseDate
            ? new Date(deal.expectedCloseDate).toISOString().split("T")[0]
            : "",
          notes: deal.notes || "",
          assigneeIds: deal.assigneeIds ?? [],
        })
      } else {
        reset({
          title: "",
          value: "",
          stageId: defaultStageId || "",
          ownerId: "",
          organizationId: "",
          personId: "",
          expectedCloseDate: "",
          notes: "",
          assigneeIds: [],
        })
      }
    }
  }, [open, deal, defaultStageId, reset])

  const onSubmit = async (data: DealFormData) => {
    // Client-side validation: at least one of org/person must be selected
    if (!data.organizationId && !data.personId) {
      toast.error("At least one of organization or person is required")
      return
    }

    setIsLoading(true)
    try {
      const dealData = {
        title: data.title,
        value: data.value ? parseFloat(data.value) : null,
        stageId: data.stageId,
        ownerId: data.ownerId || undefined,
        organizationId: data.organizationId || null,
        personId: data.personId || null,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
        notes: data.notes || null,
        assigneeIds: data.assigneeIds ?? [],
      }

      const result = isEditMode
        ? await updateDeal(deal!.id, dealData)
        : await createDeal(dealData)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(isEditMode ? "Deal updated!" : "Deal created!")
      onSuccess()
      handleClose()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deal) return

    setIsLoading(true)
    try {
      const result = await deleteDeal(deal.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Deal deleted")
      setShowDeleteDialog(false)
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
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "Edit Deal" : "Create Deal"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update the deal details below."
                : "Enter the details for the new deal."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g., Enterprise Deal - Acme Corp"
                {...register("title")}
                disabled={isLoading}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="value">Value</Label>
              <Input
                id="value"
                type="number"
                placeholder="e.g., 50000"
                {...register("value")}
                disabled={isLoading}
              />
              {formattedValue && (
                <p className="text-sm text-muted-foreground">
                  Value: {formattedValue}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="stageId">
                Stage <span className="text-destructive">*</span>
              </Label>
              <Select
                value={stageId || ""}
                onValueChange={(value) => setValue("stageId", value)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.stageId && (
                <p className="text-sm text-destructive">{errors.stageId.message}</p>
              )}
            </div>

            {users.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="ownerId">Owner</Label>
                <Select
                  value={ownerId || ""}
                  onValueChange={(value) => setValue("ownerId", value === "none" ? "" : value)}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an owner (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No owner</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="organizationId">Organization</Label>
              <EntityCombobox
                entityType="organization"
                value={organizationId || null}
                onChange={(value) => setValue("organizationId", value ?? "")}
                placeholder="Select an organization (optional)"
                clearLabel="No organization"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="personId">Person</Label>
              <EntityCombobox
                entityType="person"
                value={personId || null}
                onChange={(value) => setValue("personId", value ?? "")}
                placeholder="Select a person (optional)"
                clearLabel="No person"
                disabled={isLoading}
              />
              {!organizationId && !personId && (
                <p className="text-xs text-muted-foreground">
                  At least one of organization or person is required
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedCloseDate">Expected Close Date</Label>
              <Input
                id="expectedCloseDate"
                type="date"
                {...register("expectedCloseDate")}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about this deal..."
                {...register("notes")}
                disabled={isLoading}
                rows={4}
              />
              {errors.notes && (
                <p className="text-sm text-destructive">{errors.notes.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Assignees</Label>
              <AssigneePicker
                users={users}
                value={assigneeIds}
                onChange={(ids) => setValue("assigneeIds", ids)}
                disabled={isLoading}
              />
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
                  {isEditMode ? "Save Changes" : "Create Deal"}
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
            <AlertDialogTitle>Delete Deal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this deal? This action cannot be undone.
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
