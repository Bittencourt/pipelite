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
import { toast } from "sonner"

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
      if (organization) {
        reset({
          name: organization.name,
          website: organization.website || "",
          industry: organization.industry || "",
          notes: organization.notes || "",
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
      const result = isEditMode
        ? await updateOrganization(organization.id, data)
        : await createOrganization(data)

      if (!result.success) {
        toast.error(result.error)
        return
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
