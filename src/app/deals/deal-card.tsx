"use client"

import { useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/currency"
import { Pencil, Trash2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { useFormatter, useTranslations } from 'next-intl'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar"

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export interface Deal {
  id: string
  title: string
  value: string | null
  stageId: string
  position: string
  ownerId: string
  organizationId: string | null
  personId: string | null
  expectedCloseDate?: Date | null
  organization: { id: string; name: string } | null
  person: { id: string; firstName: string; lastName: string } | null
  assignees?: { userId: string; user: { name: string | null; email: string } }[]
}

interface DealCardProps {
  deal: Deal
  onEdit?: (deal: Deal) => void
  isOverlay?: boolean
  /**
   * The KEYBOARD CURSOR, not bulk selection. Owned by `useKanbanKeyboard`, and it is what drives
   * both `data-selected` (which carries a GLOBAL primary box-shadow from `globals.css`) and the
   * offset primary outline treatment applied in the class list below. Bulk selection is a separate
   * prop on purpose: overloading this one would make the two states indistinguishable.
   */
  isSelected?: boolean
  isBulkSelected?: boolean
  onBulkSelectChange?: (id: string, next: boolean) => void
  "data-kanban-col"?: number
  "data-kanban-item"?: number
}

export function DealCard({ deal, onEdit, isOverlay, isSelected, isBulkSelected, onBulkSelectChange, "data-kanban-col": kanbanCol, "data-kanban-item": kanbanItem }: DealCardProps) {
  const format = useFormatter()
  const t = useTranslations('deals')
  const tCommon = useTranslations('common')
  const tBulk = useTranslations('bulk')
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

  const formattedValue = deal.value ? formatCurrency(parseFloat(deal.value)) : t('noValue')

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
          "border rounded-lg p-3 cursor-pointer transition-all",
          /*
            THE BULK-SELECTED TREATMENT IS A TINT, NOT A FOURTH RING, and that is a legibility
            requirement rather than a taste. Both primary ring treatments below are already taken —
            one by the expanded state, one by the keyboard cursor — and a single card can legitimately
            be keyboard-focused AND expanded AND bulk-selected at the same moment, so a third ring
            would be indistinguishable from the two that already mean something else (T-38-42). A 5%
            primary wash replacing the card surface composes cleanly UNDER both rings instead of
            competing with them. `bg-muted` would have been invisible here: a card sits on a
            `bg-muted/50` column track. `data-selected` is deliberately NOT set from this state — that
            attribute is the keyboard cursor and carries a global primary box-shadow.
          */
          isBulkSelected ? "bg-primary/5" : "bg-card",
          isDragging && "opacity-50",
          isExpanded && "ring-2 ring-primary",
          isSelected && !isExpanded && "ring-2 ring-primary ring-offset-2"
        )}
        data-selected={isSelected || undefined}
        data-kanban-col={kanbanCol}
        data-kanban-item={kanbanItem}
        onClick={() => setIsExpanded(!isExpanded)}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-start justify-between gap-2">
          {/*
            THE BULK SELECTION CHECKBOX, AND ITS THREE EVENT STOPS ARE ALL REQUIRED — each one
            prevents a DIFFERENT concrete failure, so none of them is defensive duplication:

              click     — the card root toggles `isExpanded`. Without the stop, ticking a box also
                          expands the card.
              pointer   — dnd-kit's `listeners` are spread on the card root and `PointerSensor` uses
                          `activationConstraint: { distance: 5 }`. A clean click will not start a
                          drag, but a 6px pointer wobble on the box would drag the deal into another
                          stage — a selection gesture silently becoming a stage move (T-38-40).
              key       — the root also carries `{...attributes}` from `useSortable`: `role="button"`,
                          `tabIndex=0`, and the `KeyboardSensor` binding. Space on a focused card
                          starts a KEYBOARD DRAG, and Space is also how a keyboard user toggles a
                          checkbox. Without this stop, keyboard selection is IMPOSSIBLE, which makes
                          it an accessibility requirement rather than an optimisation (T-38-41).

            First child of the existing title row, neither floated nor absolutely positioned, so it
            can never overlap the title. The padding buys a 32px pointer target; the negative margin
            hands the layout back, so no card grows by 16px.

            The nesting — an interactive control inside a `role="button"` — is a PRE-EXISTING property
            of this card, not something introduced here: the expanded block below already nests two
            buttons and a link inside the same root. Moving the box outside the draggable node would
            break the drag target, so it stays.
          */}
          <div
            className="flex items-center justify-center p-2 -m-2"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={!!isBulkSelected}
              onCheckedChange={(v) => onBulkSelectChange?.(deal.id, !!v)}
              aria-label={tBulk('selectRow', { name: deal.title })}
            />
          </div>
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
            {deal.assignees && deal.assignees.length > 0 && (
              <AvatarGroup className="mt-1.5">
                {deal.assignees.slice(0, 3).map((a) => (
                  <Avatar key={a.userId} size="sm" title={a.user.name || a.user.email}>
                    <AvatarFallback>{getInitials(a.user.name, a.user.email)}</AvatarFallback>
                  </Avatar>
                ))}
                {deal.assignees.length > 3 && (
                  <AvatarGroupCount className="text-xs">
                    +{deal.assignees.length - 3}
                  </AvatarGroupCount>
                )}
              </AvatarGroup>
            )}
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
                <span className="font-medium">{t('expectedCloseDate')}:</span>{" "}
                {format.dateTime(new Date(deal.expectedCloseDate), {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </div>
            )}
            <div className="flex items-center gap-2 pt-2">
              <Link href={`/deals/${deal.id}`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  {t('viewDetails')}
                </Button>
              </Link>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  if (onEdit) {
                    onEdit(deal)
                  } else {
                    setEditDialogOpen(true)
                  }
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-3 w-3" />
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
            stageId: deal.stageId,
            organizationId: deal.organizationId,
            personId: deal.personId,
          }}
          stages={[]}
          // Refresh only. The dialog closes itself through onOpenChange; closing from
          // here is what broke the note-failure path this contract now protects.
          onRecordSaved={() => {
            window.location.reload()
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDeal')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deal.title}&quot;? You can restore it from Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
