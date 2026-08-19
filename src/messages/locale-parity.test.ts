import { readFileSync } from "node:fs"
import { describe, it, expect } from "vitest"

/**
 * Locale drift gate.
 *
 * The repo ships three fully-translated locale files and, until this file existed, nothing
 * failed when one of them lost a key the other two had. A namespace landing in en-US only
 * would surface as a raw `notes.addNote` string in the Spanish and Portuguese UI at runtime,
 * which no build step, typecheck, or lint rule catches.
 *
 * Pre-existing global drift, measured 2026-08-15 while writing this gate: **0 keys**. All three
 * files carried an identical 544-leaf key set, so the whole-file parity assertion below is
 * enabled rather than scoped away. If that number had been non-zero, the whole-file test would
 * have been deferred and this gate scoped to the `notes` namespace alone.
 */

const LOCALES = ["en-US", "es-ES", "pt-BR"] as const
type Locale = (typeof LOCALES)[number]

const REFERENCE_LOCALE: Locale = "en-US"

/**
 * The copy contract from 35-UI-SPEC.md § Copywriting Contract. Every key the notes/timeline
 * surface renders must exist in every locale. Adding a `notes.*` string to the UI means adding
 * its dot-path here first — that is the point of the list being checked in.
 */
export const REQUIRED_NOTE_KEYS: string[] = [
  "notes.timeline",
  "notes.composerPlaceholder",
  "notes.addNote",
  "notes.adding",
  "notes.empty.heading",
  "notes.empty.body",
  "notes.emptyNotes.heading",
  "notes.emptyNotes.body",
  "notes.error.saveFailed",
  "notes.error.loadMoreFailed",
  "notes.error.editFailed",
  "notes.error.deleteFailed",
  "notes.error.notPermitted",
  "notes.error.recordCreatedNoteFailed",
  "notes.error.timelineUnavailable",
  "notes.edited",
  "notes.migrated",
  "notes.migratedTooltip",
  "notes.unknownAuthor",
  "notes.loadMore",
  "notes.loadingMore",
  "notes.editNote",
  "notes.deleteNote",
  "notes.saveEdit",
  "notes.cancelEdit",
  "notes.entry.stageChanged",
  "notes.entry.activityDue",
  "notes.entry.activityCompleted",
  "notes.announceAdded",
  "notes.deleteDialog.title",
  "notes.deleteDialog.description",
  "notes.deleteDialog.cancel",
]

/**
 * The copy contract from 36-UI-SPEC.md § Copywriting Contract → Full key inventory. Same rule as
 * REQUIRED_NOTE_KEYS above and the same reason: adding an `audit` string to the UI means adding
 * its dot-path here first. The list is checked in precisely so that the addition is a reviewable
 * diff rather than a namespace that silently grows in en-US only.
 *
 * 83 keys in the `audit` namespace plus the 2 dashboard-tile keys that live in the pre-existing
 * `admin.dashboard` namespace — 85. Groups below carry the UI-SPEC's own section names so a key can
 * be found by the surface that renders it.
 *
 * Phase 39 added exactly 4: the two `audit.entry.merged.*` predicates and the two merge detail
 * lines. The list was 81 entries when 39-04 read it (counted from this file, not from a planning
 * document — 39-RESEARCH A7 records that the size is reported inconsistently across documents).
 */
export const REQUIRED_AUDIT_KEYS: string[] = [
  // Actor kinds — 4
  "audit.actorKind.workflowRun",
  "audit.actorKind.apiKey",
  "audit.actorKind.import",
  "audit.actorKind.system",

  // Entry predicates — 14, one per action × entity. Separate strings rather than one with an
  // {entity} placeholder because es-ES and pt-BR inflect the demonstrative with the noun's gender.
  // `merged` has exactly TWO children, not four: deals and activities are out of scope for
  // deduplication, and AuditEntry builds its predicate as t(`entry.${action}.${entityType}`), so a
  // third entity type reaching the writer would render a dot-path to the user. The writer is
  // constrained at the type level (MergeableEntityType = "organization" | "person"); this list is
  // the copy half of that same constraint.
  "audit.entry.created.organization",
  "audit.entry.created.person",
  "audit.entry.created.deal",
  "audit.entry.created.activity",
  "audit.entry.updated.organization",
  "audit.entry.updated.person",
  "audit.entry.updated.deal",
  "audit.entry.updated.activity",
  "audit.entry.deleted.organization",
  "audit.entry.deleted.person",
  "audit.entry.deleted.deal",
  "audit.entry.deleted.activity",
  "audit.entry.merged.organization",
  "audit.entry.merged.person",

  // Values and disclosure — 12. mergedNoFieldChanges is the merge sibling of noVisibleChanges, and
  // mergedChildren counts the linked records the merge re-pointed at the survivor.
  "audit.value.empty",
  "audit.value.unavailable",
  "audit.value.yes",
  "audit.value.no",
  "audit.value.files",
  "audit.value.changedTo",
  "audit.showMoreFields",
  "audit.showFewerFields",
  "audit.unknownActor",
  "audit.entry.noVisibleChanges",
  "audit.entry.mergedNoFieldChanges",
  "audit.entry.mergedChildren",

  // Field labels — 22, covering every audited native column across the four entities. Custom
  // fields are never translated; they render customFieldDefinitions.name verbatim.
  // movedToTrash/restoredFromTrash are FLAT siblings, not a nested object: AUDIT_FIELD_LABELS in
  // src/lib/audit/present.ts maps a column name to a flat dot-path and a nested value breaks it.
  "audit.field.title",
  "audit.field.name",
  "audit.field.firstName",
  "audit.field.lastName",
  "audit.field.email",
  "audit.field.phone",
  "audit.field.website",
  "audit.field.industry",
  "audit.field.defaultCurrency",
  "audit.field.value",
  "audit.field.stage",
  "audit.field.expectedCloseDate",
  "audit.field.organization",
  "audit.field.person",
  "audit.field.deal",
  "audit.field.owner",
  "audit.field.assignee",
  "audit.field.type",
  "audit.field.dueDate",
  "audit.field.completedAt",
  "audit.field.movedToTrash",
  "audit.field.restoredFromTrash",

  // Filter toggle — 5. emptyHidden.body quotes the toggle's own label, so a locale whose body
  // stops matching its own filter label points the user at a control they cannot find.
  "audit.filter.label",
  "audit.filter.announceShown",
  "audit.filter.announceHidden",
  "audit.filter.emptyHidden.heading",
  "audit.filter.emptyHidden.body",

  // Workflow run section — 8
  "audit.run.heading",
  "audit.run.empty",
  "audit.run.unavailable",
  "audit.run.untitledRecord",
  "audit.run.action.created",
  "audit.run.action.updated",
  "audit.run.action.deleted",
  "audit.run.fieldCount",

  // Retention page — 18
  "audit.retention.title",
  "audit.retention.description",
  "audit.retention.windowTitle",
  "audit.retention.windowLabel",
  "audit.retention.windowHelp",
  "audit.retention.notSet",
  "audit.retention.save",
  "audit.retention.saving",
  "audit.retention.saved",
  "audit.retention.saveFailed",
  "audit.retention.costTitle",
  "audit.retention.entriesLabel",
  "audit.retention.oldestLabel",
  "audit.retention.oldestNone",
  "audit.retention.shortenDialog.title",
  "audit.retention.shortenDialog.description",
  "audit.retention.shortenDialog.cancel",
  "audit.retention.shortenDialog.confirm",

  // Dashboard tile — 2, in the pre-existing admin.dashboard namespace
  "admin.dashboard.auditLog",
  "admin.dashboard.auditLogDescription",
]

