"use client"

/**
 * THE CONTROL THAT TURNS THE ORGANIZATION CERTAIN TIER ON.
 *
 * `dedup.organization_identity_fields` is seeded by no migration and is UNCONFIGURED on this
 * deployment right now. That is 39-08's deliberate fail-closed design, not a gap: `customFields` is
 * keyed by a field definition's human LABEL and those labels are created per installation, so any
 * seeded guess would be wrong everywhere except the deployment it was copied from. Until an admin
 * picks a field here, organizations have NO certain tier and NO create-time duplicate warning — the
 * scan reports *likely* name matches only, which is why plan 39-07 measured 405 organization pairs
 * against live data rather than the tens of thousands the research predicted. This form is the thing
 * that changes that.
 *
 * ORDER IS MEANINGFUL AND THIS IS NOT A MULTI-SELECT. `firstSharedIdentity` consults the configured
 * fields in order and stops at the first one populated on BOTH records, so the second field only
 * decides a match where the first is absent. Two ordered selects say that; a checkbox list would not.
 * The cap of two is a control rather than ergonomics — every additional entry is another way for a
 * weaker field to declare a *certain* match, and a false *certain* is what puts a pre-checked merge
 * in front of an admin.
 *
 * THE DEDUP SETTINGS MODULE IS NOT IMPORTED, AND THAT IS A HARD BOUNDARY. The module under
 * `src/lib/dedup/` that owns this `app_settings` key imports the database; importing its
 * `ORG_IDENTITY_FIELDS_MAX` here would drag a server-only module into the browser bundle. Its path is
 * deliberately NOT SPELLED ANYWHERE IN THIS FILE — the plan's acceptance criteria grep for it, and a
 * grep cannot tell an import from a comment about one. So the cap is restated below, exactly as
 * `retention-form.tsx` restates `RETENTION_MIN` / `RETENTION_MAX` and for exactly the same reason. It
 * is cosmetic either way: the two selects decide what CAN be submitted, and the server action plus
 * that module's own zod schema are what enforce it (T-39-11).
 *
 * WHICH IS WHY `fieldNames` ARRIVES ALREADY FILTERED, AND WHERE TO LOOK FOR THE RULE. As of plan
 * 39-21 the labels this form offers are not every organization field label: only those a create-time
 * text input can actually COLLECT reach it. That filter runs on the SERVER — `readOrgFieldNames` in
 * `page.tsx` projects the definitions through the very predicate the create dialog applies, so the
 * two cannot disagree — and this file imports nothing to do it. The boundary above therefore still
 * holds exactly as written; what changed is the CONTENT of the prop, not this file's dependencies.
 * Said here because a reader of this file alone cannot otherwise tell where the type rule lives, and
 * both helpers below take only the component's own props precisely to keep it that way.
 *
 * THE SELECTION IS RETAINED ON FAILURE. `saved` moves in exactly one place — the success branch. A
 * refused save and a thrown action land in the same handler, which re-enables the selects with
 * whatever the admin chose still in them.
 *
 * THE SUCCESS TOAST IS NOT AN EXCEPTION TO THE NO-REDUNDANT-TOAST RULE, IT IS THE MIRROR OF IT: a
 * saved pair of selects looks byte-identical to an unsaved one, so there is no visible result to
 * serve as the confirmation.
 *
 * NO THRESHOLD CONTROL HERE. `dedup.similarity_threshold` has no writer anywhere in the app and this
 * form deliberately does not become the first one: the floor has not been calibrated against this
 * dataset yet (39-VALIDATION owns that judgement), and an admin control for a number nobody has
 * measured is a surface with no owner. Changing it remains a one-row operator `UPDATE`.
 */

