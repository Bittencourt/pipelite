/**
 * SC-1, THE ORGANIZATION HALF — the create-time duplicate advisory, OBSERVED IN A BROWSER.
 *
 * This file exists because a source gate already certified this feature once and was wrong. Plan
 * 39-14 shipped the organization create-time warning, its wiring contract passed, and DEDUP-01 was
 * recorded as satisfied — while the advisory could not fire from any surface, because
 * `organization-dialog.tsx` sent no `customFields` at all and `draftHasIdentityValue` therefore
 * never passed (gap D-39-01). A green source gate is exactly how an unreachable feature ships.
 * Plan 39-18 fixed the collection path and 39-21 filtered the admin picker, and both of those are
 * source-gated too. So the only instrument left that can establish that the warning REACHES A USER
 * is a real browser: there is no jsdom in this repo (39-VALIDATION V-7), and jsdom computes no
 * layout and runs no server action anyway.
 *
 * ---
 * WHAT THE THREE CASES PROVE, AND WHY TWO OF THEM ARE THE DANGEROUS ONES
 *
 *   1. CONFIGURED + MATCHING identity value  -> the advisory FIRES, and everything 39-GAPS GAP 1
 *      lists about it is true: inside the dialog, above the form, not red, nothing typed lost,
 *      name + distinguishing value + reason, submit relabelled, and W-4 gets the user past it.
 *   2. CONFIGURED + DIFFERENT identity value -> NO advisory. This is the file's discriminator: the
 *      two records share a name, so if the name alone decided, case 1 would prove nothing. 70.7%
 *      of the 46,054 real organizations share a normalized name and a name-only rule was measured
 *      at 1,030,436 false certain pairs, which is why "the identity value decides" is the whole
 *      claim.
 *   3. UNCONFIGURED -> NO advisory, and no identity input either. The graceful degradation locked
 *      in 39-CONTEXT § Post-Research Decisions and built fail-closed by plan 39-08.
 *
 * Cases 2 and 3 assert an ABSENCE, and a blank page, an error page, a `/login` redirect and a
 * dialog that never opened all satisfy "the advisory is absent". Every absence here is therefore
 * anchored on positive evidence that the state where the advisory WOULD have appeared was actually
 * reached:
 *
 *   - the dialog is proven open (`#name` visible) and, in case 2, the identity input is proven
 *     present before anything is typed into it;
 *   - the submit button is proven to carry its UN-WARNED label right before it is activated;
 *   - the submit is proven to have been PROCESSED, by the dialog CLOSING and the record EXISTING.
 *     That last one is the load-bearing part: rule W-2 says an advisory keeps the dialog OPEN and
 *     creates NOTHING, so "dialog closed and the row is in the database" is not a proxy for "no
 *     advisory" — under W-2 it is equivalent to it, and it cannot be satisfied by a page that
 *     failed to render.
 *   - case 3 additionally ends with a POSITIVE CONTROL: the setting is switched on, the page is
 *     reloaded, and the identity input is required to appear. Without it, "the input is absent"
 *     would be satisfied by any build in which the input never renders at all — which is precisely
 *     the pre-fix product, and precisely how this gap survived to UAT.
 *
 * ---
 * THE RULES THIS FILE OBEYS, restated rather than referenced because each is a trap a later edit
 * can walk into:
 *
 *   - No login happens here and no credential of any kind is inlined or added. The session arrives
 *     from the setup project's storageState (`e2e/.auth/admin.json`, gitignored — a live 7-day
 *     session cookie).
 *   - Imports are RELATIVE, never `@/…`: Playwright does not read vitest's alias table and
 *     `playwright.config.ts` declares none.
 *   - The anchor strings are READ FROM THE MESSAGE CATALOG, not typed, so a copy change cannot
 *     silently turn an assertion off (39-VALIDATION V-3). `dedup.warning.title` is deliberately
 *     NOT an anchor: it is an ICU plural and reading it would mean reimplementing plural selection
 *     here. The two literals that ARE typed — "Add Organization" and "Create Organization" — are
 *     not in any catalog: 39-UI-SPEC records that both create dialogs carry roughly twenty
 *     hardcoded English literals each and that this phase declines to migrate them, so a locator
 *     on them is unavoidable rather than sloppy.
 *   - No viewport is declared and none is changed mid-run. The chromium project already supplies
 *     320x640, and `@dnd-kit/core` wires the window resize event to its drag-cancel handler, so a
 *     programmatic resize must not become a habit anywhere under `e2e/`.
 *   - THE ADVISORY LOCATOR IS SCOPED TO THE DIALOG. `getByRole("alert")` on its own also matches
 *     the sonner success toast — measured: one `role="alert"` node is present after a successful
 *     create, and it is the toast. An unscoped locator would make the fires/does-not-fire
 *     distinction meaningless in both directions.
 *   - THE SUBMIT BUTTON IS ACTIVATED BY A POINTER CLICK, AND NEVER BY `Enter`. This is a
 *     measurement result, not a preference, and the reason is a defect this spec found rather than
 *     a property of this phase's code. `src/components/keyboard/data-table-keyboard.tsx` registers
 *     `useHotkeys("enter", …, { preventDefault: true })` WITHOUT a ref, so the listener is on the
 *     DOCUMENT and fires no matter what is focused, including inside a modal dialog rendered
 *     through a portal. Its only guard, `isFormFocused`, exempts `INPUT`, `TEXTAREA`, `SELECT` and
 *     `contenteditable` — a focused `BUTTON` is not exempt. So `Enter` on this dialog's submit
 *     button runs the LIST PAGE's "open the selected row" hotkey, `preventDefault` suppresses the
 *     button's own activation, and the browser navigates to `/organizations/<first row id>` with
 *     the draft still unsaved. Observed directly: a run that pressed `Enter` here landed on the
 *     seed record's detail page and created nothing. That is a pre-existing defect in a hook shared
 *     by six surfaces, it is not phase 39 code, and it is reported rather than worked around — but
 *     it does mean `Enter` cannot be this file's actuator.
 *
 * ---
 * THE FIXTURE RULE (39-VALIDATION V-4, the posture `deals-drag.spec.ts` and
 * `merge-screen-320.spec.ts` established). This spec runs against the live development database,
 * which holds 46,054 real organizations. It creates every row it needs, hard-deletes them, and
 * PROVES the teardown rather than trusting it — a delete that matched nothing and a delete that
 * matched everything both exit cleanly. It also captures, sets and restores
 * `dedup.organization_identity_fields`, which is a row that changes real product behaviour for
 * every user of the deployment while it is set: leaving it configured was measured to change the
 * tier split of the 543 real `duplicate_pairs` rows on the next scan, so a stranded setting
 * silently rewrites real feature state.
 */