/**
 * The copy contract from 37-UI-SPEC.md § Copywriting Contract → New key inventory. Same rule as the
 * two lists above: a `trash.*` string reaching the UI means its dot-path is added here first, and
 * the exact-contract assertion below turns "forgot to add it" into a red suite rather than a string
 * that ships gated by nothing.
 *
 * 60 keys in the `trash` namespace, plus the 2 dashboard-tile keys in the pre-existing
 * `admin.dashboard` namespace and the 1 sidebar entry in `nav` — 63 total. The per-group counts in
 * the comments are load-bearing: they are how a reader sees at a glance that a group lost a key.
 */
export const REQUIRED_TRASH_KEYS: string[] = [
  // Page shell — 2
  "trash.title",
  "trash.description",

  // Column headers — 9. Four singular entity nouns rather than one "Record" header because es-ES
  // and pt-BR inflect articles and adjectives with the noun's gender, and those four strings are
  // reused inside the purge dialog description where the inflection matters.
  "trash.column.deal",
  "trash.column.person",
  "trash.column.organization",
  "trash.column.activity",
  "trash.column.deletedAt",
  "trash.column.deletedBy",
  "trash.column.email",
  "trash.column.website",
  "trash.column.dueDate",

  // Actor — 2. The four non-user actor badges and the unknown-user fallback are reused from the
  // audit namespace (audit.actorKind.*, audit.unknownActor) and are deliberately absent here.
  "trash.actor.notRecorded",
  "trash.actor.notRecordedTitle",

  // Linked records — 2
  "trash.linkedInTrash",
  "trash.linkedInTrashTitle",

  // Row actions — 5
  "trash.restore",
  "trash.restoring",
  "trash.restoreWithLinked",
  "trash.deletePermanently",
  "trash.deleting",

  // Results — 5. linkedNotRestored is the SHORTFALL sentence, and it is a separate string rather
  // than a clause inside restoredWithLinked because the two are separate toasts with separate
  // severities: a partial restore succeeded at what the user clicked and fell short on what it
  // offered, and collapsing that into one line would either overstate or bury it.
  "trash.restored",
  "trash.restoredWithLinked",
  "trash.linkedNotRestored",
  "trash.openRecord",
  "trash.purged",

  // Errors — 5
  "trash.error.restoreFailed",
  "trash.error.alreadyPurged",
  "trash.error.purgeFailed",
  "trash.error.purgeNotPermitted",
  "trash.error.unavailable",

  // Empty states — 6. bodyNoRetention is the fail-closed variant: when trash.retention_days is
  // unset or unparseable nothing is purged automatically, so the {days} body would be a promise
  // the system does not keep.
  "trash.empty.deals",
  "trash.empty.people",
  "trash.empty.organizations",
  "trash.empty.activities",
  "trash.empty.body",
  "trash.empty.bodyNoRetention",

  // Purge dialog — 5. description states all three categories of consequence: what DIES (the
  // record and its notes), what is MODIFIED (the linked records unlinked but kept — the clause
  // WR-08 added, after UAT G1 watched a live person lose its organization through a dialog that
  // never mentioned it), and what SURVIVES ("change history is kept"), so an admin is not led to
  // believe a purge erases the evidence of the purge.
  "trash.purgeDialog.title",
  "trash.purgeDialog.description",
  // The no-number variant, for when the unlink count could not be read before the dialog opened.
  // A separate string rather than a `=0` branch: zero is a FACT the dialog states, and "unknown"
  // must not be able to render as it (WR-08).
  "trash.purgeDialog.descriptionUnknownImpact",
  "trash.purgeDialog.cancel",
  "trash.purgeDialog.confirm",

  // Pagination — 1
  "trash.loadMore",

  // Retention page — 18. windowHelp states the same 1-365 bounds that RETENTION_MIN/RETENTION_MAX
  // enforce; a range the copy advertises but the validator rejects trains operators to distrust
  // the form.
  "trash.retention.title",
  "trash.retention.description",
  "trash.retention.windowTitle",
  "trash.retention.windowLabel",
  "trash.retention.windowHelp",
  "trash.retention.notSet",
  "trash.retention.save",
  "trash.retention.saving",
  "trash.retention.saved",
  "trash.retention.saveFailed",
  "trash.retention.costTitle",
  "trash.retention.recordsLabel",
  "trash.retention.oldestLabel",
  "trash.retention.oldestNone",
  "trash.retention.shortenDialog.title",
  "trash.retention.shortenDialog.description",
  "trash.retention.shortenDialog.cancel",
  "trash.retention.shortenDialog.confirm",

  // Dashboard tile — 2, in the pre-existing admin.dashboard namespace
  "admin.dashboard.trash",
  "admin.dashboard.trashDescription",

  // Sidebar entry — 1, in the pre-existing nav namespace
  "nav.trash",
]

