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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { createFieldDefinition, updateFieldDefinition } from "@/app/admin/fields/actions"
import { toast } from "sonner"
import type { EntityType, FieldType } from "@/db/schema"

const fieldTypes: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Checkbox" },
  { value: "single_select", label: "Single Select" },
  { value: "multi_select", label: "Multi Select" },
  { value: "url", label: "URL" },
  { value: "file", label: "File" },
  { value: "lookup", label: "Lookup" },
  { value: "formula", label: "Formula" },
]

const fieldSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["text", "number", "date", "boolean", "single_select", "multi_select", "file", "url", "lookup", "formula"]),
  required: z.boolean(),
  showInList: z.boolean(),
})

type FieldFormData = z.infer<typeof fieldSchema>

interface FieldDefinition {
  id: string
  name: string
  type: FieldType
  required: boolean
  showInList: boolean
  config: unknown
  deletedAt: Date | null
}

interface FieldDialogProps {
  entityType: EntityType
  field?: FieldDefinition | null
  children: React.ReactNode
  onSuccess?: () => void
}

export function FieldDialog({ entityType, field, children, onSuccess }: FieldDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const isEditMode = !!field

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FieldFormData>({
    resolver: zodResolver(fieldSchema),
    defaultValues: {
      name: "",
      type: "text",
      required: false,
      showInList: false,
    },
  })

  const fieldType = watch("type")

  useEffect(() => {
    if (open && field) {
      reset({
        name: field.name,
        type: field.type,
        required: field.required,
        showInList: field.showInList,
      })
    } else if (open) {
      reset({
        name: "",
        type: "text",
        required: false,
        showInList: false,
      })
    }
  }, [open, field, reset])

  const onSubmit = async (data: FieldFormData) => {
    setIsLoading(true)
    try {
      const result = isEditMode
        ? await updateFieldDefinition(field.id, data)
        : await createFieldDefinition({ ...data, entityType, config: null })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(isEditMode ? "Field updated!" : "Field created!")
      setOpen(false)
      onSuccess?.()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Field" : "Add Custom Field"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update the field configuration." : "Create a new custom field."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Field Name</Label>
            <Input
              id="name"
              placeholder="e.g., Industry"
              {...register("name")}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Field Type</Label>
            <Select
              value={fieldType}
              onValueChange={(value) => setValue("type", value as FieldType)}
              disabled={isLoading || isEditMode}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {fieldTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="required"
              checked={watch("required")}
              onCheckedChange={(checked) => setValue("required", !!checked)}
              disabled={isLoading}
            />
            <Label htmlFor="required" className="font-normal">Required field</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="showInList"
              checked={watch("showInList")}
              onCheckedChange={(checked) => setValue("showInList", !!checked)}
              disabled={isLoading}
            />
            <Label htmlFor="showInList" className="font-normal">Show in list view</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditMode ? "Save Changes" : "Create Field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