import { expect, test, type Locator, type Page } from "@playwright/test"
import postgres from "postgres"

import en from "../src/messages/en-US.json"
import { E2E_ADMIN_EMAIL } from "./seed-admin"

/**
 * One prefix on every row this spec creates, including the rows the PRODUCT creates during a test.
 *
 * Scoped to `name like '[e2e] Dup Warning%'` and never to `'[e2e]%'`, which would reach
 * `deals-drag.spec.ts`'s and `merge-screen-320.spec.ts`'s fixtures. It is deliberately
 * unmistakable: a human who finds one of these in `/organizations` knows it is machinery.
 */
const FIXTURE_PREFIX = "[e2e] Dup Warning"

/**
 * THE SHARED NAME. Both fixture records and every draft this file types carry it, so the name can
 * never be what distinguishes case 1 from case 2.
 *
 * None of its tokens (`e2e`, `dup`, `warning`, `alpha`, `distribuidora`) is in `LEGAL_SUFFIXES`,
 * so `dedup_norm_org` strips nothing from it, and `distribuidora` is far longer than
 * `SCAN_MIN_NAME_LENGTH`, so `isComparableOrgName` admits it. Both matter: a name that normalized
 * to initials or to empty would be refused by the matcher before any identity value was consulted,
 * and this file would then measure a refusal it mistook for a clean draft.
 */
const SEED_NAME = `${FIXTURE_PREFIX} Alpha Distribuidora`

/**
 * THE IDENTITY VALUES, AND WHY THE MATCHING PAIR DIFFERS IN CASE.
 *
 * `scoring.ts`'s `readIdentityValue` compares `trim().toLowerCase()`, so these two ARE an identity
 * match. `matching.ts`'s `matchedIdentityValue` then returns the EXISTING RECORD's value for W-7's
 * middle line, with its case intact — so asserting the advisory shows the UPPERCASE form proves the
 * distinguishing value is read off the matched record and is not the draft's own input echoed back.
 * An identical pair could not tell those two apart.
 */
const SEED_IDENTITY = "E2E-CNPJ-77.888.999/0001-11"
const TYPED_IDENTITY_MATCHING = SEED_IDENTITY.toLowerCase()

/** Case 2's value: same name, DIFFERENT identifier. `likely`, never `certain`, never surfaced. */
const TYPED_IDENTITY_DIFFERENT = "E2E-CNPJ-00.111.222/0003-99"

/** The seed's own website, so the advisory row has an existing record with real content behind it. */
const SEED_WEBSITE = "https://dup-warning-seed.e2e.example.test/institucional"

/**
 * What the DRAFT carries. Every value differs from the seed's, which is what lets the
 * nothing-typed-is-lost assertion distinguish "the form kept my text" from "the form reloaded the
 * matched record's values into itself".
 */
const TYPED_WEBSITE = "https://dup-warning-draft.e2e.example.test/contato"
const TYPED_INDUSTRY = "[e2e] industry marker 5f3a"
const TYPED_NOTES =
  "[e2e] notes marker — an arbitrarily long paste is the thing W-2 exists to protect, so the advisory must not cost it."