/**
 * The copy contract from 38-UI-SPEC.md § Copywriting Contract → New key inventory. Same rule as the
 * three lists above: adding a `bulk.*` string to the UI means adding its dot-path here first, and the
 * exact-contract assertion below turns a string that skipped this list into a red suite rather than
 * copy that ships gated by nothing.
 *
 * 44 keys, all inside the `bulk` namespace — unlike `trash`, this phase adds nothing to `nav` or
 * `admin.dashboard`, which is why `bulkKeys` below needs no `*_EXTRA_KEYS` sibling. The per-group
 * counts in the comments are load-bearing: they are how a reader sees at a glance that a group lost
 * a key.
 */
export const REQUIRED_BULK_KEYS: string[] = [
  // Selection — 4. The capped variant is a plain-placeholder string rather than an ICU plural
  // because {max} is always BULK_MAX_IDS and therefore never singular. It exists because /deals has
  // no pagination and its largest single stage holds 10,495 deals, so a per-stage select-all is
  // over-cap in the normal case and has to say so (D-07).
  "bulk.selectRow",
  "bulk.selectAllLoaded",
  "bulk.selectAllInStage",
  "bulk.selectAllInStageCapped",

  // Action bar — 7. actionBarLabel is the region's accessible name, separate from the visible
  // `selected` count because a screen reader needs the noun the bare "12 selected" omits.
  "bulk.selected",
  "bulk.actionBarLabel",
  "bulk.reassignOwner",
  "bulk.exportCsv",
  "bulk.delete",
  "bulk.clearSelection",
  "bulk.exporting",

  // Delete dialog — 6. descriptionNoRetention is the fail-closed variant, exactly as
  // trash.empty.bodyNoRetention is: readTrashRetentionDays() returns null when the setting is unset
  // or unparseable, and a `?? 30` in the consumer would make the dialog promise a restore window the
  // pruner is not enforcing (T-38-10).
  "bulk.deleteDialog.title",
  "bulk.deleteDialog.description",
  "bulk.deleteDialog.descriptionNoRetention",
  "bulk.deleteDialog.cancel",
  "bulk.deleteDialog.confirm",
  "bulk.deleteDialog.deleting",

  // Reassign dialog — 8. noEmailNotice is required copy, not a nicety: the single-record reassign
  // path does email the new assignee, so silence here would be an implied promise (T-38-11).
  "bulk.reassignDialog.title",
  "bulk.reassignDialog.description",
  "bulk.reassignDialog.ownerLabel",
  "bulk.reassignDialog.ownerPlaceholder",
  "bulk.reassignDialog.noEmailNotice",
  "bulk.reassignDialog.cancel",
  "bulk.reassignDialog.confirm",
  "bulk.reassignDialog.reassigning",

  // Results — 6. `partial` is a separate string from the three all-succeeded lines because a partial
  // result is a different claim, and collapsing them would either overstate or bury the failures.
  "bulk.deleted",
  "bulk.reassigned",
  "bulk.exported",
  "bulk.partial",
  "bulk.openTrash",
  "bulk.working",

  // Failure report — 6. Three mutually exclusive hint branches, one per truth condition, because
  // the panel must state only what is true about the selection after the caller's prune:
  // `retryHint` when every failed row survived, `retryHintPartial` when some did, `prunedHint` when
  // none did. 45-CONTEXT.md § Bulk Failure Copy — retrying rows the table can no longer render is
  // what the prune exists to prevent, so the copy branches instead of the selection being restored.
  "bulk.failures.deleteTitle",
  "bulk.failures.reassignTitle",
  "bulk.failures.retryHint",
  "bulk.failures.retryHintPartial",
  "bulk.failures.prunedHint",
  "bulk.failures.dismiss",

  // Errors — 5. tooMany states both the cap and the selected count, so the user is not left
  // guessing how far over the limit they are.
  "bulk.error.tooMany",
  "bulk.error.deleteFailed",
  "bulk.error.reassignFailed",
  "bulk.error.exportFailed",
  "bulk.error.notPermitted",

  // Per-record failure reasons — 4, and a CLOSED set. The server returns one of these four codes,
  // never prose, so no server error text can reach the failure report (T-38-07). A fifth reason
  // means a fifth key here first.
  "bulk.reason.notFound",
  "bulk.reason.notPermitted",
  "bulk.reason.alreadyDeleted",
  "bulk.reason.unknown",
]

