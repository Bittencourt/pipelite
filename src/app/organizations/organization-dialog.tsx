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
import { createOrganization, updateOrganization } from "./actions"
import { addNote } from "@/app/notes/actions"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { DuplicateWarning } from "@/components/dedup/duplicate-warning"
import type { CertainMatch } from "@/lib/dedup/matching"

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
  /**
   * The admin-configured organization identity custom field LABELS this dialog collects at create
   * time — resolved on the server, since this file cannot read `app_settings` or the field
   * definitions, and empty when nothing is configured.
   *
   * WHY THESE ARE NOT `react-hook-form` FIELDS. `zodResolver` strips keys the schema does not
   * declare — the same trap `actions.ts` records for `confirmDuplicate` — and the schema cannot
   * declare labels that are per-installation data. Beyond that, react-hook-form reads a dot in a
   * field name as a path into nested state, and these names are user-authored: a field called
   * `CNPJ / CPF` or `Contato.email` would silently register somewhere else entirely. They are held
   * in their own state object, keyed by label, and assembled into the create payload directly.
   *
   * OPTIONAL DELIBERATELY. The other mount site,
   * `src/app/organizations/[id]/organization-detail-client.tsx`, always passes an `organization` and
   * is therefore edit-only, and these inputs are create-only — so the default is not a degradation
   * there and that file needs no change.
   */
  identityFieldNames?: string[]
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

