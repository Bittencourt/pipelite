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
import { createPerson, updatePerson } from "./actions"
import { addNote } from "@/app/notes/actions"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { EntityCombobox } from "@/components/ui/entity-combobox"

const personSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name must be 50 characters or less"),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name must be 50 characters or less"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30, "Phone must be 30 characters or less").optional().or(z.literal("")),
  notes: z.string().max(2000, "Notes must be 2000 characters or less").optional().or(z.literal("")),
  organizationId: z.string().optional().or(z.literal("")),
})

type PersonFormData = z.infer<typeof personSchema>

interface Person {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
  organizationId: string | null
}

interface PersonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person?: Person | null
  onSuccess: () => void
}

export function PersonDialog({
  open,
  onOpenChange,
  person,
  onSuccess,
}: PersonDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const isEditMode = !!person
  const tNotes = useTranslations("notes")

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PersonFormData>({
    resolver: zodResolver(personSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      notes: "",
      organizationId: "",
    },
  })

  const organizationId = watch("organizationId")

  // Reset form when person prop changes or dialog opens
  useEffect(() => {
    if (open) {
      if (person) {
        // No notes value is seeded here: the edit dialog has no Notes field, and the
        // legacy column is dormant. Notes are written and edited in the record timeline.
        reset({
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email || "",
          phone: person.phone || "",
          organizationId: person.organizationId || "",
        })
      } else {
        reset({
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          notes: "",
          organizationId: "",
        })
      }
    }
  }, [open, person, reset])

  const onSubmit = async (data: PersonFormData) => {
    setIsLoading(true)
    try {
      // The legacy notes column is never part of this payload, on either path.
      const record = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        organizationId: data.organizationId,
      }

      if (isEditMode) {
        const result = await updatePerson(person.id, record)
        if (!result.success) {
          toast.error(result.error)
          return
        }
      } else {
        const result = await createPerson(record)
        if (!result.success) {
          toast.error(result.error)
          return
        }

        // The record already exists. A failed note is surfaced, never rolled back.
        const draft = (data.notes ?? "").trim()
        if (draft) {
          try {
            const noteResult = await addNote("person", result.id, draft)
            if (!noteResult.success) {
              toast.error(tNotes("error.saveFailed"))
            }
          } catch {
            toast.error(tNotes("error.saveFailed"))
          }
        }
      }

      toast.success(isEditMode ? "Person updated!" : "Person created!")
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
            {isEditMode ? "Edit Person" : "Add Person"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the person details below."
              : "Enter the details for the new contact."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                placeholder="John"
                {...register("firstName")}
                disabled={isLoading}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                placeholder="Doe"
                {...register("lastName")}
                disabled={isLoading}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              {...register("email")}
              disabled={isLoading}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="+1 (555) 123-4567"
              {...register("phone")}
              disabled={isLoading}
            />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
          </div>

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

          {/* Create only. The text becomes the record's first timeline note, never a
              legacy column value. Editing happens in the timeline on the detail page. */}
          {!isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes about this person..."
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
              {isEditMode ? "Save Changes" : "Create Person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