/**
 * The copy contract from 45-UI-SPEC.md § New message keys. Same rule as the four lists above: a
 * shell string reaching the UI means its dot-path is added here first. This one exists because the
 * admin sidebar shipped eleven English literals that no gate could see — the whole-file key-set
 * parity check catches a MISSING key, but an English string pasted into pt-BR.json passes it.
 *
 * 16 keys: the 12 `admin.nav.*` sidebar/drawer strings and the 4 `theme.*` toggle strings.
 *
 * The `nav` half of the shell contract is carried separately in SHELL_EXTRA_KEYS rather than by
 * scoping this list to the `nav` namespace: `nav` already holds 12 pre-existing keys, so a
 * whole-namespace exact-set contract would drag all of them in and make this list a rewrite of a
 * namespace this phase adds two strings to. TRASH_EXTRA_KEYS below is the precedent for the shape.
 */
export const REQUIRED_SHELL_KEYS: string[] = [
  // Admin sidebar / drawer — 12. The first 11 are the entries that were English literals in
  // src/components/admin-sidebar.tsx; `openMenu` is the accessible name of the new mobile
  // hamburger trigger, which has no visible label at all.
  "admin.nav.title",
  "admin.nav.dashboard",
  "admin.nav.users",
  "admin.nav.pipelines",
  "admin.nav.customFields",
  "admin.nav.webhooks",
  "admin.nav.auditLog",
  "admin.nav.trash",
  "admin.nav.exportData",
  "admin.nav.pipedriveImport",
  "admin.nav.backToApp",
  "admin.nav.openMenu",

  // Theme toggle — 4, a new top-level namespace rather than `nav.theme.*`: the theme is app-wide
  // state and a future appearance section in /settings reads the same four strings.
  "theme.label",
  "theme.light",
  "theme.dark",
  "theme.system",
]

/**
 * The copy contract from 39-UI-SPEC.md § New message keys. Same rule as the five lists above: a
 * `dedup.*` string reaching the UI means its dot-path is added here first, and the exact-contract
 * assertion below turns a string that skipped this list into a red suite rather than copy that ships
 * gated by nothing.
 *
 * 77 keys, all inside the `dedup` namespace — like `bulk` and unlike `trash`, this phase adds
 * nothing to `nav` or `admin.dashboard`, which is why `dedupKeys` below needs no `*_EXTRA_KEYS`
 * sibling and the comparison against this list is TOTAL: a 78th dedup string that never made it
 * into this array fails, which is the half a missing-key check cannot see. The per-group counts in
 * the comments are load-bearing: they are how a reader sees at a glance that a group lost a key.
 *
 * Two entries differ from the catalog 39-UI-SPEC signed off, both forced by 39-CONTEXT.md
 * § Post-Research Decisions, which superseded a locked matching rule after the UI-SPEC was written:
 *
 * - `reason.nameIdentity` replaces the spec's `reason.nameDomain`. The approved copy was "Same name
 *   and website domain", describing a rule that can never fire — `website` is NULL on all 46,054
 *   organizations. The organization *certain* tier is now "same normalized name and the same value
 *   in a configured identity custom field". Key count unchanged.
 * - The `identity` group is new: 39-CONTEXT locks that the organization identity key is
 *   admin-configurable, and the UI-SPEC has no surface for naming those fields.
 */
export const REQUIRED_DEDUP_KEYS: string[] = [
  // Create-time warning — 4
  "dedup.warning.title",
  "dedup.warning.body",
  "dedup.warning.openExisting",
  "dedup.warning.createAnyway",

  // Match reasons — 4, and a CLOSED set that maps 1:1 onto the locked matching rules: `email` and
  // `nameIdentity` are the two *certain* rules, `similarName` and `similarNamePhone` the two
  // *likely* ones. A matched record is never shown without its reason.
  "dedup.reason.email",
  "dedup.reason.nameIdentity",
  "dedup.reason.similarName",
  "dedup.reason.similarNamePhone",

  // Scan — 13. {current}, {total} and {time} are pre-formatted strings supplied by the caller, not
  // numbers or Dates: the RelativeTime component renders an element, and `lastRun` is a sentence in
  // three languages whose word order differs.
  "dedup.scan.title",
  "dedup.scan.description",
  "dedup.scan.startOrganizations",
  "dedup.scan.startPeople",
  "dedup.scan.rescan",
  "dedup.scan.running",
  "dedup.scan.progress",
  "dedup.scan.startedBy",
  "dedup.scan.lastRun",
  "dedup.scan.backgroundHint",
  "dedup.scan.cancel",
  "dedup.scan.failed",
  "dedup.scan.failedBody",

  // Review list — 17. Three distinct emptinesses, three distinct headings: never scanned, scanned
  // and found nothing, everything dismissed. There is deliberately no `emptyAllDismissedBody` — the
  // body of that state is the `showDismissed` ghost button that resolves it.
  "dedup.review.pairsFound",
  "dedup.review.confidenceCertain",
  "dedup.review.confidenceLikely",
  "dedup.review.merge",
  "dedup.review.dismiss",
  "dedup.review.dismissed",
  "dedup.review.dismissFailed",
  "dedup.review.showDismissed",
  "dedup.review.hideDismissed",
  "dedup.review.undismiss",
  "dedup.review.undismissed",
  "dedup.review.loadMore",
  "dedup.review.emptyNeverScanned",
  "dedup.review.emptyNeverScannedBody",
  "dedup.review.emptyNoPairs",
  "dedup.review.emptyNoPairsBody",
  "dedup.review.emptyAllDismissed",

  // Merge screen — 27. `filesStayInPlace` exists because the locked decision leaves file blobs at
  // the loser's path: the user must not be told files "move" when they do not, so the sentence
  // promises the property that is actually true, which the download route must then deliver.
  "dedup.merge.title",
  "dedup.merge.description",
  "dedup.merge.survivorLegend",
  "dedup.merge.survivorHelp",
  "dedup.merge.keepThis",
  "dedup.merge.createdOn",
  "dedup.merge.conflictsLegend",
  "dedup.merge.filledLegend",
  "dedup.merge.filledHelp",
  "dedup.merge.identical",
  "dedup.merge.showIdentical",
  "dedup.merge.hideIdentical",
  "dedup.merge.whatMoves",
  "dedup.merge.movesDeals",
  "dedup.merge.movesNotes",
  "dedup.merge.movesPeople",
  "dedup.merge.activitiesFollowDeals",
  "dedup.merge.filesStayInPlace",
  "dedup.merge.submit",
  "dedup.merge.submitting",
  "dedup.merge.confirmTitle",
  "dedup.merge.confirmBody",
  "dedup.merge.confirmAction",
  "dedup.merge.success",
  "dedup.merge.failed",
  "dedup.merge.gone",
  "dedup.merge.backToList",

  // Import notice — 3
  "dedup.import.flagged",
  "dedup.import.flaggedBody",
  "dedup.import.review",

  // Identity fields — 8. The admin control that names which custom fields act as the organization
  // identity key. `help` states the degradation explicitly, because until a field is chosen new
  // organizations get no create-time check at all and silence there would read as a working feature.
  "dedup.identity.title",
  "dedup.identity.help",
  "dedup.identity.primaryLabel",
  "dedup.identity.secondaryLabel",
  "dedup.identity.none",
  "dedup.identity.save",
  "dedup.identity.saved",
  "dedup.identity.saveFailed",

  // Entry point — 1
  "dedup.findDuplicates",
]