/** The `app_settings` key this file mutates. Nothing else in that table may be touched. */
const ORG_IDENTITY_KEY = "dedup.organization_identity_fields"

/**
 * The two English literals that are in no message catalog — see the header. `Add Organization` is
 * `data-table.tsx`'s trigger; `Create Organization` is the dialog's UN-WARNED submit label, and it
 * is what every absence case checks immediately before activating the button.
 */
const ADD_ORGANIZATION = "Add Organization"
const CREATE_ORGANIZATION = "Create Organization"

interface Counts {
  organizations: number
  notes: number
  auditLog: number
  duplicatePairs: number
  dedupScans: number
}

interface CapturedSetting {
  existed: boolean
  value: unknown
}

/** Resolved in `beforeAll`; `null` skips the file with a message naming what is missing. */
let identityLabel: string | null = null
let ownerId = ""
let seedId = ""
let baseline: Counts
let capturedSetting: CapturedSetting = { existed: false, value: null }

function openDb() {
  const connectionString = process.env.E2E_DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "E2E_DATABASE_URL is not set. It must point at the HOST-mapped dev Postgres " +
        "(localhost:5433); the app-facing DATABASE_URL resolves postgres:5432 inside the " +
        "Docker network and is unreachable from here."
    )
  }

  // The same loopback allow-list `seed-admin.ts`, `deals-drag.spec.ts` and
  // `merge-screen-320.spec.ts` apply, repeated rather than imported BECAUSE IT IS A GUARD: this
  // file INSERTs and DELETEs rows and mutates a settings row that changes product behaviour, so it
  // must be impossible to aim at anything but a database the operator provably owns. A guard that
  // lives somewhere else is a guard that can be moved away from what it protects.
  const hostname = new URL(connectionString).hostname
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error(
      `E2E_DATABASE_URL host "${hostname}" is not a local development database. ` +
        "The organization duplicate-warning fixture refuses to write anywhere but localhost / 127.0.0.1."
    )
  }

  return postgres(connectionString)
}

type Sql = ReturnType<typeof openDb>

/** One connection per unit of work, always closed. */
async function withDb<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = openDb()
  try {
    return await work(sql)
  } finally {
    await sql.end()
  }
}

async function readCounts(sql: Sql): Promise<Counts> {
  const [row] = await sql<
    {
      organizations: string
      notes: string
      audit_log: string
      duplicate_pairs: string
      dedup_scans: string
    }[]
  >`
    select
      (select count(*) from organizations)::text   as organizations,
      (select count(*) from notes)::text           as notes,
      (select count(*) from audit_log)::text       as audit_log,
      (select count(*) from duplicate_pairs)::text as duplicate_pairs,
      (select count(*) from dedup_scans)::text     as dedup_scans
  `
  return {
    organizations: Number(row.organizations),
    notes: Number(row.notes),
    auditLog: Number(row.audit_log),
    duplicatePairs: Number(row.duplicate_pairs),
    dedupScans: Number(row.dedup_scans),
  }
}

/**
 * Delete every trace of the fixture, CHILDREN FIRST.
 *
 * The order is written down because nothing in the database enforces it. `notes.entity_id` and
 * `audit_log.entity_id` are both POLYMORPHIC with no foreign key — the schema records why: one
 * column would have to point at four different tables — so deleting the organizations first would
 * strand rows the next run's count-parity check would report as contamination, and nothing would
 * have complained at the time.
 *
 * A create through the dialog writes a `notes` row whenever the draft's Notes field is non-empty,
 * which is why notes are purged here and their count is part of the parity assertion. Measured on
 * this deployment: an organization CREATE writes no `audit_log` row at all (there is not one
 * `organization`/`created` row among the 213), but the delete is issued anyway — a subscriber that
 * starts auditing creates must not silently start leaking rows past this teardown.
 *
 * Scoped strictly to the fixture prefix, never to `'[e2e]%'`.
 */