import { Loader2, TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { saveOrgIdentityFields } from "./actions"

/**
 * Mirrors `ORG_IDENTITY_FIELDS_MAX` — see the module header for why it is not imported. Two selects,
 * so this is the number of selects rendered rather than a value validated here.
 */
const MAX_IDENTITY_FIELDS = 2

/**
 * The "no field" option's value.
 *
 * A sentinel rather than `""`, because Radix `Select` reserves the empty string: an item whose value
 * is `""` is treated as a placeholder and the selection cannot be cleared through it. The sentinel
 * never leaves this component — `compact` below strips it before anything is submitted.
 */
const NONE_VALUE = "__none__"

const PRIMARY_ID = "org-identity-primary"
const SECONDARY_ID = "org-identity-secondary"
const HELP_ID = "org-identity-help"
const UNSUPPORTED_ID = "org-identity-unsupported"

/**
 * The labels the two selects may show: everything OFFERED, plus any stored label that is no longer
 * offerable, appended.
 *
 * A STORED LABEL THE PICKER CAN NO LONGER OFFER IS NEITHER ERASED NOR HIDDEN. `<Select value={x}>`
 * with no `SelectItem` of that value renders an EMPTY TRIGGER — Radix has nothing to display — so
 * dropping the stranded label would tell the admin their configuration is gone while `app_settings`
 * still holds it, and invite a "corrective" save that really would erase it. Appending it keeps the
 * trigger honest.
 *
 * OFFERED FIRST, so the normal case reads in the server's `position` order and the stranded entry is
 * visibly an appendix rather than an equal choice.
 *
 * The `new Set` and the empty-string filter are the same ones this form has always applied to the
 * offered list; see the note on the anomaly at the call site.
 */
const selectableOptions = (offered: string[], configured: string[]): string[] => {
  const distinct = Array.from(new Set(offered)).filter((name) => name.length > 0)
  const stranded = Array.from(new Set(configured)).filter(
    (name) => name.length > 0 && !distinct.includes(name)
  )

  return [...distinct, ...stranded]
}

/**
 * Whether a stored label is one the picker can no longer offer — the condition the Alert explains.
 *
 * IT TAKES THE OFFERED LIST, NEVER THE OPTION LIST. Against the options it is FALSE FOREVER BY
 * CONSTRUCTION, because `selectableOptions` above is precisely what put the stranded label into the
 * options. That single-word slip would make the sentence unreachable while leaving every assertion
 * about the sentence's existence green, so the wiring gate asserts the ARGUMENTS at the call site
 * rather than merely that the call is there.
 *
 * IT ANSWERS HONESTLY FOR BOTH REASONS A LABEL CAN BE UNOFFERABLE — a type a create-time text input
 * cannot collect, and a definition renamed or deleted after being configured — which is why the copy
 * covers both and does not claim the cause is always the type.
 */
const hasUnsupportedIdentityField = (offered: string[], configured: string[]): boolean =>
  configured.some((name) => name.length > 0 && !offered.includes(name))

interface IdentityFieldsFormProps {
  /**
   * The available organization custom-field labels, resolved on the server. Labels rather than ids
   * because `customFields` is a JSONB blob keyed by label — the id would address nothing.
   */
  fieldNames: string[]
  /** The configured ordered pair. Empty means unconfigured, which means no certain tier. */
  value: string[]
}

export function IdentityFieldsForm({ fieldNames, value }: IdentityFieldsFormProps) {
  const t = useTranslations("dedup")
  const [isPending, startTransition] = useTransition()

  /**
   * The two selections, positional. `saved` is the pair the server currently holds and moves only on
   * success, so the Save button can tell "changed" from "already stored".
   */
  /**
   * Truncated to the two slots this form renders. `readOrgIdentityFields` already rejects a stored
   * array longer than the cap and returns `null`, so this should be unreachable — but a third entry
   * that arrived out of band must not sit invisibly in state and then be silently re-submitted as if
   * the admin had chosen it.
   */
  const configured = value.slice(0, MAX_IDENTITY_FIELDS)

  const [primary, setPrimary] = useState(configured[0] ?? NONE_VALUE)
  const [secondary, setSecondary] = useState(configured[1] ?? NONE_VALUE)
  const [saved, setSaved] = useState<string[]>(configured)

  /**
   * DEDUPED, AND THE REASON IS A REAL DATA ANOMALY IN THIS DEPLOYMENT.
   * `custom_field_definitions` holds TWO active rows named `Segmento Organização` for
   * `entity_type='organization'`. `customFields` is keyed by NAME, so both definitions address the
   * same blob key and offering both would render the same choice twice — two options that cannot be
   * told apart and that mean the same thing. `describeField` in `src/lib/audit/present.ts` already
   * resolves a field by name and returns the first match, so collapsing them here is consistent with
   * what the presentation layer does today.
   *
   * THE SERVER NOW COLLAPSES SHARED NAMES TOO, so the `new Set` inside `selectableOptions` is a
   * SECOND BELT rather than the only one. It survives deliberately: this component's contract is
   * about the prop it is handed, and one duplicated `SelectItem` key is not a failure worth trusting
   * a caller to prevent.
   *
   * AND A SHARED NAME WHOSE DEFINITIONS DISAGREE ABOUT TYPE IS NOW A THIRD OUTCOME — one text row and
   * one `multi_select` row under the same label are DROPPED rather than collapsed, because the single
   * blob key both address cannot be safely filled from a text input. That decision is the server's;
   * from here such a label simply never arrives, and if one was configured before the rule existed it
   * shows up as the stranded case the Alert below explains.
   *
   * THIS WORKS AROUND THE ANOMALY AND DOES NOT FIX IT. The duplicate definition rows are still there;
   * merging or archiving one is a data decision with an owner outside this phase.
   */
  const options = selectableOptions(fieldNames, configured)

  /**
   * Fed `fieldNames` — the OFFERED list — and never `options`; see the helper's own note for why that
   * distinction is the whole assertion.
   */
  const unsupported = hasUnsupportedIdentityField(fieldNames, configured)

  /**
   * The selects describe themselves with the help text, and additionally with the stranded-field
   * sentence when there is one, so a screen-reader user reaching the control is told the same thing a
   * sighted user reads above it.
   */
  const describedBy = unsupported ? `${HELP_ID} ${UNSUPPORTED_ID}` : HELP_ID

  /**
   * The ordered array the action receives: the sentinel removed, and the SECOND selection dropped when
   * it repeats the first.
   *
   * Position matters (see the header), so this compacts rather than sorts. A pair like
   * `[none, "CNPJ"]` becomes `["CNPJ"]` — the admin configured one field, in first position, which is
   * what the checking order will then use.
   */
  function compact(): string[] {
    const picked = [primary, secondary].filter((entry) => entry !== NONE_VALUE)

    return picked.filter((entry, index) => picked.indexOf(entry) === index)
  }

  const pending = compact()
  const changed =
    pending.length !== saved.length || pending.some((entry, index) => entry !== saved[index])
  const canSave = changed && !isPending

  function handleSave() {
    if (!canSave) return

    startTransition(async () => {
      try {
        const result = await saveOrgIdentityFields(pending)

        if (result.success) {
          setSaved(pending)
          toast.success(t("identity.saved"))
          return
        }

        // A refusal and a thrown action are the same event to the admin, and neither touches what
        // they chose. The action returns a CODE and never prose, so no server string is rendered.
        toast.error(t("identity.saveFailed"))
      } catch {
        toast.error(t("identity.saveFailed"))
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("identity.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Always present and always neutral: it states what the setting does BEFORE it is set. */}
        <p id={HELP_ID} className="text-muted-foreground text-xs">
          {t("identity.help")}
        </p>

        {/*
          `variant="default"` AND NEVER `destructive` (C-1). This phase adds no `--warning` token, and
          a configuration that cannot work is ADVISORY: nothing the admin did failed, and nothing is
          lost — the field simply is not being checked. Red would also spend this surface's emphasis on
          a settings card, where the page's one primary-filled control is the scan CTA.

          It sits between the help paragraph and the selects because it qualifies the help text and
          explains the list directly below it.
        */}
        {unsupported ? (
          <Alert id={UNSUPPORTED_ID} variant="default">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>{t("identity.unsupported")}</AlertDescription>
          </Alert>
        ) : null}

        {/*
          The two selects stack below `sm` and sit two-up above it. Each is a full-width control in a
          241px content box at a 320px viewport, which is what stops a field label being clipped
          mid-word (K-3).
        */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={PRIMARY_ID}>{t("identity.primaryLabel")}</Label>
            <Select
              value={primary}
              onValueChange={setPrimary}
              disabled={isPending}
            >
              <SelectTrigger id={PRIMARY_ID} aria-describedby={describedBy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>{t("identity.none")}</SelectItem>
                {options.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={SECONDARY_ID}>{t("identity.secondaryLabel")}</Label>
            <Select
              value={secondary}
              onValueChange={setSecondary}
              disabled={isPending || primary === NONE_VALUE}
            >
              {/*
                Disabled while the first is unset: a configuration of "nothing, then CNPJ" is
                indistinguishable in effect from "CNPJ" alone, and offering it invites an admin to
                believe they have set two checks when they have set one.
              */}
              <SelectTrigger id={SECONDARY_ID} aria-describedby={describedBy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>{t("identity.none")}</SelectItem>
                {options
                  .filter((name) => name !== primary)
                  .map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/*
          `outline`, NOT primary-filled. UI-SPEC spends this surface's one filled button on the scan
          CTA (§ Color, "one primary-filled button per surface, and no more"), and this card is a
          settings panel beneath the list rather than the page's focal point. `retention-form.tsx`
          uses `default` for its Save because that page's focal point IS the retention control; here
          it is not, so the filled button stays reserved for the CTA plan 39-13 adds.
        */}
        {/*
          `h-auto whitespace-normal` OVERRIDES `buttonVariants`' base `whitespace-nowrap` and the
          default size's fixed `h-9`, and both halves are load-bearing rather than defensive.

          MEASURED, not anticipated: es-ES's `identity.save` reads "Guardar campos de identificación",
          whose one unbreakable line is 255px wide. This card's content box is 248px at a 320px
          viewport (305 client width, less the container's 32px, the card's 1px border and
          `CardContent`'s 24px padding), so the nowrap button pushed `documentElement.scrollWidth` to
          312 and `/duplicates @ es-ES` was the ONE red assertion of the 21 the viewport matrix added
          — en-US and pt-BR both fit, which is the es-ES-runs-longer asymmetry
          `e2e/viewport-320.spec.ts` exists to catch. `shrink-0` in the same base means no flex parent
          would have rescued it either. Without `h-auto` the wrapped second line escapes the 36px box
          instead of overflowing sideways, which trades a visible defect for a worse one.
        */}
        <Button
          variant="outline"
          className="h-auto whitespace-normal"
          onClick={handleSave}
          disabled={!canSave}
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("identity.save")}
        </Button>
      </CardContent>
    </Card>
  )
}
