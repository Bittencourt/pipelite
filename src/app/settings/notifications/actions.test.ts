import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

// Mirror the schema from the actions module.
//
// This mirror is deliberate and pre-existing: `actions.ts` is `"use server"` and pulls `@/auth`,
// so importing it here would drag the whole auth graph into a unit test. The cost is that the
// mirror can drift from the real schema without any test noticing — which is precisely the
// failure mode this file guards against elsewhere. The `actions.ts source wiring` block below
// closes that hole with a source scan, so the two idioms are complementary, not redundant.
const updatePreferencesSchema = z.object({
  emailDealAssigned: z.boolean(),
  emailActivityReminder: z.boolean(),
  emailWeeklyDigest: z.boolean(),
  emailWorkflowFailed: z.boolean(),
})

const defaultPreferences = {
  emailDealAssigned: true,
  emailActivityReminder: true,
  emailWeeklyDigest: true,
  emailWorkflowFailed: true,
}

const ACTIONS_FILE = "src/app/settings/notifications/actions.ts"
const FORM_FILE = "src/app/settings/notifications/notification-form.tsx"

/** Count non-overlapping occurrences of a literal substring. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) throw new Error("countOccurrences: empty needle")
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return count
    count += 1
    from = at + needle.length
  }
}

describe('getNotificationPreferences', () => {
  it('returns defaults when no preferences row exists', () => {
    // When no DB row exists, the action returns defaults (all true)
    expect(defaultPreferences).toEqual({
      emailDealAssigned: true,
      emailActivityReminder: true,
      emailWeeklyDigest: true,
      emailWorkflowFailed: true,
    })
  })

  it('default values are all boolean true', () => {
    for (const value of Object.values(defaultPreferences)) {
      expect(value).toBe(true)
    }
  })

  it('defaults emailWorkflowFailed to true so an absent row means enabled', () => {
    expect(
      defaultPreferences.emailWorkflowFailed,
      'getNotificationPreferences returns defaultPreferences when no row exists, and plan 41-08\'s ' +
        'failure-alert path treats an absent notification_preferences row as ENABLED (send the mail). ' +
        'A false default here would make the two sides disagree: the settings page would render the ' +
        'workflow-failure toggle as OFF for a user who is in fact still receiving the emails.'
    ).toBe(true)
  })
})

describe('updateNotificationPreferences', () => {
  it('validates correct shape', () => {
    const data = {
      emailDealAssigned: false,
      emailActivityReminder: true,
      emailWeeklyDigest: false,
      emailWorkflowFailed: true,
    }
    const result = updatePreferencesSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('accepts all four booleans', () => {
    const result = updatePreferencesSchema.safeParse({
      emailDealAssigned: true,
      emailActivityReminder: false,
      emailWeeklyDigest: true,
      emailWorkflowFailed: false,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.emailWorkflowFailed).toBe(false)
    }
  })

  it('rejects missing fields', () => {
    const result = updatePreferencesSchema.safeParse({
      emailDealAssigned: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a payload missing emailWorkflowFailed', () => {
    const result = updatePreferencesSchema.safeParse({
      emailDealAssigned: true,
      emailActivityReminder: true,
      emailWeeklyDigest: true,
    })
    expect(
      result.success,
      'emailWorkflowFailed must be REQUIRED on the wire. A `.optional()` or `.default()` here would ' +
        'let a stale client omit the field, and the upsert would then write a server-side default ' +
        'over whatever the user had chosen — silently re-enabling failure emails on every save.'
    ).toBe(false)
  })

  it('rejects a string emailWorkflowFailed', () => {
    const result = updatePreferencesSchema.safeParse({
      emailDealAssigned: true,
      emailActivityReminder: true,
      emailWeeklyDigest: true,
      emailWorkflowFailed: "true",
    })
    expect(
      result.success,
      'the string "true" must not be coerced to a boolean — z.coerce.boolean() would also turn the ' +
        'string "false" into true, which is the exact inversion of the user\'s intent (T-41-49).'
    ).toBe(false)
  })

  it('rejects non-boolean values', () => {
    const result = updatePreferencesSchema.safeParse({
      emailDealAssigned: "yes",
      emailActivityReminder: 1,
      emailWeeklyDigest: null,
      emailWorkflowFailed: 0,
    })
    expect(result.success).toBe(false)
  })

  it('accepts all-false preferences', () => {
    const data = {
      emailDealAssigned: false,
      emailActivityReminder: false,
      emailWeeklyDigest: false,
      emailWorkflowFailed: false,
    }
    const result = updatePreferencesSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.emailDealAssigned).toBe(false)
      expect(result.data.emailActivityReminder).toBe(false)
      expect(result.data.emailWeeklyDigest).toBe(false)
      expect(result.data.emailWorkflowFailed).toBe(false)
    }
  })

  // Integration tests require DB mocking - skipped
  it.skip('upserts preferences for user (requires DB)', () => {})
})

describe('actions.ts source wiring — the five edit points', () => {
  // `readStrippedSource`, not `readFileSync`: the comment in `actions.ts` that EXPLAINS the
  // duplicated-field trap names `emailWorkflowFailed`, and if comments counted, that prose alone
  // would satisfy the count gate that is supposed to prove the field is actually wired. That is the
  // phase-39 defect class where the comment describing a rule silently satisfied the grep enforcing it.
  const source = readStrippedSource(ACTIONS_FILE)
  const siblingCount = countOccurrences(source, 'emailWeeklyDigest')
  const subjectCount = countOccurrences(source, 'emailWorkflowFailed')

  it('read a non-empty stripped source (anti-vacuity)', () => {
    expect(source.length, `${ACTIONS_FILE} read as empty — every count below would pass at zero`)
      .toBeGreaterThan(0)
  })

  it('found the reference sibling emailWeeklyDigest (anti-vacuity)', () => {
    expect(
      siblingCount,
      'emailWeeklyDigest is the known-good field the new one is compared against. A zero here means ' +
        'the scan is measuring nothing, and the count-parity assertion would pass with both at zero.'
    ).toBeGreaterThan(0)
  })

  it('threads emailWorkflowFailed through at least five edit points', () => {
    expect(
      subjectCount,
      'emailWorkflowFailed must appear at every one of the FIVE edit points in actions.ts:\n' +
        '  (1) updatePreferencesSchema — the zod object\n' +
        '  (2) defaultPreferences — the absent-row value\n' +
        '  (3) getNotificationPreferences() — the returned select map\n' +
        '  (4) db.insert(...).values({ ... }) — the first-save path\n' +
        '  (5) onConflictDoUpdate({ set: { ... } }) — the EVERY-SUBSEQUENT-save path\n' +
        'The trap is that the upsert repeats every field TWICE, once in .values({...}) and once in ' +
        'onConflictDoUpdate.set({...}). A field present in one and absent from the other TYPECHECKS ' +
        'and silently never persists on update: the first save appears to work, every save after it ' +
        'discards the change, and a user who turns failure emails off keeps receiving them with no ' +
        `way to tell. Observed count: ${subjectCount}.`
    ).toBeGreaterThanOrEqual(5)
  })

  it('mentions emailWorkflowFailed exactly as often as emailWeeklyDigest', () => {
    expect(
      subjectCount,
      'count parity with an existing sibling is the strongest available form of this gate: ' +
        'emailWeeklyDigest is known to be wired through every edit point, so the new field must ' +
        'appear exactly as many times. Unlike a hardcoded 5, this survives a refactor that changes ' +
        `the number of edit points. emailWeeklyDigest: ${siblingCount}, emailWorkflowFailed: ${subjectCount}.`
    ).toBe(siblingCount)
  })
})

describe('notification-form.tsx — the fourth row, third of four', () => {
  const form = readStrippedSource(FORM_FILE)

  const ROW_OPEN = '<div className="flex items-start space-x-3">'
  const LABEL_CLASS = 'className="font-medium cursor-pointer"'
  const DESCRIPTION_CLASS = 'className="text-sm text-muted-foreground"'

  const dealAt = form.indexOf('id="deal-assigned"')
  const reminderAt = form.indexOf('id="activity-reminder"')
  const workflowAt = form.indexOf('id="workflow-failed"')
  const digestAt = form.indexOf('id="weekly-digest"')

  it('read a non-empty stripped source (anti-vacuity)', () => {
    expect(form.length, `${FORM_FILE} read as empty — every count below would pass at zero`)
      .toBeGreaterThan(0)
  })

  it('found the reference row id="weekly-digest" (anti-vacuity)', () => {
    expect(
      digestAt,
      'weekly-digest is the row the new one is copied from. If the scan cannot see it, the structural ' +
        'counts below are measuring nothing and would pass at zero.'
    ).toBeGreaterThan(-1)
  })

  it('renders a checkbox with id="workflow-failed"', () => {
    expect(workflowAt, `${FORM_FILE} has no id="workflow-failed" checkbox`).toBeGreaterThan(-1)
  })

  it('labels it with a matching htmlFor="workflow-failed"', () => {
    expect(
      form.includes('htmlFor="workflow-failed"'),
      'an id without its matching htmlFor is a label that does not activate its checkbox. The other ' +
        'three rows all pair them, and a user who cannot reliably toggle the control cannot opt out ' +
        'of the mail at all (T-41-53).'
    ).toBe(true)
  })

  it('uses the shared row wrapper class exactly four times', () => {
    expect(
      countOccurrences(form, 'className="flex items-start space-x-3"'),
      'the new row must be structurally identical to the three that exist — same wrapper, not a ' +
        'variation. UI-SPEC V-41-1: peer-level with them.'
    ).toBe(4)
  })

  it('uses the shared label class exactly four times', () => {
    expect(countOccurrences(form, LABEL_CLASS)).toBe(4)
  })

  it('uses the shared description class exactly four times', () => {
    expect(countOccurrences(form, DESCRIPTION_CLASS)).toBe(4)
  })

  it('reuses the generic handleToggle rather than adding a fifth path', () => {
    // `handleToggle("` matches call sites only — the declaration is `handleToggle(key: …`.
    expect(countOccurrences(form, 'handleToggle("emailWorkflowFailed")')).toBe(1)
    expect(
      countOccurrences(form, 'handleToggle("'),
      'handleToggle is generic over keyof NotificationPreferencesData, so four rows means four call ' +
        'sites and no new handler, prop or piece of state.'
    ).toBe(4)
  })

  it('takes both strings from the translator, once each', () => {
    expect(countOccurrences(form, 't("workflowFailed")')).toBe(1)
    expect(countOccurrences(form, 't("workflowFailedDescription")')).toBe(1)
  })

  it('introduces no English literal in the new row', () => {
    expect(workflowAt).toBeGreaterThan(-1)

    const rowStart = form.lastIndexOf(ROW_OPEN, workflowAt)
    expect(rowStart, 'the new checkbox is not inside a standard row wrapper').toBeGreaterThan(-1)
    const nextRow = form.indexOf(ROW_OPEN, workflowAt)
    const row = form.slice(rowStart, nextRow === -1 ? form.length : nextRow)
    expect(row).toContain('id="workflow-failed"')

    // No JSX text node: every rendered string must arrive through {t(...)}.
    const textNodes = [...row.matchAll(/>[ \t]*([^<>{}\s][^<>{}]*)</g)].map((m) => m[1].trim())
    expect(
      textNodes,
      'a hardcoded sentence in the row would render in English for pt-BR and es-ES readers, which ' +
        'the other three rows never do.'
    ).toEqual([])

    // The only quoted strings carrying spaces are the shared utility classes.
    const quoted = [...row.matchAll(/"([^"\n]*)"/g)].map((m) => m[1])
    const prose = quoted.filter(
      (s) =>
        s.includes(' ') &&
        s !== 'flex items-start space-x-3' &&
        s !== 'font-medium cursor-pointer' &&
        s !== 'text-sm text-muted-foreground'
    )
    expect(prose, 'unexpected prose string literal in the new row').toEqual([])
  })

  it('places workflow-failed third of four without reordering the existing three', () => {
    // Assert every offset is found BEFORE comparing them: a bare toBeLessThan on indexOf results
    // passes vacuously at -1, the trap measured on a real RED run at
    // src/app/organizations/__tests__/views-page-wiring.test.ts:161-174.
    expect(dealAt, 'id="deal-assigned" not found').toBeGreaterThan(-1)
    expect(reminderAt, 'id="activity-reminder" not found').toBeGreaterThan(-1)
    expect(workflowAt, 'id="workflow-failed" not found').toBeGreaterThan(-1)
    expect(digestAt, 'id="weekly-digest" not found').toBeGreaterThan(-1)

    expect(
      workflowAt,
      'workflow-failed is an event alert like the two above it, so it belongs with them. Weekly ' +
        'digest is the only periodic-summary row and reads last; appending after it would split the ' +
        'event alerts around the digest (UI-SPEC).'
    ).toBeGreaterThan(reminderAt)
    expect(workflowAt).toBeLessThan(digestAt)

    expect(
      dealAt,
      'the existing three must not be reordered — deal-assigned stays first of four.'
    ).toBeLessThan(reminderAt)
  })

  it('adds no heading, divider or "new" marker', () => {
    // UI-SPEC V-41-1: the fourth row is peer-level with the three that exist. No emphasis.
    for (const marker of ['<h2', '<h3', 'Separator', '<hr', 'Badge']) {
      expect(form.includes(marker), `${FORM_FILE} must not contain ${marker}`).toBe(false)
    }
  })

  it('keeps exactly one Button — the Save action', () => {
    expect(
      countOccurrences(form, '<Button'),
      'nothing else on this surface changes: no second action was added beside Save.'
    ).toBe(1)
  })

  it('uses no raw palette utility', () => {
    // UI-SPEC C-41-1, narrowed to the touched file.
    const palette = form.match(/-(red|green|emerald|blue|amber|violet|rose)-[0-9]/)
    expect(palette, `raw palette utility "${palette?.[0]}" in ${FORM_FILE}`).toBeNull()
  })
})