/** The two shell strings that live outside the shell namespaces, in the pre-existing `nav`. */
const SHELL_EXTRA_KEYS = [
  "nav.workflows",
  "nav.searchDescription",
]

/** The whole shell contract, namespaced keys plus the `nav` extras, as one list to gate. */
const SHELL_CONTRACT_KEYS = [...REQUIRED_SHELL_KEYS, ...SHELL_EXTRA_KEYS]

/**
 * Keys whose translation is legitimately byte-identical to the en-US string in BOTH other
 * locales — proper nouns, brand names, units. A key only belongs here after a human decides the
 * identical string is correct, not because a translation was skipped.
 *
 * The three entries are product nouns, and each is here for a stated reason:
 *
 * - `admin.nav.pipelines` — "Pipelines" is the product's own noun for a funnel. The precedent is
 *   inside this very catalog: `nav.pipelines` is already "Pipelines" in all three locales, and the
 *   sidebar entry and the main-nav entry point at the same route, so they must not disagree (V-1).
 * - `admin.nav.webhooks` — same: `admin.webhooks.title` is already "Webhooks" in all three.
 * - `nav.workflows` — the locked decision (45-CONTEXT.md § Shell Translation) is that the link must
 *   call `t()`; the defect being fixed is a literal in JSX. Translating the WORD would send a pt-BR
 *   user to a workflows surface that has no `workflows` message namespace at all — the entire
 *   Phase 24-30 UI is English — i.e. trade a visible literal for a language cliff. This key is
 *   where the label changes once that surface is localised, which is why it moves here now.
 *
 * Without these three, the `untranslatedInBoth(SHELL_CONTRACT_KEYS)` assertion below fails on
 * copy that is correct.
 */
const IDENTICAL_TRANSLATION_ALLOWED: string[] = [
  "admin.nav.pipelines",
  "admin.nav.webhooks",
  "nav.workflows",
]

type LocaleMessages = { [key: string]: string | LocaleMessages }

function loadLocale(locale: Locale): LocaleMessages {
  const raw = readFileSync(new URL(`./${locale}.json`, import.meta.url), "utf8")
  return JSON.parse(raw) as LocaleMessages
}

/** Every leaf dot-path in `obj`, sorted. Non-leaf objects contribute their children, not themselves. */
function flattenKeys(obj: LocaleMessages, prefix = ""): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === "object") {
      out.push(...flattenKeys(value, path))
    } else {
      out.push(path)
    }
  }
  return out.sort()
}

/** Resolves a dot-path to its leaf value, or `undefined` if any segment is missing. */
function resolve(obj: LocaleMessages, path: string): string | undefined {
  let current: string | LocaleMessages | undefined = obj
  for (const segment of path.split(".")) {
    if (current === undefined || typeof current !== "object") return undefined
    current = current[segment]
  }
  return typeof current === "string" ? current : undefined
}

/** The `{placeholder}` tokens a next-intl message interpolates, sorted and de-duplicated. */
function placeholders(message: string): string[] {
  return [...new Set(message.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])].sort()
}

/**
 * How many times each of `tokens` literally occurs in `message`.
 *
 * `placeholders()` above de-duplicates through a Set, so `placeholderDrift()` compares SETS, not
 * multisets: a message using `{loser}` twice in en-US and once in translation has an identical
 * placeholder set and slips through it untouched. Counting is the only way to see that, and it
 * matters for exactly one key so far — see the dedicated assertion for `dedup.merge.confirmBody`.
 */
function placeholderCounts(message: string, tokens: string[]): Record<string, number> {
  return Object.fromEntries(tokens.map((t) => [t, message.split(t).length - 1]))
}

const messages = Object.fromEntries(LOCALES.map((l) => [l, loadLocale(l)])) as Record<
  Locale,
  LocaleMessages
