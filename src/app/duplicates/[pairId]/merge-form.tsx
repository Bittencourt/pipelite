"use client"

/**
 * THE MERGE SCREEN'S INTERACTIVE SURFACE — 39-UI-SPEC M-1 through M-9.
 *
 * A STACKED PER-FIELD OPTION LIST, NEVER A SIDE-BY-SIDE COMPARISON OF TWO RECORDS (M-1, and the
 * UI-SPEC's resolved discretion item). The reasons are measured rather than aesthetic: the usable
 * width at a 320px viewport in this app is 241px, which gives each of two columns about 112px, and
 * an organization name in this dataset looks like "CONDOMINIO EDIFICIO RESIDENCIAL …". The second
 * reason is viewport-independent and hurts at 1920px too — with a dozen fields, column headers
 * scroll away, so a user answering field 12 has lost the only thing that said which column was
 * which, and picking the wrong record's value is a silent, permanent data error. Here EVERY option
 * carries its own record-name caption, so no choice depends on a header.
 *
 * The two options OF ONE FIELD may sit two-up from `sm` (640px) upwards. That is a two-up of one
 * question's two answers, not a comparison of two records, and the breakpoint prefix on that grid
 * is not optional — `__tests__/merge-form-wiring.test.ts` asserts the absence of an unprefixed
 * two-column grid anywhere in this file (R-3).
 *
 * WHAT THE SERVER DECIDED AND THIS FILE ONLY DISPLAYS. The comparable field set, which of the
 * three sections each field falls into, the pre-selection for each field, and the display form of
 * every value all arrive as props from `page.tsx`. This component computes no field set and
 * formats no stored value. That is what makes plan 39-02's rule enforceable — "a choice key the
 * server did not compute is dropped" — and it is why `buildMergeFieldGroups` and
 * `resolveMergeDefaults` appear nowhere below.
 *
 * BOTH ORIENTATIONS ARRIVE, AND THAT IS WHY THE SURVIVOR TOGGLE NEEDS NO RECOMPUTATION HERE.
 * Which section a field belongs to depends on WHICH record survives: a field the loser fills and
 * the survivor leaves empty is a "filled only" question, and the moment the user flips the
 * survivor it becomes a field the survivor already answers. So the server computes the partition
 * and the defaults for each of the two possible survivors and hands both down; flipping the
 * selector selects the other one. The alternative — recomputing in the browser — would put the
 * server's authority over the comparable field set into the client, which is exactly the thing
 * T-39-04 is about.
 *
 * THE SUBMIT ROW DOES NOT FLOAT (M-9). Phase 45's D-45-02 is an OPEN UAT item about a bar pinned
 * to the viewport occluding content at 1280px and at 320px in es-ES; adding a second one while
 * that is unresolved would compound a live defect. A form whose submit sits at the end of the form
 * is also the universally understood arrangement.
 *
 * THE CONFIRMATION HAS NO TRIGGER COMPONENT (M-7). Radix's `SlotClone` renders `null` for an
 * `asChild` child that crossed the RSC boundary, and the repo-wide gate for that is
 * `src/app/admin/fields/[entityType]/__tests__/rsc-boundary.test.tsx`. The dialog is controlled by
 * state and opened by the submit button's handler, the same non-definer shape
 * `src/app/admin/audit/retention-form.tsx` and `src/components/timeline/delete-note-dialog.tsx`
 * both document.
 *
 * A FAILED MERGE KEEPS EVERY CHOICE THE USER MADE (M-8). `choices` is written in exactly two
 * places: the field handler and the survivor handler. No failure path touches it, and no failure
 * path navigates, because the whole point of the route rather than a modal is that there is
 * somewhere to return to.
 */

import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { mergeRecords } from "./actions"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { MergeChoice } from "@/lib/dedup/merge-defaults"

/** Where the cancel button and the gone state send the user. */
const REVIEW_LIST_HREF = "/duplicates"

