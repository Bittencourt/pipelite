import { readFileSync } from "node:fs"
import { describe, it, expect } from "vitest"

/*
 * The saved-view write guards are PURE and import no database module — `actions.test.ts` asserts
 * that separately — so they can be exercised here. WR-02 is a copy defect whose only stable
 * definition is "the sentence disagrees with this predicate", and a copy assertion that does not
 * consult the predicate is just a second literal to keep in sync.
 */
import { canMutateView, canSeeView, type ViewViewer } from "@/lib/views/write-guards"

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
 * 84 keys in the `audit` namespace plus the 2 dashboard-tile keys that live in the pre-existing
 * `admin.dashboard` namespace — 86. Groups below carry the UI-SPEC's own section names so a key can
 * be found by the surface that renders it.
 *
 * Phase 39 added 4 keys during the phase proper: the two `audit.entry.merged.*` predicates and the
 * two merge detail lines. The list was 81 entries when 39-04 read it (counted from this file, not
 * from a planning document — 39-RESEARCH A7 records that the size is reported inconsistently across
 * documents). Gap-closure plan 39-20 then added a FIFTH, `audit.field.notes`, closing D-39-03: the
 * `notes` column was audited from Phase 36 onwards with no entry in `AUDIT_FIELD_LABELS`, so
 * `describeField` fell through to `humaniseColumn` and every locale rendered the raw English column
 * word. The merge screen was the first surface to EXPOSE it — no earlier screen edits that column —
 * which is why the leak survived three phases of locale gates that were all passing.
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

  // Field labels — 23, covering every audited native column across the four entities. Custom
  // fields are never translated; they render customFieldDefinitions.name verbatim.
  // movedToTrash/restoredFromTrash are FLAT siblings, not a nested object: AUDIT_FIELD_LABELS in
  // src/lib/audit/present.ts maps a column name to a flat dot-path and a nested value breaks it.
  // 23 leaves for 21 mapped columns, and the difference is exactly those two flat siblings: they
  // are the renderer's two direction sentences for `deletedAt`, which has no map entry at all.
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
  "audit.field.notes",

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
 * 80 keys, all inside the `dedup` namespace — like `bulk` and unlike `trash`, this phase adds
 * nothing to `nav` or `admin.dashboard`, which is why `dedupKeys` below needs no `*_EXTRA_KEYS`
 * sibling and the comparison against this list is TOTAL: an 81st dedup string that never made it
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

  // Review list — 19. Three distinct emptinesses, three distinct headings: never scanned, scanned
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
  // The undismiss failure needs its own sentence, added by plan 39-13. `dismissFailed` says "That
  // pair wasn't dismissed", which is the OPPOSITE of what is true when moving a pair back out of the
  // dismissed list fails — it is still dismissed, and that is the problem being reported. Reusing it
  // would tell the user the one thing that is false about the state they are in.
  "dedup.review.undismissFailed",
  "dedup.review.loadMore",
  "dedup.review.emptyNeverScanned",
  "dedup.review.emptyNeverScannedBody",
  "dedup.review.emptyNoPairs",
  "dedup.review.emptyNoPairsBody",
  "dedup.review.emptyAllDismissed",
  // The FOURTH thing an empty tab can be, and the one that is not an emptiness at all: `listPairs`
  // returns `{ ok: false }` rather than an empty success precisely so a failed read is
  // distinguishable from "no duplicates found", and a degraded panel therefore needs its own
  // sentence. `errors.somethingWentWrong` is forbidden on this surface (UI-SPEC: every error in this
  // phase names its problem), and `trash.error.unavailable` is the same sentence about a different
  // list.
  "dedup.review.unavailable",

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

  // Identity fields — 9. The admin control that names which custom fields act as the organization
  // identity key. `help` states the degradation explicitly, because until a field is chosen new
  // organizations get no create-time check at all and silence there would read as a working feature.
  // `unsupported` is the SECOND application of that same rule, added in plan 39-21: the picker now
  // offers only text fields, so a configuration stored before that — or one whose field was renamed
  // or retyped since — names a field that cannot work, and being told beats inferring it from a
  // duplicate warning that never appears.
  "dedup.identity.title",
  "dedup.identity.help",
  "dedup.identity.primaryLabel",
  "dedup.identity.secondaryLabel",
  "dedup.identity.none",
  "dedup.identity.save",
  "dedup.identity.saved",
  "dedup.identity.saveFailed",
  "dedup.identity.unsupported",

  // Entry point — 1
  "dedup.findDuplicates",
]

/**
 * The copy contract from 40-UI-SPEC.md § New message keys. Same rule as the six lists above: a
 * `views.*` string reaching the UI means its dot-path is added here first, and the exact-contract
 * assertion below turns a string that skipped this list into a red suite rather than copy that ships
 * gated by nothing.
 *
 * 62 keys — 61 from phase 40, plus `views.export.tooBroad` from plan 50-02 — every one of them
 * inside the `views` namespace. Like `bulk` and `dedup`, and unlike
 * `audit`, `trash` and `shell`, phase 40 adds NOTHING outside its own namespace — no `nav` entry, no
 * `admin.dashboard` tile — so `viewsKeys` below needs no `*_EXTRA_KEYS` sibling and the comparison
 * against this list is TOTAL: a 63rd `views` string that never made it into this array fails, which
 * is the half a missing-key check cannot see. `audit`, `trash` and `shell` each need an extras array
 * precisely because their contracts straddle a pre-existing namespace they must not swallow whole.
 *
 * Phase 40 REUSES four existing strings verbatim rather than restating them here: `bulk.exported` and
 * `bulk.error.exportFailed` for the export toasts, and `common.cancel` / `common.close` for the
 * dialogs. They belong to their own contracts and are deliberately absent from this one.
 *
 * The per-group counts in the comments are load-bearing: they are how a reader sees at a glance that
 * a group lost a key.
 */
