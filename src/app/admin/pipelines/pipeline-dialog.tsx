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
import { Loader2 } from "lucide-react"
import { createPipeline, updatePipeline } from "./actions"
import { toast } from "sonner"

const pipelineSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
})

type PipelineFormData = z.infer<typeof pipelineSchema>

interface Pipeline {
  id: string
  name: string
}

interface PipelineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline?: Pipeline | null
  onSuccess: () => void
}

export function PipelineDialog({
  open,
  onOpenChange,
  pipeline,
  onSuccess,
}: PipelineDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const isEditMode = !!pipeline

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PipelineFormData>({
    resolver: zodResolver(pipelineSchema),
    defaultValues: {
      name: "",
    },
  })

  // Reset form when pipeline prop changes or dialog opens
  useEffect(() => {
    if (open) {
      if (pipeline) {
        reset({
          name: pipeline.name,
        })
      } else {
        reset({
          name: "",
        })
      }
    }
  }, [open, pipeline, reset])

  const onSubmit = async (data: PipelineFormData) => {
    setIsLoading(true)
    try {
      const result = isEditMode
        ? await updatePipeline(pipeline.id, data)
        : await createPipeline(data)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(isEditMode ? "Pipeline updated!" : "Pipeline created!")
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Pipeline" : "Create Pipeline"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the pipeline name below."
              : "Enter a name for the new pipeline. Default stages will be created automatically."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Sales Pipeline"
              {...register("name")}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
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
              {isEditMode ? "Save Changes" : "Create Pipeline"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
