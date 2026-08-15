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
const noteKeys = Object.fromEntries(
  LOCALES.map((l) => [l, allKeys[l].filter((k) => k === "notes" || k.startsWith("notes."))]),
) as Record<Locale, string[]>

const emptyPerLocale = Object.fromEntries(LOCALES.map((l) => [l, [] as string[]])) as Record<
  Locale,
  string[]
>

describe("locale parity", () => {
  it("every required notes.* key exists in every locale", () => {
    const missing = Object.fromEntries(
      LOCALES.map((l) => [l, REQUIRED_NOTE_KEYS.filter((k) => !allKeys[l].includes(k))]),
    ) as Record<Locale, string[]>

    // Keyed by locale so a failure diff names the offending file and the exact missing keys.
    expect(missing).toEqual(emptyPerLocale)
  })

  it("the notes namespace has identical key sets across all three locales", () => {
    const reference = noteKeys[REFERENCE_LOCALE]
    for (const locale of LOCALES) {
      expect(noteKeys[locale], `notes.* key set differs in ${locale}.json`).toEqual(reference)
    }
  })

  it("every notes.* value is a non-empty string", () => {
    const bad = Object.fromEntries(
      LOCALES.map((l) => [
        l,
        REQUIRED_NOTE_KEYS.filter((k) => {
          const value = resolve(messages[l], k)
          return typeof value !== "string" || value.trim() === ""
        }),
      ]),
    ) as Record<Locale, string[]>

    expect(bad).toEqual(emptyPerLocale)
  })

  it("no notes.* string was left untranslated in both es-ES and pt-BR", () => {
    // An English string copied verbatim into BOTH other locales is a skipped translation, not a
    // coincidence. Matching one locale is plausible (cognates); matching both is not.
    const untranslated = REQUIRED_NOTE_KEYS.filter((key) => {
      if (IDENTICAL_TRANSLATION_ALLOWED.includes(key)) return false
      const en = resolve(messages["en-US"], key)
      if (typeof en !== "string") return false
      return resolve(messages["es-ES"], key) === en && resolve(messages["pt-BR"], key) === en
    })

    expect(untranslated).toEqual([])
  })

  it("interpolation placeholders survive translation for every notes.* key", () => {
    // next-intl throws at render time when a message references a placeholder the caller did not
    // pass, so a translator dropping `{from}` breaks the Spanish UI and only the Spanish UI.
    const mismatched: Record<string, Record<string, string[]>> = {}
    for (const key of REQUIRED_NOTE_KEYS) {
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

    expect(mismatched).toEqual({})
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
