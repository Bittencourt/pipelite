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
 * 77 keys in the `audit` namespace plus the 2 dashboard-tile keys that live in the pre-existing
 * `admin.dashboard` namespace. Groups below carry the UI-SPEC's own section names so a key can be
 * found by the surface that renders it.
 */
export const REQUIRED_AUDIT_KEYS: string[] = [
  // Actor kinds — 4
  "audit.actorKind.workflowRun",
  "audit.actorKind.apiKey",
  "audit.actorKind.import",
  "audit.actorKind.system",

  // Entry predicates — 12, one per action × entity. Twelve strings rather than one with an
  // {entity} placeholder because es-ES and pt-BR inflect the demonstrative with the noun's gender.
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

  // Values and disclosure — 10
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

  // Field labels — 20, covering every audited native column across the four entities. Custom
  // fields are never translated; they render customFieldDefinitions.name verbatim.
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
 * 59 keys in the `trash` namespace, plus the 2 dashboard-tile keys in the pre-existing
 * `admin.dashboard` namespace and the 1 sidebar entry in `nav` — 62 total. The per-group counts in
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

  // Purge dialog — 4. description states what survives ("change history is kept") as well as what
  // dies, so an admin is not led to believe a purge erases the evidence of the purge.
  "trash.purgeDialog.title",
  "trash.purgeDialog.description",
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
 * Keys whose translation is legitimately byte-identical to the en-US string in BOTH other
 * locales — proper nouns, brand names, units. Empty today. A key only belongs here after a
 * human decides the identical string is correct, not because a translation was skipped.
 */
const IDENTICAL_TRANSLATION_ALLOWED: string[] = []

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

const emptyPerLocale = Object.fromEntries(LOCALES.map((l) => [l, [] as string[]])) as Record<
  Locale,
  string[]
>

/*
 * The five assertion bodies below are shared by every copy contract in this file, so a contract is
 * gated by calling them rather than by copying an `it` block. REQUIRED_NOTE_KEYS,
 * REQUIRED_AUDIT_KEYS and REQUIRED_TRASH_KEYS are passed separately — never concatenated — so a
 * failure diff names which contract broke and lists only its keys.
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

/** Every locale carries the same scoped key set as the reference locale. */
function expectIdenticalKeySets(scoped: Record<Locale, string[]>, label: string): void {
  const reference = scoped[REFERENCE_LOCALE]
  for (const locale of LOCALES) {
    expect(scoped[locale], `${label} key set differs in ${locale}.json`).toEqual(reference)
  }
}

describe("locale parity", () => {
  it("every required notes, audit and trash key exists in every locale", () => {
    // Keyed by locale so a failure diff names the offending file and the exact missing keys.
    expect(missingIn(REQUIRED_NOTE_KEYS)).toEqual(emptyPerLocale)
    expect(missingIn(REQUIRED_AUDIT_KEYS)).toEqual(emptyPerLocale)
    expect(missingIn(REQUIRED_TRASH_KEYS)).toEqual(emptyPerLocale)
  })

  it("the notes, audit and trash namespaces have identical key sets across all three locales", () => {
    expectIdenticalKeySets(noteKeys, NOTES_NAMESPACE)
    expectIdenticalKeySets(auditKeys, AUDIT_NAMESPACE)
    expectIdenticalKeySets(trashKeys, TRASH_NAMESPACE)

    // Stronger than cross-locale identity, and the reason the contract list is checked in: the
    // shipped audit key set must equal REQUIRED_AUDIT_KEYS exactly, so a string added to the
    // namespace without its dot-path going into the list fails here instead of shipping ungated.
    const auditContract = [...REQUIRED_AUDIT_KEYS].sort()
    for (const locale of LOCALES) {
      expect(
        auditKeys[locale],
        `${AUDIT_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(auditContract)
    }

    // Same exact-contract rule for trash, and the same reason.
    const trashContract = [...REQUIRED_TRASH_KEYS].sort()
    for (const locale of LOCALES) {
      expect(
        trashKeys[locale],
        `${TRASH_NAMESPACE} key set in ${locale}.json diverges from the checked-in contract`,
      ).toEqual(trashContract)
    }
  })

  it("every required notes, audit and trash value is a non-empty string", () => {
    expect(blankIn(REQUIRED_NOTE_KEYS)).toEqual(emptyPerLocale)
    expect(blankIn(REQUIRED_AUDIT_KEYS)).toEqual(emptyPerLocale)
    expect(blankIn(REQUIRED_TRASH_KEYS)).toEqual(emptyPerLocale)
  })

  it("no required notes, audit or trash string was left untranslated in both es-ES and pt-BR", () => {
    // An English string copied verbatim into BOTH other locales is a skipped translation, not a
    // coincidence. Matching one locale is plausible (cognates); matching both is not.
    expect(untranslatedInBoth(REQUIRED_NOTE_KEYS)).toEqual([])
    expect(untranslatedInBoth(REQUIRED_AUDIT_KEYS)).toEqual([])
    expect(untranslatedInBoth(REQUIRED_TRASH_KEYS)).toEqual([])
  })

  it("interpolation placeholders survive translation for every required notes, audit and trash key", () => {
    // next-intl throws at render time when a message references a placeholder the caller did not
    // pass, so a translator dropping `{from}` breaks the Spanish UI and only the Spanish UI.
    expect(placeholderDrift(REQUIRED_NOTE_KEYS)).toEqual({})
    expect(placeholderDrift(REQUIRED_AUDIT_KEYS)).toEqual({})
    expect(placeholderDrift(REQUIRED_TRASH_KEYS)).toEqual({})
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
