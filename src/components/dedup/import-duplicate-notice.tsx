"use client"

/**
 * THE FLAGGED-ROWS NOTICE ON AN IMPORT COMPLETION SUMMARY — 39-UI-SPEC I-1 … I-5.
 *
 * ONE component, rendered on BOTH completion summaries: `src/app/import/steps/confirm-step.tsx`
 * (the CSV importer's "Import Complete" branch) and
 * `src/app/admin/import/pipedrive-api/steps/progress-step.tsx` (the Pipedrive `isCompleted`
 * branch). Those are the only two places an import ends, and I-1 makes them share this file
 * precisely so the flagged-rows report cannot say two different things depending on which importer
 * the user reached it through.
 *
 * Both call sites add ONE line. Neither importer's own presentation is touched — in particular
 * `progress-step.tsx`'s raw status colour utilities and its hardcoded English literals are
 * PRE-EXISTING and out of scope. Nothing here copies either: this file has NO literal colour class
 * at all (semantic Alert variants only) and NO hardcoded string, and both absences are grep-gated
 * at zero occurrences, which is why neither is spelled out here.
 */

import Link from "next/link"
import { Copy } from "lucide-react"
import { useTranslations } from "next-intl"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { MergeableEntityType } from "@/lib/dedup/types"

/**
 * The `?type=` value `/duplicates` expects, per entity type.
 *
 * An explicit map rather than `` `${entityType}s` ``, which would produce `persons`. The route
 * reads `people`, matching `/people` and every other plural in this codebase.
 */
const TYPE_PARAM: Record<MergeableEntityType, string> = {
  organization: "organizations",
  person: "people",
}

interface ImportDuplicateNoticeProps {
  /** How many of the records this import created look like duplicates. */
  count: number
  entityType: MergeableEntityType
}

export function ImportDuplicateNotice({ count, entityType }: ImportDuplicateNoticeProps) {
  const t = useTranslations("dedup")

  // I-5: rendered ONLY when there is something to report. A zero-count notice on a clean import
  // would train the user to skip the line on the imports that matter.
  if (count <= 0) return null

  return (
    // I-3: `variant="default"`, NEVER `destructive`. The flagged rows were imported SUCCESSFULLY —
    // the import did not fail, and nothing here needs undoing. Colouring this like an error would
    // make a successful import read as a broken one.
    <Alert variant="default">
      <Copy className="h-4 w-4" />
      <AlertTitle>{t("import.flagged", { count })}</AlertTitle>
      <AlertDescription>
        {/*
          I-4: THE NOTICE NEVER LISTS INDIVIDUAL ROWS. An import of thousands can flag hundreds, and
          this is the direct UI consequence of the locked decision that the importer does not become
          interactive: the count plus a link to the review list is the WHOLE report. Do not add a
          preview list here — the review page is the surface built to page through them.
        */}
        <p>{t("import.flaggedBody")}</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href={`/duplicates?type=${TYPE_PARAM[entityType]}`}>{t("import.review")}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