>
const allKeys = Object.fromEntries(LOCALES.map((l) => [l, flattenKeys(messages[l])])) as Record<
  Locale,
  string[]
>
const NOTES_NAMESPACE = "notes"
const AUDIT_NAMESPACE = "audit"
const TRASH_NAMESPACE = "trash"
const BULK_NAMESPACE = "bulk"
const DEDUP_NAMESPACE = "dedup"
/** The shell contract spans two namespaces; `nav.*` is carried by SHELL_EXTRA_KEYS instead. */
const SHELL_NAMESPACES = ["admin.nav", "theme"]
const SHELL_LABEL = "shell"

/** The two audit strings that live outside the audit namespace, in the admin dashboard tile. */
const AUDIT_DASHBOARD_KEYS = ["admin.dashboard.auditLog", "admin.dashboard.auditLogDescription"]

/** The three trash strings that live outside the trash namespace: the tile and the sidebar entry. */
const TRASH_EXTRA_KEYS = [
  "admin.dashboard.trash",
  "admin.dashboard.trashDescription",
  "nav.trash",
]

/** Matches a namespace root and everything nested under it, and nothing that merely shares a prefix. */
function inNamespace(namespace: string): (key: string) => boolean {
  return (key) => key === namespace || key.startsWith(`${namespace}.`)
}

function keysMatching(match: (key: string) => boolean): Record<Locale, string[]> {
  return Object.fromEntries(LOCALES.map((l) => [l, allKeys[l].filter(match)])) as Record<
    Locale,
    string[]
  >
}

const noteKeys = keysMatching(inNamespace(NOTES_NAMESPACE))
const auditKeys = keysMatching(
  (key) => inNamespace(AUDIT_NAMESPACE)(key) || AUDIT_DASHBOARD_KEYS.includes(key),
)
const trashKeys = keysMatching(
  (key) => inNamespace(TRASH_NAMESPACE)(key) || TRASH_EXTRA_KEYS.includes(key),
)
// No EXTRA_KEYS sibling on purpose: 38-UI-SPEC adds zero bulk strings outside the namespace.
const bulkKeys = keysMatching(inNamespace(BULK_NAMESPACE))
// Same: 39-UI-SPEC adds zero dedup strings outside the namespace, so this scope is the whole
// contract and the comparison against REQUIRED_DEDUP_KEYS below is total.
const dedupKeys = keysMatching(inNamespace(DEDUP_NAMESPACE))
const shellKeys = keysMatching(
  (key) => SHELL_NAMESPACES.some((ns) => inNamespace(ns)(key)) || SHELL_EXTRA_KEYS.includes(key),
)

const emptyPerLocale = Object.fromEntries(LOCALES.map((l) => [l, [] as string[]])) as Record<
  Locale,
  string[]
>

/*
 * The five assertion bodies below are shared by every copy contract in this file, so a contract is
 * gated by calling them rather than by copying an `it` block. REQUIRED_NOTE_KEYS,
 * REQUIRED_AUDIT_KEYS, REQUIRED_TRASH_KEYS, REQUIRED_BULK_KEYS and SHELL_CONTRACT_KEYS are passed
 * separately — never concatenated — so a failure diff names which contract broke and lists only
 * its keys.
 *
 * The per-contract calls use `expect.soft` rather than `expect`. Plain `expect` throws on the first
 * failure, so with five contracts in one `it` block only the earliest-listed broken contract is
 * ever reported and the other four are invisible until it is fixed — which is exactly the outcome
 * the "passed separately" rule above exists to avoid. Soft assertions still fail the test; they
 * just let every broken contract name itself in a single run. `expect` (hard) is kept for the
 * standalone ICU assertion, which gates one key and has nothing to run alongside it.
 */

/** Contract keys absent from each locale file. */
function missingIn(required: string[]): Record<Locale, string[]> {
  return Object.fromEntries(
    LOCALES.map((l) => [l, required.filter((k) => !allKeys[l].includes(k))]),
  ) as Record<Locale, string[]>
}

/** Contract keys that resolve to something other than a non-empty string in each locale file. */
function blankIn(required: string[]): Record<Locale, string[]> {
  return Object.fromEntries(
    LOCALES.map((l) => [
      l,
      required.filter((k) => {
        const value = resolve(messages[l], k)
        return typeof value !== "string" || value.trim() === ""
      }),
    ]),
  ) as Record<Locale, string[]>
}

/** Contract keys whose es-ES and pt-BR values are both byte-identical to en-US. */
function untranslatedInBoth(required: string[]): string[] {
  return required.filter((key) => {
    if (IDENTICAL_TRANSLATION_ALLOWED.includes(key)) return false
    const en = resolve(messages["en-US"], key)
    if (typeof en !== "string") return false
    return resolve(messages["es-ES"], key) === en && resolve(messages["pt-BR"], key) === en
  })
}

/** Contract keys whose placeholder set changed in translation, keyed by key then locale. */
function placeholderDrift(required: string[]): Record<string, Record<string, string[]>> {
  const mismatched: Record<string, Record<string, string[]>> = {}
  for (const key of required) {
    const en = resolve(messages["en-US"], key)
    if (typeof en !== "string") continue
    const expected = placeholders(en)
    if (expected.length === 0) continue
    for (const locale of LOCALES) {
      const value = resolve(messages[locale], key)
      const actual = typeof value === "string" ? placeholders(value) : []
      if (actual.join(",") !== expected.join(",")) {
        mismatched[key] ??= { expected }
        mismatched[key][locale] = actual
      }
    }
  }
  return mismatched
}