export function OrganizationDialog({
  open,
  onOpenChange,
  organization,
  identityFieldNames = [],
  onRecordSaved,
}: OrganizationDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const isEditMode = !!organization
  const tNotes = useTranslations("notes")

  /**
   * The FULLY-QUALIFIED key path, through the root translator rather than a `dedup.warning`
   * namespace. The W-6 source gate in
   * `src/components/dedup/__tests__/duplicate-warning-wiring.test.ts` asserts that `dedup.merge.`
   * appears ZERO times in this file and `dedup.warning.` at least once — and a namespaced
   * `t("createAnyway")` would leave the anti-vacuity half of that gate with nothing to read, which
   * is how a negative assertion becomes satisfiable by an empty file.
   */
  const tRoot = useTranslations()

  /**
   * THE CERTAIN DUPLICATES THE SERVER REPORTED FOR THE CURRENT DRAFT (DEDUP-01 / SC-1).
   *
   * Non-empty means the advisory is showing. It is state and not a ref because the render depends
   * on it — both the `<DuplicateWarning>` above the fields and the submit button's label (W-4).
   */
  const [duplicates, setDuplicates] = useState<CertainMatch[]>([])

  /**
   * THE TYPED IDENTITY VALUES, KEYED BY FIELD LABEL — the create-time half of DEDUP-01 for
   * organizations.
   *
   * These are what make the organization certain tier reachable at all: `draftHasIdentityValue`
   * gates the whole check on the draft populating a configured identity field, and until this
   * dialog collected one it could never pass, so the check returned no matches for every submission
   * however the admin had configured it (D-39-01).
   *
   * Its own state and not part of the form, for the reasons recorded on `identityFieldNames`.
   */
  const [identityValues, setIdentityValues] = useState<Record<string, string>>({})

  /**
   * A WARNING MUST NEVER OUTLIVE THE DRAFT IT DESCRIBES, AND NEITHER MAY THE VALUES IT WAS
   * COMPUTED FROM.
   *
   * One key for the dialog "session": it changes when the dialog opens, when it closes by ANY route
   * (including a parent that flips `open` directly instead of going through `handleClose`), and
   * when it is re-pointed at a different record. Any of those means the draft the advisory was
   * about is gone, and a warning naming records that no longer relate to what is on screen is worse
   * than no warning at all.
   *
   * REACT'S ADJUST-STATE-ON-PROP-CHANGE PATTERN, DELIBERATELY NOT A `useEffect` THAT CALLS
   * `setState`: `react-hooks/set-state-in-effect` is an ERROR in this repo and three Phase 38 plans
   * hit it independently. The extra render this schedules happens before the browser paints, so the
   * stale warning is never visible. The source gate for this file asserts no `set*` call appears
   * inside any effect body, which is why the mechanism has to be here rather than there.
   *
   * THE IDENTITY VALUES RIDE THE SAME KEY, and not merely for symmetry: a tax id typed into one
   * draft and left in state would be submitted with the NEXT organization the user creates, quietly
   * attaching one company's identifier to another and making it a certain match for a record it has
   * nothing to do with. They are cleared here and in `handleClose` for that reason.
   */
  const dialogSessionKey = `${open ? "open" : "closed"}:${organization?.id ?? "new"}`
  const [warnedSessionKey, setWarnedSessionKey] = useState(dialogSessionKey)
  if (warnedSessionKey !== dialogSessionKey) {
    setWarnedSessionKey(dialogSessionKey)
    setDuplicates([])
    setIdentityValues({})
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
    if (!open) {
      // Any close ends the pending create, including a parent that flips `open` directly
      // instead of going through handleClose.
      createdRecordIdRef.current = null
      return
    }

    if (organization) {
      // An edit target can never inherit a create's half-finished record id.
      createdRecordIdRef.current = null
      // No notes value is seeded here: the edit dialog has no Notes field, and the
      // legacy column is dormant. Notes are written and edited in the record timeline.
      reset({
        name: organization.name,
        website: organization.website || "",
        industry: organization.industry || "",
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
      name: "",
      website: "",
      industry: "",
      notes: "",
    })
  }, [open, organization, reset])

  /**
   * Register a field the duplicate check COMPARES, so editing it clears the advisory (W-10).
   *
   * The clear happens in the field's own change handler rather than in an effect watching the form
   * — see the comment on `dialogSessionKey` for why an effect is not available. `register`'s own
   * `onChange` is called first and unconditionally, so react-hook-form's validation and dirty
   * tracking behave exactly as they did before this wrapper existed.
   */
  const registerComparedField = (field: "name" | "website") => {
    const registered = register(field)
    return {
      ...registered,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        registered.onChange(event)
        clearDuplicateWarning()
      },
    }
  }

  /**
   * The identity inputs' own change handler — W-10 for a field that is not a form field.
   *
   * W-10 APPLIES HERE BECAUSE A CONFIGURED IDENTITY FIELD IS A COMPARED FIELD FOR ORGANIZATIONS:
   * `classifyOrganizationMatch` calls a pair certain on an equal normalized name AND an equal
   * identity value, so an advisory left standing while the user corrects the identifier it was
   * computed from is describing a comparison that no longer exists. Same rule and same reason as
   * `registerComparedField` above; a separate handler only because these inputs are not registered.
   */
  const handleIdentityChange =
    (field: string) => (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target
      setIdentityValues((current) => ({ ...current, [field]: value }))
      clearDuplicateWarning()
    }

  /**
   * The `customFields` blob for the create payload — TRIMMED, and empty entries OMITTED.
   *
   * The trim is not cosmetic. `writeOrgIdentityFields` trims its labels because an untrimmed one
   * "would look configured while matching nothing", and the same is exactly true of a value: a
   * whitespace-only entry would make `draftHasIdentityValue` pass, buy the round trip, and then
   * match nothing — while also persisting a blank identifier onto the record. Omitting empties is
   * what keeps an untouched input out of the payload entirely.
   */
  const collectIdentityCustomFields = (): Record<string, string> => {
    const collected: Record<string, string> = {}

    for (const field of identityFieldNames) {
      const value = (identityValues[field] ?? "").trim()
      if (value) collected[field] = value
    }

    return collected
  }

  const onSubmit = async (data: OrganizationFormData) => {
    setIsLoading(true)
    try {
      // The legacy notes column is never part of this payload, on either path.
      const record = {
        name: data.name,
        website: data.website,
        industry: data.industry,
      }

      if (isEditMode) {
        const result = await updateOrganization(organization.id, record)
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
          const result = await updateOrganization(recordId, record)
          if (!result.success) {
            toast.error(result.error)
            return
          }
        } else {
          /*
            THE CONDITIONAL SPREAD IS LOAD-BEARING, not a tidiness. With the setting unconfigured,
            or with every identity input left blank, the payload is BYTE-IDENTICAL to the one this
            dialog sent before the inputs existed — no `customFields` key at all, so
            `createOrganizationMutation` receives `undefined` and defaults it exactly as it did
            before. That is what makes "unconfigured behaviour is unchanged" literally true rather
            than approximately true.

            The blob is attached to the CREATE call only. Custom fields on a persisted record are
            written by inline edit on the detail page, and a create dialog that also wrote them on
            the retry-after-a-failed-note path would be a second writer nobody owns.
          */
          const identityCustomFields = collectIdentityCustomFields()
          const result = await createOrganization(
            Object.keys(identityCustomFields).length > 0
              ? { ...record, customFields: identityCustomFields }
              : record,
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
              // the next submit. This branch must never become the one path that loses a draft,
              // which is what `organization-dialog` already goes to considerable lengths to protect
              // (T-35-31 / WR-12). The advisory is rendered in place, above the fields.
              setDuplicates(result.duplicates)
              return
            }
            toast.error(result.error)
            return
          }
          recordId = result.id
          // Arm the reset guard the instant the record exists, and not one await later.
          // `createOrganization` calls `revalidatePath` before it returns, and that refresh
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
            const noteResult = await addNote("organization", recordId, draft)
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

      toast.success(isEditMode ? "Organization updated!" : "Organization created!")
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
    setIdentityValues({})
    createdRecordIdRef.current = null
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
          {/* W-1 — INLINE, DIRECTLY ABOVE THE FIELDS. Renders nothing while `duplicates` is empty.
              Not a nested dialog and not a toast: a second modal over a modal at 320px has nowhere
              to go, and a toast dismissed by timeout is an advisory the user can miss. */}
          <DuplicateWarning matches={duplicates} entityType="organization" />

          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Acme Corporation"
              {...registerComparedField("name")}
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
              {...registerComparedField("website")}
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

          {/* THE CONFIGURED IDENTITY FIELDS — CREATE ONLY, AND ONLY WHEN CONFIGURED.
              Renders nothing at all when the admin has configured nothing, which is the whole of
              the graceful degradation this surface owes an unconfigured install.

              Create only, because on a persisted record these same fields are edited through
              `CustomFieldsSection` on the detail page, and two writers of one blob is how a value
              gets silently overwritten by a form that never loaded it.

              THE LABEL IS THE USER-AUTHORED FIELD NAME, VERBATIM AND UNTRANSLATED — UI-SPEC M-4's
              rule for every custom field, which `describeField` already implements for the merge
              picker. It is DATA, not copy, so it adds no hardcoded literal in any language. And no
              placeholder: a placeholder WOULD be copy, in exactly one language. */}
          {!isEditMode && identityFieldNames.length > 0 && (
            <>
              {identityFieldNames.map((fieldName, index) => (
                <div key={fieldName} className="space-y-2">
                  <Label htmlFor={`org-identity-${index}`}>{fieldName}</Label>
                  <Input
                    id={`org-identity-${index}`}
                    value={identityValues[fieldName] ?? ""}
                    onChange={handleIdentityChange(fieldName)}
                    disabled={isLoading}
                  />
                </div>
              ))}
            </>
          )}

          {/* Create only. The text becomes the record's first timeline note, never a
              legacy column value. Editing happens in the timeline on the detail page. */}
          {!isEditMode && (
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
                  : "Create Organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