async function purgeFixture(sql: Sql): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    select id from organizations where name like ${FIXTURE_PREFIX + "%"}
  `
  const ids = rows.map((row) => row.id)
  if (ids.length === 0) return

  await sql`delete from notes where entity_type = 'organization' and entity_id in ${sql(ids)}`
  await sql`delete from audit_log where entity_type = 'organization' and entity_id in ${sql(ids)}`
  await sql`
    delete from duplicate_pairs where record_a_id in ${sql(ids)} or record_b_id in ${sql(ids)}
  `
  await sql`delete from organizations where id in ${sql(ids)}`
}

/**
 * Set or clear the identity setting — AND PROVE IT LANDED.
 *
 * The read-back is not ceremony. If the write silently stored the wrong shape,
 * `readOrgIdentityFields` would map it to `null`, no identity input would render, and case 1 would
 * fail for a fixture reason while looking exactly like the product defect this file exists to
 * detect. A fixture that cannot prove its own precondition cannot prove anything else either.
 */
async function setIdentityFields(labels: string[] | null): Promise<void> {
  await withDb(async (sql) => {
    if (labels === null) {
      await sql`delete from app_settings where key = ${ORG_IDENTITY_KEY}`
      const rows = await sql`select key from app_settings where key = ${ORG_IDENTITY_KEY}`
      expect(rows.length, `${ORG_IDENTITY_KEY} should be absent and is not`).toBe(0)
      return
    }

    await sql`
      insert into app_settings (key, value, updated_at)
      values (${ORG_IDENTITY_KEY}, ${sql.json(labels)}, now())
      on conflict (key) do update set value = ${sql.json(labels)}, updated_at = now()
    `
    const [row] = await sql<{ value: unknown }[]>`
      select value from app_settings where key = ${ORG_IDENTITY_KEY}
    `
    expect(row?.value, `${ORG_IDENTITY_KEY} did not store the configured labels`).toEqual(labels)
  })
}

/** The advisory, scoped to the open dialog so the success toast can never satisfy it. */
function advisory(page: Page): Locator {
  return page.locator('[data-slot="dialog-content"] [role="alert"]')
}

/** The dialog's single submit control. Cancel and Close are both `type="button"`. */
function submitButton(page: Page): Locator {
  return page.locator('[data-slot="dialog-content"] button[type="submit"]')
}

/**
 * Open the create dialog. `?search=` keeps the list page to the fixture rows instead of the first
 * fifty of 46,054 — a lighter render, and one that cannot make a slow page look like a defect.
 */
async function openCreateDialog(page: Page, navigate = true): Promise<void> {
  if (navigate) {
    await page.goto(`/organizations?search=${encodeURIComponent(FIXTURE_PREFIX)}`)
  }
  const trigger = page.getByRole("button", { name: ADD_ORGANIZATION })
  await expect(trigger, "the /organizations create trigger did not render").toBeVisible()
  await trigger.click()
  await expect(page.locator("#name"), "the create dialog did not open").toBeVisible()
}

/**
 * Press the dialog's submit button — see the header for why this is a pointer click and never
 * `Enter`.
 *
 * Visible and enabled are asserted first so the activation can never be a silent no-op on a control
 * that was not actually offered to the user.
 */
async function activateSubmit(page: Page): Promise<void> {
  const submit = submitButton(page)
  await expect(submit).toBeVisible()
  await expect(submit).toBeEnabled()
  await submit.click()
}

/** Every organization carrying the fixture name, oldest first. */
async function fixtureRows(): Promise<
  { id: string; website: string | null; industry: string | null; customFields: unknown }[]
> {
  return withDb(async (sql) => {
    const rows = await sql<
      { id: string; website: string | null; industry: string | null; custom_fields: unknown }[]
    >`
      select id, website, industry, custom_fields
      from organizations
      where name = ${SEED_NAME}
      order by created_at asc
    `
    return rows.map((row) => ({
      id: row.id,
      website: row.website,
      industry: row.industry,
      customFields: row.custom_fields,
    }))
  })
}

test.beforeAll(async () => {
  await withDb(async (sql) => {
    baseline = await readCounts(sql)

    const [owner] = await sql<{ id: string }[]>`
      select id from users where email = ${E2E_ADMIN_EMAIL} limit 1
    `
    expect(
      owner,
      `the seeded e2e admin ${E2E_ADMIN_EMAIL} is missing — run the setup project first`
    ).toBeTruthy()
    ownerId = owner.id

    /**
     * THE IDENTITY FIELD IS RESOLVED AT RUNTIME AND NEVER HARDCODED, for two reasons that are not
     * laziness. `identity-settings.ts` records the first: `customFields` is keyed by the field
     * definition's HUMAN LABEL, those labels are created per installation, and baking this
     * deployment's Portuguese labels into anything would be wrong for every other deployment. The
     * second is that the setting is keyed by label, so the spec must configure a label that really
     * exists HERE or it would be configuring nothing.
     *
     * `having bool_and(type = 'text')` mirrors `isCollectableIdentityField`: two active definitions
     * may legitimately share a name in this deployment, `customFields` has one key per name, and a
     * shared name whose definitions disagree about type is collectable by neither the admin picker
     * nor the create dialog. Selecting such a label would configure something the product is
     * correct to ignore.
     */
    const candidates = await sql<{ name: string }[]>`
      select name
      from custom_field_definitions
      where entity_type = 'organization' and deleted_at is null
      group by name
      having bool_and(type = 'text')
      order by min(position) asc
    `
    identityLabel =
      candidates.find((row) => row.name === "CNPJ / CPF")?.name ?? candidates[0]?.name ?? null

    capturedSetting = await (async () => {
      const rows = await sql<{ value: unknown }[]>`
        select value from app_settings where key = ${ORG_IDENTITY_KEY}
      `
      return rows.length > 0
        ? { existed: true, value: rows[0].value }
        : { existed: false, value: null }
    })()

    // Purge BEFORE inserting, so a run killed mid-flight is recoverable rather than blocking.
    await purgeFixture(sql)
  })
})

test.beforeEach(async () => {
  test.skip(
    identityLabel === null,
    "no organization custom field definition is both active and text-typed on this deployment, " +
      "so no label can be configured as an identity key and the create-time advisory has nothing to compare"
  )

  await withDb(async (sql) => {
    /**
     * RESEED FROM SCRATCH, EXACTLY ONE ROW. Case 1's "Create anyway" deliberately leaves a second
     * matching organization behind, so without this the next test would measure a screen with two
     * matches on it and the exactly-one-match assertion would be reporting a different fact.
     *
     * `norm_name` is deliberately NOT named: it is GENERATED ALWAYS and an INSERT naming it is
     * rejected. `owner_id` is NOT NULL with a foreign key to `users`.
     */
    await purgeFixture(sql)

    const [seed] = await sql<{ id: string }[]>`
      insert into organizations (id, name, website, industry, owner_id, custom_fields)
      values (
        gen_random_uuid()::text, ${SEED_NAME}, ${SEED_WEBSITE}, 'Wholesale distribution',
        ${ownerId}, ${sql.json({ [identityLabel as string]: SEED_IDENTITY })}
      )
      returning id
    `
    seedId = seed.id
  })
})

test.afterAll(async () => {
  await withDb(async (sql) => {
    await purgeFixture(sql)

    // TEARDOWN PROVEN, NOT PERFORMED-AND-TRUSTED, and it runs whether the spec was red or green:
    // a failed run must never be allowed to strand a fixture or a configured setting on a database
    // 46,054 real organizations live in.
    const [orgs] = await sql<{ count: string }[]>`
      select count(*)::text as count from organizations where name like ${FIXTURE_PREFIX + "%"}
    `
    expect(Number(orgs.count), "fixture organizations were left behind").toBe(0)

    if (capturedSetting.existed) {
      await sql`
        insert into app_settings (key, value, updated_at)
        values (${ORG_IDENTITY_KEY}, ${sql.json(capturedSetting.value as never)}, now())
        on conflict (key) do update
          set value = ${sql.json(capturedSetting.value as never)}, updated_at = now()
      `
      const [row] = await sql<{ value: unknown }[]>`
        select value from app_settings where key = ${ORG_IDENTITY_KEY}
      `
      expect(row?.value, `${ORG_IDENTITY_KEY} was not restored to its captured value`).toEqual(
        capturedSetting.value
      )
    } else {
      // The only DELETE this file issues outside its own fixture rows. Scoped to the single key it
      // wrote itself; nothing else in `app_settings` is read, written or deleted anywhere here.
      await sql`delete from app_settings where key = ${ORG_IDENTITY_KEY}`
      const rows = await sql`select key from app_settings where key = ${ORG_IDENTITY_KEY}`
      expect(
        rows.length,
        `${ORG_IDENTITY_KEY} did not exist before this run and must not exist after it`
      ).toBe(0)
    }

    const after = await readCounts(sql)
    expect(after, "the shared development database is not back at its pre-run row counts").toEqual(
      baseline
    )
  })
})

test("CONFIGURED + a matching identity value: the advisory fires, and W-4 gets past it", async ({
  page,
}) => {
  const label = identityLabel as string
  await setIdentityFields([label])

  await openCreateDialog(page)

  /**
   * (a) THE ANTI-VACUITY ANCHOR FOR THE WHOLE FILE, and gap D-39-01 restated as a browser fact.
   *
   * Against the pre-39-18 image this input does not exist, so no identity value can be typed, so
   * `draftHasIdentityValue` cannot pass, so `findCertainOrganizationMatches` returns `[]` for every
   * submission however the deployment is configured. Everything below is unreachable until this
   * line passes, which is what makes this file's RED mean something specific.
   */
  const identityInput = page.locator("#org-identity-0")
  await expect(
    identityInput,
    "#org-identity-0 never rendered — the configured identity field is not collectable at create " +
      "time, which is gap D-39-01 and makes the organization advisory unreachable"
  ).toBeVisible()

  // The label is the user-authored field name VERBATIM (UI-SPEC M-4): it is data, not copy, so it
  // is untranslated by design and this is where that shows.
  await expect(page.locator('label[for="org-identity-0"]')).toHaveText(label)

  await page.locator("#name").fill(SEED_NAME)
  await page.locator("#website").fill(TYPED_WEBSITE)
  await page.locator("#industry").fill(TYPED_INDUSTRY)
  await identityInput.fill(TYPED_IDENTITY_MATCHING)
  await page.locator("#notes").fill(TYPED_NOTES)

  // The un-warned state, positively established before the submit that is supposed to change it.
  await expect(submitButton(page)).toHaveText(CREATE_ORGANIZATION)
  await expect(advisory(page)).toHaveCount(0)

  await activateSubmit(page)

  const alert = advisory(page)
  await expect(alert, "the create-time duplicate advisory did not appear").toBeVisible()

  // (b) W-2 — THE DIALOG IS STILL OPEN. An advisory that closed the dialog would have destroyed
  // the draft it is asking the user to reconsider.
  await expect(page.locator("#name"), "the dialog closed instead of warning in place").toBeVisible()

  /**
   * (c) INSIDE THE DIALOG AND ABOVE THE FORM (W-1) — PROVEN STRUCTURALLY, NOT BY A y-COORDINATE.
   *
   * 39-17 recorded an inconsistent y measurement on the merge screen caused by a disclosure
   * reflow, so position is established with `compareDocumentPosition` instead: the alert and the
   * name field share the same `<form>`, the name field FOLLOWS the alert in document order, and the
   * alert is not an ancestor of it. Those three facts together are exactly "inline, above the
   * fields, inside the dialog" and no layout pass can make them flicker.
   */
  const ordering = await page.evaluate(() => {
    const el = document.querySelector('[data-slot="dialog-content"] [role="alert"]')
    const name = document.getElementById("name")
    if (!el || !name) return null
    return {
      insideDialog: !!el.closest('[data-slot="dialog-content"]'),
      sameForm: !!el.closest("form") && el.closest("form") === name.closest("form"),
      nameFollowsAlert: !!(
        el.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      alertWrapsName: el.contains(name),
    }
  })
  expect(ordering, "neither the advisory nor the name field could be located in the DOM").not.toBeNull()
  expect(ordering?.insideDialog, "the advisory is not inside the dialog").toBe(true)
  expect(ordering?.sameForm, "the advisory is not inside the same form as the fields").toBe(true)
  expect(ordering?.nameFollowsAlert, "the advisory does not precede the form fields").toBe(true)
  expect(ordering?.alertWrapsName, "the advisory wraps the form rather than sitting above it").toBe(
    false
  )

  /**
   * (d) NOT RED (C-1) — measured against BOTH poles, in the same dialog.
   *
   * The destructive reference is the required-field asterisk beside the Name label, which carries
   * `text-destructive` on this very surface, so "not red" is compared against the real token rather
   * than against a hardcoded colour string that a theme change would invalidate. The positive half
   * is the dialog surface itself: `Alert variant="default"` is `bg-background text-foreground` and
   * `DialogContent` is `bg-background` under a `text-foreground` body, so a correct advisory is
   * INDISTINGUISHABLE from the surface it sits on. Asserting only "not destructive" would pass for
   * any other wrong colour.
   */
  const palette = await page.evaluate(() => {
    const el = document.querySelector('[data-slot="dialog-content"] [role="alert"]') as HTMLElement
    const surface = document.querySelector('[data-slot="dialog-content"]') as HTMLElement
    const destructive = document.querySelector(
      'label[for="name"] .text-destructive'
    ) as HTMLElement | null
    const style = getComputedStyle(el)
    return {
      color: style.color,
      background: style.backgroundColor,
      className: el.className,
      surfaceColor: getComputedStyle(surface).color,
      surfaceBackground: getComputedStyle(surface).backgroundColor,
      destructiveColor: destructive ? getComputedStyle(destructive).color : null,
      dialogHeight: surface.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }
  })
  expect(
    palette.destructiveColor,
    "the required-field asterisk is missing, so there is no destructive reference to compare against"
  ).not.toBeNull()
  expect(palette.className, "the advisory carries a destructive class").not.toContain("destructive")
  expect(
    palette.color,
    `the advisory's text colour ${palette.color} is the destructive token`
  ).not.toBe(palette.destructiveColor)
  expect(
    palette.color,
    `the advisory's text colour ${palette.color} is not the dialog surface's ${palette.surfaceColor}`
  ).toBe(palette.surfaceColor)
  expect(
    palette.background,
    `the advisory's background ${palette.background} is not the dialog surface's ${palette.surfaceBackground}`
  ).toBe(palette.surfaceBackground)

  // RECORDED, NOT ASSERTED: the dialog's height once the advisory renders, against the 640px
  // project viewport. It is why this file activates the submit button by keyboard (see the header),
  // and it is a measurement a reader of a green run should still be able to see.
  console.log(
    `[39-19] advisory showing: dialog height ${Math.round(palette.dialogHeight)}px vs viewport ${palette.viewportHeight}px; ` +
      `advisory colour ${palette.color} on ${palette.background}; destructive token ${palette.destructiveColor}`
  )

  /**
   * (e) EXACTLY ONE MATCHED RECORD, AND IT IS THE SEED.
   *
   * The count is what proves the fixture name collides with none of the 46,054 real organizations
   * rather than merely assuming it, and the href asserts the seed's FULL id — a prefix match would
   * be satisfied by a link to an arbitrary record.
   */
  const items = alert.locator("ul > li")
  await expect(items, "the advisory did not list exactly one matched record").toHaveCount(1)

  const link = items.first().getByRole("link")
  await expect(link).toHaveAttribute("href", `/organizations/${seedId}`)
  // W-3 — the new tab, and the noopener/noreferrer pair that must never be separated from it.
  await expect(link).toHaveAttribute("target", "_blank")
  await expect(link).toHaveAttribute("rel", "noopener noreferrer")
  await expect(link).toContainText(SEED_NAME)
  await expect(link, "the new-tab behaviour is not announced to a screen reader").toContainText(
    en.dedup.warning.openExisting
  )

  /**
   * (f) W-7's THREE LINES: name, distinguishing value, reason. The value is asserted in the seed's
   * own casing — see the comment on `SEED_IDENTITY` — so this cannot be satisfied by echoing the
   * draft's input back.
   */
  await expect(alert).toContainText(en.dedup.warning.body)
  await expect(
    items.first(),
    "the advisory does not show the matched record's own identity value"
  ).toContainText(SEED_IDENTITY)
  await expect(items.first(), "the matched record is shown without its reason").toContainText(
    en.dedup.reason.nameIdentity
  )

  // (g) NOTHING TYPED IS LOST — all five inputs, including the long Notes paste and the identity
  // value. Each expected value differs from the seed's, so this cannot pass by the form having
  // reloaded the matched record into itself.
  await expect(page.locator("#name")).toHaveValue(SEED_NAME)
  await expect(page.locator("#website")).toHaveValue(TYPED_WEBSITE)
  await expect(page.locator("#industry")).toHaveValue(TYPED_INDUSTRY)
  await expect(identityInput).toHaveValue(TYPED_IDENTITY_MATCHING)
  await expect(page.locator("#notes")).toHaveValue(TYPED_NOTES)

  // (h) W-4 / W-9 — the EXISTING submit button, relabelled. Both polarities, so a button whose
  // label never changed cannot pass and neither can one that lost its label entirely.
  await expect(submitButton(page)).toHaveAccessibleName(en.dedup.warning.createAnyway)
  await expect(submitButton(page)).not.toHaveText(CREATE_ORGANIZATION)

  /**
   * (i) W-4 OBSERVED — pressing the relabelled button creates the record, and the check does NOT
   * run again. If `confirmDuplicate` were not carried, the same advisory would come back and the
   * user could never get past it, which is why this is a product requirement and not a nicety.
   */
  await activateSubmit(page)

  await expect(page.locator("#name"), "the dialog did not close after Create anyway").toBeHidden()
  await expect(page.getByText("Organization created!")).toBeVisible()

  const rows = await fixtureRows()
  expect(rows.length, "Create anyway did not create the second organization").toBe(2)

  const created = rows.find((row) => row.id !== seedId)
  expect(created, "the created organization could not be identified").toBeTruthy()
  // The typed values reached the database, INCLUDING the identity blob — the create-time half of
  // 39-18's wire, observed end to end rather than read off the source.
  expect(created?.website).toBe(TYPED_WEBSITE)
  expect(created?.industry).toBe(TYPED_INDUSTRY)
  expect((created?.customFields as Record<string, unknown> | null)?.[label]).toBe(
    TYPED_IDENTITY_MATCHING
  )

  /**
   * A FRESH DIALOG SESSION STARTS UNWARNED — the browser-visible half of the `dialogSessionKey`
   * rule. A warning that outlived the draft it described would be naming records that no longer
   * relate to anything on screen, which is worse than no warning at all.
   */
  await openCreateDialog(page, false)
  await expect(advisory(page), "the advisory survived into a fresh dialog session").toHaveCount(0)
  await expect(submitButton(page)).toHaveText(CREATE_ORGANIZATION)
  await expect(page.locator("#name")).toHaveValue("")
  await expect(page.locator("#org-identity-0")).toHaveValue("")
})

