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
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { createStage, updateStage } from "../actions"
import { toast } from "sonner"
import { STAGE_COLORS, type StageColor } from "@/lib/stage-colors"
import { cn } from "@/lib/utils"

const stageSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name must be 50 characters or less"),
  description: z.string().max(200, "Description must be 200 characters or less").optional(),
  color: z.enum(Object.keys(STAGE_COLORS) as [StageColor, ...StageColor[]]),
  type: z.enum(["open", "won", "lost"]),
})

type StageFormData = z.infer<typeof stageSchema>

interface StageDialogProps {
  mode: "create" | "edit"
  pipelineId: string
  stage?: {
    id: string
    name: string
    description: string | null
    color: StageColor
    type: "open" | "won" | "lost"
  }
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTypes: {
    hasWon: boolean
    hasLost: boolean
  }
  onSuccess: () => void
}

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: StageColor
  onChange: (color: StageColor) => void
  disabled?: boolean
}) {
  const colors = Object.keys(STAGE_COLORS) as StageColor[]

  return (
    <div className="flex gap-2 flex-wrap">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          disabled={disabled}
          className={cn(
            "w-8 h-8 rounded-full border-2 transition-all",
            STAGE_COLORS[color].bg,
            value === color
              ? "ring-2 ring-offset-2 ring-primary border-primary"
              : "border-transparent hover:scale-110",
            disabled && "cursor-not-allowed opacity-50"
          )}
          title={color.charAt(0).toUpperCase() + color.slice(1)}
        />
      ))}
    </div>
  )
}

export function StageDialog({
  mode,
  pipelineId,
  stage,
  open,
  onOpenChange,
  existingTypes,
  onSuccess,
}: StageDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const isEditMode = mode === "edit"

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StageFormData>({
    resolver: zodResolver(stageSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "blue",
      type: "open",
    },
  })

  const selectedColor = watch("color")
  const selectedType = watch("type")

  // Reset form when dialog opens or stage changes
  useEffect(() => {
    if (open) {
      if (stage) {
        reset({
          name: stage.name,
          description: stage.description || "",
          color: stage.color,
          type: stage.type,
        })
      } else {
        reset({
          name: "",
          description: "",
          color: "blue",
          type: "open",
        })
      }
    }
  }, [open, stage, reset])

  const onSubmit = async (data: StageFormData) => {
    setIsLoading(true)
    try {
      const result = isEditMode
        ? await updateStage(stage!.id, {
            name: data.name,
            description: data.description || undefined,
            color: data.color,
            type: data.type,
          })
        : await createStage({
            pipelineId,
            name: data.name,
            description: data.description || undefined,
            color: data.color,
            type: data.type,
          })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(isEditMode ? "Stage updated!" : "Stage created!")
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

  // Determine if won/lost options should be disabled
  const canSelectWon = !existingTypes.hasWon || (isEditMode && stage?.type === "won")
  const canSelectLost = !existingTypes.hasLost || (isEditMode && stage?.type === "lost")

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Stage" : "Create Stage"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the stage details below."
              : "Configure the new stage for your pipeline."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g., Qualified"
              {...register("name")}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description for this stage"
              {...register("description")}
              disabled={isLoading}
              className="min-h-[80px]"
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <ColorPicker
              value={selectedColor}
              onChange={(color) => setValue("color", color)}
              disabled={isLoading}
            />
            {errors.color && (
              <p className="text-sm text-destructive">{errors.color.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">
              Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedType}
              onValueChange={(value: "open" | "won" | "lost") =>
                setValue("type", value)
              }
              disabled={isLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="won" disabled={!canSelectWon}>
                  Won
                  {!canSelectWon && " (already exists)"}
                </SelectItem>
                <SelectItem value="lost" disabled={!canSelectLost}>
                  Lost
                  {!canSelectLost && " (already exists)"}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only one Won/Lost stage allowed per pipeline
            </p>
            {errors.type && (
              <p className="text-sm text-destructive">{errors.type.message}</p>
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
              {isEditMode ? "Save Changes" : "Create Stage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
