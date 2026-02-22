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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { createPerson, updatePerson } from "./actions"
import { toast } from "sonner"

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

interface OrganizationOption {
  id: string
  name: string
}

interface PersonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person?: Person | null
  organizations: OrganizationOption[]
  onSuccess: () => void
}

export function PersonDialog({
  open,
  onOpenChange,
  person,
  organizations,
  onSuccess,
}: PersonDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const isEditMode = !!person

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
        reset({
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email || "",
          phone: person.phone || "",
          notes: person.notes || "",
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
      const result = isEditMode
        ? await updatePerson(person.id, data)
        : await createPerson(data)

      if (!result.success) {
        toast.error(result.error)
        return
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
            <Select
              value={organizationId || ""}
              onValueChange={(value) => setValue("organizationId", value === "none" ? "" : value)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an organization (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No organization</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