test("CONFIGURED + a different identity value: the shared name alone does not warn", async ({
  page,
}) => {
  const label = identityLabel as string
  await setIdentityFields([label])

  await openCreateDialog(page)

  /**
   * THE POSITIVE ANCHOR THAT MAKES THIS TEST'S ABSENCE MEANINGFUL. The input must be THERE and the
   * draft must really carry an identity value; otherwise "no advisory" would be satisfied by the
   * pre-fix product, which produces no advisory for every input there has ever been.
   */
  const identityInput = page.locator("#org-identity-0")
  await expect(
    identityInput,
    "#org-identity-0 never rendered, so this test cannot distinguish a different identity value " +
      "from no identity value at all (D-39-01)"
  ).toBeVisible()

  await page.locator("#name").fill(SEED_NAME)
  await page.locator("#website").fill(TYPED_WEBSITE)
  await page.locator("#industry").fill(TYPED_INDUSTRY)
  await identityInput.fill(TYPED_IDENTITY_DIFFERENT)

  await expect(identityInput).toHaveValue(TYPED_IDENTITY_DIFFERENT)
  await expect(submitButton(page)).toHaveText(CREATE_ORGANIZATION)

  await activateSubmit(page)

  /**
   * THE SUBMIT WAS PROCESSED AND THE RECORD EXISTS, WHICH IS WHAT "NO ADVISORY" MEANS HERE.
   *
   * Under W-2 an advisory keeps the dialog OPEN and creates NOTHING, so a closed dialog plus a
   * committed row is not a proxy for the absence of a warning — it is equivalent to it, and unlike
   * a bare `toHaveCount(0)` it cannot be satisfied by a blank page, an error page, a redirect or a
   * dialog that never opened.
   */
  await expect(
    page.locator("#name"),
    "the dialog stayed open — a different identity value was treated as a certain match"
  ).toBeHidden()
  await expect(page.getByText("Organization created!")).toBeVisible()

  const rows = await fixtureRows()
  expect(rows.length, "the record was not created").toBe(2)

  const created = rows.find((row) => row.id !== seedId)
  const createdValue = (created?.customFields as Record<string, unknown> | null)?.[label]
  const seedValue = (rows.find((row) => row.id === seedId)?.customFields as Record<
    string,
    unknown
  > | null)?.[label]

  /**
   * THE DISCRIMINATION, STATED AS DATA. Two organizations now share this name — so the shared name
   * is demonstrably present and demonstrably not sufficient — and their identity values differ.
   * Case 1 differs from this case in exactly one respect, the identity value, which is what makes
   * "the identity value decides, not the name" an observation rather than a claim.
   */
  expect(createdValue, "the draft's identity value did not reach the database").toBe(
    TYPED_IDENTITY_DIFFERENT
  )
  expect(seedValue).toBe(SEED_IDENTITY)
  expect(String(createdValue).toLowerCase()).not.toBe(String(seedValue).toLowerCase())
})