export const REQUIRED_VIEWS_KEYS: string[] = [
  // The bar and the picker — 18. `badgeShared` / `badgePrivate` are the words that carry the
  // shared-vs-private distinction: the phase-39 convention is that state reads as WORDS, never
  // colour alone, so a shared view has to be distinguishable from a private one in text.
  // `ownerUnavailable` is the fallback for a soft-deleted owner — six such users exist — and
  // `ownedBy` must read correctly when {owner} is an email, because two of three live users have
  // name = NULL.
  "views.picker.label",
  "views.allRecords",
  "views.modified",
  "views.groupMine",
  "views.groupShared",
  "views.badgeShared",
  "views.badgePrivate",
  "views.badgeDefault",
  "views.ownedBy",
  "views.ownerUnavailable",
  "views.emptyMenu",
  "views.saveNew",
  "views.saveChanges",
  "views.manageAction",
  "views.exportAction",
  "views.exporting",
  "views.needsFilter",
  "views.degraded",

  // The save / update dialog — 22. `privateHelp` is the ONLY place the user learns that a private
  // view is hidden from admins too, which is this phase's one departure from the app's
  // `owner || role === "admin"` idiom (T-40-11). A mistranslation there is a false security promise,
  // so all three locales are transcribed from the signed-off spec rather than machine-translated.
  // `targetNewOnly` is the refusal that explains itself instead of silently disabling a radio.
  "views.save.titleNew",
  "views.save.titleUpdate",
  "views.save.description",
  "views.save.nameLabel",
  "views.save.namePlaceholder",
  "views.save.nameRequired",
  "views.save.nameTaken",
  "views.save.targetLegend",
  "views.save.targetUpdate",
  "views.save.targetNew",
  "views.save.targetNewOnly",
  "views.save.sharedLabel",
  "views.save.sharedHelp",
  "views.save.privateHelp",
  "views.save.defaultLabel",
  "views.save.defaultHelp",
  "views.save.submit",
  "views.save.submitting",
  "views.save.created",
  "views.save.updated",
  "views.save.failed",
  "views.save.noFilters",

  // The manage dialog — 13. `share` / `unshare` and `setDefault` / `clearDefault` are four separate
  // strings rather than two toggles with an {on} placeholder, because es-ES and pt-BR inflect the
  // adjective with the noun's gender and "Predeterminada" cannot be assembled from parts.
  "views.manage.title",
  "views.manage.description",
  "views.manage.empty",
  "views.manage.emptyBody",
  "views.manage.share",
  "views.manage.unshare",
  "views.manage.setDefault",
  "views.manage.clearDefault",
  "views.manage.delete",
  "views.manage.readOnly",
  "views.manage.filterCount",
  "views.manage.saved",
  "views.manage.failed",

  // The delete confirmation — 5. `body` is the phase's blast-radius sentence and states all three
  // categories: what DISAPPEARS (the view, for everyone who selected it), what CHANGES (their list
  // falls back to all records), and what SURVIVES (the records themselves).
  "views.delete.title",
  "views.delete.body",
  "views.delete.action",
  "views.delete.success",
  "views.delete.failed",

  // Export — 4, and only what `bulk.*` cannot say. `disabledReason` is an advisory, never red (C-1):
  // an unfiltered export is refused, and the refusal explains itself rather than leaving a control
  // dead with no reason given.
  //
  // `tooBroad` is the fourth, added by plan 50-02, and it is a SEPARATE key rather than a reword of
  // either sibling because it belongs to a different moment. `disabledReason` is the PRE-submit
  // advisory, computed client-side from `canExport`, which cannot know how many rows a filter
  // matches; `tooBroad` is the POST-submit refusal, and it names the two counts the SERVER measured
  // (`{matched}` of `{total}`) so a user who is refused can act on the number rather than guess.
  // Phase 40's G-2 already had to reword `disabledReason` once — do not merge these two back
  // together, and do not fold `tooBroad` into `tooMany`, which speaks about the absolute
  // `EXPORT_ROW_CAP` and not about selectivity.
  "views.export.disabledReason",
  "views.export.tooMany",
  "views.export.refused",
  "views.export.tooBroad",
]

/**
 * The copy contract from 41-UI-SPEC.md § New message keys. Same rule as the seven lists above: a
 * `workflows.*` string reaching the UI means its dot-path is added here first, and the exact-contract
 * assertion below turns a string that skipped this list into a red suite rather than copy that ships
 * gated by nothing.
 *
 * This contract is **TOTAL**. 41-UI-SPEC declares no `workflows.*` string outside the namespace — no
 * `nav` entry, no `admin.dashboard` tile — so `workflowsKeys` below needs no `*_EXTRA_KEYS` sibling
 * and the comparison against this array is exact in both directions: a `workflows` string that never
 * entered this array fails here, which is the half a missing-key check cannot see. Contrast
 * `auditKeys`, `trashKeys` and `shellKeys`, each of which needs an extras array because its contract
 * straddles a pre-existing namespace a whole-namespace scope would swallow.
 *
 * DELIBERATELY NOT IN THIS LIST, and this is what keeps the "total" claim true rather than
 * decorative (41-UI-SPEC L-41-2): the two `settings.notifications.*` keys and the five
 * `emails.workflowFailed.*` keys this phase also adds. They live in pre-existing namespaces, they are
 * covered by the whole-file parity assertion at the bottom of this file, and they are carried
 * separately below as WORKFLOW_SETTINGS_KEYS / WORKFLOW_EMAIL_KEYS. Widening this array to reach into
 * `settings` or `emails` would make the exact-contract comparison for the `workflows` namespace fail
 * on keys that are not in it — i.e. it would force the addition of an "extras" escape hatch and
 * destroy exactly the property the list exists to have.
 *
 * NO LENGTH IS PINNED HERE, on purpose — see the no-duplicates test below for why.
 */