/**
 * The two substrings an ICU plural wrapper cannot lose. `placeholders()` above matches
 * `/\{[a-zA-Z0-9_]+\}/g`, which CANNOT match `{count, plural, one {# …} other {# …}}` — the comma,
 * the spaces and the `#` all fall outside that character class — so `placeholderDrift()` computes
 * an empty expected set for such a message and `continue`s without checking anything. The generic
 * placeholder gate therefore does NOT cover ICU plural syntax, for this key or any other. The
 * dedicated assertion below is the only thing defending the wrapper.
 */
const ICU_PLURAL_MARKERS = ["{count,", "plural,"]

/**
 * Every contract key whose message is an ICU plural. Listed rather than detected, so a key that
 * LOSES its wrapper in en-US is caught too — auto-detection from the reference locale would simply
 * stop gating a key the moment the reference broke.
 */
const ICU_PLURAL_KEYS: string[] = [
  "bulk.failures.retryHintPartial",
  "dedup.warning.title",
  "dedup.review.pairsFound",
  "dedup.merge.conflictsLegend",
  "dedup.merge.filledLegend",
  "dedup.merge.identical",
  "dedup.merge.movesDeals",
  "dedup.merge.movesNotes",
  "dedup.merge.movesPeople",
  "dedup.import.flagged",
  "audit.entry.mergedChildren",
]

/** Per-locale verdict on one message's ICU plural wrapper: "ok", "absent", or what it lost. */
function icuPluralReport(key: string): Record<Locale, string> {
  return Object.fromEntries(
    LOCALES.map((locale) => {
      const value = resolve(messages[locale], key)
      if (typeof value !== "string") return [locale, "absent"]
      const lost = ICU_PLURAL_MARKERS.filter((marker) => !value.includes(marker))
      return [locale, lost.length === 0 ? "ok" : `lost ${lost.join(" and ")}`]
    }),
  ) as Record<Locale, string>
}

const icuOkPerLocale = Object.fromEntries(LOCALES.map((l) => [l, "ok"])) as Record<Locale, string>

/** Every locale carries the same scoped key set as the reference locale. */
function expectIdenticalKeySets(scoped: Record<Locale, string[]>, label: string): void {
  const reference = scoped[REFERENCE_LOCALE]
  for (const locale of LOCALES) {
    expect.soft(scoped[locale], `${label} key set differs in ${locale}.json`).toEqual(reference)
  }
}