/**
 * The server-computed partition and pre-selection for one choice of survivor.
 *
 * A MODULE FUNCTION RATHER THAN A CLOSURE INSIDE THE COMPONENT, for a mechanical reason: it is
 * called from a `useState` initialiser, and `react-hooks/immutability` refuses a value read before
 * its declaration — it cannot see that the earlier read would keep up with a later change. Taking
 * the list as a parameter makes the dependency explicit instead of implicit.
 *
 * The fallback is unreachable through this screen (the server sends one orientation per record and
 * the selector only ever holds one of their ids) and exists so the return type is not nullable: a
 * merge form that could render `undefined` groups would fail as a blank page rather than as a
 * refusal.
 */
function orientationFor(orientations: MergeOrientation[], id: string): MergeOrientation {
  return orientations.find((entry) => entry.survivorId === id) ?? orientations[0]
}

/**
 * One compared field, as this screen asks about it.
 *
 * `label` is already resolved: `page.tsx` runs every key through `describeField` and, for a mapped
 * native column, through the viewer's catalog (M-4). That resolution deliberately does NOT happen
 * here — the picker and the `merged` timeline entry must show the same word for the same column,
 * because one is the receipt for the other, and the way to guarantee that is to have one resolver
 * rather than two.
 *
 * `survivor` / `loser` are display strings, or `null` for a side that holds nothing. `null` is not
 * rendered as a blank: an empty option renders the word for emptiness, because a blank option
 * looks unclickable and is indistinguishable from a render bug, and choosing emptiness is a
 * legitimate answer (M-5).
 */
export interface MergeFieldView {
  key: string
  label: string
  survivor: string | null
  loser: string | null
}

/** What a merge would move off one record, as M-6's list states it. */
export interface MergeMoveCounts {
  deals: number
  /** `null` for a person pair — a person has no people, which is not the same as having none. */
  people: number | null
  notes: number
  /** Entries in the record's file-type custom fields. */
  files: number
}

/** One of the two records, as the survivor selector and the what-moves list render it. */
export interface MergeRecordView {
  id: string
  name: string
  /** ISO 8601. Formatted into the viewer's locale here, never on the server. */
  createdAt: string
  counts: MergeMoveCounts
}

/**
 * The three sections and the pre-selection, for ONE choice of survivor.
 *
 * See the module header: the server computes one of these per possible survivor.
 */
export interface MergeOrientation {
  survivorId: string
  loserId: string
  conflicts: MergeFieldView[]
  filledOnly: MergeFieldView[]
  identical: MergeFieldView[]
  defaults: Record<string, MergeChoice>
}

export interface MergeFormProps {
  pairId: string
  /** Exactly two, in the pair's stored order. */
  records: MergeRecordView[]
  /** One per record in `records`, same order. */
  orientations: MergeOrientation[]
  /** The older record — M-2's default, decided on the server where both instants are in hand. */
  defaultSurvivorId: string
}