export const REQUIRED_WORKFLOWS_KEYS: string[] = [
  // Replay. `confirmBody` is this phase's blast-radius sentence and the ONLY warning an operator gets
  // before duplicating every already-succeeded side effect of a failed run: it must keep enumerating
  // emails, outgoing requests AND record changes in all three locales (T-41-14). `lineage` carries the
  // phase's one and only interpolation, `{runId}`.
  "workflows.replay.action",
  "workflows.replay.confirmTitle",
  "workflows.replay.confirmBody",
  "workflows.replay.confirmAction",
  "workflows.replay.pending",
  "workflows.replay.success",
  "workflows.replay.error",
  "workflows.replay.lineage",

  // Dry run. `action` and `badge` are byte-identical in en-US ("Test run") and are still two keys: one
  // is an imperative control, the other a noun label on a table row, and they diverge in translation
  // (pt-BR "Executar teste" vs "Teste"). `notAnObject` deliberately names "a JSON object with named
  // fields" instead of showing brace syntax — see the literal-brace gate below. `description` states
  // what is SIMULATED, a factual property of the execution, never what the operator will conclude
  // (F-41-1); the proof of non-mutation is the changed-records panel reading empty.
  "workflows.dryRun.action",
  "workflows.dryRun.dirtyHint",
  "workflows.dryRun.title",
  "workflows.dryRun.description",
  "workflows.dryRun.triggerDataLabel",
  "workflows.dryRun.prefilledHint",
  "workflows.dryRun.emptyHint",
  "workflows.dryRun.invalidJson",
  "workflows.dryRun.notAnObject",
  "workflows.dryRun.submit",
  "workflows.dryRun.running",
  "workflows.dryRun.timeout",
  "workflows.dryRun.error",
  "workflows.dryRun.badge",
  "workflows.dryRun.showInList",
]

/**
 * The two strings phase 41 adds to the PRE-EXISTING `settings.notifications` namespace, for the
 * `emailWorkflowFailed` preference toggle. Held apart from REQUIRED_WORKFLOWS_KEYS so that contract
 * stays total (41-UI-SPEC L-41-2); gated here for presence, blankness, translation and braces.
 */
const WORKFLOW_SETTINGS_KEYS: string[] = [
  "settings.notifications.workflowFailed",
  "settings.notifications.workflowFailedDescription",
]

/**
 * The failure-alert email template, localised per 41-CONTEXT amendment A5 / D-A5. This is a
 * documented ADDITION to 41-UI-SPEC's published manifest, not a silent divergence: the two
 * un-localised templates (`workflow-email.ts`, `workflow-notification.ts`) carry USER-AUTHORED content
 * a workflow supplied, while the seven localised ones carry the app's own voice. A failure alert is
 * the app's own voice, its recipient is a real `users` row, and `users.locale` exists
 * (`src/db/schema/users.ts:20`), so it is localised. Shape copied from `emails.activityReminder`
 * (`{ subject, heading, body, buttonText }`) plus `errorLabel`.
 *
 * There is deliberately NO `{errorMessage}` placeholder (T-41-15). `workflow_runs.error` can carry
 * 200 characters of an HTTP response body (`src/lib/execution/actions/http.ts:109-111`), and a `{`
 * inside a message next-intl is PARSING throws at render. The run error is therefore escaped and
 * rendered outside the translator, beside `errorLabel`, by plan 41-08.
 */
const WORKFLOW_EMAIL_KEYS: string[] = [
  "emails.workflowFailed.subject",
  "emails.workflowFailed.heading",
  "emails.workflowFailed.body",
  "emails.workflowFailed.errorLabel",
  "emails.workflowFailed.buttonText",
]