describe("locale parity", () => {
  it("every required notes, audit, trash, bulk, shell and dedup key exists in every locale", () => {
    // Keyed by locale so a failure diff names the offending file and the exact missing keys.
    expect.soft(missingIn(REQUIRED_NOTE_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(REQUIRED_AUDIT_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(REQUIRED_TRASH_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(REQUIRED_BULK_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(SHELL_CONTRACT_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(REQUIRED_DEDUP_KEYS)).toEqual(emptyPerLocale)
  })

  it("the checked-in dedup contract still lists exactly 77 keys", () => {
    // Asserted here rather than left to the reader's arithmetic: the per-group comments in
    // REQUIRED_DEDUP_KEYS say 4+4+13+17+27+3+8+1, and this is what stops that sum drifting silently
    // when a group gains or loses an entry.
    expect(REQUIRED_DEDUP_KEYS).toHaveLength(77)
    expect(new Set(REQUIRED_DEDUP_KEYS).size, "REQUIRED_DEDUP_KEYS lists a key twice").toBe(77)
  })

  it("the notes, audit, trash, bulk, shell and dedup namespaces have identical key sets across all three locales", () => {
    expectIdenticalKeySets(noteKeys, NOTES_NAMESPACE)
    expectIdenticalKeySets(auditKeys, AUDIT_NAMESPACE)
    expectIdenticalKeySets(trashKeys, TRASH_NAMESPACE)
    expectIdenticalKeySets(bulkKeys, BULK_NAMESPACE)
    expectIdenticalKeySets(shellKeys, SHELL_LABEL)
    expectIdenticalKeySets(dedupKeys, DEDUP_NAMESPACE)

    // Stronger than cross-locale identity, and the reason the contract list is checked in: the
    // shipped audit key set must equal REQUIRED_AUDIT_KEYS exactly, so a string added to the
    // namespace without its dot-path going into the list fails here instead of shipping ungated.
    const auditContract = [...REQUIRED_AUDIT_KEYS].sort()
    for (const locale of LOCALES) {
      expect.soft(
        auditKeys[locale],
        `${AUDIT_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(auditContract)
    }

    // Same exact-contract rule for trash, and the same reason.
    const trashContract = [...REQUIRED_TRASH_KEYS].sort()
    for (const locale of LOCALES) {
      expect.soft(
        trashKeys[locale],
        `${TRASH_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(trashContract)
    }

    // Same exact-contract rule for bulk. The bulk contract is entirely inside its own namespace, so
    // this comparison is total: a 45th bulk string that never made it into REQUIRED_BULK_KEYS fails
    // here, which is the half a missing-key check cannot see.
    const bulkContract = [...REQUIRED_BULK_KEYS].sort()
    for (const locale of LOCALES) {
      expect.soft(
        bulkKeys[locale],
        `${BULK_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(bulkContract)
    }

    // Same exact-contract rule for the shell. Total for `admin.nav.*` and `theme.*` plus the two
    // `nav` extras: a 13th admin.nav string that never made it into REQUIRED_SHELL_KEYS fails here.
    // It is NOT total for `nav` — the other 12 nav keys are outside this contract by design.
    const shellContract = [...SHELL_CONTRACT_KEYS].sort()
    for (const locale of LOCALES) {
      expect.soft(
        shellKeys[locale],
        `${SHELL_LABEL} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(shellContract)
    }

    // Same exact-contract rule for dedup, and total for the same reason bulk's is: 39-UI-SPEC adds
    // no dedup string outside the namespace, so a 78th key added without its dot-path going into
    // REQUIRED_DEDUP_KEYS fails here. Every component plan in phase 39 consumes these keys, and a
    // key that does not exist renders its own dot-path to the user (the Phase 45 finding).
    const dedupContract = [...REQUIRED_DEDUP_KEYS].sort()
    for (const locale of LOCALES) {
      expect.soft(
        dedupKeys[locale],
        `${DEDUP_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(dedupContract)
    }
  })

  it("every required notes, audit, trash, bulk, shell and dedup value is a non-empty string", () => {
    expect.soft(blankIn(REQUIRED_NOTE_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(REQUIRED_AUDIT_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(REQUIRED_TRASH_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(REQUIRED_BULK_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(SHELL_CONTRACT_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(REQUIRED_DEDUP_KEYS)).toEqual(emptyPerLocale)
  })

  it("no required notes, audit, trash, bulk, shell or dedup string was left untranslated in both es-ES and pt-BR", () => {
    // An English string copied verbatim into BOTH other locales is a skipped translation, not a
    // coincidence. Matching one locale is plausible (cognates); matching both is not.
    expect.soft(untranslatedInBoth(REQUIRED_NOTE_KEYS)).toEqual([])
    expect.soft(untranslatedInBoth(REQUIRED_AUDIT_KEYS)).toEqual([])
    expect.soft(untranslatedInBoth(REQUIRED_TRASH_KEYS)).toEqual([])
    expect.soft(untranslatedInBoth(REQUIRED_BULK_KEYS)).toEqual([])
    // The three product nouns in IDENTICAL_TRANSLATION_ALLOWED are exempt here, and only here.
    expect.soft(untranslatedInBoth(SHELL_CONTRACT_KEYS)).toEqual([])
    // No dedup key needed an exemption. The two near-misses are dedup.reason.email (pt is
    // "Mesmo e-mail", not the en string) and dedup.merge.movesNotes, whose pt and es are identical
    // TO EACH OTHER ("# nota") but not to en — which is not what this function tests.
    expect.soft(untranslatedInBoth(REQUIRED_DEDUP_KEYS)).toEqual([])
  })

  it("interpolation placeholders survive translation for every required notes, audit, trash, bulk, shell and dedup key", () => {
    // next-intl throws at render time when a message references a placeholder the caller did not
    // pass, so a translator dropping `{from}` breaks the Spanish UI and only the Spanish UI.
    expect.soft(placeholderDrift(REQUIRED_NOTE_KEYS)).toEqual({})
    expect.soft(placeholderDrift(REQUIRED_AUDIT_KEYS)).toEqual({})
    expect.soft(placeholderDrift(REQUIRED_TRASH_KEYS)).toEqual({})
    expect.soft(placeholderDrift(REQUIRED_BULK_KEYS)).toEqual({})
    expect.soft(placeholderDrift(SHELL_CONTRACT_KEYS)).toEqual({})
    expect.soft(placeholderDrift(REQUIRED_DEDUP_KEYS)).toEqual({})
  })

  it("every ICU plural wrapper survives translation", () => {
    // This is a SEPARATE gate, not a stronger reading of the one above. placeholderDrift() cannot
    // see ICU plural syntax at all (see ICU_PLURAL_MARKERS): its regex matches `{word}` only, so
    // `{count, plural, one {# …} other {# …}}` yields an empty expected set and is skipped. A
    // translator flattening the wrapper to a bare sentence would pass every other assertion in this
    // file while making the pt-BR panel say "1 records" — or, once the `#` is gone, no count at all.
    //
    // `expect.soft` since phase 39 took this from one key to eleven: a hard expect would report only
    // the earliest-listed broken wrapper and hide the other ten until it was fixed.
    for (const key of ICU_PLURAL_KEYS) {
      expect
        .soft(icuPluralReport(key), `${key} must keep its {count, plural, …} wrapper in every locale`)
        .toEqual(icuOkPerLocale)
    }
  })

  it("dedup.merge.confirmBody keeps both {loser} occurrences and its single {survivor}", () => {
    // The one key in the catalog that uses a placeholder TWICE. placeholderDrift() above compares
    // de-duplicated sets (see placeholderCounts), so a translation naming the losing record once
    // instead of twice passes every other assertion in this file while quietly dropping the second
    // half of the sentence's promise — that the loser is the record the user can restore.
    for (const locale of LOCALES) {
      const value = resolve(messages[locale], "dedup.merge.confirmBody")
      expect
        .soft(
          typeof value === "string" ? placeholderCounts(value, ["{loser}", "{survivor}"]) : "absent",
          `dedup.merge.confirmBody in ${locale}.json must name the loser twice and the survivor once`,
        )
        .toEqual({ "{loser}": 2, "{survivor}": 1 })
    }
  })

  it("all three locales have identical whole-file key sets", () => {
    // Enabled because measured pre-existing drift was 0 (see the file header). This is the gate
    // that stops the NEXT namespace from drifting, not just `notes`.
    const reference = allKeys[REFERENCE_LOCALE]
    for (const locale of LOCALES) {
      const missing = reference.filter((k) => !allKeys[locale].includes(k))
      const extra = allKeys[locale].filter((k) => !reference.includes(k))
      expect(
        { missing, extra },
        `${locale}.json key set diverges from ${REFERENCE_LOCALE}.json`,
      ).toEqual({ missing: [], extra: [] })
    }
  })
})
