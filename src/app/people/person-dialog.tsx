"use client"

import { useState, useEffect, useRef, type ChangeEvent } from "react"
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
import { DuplicateWarning } from "@/components/dedup/duplicate-warning"
import type { CertainMatch } from "@/lib/dedup/matching"

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
  /**
   * REFRESH ONLY — THIS CALLBACK MUST NEVER CLOSE THE DIALOG.
   *
   * It means "the record behind this dialog changed, re-read your data", not "we are
   * done". The dialog decides for itself when it is done and closes through
   * `onOpenChange(false)`. A call site that also flips its `open` state here defeats the
   * one path that must stay open: a create whose record landed but whose note did not
   * (T-35-31 — see `createdRecordIdRef` below). The prop is deliberately no longer named
   * for success alone: a name that said only "it worked" is what invited the close.
   */
  onRecordSaved: () => void
}

export function PersonDialog({
  open,
  onOpenChange,
  person,
  onRecordSaved,
}: PersonDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const isEditMode = !!person
  const tNotes = useTranslations("notes")

  /**
   * The FULLY-QUALIFIED key path, through the root translator rather than a `dedup.warning`
   * namespace, so the W-6 source gate's anti-vacuity half has something to read. See the identical
   * comment in `src/app/organizations/organization-dialog.tsx`.
   */
  const tRoot = useTranslations()

  /**
   * THE CERTAIN DUPLICATES THE SERVER REPORTED FOR THE CURRENT DRAFT (DEDUP-01 / SC-1).
   *
   * Non-empty means the advisory is showing — it drives both the `<DuplicateWarning>` above the
   * fields and the submit button's label (W-4).
   */
  const [duplicates, setDuplicates] = useState<CertainMatch[]>([])

  /**
   * A WARNING MUST NEVER OUTLIVE THE DRAFT IT DESCRIBES.
   *
   * One key for the dialog "session": it changes when the dialog opens, when it closes by ANY route
   * (including a parent that flips `open` directly instead of going through `handleClose`), and when
   * it is re-pointed at a different record.
   *
   * REACT'S ADJUST-STATE-ON-PROP-CHANGE PATTERN, DELIBERATELY NOT A `useEffect` THAT CALLS
   * `setState`: `react-hooks/set-state-in-effect` is an ERROR in this repo. The extra render this
   * schedules happens before the browser paints, so the stale warning is never visible. The source
   * gate for this file asserts no `set*` call appears inside any effect body.
   */
  const dialogSessionKey = `${open ? "open" : "closed"}:${person?.id ?? "new"}`
  const [warnedSessionKey, setWarnedSessionKey] = useState(dialogSessionKey)
  if (warnedSessionKey !== dialogSessionKey) {
    setWarnedSessionKey(dialogSessionKey)
    setDuplicates([])
  }

  /**
   * W-10 — the advisory clears the moment the user edits a field it was computed from.
   *
   * The updater returns the SAME array reference when there is nothing to clear, so React bails out
   * of the re-render and this costs nothing on the overwhelmingly common keystroke.
   */
  const clearDuplicateWarning = () => {
    setDuplicates((current) => (current.length === 0 ? current : []))
  }

  /**
   * THE TYPED TEXT IS SACRED (T-35-31), AND THE RECORD MUST NOT BE CREATED TWICE.
   *
   * The create path writes the record first and its first note second. When the record
   * lands and the note does not, this holds the id of the record that already exists. Its
   * presence turns the next submit into an UPDATE of that record rather than a second
   * CREATE, which is what lets the dialog stay open — and staying open is the only thing
   * that keeps the user's typed note, which may be an arbitrarily long paste, recoverable.
   *
   * A ref and not state, deliberately: the reset-on-open effect below has to read it, and
   * a state value would have to be an effect dependency, so setting it would re-run the
   * effect and `reset()` away the very draft it exists to protect.
   *
   * Lifecycle — a create must never silently become an update of an unrelated record:
   *   set    on the create branch, the moment the record exists — before the note is
 *          even attempted, because the create action's own `revalidatePath` refresh
 *          reaches the client tree within milliseconds and has to find it armed (WR-12)
   *   read   only on the create branch of `onSubmit`
   *   clear  on close (handleClose), on `open` going false by any other route, on a fresh
   *          open, and whenever the dialog is pointed at an edit target
   */
  const createdRecordIdRef = useRef<string | null>(null)

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
    if (!open) {
      // Any close ends the pending create, including a parent that flips `open` directly
      // instead of going through handleClose.
      createdRecordIdRef.current = null
      return
    }

    if (person) {
      // An edit target can never inherit a create's half-finished record id.
      createdRecordIdRef.current = null
      // No notes value is seeded here: the edit dialog has no Notes field, and the
      // legacy column is dormant. Notes are written and edited in the record timeline.
      reset({
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email || "",
        phone: person.phone || "",
        organizationId: person.organizationId || "",
      })
      return
    }

    // A create whose record already landed: the dialog is deliberately still open and
    // the textarea still holds the draft. TWO refreshes re-render the parent while it is.
    // The first is fired by the create action itself — `revalidatePath` runs before the
    // action returns, and the resulting server render reaches the client tree within
    // milliseconds of the `await`, i.e. while the note round trip is still in flight
    // (measured, WR-12). The second is the one the failure branch fires afterwards. A
    // changed prop identity from either must not wipe the form out from under the user
    // (T-35-31). Cleared on close, so the next open still starts clean.
    if (createdRecordIdRef.current) return

    reset({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      notes: "",
      organizationId: "",
    })
  }, [open, person, reset])

  /**
   * Register a field the duplicate check COMPARES, so editing it clears the advisory (W-10).
   *
   * Four fields for a person against the organization's two: the e-mail decides the *certain* tier
   * and both name parts build the normalized name the classifier agrees on, while the phone is a
   * conjunct of the *likely* tier the scan reports. `register`'s own `onChange` runs first and
   * unconditionally, so validation and dirty tracking are unchanged.
   */
  const registerComparedField = (
    field: "firstName" | "lastName" | "email" | "phone"
  ) => {
    const registered = register(field)
    return {
      ...registered,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        registered.onChange(event)
        clearDuplicateWarning()
      },
    }
  }

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
        // A retry after a failed note updates the record that already exists instead of
        // creating a second one, so any field the user changed while the dialog stayed
        // open is still saved.
        let recordId = createdRecordIdRef.current
        if (recordId) {
          const result = await updatePerson(recordId, record)
          if (!result.success) {
            toast.error(result.error)
            return
          }
        } else {
          const result = await createPerson(
            record,
            // W-4 — THE SECOND SUBMIT CARRIES THE CONFIRMATION. The advisory is already on screen,
            // so the user pressing the (relabelled) submit button means "create anyway"; the server
            // must skip the check, because re-running it would produce the same warning and the
            // user could never get past it. The first submit sends no options at all.
            duplicates.length > 0 ? { confirmDuplicate: true } : undefined
          )
          if (!result.success) {
            if ("duplicates" in result) {
              // W-2 — NOTHING WAS CREATED, SO NOTHING IS TORN DOWN. The dialog stays open, the form
              // is NOT reset, and `createdRecordIdRef` stays null: there is no record to update on
              // the next submit. This branch must never become the one path that loses a draft
              // (T-35-31 / WR-12). The advisory is rendered in place, above the fields.
              setDuplicates(result.duplicates)
              return
            }
            toast.error(result.error)
            return
          }
          recordId = result.id
          // Arm the reset guard the instant the record exists, and not one await later.
          // `createPerson` calls `revalidatePath` before it returns, and that refresh
          // lands on the client a few milliseconds after this await resolves — well
          // inside the `addNote` round trip below. Every effect whose dependency list
          // holds a freshly built prop re-runs then; `activity-dialog` depends on the
          // `activityTypes` array that its page rebuilds on every server render. An
          // unarmed guard at that moment resets the form and destroys the draft this
          // whole path exists to protect (T-35-31, WR-12).
          createdRecordIdRef.current = recordId
        }

        // The record already exists. A failed note is surfaced, never rolled back.
        const draft = (data.notes ?? "").trim()
        if (draft) {
          let noteSaved = false
          try {
            const noteResult = await addNote("person", recordId, draft)
            noteSaved = noteResult.success
          } catch {
            noteSaved = false
          }

          if (!noteSaved) {
            // Do NOT close, do NOT reset, and do NOT claim success: the note is the one
            // thing that did not happen, and the draft is the thing being protected.
            // `onRecordSaved` still runs because the record itself did land, so the list
            // behind the dialog must not go stale — and it is contractually forbidden
            // from closing this dialog, which is what makes the draft survive.
            //
            // The guard is NOT armed here. It was armed the moment the record existed,
            // on the create branch above, because the refresh that action fires does not
            // wait for this branch to be reached (WR-12).
            toast.error(tNotes("error.recordCreatedNoteFailed"))
            onRecordSaved()
            return
          }
        }
      }

      toast.success(isEditMode ? "Person updated!" : "Person created!")
      onRecordSaved()
      handleClose()
    } catch {
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    createdRecordIdRef.current = null
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
          {/* W-1 — INLINE, DIRECTLY ABOVE THE FIELDS. Renders nothing while `duplicates` is empty.
              Not a nested dialog and not a toast: a second modal over a modal at 320px has nowhere
              to go, and a toast dismissed by timeout is an advisory the user can miss. */}
          <DuplicateWarning matches={duplicates} entityType="person" />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                placeholder="John"
                {...registerComparedField("firstName")}
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
                {...registerComparedField("lastName")}
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
              {...registerComparedField("email")}
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
              {...registerComparedField("phone")}
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
            {/* W-4 / W-9 — THE EXISTING SUBMIT BUTTON, RELABELLED. Still the single
                primary-filled control on this surface, and still showing its EXISTING loading
                state while the check is in flight: the check is part of the submit, and giving it
                its own "Checking for duplicates…" step would invite the user to think it is
                optional. */}
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {duplicates.length > 0
                ? tRoot("dedup.warning.createAnyway")
                : isEditMode
                  ? "Save Changes"
                  : "Create Person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
