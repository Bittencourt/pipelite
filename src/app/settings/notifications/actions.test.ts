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