test("UNCONFIGURED: no identity input, no advisory, and the setting is what decides", async ({
  page,
}) => {
  const label = identityLabel as string
  await setIdentityFields(null)

  await openCreateDialog(page)

  /**
   * THE LOCKED GRACEFUL DEGRADATION (39-CONTEXT § Post-Research Decisions, built fail-closed by
   * plan 39-08) — ASSERTED, NOT ASSUMED. Absence of configuration is not an error state, so every
   * native field must still be there and the dialog must behave exactly as it did before this
   * feature existed.
   */
  await expect(page.locator("#name")).toBeVisible()
  await expect(page.locator("#website")).toBeVisible()
  await expect(page.locator("#industry")).toBeVisible()
  await expect(page.locator("#notes")).toBeVisible()
  await expect(
    page.locator("#org-identity-0"),
    "an identity input rendered with nothing configured"
  ).toHaveCount(0)

  await page.locator("#name").fill(SEED_NAME)
  await page.locator("#website").fill(TYPED_WEBSITE)
  await page.locator("#industry").fill(TYPED_INDUSTRY)

  await expect(submitButton(page)).toHaveText(CREATE_ORGANIZATION)

  await activateSubmit(page)

  // Same equivalence as case 2: closed dialog plus committed row IS the absence of an advisory.
  await expect(
    page.locator("#name"),
    "the dialog stayed open with nothing configured — the unconfigured path is not silent"
  ).toBeHidden()
  await expect(page.getByText("Organization created!")).toBeVisible()

  const rows = await fixtureRows()
  expect(rows.length, "the record was not created with the setting unconfigured").toBe(2)

  const created = rows.find((row) => row.id !== seedId)
  /**
   * THE PAYLOAD CARRIED NO IDENTITY BLOB. This is the observable form of 39-18's conditional
   * spread: with nothing configured the create payload is byte-identical to the one this dialog
   * sent before the inputs existed, so the label cannot appear as a key on the stored record.
   */
  expect(
    (created?.customFields as Record<string, unknown> | null)?.[label],
    "an identity value was stored with nothing configured"
  ).toBeUndefined()

  /**
   * THE POSITIVE CONTROL, AND THE REASON THIS TEST IS NOT VACUOUS.
   *
   * Everything above is also true of a build in which the identity input never renders at all —
   * which is exactly the pre-39-18 product, and exactly how gap D-39-01 reached UAT with a green
   * source gate behind it. So the absence is now shown to be CAUSED BY THE SETTING: switch the
   * setting on, reload, and the input must appear on the same page, in the same session, with
   * nothing else changed.
   */
  await setIdentityFields([label])
  await page.reload()
  await openCreateDialog(page, false)
  await expect(
    page.locator("#org-identity-0"),
    "the identity input did not appear once the setting was configured, so the absence measured " +
      "above proves nothing about the setting"
  ).toBeVisible()
})
