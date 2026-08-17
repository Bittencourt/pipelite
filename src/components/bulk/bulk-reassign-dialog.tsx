"use client"

/**
 * The bulk owner reassignment form: one required choice, applied to every selected record.
 *
 * A `Dialog` rather than a confirmation prompt, because this is a form with a required choice rather
 * than a decision the user must answer yes or no to — the same distinction 37-UI-SPEC draws. It also
 * needs no second confirmation step: reassignment is fully reversible by reassigning again, and every
 * record keeps an `audit_log` UPDATE row naming the real actor.
 *
 * THE PICKER IS THE VENDORED `Select`, and that is a resolved, locked deviation from 38-CONTEXT.md.
 * The CRM record picker this product uses elsewhere routes through `searchEntities(entityType)`, and
 * `EntityType` is a four-literal union reused by two PERSISTED columns (`audit_log.entity_type`,
 * `notes.entity_type`) plus a runtime validator, so teaching it to address users would be a schema
 * change. `Select` is already the owner-picking idiom on three of the four surfaces, so a user sets
 * `ownerId` in bulk the same way they set it singly, at the cost of zero new components.
 *
 * THE NO-EMAIL NOTICE IS REQUIRED COPY, NOT A NICETY. The single-record reassign path DOES email a
 * new assignee. A user trained by the rest of the product would therefore reasonably expect a
 * notification here, and bulk sends none by design — a per-record notification would emit up to a
 * hundred emails from one click. Silence would be an implied promise, so the notice sits directly
 * under the field where it cannot be missed.
 *
 * There is deliberately no unassign item. `owner_id` is `text NOT NULL` on all four tables and is how
 * every list scopes visibility, so a bulk unassign would make up to a hundred records unreachable
 * from the surface the user is standing on.
 *
 * The current owner is NOT filtered out of `owners`: a mixed selection has no single current owner,
 * so filtering would be either wrong or per-record. The mutation early-returns idempotently when the
 * owner is unchanged, which is why a same-owner reassign correctly writes no audit row (D-15).
 *
 * Controlled, with no trigger component of its own — the non-definer shape `organization-dialog.tsx`
 * uses. CFUI-01 is a hard boundary: a React element crossing the RSC boundary into a Radix `asChild`
 * slot renders nothing at all, silently.
 */

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface BulkOwnerOption {
  id: string
  name: string
}

export interface BulkReassignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  /**
   * Active users only — `deleted_at IS NULL` AND `status = 'approved'`. This dialog renders whatever
   * it is given, so the predicate is the calling server page's responsibility and is re-validated
   * server-side before the write loop.
   */
  owners: BulkOwnerOption[]
  isReassigning: boolean
  onConfirm: (ownerId: string) => void
}

export function BulkReassignDialog({
  open,
  onOpenChange,
  count,
  owners,
  isReassigning,
  onConfirm,
}: BulkReassignDialogProps) {
  const t = useTranslations("bulk")

  const [ownerId, setOwnerId] = useState<string>("")

  /**
   * Discard a cancelled choice. THE RESET IS KEYED ON THE `open` TRANSITION AND NEVER ON THE
   * `owners` ARRAY: Phase 35 measured that `revalidatePath` re-renders the current client tree
   * regardless of the path argument, so a reset keyed on a server-rebuilt prop can fire mid-submit
   * and clear the choice out from under a request that is already running.
   *
   * This is React's documented adjust-state-when-a-prop-changes pattern rather than an effect,
   * because this repo's React Compiler lint rule (`react-hooks/set-state-in-effect`) makes a
   * synchronous state update inside an effect a build ERROR. The three existing suppressions of that
   * rule are all explicitly logged as deferrals; a brand-new file adding a fourth would be debt
   * created on purpose. The trigger and the guarantee are identical either way — this runs only on
   * the render where `open` actually changed, and `owners` cannot reach it.
   */
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setOwnerId("")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // ESC and an overlay click must not abandon writes that are already in flight.
        if (isReassigning) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reassignDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("reassignDialog.description", { count })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {/*
            A real label, paired to the trigger by id. A placeholder is never an accessible name, and
            the owner Select this composition is modelled on carries an htmlFor pointing at a trigger
            that has no id at all — the one part of that analog not to copy.
          */}
          <Label htmlFor="bulk-owner">{t("reassignDialog.ownerLabel")}</Label>
          <Select
            value={ownerId}
            onValueChange={setOwnerId}
            disabled={isReassigning}
          >
            <SelectTrigger id="bulk-owner">
              <SelectValue placeholder={t("reassignDialog.ownerPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {owners.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {t("reassignDialog.noEmailNotice")}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isReassigning}
          >
            {t("reassignDialog.cancel")}
          </Button>
          <Button
            variant="default"
            onClick={() => onConfirm(ownerId)}
            disabled={!ownerId || isReassigning}
          >
            {isReassigning ? <Loader2 className="size-4 animate-spin" /> : null}
            {isReassigning
              ? t("reassignDialog.reassigning")
              : t("reassignDialog.confirm", { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
