"use client"

import { useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/currency"
import { Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { DealDialog } from "./deal-dialog"
import { deleteDeal } from "./actions"
import { toast } from "sonner"

export interface Deal {
  id: string
  title: string
  value: string | null
  stageId: string
  position: string
  organizationId: string | null
  personId: string | null
  expectedCloseDate?: Date | null
  notes?: string | null
  organization: { id: string; name: string } | null
  person: { id: string; firstName: string; lastName: string } | null
}

interface DealCardProps {
  deal: Deal
  onEdit?: (deal: Deal) => void
  isOverlay?: boolean
}

export function DealCard({ deal, onEdit, isOverlay }: DealCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const formattedValue = deal.value ? formatCurrency(parseFloat(deal.value)) : "No Value"

  const displayName = deal.organization?.name || 
    (deal.person ? `${deal.person.firstName} ${deal.person.lastName}` : null)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteDeal(deal.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Deal deleted")
      setDeleteDialogOpen(false)
      // Refresh the page
      window.location.reload()
    } catch {
      toast.error("Failed to delete deal")
    } finally {
      setIsDeleting(false)
    }
  }

  // Overlay mode - just render the card without interactivity
  if (isOverlay) {
    return (
      <div className="bg-card border rounded-lg p-3 shadow-lg w-[256px]">
        <div className="font-medium text-sm truncate">{deal.title}</div>
        {displayName && (
          <div className="text-xs text-muted-foreground truncate mt-1">
            {displayName}
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-1">
          {formattedValue}
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "bg-card border rounded-lg p-3 cursor-pointer transition-all",
          isDragging && "opacity-50",
          isExpanded && "ring-2 ring-primary"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate" title={deal.title}>
              {deal.title}
            </div>
            {displayName && (
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {displayName}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">
              {formattedValue}
            </div>
          </div>
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t space-y-2" onClick={e => e.stopPropagation()}>
            {deal.expectedCloseDate && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Expected Close:</span>{" "}
                {new Date(deal.expectedCloseDate).toLocaleDateString()}
              </div>
            )}
            {deal.notes && (
              <div className="text-xs text-muted-foreground line-clamp-2">
                {deal.notes}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (onEdit) {
                    onEdit(deal)
                  } else {
                    setEditDialogOpen(true)
                  }
                }}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Dialog - only if onEdit not provided */}
      {!onEdit && (
        <DealDialog
          mode="edit"
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          deal={{
            id: deal.id,
            title: deal.title,
            value: deal.value ? parseFloat(deal.value) : null,
            expectedCloseDate: deal.expectedCloseDate || null,
            notes: deal.notes || null,
            stageId: deal.stageId,
            organizationId: deal.organizationId,
            personId: deal.personId,
          }}
          organizations={[]}
          people={[]}
          stages={[]}
          onSuccess={() => {
            setEditDialogOpen(false)
            window.location.reload()
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deal.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