export function MergeForm({
  pairId,
  records,
  orientations,
  defaultSurvivorId,
}: MergeFormProps) {
  const t = useTranslations("dedup")
  const tAudit = useTranslations("audit")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const router = useRouter()
  const baseId = useId()

  const [isPending, startTransition] = useTransition()
  const [survivorId, setSurvivorId] = useState(defaultSurvivorId)

  /**
   * The user's ANSWERS, seeded from the server's pre-selection for the default survivor.
   *
   * Seeded rather than left empty so the map submitted to the action is complete even if the user
   * touches nothing: `applyMergeChoices` falls back to the same defaults for a missing key, so the
   * two agree, but a complete map is what makes the request self-describing in a log.
   */
  const [choices, setChoices] = useState<Record<string, MergeChoice>>(
    () => orientationFor(orientations, defaultSurvivorId).defaults
  )
  const [confirmOpen, setConfirmOpen] = useState(false)

  /**
   * Set when the server reports that one of these records is no longer there.
   *
   * REACHABLE IN NORMAL USE, not defensive: another admin can merge or delete either record while
   * this screen sits open, and the pair list is a queue several people work from.
   */
  const [gone, setGone] = useState(false)

  const [identicalOpen, setIdenticalOpen] = useState(false)
  const identicalListId = `${baseId}-identical`

  const orientation = orientationFor(orientations, survivorId)
  const survivor =
    records.find((record) => record.id === orientation.survivorId) ?? records[0]
  const loser = records.find((record) => record.id === orientation.loserId) ?? records[1]

  const disabled = isPending || gone

  /**
   * CHANGING THE SURVIVOR REPLACES EVERY FIELD DEFAULT AND DISCARDS MANUAL CHOICES, and it happens
   * HERE, in the change handler.
   *
   * Not in an effect: `react-hooks/set-state-in-effect` is an error in this repo, and an effect
   * would also be the wrong mechanism — this is a consequence of one event, not a synchronisation
   * of two states. `dedup.merge.survivorHelp` states the discard BEFORE the click, which is the
   * honest mitigation for it; there is no confirmation dialog, because a dialog for a reversible
   * in-form change trains a user to dismiss dialogs unread.
   */
  function handleSurvivorChange(nextSurvivorId: string): void {
    setSurvivorId(nextSurvivorId)
    setChoices(orientationFor(orientations, nextSurvivorId).defaults)
  }

  function handleFieldChange(key: string, value: string): void {
    // The narrow union, checked rather than asserted: this value comes from a DOM event.
    const choice: MergeChoice = value === "loser" ? "loser" : "survivor"

    setChoices((current) => ({ ...current, [key]: choice }))
  }

  function choiceFor(field: MergeFieldView): MergeChoice {
    return choices[field.key] ?? orientation.defaults[field.key] ?? "survivor"
  }

  function submit(): void {
    startTransition(async () => {
      try {
        const result = await mergeRecords({
          pairId,
          survivorId: orientation.survivorId,
          loserId: orientation.loserId,
          choices,
        })

        if (result.success) {
          setConfirmOpen(false)
          toast.success(t("merge.success", { loser: result.loserName }))
          router.push(REVIEW_LIST_HREF)
          return
        }

        setConfirmOpen(false)

        if (result.code === "PAIR_GONE") {
          // One of the two records is not there any more. The form stops being a form; it says so
          // and offers the way back. No toast — the panel is permanent and a toast is not.
          setGone(true)
          return
        }

        // Everything else is one sentence: nothing was changed, try again. That is TRUE rather
        // than reassuring, because the merge is a single transaction — there is no half-merged
        // state to warn about and no per-record failure list to render.
        toast.error(t("merge.failed"))
      } catch {
        toast.error(t("merge.failed"))
      }
    })
  }

  /** The counts a record carries, as one locale-joined phrase for its survivor option card. */
  function countsSummary(record: MergeRecordView): string {
    const parts = [
      t("merge.movesDeals", { count: record.counts.deals }),
      t("merge.movesNotes", { count: record.counts.notes }),
    ]

    if (record.counts.people !== null) {
      parts.push(t("merge.movesPeople", { count: record.counts.people }))
    }

    return format.list(parts)
  }

  /**
   * One option card. THE WHOLE CARD IS THE LABEL, so the tap target is the card and not a 16px dot
   * (M-5).
   *
   * The selected state has TWO carriers — the border colour AND the radio dot — so colour is never
   * the only signal. Values WRAP: no truncation of any kind anywhere in this file, because a value
   * a user cannot read whole is a choice they cannot make. `min-w-0` on the card is what actually
   * lets a long unbroken value wrap inside a flex or grid child (R-4).
   */
  function OptionCard({
    id,
    value,
    caption,
    display,
    selected,
  }: {
    id: string
    value: string
    caption: string
    display: string | null
    selected: boolean
  }) {
    return (
      <label
        htmlFor={id}
        className={`flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 ${
          selected ? "border-primary" : ""
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <RadioGroupItem id={id} value={value} className="mt-0.5 size-4" />
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground block text-xs">{caption}</span>
          {display === null ? (
            <span className="text-muted-foreground block text-sm italic break-words">
              {tAudit("value.empty")}
            </span>
          ) : (
            <span className="block text-sm break-words">{display}</span>
          )}
        </span>
      </label>
    )
  }

  /**
   * One field's question: its label, then its two answers.
   *
   * The `RadioGroup` is labelled BY the field's label element, so a screen reader announces
   * "Website — Acme Ltda, https://acme.com.br" rather than two bare values with no idea what they
   * answer.
   */
  function FieldRow({ field, index, group }: { field: MergeFieldView; index: number; group: string }) {
    // Derived from the group and the position, never from the key: a key can be
    // `customFields.CNPJ / CPF`, and a DOM id is not the place for a user-authored string.
    const labelId = `${baseId}-${group}-${index}-label`
    const survivorOptionId = `${baseId}-${group}-${index}-survivor`
    const loserOptionId = `${baseId}-${group}-${index}-loser`
    const choice = choiceFor(field)

    return (
      <div className="space-y-1">
        <p id={labelId} className="text-muted-foreground text-xs">
          {field.label}
        </p>
        <RadioGroup
          aria-labelledby={labelId}
          value={choice}
          onValueChange={(value) => handleFieldChange(field.key, value)}
          disabled={disabled}
          className="grid gap-2 sm:grid-cols-2"
        >
          <OptionCard
            id={survivorOptionId}
            value="survivor"
            caption={survivor.name}
            display={field.survivor}
            selected={choice === "survivor"}
          />
          <OptionCard
            id={loserOptionId}
            value="loser"
            caption={loser.name}
            display={field.loser}
            selected={choice === "loser"}
          />
        </RadioGroup>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* M-8. The form stays on screen and stays disabled rather than disappearing: the user is
          looking at two records and needs to be told which state they are in, not shown an empty
          page. The only live control is the way out. */}
      {gone ? (
        <Alert variant="destructive">
          <AlertDescription className="space-y-2">
            <p>{t("merge.gone")}</p>
            <Button asChild variant="ghost" size="sm">
              <Link href={REVIEW_LIST_HREF}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t("merge.backToList")}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* SECTION 1 — WHICH RECORD SURVIVES (M-2). This is also the ergonomic advantage a column
          layout would have had: "keep everything from this record" in one click. */}
      <Card>
        <CardContent className="space-y-2">
          <p className="text-lg font-semibold">{t("merge.survivorLegend")}</p>
          <p className="text-muted-foreground text-xs">{t("merge.survivorHelp")}</p>

          <RadioGroup
            value={orientation.survivorId}
            onValueChange={handleSurvivorChange}
            disabled={disabled}
            className="grid gap-2 sm:grid-cols-2"
          >
            {records.map((record, index) => {
              const optionId = `${baseId}-survivor-${index}`
              const selected = record.id === orientation.survivorId

              return (
                <label
                  key={record.id}
                  htmlFor={optionId}
                  className={`flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 ${
                    selected ? "border-primary" : ""
                  } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                  <RadioGroupItem id={optionId} value={record.id} className="mt-0.5 size-4" />
                  <span className="min-w-0 flex-1">
                    {/* The accessible name of the choice, in words. Visually the border and the
                        dot already say it, so the sentence would be redundant on screen. */}
                    <span className="sr-only">{t("merge.keepThis")}</span>
                    <span className="block text-sm break-words">{record.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {t("merge.createdOn", {
                        time: format.relativeTime(new Date(record.createdAt)),
                      })}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {countsSummary(record)}
                    </span>
                  </span>
                </label>
              )
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* SECTION 2 — CONFLICTS (M-3). Both sides populated and different; the survivor's value is
          pre-selected. Never collapsed. */}
      {orientation.conflicts.length > 0 ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-lg font-semibold">
              {t("merge.conflictsLegend", { count: orientation.conflicts.length })}
            </p>
            {orientation.conflicts.map((field, index) => (
              <FieldRow key={field.key} field={field} index={index} group="conflict" />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* SECTION 3 — FILLED ONLY ON THE OTHER RECORD (M-3), ITS OWN VISIBLE SECTION FOR ONE
          REASON: this is the only group whose default adopts a value from the record being
          destroyed. A default that quietly imports data is precisely what a user needs to be able
          to audit before pressing Merge, so it is never collapsed and never folded into the
          conflicts above. */}
      {orientation.filledOnly.length > 0 ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-lg font-semibold">
              {t("merge.filledLegend", { count: orientation.filledOnly.length })}
            </p>
            <p className="text-muted-foreground text-xs">{t("merge.filledHelp")}</p>
            {orientation.filledOnly.map((field, index) => (
              <FieldRow key={field.key} field={field} index={index} group="filled" />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* SECTION 4 — IDENTICAL (M-3). No control: there is nothing to decide when both sides hold
          the same value, or when only the surviving side holds one. Collapsed behind the same ghost
          muted disclosure `audit-entry.tsx` uses for its hidden field rows — a plain conditional
          render, no animation and no disclosure primitive, following that file's stated precedent. */}
      {orientation.identical.length > 0 ? (
        <Card>
          <CardContent className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              aria-expanded={identicalOpen}
              aria-controls={identicalListId}
              onClick={() => setIdenticalOpen((current) => !current)}
            >
              {identicalOpen ? (
                <ChevronUp className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              )}
              {identicalOpen ? t("merge.hideIdentical") : t("merge.showIdentical")}
            </Button>

            <p className="text-muted-foreground text-xs">
              {t("merge.identical", { count: orientation.identical.length })}
            </p>

            {identicalOpen ? (
              <dl id={identicalListId} className="space-y-1">
                {orientation.identical.map((field) => (
                  <div key={field.key} className="flex flex-wrap items-baseline gap-2">
                    <dt className="text-muted-foreground text-xs">{field.label}</dt>
                    <dd className="min-w-0 text-sm break-words">
                      {field.survivor === null ? (
                        <span className="text-muted-foreground italic">
                          {tAudit("value.empty")}
                        </span>
                      ) : (
                        field.survivor
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* SECTION 5 — WHAT MOVES (M-6). This is how "nothing is orphaned" becomes checkable by a
          human BEFORE the merge rather than only afterwards: the counts come from `getPairDetail`,
          which computes them from the SAME column predicates the merge reparents on.

          Both trailing sentences are load-bearing statements of locked decisions, not filler.
          Activities carry a deal id and nothing else, so they follow their deal transitively and
          the merge issues no statement for them; file blobs stay at the path they were uploaded
          to, and keep resolving from the surviving record. */}
      <Card>
        <CardContent className="space-y-2">
          <p className="text-lg font-semibold">{t("merge.whatMoves")}</p>
          <ul className="list-inside list-disc space-y-1 text-sm">
            <li>{t("merge.movesDeals", { count: loser.counts.deals })}</li>
            <li>{t("merge.movesNotes", { count: loser.counts.notes })}</li>
            {loser.counts.people === null ? null : (
              <li>{t("merge.movesPeople", { count: loser.counts.people })}</li>
            )}
            {loser.counts.files > 0 ? (
              <li>{tAudit("value.files", { count: loser.counts.files })}</li>
            ) : null}
          </ul>
          <p className="text-muted-foreground text-sm">{t("merge.activitiesFollowDeals")}</p>
          <p className="text-muted-foreground text-sm">{t("merge.filesStayInPlace")}</p>
        </CardContent>
      </Card>

      {/* THE SUBMIT ROW (M-9), at the END of the form, in a card, pinned to nothing. See the module
          header for why a bar attached to the viewport is not an option in this app today. */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="default"
              onClick={() => setConfirmOpen(true)}
              disabled={disabled}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isPending ? t("merge.submitting") : t("merge.submit")}
            </Button>
            <Button asChild variant="outline">
              <Link href={REVIEW_LIST_HREF}>{tCommon("cancel")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* THE CONFIRMATION (M-7). Controlled, with no trigger element — see the module header. The
          action is destructive because the consequence is a record leaving every list and landing
          in Trash, which is what the bulk delete, the single delete and the purge all look like
          (C-2). The body says both halves of the truth: the loser is restorable, and the merge
          itself is not undone. */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (isPending) return
          setConfirmOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("merge.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("merge.confirmBody", { loser: loser.name, survivor: survivor.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                // Radix closes on click by default; the dialog stays open while the merge is in
                // flight so the spinner and the disabled state are where the user is looking.
                event.preventDefault()
                submit()
              }}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("merge.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