/** Every key phase 41 authors, across all three namespaces — the scope of the two gates G-5 and G-9. */
const PHASE_41_AUTHORED_KEYS: string[] = [
  ...REQUIRED_WORKFLOWS_KEYS,
  ...WORKFLOW_SETTINGS_KEYS,
  ...WORKFLOW_EMAIL_KEYS,
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
const VIEWS_NAMESPACE = "views"
const WORKFLOWS_NAMESPACE = "workflows"
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
// Same again, and the strongest case of it so far: 40-UI-SPEC adds zero strings outside `views` —
// no `nav` entry and no `admin.dashboard` tile — so this scope IS the whole contract and the
// comparison against REQUIRED_VIEWS_KEYS below is total. Contrast `auditKeys`, `trashKeys` and
// `shellKeys` above, each of which needs an extras array because its contract straddles a
// pre-existing namespace that a whole-namespace scope would swallow.
const viewsKeys = keysMatching(inNamespace(VIEWS_NAMESPACE))
// Same again for phase 41: 41-UI-SPEC adds zero strings outside `workflows` that belong to the
// `workflows` contract — the two `settings.notifications.*` and five `emails.workflowFailed.*` keys
// live in their own namespaces and are carried by WORKFLOW_SETTINGS_KEYS / WORKFLOW_EMAIL_KEYS — so
// this scope IS the whole contract and the comparison against REQUIRED_WORKFLOWS_KEYS below is total.
const workflowsKeys = keysMatching(inNamespace(WORKFLOWS_NAMESPACE))
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
 * G-5 (F-41-1) — the phrases a message value must not use to claim that nothing changed.
 *
 * 41-CONTEXT § Specific Ideas: *"An empty list that is normally populated is evidence; a reassuring
 * sentence is not."* The dry run's proof of non-mutation is the existing changed-records panel
 * reading empty, and a sentence asserting the same thing is worse than nothing — it makes a promise
 * the copy cannot keep, on the exact surface where the operator decides whether the run was safe.
 * `workflows.dryRun.description` is allowed to say what is SIMULATED, which is a factual property of
 * the execution; it is not allowed to say what the operator will conclude.
 *
 * The pre-existing `audit.run.empty` is NOT in scope and is NOT a violation. This rule is about
 * AUTHORSHIP — what phase 41 writes — not about grammar, and it is scoped to
 * PHASE_41_AUTHORED_KEYS for that reason. A rule that swept the whole catalog would be a
 * retro-active copy edit of six earlier phases dressed up as a gate.
 */
const ABSENCE_ASSERTION_PHRASES: string[] = [
  "no records were changed",
  "nothing happened",
  "nothing was changed",
  "no changes were made",
  "nenhum registro",
  "ningún registro",
  "nada foi",
  "nada ha",
]

/**
 * Which of `required` assert an absence, keyed `key (locale)`, plus how many values were examined so
 * the caller can prove the scan was not vacuous.
 */
function absenceAssertionsIn(required: string[]): {
  offenders: Record<string, string[]>
  scanned: number
} {
  const offenders: Record<string, string[]> = {}
  let scanned = 0
  for (const key of required) {
    for (const locale of LOCALES) {
      const value = resolve(messages[locale], key)
      if (typeof value !== "string") continue
      scanned += 1
      const lower = value.toLowerCase()
      const hits = ABSENCE_ASSERTION_PHRASES.filter((phrase) => lower.includes(phrase))
      if (hits.length > 0) offenders[`${key} (${locale})`] = hits
    }
  }
  return { offenders, scanned }
}

/**
 * G-9 (L-41-1) — which of `required` carry a literal `{` or `}` outside a recognised placeholder,
 * keyed `key (locale)`, plus how many values were examined.
 *
 * Every `/\{[a-zA-Z0-9_]+\}/g` match is stripped first, so `{runId}` and `{workflowName}` survive and
 * a message showing brace syntax as an example — *"start again from {}"* — does not. This is an
 * AVAILABILITY control, not a style rule: next-intl reads `{` as a placeholder delimiter, so such a
 * message throws at render and takes the whole page down, in one locale only, with nothing else in
 * this repo catching it (T-41-13).
 */
function literalBracesIn(required: string[]): {
  offenders: Record<string, string>
  scanned: number
} {
  const offenders: Record<string, string> = {}
  let scanned = 0
  for (const key of required) {
    for (const locale of LOCALES) {
      const value = resolve(messages[locale], key)
      if (typeof value !== "string") continue
      scanned += 1
      const withoutPlaceholders = value.replace(/\{[a-zA-Z0-9_]+\}/g, "")
      if (withoutPlaceholders.includes("{") || withoutPlaceholders.includes("}")) {
        offenders[`${key} (${locale})`] = value
      }
    }
  }
  return { offenders, scanned }
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
 *
 * Twelve keys: eleven from phases 38 and 39, plus `views.manage.filterCount` from phase 40 — the one
 * and only ICU plural among that phase's 61 strings (T-40-12). It must be listed here or its
 * `{count, plural, …}` wrapper can be flattened in translation with nothing failing, because
 * `placeholderDrift()` is structurally blind to that syntax.
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
  "views.manage.filterCount",
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
  it("every required notes, audit, trash, bulk, shell, dedup, views and workflows key exists in every locale", () => {
    // Keyed by locale so a failure diff names the offending file and the exact missing keys.
    expect.soft(missingIn(REQUIRED_NOTE_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(REQUIRED_AUDIT_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(REQUIRED_TRASH_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(REQUIRED_BULK_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(SHELL_CONTRACT_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(REQUIRED_DEDUP_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(REQUIRED_VIEWS_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(REQUIRED_WORKFLOWS_KEYS)).toEqual(emptyPerLocale)
    // The two namespaces phase 41 reaches into are gated for presence here rather than inside
    // REQUIRED_WORKFLOWS_KEYS, which stays total (L-41-2). Presence matters as much for these as for
    // the namespaced keys: a key rendered without existing renders its own dot-path to the user (the
    // Phase 45 finding, see :419), and `emails.workflowFailed.*` renders into an EMAIL, where a raw
    // dot-path cannot be corrected after the fact.
    expect.soft(missingIn(WORKFLOW_SETTINGS_KEYS)).toEqual(emptyPerLocale)
    expect.soft(missingIn(WORKFLOW_EMAIL_KEYS)).toEqual(emptyPerLocale)
  })

  it("the checked-in workflows contract lists no key twice", () => {
    // NO LENGTH IS PINNED, and that is a decision rather than an omission. `locale-parity.test.ts`
    // already records at the phase-40 block below that EVERY key count quoted in the phase-40
    // planning documents was wrong, because a naive count over an array literal also counts the
    // dot-paths quoted inside its explanatory comments. Phase 41's own documents reproduce the
    // problem and disagree with each other: 41-UI-SPEC.md § New message keys says 25 keys,
    // 41-VALIDATION.md says 23. Both figures are DESCRIPTIVE; this array is NORMATIVE.
    //
    // So there is deliberately no `toHaveLength(n)` on REQUIRED_WORKFLOWS_KEYS anywhere in this file,
    // and no `WORKFLOWS:` row was added to the pre-existing pinned-length test below. What the pinned
    // length was actually buying — catching a list that repeats one dot-path and drops another, which
    // the exact-set comparison shows only as a confusing diff — is bought here instead, in the
    // count-free form. It is self-referential and therefore cannot be wrong.
    expect(
      new Set(REQUIRED_WORKFLOWS_KEYS).size,
      "REQUIRED_WORKFLOWS_KEYS lists a key twice",
    ).toBe(REQUIRED_WORKFLOWS_KEYS.length)
    expect(new Set(WORKFLOW_SETTINGS_KEYS).size, "WORKFLOW_SETTINGS_KEYS lists a key twice").toBe(
      WORKFLOW_SETTINGS_KEYS.length,
    )
    expect(new Set(WORKFLOW_EMAIL_KEYS).size, "WORKFLOW_EMAIL_KEYS lists a key twice").toBe(
      WORKFLOW_EMAIL_KEYS.length,
    )
    // And the three lists must not overlap, which is what makes "total for `workflows`" checkable:
    // a `workflows.*` dot-path smuggled into either sibling array would be gated twice and excluded
    // from the exact-contract comparison by neither, but the overlap would go unnoticed.
    expect(
      new Set(PHASE_41_AUTHORED_KEYS).size,
      "the three phase-41 key lists overlap",
    ).toBe(PHASE_41_AUTHORED_KEYS.length)
    expect(
      WORKFLOW_SETTINGS_KEYS.concat(WORKFLOW_EMAIL_KEYS).filter((k) =>
        inNamespace(WORKFLOWS_NAMESPACE)(k),
      ),
      "a `workflows.*` key was put in a sibling list, which would exempt it from the total contract",
    ).toEqual([])
  })

  it("the checked-in dedup contract still lists exactly 80 keys", () => {
    // Asserted here rather than left to the reader's arithmetic: the per-group comments in
    // REQUIRED_DEDUP_KEYS say 4+4+13+19+27+3+9+1, and this is what stops that sum drifting silently
    // when a group gains or loses an entry. The review group went 17 -> 18 in plan 39-11, which is
    // where the degraded-read panel got a sentence of its own, and 18 -> 19 in plan 39-13, which is
    // where the undismiss failure got one. The identity group went 8 -> 9 in plan 39-21, which is
    // where a configured field the picker can no longer offer got a sentence of its own.
    expect(REQUIRED_DEDUP_KEYS).toHaveLength(80)
    expect(new Set(REQUIRED_DEDUP_KEYS).size, "REQUIRED_DEDUP_KEYS lists a key twice").toBe(80)
  })

  it("the checked-in views contract still lists exactly 62 keys", () => {
    // The dedup test above is the precedent, and the duplicate guard is carried for the same reason:
    // toHaveLength alone passes a list that repeats one dot-path and omits another, because the
    // exact-set comparison further down compares against a sorted array and a duplicate in the
    // contract would show up there as a confusing diff rather than as "you listed a key twice".
    // The per-group comments in REQUIRED_VIEWS_KEYS say 18+22+13+5+4, and this is what stops that
    // sum drifting silently when a group gains or loses an entry. The export group went 3 -> 4 in
    // plan 50-02, which is where the POST-submit selectivity refusal got a sentence of its own
    // rather than a reword of `disabledReason`'s PRE-submit advisory.
    expect(REQUIRED_VIEWS_KEYS).toHaveLength(62)
    expect(new Set(REQUIRED_VIEWS_KEYS).size, "REQUIRED_VIEWS_KEYS lists a key twice").toBe(62)
  })

  // Phase 40 adds one namespace and touches no other contract. This asserts that, because every
  // key count quoted in 40-UI-SPEC.md M-13 and 40-CONTEXT.md A5 for these four arrays is WRONG (a
  // naive count over the array literal also counts the quoted dot-paths inside the explanatory
  // comments), and the tempting "correction" is to edit the array until it matches the document.
  // The lengths below were read from THIS FILE by evaluating the module, and the file wins.
  //
  // In particular: this phase reuses `bulk.exported` and `bulk.error.exportFailed` verbatim, so if
  // you find yourself editing REQUIRED_BULK_KEYS, you have added a key you were told to reuse.
  it("the four pre-existing pinned key sets are unchanged by phase 40", () => {
    expect.soft(REQUIRED_AUDIT_KEYS, "phase 40 adds no audit key").toHaveLength(86)
    expect.soft(REQUIRED_TRASH_KEYS, "phase 40 adds no trash key").toHaveLength(63)
    expect
      .soft(REQUIRED_BULK_KEYS, "phase 40 REUSES bulk.exported and bulk.error.exportFailed")
      .toHaveLength(46)
    expect.soft(REQUIRED_DEDUP_KEYS, "phase 40 adds no dedup key").toHaveLength(80)
  })

  it("the notes, audit, trash, bulk, shell, dedup, views and workflows namespaces have identical key sets across all three locales", () => {
    expectIdenticalKeySets(noteKeys, NOTES_NAMESPACE)
    expectIdenticalKeySets(auditKeys, AUDIT_NAMESPACE)
    expectIdenticalKeySets(trashKeys, TRASH_NAMESPACE)
    expectIdenticalKeySets(bulkKeys, BULK_NAMESPACE)
    expectIdenticalKeySets(shellKeys, SHELL_LABEL)
    expectIdenticalKeySets(dedupKeys, DEDUP_NAMESPACE)
    expectIdenticalKeySets(viewsKeys, VIEWS_NAMESPACE)
    expectIdenticalKeySets(workflowsKeys, WORKFLOWS_NAMESPACE)

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
    // no dedup string outside the namespace, so an 80th key added without its dot-path going into
    // REQUIRED_DEDUP_KEYS fails here. Every component plan in phase 39 consumes these keys, and a
    // key that does not exist renders its own dot-path to the user (the Phase 45 finding).
    const dedupContract = [...REQUIRED_DEDUP_KEYS].sort()
    for (const locale of LOCALES) {
      expect.soft(
        dedupKeys[locale],
        `${DEDUP_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(dedupContract)
    }

    // Same exact-contract rule for views, and total for the same reason bulk's and dedup's are:
    // 40-UI-SPEC adds no `views` string outside the namespace, so a 63rd key added without its
    // dot-path going into REQUIRED_VIEWS_KEYS fails here. Every UI plan in waves 3-5 of phase 40
    // consumes these keys, and a key that does not exist renders its own dot-path to the user (the
    // Phase 45 finding).
    const viewsContract = [...REQUIRED_VIEWS_KEYS].sort()
    for (const locale of LOCALES) {
      expect.soft(
        viewsKeys[locale],
        `${VIEWS_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(viewsContract)
    }

    // Same exact-contract rule for workflows, and total for the same reason bulk's, dedup's and
    // views' are: 41-UI-SPEC adds no `workflows.*` string outside the namespace, so a key added
    // without its dot-path going into REQUIRED_WORKFLOWS_KEYS fails here. Every UI plan in phase 41
    // consumes these keys, and a key that does not exist renders its own dot-path to the user (the
    // Phase 45 finding, :419).
    //
    // ANTI-VACUITY, and it matters more here than for the six contracts above, because the two scans
    // at the bottom of this file (G-5 and G-9) iterate this same key set. `keysMatching` returning
    // `[]` for a namespace that does not exist would make the `toEqual` below fail loudly — good —
    // but a later refactor of `inNamespace` that silently matched nothing would leave those two scans
    // examining zero values and passing. The HARD non-empty assertion closes that; it is deliberately
    // not `expect.soft`, so a vacuous scope aborts this block instead of being one line of a diff.
    for (const locale of LOCALES) {
      expect(
        workflowsKeys[locale].length,
        `the ${WORKFLOWS_NAMESPACE} scope is empty in ${locale}.json — every assertion scoped to it ` +
          `is vacuous, including the G-5 and G-9 scans`,
      ).toBeGreaterThan(0)
    }
    const workflowsContract = [...REQUIRED_WORKFLOWS_KEYS].sort()
    for (const locale of LOCALES) {
      expect.soft(
        workflowsKeys[locale],
        `${WORKFLOWS_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(workflowsContract)
    }
  })

  it("every required notes, audit, trash, bulk, shell, dedup, views and workflows value is a non-empty string", () => {
    expect.soft(blankIn(REQUIRED_NOTE_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(REQUIRED_AUDIT_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(REQUIRED_TRASH_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(REQUIRED_BULK_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(SHELL_CONTRACT_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(REQUIRED_DEDUP_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(REQUIRED_VIEWS_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(REQUIRED_WORKFLOWS_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(WORKFLOW_SETTINGS_KEYS)).toEqual(emptyPerLocale)
    expect.soft(blankIn(WORKFLOW_EMAIL_KEYS)).toEqual(emptyPerLocale)
  })

  it("no required notes, audit, trash, bulk, shell, dedup, views or workflows string was left untranslated in both es-ES and pt-BR", () => {
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
    // No views key needed an exemption either, and IDENTICAL_TRANSLATION_ALLOWED is unchanged at
    // three entries. The three near-misses are views.modified (pt and es are both "Modificada"),
    // views.manage.filterCount and views.export.disabledReason — each identical TO THE OTHER
    // NON-ENGLISH LOCALE, which is not what this function tests, and all three differ from en-US.
    // Extending the allowlist to make a translation pass would be the wrong fix; this line is here
    // to prove by RUNNING that no such fix is needed.
    expect.soft(untranslatedInBoth(REQUIRED_VIEWS_KEYS)).toEqual([])
    // No workflows key needed an exemption either, and IDENTICAL_TRANSLATION_ALLOWED is still three
    // entries. The pair to watch is `workflows.dryRun.action` and `workflows.dryRun.badge`, which are
    // byte-identical in en-US ("Test run") and must still diverge in BOTH other locales — pt-BR
    // "Executar teste" (the imperative control) vs "Teste" (the noun row label), es-ES "Ejecutar
    // prueba" vs "Prueba". Two keys carrying one English string is the shape a translator is most
    // likely to collapse, which is why 41-UI-SPEC states the intended divergence rather than leaving
    // it to be discovered.
    expect.soft(untranslatedInBoth(REQUIRED_WORKFLOWS_KEYS)).toEqual([])
    expect.soft(untranslatedInBoth(WORKFLOW_SETTINGS_KEYS)).toEqual([])
    // `emails.workflowFailed.errorLabel` is the near-miss: es-ES "Error" IS byte-identical to en-US,
    // and passes because pt-BR is "Erro" — this function tests for a value copied into BOTH locales,
    // which is a skipped translation, not for a cognate in one.
    expect.soft(untranslatedInBoth(WORKFLOW_EMAIL_KEYS)).toEqual([])
  })

  it("the dryRun control and the dryRun badge stay two distinct strings in every locale", () => {
    // The one assertion untranslatedInBoth() structurally cannot make. `dryRun.action` and
    // `dryRun.badge` are BOTH "Test run" in en-US, so a translator who renders them identically in
    // pt-BR too produces two values that differ from en-US — passing every assertion above — while
    // collapsing the distinction the two keys exist for: one is a button that starts a test run, the
    // other is a label on a row that already is one. If they were meant to be one string they would
    // be one key.
    for (const locale of LOCALES) {
      if (locale === REFERENCE_LOCALE) continue
      const action = resolve(messages[locale], "workflows.dryRun.action")
      const badge = resolve(messages[locale], "workflows.dryRun.badge")
      expect
        .soft(
          action === badge,
          `${locale}.json: workflows.dryRun.action and workflows.dryRun.badge are the same string ` +
            `("${action}"). They are identical in en-US and must diverge in translation — the ` +
            `imperative control vs the noun row label (41-UI-SPEC § New message keys).`,
        )
        .toBe(false)
    }
  })

  it("no string phase 41 authors asserts that nothing changed (G-5 / F-41-1)", () => {
    // 41-CONTEXT § Specific Ideas: "An empty list that is normally populated is evidence; a
    // reassuring sentence is not." The dry run proves non-mutation by the changed-records panel
    // reading empty, and a sentence claiming the same thing is a promise the copy cannot keep on the
    // exact surface where the operator decides whether the run was safe.
    const { offenders, scanned } = absenceAssertionsIn(PHASE_41_AUTHORED_KEYS)
    // Anti-vacuity first and hard: the scan skips keys that do not resolve, so an empty offender map
    // is meaningless until the scan is known to have examined every authored value in every locale.
    expect(
      scanned,
      "the G-5 scan examined fewer values than phase 41 authors — it is partly vacuous",
    ).toBe(PHASE_41_AUTHORED_KEYS.length * LOCALES.length)
    expect(
      offenders,
      `a phase-41 message value asserts an absence. 41-CONTEXT § Specific Ideas: "An empty list ` +
        `that is normally populated is evidence; a reassuring sentence is not." State what is ` +
        `SIMULATED (a factual property of the execution), never what the operator will conclude.`,
    ).toEqual({})
  })

  it("no string phase 41 authors contains a literal brace outside a placeholder (G-9 / L-41-1)", () => {
    const { offenders, scanned } = literalBracesIn(PHASE_41_AUTHORED_KEYS)
    expect(
      scanned,
      "the G-9 scan examined fewer values than phase 41 authors — it is partly vacuous",
    ).toBe(PHASE_41_AUTHORED_KEYS.length * LOCALES.length)
    expect(
      offenders,
      `a phase-41 message value contains a literal { or }. next-intl reads { as a placeholder ` +
        `delimiter and THROWS AT RENDER, in that locale only, taking the whole page down — no ` +
        `typecheck, lint or build step catches it. Recognised placeholders such as {runId} and ` +
        `{workflowName} are stripped before this check, so what is left is brace syntax shown as ` +
        `copy: describe it in words instead ("a JSON object with named fields").`,
    ).toEqual({})
  })

  it("the failure-alert template interpolates the workflow name and never the run error (T-41-15)", () => {
    // Two halves, and the second is the one that matters. `workflow_runs.error` can carry 200
    // characters of an HTTP response body (`src/lib/execution/actions/http.ts:109-111`), so a run
    // error containing a `{` would be interpolated into a message next-intl is PARSING and throw at
    // send time. Plan 41-08 escapes it and renders it outside the translator, beside `errorLabel`;
    // this assertion is what stops a later edit from "simplifying" that back into a placeholder.
    for (const locale of LOCALES) {
      for (const key of ["emails.workflowFailed.subject", "emails.workflowFailed.body"]) {
        expect
          .soft(
            placeholders(resolve(messages[locale], key) ?? ""),
            `${locale}.json: ${key} must name the workflow`,
          )
          .toEqual(["{workflowName}"])
      }
      const errorish = WORKFLOW_EMAIL_KEYS.flatMap((key) =>
        placeholders(resolve(messages[locale], key) ?? "")
          .filter((token) => /error/i.test(token))
          .map((token) => `${key} → ${token}`),
      )
      expect
        .soft(
          errorish,
          `${locale}.json: emails.workflowFailed.* must not interpolate the run error. It is ` +
            `attacker-influenced text that can contain a brace, and next-intl throws at render on ` +
            `a brace inside a message it is parsing (T-41-15).`,
        )
        .toEqual([])
    }
  })

  it("interpolation placeholders survive translation for every required notes, audit, trash, bulk, shell, dedup, views and workflows key", () => {
    // next-intl throws at render time when a message references a placeholder the caller did not
    // pass, so a translator dropping `{from}` breaks the Spanish UI and only the Spanish UI.
    expect.soft(placeholderDrift(REQUIRED_NOTE_KEYS)).toEqual({})
    expect.soft(placeholderDrift(REQUIRED_AUDIT_KEYS)).toEqual({})
    expect.soft(placeholderDrift(REQUIRED_TRASH_KEYS)).toEqual({})
    expect.soft(placeholderDrift(REQUIRED_BULK_KEYS)).toEqual({})
    expect.soft(placeholderDrift(SHELL_CONTRACT_KEYS)).toEqual({})
    expect.soft(placeholderDrift(REQUIRED_DEDUP_KEYS)).toEqual({})
    // Eleven of the 62 views keys interpolate: views.ownedBy and views.manage.readOnly take
    // {owner}; views.save.nameTaken, views.save.targetUpdate, views.save.created,
    // views.save.updated, views.delete.body and views.delete.success take {name};
    // views.save.targetNewOnly takes both; views.export.tooMany takes {max}; and
    // views.export.tooBroad takes {matched} AND {total} — the only views key with two DISTINCT
    // numeric arguments, which is why plan 50-02 also proves it RESOLVES rather than only that the
    // brace names survive (see export-too-broad-copy.test.ts).
    expect.soft(placeholderDrift(REQUIRED_VIEWS_KEYS)).toEqual({})
    // Exactly one of the 23 workflows keys interpolates: workflows.replay.lineage takes {runId}
    // (41-UI-SPEC L-41-1 — this phase has one interpolation and no ICU plural). The brace name must
    // be byte-identical in all three locales; a translated placeholder NAME is a drift failure, and
    // at render time it is a next-intl throw rather than a cosmetic defect.
    expect.soft(placeholderDrift(REQUIRED_WORKFLOWS_KEYS)).toEqual({})
    expect.soft(placeholderDrift(WORKFLOW_SETTINGS_KEYS)).toEqual({})
    // {workflowName} in both emails.workflowFailed.subject and .body. There is no {errorMessage}:
    // the run error is escaped and rendered outside the translator (T-41-15).
    expect.soft(placeholderDrift(WORKFLOW_EMAIL_KEYS)).toEqual({})
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
    //
    // Still the ONLY key in the catalog that does this, after phase 40 and after plan 50-02. Not
    // one of the 62 `views.*` strings repeats a placeholder — the eleven that interpolate use each
    // token exactly once (L-4), `views.export.tooBroad` included: it names {matched} once and
    // {total} once, which is two distinct tokens and not one token twice —
    // so a `views` analogue of this assertion would be vacuous and is deliberately not written. If
    // a future views string ever names the same record twice, it earns its own block here.
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

  /**
   * WR-02 — `views.save.sharedHelp` PROMISED A GUARANTEE THE SERVER DOES NOT ENFORCE.
   *
   * The helper text under the "Share with the team" checkbox read:
   *
   *     "Teammates can select this view and set it as their default. Only you can edit or delete it."
   *
   * The second sentence was false. `canMutateView` grants edit and delete to `role === "admin"` on
   * ANY view, which is the app's documented intent (40-CONTEXT: "only the owner (or an admin) may
   * edit or delete a view"). The user was being told a stronger guarantee than the one that exists,
   * on the exact surface where they decide whether to share.
   *
   * WHY THIS IS TESTED AGAINST THE PREDICATE AND NOT AGAINST A STRING LITERAL. Asserting the new
   * sentence verbatim would pin the copy, not the claim, and would go stale the first time somebody
   * rephrases it. What must hold is that the sentence and `canMutateView` agree, so the predicate is
   * EXERCISED here and the copy is required to name the party it grants access to. The sibling key
   * `privateHelp` ("Nobody else, including admins") is checked in the opposite direction as the
   * anti-vacuity half: one of the two promises was enforced and the other was not, and they sit two
   * lines apart in the catalog.
   *
   * The key NAME is unchanged, so WR-02 added no entry to REQUIRED_VIEWS_KEYS and every parity
   * assertion above still applies to it. (Stated without a figure on purpose: the array's length is
   * pinned in one place above, and repeating it here is how that number goes stale — it already had
   * to move from 61 to 62 when plan 50-02 added `views.export.tooBroad`.)
   */
  describe("views.save.sharedHelp matches what canMutateView actually allows (WR-02)", () => {
    /** The word each locale uses for an administrator, lowercased. */
    const ADMIN_WORD: Record<Locale, string> = {
      "en-US": "admin",
      "es-ES": "administradores",
      "pt-BR": "administradores",
    }

    const OWNER: ViewViewer = { id: "owner-1", role: "member" }
    const ADMIN: ViewViewer = { id: "admin-1", role: "admin" }
    const SHARED_ROW = { ownerId: OWNER.id, isShared: true }

    it("an admin really can mutate somebody else's shared view — the fact the copy must reflect", () => {
      // Exercised, not assumed. If this were false the sentence would have been correct and there
      // would be nothing to fix; every assertion below would then be pinning the wrong claim.
      expect(canMutateView(SHARED_ROW, ADMIN)).toBe(true)
      expect(canMutateView(SHARED_ROW, OWNER)).toBe(true)
    })

    for (const locale of LOCALES) {
      it(`${locale}.json names admins among who can edit or delete a shared view`, () => {
        const value = resolve(messages[locale], "views.save.sharedHelp")

        expect(value, `views.save.sharedHelp is missing from ${locale}.json`).toBeTypeOf("string")

        expect(
          (value ?? "").toLowerCase(),
          `${locale}.json: views.save.sharedHelp tells the user that only they can edit or delete ` +
            `a shared view. canMutateView grants both to any admin, so the sentence is false on ` +
            `the exact surface where the user decides whether to share (WR-02).`,
        ).toContain(ADMIN_WORD[locale])
      })
    }

    it("en-US no longer carries the exact false sentence", () => {
      // The specific claim the review quoted, refused by name so a partial revert is caught.
      expect(resolve(messages["en-US"], "views.save.sharedHelp")).not.toContain(
        "Only you can edit or delete it.",
      )
    })

    it("privateHelp still promises the exclusivity that IS enforced", () => {
      /*
       * THE ANTI-VACUITY HALF, and the reason this block is not merely a copy edit. `canSeeView` has
       * no admin branch — the whole of `queries.ts`'s header exists to keep that true — so
       * `privateHelp`'s stronger promise is honest. A "fix" that softened both sentences would
       * satisfy the assertions above and would give away a guarantee the code actually provides.
       */
      expect(canSeeView({ ownerId: OWNER.id, isShared: false }, ADMIN)).toBe(false)

      for (const locale of LOCALES) {
        const value = (resolve(messages[locale], "views.save.privateHelp") ?? "").toLowerCase()

        expect(
          value,
          `${locale}.json: views.save.privateHelp must keep naming admins as excluded — ` +
            `canSeeView has no admin branch and that promise is enforced.`,
        ).toContain(ADMIN_WORD[locale])
      }
    })
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
